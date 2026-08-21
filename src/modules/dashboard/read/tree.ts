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
   * The CATALOG this node's items come from, when they all come from
   * one - `intervals`, `chord-recognition`, `reading`.
   *
   * Distinct from the module a row is displayed under, and that gap is
   * the whole reason this exists. Ear training is four catalogs merged
   * into one module row, so a caller holding only the module id has
   * `ear-training` - which is not a drill, has no route, and is not
   * what any focus mechanism is keyed on. Tap-to-drill silently
   * resolved every ear-training row to "nothing to drill" for exactly
   * that reason.
   *
   * Undefined where descendants disagree, which is the merged module
   * row itself. That is the honest answer rather than a default: a row
   * spanning four catalogs cannot be filtered to one drill, and the
   * absence says so without anyone having to special-case depth 0.
   */
  sourceId?: string;
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
  /**
   * True when descendants disagree about what the score MEANS.
   *
   * Production is the live case: lessons are self-rated on a five-step
   * ladder and vocabulary is measured right/wrong. Both project onto
   * 0-100, so averaging them produces a number - but one that means
   * neither thing. A mixed node scores `null` and reads as a dash,
   * which is the honest answer to a question with two units.
   */
  mixedKinds: boolean;
  /**
   * When true, this node's coverage and score are its own and do NOT
   * feed the row above it. Its recency still does.
   *
   * Mental visualisation is the only case: it is a Shapes & Patterns
   * submodule and shows real numbers, but the April 27 decision keeps
   * it out of every S&P coverage number (RULE_LEGIBILITY 1.6). Set from
   * `ModuleCatalog.countsTowardModuleTotals`, so the exclusion is
   * declared by the catalog rather than being an accident of how the
   * merge happens to walk.
   */
  excludedFromParentTotals: boolean;
  /**
   * Draw a break after this row. Set from `CatalogItem.endsGroup`, and
   * rolled up: a parent closes a group when its LAST child does, so
   * marking the second key's last row closes the key, which closes the
   * pair.
   */
  endsGroup: boolean;
  /** Mean of descendant leaf scores, or null when none is graded, or
   *  when descendants disagree about what a score means. */
  score: number | null;
  /** Leaves under this node whose score is non-null. Exposed so a row
   *  can say what the average is actually over. */
  gradedLeafCount: number;
  coveredItems: number;
  totalItems: number;
  /**
   * Every engagement under this node, focus-protected and ungraded ones
   * included.
   *
   * The coverage cell needs it. A percentage alone cannot tell "worked
   * on, nothing consolidated yet" from "never opened" - both read 0% -
   * and that gap would make real practice look like neglect, which is
   * the failure this screen exists to correct. So a parent row reads
   * "0% · 24 attempts", not "0%".
   */
  engagementCount: number;
  recency: RecencyPair;
}

/**
 * One catalog's tree.
 *
 * A thin wrapper over `buildMergedTree`, so a single catalog and a
 * merged module cannot disagree about shape. The root takes its label
 * from `path[0]`, which is the MODULE's name - ear training's four
 * catalogs all carry "ear training" there, which is what lets them
 * merge into one row.
 */
