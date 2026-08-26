/**
 * Whether the viewport is phone-sized.
 *
 * =====================================================================
 * A LAYOUT QUESTION, ANSWERED IN JS, AND ONLY WHERE CSS CANNOT.
 *
 * Most responsive work belongs in Tailwind's breakpoints — a class that
 * changes at `sm:` costs nothing and needs no state. This exists for
 * the case CSS cannot cover: rendering a DIFFERENT COMPONENT, not the
 * same one restyled. The dashboard's table and its phone view do not
 * share markup, and shipping both with one hidden is shipping two
 * subscriptions to every Dexie query behind them.
 *
 * `BarGridView` has asked this question inline since the lyric strip
 * shipped, with its own copy of the query string and its own listener.
 * One place to ask it means one breakpoint to move.
 * =====================================================================
 *
 * SSR-SAFE AND jsdom-SAFE. `window` may not exist, and jsdom's
 * `matchMedia` is often absent entirely; both read as NOT mobile, which
 * is the desktop layout — the one that has always rendered in tests.
 */
import { useEffect, useState } from 'react';

/**
 * The one breakpoint. Matches `BarGridView`'s, which is where this
 * question was first asked.
 *
 * 768px is Tailwind's `md`, so a phone and a small tablet in portrait
 * get the phone layout and everything above keeps the table.
 */
export const MOBILE_QUERY = '(max-width: 768px)';

function matches(query: string): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches;
}

export function useIsMobile(query: string = MOBILE_QUERY): boolean {
  const [isMobile, setIsMobile] = useState(() => matches(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = () => setIsMobile(mql.matches);
    // Read once on mount as well: the first render may have happened
    // before the media list existed, and a rotate between then and now
    // would otherwise go unnoticed until the next change event.
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return isMobile;
}
