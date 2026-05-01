/**
 * Phase 3 Step 1d — Drift detection.
 *
 * Two distinct thresholds, both tunable:
 *
 *   Soft warning: when active time falls below 60% of wall-clock,
 *   the banner surfaces a "X min active of Y min elapsed" line so
 *   the user sees their session honestly.
 *
 *   Hard prompt: after 15+ minutes of continuous pause, a modal
 *   surfaces "Still practicing?" with [Resume] [End session]. This
 *   protects data quality — a session that's mostly paused should
 *   not count as a full practice session in history.
 *
 * Pure helpers; no React. The banner consumes shouldShowDrift +
 * formatDriftText; the modal consumes shouldShowHardPrompt and
 * schedules its own timeout against state.pausedAt + the threshold.
 */
import type { SessionState, SessionTimes } from './types';

/** Active/wall ratio under which the soft warning fires. */
export const DRIFT_SOFT_RATIO = 0.6;

/**
 * Don't show the soft warning until the session has been going long
 * enough that the ratio is meaningful — a 30-second pause at 0:45
 * shouldn't count as drift.
 */
export const DRIFT_MIN_WALL_MS = 2 * 60 * 1000;

/** Continuous pause duration after which the hard prompt fires. */
export const DRIFT_HARD_PAUSE_MS = 15 * 60 * 1000;

export function shouldShowDrift(times: SessionTimes): boolean {
  if (times.wallMs < DRIFT_MIN_WALL_MS) return false;
  if (times.wallMs <= 0) return false;
  return times.activeMs / times.wallMs < DRIFT_SOFT_RATIO;
}

export function formatDriftText(times: SessionTimes): string {
  const activeMin = Math.floor(times.activeMs / 60_000);
  const wallMin = Math.floor(times.wallMs / 60_000);
  return `${activeMin} min active of ${wallMin} min elapsed`;
}

/**
 * True when the session has been continuously paused for at least
 * the hard threshold. Independent of any "user dismissed it" UX
 * suppression — that's the modal's local concern.
 */
export function shouldShowHardPrompt(state: SessionState, now: number): boolean {
  if (state.status !== 'paused' || state.pausedAt === null) return false;
  return now - state.pausedAt >= DRIFT_HARD_PAUSE_MS;
}
