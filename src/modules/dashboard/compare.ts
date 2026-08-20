/**
 * The comparison: weakest and strongest among one row's immediate
 * children.
 *
 * Pure, and separate from the screen so the interesting question - what
 * counts as weakest when half the children have no score - is testable
 * without a DOM.
 *
 * ─── Why it is on demand ─────────────────────────────────────────────
 *
 * With everything expanded, automatic highlighting would mark the
 * extremes of every branch at once: twenty tinted rows, which tells you
 * nothing. Pressing it on one row asks one question and answers it. That
 * is also why only ONE comparison is active at a time - a second tinted
 * pair would be a second question nobody asked.
 */
import type { TreeNode } from './read/tree';

export interface Comparison {
  /** The node whose children are being compared. */
  parentId: string;
  weakestId: string | null;
  strongestId: string | null;
}

export type CompareHighlight = 'weakest' | 'strongest';

/**
 * Compare a row's immediate children on their score.
 *
 * UNGRADED CHILDREN ARE NOT CANDIDATES. A dash is not the weakest
 * thing here - it is the absence of a measurement, and calling it the
 * weakest would point at the one row that has said nothing rather than
 * at the one going badly. Rows with no score are found through
 * coverage, which is the column that asks that question.
 *
 * Fewer than two graded children yields nothing at all. Highlighting a
 * single row as both the weakest and the strongest of itself is a
 * comparison with no content, and tinting one row green for being the
 * only one would flatter it.
 */
export function compareChildren(parent: TreeNode): Comparison | null {
  const graded = parent.children.filter(child => child.score !== null);
  if (graded.length < 2) return null;

  let weakest = graded[0];
  let strongest = graded[0];
  for (const child of graded) {
    // Strict comparisons, so a tie keeps the FIRST child in tree order
    // rather than the last. Otherwise the tint would jump between
    // equal rows for no visible reason.
    if (child.score! < weakest.score!) weakest = child;
    if (child.score! > strongest.score!) strongest = child;
  }
  // All equal: there is no weakest or strongest, only a flat set.
  if (weakest.id === strongest.id) return null;

  return { parentId: parent.id, weakestId: weakest.id, strongestId: strongest.id };
}

/** Which tint a row should carry under the active comparison, if any. */
export function highlightFor(
  comparison: Comparison | null,
  nodeId: string,
): CompareHighlight | undefined {
  if (!comparison) return undefined;
  if (comparison.weakestId === nodeId) return 'weakest';
  if (comparison.strongestId === nodeId) return 'strongest';
  return undefined;
}

/**
 * Toggle the comparison on a row.
 *
 * Pressing the active row's control clears it; pressing another row's
 * moves it. Pressing a row whose children cannot be compared clears
 * rather than leaving the previous pair tinted somewhere else on
 * screen, which would look like the press did nothing.
 */
export function toggleComparison(
  current: Comparison | null,
  parent: TreeNode,
): Comparison | null {
  if (current?.parentId === parent.id) return null;
  return compareChildren(parent);
}
