/**
 * The four colour bands, and how each column formats its cell.
 *
 * Pure. Split out of the row component so the decisions that can be
 * wrong in a way that matters - which band a number falls in, what a
 * missing number renders as - are testable without a DOM.
 *
 * ─── Four bands, two meanings ────────────────────────────────────────
 *
 * Both columns use the same four colours so a red cell means the same
 * kind of thing wherever it appears. The NUMBERS behind them differ,
 * which is why each column carries its own legend rather than one
 * combined legend.
 *
 *   FLUENCY is self-rated and only ever produces four values, so each
 *   value is its own band: struggled / working on it / comfortable /
 *   in flow.
 *
 *   ACCURACY is measured and continuous. Below 50 is getting half of
 *   them wrong and reads as failing. 85 rather than 100 for green
 *   because demanding perfect accuracy makes the top band unreachable,
 *   and 85+ is the practical equivalent of "this holds up".
 *
 * Early practice will look like a wall of red. That is honest, and the
 * same principle as the screen opening nearly empty.
 */
import { FEEL_OPTIONS } from '../../lib/fluencyScale';
import type { AccuracyKind } from './read/itemStats';

export type Band = 'red' | 'amber' | 'yellow-green' | 'green';

/** Lower bound of each accuracy band, highest first. */
const ACCURACY_BANDS: ReadonlyArray<{ min: number; band: Band }> = [
  { min: 85, band: 'green' },
  { min: 70, band: 'yellow-green' },
  { min: 50, band: 'amber' },
  { min: 0, band: 'red' },
];

/** One band per fluency value, in scale order. */
const FLUENCY_BANDS: ReadonlyArray<{ value: number; band: Band }> = [
  { value: 25, band: 'red' },
  { value: 50, band: 'amber' },
  { value: 75, band: 'yellow-green' },
  { value: 100, band: 'green' },
];

/**
 * The band a score falls in, or `null` when there is no score.
 *
 * Null in, null out. An ungraded row has no band because it has no
 * signal - painting it red would say it failed, and painting it green
 * would say it holds up. It gets neither.
 *
 * A self-rated score is matched to the NEAREST scale value rather than
 * bucketed by threshold, because a rolled-up parent averages its
 * children and lands between the four. An average of 62.5 is between
 * "working on it" and "comfortable"; nearest-value puts it in one of
 * the two the player actually gave rather than inventing a fifth.
 */
export function bandFor(score: number | null, kind: AccuracyKind): Band | null {
  if (score === null) return null;
  if (kind === 'self-rated') {
    let best = FLUENCY_BANDS[0];
    for (const candidate of FLUENCY_BANDS) {
      if (Math.abs(candidate.value - score) < Math.abs(best.value - score)) {
        best = candidate;
      }
    }
    return best.band;
  }
  for (const { min, band } of ACCURACY_BANDS) {
    if (score >= min) return band;
  }
  return 'red';
}

/** Text and background classes per band. Kept together so a band can
 *  never get a text colour from one row and a tint from another. */
export const BAND_TEXT_CLASS: Readonly<Record<Band, string>> = {
  'red': 'text-rose-600 dark:text-rose-400',
  'amber': 'text-amber-600 dark:text-amber-400',
  'yellow-green': 'text-lime-600 dark:text-lime-400',
  'green': 'text-emerald-600 dark:text-emerald-400',
};

/** What the legend for a column says. Two legends, never one combined:
 *  the colours match and the meanings do not. */
export interface LegendEntry {
  band: Band;
  label: string;
}

export const ACCURACY_LEGEND: ReadonlyArray<LegendEntry> = [
  { band: 'red', label: 'below 50%' },
  { band: 'amber', label: '50–69%' },
  { band: 'yellow-green', label: '70–84%' },
  { band: 'green', label: '85%+' },
];

export const FLUENCY_LEGEND: ReadonlyArray<LegendEntry> = FLUENCY_BANDS.map(
  ({ value, band }) => ({
    band,
    // Read off the scale rather than retyped, so the legend cannot
    // drift from the labels on the rating buttons.
    label: FEEL_OPTIONS.find(o => o.value === value)?.label ?? String(value),
  }),
);

export function legendFor(kind: AccuracyKind): ReadonlyArray<LegendEntry> {
  return kind === 'self-rated' ? FLUENCY_LEGEND : ACCURACY_LEGEND;
}

/** Column header. The same position carries two different questions,
 *  and the header is what says which. */
export function scoreColumnLabel(kind: AccuracyKind): string {
  return kind === 'self-rated' ? 'fluency' : 'accuracy';
}

// =====================================================================
// Cell text
// =====================================================================

/** The dash. Not a zero: an ungraded row has no signal, it has not
 *  failed. */
export const NO_VALUE = '—';

export function formatScore(score: number | null): string {
  return score === null ? NO_VALUE : `${Math.round(score)}%`;
}

/**
 * Coverage.
 *
 * A parent row shows the percentage AND a raw attempt total, because
 * the percentage alone cannot tell "worked on, nothing consolidated
 * yet" from "never opened" - both read 0%, and that gap would make real
 * practice look like neglect.
 *
 * An item row shows the count only. "5 attempts" tells you more than
 * "covered", and 5 sits differently from 47.
 */
export function formatCoverage(input: {
  isLeaf: boolean;
  coveredItems: number;
  totalItems: number;
  engagementCount: number;
}): string {
  const attempts = input.engagementCount === 0
    ? 'no attempts'
    : `${input.engagementCount} attempt${input.engagementCount === 1 ? '' : 's'}`;
  if (input.isLeaf) return attempts;
  if (input.totalItems === 0) return attempts;
  const percent = Math.round((input.coveredItems / input.totalItems) * 100);
  return `${percent}% · ${attempts}`;
}

/**
 * Recency. `12d` on an item, `12d / 61d` on a parent - most recent,
 * then stalest.
 *
 * A never-touched descendant does not get a fabricated stalest.
 * "Never" is not a number of days, and rendering it as 0 would claim
 * you practised today.
 */
export function formatRecency(input: {
  isLeaf: boolean;
  mostRecentDays: number | null;
  stalestDays: number | null;
  hasUntouched: boolean;
}): string {
  const recent = input.mostRecentDays === null ? NO_VALUE : `${input.mostRecentDays}d`;
  if (input.isLeaf) return recent;
  const stalest = input.hasUntouched
    ? 'never'
    : input.stalestDays === null ? NO_VALUE : `${input.stalestDays}d`;
  if (input.mostRecentDays === null && input.hasUntouched) return 'never';
  return `${recent} / ${stalest}`;
}
