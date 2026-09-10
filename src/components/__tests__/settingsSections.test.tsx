// @vitest-environment jsdom
import 'fake-indexeddb/auto';
/**
 * The Settings page's eight sections.
 *
 * =====================================================================
 * THE PAGE WAS ONE SCROLL OF FOURTEEN UNLABELLED BLOCKS.
 *
 * Every one an `h4` in lowercase, the same size as the words inside it,
 * in the order they happened to be built — so finding the export button
 * meant reading everything above it. Silas's walked prototype of 10 Sep
 * 2026 gives it eight named sections in a ruled order, every one closed
 * on arrival, with a chip row that jumps to one and opens it.
 *
 * THE ORDER IS THE RULING and is asserted in full: a section that
 * quietly moved would be a page a reader has to re-learn.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import SettingsPanel from '../SettingsPanel';
import { SETTINGS_SECTIONS } from '../settings/settingsSections';

/**
 * STUBBED, because this file is about the SHELL. About You renders the
 * account block, which reaches for a live auth context and a sync
 * status; opening the section to prove it is in the right place should
 * not require standing either of them up.
 */
vi.mock('../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: null, signOut: async () => {} }),
}));
vi.mock('../../lib/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ offline: false, pending: 0, refresh: async () => {} }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function render(): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter><SettingsPanel open onClose={() => {}} /></MemoryRouter>,
    );
  });
}

const byTestId = (id: string) =>
  document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

const click = (el: Element | null) => {
  act(() => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* private mode */ }
  // jsdom has no layout, so the section's scroll-into-view is a no-op
  // that would otherwise throw.
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('the eight sections', () => {
  it('are in the order Silas ruled', () => {
    expect(SETTINGS_SECTIONS.map(s => s.title)).toEqual([
      'About You',
      'Understanding App Ratings',
      'Unlocking Tiers of Difficulty',
      'Setting Note & Progression Spelling',
      'Setting Your Daily Effort',
      'Scheduling & Spacing Rules',
      'Managing Your Data',
      'Developer Tools',
    ]);
  });

  it('all render, and all start closed', () => {
    render();
    for (const s of SETTINGS_SECTIONS) {
      const el = byTestId(`settings-section-${s.id}`);
      expect(el, s.id).not.toBeNull();
      expect(el!.getAttribute('data-open'), s.id).toBe('false');
    }
  });

  it('numbers each section by its place in the order', () => {
    render();
    SETTINGS_SECTIONS.forEach((s, i) => {
      expect(byTestId(`settings-toggle-${s.id}`)!.textContent, s.id)
        .toContain(`Section ${i + 1}`);
    });
  });

  it('gives the title more weight than the number', () => {
    // The kicker tells you where you are in the eight; the title tells
    // you what it is, and a reader looking for their data is looking
    // for the word rather than for "Section 7".
    render();
    const toggle = byTestId('settings-toggle-data')!;
    const [kicker, title] = [...toggle.querySelectorAll('span span')];
    expect(kicker.className).toContain('text-[10px]');
    expect(title.className).toContain('text-lg');
    expect(title.className).toContain('font-bold');
  });
});

describe('opening one', () => {
  it('opens on a tap and closes on the next', () => {
    render();
    click(byTestId('settings-toggle-data'));
    expect(byTestId('settings-section-data')!.getAttribute('data-open')).toBe('true');
    click(byTestId('settings-toggle-data'));
    expect(byTestId('settings-section-data')!.getAttribute('data-open')).toBe('false');
  });

  it('opens the section a chip names, and only that one', () => {
    render();
    click(byTestId('settings-chip-spelling'));
    for (const s of SETTINGS_SECTIONS) {
      expect(byTestId(`settings-section-${s.id}`)!.getAttribute('data-open'), s.id)
        .toBe(String(s.id === 'spelling'));
    }
  });

  it('keeps one open at a time, so the page cannot become the old scroll', () => {
    render();
    click(byTestId('settings-toggle-you'));
    click(byTestId('settings-toggle-dev'));
    expect(byTestId('settings-section-you')!.getAttribute('data-open')).toBe('false');
    expect(byTestId('settings-section-dev')!.getAttribute('data-open')).toBe('true');
  });

  it('remembers which one, per device', () => {
    // A FOLD, NOT A PREFERENCE ABOUT MUSIC — so localStorage, exactly
    // like the shared player's settings fold.
    render();
    click(byTestId('settings-toggle-effort'));
    act(() => { root!.unmount(); });
    host!.remove();
    render();
    expect(byTestId('settings-section-effort')!.getAttribute('data-open')).toBe('true');
  });
});

describe('what moved where', () => {
  const contains = (id: string, text: string) => {
    click(byTestId(`settings-toggle-${id}`));
    return byTestId(`settings-section-${id}`)!.textContent!.toLowerCase()
      .includes(text.toLowerCase());
  };

  it('puts every existing block in its ruled section', () => {
    render();
    expect(contains('you', 'your name')).toBe(true);
    expect(contains('effort', 'daily goal')).toBe(true);
    expect(contains('spacing', 'Open Spacing & Scheduling')).toBe(true);
    expect(contains('data', 'Export My Data')).toBe(true);
    expect(contains('spelling', 'progression spelling')).toBe(true);
  });

  it('has dropped the "more settings coming soon" block', () => {
    // Named rather than merely absent: it promised daily goals, which
    // shipped, and then sat there promising the rest.
    render();
    for (const s of SETTINGS_SECTIONS) click(byTestId(`settings-toggle-${s.id}`));
    expect(document.body.textContent).not.toContain('more settings coming soon');
  });
});
