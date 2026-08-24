// @vitest-environment jsdom
/**
 * The harmonic-fluency tracker, and the case that forced the per-tick
 * interval.
 *
 * ---------------------------------------------------------------
 * A ROW HERE IS A CATEGORY, NOT AN ITEM.
 *
 * "Pentatonic scales" is 41 cards on 41 schedules. There is no single
 * interval for that row, and a median across cards at 2-day and 30-day
 * intervals would describe neither card while reading as a fact about
 * every rep in the strip.
 *
 * So each tick carries its own card's interval. A fixture where every
 * attempt shares an interval passes on the aggregate version — these
 * deliberately do not.
 * ---------------------------------------------------------------
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { AttemptRecord } from '../../../lib/db';
import HarmonicFluencyTracker from '../HarmonicFluencyTracker';
import { tickOpacity } from '../../../lib/progressBar';
import { CATEGORY_LABELS, FLASHCARDS } from '../catalog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

/** Two cards in ONE category, on very different schedules. */
const CAT = 'tritone-pairs' as const;
const CARDS = FLASHCARDS.filter(c => c.category === CAT).slice(0, 2);
const SLOW = CARDS[0].id;   // 30-day interval
const FAST = CARDS[1].id;   // 2-day interval

const INTERVALS = new Map<string, number>([[SLOW, 30], [FAST, 2]]);

vi.mock('../../../lib/useSpacingIntervals', async (orig) => {
  const actual = await orig<typeof import('../../../lib/useSpacingIntervals')>();
  return { ...actual, useSpacingIntervals: () => INTERVALS };
});

const att = (itemId: string, correct: boolean, daysAgo: number): AttemptRecord => ({
  moduleId: 'harmonic-fluency', itemId, correct, timestamp: NOW - daysAgo * DAY,
});

let liveAttempts: AttemptRecord[] = [];
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => liveAttempts,
}));

function mount(attempts: AttemptRecord[]) {
  liveAttempts = attempts;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<HarmonicFluencyTracker />); });
  const label = CATEGORY_LABELS[CAT];
  const barFor = () => {
    const bar = [...container.querySelectorAll('[role="progressbar"]')]
      .find(b => (b.getAttribute('aria-label') ?? '').startsWith(label));
    if (!bar) throw new Error(`no bar for ${label}`);
    return bar;
  };
  return {
    widths: () =>
      [...barFor().querySelectorAll('div')].map(d => (d as HTMLElement).style.width),
    ticks: () =>
      [...barFor().parentElement!.parentElement!
        .querySelector('[role="img"]')!.querySelectorAll('[data-tick]')] as HTMLElement[],
    text: () => container.textContent ?? '',
    unmount: () => { act(() => { root.unmount(); }); container.remove(); },
  };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
});

describe('per-tick intervals — the reason for the field', () => {
  it('fades two SAME-AGED reps differently when their cards differ', () => {
    // THE WHOLE POINT OF (b). One category, one strip, two cards, the
    // same age and the same outcome — only the schedule differs. Any
    // aggregate interval makes these identical.
    const h = mount([att(FAST, true, 4), att(SLOW, true, 4)]);
    // Oldest-first: both are 4 days old, so order is as supplied
    // reversed — SLOW first.
    const [slowTick, fastTick] = h.ticks();
    const slowOpacity = Number(slowTick.style.opacity);
    const fastOpacity = Number(fastTick.style.opacity);
    expect(slowOpacity).not.toBe(fastOpacity);
    expect(slowOpacity).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 30), 2);
    expect(fastOpacity).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 2), 2);
    h.unmount();
  });

  it('falls back to the strip value for a card with no spacing row', () => {
    // `spacingIntervalFor` answers FALLBACK_INTERVAL_DAYS for an
    // unknown card, which fades faster rather than claiming freshness.
    const unknown = FLASHCARDS.find(
      c => c.category === CAT && c.id !== SLOW && c.id !== FAST,
    )!.id;
    const h = mount([att(unknown, true, 4)]);
    expect(Number(h.ticks()[0].style.opacity))
      .toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 1), 2);
    h.unmount();
  });
});

describe('the shared bar', () => {
  it('draws three segments across the category', () => {
    const h = mount(Array.from({ length: 4 }, () => att(SLOW, true, 0)));
    expect(h.widths()).toEqual(['80%', '0%', '20%']);
    h.unmount();
  });

  it('renders a miss as amber, never as the grey remainder', () => {
    const h = mount([
      ...Array.from({ length: 4 }, () => att(SLOW, true, 0)),
      att(FAST, false, 0),
    ]);
    expect(h.widths()).toEqual(['80%', '20%', '0%']);
    h.unmount();
  });

  it('orders ticks oldest first', () => {
    // ASYMMETRIC — a palindrome reads the same reversed.
    const h = mount([
      att(SLOW, true, 0), att(SLOW, false, 1), att(SLOW, false, 2),
    ]);
    expect(h.ticks().slice(0, 3).map(t => t.dataset.outcome))
      .toEqual(['wrong', 'wrong', 'right']);
    h.unmount();
  });
});

describe('the label reads the bar’s source', () => {
  it('counts attempts rather than denying them', () => {
    const h = mount([att(SLOW, true, 0), att(SLOW, true, 0)]);
    expect(h.text()).toContain('2 of 5 attempts — 3 more to rate');
    expect(h.text()).not.toContain('no data yet — needs');
    h.unmount();
  });
});
