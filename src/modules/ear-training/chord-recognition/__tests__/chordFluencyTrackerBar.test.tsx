// @vitest-environment jsdom
/**
 * The chord tracker draws the shared bar, and feeds it real intervals.
 *
 * The defect being migrated away from: width came from accuracy and
 * colour from tier, so four correct answers painted an 80%-wide bar in
 * `untouched` grey. And the label beside it said "no data yet" while
 * holding those four.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { AttemptRecord, ChordData } from '../../../../lib/db';
import ChordFluencyTracker from '../ChordFluencyTracker';
import { tickOpacity } from '../../../../lib/progressBar';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

/** Two chords with DIFFERENT spacing intervals — the whole point of
 *  the wiring. One item cannot tell a real interval from a constant. */
const INTERVALS = new Map<string, number>([
  ['maj', 30],   // long interval: reps stay solid
  ['min', 2],    // short interval: the same reps read stale
]);

vi.mock('../../../../lib/useSpacingIntervals', async (orig) => {
  const actual = await orig<typeof import('../../../../lib/useSpacingIntervals')>();
  return { ...actual, useSpacingIntervals: () => INTERVALS };
});
vi.mock('../../useEtCurations', () => ({ useEtCurationsLive: () => new Map() }));
vi.mock('../../useEtSelection', () => ({
  useEtSelection: () => ({
    active: false, selected: new Set(), toggle: () => {},
    clear: () => {}, setActive: () => {},
  }),
}));

const chord = (id: string, name: string): ChordData => ({
  id, name, tier: 'foundational', family: 'major',
  intervals: [0, 4, 7], formula: '1 3 5', soundDefault: 'x',
  correct: 0, total: 0,
} as ChordData);

const att = (itemId: string, correct: boolean, daysAgo: number): AttemptRecord => ({
  moduleId: 'chord-recognition', itemId, correct,
  timestamp: NOW - daysAgo * DAY,
});

function mount(attempts: AttemptRecord[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ChordFluencyTracker
        chords={[chord('maj', 'Major'), chord('min', 'Minor')]}
        attempts={attempts}
      />,
    );
  });
  const barFor = (name: string) => {
    const bar = [...container.querySelectorAll('[role="progressbar"]')]
      .find(b => (b.getAttribute('aria-label') ?? '').startsWith(name));
    if (!bar) throw new Error(`no bar for ${name}`);
    return bar;
  };
  return {
    container,
    widthsFor: (name: string) =>
      [...barFor(name).querySelectorAll('div')].map(d => (d as HTMLElement).style.width),
    ticksFor: (name: string) => {
      const strip = barFor(name).parentElement!.parentElement!
        .querySelector('[role="img"]')!;
      return [...strip.querySelectorAll('[data-tick]')] as HTMLElement[];
    },
    text: () => container.textContent ?? '',
    unmount: () => { act(() => { root.unmount(); }); container.remove(); },
  };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
});

describe('the bar is the shared one', () => {
  it('draws three segments, not one width-and-a-tier', () => {
    const h = mount([
      att('maj', true, 0), att('maj', true, 0),
      att('maj', true, 0), att('maj', true, 0),
    ]);
    // Four right, one to go: green and grey, no amber. The old bar
    // painted this 80% wide in untouched grey.
    expect(h.widthsFor('Major')).toEqual(['80%', '0%', '20%']);
    h.unmount();
  });

  it('renders a wrong answer as amber, never as the grey remainder', () => {
    const h = mount([
      att('maj', true, 0), att('maj', true, 0), att('maj', true, 0),
      att('maj', false, 0), att('maj', true, 0),
    ]);
    expect(h.widthsFor('Major')).toEqual(['80%', '20%', '0%']);
    h.unmount();
  });
});

describe('the label and the bar read one source', () => {
  it('says how many of how many, not "no data yet"', () => {
    const h = mount([att('maj', true, 0), att('maj', true, 0)]);
    expect(h.text()).toContain('2 of 5 attempts — 3 more to rate');
    expect(h.text()).not.toContain('no data yet — needs');
    h.unmount();
  });

  it('pins the pairing of count to string', () => {
    for (const [n, expected] of [
      [1, '1 of 5 attempts — 4 more to rate'],
      [4, '4 of 5 attempts — 1 more to rate'],
    ] as const) {
      const h = mount(Array.from({ length: n }, () => att('maj', true, 0)));
      expect(h.text()).toContain(expected);
      h.unmount();
    }
  });

  it('keeps "no data yet" for genuinely zero attempts', () => {
    const h = mount([]);
    expect(h.text()).toContain('no data yet');
    expect(h.text()).not.toContain('of 5 attempts');
    h.unmount();
  });
});

describe('each item fades on ITS OWN interval', () => {
  it('gives two items with different intervals different opacities', () => {
    // THE TEST A SINGLE ITEM CANNOT DO. Same age, same outcome, two
    // intervals — a hardcoded constant makes these identical.
    const h = mount([att('maj', true, 4), att('min', true, 4)]);
    const longInterval = Number(h.ticksFor('Major')[0].style.opacity);
    const shortInterval = Number(h.ticksFor('Minor')[0].style.opacity);
    expect(longInterval).toBeGreaterThan(shortInterval);
    expect(longInterval).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 30), 2);
    expect(shortInterval).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 2), 2);
    h.unmount();
  });

  it('orders ticks oldest first, matching the bar', () => {
    // ASYMMETRIC: right/wrong/wrong reads differently reversed.
    const h = mount([
      att('maj', true, 0), att('maj', false, 1), att('maj', false, 2),
    ]);
    const outcomes = h.ticksFor('Major').slice(0, 3).map(t => t.dataset.outcome);
    expect(outcomes).toEqual(['wrong', 'wrong', 'right']);
    h.unmount();
  });
});
