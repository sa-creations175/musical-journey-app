/**
 * Turning a tapped tree row into something a drill can act on.
 *
 * Resolution only. This file produces a descriptor; navigating and
 * starting the drill are the view's job, and no route is followed here.
 *
 * ─── This lands unevenly, and that is accepted ───────────────────────
 *
 * Some modules can be told which items to serve. The rest can
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
import { FLUENCY_POOL_MINIMUM, poolCountsTowardAccuracy } from '../../../lib/fluencyPool';
import { catalogRollupKey } from './canonicalItemId';
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
   *
   * Distinct. Several refs can fold to one key, and every drill sizes
   * its focus protection off this length.
   */
  focusKeys: string[];
  /**
   * Anything else the destination needs in its URL beyond the pool.
   *
   * Chord motion is one of three tabs behind a single route, so a
   * focused pool that lands on Key Detection is a drill that silently
   * ignores it. The param belongs here rather than at the navigate
   * call, for the same reason the key translation does: one place that
   * knows how a module is addressed.
   */
  params: Readonly<Record<string, string>>;
}

export interface UnfilteredDrillTarget {
  kind: 'navigate';
  moduleId: string;
  route: string;
  reason: UnfilteredReason;
}

export type DrillTarget = FilteredDrillTarget | UnfilteredDrillTarget;

/**
 * Route per id - CATALOG source ids, plus the module id of any merged
 * module whose own row needs one.
 *
 * `ear-training` is not a source and never will be; it is the module
 * row above four of them, and without an entry here it resolved to
 * `nothing-to-drill` with route `/`. Tapping the ear training module
 * row navigated to the dashboard you were already on.
 */
