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
