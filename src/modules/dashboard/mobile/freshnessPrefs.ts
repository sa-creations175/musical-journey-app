/**
 * The freshness step, stored rather than written into a file.
 *
 * The rungs are even multiples of ONE number, and this is that number.
 * It decides what "within 1 week" is worth on the dashboard's freshness
 * bar and nothing else — see `freshnessScale.ts` for why the scale has
 * one knob instead of four.
 *
 * A CONSTANT WOULD HAVE BEEN INVISIBLE, which is the whole problem with
 * a threshold nobody can see: the right value can only be found by
 * living with it, and that is impossible while it is a literal in a
 * module. The same admission `spacingPrefs.ts` and
 * `practiceWindowPrefs.ts` make about the numbers next to them.
 */
import { getPref, setPref } from '../../../lib/userPrefs';
import { FRESHNESS_STEP_DEFAULT_DAYS } from './freshnessScale';

export const PREF_FRESHNESS_STEP_DAYS = 'dashboardFreshnessStepDays';

/**
 * Clamp a stored value into something usable. It crosses a sync
 * boundary and can arrive from another device or an older build; a zero
 * or a negative would collapse every rung onto "over a month".
 */
function positive(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1
    ? Math.round(raw)
    : FRESHNESS_STEP_DEFAULT_DAYS;
}

export async function getFreshnessStepDays(): Promise<number> {
  return positive(await getPref<number>(
    PREF_FRESHNESS_STEP_DAYS, FRESHNESS_STEP_DEFAULT_DAYS,
  ));
}

export async function setFreshnessStepDays(value: number): Promise<void> {
  await setPref(PREF_FRESHNESS_STEP_DAYS, Math.max(1, Math.round(value)));
}