const ROUTES: Readonly<Record<string, string>> = {
  'ear-training': '/ear-training',
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
 * `chord-recognition` - the catalog is one row per chord X inversion
 *   because that is what attempts store, but the quiz's pool filter
 *   matches on the bare CHORD (`focusSet.has(c.id)`); which inversions
 *   get played is decided by the player's own position settings, not
 *   by the pool. So a tapped chord row means every inversion of it,
 *   which is exactly what `catalogRollupKey` already expresses.
 *
 * `scales-modes` - the leaf is `dorian-tab1` / `dorian-tab2` because
 *   the two tabs are different skills, but the pool both tabs draw
 *   from is keyed on the bare MODE. So the suffix comes off here and
 *   travels as a tab param instead - see `DRILL_PARAMS`.
 *
 * `chord-progressions` - PARTLY. See below; this is the module that
 *   made the map return null.
 *
 * Everything else opens its module. Adding one here is a two-line
 * change once its drill grows the mechanism.
 *
 * ─── Why a key can be null ───────────────────────────────────────────
 *
 * Filterability is a property of a ROW, not of a module. Chord
 * progressions is one catalog holding four sub-drills: 132 `motion:`
 * refs that Chord Motion's focus set matches exactly, 132
 * `motion-first:` refs, 12 `key-detection:` refs and 144 full
 * progression rows, none of which any focus mechanism reads.
 *
 * `motion-first:` is the one worth stating, because the translation is
 * trivial and doing it would still be wrong. Those are the same 132
 * motions, but an attempt only lands under `motion-first:` in the
 * MINIMAL scaffold. Filtering the pool and arriving in full scaffold
 * narrows the drill and never touches the row's item - a filtered
 * claim the drill does not deliver, which is the failure the honest
 * label exists to prevent. Sending `scaffold=minimal` alongside would
 * deliver it, and overrides a persisted user setting, so it is queued
 * rather than assumed.
 */
const FOCUS_KEY_FORMAT: Readonly<
  Record<string, (itemRef: string) => string | null>
> = {
  // `M3:asc` in the catalog, `M3|asc` in the quiz's focus set.
  'intervals': ref => ref.replace(/:([^:]*)$/, '|$1'),
  'reading': ref => ref,
  // `maj:1` in the catalog, `maj` in the quiz's focus set.
  'chord-recognition': ref => catalogRollupKey('chord-recognition', ref),
  // `motion:1-b2-asc` in both - `motionId()` builds the same string.
  // The one module that needs no translation, and the one where
  // assuming a translation was needed would have broken it.
  'chord-progressions': ref => (ref.startsWith('motion:') ? ref : null),
  // `dorian-tab1` in the catalog, `dorian` in the pool.
  'scales-modes': ref => ref.replace(/-tab[12]$/, ''),
};

/** Which of the two scales & modes tabs a catalog ref belongs to. */
const MODE_TAB: Readonly<Record<string, string>> = {
  '-tab1': 'scale',
  '-tab2': 'vamp',
};

/** Extra URL params per source, keyed off the row's refs. */
const DRILL_PARAMS: Readonly<
  Record<string, (itemRefs: ReadonlyArray<string>) => Record<string, string>>
> = {
  // Three tabs behind one route, and `useUrlTabSync` already reads it.
  'chord-progressions': () => ({ tab: 'chord-motion' }),
  /**
   * Scales & modes is two tabs over ONE pool, so the tab is part of
   * what a row means rather than where it lives. `dorian-tab1` is
   * hearing the scale and `dorian-tab2` is naming the mode over a
   * vamp - different skills, and the row a player tapped said which.
   *
   * Only when the row agrees with itself. A mode row covers both tabs,
   * and picking one for it would silently answer a question the row
   * did not ask; leaving it out lands on whichever tab was already
   * open, which is the honest default.
   */
  'scales-modes': (refs): Record<string, string> => {
    const tabs = new Set(
      refs.map(ref => MODE_TAB[ref.slice(-5)]).filter(Boolean),
    );
    return tabs.size === 1 ? { tab: [...tabs][0]! } : {};
  },
};

/**
 * Distinct keys, first occurrence wins.
 *
 * THIS IS FOCUS PROTECTION, not tidiness. Several catalog refs can
 * translate to one key - four inversions of a seventh chord are four
 * rows and one `maj7`. Every drill computes its under-4 warning from
 * `focusKeys.length` and its pool from `new Set(focusKeys)`, so
 * handing over the duplicates would report a pool of four while
 * drilling one chord, unprotected, with the accuracy number moving.
 * The pool the dashboard sends is a pool like any other.
 */
function distinct(keys: string[]): string[] {
  return [...new Set(keys)];
}

/**
 * The row's items in its drill's key format, or null when this row
 * cannot be filtered.
 *
 * ALL OR NOTHING. A row mixing refs its drill can select with refs it
 * cannot is not partly filterable - drilling it would serve some of
 * what the row promised and silently drop the rest, which reads as the
 * filter working. The "Chord Progressions" row is exactly that mix,
 * and it says "open module".
 */
function focusKeysFor(
  sourceId: string,
  itemRefs: ReadonlyArray<string>,
): string[] | null {
  const toKey = FOCUS_KEY_FORMAT[sourceId];
  if (toKey === undefined) return null;
  const keys: string[] = [];
  for (const ref of itemRefs) {
    const key = toKey(ref);
    if (key === null) return null;
    keys.push(key);
  }
  return distinct(keys);
}

/**
 * Which id this node resolves against.
 *
 * THE NODE'S OWN SOURCE WINS, and the module id is a fallback rather
 * than the answer. The two differ for every ear-training row - the
 * catalog is `intervals`, the module is `ear-training` - and a caller
 * walking a merged tree only has the module. Trusting it resolved
 * every ear-training row, intervals included, to a dead tap: the label
 * read "open module" and the route was `/`.
 *
 * The fallback is not a leftover. A node with no single source is the
 * merged module row itself, and that row wants its MODULE's route,
 * which is the one thing the caller does know.
 */
function resolutionIdFor(node: TreeNode, moduleId: string): string {
  return node.sourceId ?? moduleId;
}

/**
 * Resolve a tapped row.
 *
 * `moduleId` is the module the row is displayed under. It is used only
 * where the node spans several catalogs and so has no source of its
 * own - see `resolutionIdFor`.
 */
export function drillTargetFor(node: TreeNode, moduleId: string): DrillTarget {
  const id = resolutionIdFor(node, moduleId);
  const route = ROUTES[id];
  if (route === undefined || node.itemRefs.length === 0) {
    return {
      kind: 'navigate',
      moduleId: id,
      route: route ?? '/',
      reason: 'nothing-to-drill',
    };
  }
  if (node.depth === 0) {
    // Tapping a module row means "open the module", not "drill all 375
    // cards in one sitting".
    return { kind: 'navigate', moduleId: id, route, reason: 'whole-module' };
  }
  const focusKeys = focusKeysFor(id, node.itemRefs);
  if (focusKeys === null) {
    return { kind: 'navigate', moduleId: id, route, reason: 'no-filter-mechanism' };
  }
  return {
    kind: 'filtered',
    moduleId: id,
    route,
    itemRefs: [...node.itemRefs],
    focusKeys,
    params: DRILL_PARAMS[id]?.(node.itemRefs) ?? {},
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
  /** True when a drill of this row would count toward accuracy. */
  countsTowardAccuracy: boolean;
  reason?: UnfilteredReason;
} {
  return target.kind === 'filtered'
    ? {
      filtered: true,
      itemCount: target.focusKeys.length,
      countsTowardAccuracy: poolCountsTowardAccuracy(target.focusKeys.length),
    }
    : {
      filtered: false,
      itemCount: 0,
      // An unfiltered row hands over the whole module, which is never
      // a small pool. The question does not arise, and answering it
      // `false` would put a warning on rows that do not need one.
      countsTowardAccuracy: true,
      reason: target.reason,
    };
}

/**
 * What a row is offering to drill, counted the way the drill counts.
 *
 * ITEMS, NOT CATALOG ROWS. A chord row is four rows and one chord,
 * because inversions are a playback setting rather than something a
 * pool can select. Reading the row count here would put "drill 4 items"
 * above a drill choosing between one, which is the number that decides
 * whether the session counts - so the row would be contradicting the
 * warning it is about to show.
 */

// ── The pool is too small to count ───────────────────────────────────

/** A row worth offering instead, because drilling it would count. */
export interface LargerPoolOffer {
  label: string;
  poolSize: number;
  target: FilteredDrillTarget;
}

export interface SmallPoolPrompt {
  /** Distinct items the tapped row would drill. */
  poolSize: number;
  /** The nearest ancestor whose drill would count, or null when none
   *  does. Null is a real outcome, not a failure: the prompt still
   *  states the rule and still lets the drill happen. */
  offer: LargerPoolOffer | null;
}

/**
 * Whether tapping this row should say something first.
 *
 * Returns null when there is nothing to say - the row cannot filter, so
 * it drills the whole module, or its pool already counts.
 *
 * WHY THIS FIRES AT THE TAP rather than after. You tap a single weak
 * item precisely because it is weak, and that is the drill that will
 * not count - the exact opposite of the intent. Finding out afterwards
 * means the work is already done.
 *
 * `ancestors` runs root-first, as the tree was walked. The climb goes
 * OUTWARD FROM THE ROW and takes the first ancestor whose own pool
 * counts, rather than the nearest one regardless: offering a parent
 * that is also too small moves the problem one row up and earns a
 * second prompt saying the same thing. Depth 0 is excluded because a
 * module row is not a filtered drill - "open module" is a different
 * offer, and one the row already makes for itself.
 */
export function smallPoolPromptFor(
  node: TreeNode,
  ancestors: ReadonlyArray<TreeNode>,
  moduleId: string,
): SmallPoolPrompt | null {
  const target = drillTargetFor(node, moduleId);
  if (target.kind !== 'filtered') return null;
  if (poolCountsTowardAccuracy(target.focusKeys.length)) return null;

  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];
    if (ancestor.depth === 0) break;
    const up = drillTargetFor(ancestor, moduleId);
    if (up.kind !== 'filtered') continue;
    if (!poolCountsTowardAccuracy(up.focusKeys.length)) continue;
    return {
      poolSize: target.focusKeys.length,
      offer: { label: ancestor.label, poolSize: up.focusKeys.length, target: up },
    };
  }
  return { poolSize: target.focusKeys.length, offer: null };
}

