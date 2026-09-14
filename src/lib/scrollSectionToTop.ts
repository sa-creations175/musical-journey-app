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
 * page stops part way however it is asked. That half of the answer is
 * `SCROLL_ROOM_CLASS` at the foot of this file, and a surface that asks
 * for this scroll without it will still land short.
 *
 * =====================================================================
 * IT LIVED UNDER `shapes-and-patterns/` AND IS NOT A SHAPES CONCEPT.
 *
 * Three pages called it and every other surface in the app kept using
 * the bare `scrollIntoView`, so the same press behaved one way on the
 * scales grid and another way on a module home. It is the app's scroll;
 * it lives with the app's other shared behaviour.
 * =====================================================================
 */

import { useCallback, useEffect, useState, type RefObject } from 'react';

/** Breathing room between the chrome and the band. */
const GAP_PX = 8;

/**
 * The element that actually scrolls the page under `el`.
 *
 * =====================================================================
 * IT IS NOT THE WINDOW IN THIS APP, AND THAT WAS THE WHOLE BUG.
 *
 * `index.css` sets `html, body { height: 100%; overflow-x: hidden }`.
 * An overflow on BOTH html and body stops body's being handed up to the
 * viewport, so body keeps it — and `overflow-x: hidden` makes body's
 * `overflow-y` compute to `auto`. Body, pinned at the viewport's height,
 * becomes the scroll container, and the window never scrolls at all.
 * `window.scrollTo` asked the one thing that cannot move, and a tapped
 * cell's Progress Details stayed where it was. Measured in a real
 * browser on 14 Sep 2026: under those two rules the window stays at 0
 * and body moves; without the body rule the window moves.
 *
 * The CSS stays: it is what keeps a phone from scrolling sideways. So
 * this finds the nearest ancestor that really scrolls, and falls back to
 * the document's own scroller where none does.
 * =====================================================================
 */
function scrollerFor(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node !== null; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll')
      && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

export function scrollSectionToTop(el: HTMLElement | null): void {
  if (el === null || typeof window === 'undefined') return;
  const chrome = document.querySelector('[data-app-chrome="top"]');
  const chromeHeight = chrome === null
    ? 0
    : chrome.getBoundingClientRect().height;
  const scroller = scrollerFor(el);
  if (scroller !== null) {
    // Measured against the scroller's own top, which is where its
    // scrolled content starts; the sticky header sits inside it.
    const top = el.getBoundingClientRect().top
      - scroller.getBoundingClientRect().top
      + scroller.scrollTop
      - chromeHeight
      - GAP_PX;
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    return;
  }
  const top = el.getBoundingClientRect().top
    + window.scrollY
    - chromeHeight
    - GAP_PX;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

/**
 * The room a scrolled-to section needs BELOW it, as a whole Tailwind
 * class.
 *
 * =====================================================================
 * THE OTHER HALF OF THE ANSWER, AND THE HALF THAT GETS FORGOTTEN.
 *
 * A browser cannot scroll past the end of the document. So a section
 * near the bottom of a short page stops part way however politely it is
 * asked — which is how Progress Details ended up at the BOTTOM of the
 * screen with the grid you had just left filling the rest.
 *
 * A container that is, or contains, a scroll target and sits at the end
 * of its page carries this, so the document is always tall enough for
 * the target to reach the top. Applied where there is something to
 * scroll to and not otherwise: a screen of blank under an empty state
 * is a hole.
 *
 * A WHOLE LITERAL, and pinned as one by a test. Tailwind scans source
 * text, so a height assembled from a number would be invisible to the
 * scanner, emit no rule, and reserve nothing — and the scroll would
 * quietly go back to landing short.
 * =====================================================================
 */
export const SCROLL_ROOM_CLASS = 'min-h-[85vh]';

/**
 * Ask for that scroll AFTER the change that made room for it has
 * rendered.
 *
 * =====================================================================
 * THE BUG THIS EXISTS FOR, AND IT LOOKED LIKE NOTHING HAPPENING.
 *
 * A grid's cell handler did two things in a row: pick the cell, then
 * scroll to Progress Details. Both in the same click, so at the moment
 * of the scroll React had not re-rendered — and the room the panel
 * reserves ONLY WHILE A CELL IS PICKED did not exist yet. A browser
 * clamps a scroll request to the document's current maximum, so the
 * page moved a little, or on a tall grid not at all. From the reader's
 * seat, clicking a chord-shape cell did nothing: the panel had opened,
 * far below the fold, and the page had stayed put.
 *
 * The scroll was never wrong. It was asked one render too early.
 *
 * A COUNTER RATHER THAN THE SELECTION ITSELF, so that clicking the same
 * cell twice scrolls twice — keying the effect on "which cell" would
 * make the second press on one cell do nothing, which is the same
 * complaint again in a smaller form.
 * =====================================================================
 */
export function useSectionScroll(
  ref: RefObject<HTMLElement | null>,
): () => void {
  const [request, setRequest] = useState(0);

  useEffect(() => {
    // Nothing has been asked for on the first render, and a page that
    // scrolled itself on arrival would take the reader somewhere they
    // did not ask to go.
    if (request === 0) return;
    scrollSectionToTop(ref.current);
  }, [request, ref]);

  // Batched with whatever state change the caller makes in the same
  // handler, so ONE render carries both and the effect sees the room.
  return useCallback(() => setRequest(n => n + 1), []);
}
