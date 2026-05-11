/**
 * Song-of-the-Month prompt evaluator.
 *
 * Two prompts can fire:
 *
 *   SONG_OF_MONTH_CONGRATS  — high tier. Enqueued when the spotlight
 *                             song reaches comfortable in its
 *                             original key. Dedupe per songId
 *                             across the prompt's lifetime — once a
 *                             prompt for a given songId exists with
 *                             a non-expired status, we don't enqueue
 *                             another (the user either engaged or
 *                             dismissed; the next congrats fires for
 *                             the next spotlight song).
 *
 *   SONG_OF_MONTH_TBD_NUDGE — medium tier. Enqueued when:
 *                                 spotlight song's original-key
 *                                 comfortable ratio ≥ 0.5
 *                               AND the next queue slot exists and is
 *                                 TBD.
 *                             Cadence: at most once per local
 *                             calendar day per umbrella. Even after
 *                             the user dismisses, a re-enqueue
 *                             happens the next day if conditions
 *                             still hold — keeps the user prompted
 *                             without spamming the same day.
 *
 * Fire-and-forget from session-end + Goals-mount. No throwing —
 * a stale schema or a bad goal record can't break the host.
 */
import { findByType } from '../../lib/prompts/queue';
import { enqueue } from '../../lib/prompts/queue';
import { PROMPT_TYPE } from '../../lib/prompts/types';
import {
  comfortableCellRatioInOriginalKey,
  isSongComfortableInOriginalKey,
} from './songComfortable';
import { loadActiveSpotlight } from './songOfMonth';

/** Threshold ratio for the TBD nudge — past ~50% comfortable. */
export const TBD_NUDGE_RATIO_THRESHOLD = 0.5;

/**
 * Evaluate the current Song-of-the-Month state and enqueue any
 * prompts whose conditions are met. Safe to call repeatedly —
 * dedupe + per-day cadence prevent re-fires.
 *
 * `now` is overridable for tests; production callers omit it.
 */
export async function evaluateSongOfMonthPrompts(
  now: number = Date.now(),
): Promise<void> {
  let state;
  try {
    state = await loadActiveSpotlight(now);
  } catch (err) {
    console.warn('[songOfMonthPrompts] loadActiveSpotlight failed', err);
    return;
  }
  if (!state || !state.spotlight) return;

  const spotlight = state.spotlight;
  const nextSlot = state.slots[1] ?? null;

  // ── Congrats ──────────────────────────────────────────────────
  if (spotlight.kind === 'song' && spotlight.refId) {
    try {
      if (await isSongComfortableInOriginalKey(spotlight.refId)) {
        if (!(await congratsAlreadyExistsForSong(spotlight.refId))) {
          await enqueue({
            promptType: PROMPT_TYPE.SONG_OF_MONTH_CONGRATS,
            tier: 'high',
            surface: 'banner',
            payload: {
              songId: spotlight.refId,
              songTitle: spotlight.displayTitle,
              umbrellaGoalId: state.umbrellaGoalId,
            },
            createdAt: now,
          });
        }
      }
    } catch (err) {
      console.warn('[songOfMonthPrompts] congrats eval failed', err);
    }
  }

  // ── TBD nudge ─────────────────────────────────────────────────
  // Only meaningful when the spotlight is a specific song (we need
  // a ratio to compare against the threshold) AND there's a next
  // slot in TBD state.
  if (
    spotlight.kind === 'song' &&
    spotlight.refId &&
    nextSlot &&
    nextSlot.kind === 'tbd'
  ) {
    try {
      const ratio = await comfortableCellRatioInOriginalKey(spotlight.refId);
      if (ratio >= TBD_NUDGE_RATIO_THRESHOLD) {
        if (!(await tbdNudgeAlreadyEnqueuedToday(state.umbrellaGoalId, now))) {
          await enqueue({
            promptType: PROMPT_TYPE.SONG_OF_MONTH_TBD_NUDGE,
            tier: 'medium',
            surface: 'banner',
            payload: {
              umbrellaGoalId: state.umbrellaGoalId,
              spotlightSongId: spotlight.refId,
              ratio,
            },
            createdAt: now,
          });
        }
      }
    } catch (err) {
      console.warn('[songOfMonthPrompts] tbd nudge eval failed', err);
    }
  }
}

/** True when a congrats prompt for this songId already exists in
 *  any non-expired status — covers queued / shown / dismissed /
 *  engaged. The next congrats fires only for the next spotlight
 *  song, not a repeat of this one. */
async function congratsAlreadyExistsForSong(songId: string): Promise<boolean> {
  const existing = await findByType(PROMPT_TYPE.SONG_OF_MONTH_CONGRATS);
  return existing.some(
    p => p.payload?.songId === songId && p.status !== 'expired',
  );
}

/** True when a TBD-nudge prompt for this umbrella already exists
 *  with a createdAt in the current local calendar day. Re-enqueues
 *  freely on the next day while the conditions still hold. */
async function tbdNudgeAlreadyEnqueuedToday(
  umbrellaGoalId: string,
  now: number,
): Promise<boolean> {
  const existing = await findByType(PROMPT_TYPE.SONG_OF_MONTH_TBD_NUDGE);
  const todayKey = localDayKey(now);
  return existing.some(p => {
    if (p.payload?.umbrellaGoalId !== umbrellaGoalId) return false;
    return localDayKey(p.createdAt) === todayKey;
  });
}

function localDayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
