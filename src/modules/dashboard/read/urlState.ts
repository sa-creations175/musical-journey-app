/**
 * The dashboard's view state, in the URL.
 *
 * Sort, filter, grouping and expansion all survive a refresh. Pure:
 * params in, state out, and back. Nothing here reads `location` — the
 * screen owns that, so this stays testable without a DOM.
 *
 * ─── Why expansion needs its own encoding ────────────────────────────
 *
 * Node ids are full label paths (`harmonic fluency/Interval
 * Identification/hf-int-3`). Twenty expanded nodes would be several
 * hundred characters of mostly-repeated text. So an expanded node is
 * addressed by its CHILD INDICES from its module root — `2.5.1` — with
 * the module's own id in front so a stale entry can never resolve
 * across modules.
 *
 * THE INDICES ARE INTO BUILT ORDER, NEVER SORTED ORDER. `buildModuleTree`
 * fills `node.children` in catalog order and `sortNodes` returns a new
 * array without touching it, so this holds today. If it ever stopped
 * holding, changing the sort control would silently move which rows are
 * open — a bug that looks like the tree collapsing at random and would
 * be miserable to trace. There is a test pinning it.
 *
 * ─── Where a stale entry goes ────────────────────────────────────────
 *
 * Expansion is the one piece of state here that is purely cosmetic: the
 * worst case of getting it wrong is a row being open that you did not
 * open, recoverable in one click. That is why index paths are an
 * acceptable trade at all — the repertoire section resolver could not
 * take the same trade, because there a mis-resolution attaches a number
 * to the wrong thing.
 *
 * Unresolvable entries are dropped by `pruneExpansion`, not guessed at.
 */
import type { FilterSpec, SortDirection, SortField, SortSpec } from './query';
import type { ModuleTree } from './query';

export interface DashboardViewState {
  sort: SortSpec;
  filter: FilterSpec;
  /** On: modules reorder, submodules sort within them. */
  grouping: boolean;
  /** Keys from `expansionKey`. */
  expanded: ReadonlySet<string>;
  /**
   * Module ids the player has COLLAPSED.
   *
   * Inverted from `expanded`, deliberately. The screen opens at
   * submodule level every time, so a module is open unless it is named
   * here - which keeps the default view's URL empty and means the set
   * records a choice rather than a default. Encoding the open ones
   * would put six ids in the query string before anything happened.
   */
  collapsedModules: ReadonlySet<string>;
}

/** Submodule level, worst first, grouped, nothing filtered. What the
 *  reset button returns to. */
export const DEFAULT_VIEW_STATE: DashboardViewState = {
  // `natural` is the catalog's own order, which for module rows is the
  // nav bar's. Not a sort — see SortField.
  sort: { field: 'natural', direction: 'worst-first' },
  filter: { match: 'all' },
  grouping: true,
  expanded: new Set<string>(),
  collapsedModules: new Set<string>(),
};

// =====================================================================
// Expansion keys
// =====================================================================

/** `{moduleId}~{i.j.k}`. An empty path is the module row itself, which
 *  is always rendered and never needs a key. */
export function expansionKey(moduleId: string, indexPath: ReadonlyArray<number>): string {
  return `${moduleId}~${indexPath.join('.')}`;
}

export function parseExpansionKey(
  key: string,
): { moduleId: string; indexPath: number[] } | null {
  const tilde = key.lastIndexOf('~');
  if (tilde <= 0) return null;
  const moduleId = key.slice(0, tilde);
  const raw = key.slice(tilde + 1);
  if (raw === '') return null;
  const indexPath: number[] = [];
  for (const part of raw.split('.')) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0) return null;
    indexPath.push(n);
  }
  return { moduleId, indexPath };
}

/**
 * Drop expansion entries that no longer address a real node.
 *
 * A catalog can grow or shrink between one visit and the next — that is
 * the whole point of "let it grow back organically" — so a stored path
 * may run off the end of a shorter child list, or name a module that no
 * longer exists. Both are dropped silently.
 */
export function pruneExpansion(
  expanded: ReadonlySet<string>,
  modules: ReadonlyArray<ModuleTree>,
): Set<string> {
  const byId = new Map(modules.map(m => [m.moduleId, m]));
  const out = new Set<string>();
  for (const key of expanded) {
    const parsed = parseExpansionKey(key);
    if (!parsed) continue;
    const module = byId.get(parsed.moduleId);
    if (!module) continue;
    let node = module.root;
    let ok = true;
    for (const index of parsed.indexPath) {
      const child = node.children[index];
      if (!child) { ok = false; break; }
      node = child;
    }
    // A leaf cannot be expanded, so an entry pointing at one is stale
    // in a way that would render a chevron on a row with no children.
    if (ok && node.children.length > 0) out.add(key);
  }
  return out;
}

/** Collapse or reopen a whole module. */
export function withModuleCollapsed(
  state: DashboardViewState,
  moduleId: string,
): DashboardViewState {
  const collapsedModules = new Set(state.collapsedModules);
  if (!collapsedModules.delete(moduleId)) collapsedModules.add(moduleId);
  return { ...state, collapsedModules };
}

/**
 * Collapse every module, or expand them all.
 *
 * Distinct from reset, which returns to submodule depth — the opposite
 * of what collapsing is for. Seeing the shape of things and returning to
 * the default are two different wants, and one button cannot be both.
 *
 * Collapsing also clears deeper expansion: a branch left open inside a
 * collapsed module is invisible state that reappears on expand, having
 * moved without being touched.
 */
