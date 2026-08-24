// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import LeadSheetDrawers from '../LeadSheetDrawers';

// The docking CONTRACT moved here from LyricDrawer when the drawers
// stopped positioning themselves. jsdom does no layout, so the offset
// itself still can't be verified — what is covered is the contract the
// overlay system depends on, and the stacking that the two-drawer bug
// came down to.

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(ui));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('LeadSheetDrawers — chrome', () => {
  it('declares itself bottom chrome so overlays clear the whole stack', () => {
    // Moved from LyricDrawer: the drawers are no longer chrome in their
    // own right, this box is, and it is what the overlays must clear.
    const el = render(
      <LeadSheetDrawers>
        <div data-lyric-drawer="" />
      </LeadSheetDrawers>,
    );
    const box = el.querySelector('[data-lead-sheet-drawers]')!;
    expect(box.getAttribute('data-app-chrome')).toBe('bottom');
  });

  it('carries a self-exclusion marker so it cannot measure itself', () => {
    // Moved from LyricDrawer. Without it the box measures its own
    // height as bottom chrome and pushes itself up by it, every frame.
    const el = render(
      <LeadSheetDrawers>
        <div />
      </LeadSheetDrawers>,
    );
    expect(el.querySelector('[data-lead-sheet-drawers]')).not.toBeNull();
  });

  it('sits below the cell-anchored overlays', () => {
    // Moved from LyricDrawer. Overlays are z-180/190; the stack must
    // never cover the placement prompt.
    const el = render(
      <LeadSheetDrawers>
        <div />
      </LeadSheetDrawers>,
    );
    const box = el.querySelector('[data-lead-sheet-drawers]') as HTMLElement;
    expect(box.className).toContain('z-40');
  });
});

describe('LeadSheetDrawers — stacking', () => {
  it('is the ONLY bottom chrome, so two drawers cannot land on one rectangle', () => {
    // The bug this container exists to remove: each drawer declared
    // itself bottom chrome AND excluded both drawers from its own
    // measurement, so neither could see the other, both resolved the
    // same offset, and the later one in the DOM painted the earlier one
    // out of existence.
    const el = render(
      <LeadSheetDrawers>
        <div data-progression-drawer="" />
        <div data-lyric-drawer="" />
      </LeadSheetDrawers>,
    );
    expect(el.querySelectorAll('[data-app-chrome="bottom"]')).toHaveLength(1);
  });

  it('stacks its children in a column, in the order given', () => {
    const el = render(
      <LeadSheetDrawers>
        <div data-progression-drawer="" />
        <div data-lyric-drawer="" />
      </LeadSheetDrawers>,
    );
    const box = el.querySelector('[data-lead-sheet-drawers]') as HTMLElement;
    expect(box.className).toContain('flex-col');
    // Lyrics renders LAST so it sits against the docking edge and keeps
    // the position it has always had.
    const kids = [...box.children];
    expect(kids[0].hasAttribute('data-progression-drawer')).toBe(true);
    expect(kids[1].hasAttribute('data-lyric-drawer')).toBe(true);
  });
});

