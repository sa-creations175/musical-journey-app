/**
 * Folding per-item stats up through each module's hierarchy.
 *
 * Six modules, six different shapes, one display. The shapes are the
 * real work here, not the numbers - which is why every catalog row
 * carries its own `path` and this file does nothing but group by it.
 * Adding a level to a module's tree is a change in `catalogs.ts`; this
 * file does not know or care how deep any module goes.
 *
 * ─── The three roll-ups ──────────────────────────────────────────────
 *
 * ACCURACY is the mean over graded LEAVES - one vote per item. A parent
 *   whose leaves all read a dash reads a dash, never 0%, which would
 *   claim you got everything wrong rather than that nothing has been
 *   graded.
 *
 *   One vote per item, not per attempt. A pooled mean over attempts
 *   would let one heavily drilled item speak for a whole category: 200
 *   attempts at 95% on one card and 5 at 20% on another reads as ~93%,
 *   hiding the item that needs work. "Where am I weak" wants the
 *   opposite.
 *
 *   One vote per item, not per child node. Weighting by graded leaves
 *   rather than averaging immediate children makes the result
 *   DEPTH-INVARIANT: a module's score is the mean of its graded leaves
 *   however many grouping levels sit in between. Averaging children
 *   would let the tree's shape change the number, so inserting a
 *   category level would silently move the figure above it.
 *
 * COVERAGE counts covered ITEMS over catalog ITEMS - never rows. Where
 *   a row aggregates several stored refs (Reading's conceptual
 *   knowledge) the denominator still counts them separately, because
 *   the catalog is the denominator and the catalog holds 78 of them.
 *
 * RECENCY carries two numbers, most recent and stalest, because either
 *   alone lies. Most-recent flatters: touch one item in a category and
 *   the whole category looks fresh. Stalest freezes: one neglected
 *   corner pins the number and nothing you do moves it. Both costs one
 *   extra number on the row.
 */
import type { ModuleCatalog } from './catalogs';
import type { AccuracyKind, ItemStats } from './itemStats';

/** Two numbers, because either alone misleads. Null when no descendant
 *  has ever been touched. */
export interface RecencyPair {
  /** Most recent engagement anywhere under this node. */
  mostRecentAt: number | null;
  /** Oldest last-engagement among descendants, counting a never-touched
   *  descendant as older than any timestamp - which is why
   *  `hasUntouched` exists rather than this going null. */
  stalestAt: number | null;
  /** True when some descendant has never been engaged at all. A stalest
   *  of "never" is not a number, and rendering it as one would be a
   *  lie; the row shows it as such. */
  hasUntouched: boolean;
}

export interface TreeNode {
  /** Stable id: the joined path, or the catalog row id at a leaf. */
  id: string;
  label: string;
  /** Depth 0 is a module row. */
  depth: number;
  children: TreeNode[];
  /** Present only on leaves - the catalog row this node is. */
  stats?: ItemStats;
  /**
   * The stored refs under this node, in tree order.
   *
   * A leaf carries its catalog row's refs, which is more than one where
   * a row merges (Reading's conceptual knowledge). A parent carries
   * every ref beneath it. Needed by two callers that must address the
   * real stored items rather than the row's display id: the due filter,
   * which matches against spacing rows, and drill targeting, which has
   * to tell a drill exactly which items to serve.
   */
  itemRefs: string[];
  accuracyKind: AccuracyKind;
  /** Mean of descendant leaf scores, or null when none is graded. */
  score: number | null;
  /** Leaves under this node whose score is non-null. Exposed so a row
   *  can say what the average is actually over. */
  gradedLeafCount: number;
  coveredItems: number;
  totalItems: number;
  recency: RecencyPair;
}

/** Build one module's tree from its catalog and the stats for it.
 *
 *  `stats` must be in catalog order and the same length - that is what
 *  every adapter returns. */
