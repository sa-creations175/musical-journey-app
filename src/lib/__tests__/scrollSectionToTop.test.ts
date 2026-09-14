// @vitest-environment jsdom
/**
 * The app's one scroll, and what it actually subtracts.
 *
 * =====================================================================
 * WHAT THIS PROVES, AND WHAT IT CANNOT.
 *
 * jsdom has no layout and no scrolling: nothing here can say a section
 * LOOKS like it landed at the top, because nothing here moves. What it
 * can say is what the function ASKS FOR — that the sticky header's
 * height is measured off the element that declares it and subtracted,
 * rather than assumed to be zero or written down as a number. That is
 * the part that was wrong before, and the part that breaks silently
 * when the header's height changes.
 *
 * Whether it feels right on a real screen is Silas's eye.
 * =====================================================================
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCROLL_ROOM_CLASS, scrollSectionToTop } from '../scrollSectionToTop';

/** The gap the helper leaves between the chrome and the section. */
const GAP_PX = 8;

let scrolled: { top?: number; behavior?: string } | null = null;

function stubWindow(scrollY: number) {
  scrolled = null;
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true });
  window.scrollTo = ((opts: { top?: number; behavior?: string }) => {
    scrolled = opts;
  }) as unknown as typeof window.scrollTo;
}

/** An element whose top edge sits `top` px down the viewport. */
function elementAt(top: number): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ top, height: 100 }) as DOMRect;
  return el;
}

/** The app chrome, declaring its own height. */
function chromeOfHeight(height: number): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-app-chrome', 'top');
  el.getBoundingClientRect = () => ({ top: 0, height }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  scrolled = null;
  vi.restoreAllMocks();
});

describe('the header is measured, not assumed', () => {
  it('subtracts the chrome it finds', () => {
    stubWindow(1000);
    chromeOfHeight(64);
    scrollSectionToTop(elementAt(500));
    // 1000 (where we are) + 500 (how far down the screen it is)
    //   − 64 (the header covering the top) − 8 (breathing room)
    expect(scrolled).toEqual({ top: 1000 + 500 - 64 - GAP_PX, behavior: 'smooth' });
  });

  it('subtracts a DIFFERENT header when the header is a different height', () => {
    // The height is genuinely variable — safe-area inset, responsive
    // padding, whether the page carries a tagline. A number written
    // down here would be right on one device and wrong on the next.
    stubWindow(0);
    chromeOfHeight(120);
    scrollSectionToTop(elementAt(400));
    expect(scrolled).toEqual({ top: 400 - 120 - GAP_PX, behavior: 'smooth' });
  });

  it('subtracts nothing when there is no chrome to measure', () => {
    stubWindow(0);
    scrollSectionToTop(elementAt(400));
    expect(scrolled).toEqual({ top: 400 - GAP_PX, behavior: 'smooth' });
  });

  it('never asks to scroll above the top of the document', () => {
    stubWindow(0);
    chromeOfHeight(200);
    scrollSectionToTop(elementAt(10));
    expect(scrolled).toEqual({ top: 0, behavior: 'smooth' });
  });

  it('does nothing at all with nothing to scroll to', () => {
    stubWindow(0);
    scrollSectionToTop(null);
    expect(scrolled).toBeNull();
  });
});

describe('the room a scrolled-to section needs below it', () => {
  it('is a whole Tailwind class', () => {
    // A height assembled from a number is invisible to the scanner,
    // emits no rule, reserves nothing — and the scroll quietly goes
    // back to landing short, with every test still green.
    expect(SCROLL_ROOM_CLASS).toBe('min-h-[85vh]');
  });
});

describe('the element that scrolls, which in this app is not the window', () => {
  it('scrolls the nearest ancestor that really scrolls', () => {
    // `index.css` gives html AND body `overflow-x: hidden`, which leaves
    // body as the scroll container: measured in Chrome on 14 Sep 2026,
    // `window.scrollTo` moved nothing and body did. So a scroller above
    // the element is used before the window is.
    stubWindow(0);
    chromeOfHeight(64);
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    Object.defineProperty(scroller, 'scrollHeight', { value: 5000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 800, configurable: true });
    scroller.scrollTop = 300;
    scroller.getBoundingClientRect = () => ({ top: 0, height: 800 }) as DOMRect;
    let asked: { top?: number; behavior?: string } | null = null;
    scroller.scrollTo = ((opts: { top?: number; behavior?: string }) => { asked = opts; }) as unknown as typeof scroller.scrollTo;
    const el = elementAt(500);
    scroller.appendChild(el);
    document.body.appendChild(scroller);

    scrollSectionToTop(el);
    // 500 down the scroller's view, 300 already scrolled, less the
    // header and the breathing room.
    expect(asked).toEqual({ top: 500 + 300 - 64 - GAP_PX, behavior: 'smooth' });
    expect(scrolled).toBeNull();
  });

  it('falls back to the window where nothing above scrolls', () => {
    stubWindow(200);
    const el = elementAt(400);
    document.body.appendChild(el);
    scrollSectionToTop(el);
    expect(scrolled).toEqual({ top: 200 + 400 - GAP_PX, behavior: 'smooth' });
  });
});
