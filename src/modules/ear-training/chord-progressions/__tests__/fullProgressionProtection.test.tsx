// @vitest-environment jsdom
/**
 * Focus protection on the Full Progression card, brought back.
 *
 * Silas, 10 Sep 2026: "if the pool is so small, you're only choosing
 * out of a group of four, and those odds are just too easy." When the
 * card's What is in play filter leaves fewer than four progressions,
 * the card shows the shared notice and logs `excludeFromFluency`, as
 * Chord Recognition and Intervals do. Rendered, answered, and read back
 * from the attempts table.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../../../lib/db';
import { setPref } from '../../../../lib/userPrefs';
import { EVERYTHING, PREF_FULL_PROGRESSION_FILTER } from '../fullProgressionPool';
import { SHARED_PROGRESSIONS } from '../sharedList';

vi.mock('../../../../lib/builtAnswers/play', async orig => ({
  ...(await orig<typeof import('../../../../lib/builtAnswers/play')>()),
  playPanel: vi.fn(async () => ({ stop() {} })),
}));

const { default: FullProgressionCard } = await import('../FullProgressionCard');
const { InstrumentProvider } = await import('../../../../lib/instrumentContext');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;
const settle = async () => {
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise(r => setTimeout(r, 5)); });
};
const click = async (id: string) => {
  const b = host!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  if (!b) throw new Error(`no ${id}`);
  await act(async () => { b.click(); });
  await settle();
};

/** The card with `n` progressions in play, answered once. */
async function answeredWith(n: number) {
  const ids = SHARED_PROGRESSIONS.slice(0, n).map(p => p.id);
  await setPref(PREF_FULL_PROGRESSION_FILTER, { ...EVERYTHING, progressions: ids });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<InstrumentProvider><MemoryRouter><FullProgressionCard attempts={[]} /></MemoryRouter></InstrumentProvider>);
  });
  await settle();
  const notice = host.querySelector('[data-testid="fluency-protection-notice"]');
  await click('play-again');
  await click(`answer-prog-${ids[0]}`);
  await click('answer-pos-1');
  await click('submit');
  const rows = await db.attempts.where('moduleId').equals('chord-progressions').toArray();
  return { notice, last: rows[rows.length - 1] };
}

// THE FIRST CARD OF THE POOL, every time, so the answer buttons the test
// taps are the ones that card shows.
beforeEach(async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  await db.attempts.clear();
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('the Full Progression card protects a small pool', () => {
  it('three progressions in play: the shared notice, and attempts logged as practice', async () => {
    const { notice, last } = await answeredWith(3);
    expect(notice?.textContent).toContain('at least 4 items');
    expect(last).toBeDefined();
    expect(last!.excludeFromFluency).toBe(true);
  });

  it('four in play: no notice, and the attempt counts', async () => {
    const { notice, last } = await answeredWith(4);
    expect(notice).toBeNull();
    expect(last).toBeDefined();
    expect(last!.excludeFromFluency).toBeUndefined();
  });
});