export function withAllModulesCollapsed(
  state: DashboardViewState,
  moduleIds: ReadonlyArray<string>,
  collapsed: boolean,
): DashboardViewState {
  return {
    ...state,
    collapsedModules: collapsed ? new Set(moduleIds) : new Set<string>(),
    expanded: collapsed ? new Set<string>() : state.expanded,
  };
}

export function withExpansionToggled(
  state: DashboardViewState,
  key: string,
): DashboardViewState {
  const expanded = new Set(state.expanded);
  if (!expanded.delete(key)) expanded.add(key);
  return { ...state, expanded };
}

// =====================================================================
// Encoding
// =====================================================================

const SORT_FIELD_CODE: Readonly<Record<SortField, string>> = {
  natural: 'n', accuracy: 'a', coverage: 'c', recency: 'r',
};
const SORT_FIELD_BY_CODE: Readonly<Record<string, SortField>> = {
  n: 'natural', a: 'accuracy', c: 'coverage', r: 'recency',
};
const SORT_DIRECTION_CODE: Readonly<Record<SortDirection, string>> = {
  'worst-first': 'w', 'best-first': 'b',
};
const SORT_DIRECTION_BY_CODE: Readonly<Record<string, SortDirection>> = {
  w: 'worst-first', b: 'best-first',
};

/**
 * State to params.
 *
 * Anything at its default is OMITTED, so the default view has a clean
 * URL and the reset button produces one. Keys are emitted in a fixed
 * order and expansion entries sorted, so the same view always yields
 * the same string — otherwise the URL would churn on every render and
 * fill the history with identical entries.
 */
export function encodeViewState(state: DashboardViewState): URLSearchParams {
  const params = new URLSearchParams();
  const d = DEFAULT_VIEW_STATE;

  if (state.sort.field !== d.sort.field || state.sort.direction !== d.sort.direction) {
    params.set(
      'sort',
      `${SORT_FIELD_CODE[state.sort.field]}${SORT_DIRECTION_CODE[state.sort.direction]}`,
    );
  }
  if (state.grouping !== d.grouping) params.set('flat', '1');

  const f = state.filter;
  if (f.accuracyBelow !== undefined) params.set('acc', String(f.accuracyBelow));
  if (f.coverageBelow !== undefined) params.set('cov', String(f.coverageBelow));
  if (f.notPractisedInDays !== undefined) params.set('stale', String(f.notPractisedInDays));
  if (f.hasDueItems) params.set('due', '1');
  if (f.modules && f.modules.length > 0) params.set('mod', [...f.modules].sort().join(','));
  if (f.match === 'any') params.set('any', '1');

  if (state.expanded.size > 0) {
    params.set('open', [...state.expanded].sort().join(','));
  }
  if (state.collapsedModules.size > 0) {
    params.set('closed', [...state.collapsedModules].sort().join(','));
  }
  return params;
}

/** A finite, non-negative number from a param, or undefined. Rejects
 *  junk rather than coercing it — `acc=banana` must not become 0 and
 *  filter everything out. */
function numberParam(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Params to state.
 *
 * Total: any malformed value falls back to its default rather than
 * throwing. A hand-edited or truncated URL should open the default
 * dashboard, never a blank screen.
 */
export function decodeViewState(params: URLSearchParams): DashboardViewState {
  const d = DEFAULT_VIEW_STATE;

  const sortRaw = params.get('sort') ?? '';
  const field = SORT_FIELD_BY_CODE[sortRaw[0] ?? ''] ?? d.sort.field;
  const direction = SORT_DIRECTION_BY_CODE[sortRaw[1] ?? ''] ?? d.sort.direction;

  const filter: FilterSpec = { match: params.get('any') === '1' ? 'any' : 'all' };
  const acc = numberParam(params, 'acc');
  if (acc !== undefined) filter.accuracyBelow = acc;
  const cov = numberParam(params, 'cov');
  if (cov !== undefined) filter.coverageBelow = cov;
  const stale = numberParam(params, 'stale');
  if (stale !== undefined) filter.notPractisedInDays = stale;
  if (params.get('due') === '1') filter.hasDueItems = true;
  const mod = params.get('mod');
  if (mod) {
    const modules = mod.split(',').map(s => s.trim()).filter(Boolean);
    if (modules.length > 0) filter.modules = modules;
  }

  const open = params.get('open');
  const expanded = new Set<string>();
  if (open) {
    for (const key of open.split(',')) {
      const trimmed = key.trim();
      if (trimmed && parseExpansionKey(trimmed)) expanded.add(trimmed);
    }
  }

  const closed = params.get('closed');
  const collapsedModules = new Set<string>();
  if (closed) {
    for (const id of closed.split(',')) {
      const trimmed = id.trim();
      if (trimmed) collapsedModules.add(trimmed);
    }
  }

  return {
    sort: { field, direction },
    filter,
    grouping: params.get('flat') !== '1',
    expanded,
    collapsedModules,
  };
}

/** True when the state is the default — for enabling the reset button
 *  only when it would do something. */
export function isDefaultViewState(state: DashboardViewState): boolean {
  return encodeViewState(state).toString() === '';
}

/** Active filters, for the mobile count badge. The match switch is not
 *  a filter: on its own it narrows nothing. */
export function activeFilterCount(filter: FilterSpec): number {
  let n = 0;
  if (filter.accuracyBelow !== undefined) n += 1;
  if (filter.coverageBelow !== undefined) n += 1;
  if (filter.notPractisedInDays !== undefined) n += 1;
  if (filter.hasDueItems) n += 1;
  if (filter.modules && filter.modules.length > 0) n += 1;
  return n;
}
