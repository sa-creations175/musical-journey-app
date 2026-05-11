/**
 * Song of the Month queue — parsing + advancement.
 *
 * Schema (no new tables; encoded in existing Goal fields):
 *
 *   Slot 1, specific song  → targetMetric='song_whole_at_level',
 *                            targetValue=null, targetUnit='comfortable',
 *                            relatedItems=[songId]
 *
 *                            (Identical to today's "new this month"
 *                            child goal shape — legacy goals appear
 *                            naturally as a slot-1 specific entry
 *                            under this reader. Algorithm continues
 *                            to surface songs via this metric.)
 *
 *   Slot 1, TBD            → targetMetric='song_of_month',
 *                            targetValue=1, targetUnit='tbd',
 *                            relatedItems=[]
 *
 *   Slot 2 or 3            → targetMetric='song_of_month',
 *                            targetValue=2 | 3,
 *                            targetUnit='song' | 'wtl' | 'tbd',
 *                            relatedItems=[songId | wtlId] (length 0
 *                                                          for TBD)
 *
 * `song_of_month` is a new sentinel metric the algorithm classifies
 * as `{kind:'unsupported'}` — pure UI/queue metadata, never drives
 * session generation. Only slot-1 specific (via the existing
 * `song_whole_at_level` routing) reaches the algorithm.
 *
 * The queue is bounded to MAX_SLOTS slots. The "spotlight" is
 * always slot 1; subsequent slots are commitments-in-waiting.
 */
import { db, type Goal, type WantToLearnEntry } from '../../lib/db';
import { promoteWantToLearnEntry } from '../goals/GoalCreationFlow';

export const MAX_SLOTS = 3;

/** Marker metric for non-spotlight-driving queue rows. */
export const SONG_OF_MONTH_METRIC = 'song_of_month';

/** Discriminator stored in targetUnit. */
export type SlotPayloadKind = 'song' | 'wtl' | 'tbd';

export interface QueueSlot {
  slotIndex: number; // 1..MAX_SLOTS
  kind: SlotPayloadKind;
  /** songId when kind='song' (slot 1 specific or slot 2/3 active-song pick);
   *  wtl entry id when kind='wtl' (slot 2/3 want-to-learn pick);
   *  null when kind='tbd'. */
  refId: string | null;
  /** Goal row backing this slot. The persistence layer rewrites
   *  this row when the queue advances. */
  goalId: string;
  /** Resolved display label — song title for 'song'/'wtl' kinds,
   *  'TBD' otherwise. Falls back to '(missing)' if the ref is
   *  dangling (the song or WTL entry was deleted out from under
   *  the queue). */
  displayTitle: string;
}

export interface SpotlightState {
  /** Umbrella goal id this queue belongs to. */
  umbrellaGoalId: string;
  /** Sorted by slotIndex asc. */
  slots: QueueSlot[];
  /** First slot, or null when the queue is empty (which shouldn't
   *  happen on a saved goal — defensive). */
  spotlight: QueueSlot | null;
}

/**
 * Load the active Repertoire monthly umbrella and parse its queue.
 *
 * "Active" = scope='monthly', isUmbrella=true, status='active',
 * targetDate in the future, relatedModules includes 'repertoire'.
 * When multiple match (rare), picks the most recent by startDate
 * and logs a console warning — the spec assumes one active monthly
 * at a time.
 *
 * Returns null when no active Repertoire umbrella exists, OR when
 * the umbrella has no queue children (only days target, etc.) —
 * callers treat null as "no spotlight to surface."
 */