describe('LeadSheetDrawers — the page reserves room beneath itself', () => {
  const VAR = '--lead-sheet-drawers-reserve';
  const read = () => document.documentElement.style.getPropertyValue(VAR);

  /** jsdom does no layout, so heights AND positions are stubbed and a
   *  resize is dispatched to make the component re-measure. Stubbing
   *  is the point: the arithmetic is what's under test, not jsdom.
   *
   *  `top` is what separates the two layouts. Equal tops mean the
   *  drawers are side by side and cost one header's height between
   *  them; different tops mean they are stacked and cost both. The
   *  component reads geometry rather than the breakpoint, so this is
   *  the only lever a test needs. */
  function withLayout(el: HTMLElement, boxes: Array<{ h: number; top: number }>) {
    const headers = el.querySelectorAll<HTMLElement>('[aria-expanded]');
    headers.forEach((header, i) => {
      const box = boxes[i] ?? { h: 0, top: 0 };
      Object.defineProperty(header, 'offsetHeight', {
        value: box.h, configurable: true,
      });
      header.getBoundingClientRect = () =>
        ({ top: box.top, height: box.h }) as DOMRect;
    });
    act(() => { window.dispatchEvent(new Event('resize')); });
  }

  /** Side by side, the arrangement from `sm` up. */
  const inARow = (el: HTMLElement, heights: number[]) =>
    withLayout(el, heights.map(h => ({ h, top: 100 })));

  function drawer(label: string) {
    // Shaped like the real ones: a disclosure button, then a panel.
    return (
      <div>
        <button aria-expanded={false}>{label}</button>
      </div>
    );
  }

  it('publishes the COLLAPSED height, not the open one', () => {
    // THE LOAD-BEARING ONE. An open drawer is up to 50vh; reserving
    // that would pad the page by half a screen because a panel
    // happens to be open. Only the headers are permanently in the
    // way, so only the headers are measured — the tall panel below
    // is inside the same box and must not be counted.
    const el = render(
      <LeadSheetDrawers>
        <div>
          <button aria-expanded>progressions</button>
          <div data-panel style={{ height: 400 }}>tall open panel</div>
        </div>
        {drawer('lyrics')}
      </LeadSheetDrawers>,
    );
    inARow(el, [32, 32]);
    // One row: the tallest header, 32, + 8 dock gap + 12 content gap.
    // The 400px open panel contributes nothing, and neither does the
    // second drawer — it is beside the first, not below it.
    expect(read()).toBe('52px');
  });

  it('follows the layout instead of assuming it', () => {
    // The reservation is a function of HEIGHT, and how much height
    // two drawers cost depends entirely on how they are arranged.
    // Reading it off geometry rather than off the breakpoint is why
    // going from a row back to a stack needed no change here at all.
    //
    // The side-by-side case is not a layout the app currently
    // produces — it is kept because the RULE is what is being
    // asserted, and a measurement that only worked for today's
    // arrangement is one that silently over-reserves the day the CSS
    // moves.
    const el = render(
      <LeadSheetDrawers>
        {drawer('progressions')}
        {drawer('lyrics')}
      </LeadSheetDrawers>,
    );
    inARow(el, [32, 32]);
    expect(read()).toBe('52px');

    // Same two drawers, stacked — the phone layout.
    withLayout(el, [{ h: 32, top: 100 }, { h: 32, top: 140 }]);
    expect(read()).toBe('92px');       // 32 + 32 + 8 gap + 8 + 12
  });

  it('takes the TALLEST header in a row, not the first', () => {
    // A row is as tall as its tallest member. Reading the first would
    // under-reserve whenever the second wrapped to two lines — which
    // is exactly what a long "· 42 chords, 3 hidden" does.
    const el = render(
      <LeadSheetDrawers>
        {drawer('progressions')}
        {drawer('lyrics')}
      </LeadSheetDrawers>,
    );
    inARow(el, [32, 48]);
    expect(read()).toBe('68px');       // 48 + 8 + 12
  });

  it('adds no gap for a drawer that has no neighbour', () => {
    // One drawer is one row with nothing to sit beside, so the
    // between-rows gap must not be counted. (Its old job — catching a
    // measurement that read only the first header — moved to the
    // tallest-in-a-row test above, which the row layout made a
    // sharper version of.)
    const el = render(
      <LeadSheetDrawers>{drawer('progressions')}</LeadSheetDrawers>,
    );
    inARow(el, [32]);
    expect(read()).toBe('52px');   // 32 + no gap + 8 + 12
  });

  it('clears the property on unmount', () => {
    // Every other page in the app mounts no drawers. A stale value
    // would pad them for chrome that isn't there — and because it
    // lives on documentElement, nothing else would ever clear it.
    const el = render(<LeadSheetDrawers>{drawer('lyrics')}</LeadSheetDrawers>);
    inARow(el, [32]);
    expect(read()).not.toBe('');
    act(() => root?.unmount());
    expect(read()).toBe('');
  });
});

describe('LeadSheetDrawers — narrow, stacked, hugging the right edge', () => {
  it('spans nothing: right-aligned and auto-width from sm up', () => {
    // Two full-width bars across every page was more room than two
    // occasional drawers earn. Right rather than left because the
    // desktop sidebar is on the left, and because the matrix scrolls
    // horizontally with its key names in the first column.
    const el = render(<LeadSheetDrawers>{drawerFor('lyrics')}</LeadSheetDrawers>);
    const cls = el.querySelector('[data-lead-sheet-drawers]')!.className;
    for (const c of ['sm:right-3', 'sm:left-auto', 'sm:w-auto', 'sm:items-end']) {
      expect(cls, c).toContain(c);
    }
  });

  it('stays a column — a row of two equal bars is a toolbar', () => {
    // A toolbar is a thing that is always there. Stacked and tucked
    // into the corner they read as two things you can reach for.
    const el = render(<LeadSheetDrawers>{drawerFor('lyrics')}</LeadSheetDrawers>);
    const cls = el.querySelector('[data-lead-sheet-drawers]')!.className;
    expect(cls).toContain('flex-col');
    expect(cls).not.toContain('flex-row');
  });

  it('stays stacked and full width below sm', () => {
    // A 320px bar on a 375px phone is nearly full width anyway, so
    // capping there buys nothing and risks cramping the header.
    const el = render(<LeadSheetDrawers>{drawerFor('lyrics')}</LeadSheetDrawers>);
    const cls = el.querySelector('[data-lead-sheet-drawers]')!.className;
    expect(cls).toContain('inset-x-3');
    expect(cls).toContain('flex-col');
  });

  it('sizes the children itself, so neither drawer knows it has a neighbour', () => {
    // The two-drawer bug this file exists to prevent was two
    // components holding beliefs about each other. Sizing stays here
    // with the layout: collapsed each is a tab, open it is a panel.
    const cls = render(<LeadSheetDrawers>{drawerFor('lyrics')}</LeadSheetDrawers>)
      .querySelector('[data-lead-sheet-drawers]')!.className;
    // Collapsed a tab, open a SHEET — not a slightly bigger tab.
    // Open, this is something you read: chords to play from, lyrics
    // to place. 672px is roughly 90 characters of the drawers' 11px
    // mono, which holds a chord row without wrapping mid-bar.
    expect(cls).toContain('sm:[&>*]:w-80');
    expect(cls).toContain('sm:[&>*:has([aria-expanded="true"])]:w-[42rem]');
    // Never past the viewport on a narrow window.
    expect(cls).toContain('sm:[&>*]:max-w-[calc(100vw-1.5rem)]');
  });
});

function drawerFor(label: string) {
  return (
    <div>
      <button aria-expanded={false}>{label}</button>
    </div>
  );
}
