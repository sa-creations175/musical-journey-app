import { db, type FlashcardState, type SpacingState } from '../../lib/db';
import { blankState } from '../../lib/flashcards/spacedRepetition';
import { scaleDegreeQualityCards } from './scaleDegreeQualityCards';

/**
 * Move a reader's scale-degree-math history onto the quality cards.
 *
 * =====================================================================
 * WHAT YOU DID IS STILL TRUE. WHAT YOU KNOW IS A DIFFERENT CLAIM.
 *
 * The 84 old cards are gone, replaced one for one by the
 * alteration-zero members of the 168. Deleting them without moving the
 * history would empty the category: `HarmonicFluencyTracker` filters
 * attempts by the ids currently in the catalog, so every answer ever
 * given would stop matching, `cardsSeen` would fall to zero and the
 * rolling window would empty. The rows would still be in IndexedDB and
 * still in every backup — nothing lost, and it would read on screen as
 * though the work had never happened.
 *
 * So the RECORD moves and the SCHEDULE does not:
 *
 *   MOVED   every attempt, with its timestamp untouched; lifetime
 *           totals; the star flag; the review flag and its note.
 *           Those are a record of what happened and an annotation
 *           about a card — both survive the card being reworded.
 *
 *   RESET   ease factor, interval, repetitions, next review date,
 *           currentIntervalDays and nextDueAt. An SM-2 interval earned
 *           on "2 up a 5th = 6" is a claim of fluency at a question
 *           that no longer exists; applying it to a card that also
 *           asks about quality would schedule a skill nobody has been
 *           tested on. That is the same defect as a progress bar
 *           taking its width and its colour from two sources.
 *
 * All 84 therefore come due at once, which is the intent: the quality
 * version is the thing to drill now.
 *
 * IDEMPOTENT BY DATA, NOT BY A FLAG. It looks for rows still keyed on
 * a legacy id and no-ops when there are none. A stored "already ran"
 * flag would be wrong on the second device: sync can deliver legacy
 * rows from a phone that has not opened the app since the change, and
 * a flag-guarded migration would refuse to touch them.
 * =====================================================================
 */

const MODULE_ID = 'harmonic-fluency';

/** "2nd", "3rd", "4th" — the ordinal spelling the old ids carried. */
function ordinalSuffix(n: number): string {
  return n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
}

/**
 * The old id for a quality card that has an old counterpart.
 *
 * DERIVED FROM THE NEW CARDS, not from a second hand-written table.
 * The one-for-one relationship is asserted in
 * `scaleDegreeQualityCards.test.ts`; this reads the same fields that
 * assertion reads, so a mapping and a claim about the mapping cannot
 * drift apart. A literal 84-line table would be a copy of a rule, and
 * the copy is the one that goes wrong.
 */
export function legacyIdFor(
  startDegree: number, intervalId: number, direction: string,
): string {
  return `sdm-${startDegree}-${direction}-${intervalId}${ordinalSuffix(intervalId)}`;
}

/** Old id → new id, for the 84 that have a counterpart. */
export const LEGACY_TO_QUALITY: ReadonlyMap<string, string> = new Map(
  scaleDegreeQualityCards()
    .filter(c => c.facts.alteration === 0)
    .map(c => [
      legacyIdFor(c.facts.startDegree, c.facts.intervalId, c.facts.direction),
      c.id,
    ]),
);

/** What one run moved, for the caller and for a test. */
export interface MigrationResult {
  attempts: number;
  states: number;
  spacing: number;
}

const NOTHING: MigrationResult = { attempts: 0, states: 0, spacing: 0 };