export async function loadActiveSpotlight(
  now: number = Date.now(),
): Promise<SpotlightState | null> {
  const allGoals = await db.goals.toArray();
  const candidates = allGoals.filter(
    g =>
      g.scope === 'monthly' &&
      g.isUmbrella &&
      g.status === 'active' &&
      g.targetDate >= now &&
      g.relatedModules.includes('repertoire'),
  );
  if (candidates.length === 0) return null;
  if (candidates.length > 1) {
    console.warn(
      `[songOfMonth] multiple active Repertoire monthly umbrellas (${candidates.length}) — picking the most recent.`,
    );
  }
  // Pick the most recently-started.
  candidates.sort((a, b) => b.startDate - a.startDate);
  const umbrella = candidates[0];

  const children = allGoals.filter(g => g.parentGoalId === umbrella.id);
  const slots = await parseQueueSlots(children);

  if (slots.length === 0) return null;
  return {
    umbrellaGoalId: umbrella.id,
    slots,
    spotlight: slots[0],
  };
}

/**
 * Parse the umbrella's children into queue slots. Two metric
 * flavors get routed here:
 *
 *   song_whole_at_level  → slot 1 specific (legacy + new shape)
 *   song_of_month        → slot 1 TBD or slot 2/3 (any payload kind)
 *
 * Children with other metrics (e.g. repertoire_days_per_cadence)
 * are ignored. Slots are returned sorted by slotIndex; gaps
 * (e.g. slot 2 missing, slot 3 present) collapse to a dense
 * ascending list — defensive against partial deletions.
 */
async function parseQueueSlots(children: Goal[]): Promise<QueueSlot[]> {
  const raw: Array<{ slotIndex: number; goal: Goal }> = [];
  for (const g of children) {
    if (g.targetMetric === 'song_whole_at_level') {
      // Slot 1 specific (legacy). targetValue is unused here.
      raw.push({ slotIndex: 1, goal: g });
    } else if (g.targetMetric === SONG_OF_MONTH_METRIC) {
      const idx = typeof g.targetValue === 'number' ? g.targetValue : 1;
      raw.push({ slotIndex: Math.max(1, Math.min(MAX_SLOTS, idx)), goal: g });
    }
  }
  raw.sort((a, b) => a.slotIndex - b.slotIndex);

  // Resolve display titles in one batched read per source table.
  const songIds = new Set<string>();
  const wtlIds = new Set<string>();
  for (const { goal } of raw) {
    const kind = slotKindFromGoal(goal);
    const ref = goal.relatedItems[0] ?? null;
    if (!ref) continue;
    if (kind === 'song') songIds.add(ref);
    if (kind === 'wtl') wtlIds.add(ref);
  }
  const songById = new Map<string, string>();
  const wtlById = new Map<string, string>();
  await Promise.all([
    songIds.size > 0
      ? db.songs
          .where('id')
          .anyOf([...songIds])
          .toArray()
          .then(rows => rows.forEach(s => songById.set(s.id, s.title)))
      : Promise.resolve(),
    wtlIds.size > 0
      ? db.wantToLearn
          .where('id')
          .anyOf([...wtlIds])
          .toArray()
          .then(rows => rows.forEach(e => wtlById.set(e.id, e.title)))
      : Promise.resolve(),
  ]);

  // Densify slotIndex (1, 2, 3 in order — drop gaps).
  const out: QueueSlot[] = [];
  let nextIdx = 1;
  for (const { goal } of raw) {
    const kind = slotKindFromGoal(goal);
    const refId = goal.relatedItems[0] ?? null;
    let displayTitle: string;
    if (kind === 'tbd' || !refId) {
      displayTitle = 'TBD';
    } else if (kind === 'song') {
      displayTitle = songById.get(refId) ?? '(missing)';
    } else {
      displayTitle = wtlById.get(refId) ?? '(missing)';
    }
    out.push({
      slotIndex: nextIdx++,
      kind,
      refId: kind === 'tbd' ? null : refId,
      goalId: goal.id,
      displayTitle,
    });
    if (nextIdx > MAX_SLOTS) break;
  }
  return out;
}

/** Decode a slot's payload kind from the goal record. */
function slotKindFromGoal(goal: Goal): SlotPayloadKind {
  if (goal.targetMetric === 'song_whole_at_level') return 'song';
  // song_of_month metric — read targetUnit.
  if (goal.targetUnit === 'song') return 'song';
  if (goal.targetUnit === 'wtl') return 'wtl';
  return 'tbd';
}

