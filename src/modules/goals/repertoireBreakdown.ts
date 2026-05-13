/**
 * Per-session Repertoire breakdown surfaced by the WeeklyPlan +
 * ConfirmedWeeklyPlanSummary. Encodes the same 3:1 ratio the
 * session allocator uses (SPOTLIGHT_RATIO in repertoireSplit.ts) so
 * the planning surfaces stay in sync with the actual session shape.
 *
 *   spotlight = round(REPERTOIRE_SESSION_DEFAULT_MINUTES × 3/4)
 *   maintenance = remainder
 *
 * At today's 60-min default the lines are 45 / 15; both rescale
 * automatically if the constant shifts.
 */
import { REPERTOIRE_SESSION_DEFAULT_MINUTES } from '../../lib/weeklyAttempts';

/** Spotlight share of a typical repertoire session — matches the
 *  3:1 split (SPOTLIGHT_RATIO = 3/4) used by repertoireSplit.ts. */
export const REPERTOIRE_SPOTLIGHT_SHARE = 3 / 4;

/** Returns the per-session breakdown as a short list of display
 *  strings. Maintenance line is included only when
 *  `hasMaintenanceSongs` is true (the gating is the caller's
 *  responsibility — typically `songCount ≥ 2`, since the
 *  user needs at least one song beyond the spotlight for a
 *  maintenance candidate to exist). */
export function buildRepertoireSessionBreakdownLines(
  hasMaintenanceSongs: boolean,
): string[] {
  const spotlightMin = Math.round(
    REPERTOIRE_SESSION_DEFAULT_MINUTES * REPERTOIRE_SPOTLIGHT_SHARE,
  );
  const maintenanceMin = REPERTOIRE_SESSION_DEFAULT_MINUTES - spotlightMin;
  const lines = [`Song of the Month — ~${spotlightMin} min/session`];
  if (hasMaintenanceSongs) {
    lines.push(`Maintenance — ~${maintenanceMin} min/session`);
  }
  return lines;
}