export async function migrateScaleDegreeMathIfNeeded(): Promise<MigrationResult> {
  const map = LEGACY_TO_QUALITY;

  // Indexed read, not a full scan: `attempts` is the table that grows
  // forever, and this runs on every app start.
  const moduleAttempts = await db.attempts
    .where('moduleId').equals(MODULE_ID).toArray();
  const legacyAttempts = moduleAttempts.filter(a => map.has(a.itemId));
  const legacyStates = await db.flashcardStates
    .where('cardId').anyOf([...map.keys()]).toArray();
  const moduleSpacing = await db.spacingState
    .where('moduleRef').equals(MODULE_ID).toArray();
  const legacySpacing = moduleSpacing.filter(s => map.has(s.itemRef));

  // An early exit, NOT the idempotency mechanism. Idempotency comes
  // from `moveState` deleting the legacy row: with it gone the three
  // queries above return nothing on a second run, so the loops no-op
  // whether or not this line is here. Reversing this line alone leaves
  // the suite green, and reversing the delete turns four tests red —
  // which is the honest way round. This exists so the common case does
  // not open a write transaction on every app start.
  if (
    legacyAttempts.length === 0
    && legacyStates.length === 0
    && legacySpacing.length === 0
  ) return NOTHING;

  await db.transaction(
    'rw',
    [db.attempts, db.flashcardStates, db.spacingState, db.syncQueue],
    async () => {
      for (const attempt of legacyAttempts) {
        // Only the id moves. The timestamp is when you answered, and
        // rewriting it would turn a migration into a falsified record.
        await db.attempts.update(attempt.id!, { itemId: map.get(attempt.itemId)! });
      }
      for (const state of legacyStates) {
        await moveState(state, map.get(state.cardId)!);
      }
      for (const row of legacySpacing) {
        await moveSpacing(row, map.get(row.itemRef)!, moduleSpacing);
      }
    },
  );

  return {
    attempts: legacyAttempts.length,
    states: legacyStates.length,
    spacing: legacySpacing.length,
  };
}

/**
 * Carry the record onto the new id, on a freshly-reset schedule.
 *
 * MERGES rather than overwrites, because the new card may already have
 * been answered — the 168 shipped alongside the 84 before this ran, so
 * a reader could have a genuine history on both. Totals add; the flags
 * are OR-ed, since a flag is a request and two requests are still one.
 */
async function moveState(legacy: FlashcardState, newId: string): Promise<void> {
  const existing = await db.flashcardStates.get(newId);
  const flagged = (existing?.flagged ?? false) || (legacy.flagged ?? false);
  // The existing note wins only because it is the more recent thought
  // about the card that survives; the legacy note fills in when there
  // is none, so no annotation is dropped.
  const note = existing?.flagNote ?? legacy.flagNote;
  await db.flashcardStates.put({
    ...blankState(newId),
    totalAttempts: (existing?.totalAttempts ?? 0) + legacy.totalAttempts,
    totalCorrect: (existing?.totalCorrect ?? 0) + legacy.totalCorrect,
    // When you last looked at it is a record, not a schedule.
    lastReviewed: Math.max(existing?.lastReviewed ?? 0, legacy.lastReviewed),
    isFlagged: (existing?.isFlagged ?? false) || (legacy.isFlagged ?? false),
    ...(flagged ? { flagged: true } : {}),
    ...(note !== undefined ? { flagNote: note } : {}),
  });
  await db.flashcardStates.delete(legacy.cardId);
}

/**
 * Repoint the spacing row, with its schedule cleared.
 *
 * `performanceHistory` and `lastEngagedAt` travel — they say what
 * happened. `currentIntervalDays` and `nextDueAt` say when to ask
 * again, which is the claim being withdrawn. Cleared, so the card
 * reads as due now.
 */
async function moveSpacing(
  legacy: SpacingState,
  newRef: string,
  moduleRows: readonly SpacingState[],
): Promise<void> {
  const clash = moduleRows.find(
    r => r.itemRef === newRef && r.hand === legacy.hand && r.style === legacy.style,
  );
  if (clash !== undefined) {
    // The uniqueness index is [moduleRef+itemRef+hand+style]; two rows
    // cannot share it. The new row is the one that stays, with its own
    // schedule cleared for the same reason the legacy one's is.
    await db.spacingState.update(clash.id, {
      currentIntervalDays: 0, nextDueAt: null,
    });
    await db.spacingState.delete(legacy.id);
    return;
  }
  await db.spacingState.update(legacy.id, {
    itemRef: newRef, currentIntervalDays: 0, nextDueAt: null,
  });
}