export function buildModuleTree(
  catalog: ModuleCatalog,
  stats: ReadonlyArray<ItemStats>,
): TreeNode {
  if (stats.length !== catalog.items.length) {
    throw new Error(
      `tree: ${catalog.sourceId} has ${catalog.items.length} rows but ${stats.length} stats`,
    );
  }
  const root: TreeNode = emptyNode(catalog.sourceId, catalog.label, 0, catalog.accuracyKind);
  const byId = new Map<string, TreeNode>([[root.id, root]]);

  catalog.items.forEach((item, i) => {
    // path[0] is the module label, which the root already is.
    let parent = root;
    let prefix = root.id;
    for (const segment of item.path.slice(1)) {
      prefix = `${prefix}/${segment}`;
      let node = byId.get(prefix);
      if (!node) {
        node = emptyNode(prefix, segment, parent.depth + 1, catalog.accuracyKind);
        byId.set(prefix, node);
        parent.children.push(node);
      }
      parent = node;
    }
    const leaf = emptyNode(
      `${prefix}/${item.id}`, item.label, parent.depth + 1, catalog.accuracyKind,
    );
    leaf.stats = stats[i];
    leaf.itemRefs = [...item.itemRefs];
    // A leaf's totals come from the catalog row, so a merged row
    // contributes both of its stored refs to the denominator.
    leaf.totalItems = item.itemRefs.length;
    leaf.coveredItems = stats[i].covered ? item.itemRefs.length : 0;
    leaf.score = stats[i].score;
    leaf.gradedLeafCount = stats[i].score === null ? 0 : 1;
    leaf.recency = {
      mostRecentAt: stats[i].lastAt,
      stalestAt: stats[i].lastAt,
      hasUntouched: stats[i].lastAt === null,
    };
    parent.children.push(leaf);
  });

  rollUp(root);
  return root;
}

function emptyNode(
  id: string, label: string, depth: number, accuracyKind: AccuracyKind,
): TreeNode {
  return {
    id,
    label,
    depth,
    children: [],
    accuracyKind,
    score: null,
    gradedLeafCount: 0,
    coveredItems: 0,
    totalItems: 0,
    itemRefs: [],
    recency: { mostRecentAt: null, stalestAt: null, hasUntouched: false },
  };
}

/** Depth-first, so a parent folds already-folded children. */
function rollUp(node: TreeNode): void {
  if (node.children.length === 0) return;
  for (const child of node.children) rollUp(child);

  let covered = 0;
  let total = 0;
  let scoreSum = 0;
  let graded = 0;
  let mostRecent: number | null = null;
  let stalest: number | null = null;
  let hasUntouched = false;
  const refs: string[] = [];

  for (const child of node.children) {
    covered += child.coveredItems;
    total += child.totalItems;
    refs.push(...child.itemRefs);
    if (child.score !== null) {
      // Weighted by graded leaves, which keeps the result
      // depth-invariant: a category holding one item must not outweigh
      // a category holding fifty.
      scoreSum += child.score * child.gradedLeafCount;
      graded += child.gradedLeafCount;
    }
    if (child.recency.mostRecentAt !== null
      && (mostRecent === null || child.recency.mostRecentAt > mostRecent)) {
      mostRecent = child.recency.mostRecentAt;
    }
    if (child.recency.stalestAt !== null
      && (stalest === null || child.recency.stalestAt < stalest)) {
      stalest = child.recency.stalestAt;
    }
    if (child.recency.hasUntouched) hasUntouched = true;
  }

  node.coveredItems = covered;
  node.totalItems = total;
  node.itemRefs = refs;
  node.gradedLeafCount = graded;
  node.score = graded === 0 ? null : scoreSum / graded;
  node.recency = { mostRecentAt: mostRecent, stalestAt: stalest, hasUntouched };
}

// =====================================================================
// Reading a node
// =====================================================================

/** Coverage as a 0-1 fraction, or null when the node holds no items. */
export function coverageFraction(node: TreeNode): number | null {
  return node.totalItems === 0 ? null : node.coveredItems / node.totalItems;
}

/**
 * Days since, for one side of the recency pair.
 *
 * Null in, null out - a never-touched node has no age, and rendering it
 * as 0 days would read as "practised today".
 */
export function daysSince(at: number | null, now: number): number | null {
  if (at === null) return null;
  return Math.floor((now - at) / 86_400_000);
}

/** Every node in the tree, depth-first, root included. */
export function flatten(node: TreeNode): TreeNode[] {
  const out: TreeNode[] = [node];
  for (const child of node.children) out.push(...flatten(child));
  return out;
}

/** Nodes at a given depth. Depth 1 is the submodule level the dashboard
 *  opens at. */
export function nodesAtDepth(root: TreeNode, depth: number): TreeNode[] {
  return flatten(root).filter(n => n.depth === depth);
}

/** The leaves under a node, in tree order. */
export function leavesOf(node: TreeNode): TreeNode[] {
  return flatten(node).filter(n => n.children.length === 0);
}
