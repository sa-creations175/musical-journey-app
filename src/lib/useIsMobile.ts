import { useEffect, useState } from 'react';

// Tailwind's `sm:` breakpoint is 640px. Anything narrower is treated
// as a phone-class viewport — the cutoff used by mobile-specific
// affordances in the lead sheet editor (auto-line-break, tap-to-edit
// chord sheet, long-press row menu).
const MOBILE_QUERY = '(max-width: 639px)';

/**
 * Reactive mobile-viewport check. Returns true when the window is
 * narrower than Tailwind's `sm:` breakpoint (640px) and updates on
 * resize / orientation change.
 *
 * SSR-safe: in environments without `window` (e.g. tests that don't
 * polyfill matchMedia, server-side rendering) defaults to false.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(MOBILE_QUERY).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}
