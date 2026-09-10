// @vitest-environment jsdom
import 'fake-indexeddb/auto';
/**
 * The Settings page's own words.
 *
 * =====================================================================
 * A SWEEP, BECAUSE WHAT IT ASSERTS IS AN ABSENCE.
 *
 * Silas's copy rules of 10 Sep 2026 for this page: module and submodule
 * names in Title Case, "Tier" capitalised where it names one, no em
 * dashes in body copy, no "church modes". Every one of those is a
 * statement about what the page does NOT contain, and a section written
 * next month would sail past any test that checked one screen.
 *
 * So this opens all eight sections and reads the whole page.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import SettingsPanel from '../../SettingsPanel';
import { SETTINGS_SECTIONS, titleCaseModule } from '../settingsSections';

vi.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: { email: 'x@y.z' }, signOut: async () => {} }),
}));
vi.mock('../../../lib/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ offline: false, pending: 0, refresh: async () => {} }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

/** The whole page, every section open. */
async function wholePage(): Promise<string> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter><SettingsPanel open onClose={() => {}} /></MemoryRouter>,
    );
  });
  await settle();
  for (const s of SETTINGS_SECTIONS) {
    await act(async () => {
      document.querySelector(`[data-testid="settings-toggle-${s.id}"]`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await settle();
  }
  // One at a time is the page's rule, so read each as it opens instead.
  return document.body.textContent ?? '';
}

/** Every section's text, gathered one open section at a time. */
async function everySectionText(): Promise<string> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter><SettingsPanel open onClose={() => {}} /></MemoryRouter>,
    );
  });
  await settle();
  let all = document.body.textContent ?? '';
  for (const s of SETTINGS_SECTIONS) {
    await act(async () => {
      document.querySelector(`[data-testid="settings-toggle-${s.id}"]`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await settle();
    all += ' ' + (document.body.textContent ?? '');
  }
  return all;
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* private mode */ }
  Element.prototype.scrollIntoView = () => {};
  window.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
  window.cancelAnimationFrame = () => {};
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('the page keeps its copy rules', () => {
  it('carries no em dash in body copy', async () => {
    // AN EM DASH BETWEEN WORDS, which is the body-copy use Silas ruled
    // out. The bare glyph on its own is the app's "no value" mark in a
    // table cell — `NO_VALUE` in `dashboard/bands` — and is not copy.
    const text = await everySectionText();
    const offenders = [...text.matchAll(/.{0,40}\s—\s.{0,40}/g)].map(m => m[0]);
    expect(offenders).toEqual([]);
  });

  it('never says "church modes"', async () => {
    const text = await everySectionText();
    expect(text.toLowerCase()).not.toContain('church mode');
  });

  it('capitalises Tier wherever it names one', async () => {
    const text = await everySectionText();
    // The lower-case forms that would mean a Tier.
    for (const bad of ['tier 1', 'tier 2', 'the tier', 'a tier', 'next tier', ' tiers']) {
      expect(text.toLowerCase().includes(bad) && !text.includes(
        bad.replace(/\btier/, 'Tier')), bad).toBe(false);
    }
  });

  it('names the modules in Title Case', async () => {
    const text = await everySectionText();
    for (const name of [
      'Ear Training', 'Chord Recognition', 'Scales & Modes', 'Harmonic Fluency',
    ]) {
      expect(text, name).toContain(name);
    }
    // And the lower-case forms are gone from the page.
    for (const bad of ['ear training', 'harmonic fluency', 'shapes & patterns']) {
      expect(text.includes(bad), bad).toBe(false);
    }
  });
});

describe('titleCaseModule', () => {
  it('capitalises the words and leaves everything else alone', () => {
    expect(titleCaseModule('ear training')).toBe('Ear Training');
    expect(titleCaseModule('shapes & patterns')).toBe('Shapes & Patterns');
    expect(titleCaseModule('song repertoire')).toBe('Song Repertoire');
    expect(titleCaseModule('production')).toBe('Production');
  });

  it('leaves a label that is already cased where it is', () => {
    // A bare `[a-z]+` matches "ar" inside "Ear" and gives "EAr".
    expect(titleCaseModule('Ear Training')).toBe('Ear Training');
  });
});

describe('the page is one screen', () => {
  it('shows a heading for each section, all eight', async () => {
    const text = await wholePage();
    for (const s of SETTINGS_SECTIONS) expect(text, s.id).toContain(s.title);
  });
});
