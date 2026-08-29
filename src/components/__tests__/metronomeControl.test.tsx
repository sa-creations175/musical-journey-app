// @vitest-environment jsdom
/**
 * The metronome's settings are a popover, and must not behave — or be
 * announced — as a dialog.
 *
 * =====================================================================
 * THIS CONTROL LIVES INSIDE OTHER MODALS, WHICH IS THE WHOLE PROBLEM.
 *
 * Spec §5 forbids a modal inside a modal. The settings panel was
 * `role="dialog"` while doing none of the things a dialog does: no
 * focus trap, no backdrop, dismissed by clicking anywhere else. So
 * assistive technology announced a dialog opening inside the test
 * modal and offered dialog navigation for a panel that had none.
 *
 * The keyboard half was worse and invisible: Escape inside the open
 * settings reached the host modal and closed it, so nudging a tempo
 * and pressing Escape to dismiss the little panel took the test
 * session with it.
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

function render() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<MetronomeControl />); });
  const settingsButton = () =>
    [...host.querySelectorAll('button')]
      .find(b => b.getAttribute('title') === 'Metronome Settings')!;
  return {
    host,
    settingsButton,
    open: () => act(() => {
      settingsButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }),
    panel: () => host.querySelector('[aria-label="metronome settings"]'),
    unmount: () => { act(() => { root.unmount(); }); host.remove(); },
  };
}

describe('the settings panel is a disclosure', () => {
  it('is NOT announced as a dialog', () => {
    const r = render();
    r.open();
    expect(r.panel()).not.toBeNull();
    expect(r.panel()?.getAttribute('role')).not.toBe('dialog');
    r.unmount();
  });

  it('the trigger names the panel it controls', () => {
    // `aria-expanded` alone says something opened; `aria-controls`
    // says what. Together they are the disclosure pattern this is.
    const r = render();
    r.open();
    const id = r.settingsButton().getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(r.panel()?.id).toBe(id);
    r.unmount();
  });

  it('two controls on one page do not share an id', () => {
    // The header has one and a song's strip has another. A hard-coded
    // id would point both triggers at the same element.
    const a = render();
    const b = render();
    a.open();
    b.open();
    expect(a.panel()?.id).not.toBe(b.panel()?.id);
    a.unmount();
    b.unmount();
  });
});

describe('Escape closes the settings and nothing behind them', () => {
  it('closes the panel', () => {
    const r = render();
    r.open();
    expect(r.panel()).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(r.panel()).toBeNull();
    r.unmount();
  });

  it('DOES NOT let the host modal see the Escape', () => {
    // The reversal for the fix: a host listener that still fires would
    // close the test session out from under an open settings panel.
    const hostSaw = vi.fn();
    window.addEventListener('keydown', hostSaw);
    const r = render();
    r.open();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(hostSaw).not.toHaveBeenCalled();
    window.removeEventListener('keydown', hostSaw);
    r.unmount();
  });

  it('with the settings SHUT, Escape reaches the host as it always did', () => {
    // The other half. Swallowing Escape unconditionally would make
    // every modal containing a metronome undismissable by keyboard.
    const hostSaw = vi.fn();
    window.addEventListener('keydown', hostSaw);
    const r = render();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(hostSaw).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', hostSaw);
    r.unmount();
  });
});
