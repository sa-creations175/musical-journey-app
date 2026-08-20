/**
 * Turning a tapped tree row into something a drill can act on.
 *
 * Resolution only. This file produces a descriptor; navigating and
 * starting the drill are the view's job, and no route is followed here.
 *
 * ─── This lands unevenly, and that is accepted ───────────────────────
 *
 * Two modules can already be told which items to serve. The rest can
 * only be opened. That is not a gap to paper over: a row that silently
 * opened the whole module while pretending to have filtered would be
 * worse than one that says it is taking you to the module. So an
 * unsupported target carries the REASON, and the row can say so.
 *
 * Cross-module mixed drilling - filter to "below 70%" across four
 * modules and drill exactly that set - is stage two. It needs a runner
 * keyed on {moduleRef, itemRef} pairs dispatching through an adapter
 * registry, and the post-answer surfaces differ enormously between
 * modules (Reading draws a mnemonic staff and an 88-key diagram,
 * intervals a 3-octave keyboard), which is real design work rather than
 * plumbing. Deferred because the list is useful without it: tapping a
 * row and drilling that module is a minute of friction, not a wall.
 */
import type { TreeNode } from './tree';

/** Why a row can only open its module rather than drill its items. */
export type UnfilteredReason =
  /** The module has no mechanism for being told which items to serve. */
  | 'no-filter-mechanism'
  /** The row is a whole module, so filtering it to itself is a no-op. */
  | 'whole-module'
  /** The row holds nothing to drill - an empty catalog, or a section
   *  whose song is gone. */
  | 'nothing-to-drill';

export interface FilteredDrillTarget {
  kind: 'filtered';
  moduleId: string;
  route: string;
  /** The catalog refs this row covers, in tree order. */
  itemRefs: string[];
  /**
   * The same items in the module's OWN key format, ready to hand to
   * its focus mechanism. Intervals key on `id|direction` where the
   * catalog refs on `id:direction`, so the translation happens here
   * rather than at four call sites.
   */
  focusKeys: string[];
}

export interface UnfilteredDrillTarget {
  kind: 'navigate';
  moduleId: string;
  route: string;
  reason: UnfilteredReason;
}

export type DrillTarget = FilteredDrillTarget | UnfilteredDrillTarget;

/** Route per catalog source id. A source with no route cannot be
 *  navigated to and resolves to `nothing-to-drill`. */
const ROUTES: Readonly<Record<string, string>> = {
  'intervals': '/ear-training/intervals',
  'chord-recognition': '/ear-training/chord-recognition',
  'chord-progressions': '/ear-training/chord-progressions',
  'scales-modes': '/ear-training/scales-modes',
  'harmonic-fluency': '/harmonic-fluency',
  'reading': '/reading',
  'production': '/production',
  'production-lessons': '/production',
  'shapes-and-patterns': '/shapes-and-patterns',
  'mental-viz': '/shapes-and-patterns',
  'repertoire': '/repertoire',
};

/**
 * Modules that can be told which items to serve, and how to phrase it.
 *
 * `intervals` - `IntervalsQuiz.buildCandidates` restricts its pool to
 *   caller-supplied `id|direction` keys when focus mode is on. The
 *   mechanism exists and is wired to a modal today rather than to a
 *   prop or a URL param.
 *
 * `reading` - `pickCard.optionsForItem(itemRef)` already builds a card
 *   from one ref. `ReadingDrill` needs a prop that bypasses
 *   `pickCard(skill)`; audited as nearly free.
 *
 * Everything else opens its module. Adding one here is a two-line
 * change once its drill grows the mechanism.
 */
const FOCUS_KEY_FORMAT: Readonly<Record<string, (itemRef: string) => string>> = {
  // `M3:asc` in the catalog, `M3|asc` in the quiz's focus set.
  'intervals': ref => ref.replace(/:([^:]*)$/, '|$1'),
  'reading': ref => ref,
};

function isFilterable(moduleId: string): boolean {
  return moduleId in FOCUS_KEY_FORMAT;
}

/**
 * Resolve a tapped row.
 *
 * `moduleId` is the catalog source id the node belongs to - the caller
 * knows it from the tree it walked, and the node does not carry it
 * because a node is reused across views.
 */
export function drillTargetFor(node: TreeNode, moduleId: string): DrillTarget {
  const route = ROUTES[moduleId];
  if (route === undefined || node.itemRefs.length === 0) {
    return {
      kind: 'navigate',
      moduleId,
      route: route ?? '/',
      reason: 'nothing-to-drill',
    };
  }
  if (node.depth === 0) {
    // Tapping a module row means "open the module", not "drill all 375
    // cards in one sitting".
    return { kind: 'navigate', moduleId, route, reason: 'whole-module' };
  }
  if (!isFilterable(moduleId)) {
    return { kind: 'navigate', moduleId, route, reason: 'no-filter-mechanism' };
  }
  const toKey = FOCUS_KEY_FORMAT[moduleId];
  return {
    kind: 'filtered',
    moduleId,
    route,
    itemRefs: [...node.itemRefs],
    focusKeys: node.itemRefs.map(toKey),
  };
}

/**
 * What a row should say about tapping it.
 *
 * Returned as data rather than a rendered string so the view owns the
 * wording, but the DISTINCTION is decided here: a row must never imply
 * it will filter a drill that cannot be filtered.
 */
export function drillTargetSummary(target: DrillTarget): {
  filtered: boolean;
  itemCount: number;
  reason?: UnfilteredReason;
} {
  return target.kind === 'filtered'
    ? { filtered: true, itemCount: target.itemRefs.length }
    : { filtered: false, itemCount: 0, reason: target.reason };
}

/** Source ids whose drills accept an item filter today. Exported so a
 *  caller can explain the unevenness rather than discovering it one row
 *  at a time. */
export function filterableModules(): string[] {
  return Object.keys(FOCUS_KEY_FORMAT);
}
