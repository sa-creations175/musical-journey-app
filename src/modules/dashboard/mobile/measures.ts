/**
 * The three things a bar can show, and the one rule they all obey.
 *
 * =====================================================================
 * LONGER IS ALWAYS BETTER. ALL THREE. NO EXCEPTIONS.
 *
 * This is the only reason a single bar can carry three different
 * measures without a legend per measure. Coverage full means everything
 * is covered; accuracy full means everything is right; freshness full
 * means you did it today. A reader who learns "short bars are the
 * problem" on one tab has learned it on all three.
 *
 * The measure that could have broken it is freshness, whose raw number
 * is DAYS SINCE — where bigger is worse. So it is inverted here, once,
 * rather than at the render site: a bar that shortened as things got
 * better would undo the rule for the one tab it appeared on, and the
 * reader would have no way to know which tab was the exception.
 * =====================================================================
 *
 * A FRACTION, NOT A WIDTH. These return 0–1 and the view decides what
 * to do with it. Sorting and drawing read the same number, so a list
 * cannot be ordered by one thing and drawn by another — the defect that
 * makes a sorted list look broken.
 *
 * COLOUR IS NOT HERE, and that is deliberate. Colour is always
 * accuracy, on every tab and on the Modules strip — it comes from
 * `tierForNode` and never from the selected measure. A measure that
 * supplied its own colour would make green mean three different things
 * depending on a control the reader may not have noticed.
 */
import type { TreeNode } from '../read/tree';
import { freshnessFraction, freshnessWords } from './freshnessScale';

export type Measure = 'coverage' | 'accuracy' | 'freshness';

export const MEASURES: ReadonlyArray<{ id: Measure; label: string }> = [
  { id: 'coverage', label: 'Coverage' },
  { id: 'accuracy', label: 'Accuracy' },
  { id: 'freshness', label: 'Freshness' },
];

export const DEFAULT_MEASURE: Measure = 'coverage';

export function isMeasure(value: string): value is Measure {
  return MEASURES.some(m => m.id === value);
}

/**
 * How full the bar is, 0–1.
 *
 * NULL IS NOT ZERO anywhere else in this codebase, but here it is: a
 * bar has to have a length. What keeps it honest is that the row's text
 * says which it is — "—" for no score, "never" for no practice — so an
 * empty bar is never the only thing the reader is given.
 */
export function measureFraction(
  node: TreeNode,
  measure: Measure,
  now: number,
  weekDays: number,
): number {
  switch (measure) {
    case 'coverage':
      return node.totalItems === 0
        ? 0
        : clamp(node.coveredItems / node.totalItems);
    case 'accuracy':
      return node.score === null ? 0 : clamp(node.score / 100);
    case 'freshness':
      return freshnessFraction(node.recency.mostRecentAt, now, weekDays);
  }
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * The rows, worst first.
 *
 * WORST FIRST ON EVERY MEASURE, which follows from the one rule above:
 * the shortest bar is the biggest problem whichever measure is
 * selected, so "sorted" always means "the thing to look at is at the
 * top". A tie breaks on label so the order is stable between renders
 * rather than depending on which module happened to be walked first.
 */
export function sortByMeasure<T extends { node: TreeNode; label: string }>(
  rows: readonly T[],
  measure: Measure,
  now: number,
  weekDays: number,
): T[] {
  return [...rows].sort((a, b) => {
    const fa = measureFraction(a.node, measure, now, weekDays);
    const fb = measureFraction(b.node, measure, now, weekDays);
    if (fa !== fb) return fa - fb;
    return a.label.localeCompare(b.label);
  });
}

/**
 * What the row says in words for the selected measure.
 *
 * ALWAYS BESIDE THE BAR. The bar is a shape and cannot be read
 * precisely; this is the number it is a picture of. Neither is
 * sufficient alone, which is why both are always there.
 */
export function measureText(
  node: TreeNode,
  measure: Measure,
  now: number,
  weekDays: number,
): string {
  switch (measure) {
    case 'coverage':
      return node.totalItems === 0
        ? '—'
        : `${Math.round((node.coveredItems / node.totalItems) * 100)}% of ${node.totalItems}`;
    case 'accuracy':
      return node.score === null ? '—' : `${Math.round(node.score)}%`;
    case 'freshness':
      return freshnessWords(node.recency.mostRecentAt, now, weekDays);
  }
}
