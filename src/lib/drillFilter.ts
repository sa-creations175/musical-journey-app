/**
 * How a drill is told to narrow, defined once.
 *
 * =====================================================================
 * THE DUPLICATION THIS REPLACES WAS ALREADY AT FIVE.
 *
 * `Intervals`, `ChordRecognition`, `ScalesModes`, `Reading` and
 * `ChordProgressionsQuiz` each carried their own copy of
 *
 *     const raw = params.get('focus');
 *     if (!raw) return undefined;
 *     const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
 *     return keys.length > 0 ? keys : undefined;
 *
 * — identical apart from the variable name, and one of them (chord
 * progressions) never got written at all, so a dashboard tap could not
 * arm it. Five copies of a parse is how one of them comes to be
 * missing: nothing points at the gap.
 *
 * The filter strip would have been the sixth. So the shape lands first
 * and the strip is a caller of it.
 * =====================================================================
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * What a drill has been narrowed to.
 *
 * EMPTY MEANS THE WHOLE POOL, not "nothing selected". A drill handed an
 * empty filter serves everything, which is what makes `{ keys: [] }` a
 * safe default rather than a state that has to be special-cased at
 * every call site.
 */
export interface DrillFilter {
  /** The item keys the drill may serve. Empty = no narrowing. */
  keys: readonly string[];
  /**
   * Where the narrowing came from.
   *
   * Carried because the three sources mean different things to the
   * reader even when they produce the same keys. A `url` filter arrived
   * from a dashboard row tap and the drill should say so; a `panel`
   * filter is a choice the reader is holding; a `card` filter came from
   * a module-home card. Nothing branches on it today — it exists so
   * that when a surface needs to explain itself, the fact is already
   * there rather than being inferred from what else is on screen.
   */
  source: 'card' | 'url' | 'panel';
}

/** The whole pool. A shared constant so no caller writes its own. */
export const NO_FILTER: DrillFilter = { keys: [], source: 'panel' };

/**
 * Parse a comma-separated key list.
 *
 * Exported so a test can exercise the parse without a router, and so
 * the strip can reuse it when it builds a filter from taps.
 */
export function parseFilterKeys(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

/**
 * The filter a drill should open with, from `?focus=`.
 *
 * `moduleRef` is accepted but not read today. It is here because the
 * next two things that will want this — a remembered per-module
 * selection, and the strip writing its own state back — are both
 * per-module, and adding the parameter later would mean touching every
 * call site again. Named rather than silently omitted so the reason is
 * visible at the signature.
 */
export function useDrillFilter(moduleRef: string): DrillFilter {
  void moduleRef;
  const [params] = useSearchParams();
  const raw = params.get('focus');
  return useMemo(
    () => (raw ? { keys: parseFilterKeys(raw), source: 'url' as const } : NO_FILTER),
    [raw],
  );
}

/**
 * Whether a filter narrows anything.
 *
 * A helper rather than `keys.length > 0` at each call site, because the
 * question every drill actually asks is "am I narrowed", and spelling
 * it out invites the empty case being read as "narrowed to nothing".
 */
export function isNarrowed(filter: DrillFilter): boolean {
  return filter.keys.length > 0;
}

/**
 * The distinct items a filter selects.
 *
 * DEDUPED, and that is the point. `chord-progressions` counts
 * `focusKeys.length` against its pool minimum, so two keys naming one
 * progression read as a pool of two — the exact bug chord recognition
 * fixed by counting the resolved pool instead. Any surface that sizes a
 * filter should size it through here.
 */
export function filterSize(filter: DrillFilter): number {
  return new Set(filter.keys).size;
}
