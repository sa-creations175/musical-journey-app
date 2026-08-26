/**
 * Arriving at a page's detail block rather than at its top.
 *
 * =====================================================================
 * ONE BLOCK, ON ONE PAGE, REACHED TWO WAYS.
 *
 * A category's progress detail used to be rendered in two places: on
 * the module home, below every card, and again on the category page.
 * Two renders of one thing is two things that can drift — and the
 * module-home copy landed a full page below the button that opened it,
 * so pressing Progress Detail on the third card of fifteen appeared to
 * do nothing at all.
 *
 * So there is one block and it lives on the category page. Open and
 * Progress Detail now go to the SAME page and differ only in where they
 * land: Open at the top, ready to drill; Progress Detail at the chart.
 * That is the whole of what this parameter carries.
 * =====================================================================
 *
 * A URL PARAMETER, not router state. It survives a reload and a shared
 * link, and — more usefully — it is visible: a reader who wonders why
 * the page jumped can see the reason in the address bar.
 *
 * CLEARED ONCE ACTED ON, so a later re-render cannot scroll the reader
 * away from wherever they have got to. `replace`, so clearing it does
 * not put an extra entry in the back button.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** The parameter that says "land on the detail block". */
export const DETAIL_PARAM = 'detail';

/**
 * The address of a page's detail block.
 *
 * Takes a path a route helper already built — `categoryPath`,
 * `readingSkillPath` — rather than building one, so this file never
 * needs to know how any module addresses its own pages.
 */
export function detailHref(path: string): string {
  return `${path}?${DETAIL_PARAM}=1`;
}

export interface DetailLanding {
  /**
   * The key to bring into view, or null. Passed straight to
   * `CategoryDetailStack`, which owns the scrolling itself.
   */
  scrollTo: string | null;
  /** Called once the scroll has been asked for. */
  onScrolled: () => void;
}

/**
 * Read the landing request for this page, if there is one.
 *
 * `ownKey` is the page's own category — the only block a link can ask
 * for, because a page IS its category. Asking for another module's
 * would be a link to a block that is not on the screen.
 */
export function useDetailLanding(ownKey: string): DetailLanding {
  const [params, setParams] = useSearchParams();
  const asked = params.get(DETAIL_PARAM) !== null;

  /**
   * Held in state rather than read straight from the URL, because
   * clearing the parameter must not cancel the scroll it requested —
   * the request and its erasure would race, and the erasure is a
   * re-render away.
   */
  const [scrollTo, setScrollTo] = useState<string | null>(asked ? ownKey : null);

  useEffect(() => {
    if (!asked) return;
    setScrollTo(ownKey);
    // Cleared as soon as it is picked up. Left in place, a re-render on
    // any later state change would scroll the reader back down.
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete(DETAIL_PARAM);
      return next;
    }, { replace: true });
  }, [asked, ownKey, setParams]);

  const onScrolled = useCallback(() => setScrollTo(null), []);

  return { scrollTo, onScrolled };
}
