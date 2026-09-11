// @vitest-environment jsdom
/**
 * The stats panel's Chord Motion view: Group by Distance / Direction /
 * Accuracy. The rows are the same rows whichever is chosen; only the
 * headings move. Silas's ruling of 10 Sep 2026.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { AttemptRecord } from '../../../../lib/db';
import { setPref } from '../../../../lib/userPrefs';
import { ALL_MOTIONS } from '../chordMotionPool';

vi.mock('../../../../lib/useSpacingIntervals', async orig => ({
  ...(await orig<typeof import('../../../../lib/useSpacingIntervals')>()),
  useSpacingIntervals: () => new Map(),
}));
vi.mock('../../useEtCurations', () => ({ useEtCurationsLive: () => new Map() }));
vi.mock('../../useEtSelection', () => ({
  useEtSelection: () => ({
    active: false, selected: new Set(), toggle: () => {},
    clear: () => {}, exit: () => {}, setActive: () => {},
  }),
}));

const { default: ProgressionFluencyTracker } = await import('../ProgressionFluencyTracker');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;
const settle = async () => {
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise(r => setTimeout(r, 5)); });
};

const NOW = Date.now();
const att = (itemId: string, correct: boolean): AttemptRecord => ({
  moduleId: 'chord-progressions', itemId, correct, timestamp: NOW - 1000,
});
/** `n` answers on one motion, `right` of them right. */
const answers = (id: string, n: number, right: number) =>
  Array.from({ length: n }, (_, i) => att(id, i < right));

async function panel(attempts: AttemptRecord[]): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<ProgressionFluencyTracker attempts={attempts} />); });
  const tab = [...host.querySelectorAll('button')].find(b => b.textContent === 'Chord Motion')!;
  await act(async () => { tab.click(); });
  await settle();
  return host;
}
const headings = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-testid="motion-group"] h3')].map(h => h.textContent ?? '');
const rowCount = (el: HTMLElement) => el.querySelectorAll('[data-testid="motion-group"] [role="progressbar"]').length;
async function choose(el: HTMLElement, id: string) {
  await act(async () => { (el.querySelector(`[data-testid="motion-group-${id}"]`) as HTMLElement).click(); });
  await settle();
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  await setPref('chordProgressionsMotionGroupBy', 'distance');
});

describe('Group by', () => {
  it('opens on Distance, as the panel always has', async () => {
    const el = await panel([]);
    expect(el.querySelector('[data-testid="motion-group-distance"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(headings(el)[0]).toMatch(/^Same Root — 3 motions$/);
    expect(headings(el)).toContain(`2nds — ${ALL_MOTIONS.filter(m => m.distance === 2).length} motions`);
  });

  it('Direction files the same rows under Up, Down and Same Root', async () => {
    const el = await panel([]);
    const before = rowCount(el);
    await choose(el, 'direction');
    const up = ALL_MOTIONS.filter(m => m.direction === 'asc').length;
    const down = ALL_MOTIONS.filter(m => m.direction === 'desc').length;
    expect(headings(el)).toEqual([`Up — ${up} motions`, `Down — ${down} motions`, 'Same Root — 3 motions']);
    // The rows are unchanged, only their headings.
    expect(rowCount(el)).toBe(before);
  });

  it('Accuracy groups by rating word, low to high within each', async () => {
    const attempts = [
      // AGAINST THE POOL'S ORDER, which lists 1 → 4 before 1 → 5, so
      // the sort has to reorder them to pass.
      ...answers('motion:1-4-asc', 10, 7),  // 70%: Developing
      ...answers('motion:1-5-asc', 10, 6),  // 60%: Developing
      ...answers('motion:1-6-asc', 10, 3),  // 30%: Needs Work
      ...answers('motion:2-5-asc', 10, 9),  // 90%: Fluent
    ];
    const el = await panel(attempts);
    await choose(el, 'accuracy');
    const h = headings(el);
    // In the ruled order; Not Started last, for the rows never answered.
    expect(h.slice(0, 3)).toEqual(['Needs Work — 1 motions', 'Developing — 2 motions', 'Fluent — 1 motions']);
    expect(h[h.length - 1]).toMatch(/^Not Started — \d+ motions$/);
    // Within Developing: 60% (1 → 5) before 70% (1 → 4).
    const developing = [...el.querySelectorAll('[data-testid="motion-group"]')][1];
    const labels = [...developing.querySelectorAll('[role="progressbar"]')].map(b => b.getAttribute('aria-label') ?? '');
    expect(labels[0]).toMatch(/^1 \S 5\b/);
    expect(labels[1]).toMatch(/^1 \S 4\b/);
  });

  it('is remembered', async () => {
    let el = await panel([]);
    await choose(el, 'direction');
    await act(async () => root!.unmount());
    host!.remove();
    root = null;
    el = await panel([]);
    expect(el.querySelector('[data-testid="motion-group-direction"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(headings(el)[0]).toMatch(/^Up —/);
  });
});