// ---------------------------------------------------------------------
// Advancement
// ---------------------------------------------------------------------

/**
 * Advance the queue when the user confirms the congrats prompt.
 *
 *   · Slot 1 is deleted.
 *   · Slot 2 becomes the new slot 1. If it was 'wtl', the WTL entry
 *     is promoted to db.songs (via the shared promoteWantToLearnEntry
 *     helper) and the goal is rewritten to the slot-1 specific shape
 *     (`song_whole_at_level` + relatedItems=[newSongId]).
 *   · Slot 3 (if present) decrements to slot 2.
 *
 * All writes happen in a single Dexie transaction. Promotion of a
 * WTL entry has its own internal transaction; we sequence it
 * BEFORE the goal-table rewrites so the promoted songId is known
 * when the slot rewrite runs.
 */
export async function advanceSpotlightQueue(umbrellaGoalId: string): Promise<void> {
  const allGoals = await db.goals.toArray();
  const children = allGoals.filter(g => g.parentGoalId === umbrellaGoalId);
  const slots = await parseQueueSlots(children);
  if (slots.length === 0) return;

  // Promote a WTL entry to a song outside the goal-table transaction,
  // since promoteWantToLearnEntry owns its own. Capture the resulting
  // songId so the slot-2 → slot-1 rewrite can attach it.
  const newSlotOne = slots[1] ?? null;
  let promotedSongId: string | null = null;
  if (newSlotOne && newSlotOne.kind === 'wtl' && newSlotOne.refId) {
    const entry = await db.wantToLearn.get(newSlotOne.refId);
    if (entry) {
      promotedSongId = await promoteWantToLearnEntry(entry as WantToLearnEntry);
    } else {
      // Dangling ref — degrade gracefully to TBD; user can reseat.
      console.warn(
        `[songOfMonth] slot 2 wtl ref ${newSlotOne.refId} missing — degrading to TBD on advance.`,
      );
    }
  }

  await db.transaction('rw', db.goals, async () => {
    // 1) Remove the old slot 1.
    await db.goals.delete(slots[0].goalId);

    // 2) Rewrite remaining slots in their new positions.
    for (let i = 1; i < slots.length; i++) {
      const oldSlot = slots[i];
      const newIndex = i; // shift down by 1 (slot 2 → slot 1, slot 3 → slot 2)

      if (newIndex === 1) {
        // Becoming the new spotlight.
        if (oldSlot.kind === 'song' && oldSlot.refId) {
          await db.goals.update(oldSlot.goalId, {
            targetMetric: 'song_whole_at_level',
            targetValue: null,
            targetUnit: 'comfortable',
            relatedItems: [oldSlot.refId],
          });
        } else if (oldSlot.kind === 'wtl') {
          if (promotedSongId) {
            await db.goals.update(oldSlot.goalId, {
              targetMetric: 'song_whole_at_level',
              targetValue: null,
              targetUnit: 'comfortable',
              relatedItems: [promotedSongId],
            });
          } else {
            // Promotion failed (dangling ref) — settle as TBD.
            await db.goals.update(oldSlot.goalId, {
              targetMetric: SONG_OF_MONTH_METRIC,
              targetValue: 1,
              targetUnit: 'tbd',
              relatedItems: [],
            });
          }
        } else {
          // TBD spotlight.
          await db.goals.update(oldSlot.goalId, {
            targetMetric: SONG_OF_MONTH_METRIC,
            targetValue: 1,
            targetUnit: 'tbd',
            relatedItems: [],
          });
        }
      } else {
        // Shifted but still in the queue (slot 3 → slot 2). Keep
        // the song_of_month metric, decrement targetValue.
        await db.goals.update(oldSlot.goalId, {
          targetMetric: SONG_OF_MONTH_METRIC,
          targetValue: newIndex,
          targetUnit: oldSlot.kind,
          relatedItems:
            oldSlot.kind === 'tbd' || !oldSlot.refId
              ? []
              : [oldSlot.refId],
        });
      }
    }
  });
}
