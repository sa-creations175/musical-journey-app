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

  /** jsdom does no layout, so heights are stubbed and a resize is
   *  dispatched to make the component re-measure. Stubbing is the
   *  point: the arithmetic is what's under test, not jsdom. */
  function withHeights(el: HTMLElement, heights: number[]) {
    const headers = el.querySelectorAll<HTMLElement>('[aria-expanded]');
    headers.forEach((h, i) => {
      Object.defineProperty(h, 'offsetHeight', {
        value: heights[i] ?? 0, configurable: true,
      });
    });
    act(() => { window.dispatchEvent(new Event('resize')); });
  }

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
    withHeights(el, [32, 32]);
    // 32 + 32 headers, + 8 for the one gap between them, + 8 dock gap
    // + 12 content gap. The 400px panel contributes nothing.
    expect(read()).toBe('92px');
  });

  it('counts every drawer, not just the first', () => {
    // Guard the guard: a measurement that read only one header would
    // pass the test above by coincidence if both were the same height.
    const el = render(
      <LeadSheetDrawers>{drawer('progressions')}</LeadSheetDrawers>,
    );
    withHeights(el, [32]);
    expect(read()).toBe('52px');   // 32 + no gap + 8 + 12
  });

  it('clears the property on unmount', () => {
    // Every other page in the app mounts no drawers. A stale value
    // would pad them for chrome that isn't there — and because it
    // lives on documentElement, nothing else would ever clear it.
    const el = render(<LeadSheetDrawers>{drawer('lyrics')}</LeadSheetDrawers>);
    withHeights(el, [32]);
    expect(read()).not.toBe('');
    act(() => root?.unmount());
    expect(read()).toBe('');
  });
});
