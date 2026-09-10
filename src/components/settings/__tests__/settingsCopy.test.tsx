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

/**
 * The small-caps sub-heading that titles a panel inside a section —
 * the class every one of them shares.
 */
const PANEL_HEADING = 'h4.uppercase';

/** Every heading on the page, gathered one open section at a time. */
async function everyHeading(selector = 'h1, h2, h3, h4, h5, h6'): Promise<string[]> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter><SettingsPanel open onClose={() => {}} /></MemoryRouter>,
    );
  });
  await settle();
  const seen = new Set<string>();
  const gather = () => {
    for (const h of document.querySelectorAll(selector)) {
      const t = (h.textContent ?? '').trim();
      if (t !== '') seen.add(t);
    }
  };
  gather();
  for (const s of SETTINGS_SECTIONS) {
    await act(async () => {
      document.querySelector(`[data-testid="settings-toggle-${s.id}"]`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await settle();
    gather();
  }
  return [...seen];
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

describe('one voice', () => {
  /**
   * =====================================================================
   * THE PAGE WAS WRITTEN BY TWO PEOPLE AND READ LIKE IT.
   *
   * "Used in the dashboard greeting. leave blank to reset to the
   * default." sat two cards below "Every section starts closed. Tap a
   * title to open it." Nine sentences opened in lower case, all of them
   * from before the page was rewritten, and the mix is what a reader
   * notices rather than either style on its own. Swept 10 Sep 2026.
   * =====================================================================
   */
  it('opens every sentence with a capital', async () => {
    const text = await everySectionText();
    // A sentence end, then a space, then a lower-case letter. The
    // exceptions are real: an abbreviation, a decimal, a version.
    // HYPHENS COUNT AS LETTERS: "read-only, and it changes nothing"
    // slipped the first sweep because the word after the full stop had
    // a hyphen in it.
    const offenders = [...text.matchAll(/[.!?]\s+([a-z][a-z'-]{2,}[\s,][a-z\s])/g)]
      .map(m => m[1]);
    expect(offenders).toEqual([]);
  });

  /**
   * THE HEADINGS TOO. The sentence sweep above left five sub-headings
   * in lower case — "sync diagnostics", "song keys" — beside eight
   * section titles in Title Case, which is the same two-voices problem
   * one level up. Swept 10 Sep 2026.
   *
   * TWO KINDS OF HEADING, AND THE RULE IS NOT THE SAME FOR BOTH. The
   * small-caps sub-headings that title a panel ("Sync Diagnostics")
   * are Title Case, like the section titles. The part headings inside
   * the Ratings, Spelling and Unlocking copy ("Note names", "The rule,
   * for both ladders") are written as sentences, all of them, and that
   * is copy rather than a sweep's to recase. Every heading of either
   * kind opens with a capital.
   * =====================================================================
   */
  it('writes every panel sub-heading in Title Case', async () => {
    const MINOR = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'vs']);
    const headings = await everyHeading(PANEL_HEADING);
    // Guard the guard: the five that were lower case are the kind read.
    for (const h of ['Sync Diagnostics', 'Phantom Key Rows', 'Song Keys',
      'How Long Before a Song Goes Cold', 'How Long Before a Skill Looks Stale']) {
      expect(headings, h).toContain(h);
    }
    const offenders = headings.filter(h => h.split(/\s+/).some((w, i) =>
      /^[a-z]/.test(w) && (i === 0 || !MINOR.has(w))));
    expect(offenders).toEqual([]);
  });

  it('opens every heading with a capital, of either kind', async () => {
    const offenders = (await everyHeading()).filter(h => /^[a-z]/.test(h));
    expect(offenders).toEqual([]);
  });

  it('names Production Vocabulary in Title Case, like every other module', async () => {
    const text = await everySectionText();
    expect(text).toContain('Production Vocabulary');
    expect(text).not.toContain('Production vocabulary');
  });
});
