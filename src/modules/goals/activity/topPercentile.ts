/**
 * Phase 2 step 6b — pure helpers for activity chart presentation.
 *
 * Two responsibilities:
 *
 * 1. `pickTopPercentileIndices` — given a series of activity
 *    values, return the indices that fall in the top `pct`% of
 *    non-zero values. The chart uses the result to decide which
 *    bars get a numeric label on top (the "high-intensity marker"
 *    from the design spec).
 *
 *    Window-relative for now. Step 6c will add a personal-history
 *    threshold variant once getDailyActivity is wired in.
 *
 * 2. `isFutureDay` — boolean predicate for "is this date strictly
 *    after `today`?" Used to fade future bars/dots so the chart
 *    doesn't pretend the rest of the week happened.
 *
 *    Compares calendar days, not exact timestamps, so a 23:59
 *    "today" doesn't accidentally fade tomorrow's bar in the
 *    user's local timezone.
 */

/**
 * Indices whose values are in the top `pct`% of the non-zero
 * subset. Returns an empty Set when no non-zero values exist.
 *
 * Picks at least one index when any non-zero value exists, so a
 * sparse week with one stand-out session still gets its label.
 *
 * Ties broken by earlier index — the chart reads left-to-right
 * (older→newer) and labeling the earlier of two equal-value bars
 * keeps the visual order stable across re-renders.
 */
export function pickTopPercentileIndices(
  values: ReadonlyArray<number>,
  pct: number,
): Set<number> {
  if (pct <= 0) return new Set();

  const nonZero: { v: number; i: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] > 0) nonZero.push({ v: values[i], i });
  }
  if (nonZero.length === 0) return new Set();

  const k = Math.max(1, Math.ceil(nonZero.length * (pct / 100)));
  // Sort descending by value; ties broken by earlier index for
  // deterministic output across re-renders.
  nonZero.sort((a, b) => (b.v - a.v) || (a.i - b.i));
  return new Set(nonZero.slice(0, k).map(x => x.i));
}

/**
 * True when `date` is strictly after `today` on a calendar-day
 * basis (ignoring time-of-day). Used to fade future bars/dots so
 * the chart shows where we are in the period, not a phantom full
 * window.
 */
export function isFutureDay(date: Date, today: Date): boolean {
  const d = startOfDay(date).getTime();
  const t = startOfDay(today).getTime();
  return d > t;
}

/**
 * True when `month` (0–11) in `year` is strictly after the month
 * containing `today`. Used by the yearly chart to fade upcoming
 * months without pulling in a full date library.
 */
export function isFutureMonth(year: number, month: number, today: Date): boolean {
  const t = today.getFullYear() * 12 + today.getMonth();
  const m = year * 12 + month;
  return m > t;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
