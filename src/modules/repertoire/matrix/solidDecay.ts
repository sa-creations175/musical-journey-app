import type { SongKey, SongKeySolidDecayState } from '../../../lib/db';

/**
 * Solid-key decay model. The state machine for a key that's reached
 * Solid:
 *
 *   solid    — engaged within DECAY_FADING_DAYS
 *   fading   — past fading threshold, warning state (no CTA)
 *   lapsed   — past lapsed threshold, retest recommended
 *
 * Stickiness: lapsed keys stay lapsed regardless of subsequent
 * engagement timestamps. Only a passed retest clears the lapsed
 * state. Rationale per design: engagement alone shouldn't undo a
 * lapse — the user has to re-demonstrate that the key is still
 * solid by passing the whole-song retest. Engagement does reset
 * the clock for fading-vs-solid; only the lapsed → solid arrow
 * requires the retest.
 *
 * Hybrid live-derive + persisted snapshot architecture:
 *   - This module is the live-derive source of truth, called from
 *     the matrix UI on every render. Always uses Date.now() at the
 *     call site, never reads a stale snapshot.
 *   - The rollup helpers (cellRollup.ts) write the result to
 *     songKeys.solidDecayState on every save, so off-view consumers
 *     (Practice Sessions algorithm, future cross-song aggregations,
 *     meta-dashboard) get a reasonably-fresh snapshot without
 *     needing to call into UI code.
 *   - The persisted column will go stale between engagements (a key
 *     that drifts from solid → fading → lapsed during a 30-day
 *     unopened window won't have its column updated until the user
 *     comes back and engages). In-view code never reads the column;
 *     it always live-derives. Off-view code accepts that staleness
 *     as best-effort.
 */

export const DECAY_FADING_DAYS = 14;
export const DECAY_LAPSED_DAYS = 30;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The canonical live-derive function. Returns null when the key
 * isn't in keyState='solid' (decay sub-states only apply to solid
 * keys). For solid keys, applies the threshold + stickiness rules.
 */
export function computeSolidDecayState(
  songKey: SongKey,
  now: number,
): SongKeySolidDecayState | null {
  if (songKey.keyState !== 'solid') return null;

  // Lapsed is sticky — only a passed retest (handled by the test
  // rollup) clears it. The persisted column carries this stickiness
  // across page loads since live-derive can't know "was once lapsed"
  // from lastEngagedAt alone.
  if (songKey.solidDecayState === 'lapsed') return 'lapsed';

  // No prior engagement timestamp on a solid key shouldn't happen
  // (promotion to solid always stamps lastEngagedAt) but be
  // defensive — treat as just-promoted.
  if (songKey.lastEngagedAt == null) return 'solid';

  const daysSince = (now - songKey.lastEngagedAt) / MS_PER_DAY;
  if (daysSince >= DECAY_LAPSED_DAYS) return 'lapsed';
  if (daysSince >= DECAY_FADING_DAYS) return 'fading';
  return 'solid';
}

/** Whole-day count since last engagement. Null when never engaged.
 *  Used by the KeyStrip's decay badge to show "Fading 18d" etc. */
export function daysSinceEngaged(
  songKey: SongKey,
  now: number,
): number | null {
  if (songKey.lastEngagedAt == null) return null;
  return Math.floor((now - songKey.lastEngagedAt) / MS_PER_DAY);
}

/**
 * Compute the decay state to PERSIST to songKeys after a non-pass
 * engagement (cell save, or test save without Mark solid). Honors
 * lapsed stickiness — engagement alone never clears 'lapsed'. Used
 * by both rollup helpers so the same rule applies everywhere.
 *
 * Distinguished from `computeSolidDecayState` because the persisted
 * value is computed RELATIVE TO the just-updated lastEngagedAt
 * (which is `now`), so daysSince is effectively 0 — meaning the
 * only way to land on 'fading' or 'lapsed' is via stickiness.
 */
export function decayStateAfterEngagement(
  priorDecayState: SongKeySolidDecayState | null,
  newKeyState: SongKey['keyState'],
): SongKeySolidDecayState | null {
  if (newKeyState !== 'solid') return null;
  if (priorDecayState === 'lapsed') return 'lapsed';
  return 'solid';
}