export function buildModuleTree(
  catalog: ModuleCatalog,
  stats: ReadonlyArray<ItemStats>,
): TreeNode {
  const rootLabel = catalog.items[0]?.path[0] ?? catalog.label;
  return buildMergedTree(catalog.moduleId, rootLabel, [{ catalog, stats }]);
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
    mixedKinds: false,
    excludedFromParentTotals: false,
    endsGroup: false,
    score: null,
    gradedLeafCount: 0,
    coveredItems: 0,
    totalItems: 0,
    engagementCount: 0,
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
  let engagements = 0;
  let scoreSum = 0;
  let graded = 0;
  let mostRecent: number | null = null;
  let stalest: number | null = null;
  let hasUntouched = false;
  let mixed = false;
  const kinds = new Set<AccuracyKind>();
  const refs: string[] = [];
  // Unanimous-or-nothing, and counted over EVERY child including
  // excluded ones: mental visualisation is out of Shapes & Patterns'
  // totals but it is still a Shapes & Patterns row, and a parent that
  // forgot it would claim a single source it does not have.
  const sources = new Set<string | undefined>();

  for (const child of node.children) {
    // Two things roll up from an EXCLUDED child, and only two.
    //
    //   The ref list, so the due filter can still reach its items.
    //
    //   MOST-RECENT recency, because "counts toward consistency" means
    //   practising it should make the row above look touched.
    //
    // Everything else stops here. Stalest and hasUntouched are
    // excluded along with coverage: mental viz has 504 items and a
    // player has barely started it, so letting its untouched rows set
    // S&P's stalest would make a module they drill weekly read as
    // neglected on the strength of a submodule that is deliberately not
    // in its numbers.
    refs.push(...child.itemRefs);
    sources.add(child.sourceId);
    if (child.recency.mostRecentAt !== null
      && (mostRecent === null || child.recency.mostRecentAt > mostRecent)) {
      mostRecent = child.recency.mostRecentAt;
    }
    if (child.excludedFromParentTotals) continue;
    covered += child.coveredItems;
    total += child.totalItems;
    engagements += child.engagementCount;
    if (child.score !== null) {
      // Weighted by graded leaves, which keeps the result
      // depth-invariant: a category holding one item must not outweigh
      // a category holding fifty.
      scoreSum += child.score * child.gradedLeafCount;
      graded += child.gradedLeafCount;
    }
    if (child.recency.stalestAt !== null
      && (stalest === null || child.recency.stalestAt < stalest)) {
      stalest = child.recency.stalestAt;
    }
    if (child.recency.hasUntouched) hasUntouched = true;
    if (child.mixedKinds) mixed = true;
    kinds.add(child.accuracyKind);
  }
  if (kinds.size > 1) mixed = true;

  node.coveredItems = covered;
  node.totalItems = total;
  node.engagementCount = engagements;
  node.itemRefs = refs;
  node.sourceId = sources.size === 1 ? [...sources][0] : undefined;
  /**
   * A group break belongs to the row whose CHILDREN are the grouped
   * items, and goes no further.
   *
   * The key-signature case: the leaf `conceptual knowledge` of E♭ minor
   * carries the flag, so the E♭ minor row inherits it — that row is the
   * second of the pair, and the break under it separates the pairs.
   * Propagating further would mark "key signature recognition" too,
   * drawing a break between two sibling SKILLS on the strength of a
   * pairing that only exists two levels down.
   *
   * Bounded by "the last child is a leaf", which is the same statement
   * in tree terms.
   */
  const last = node.children[node.children.length - 1];
  node.endsGroup = last !== undefined
    && last.endsGroup
    && last.children.length === 0;
  node.gradedLeafCount = graded;
  node.mixedKinds = mixed;
  // A mixed node has no single unit, so it has no score to show.
  node.score = mixed || graded === 0 ? null : scoreSum / graded;
  if (!mixed && kinds.size === 1) node.accuracyKind = [...kinds][0];
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

/**
 * One module tree from several catalogs.
 *
 * Ear training is four catalogs and production is two; each is one row
 * on screen with the catalogs as branches. Items are merged and grouped
 * by their `path`, exactly as a single catalog's are - so the shape
 * comes from the paths and this function needs no knowledge of which
 * module it is building.
 *
 * Each leaf keeps ITS OWN catalog's `accuracyKind`, which is what lets
 * production hold a self-rated lessons branch beside a measured
 * vocabulary one without either pretending to be the other.
 */
export function buildMergedTree(
  moduleId: string,
  label: string,
  sources: ReadonlyArray<{ catalog: ModuleCatalog; stats: ReadonlyArray<ItemStats> }>,
): TreeNode {
  const root = emptyNode(moduleId, label, 0, sources[0]?.catalog.accuracyKind ?? 'measured');
  const byId = new Map<string, TreeNode>([[root.id, root]]);

  for (const { catalog, stats } of sources) {
    if (stats.length !== catalog.items.length) {
      throw new Error(
        `tree: ${catalog.sourceId} has ${catalog.items.length} rows but ${stats.length} stats`,
      );
    }
    catalog.items.forEach((item, i) => {
      let parent = root;
      let prefix = root.id;
      for (const segment of item.path.slice(1)) {
        prefix = `${prefix}/${segment}`;
        let node = byId.get(prefix);
        if (!node) {
          node = emptyNode(prefix, segment, parent.depth + 1, catalog.accuracyKind);
          // The first level a catalog creates is its branch. Marking it
          // here is what keeps the exclusion declared by the catalog
          // rather than inferred from a label somewhere downstream.
          if (catalog.countsTowardModuleTotals === false && parent === root) {
            node.excludedFromParentTotals = true;
          }
          byId.set(prefix, node);
          parent.children.push(node);
        }
        parent = node;
      }
      const leaf = emptyNode(
        `${prefix}/${item.id}`, item.label, parent.depth + 1, catalog.accuracyKind,
      );
      leaf.stats = stats[i];
      leaf.sourceId = catalog.sourceId;
      leaf.itemRefs = [...item.itemRefs];
      leaf.engagementCount = stats[i].engagementCount;
      leaf.endsGroup = item.endsGroup === true;
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
  }

  rollUp(root);
  return root;
}
