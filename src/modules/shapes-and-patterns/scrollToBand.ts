/**
 * Put a section at the TOP of the screen, not merely somewhere on it.
 *
 * =====================================================================
 * `scrollIntoView({ block: 'start' })` WAS NOT ENOUGH, TWICE OVER.
 *
 * It aligns the element with the top of the SCROLLPORT, which is
 * underneath the sticky app header — so the band landed behind the
 * chrome. And on a long page it stops as soon as the element is
 * visible by its own reckoning, so Progress Details arrived at the
 * BOTTOM of the screen with the grid you had just left filling the
 * rest: the thing you clicked off screen above, the thing you are
 * reading a strip at the bottom.
 *
 * THE HEADER IS MEASURED, NOT DECLARED. Its height is genuinely
 * variable — safe-area inset, responsive padding, whether the page has
 * a tagline — which is why it carries `data-app-chrome="top"` and why
 * the lead sheet's overlays already measure it rather than assuming.
 * Same tag, same reason, no second number to keep in step.
 *
 * REACHING THE TOP ALSO NEEDS ROOM BELOW IT. A browser cannot scroll
 * past the end of the document, so a section near the bottom of a short
 * page stops part way however it is asked. `CellProgressDetails`
 * reserves that room while a cell is picked — see its own note.
 * =====================================================================
 */

/** Breathing room between the chrome and the band. */
const GAP_PX = 8;

export function scrollSectionToTop(el: HTMLElement | null): void {
  if (el === null || typeof window === 'undefined') return;
  const chrome = document.querySelector('[data-app-chrome="top"]');
  const chromeHeight = chrome === null
    ? 0
    : chrome.getBoundingClientRect().height;
  const top = el.getBoundingClientRect().top
    + window.scrollY
    - chromeHeight
    - GAP_PX;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}