/** The prompt's own sentences, decided here so the three surfaces that
 *  state this rule cannot drift apart. The rule itself is
 *  `FLUENCY_POOL_RULE`; these are the parts specific to a tap. */
export function smallPoolPromptText(prompt: SmallPoolPrompt): {
  size: string;
  offer: string | null;
  proceed: string;
} {
  const items = (n: number) => `${n} item${n === 1 ? '' : 's'}`;
  return {
    size: `This is ${items(prompt.poolSize)}.`,
    offer: prompt.offer
      ? `Drill ${prompt.offer.label} (${items(prompt.offer.poolSize)}) instead`
      : null,
    proceed: `Drill ${items(prompt.poolSize)} anyway`,
  };
}

export { FLUENCY_POOL_MINIMUM };

/**
 * Source ids whose drills accept an item filter for AT LEAST SOME of
 * their rows.
 *
 * Membership is not a promise about every row: chord progressions is
 * here on the strength of its 132 `motion:` refs while three quarters
 * of the catalog under the same id cannot be filtered at all. Exported
 * so a caller can explain the unevenness rather than discovering it one
 * row at a time.
 */
export function filterableModules(): string[] {
  return Object.keys(FOCUS_KEY_FORMAT);
}

/**
 * The URL a filtered drill lives at.
 *
 * Built here so a caller cannot assemble half of it. The pool and the
 * tab are both required for chord motion to arrive focused, and a
 * navigate call that remembered one and forgot the other would land on
 * the right screen ignoring the pool.
 */
export function drillHref(target: FilteredDrillTarget): string {
  const query = new URLSearchParams(target.params);
  query.set('focus', target.focusKeys.join(','));
  return `${target.route}?${query.toString()}`;
}
