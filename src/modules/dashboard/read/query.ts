/**
 * Sorting and filtering the tree.
 *
 * Pure: trees and a spec in, trees out. Nothing here reads the URL, and
 * nothing here renders - the URL is where this state lives, but that is
 * the view's job.
 *
 * ─── Where a dash sorts ──────────────────────────────────────────────
 *
 * Every one of these numbers can be absent, and absent is not a value.
 * A row with no graded attempts has no accuracy; a row never touched has
 * no age. Sorting them as though they were 0 or Infinity would put them
 * wherever that number falls, which is a claim the data does not make.
 *
 * So NULLS SORT LAST, in both directions, on accuracy. "Worst accuracy
 * first" is a question about items you have data on; filling the top of
 * that list with ungraded rows would bury the ones that are actually
 * going badly, which is the exact thing this dashboard exists to
 * surface. Never-practised rows are found through coverage, which is
 * the column that asks that question.
 *
 * RECENCY IS THE EXCEPTION, and only for stalest-first. A never-touched
 * item genuinely is staler than anything with a date, so `hasUntouched`
 * sorts ahead of every timestamp there. That is not a fabricated number
 * - the sort knows it is unbounded and the row still renders "never".
 */
import { coverageFraction, type TreeNode } from './tree';

export type SortField = 'accuracy' | 'coverage' | 'recency';

/** `worst-first` is the default: the dashboard opens on what needs
 *  work, not on what is going well. */
export type SortDirection = 'worst-first' | 'best-first';

export interface SortSpec {
  field: SortField;
  direction: SortDirection;
}

export const DEFAULT_SORT: SortSpec = { field: 'accuracy', direction: 'worst-first' };

/**
 * The five filters, plus the switch.
 *
 * Deliberately flat. Grouped queries - "(low accuracy AND stale) OR
 * (module is reading AND uncovered)" - need a group-builder UI for a
 * query that will rarely if ever be wanted. The `any` switch gives a
 * wider list to eyeball instead. If the same nested query gets wanted
 * twice, revisit.
 *
 * An absent field is not a filter. `{}` matches everything under either
 * switch setting, which is what an empty filter bar should do.
 */
export interface FilterSpec {
  /** Percent, 0-100. Rows with no accuracy never match: a dash is not
   *  "below 70". */
  accuracyBelow?: number;
  /** Percent, 0-100, of the node's own catalog items. */
  coverageBelow?: number;
  /** Days. A never-touched row always matches - not practised in N days
   *  is true of something never practised at all. */
  notPractisedInDays?: number;
  /** Matches when any stored ref under the row is due. */
  hasDueItems?: boolean;
  /** Module source ids. Empty or absent means every module. */
  modules?: string[];
  match?: 'all' | 'any';
}

/** Everything a filter needs that the tree does not carry. */
export interface FilterContext {
  now: number;
  /**
   * Stored refs the spacing algorithm considers due.
   *
   * Supplied by the caller rather than read here, so this stays pure.
   * Modules that write no spacing state contribute nothing to it, which
   * is why the due filter simply returns nothing from them rather than
   * showing a dash on every row.
   */
  dueRefs?: ReadonlySet<string>;
  /** The module a node belongs to, for the `modules` filter. */
  moduleIdOf?: (node: TreeNode) => string;
}

const DAY_MS = 86_400_000;

// =====================================================================
// Filtering
// =====================================================================

type Predicate = (node: TreeNode) => boolean;

function predicatesFor(spec: FilterSpec, ctx: FilterContext): Predicate[] {
  const out: Predicate[] = [];

  if (spec.accuracyBelow !== undefined) {
    const threshold = spec.accuracyBelow;
    // A dash is not below a threshold. It is not above one either - it
    // is not on the scale.
    out.push(n => n.score !== null && n.score < threshold);
  }

  if (spec.coverageBelow !== undefined) {
    const threshold = spec.coverageBelow / 100;
    out.push(n => {
      const fraction = coverageFraction(n);
      return fraction !== null && fraction < threshold;
    });
  }

  if (spec.notPractisedInDays !== undefined) {
    const cutoff = ctx.now - spec.notPractisedInDays * DAY_MS;
    // Reads the MOST RECENT side. "Not practised in 30 days" asks
    // whether anything here was touched, not whether everything was.
    out.push(n => n.recency.mostRecentAt === null || n.recency.mostRecentAt < cutoff);
  }

  if (spec.hasDueItems) {
    const due = ctx.dueRefs;
    out.push(n => due !== undefined && n.itemRefs.some(ref => due.has(ref)));
  }

  if (spec.modules && spec.modules.length > 0) {
    const wanted = new Set(spec.modules);
    const moduleIdOf = ctx.moduleIdOf;
    out.push(n => moduleIdOf !== undefined && wanted.has(moduleIdOf(n)));
  }

  return out;
}

/** True when the node passes. No active filters passes everything. */
export function matchesFilter(
  node: TreeNode,
  spec: FilterSpec,
  ctx: FilterContext,
): boolean {
  const predicates = predicatesFor(spec, ctx);
  if (predicates.length === 0) return true;
  return spec.match === 'any'
    ? predicates.some(p => p(node))
    : predicates.every(p => p(node));
}

/**
 * Filter a list of rows.
 *
 * Rows only - filtering does NOT recurse into children. The list is
 * what gets filtered and the tree under a surviving row stays whole, so
 * expanding a matched row still shows everything it contains rather
 * than a pre-narrowed view that quietly disagrees with the row above
 * it.
 */
