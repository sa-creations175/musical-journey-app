// @vitest-environment jsdom
/**
 * The metronome's settings inside a panel.
 *
 * =====================================================================
 * AN ABSOLUTE POPOVER IS A MODAL INSIDE A MODAL IN EVERY WAY THAT
 * MATTERS.
 *
 * The settings are anchored to the trigger's RIGHT edge and are wider
 * than the space to its left, so inside a session panel they opened
 * half off the screen — tempo, groove, time signature and accent all
 * cut off at the left edge and unreachable.
 *
 * In place, they push what is below them down and cannot be positioned
 * off the edge of anything.
 * =====================================================================
 */
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import MetronomeControl from '../MetronomeControl';

vi.mock('../../lib/userPrefs', () => ({
  getPref: async (_k: string, d: unknown) => d,
  setPref: async () => {},
}));

function render(expandInPlace: boolean) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<MetronomeControl expandInPlace={expandInPlace} />); });
  const open = () => {
    const b = [...host.querySelectorAll('button')]
      .find(x => x.getAttribute('title') === 'Metronome Settings');
    act(() => { b?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  };
  return {
    open,
    panel: () => host.querySelector('[aria-label="metronome settings"]'),
    unmount: () => { act(() => { root.unmount(); }); host.remove(); },
  };
}

describe('inside a panel', () => {
  it('EXPANDS IN PLACE — no overlay, nothing to position off screen', () => {
    const r = render(true);
    r.open();
    const cls = r.panel()?.className ?? '';
    expect(cls).not.toContain('absolute');
    expect(cls).not.toContain('z-50');
    expect(cls).not.toContain('shadow-xl');
    r.unmount();
  });

  it('and is still not announced as a dialog', () => {
    // The other half of "no modal inside a modal", fixed earlier and
    // pinned here too.
    const r = render(true);
    r.open();
    expect(r.panel()?.getAttribute('role')).not.toBe('dialog');
    r.unmount();
  });
});

describe('in the header', () => {
  it('keeps the popover, because there is room for one', () => {
    const r = render(false);
    r.open();
    expect(r.panel()?.className ?? '').toContain('absolute');
    r.unmount();
  });
});
