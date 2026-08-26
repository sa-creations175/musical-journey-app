/**
 * The lit pool on a drill page — ONE value, held in the URL.
 *
 * =====================================================================
 * WHY THE NAV DID NOTHING TO A DRILL PAGE.
 *
 * The lit set was `useState`, seeded from the route param by an
 * initialiser. React Router reuses one component instance across a
 * param change, so the initialiser never ran again: pressing a
 * different category in the nav moved the URL and left the chip row,
 * the cards and everything computed from them showing the category the
 * reader had left. Three surfaces, one of them stale, no way to tell.
 *
 * So the pool is not state at all. It is read out of the URL, which is
 * the value the nav already writes — the chip row writes the same
 * place, and the page derives everything from it. There is nothing left
 * that can disagree.
 * =====================================================================
 *
 * TWO PARTS, AND THE PAGE'S OWN CATEGORY IS NOT ONE OF THEM.
 * `:category` is the page; `?also=` is what else is lit beside it. The
 * own category is therefore always in the pool, by construction rather
 * than by a rule that refuses to unlight the last chip — an empty pool
 * is not reachable and needs no guard.
 *
 * NAVIGATING TO A CATEGORY LIGHTS ONLY THAT ONE. A nav link carries no
 * `?also`, so arriving at a category means arriving at that category —
 * the same promise the route already makes.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** The query parameter holding everything lit BESIDES the page's own. */
export const ALSO_PARAM = 'also';

export interface LitPool {
  /** Every lit id, the page's own included. */
  lit: ReadonlySet<string>;
  /**
   * Light or unlight one id. The page's own category is a no-op — it
   * is what the page IS, and a chip that could put it out would leave
   * the reader on a page for a category they had just excluded.
   */
  toggle: (id: string) => void;
  /**
   * Light every id given. The page's own is already lit by
   * construction, so it is simply skipped rather than special-cased —
   * passing the whole row is the caller's simplest correct move.
   */
  lightAll: (ids: readonly string[]) => void;
}

/** Split the parameter, dropping blanks a stray comma would leave. */
export function parseAlso(raw: string | null): string[] {
  return (raw ?? '').split(',').map(s => s.trim()).filter(s => s !== '');
}

/**
 * What is lit, given the page's own id and what counts as a valid one.
 *
 * `isValid` is the module's own guard, so a hand-edited URL naming a
 * category that does not exist lights nothing rather than putting an
 * empty column in a grid.
 */
export function litFrom(
  own: string,
  raw: string | null,
  isValid: (id: string) => boolean,
): ReadonlySet<string> {
  const out = new Set<string>([own]);
  for (const id of parseAlso(raw)) {
    if (id !== own && isValid(id)) out.add(id);
  }
  return out;
}

export function useLitPool(own: string, isValid: (id: string) => boolean): LitPool {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(ALSO_PARAM);

  const lit = useMemo(() => litFrom(own, raw, isValid), [own, raw, isValid]);

  const toggle = useCallback((id: string) => {
    if (id === own || !isValid(id)) return;
    const current = parseAlso(raw).filter(x => x !== own && isValid(x));
    const next = current.includes(id)
      ? current.filter(x => x !== id)
      : [...current, id];
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (next.length === 0) params.delete(ALSO_PARAM);
      else params.set(ALSO_PARAM, next.join(','));
      return params;
      // REPLACE, not push. Lighting a chip is adjusting the page you
      // are on, so Back should return to where you came from rather
      // than walking backwards through every chip you pressed.
    }, { replace: true });
  }, [own, raw, isValid, setSearchParams]);

  const lightAll = useCallback((ids: readonly string[]) => {
    const next = ids.filter(id => id !== own && isValid(id));
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (next.length === 0) params.delete(ALSO_PARAM);
      else params.set(ALSO_PARAM, next.join(','));
      return params;
      // REPLACE, for the same reason `toggle` does: this is adjusting
      // the page you are on, not travelling to a new one.
    }, { replace: true });
  }, [own, isValid, setSearchParams]);

  return { lit, toggle, lightAll };
}