export function filterNodes(
  nodes: ReadonlyArray<TreeNode>,
  spec: FilterSpec,
  ctx: FilterContext,
): TreeNode[] {
  return nodes.filter(n => matchesFilter(n, spec, ctx));
}

// =====================================================================
// Sorting
// =====================================================================

/**
 * The value a node sorts on, and whether it is absent.
 *
 * `null` means no value exists. The comparator puts those last however
 * the direction is set, except for stalest-first recency where
 * `Infinity` is a real answer.
 */
function sortValue(node: TreeNode, spec: SortSpec, now: number): number | null {
  switch (spec.field) {
    case 'accuracy':
      return node.score;
    case 'coverage':
      return coverageFraction(node);
    case 'recency': {
      if (spec.direction === 'worst-first') {
        // Stalest first. A never-touched descendant is staler than any
        // date, so it goes to the front with an unbounded age.
        if (node.recency.hasUntouched) return Infinity;
        if (node.recency.stalestAt === null) return null;
        return now - node.recency.stalestAt;
      }
      // Most recent first: smallest age wins.
      if (node.recency.mostRecentAt === null) return null;
      return now - node.recency.mostRecentAt;
    }
  }
}

/**
 * Ascending age is "most recent first" but ascending accuracy is "worst
 * first" - the two fields run opposite ways, so the direction control
 * has to mean the same thing on both.
 */
function ascendingMeansWorst(field: SortField): boolean {
  // Low accuracy and low coverage are bad; a LARGE age is bad, and the
  // recency case already converts to age above.
  return field !== 'recency';
}

/** Stable: equal values keep their incoming order, which for a tree is
 *  catalog order. */
export function sortNodes(
  nodes: ReadonlyArray<TreeNode>,
  spec: SortSpec,
  now: number,
): TreeNode[] {
  const decorated = nodes.map((node, index) => ({
    node,
    index,
    value: sortValue(node, spec, now),
  }));
  const worstIsAscending = ascendingMeansWorst(spec.field);
  const wantAscending = spec.direction === 'worst-first'
    ? worstIsAscending
    : !worstIsAscending;

  decorated.sort((a, b) => {
    // Absent values sit at the bottom regardless of direction.
    if (a.value === null && b.value === null) return a.index - b.index;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    if (a.value !== b.value) {
      return wantAscending ? a.value - b.value : b.value - a.value;
    }
    return a.index - b.index;
  });
  return decorated.map(d => d.node);
}

// =====================================================================
// The two view shapes
// =====================================================================

/** One row of the flat, grouping-off view. */
export interface FlatRow {
  node: TreeNode;
  moduleId: string;
  moduleLabel: string;
}

export interface ModuleTree {
  moduleId: string;
  moduleLabel: string;
  root: TreeNode;
}

export interface ViewSpec {
  sort: SortSpec;
  filter: FilterSpec;
  /** On: modules reorder and submodules sort inside their module, so
   *  ear training's block moves as a block. Off: one flat list across
   *  every module. */
  grouping: boolean;
}

/**
 * Grouping on. Module rows reorder against each other, and each
 * module's submodules sort within it.
 *
 * The FILTER applies at the submodule level, not the module level. A
 * module row is a summary of what is under it, so hiding it because its
 * average misses a threshold would hide submodules that match - and the
 * list is meant to be scanned for exactly those.
 */
export function groupedView(
  modules: ReadonlyArray<ModuleTree>,
  spec: ViewSpec,
  ctx: FilterContext,
): Array<{ module: ModuleTree; submodules: TreeNode[] }> {
  const withRows = modules.map(module => ({
    module,
    submodules: sortNodes(
      filterNodes(module.root.children, spec.filter, ctx),
      spec.sort,
      ctx.now,
    ),
  }));
  const order = sortNodes(withRows.map(r => r.module.root), spec.sort, ctx.now);
  const rank = new Map(order.map((root, i) => [root.id, i]));
  return [...withRows].sort(
    (a, b) => (rank.get(a.module.root.id) ?? 0) - (rank.get(b.module.root.id) ?? 0),
  );
}

/** Grouping off. One list of submodules across every module, each
 *  carrying the module name that trails its row. */
export function flatView(
  modules: ReadonlyArray<ModuleTree>,
  spec: ViewSpec,
  ctx: FilterContext,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const owner = new Map<TreeNode, ModuleTree>();
  for (const module of modules) {
    for (const submodule of module.root.children) {
      owner.set(submodule, module);
      rows.push({
        node: submodule,
        moduleId: module.moduleId,
        moduleLabel: module.moduleLabel,
      });
    }
  }
  const ctxWithOwner: FilterContext = {
    ...ctx,
    moduleIdOf: ctx.moduleIdOf ?? (node => owner.get(node)?.moduleId ?? ''),
  };
  const byNode = new Map(rows.map(r => [r.node, r]));
  const kept = filterNodes(rows.map(r => r.node), spec.filter, ctxWithOwner);
  return sortNodes(kept, spec.sort, ctx.now).map(n => byNode.get(n)!);
}

/** A module id resolver for the grouped view, where each tree already
 *  knows its own module. */
export function moduleIdResolver(
  modules: ReadonlyArray<ModuleTree>,
): (node: TreeNode) => string {
  const owner = new Map<string, string>();
  for (const module of modules) {
    for (const node of allNodes(module.root)) owner.set(node.id, module.moduleId);
  }
  return node => owner.get(node.id) ?? '';
}

function allNodes(node: TreeNode): TreeNode[] {
  const out = [node];
  for (const child of node.children) out.push(...allNodes(child));
  return out;
}
