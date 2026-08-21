// @vitest-environment jsdom
/**
 * The seam between the URL and Chord Motion.
 *
 * Two things have to arrive together and only one of them is the pool.
 * Chord progressions is three tabs behind one route, and Chord Motion
 * is the only one that reads a focus set — so a pool that lands on Full
 * Progression is a drill silently ignoring what it was asked for.
 *
 * The stored-tab race is the reason this file exists rather than a
 * prop-level test: the persisted tab is read asynchronously, so it
 * resolves AFTER the URL has been applied and wins a race it should
 * lose. Nothing at the component level can see that.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import ChordProgressions from '../ChordProgressions';
import { setPref } from '../../../../lib/userPrefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const ROUTE = '/ear-training/chord-progressions';

async function renderAt(entry: string): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[entry]}>
        <ChordProgressions />
      </MemoryRouter>,
    );
  });
  // Settle past the async tab and focus hydration — the race is the
  // whole point, so a single tick would prove nothing.
  for (let i = 0; i < 12; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return container;
}

/** The tab strip reports the active tab through aria-pressed. */
function activeTab(el: HTMLElement): string {
  const pressed = [...el.querySelectorAll('nav button[aria-pressed="true"]')];
  return pressed.map(b => b.textContent ?? '').join('|');
}

function onChordMotion(el: HTMLElement): boolean {
  return el.querySelector('[data-testid="play-motion"]') !== null;
}

beforeEach(async () => {
  await setPref('chordProgressionsMotionFocus', []);
  await setPref('chordProgressionsMotionNoteContext', 'diatonic');
  await setPref('chordProgressionsActiveTab', 'full-progression');
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('the tab and the pool arrive together', () => {
  it('lands on chord motion, focused on what it was sent', async () => {
    const el = await renderAt(`${ROUTE}?tab=chord-motion&focus=motion:1-b2-asc,motion:1-4-asc`);
    expect(onChordMotion(el)).toBe(true);
    expect(el.textContent).toContain('2 motions selected');
  });

  it('the URL beats the tab that was last open', async () => {
    // THE RACE. The stored tab is read asynchronously and applied
    // after `useUrlTabSync` has already honoured the URL, so without a
    // guard the tap settles on whichever tab was open last — with the
    // focus set applied to a tab that never reads it.
    await setPref('chordProgressionsActiveTab', 'key-detection');
    const el = await renderAt(`${ROUTE}?tab=chord-motion&focus=motion:1-b2-asc`);
    expect(onChordMotion(el)).toBe(true);
    expect(activeTab(el)).toContain('chord motion');
  });

  it('still opens the tab you left it on when the URL names none', async () => {
    // Guard the guard: the stored tab is skipped for a URL that names
    // one, not broken outright.
    await setPref('chordProgressionsActiveTab', 'key-detection');
    const el = await renderAt(ROUTE);
    expect(onChordMotion(el)).toBe(false);
    expect(activeTab(el)).toContain('key detection');
  });

  it('carries focus protection in from the URL', async () => {
    const el = await renderAt(`${ROUTE}?tab=chord-motion&focus=motion:1-b2-asc`);
    expect(el.querySelector('[data-testid="fluency-protection-notice"]')).not.toBeNull();
  });

  it('opens chord motion unfocused when no pool is named', async () => {
    const el = await renderAt(`${ROUTE}?tab=chord-motion`);
    expect(onChordMotion(el)).toBe(true);
    expect(el.textContent).not.toContain('focused practice');
  });
});
