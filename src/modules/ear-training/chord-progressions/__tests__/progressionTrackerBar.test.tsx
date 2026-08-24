// @vitest-environment jsdom
/**
 * The progressions tracker draws the shared bar at six call sites.
 *
 * They all route through one `StatRow`, which reads its interval from
 * a context with NO DEFAULT — a missed provider throws rather than
 * rendering solid ticks that look entirely correct.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { AttemptRecord } from '../../../../lib/db';
import ProgressionFluencyTracker from '../ProgressionFluencyTracker';
import { tickOpacity } from '../../../../lib/progressBar';
import { PROGRESSIONS } from '../catalog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const PROG = PROGRESSIONS[0];

/** Two sub-skills of ONE progression, separately scheduled. */
const INTERVALS = new Map<string, number>([
  [PROG.id, 30],
  [`${PROG.id}-pattern`, 2],
]);

vi.mock('../../../../lib/useSpacingIntervals', async (orig) => {
  const actual = await orig<typeof import('../../../../lib/useSpacingIntervals')>();
  return { ...actual, useSpacingIntervals: () => INTERVALS };
});
vi.mock('../../useEtCurations', () => ({ useEtCurationsLive: () => new Map() }));
vi.mock('../../useEtSelection', () => ({
  useEtSelection: () => ({
    active: false, selected: new Set(), toggle: () => {},
    clear: () => {}, exit: () => {}, setActive: () => {},
  }),
}));

const att = (itemId: string, correct: boolean, daysAgo: number): AttemptRecord => ({
  moduleId: 'chord-progressions', itemId, correct, timestamp: NOW - daysAgo * DAY,
});

function mount(attempts: AttemptRecord[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<ProgressionFluencyTracker attempts={attempts} />); });
  const barFor = (label: string) => {
    const bar = [...container.querySelectorAll('[role="progressbar"]')]
      .find(b => (b.getAttribute('aria-label') ?? '').startsWith(label));
    if (!bar) throw new Error(`no bar for ${label}`);
    return bar;
  };
  return {
    widthsFor: (l: string) =>
      [...barFor(l).querySelectorAll('div')].map(d => (d as HTMLElement).style.width),
    ticksFor: (l: string) =>
      [...barFor(l).parentElement!.parentElement!
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

const chordBar = `${PROG.name} chord accuracy`;
const patternBar = `${PROG.name} pattern recognition`;

describe('the shared bar', () => {
  it('draws three segments, with grey as unmade attempts', () => {
    const h = mount(Array.from({ length: 4 }, () => att(PROG.id, true, 0)));
    expect(h.widthsFor(chordBar)).toEqual(['80%', '0%', '20%']);
    h.unmount();
  });

  it('renders a miss as amber, never as the grey remainder', () => {
    const h = mount([
      ...Array.from({ length: 4 }, () => att(PROG.id, true, 0)),
      att(PROG.id, false, 0),
    ]);
    expect(h.widthsFor(chordBar)).toEqual(['80%', '20%', '0%']);
    h.unmount();
  });
});

describe('the label reads the bar’s source', () => {
  it('counts attempts rather than denying them', () => {
    const h = mount([att(PROG.id, true, 0), att(PROG.id, true, 0)]);
    expect(h.text()).toContain('2 of 5 attempts — 3 more to rate');
    expect(h.text()).not.toContain('no data yet — needs');
    h.unmount();
  });
});

describe('each sub-skill fades on its own interval', () => {
  it('gives the same-aged rep different opacities per sub-skill', () => {
    const h = mount([
      att(PROG.id, true, 4),
      att(`${PROG.id}-pattern`, true, 4),
    ]);
    const chord = Number(h.ticksFor(chordBar)[0].style.opacity);
    const pattern = Number(h.ticksFor(patternBar)[0].style.opacity);
    expect(chord).toBeGreaterThan(pattern);
    expect(chord).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 30), 2);
    expect(pattern).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 2), 2);
    h.unmount();
  });

  it('pairs each window with its OWN item, not a neighbour’s', () => {
    // itemId travels with the stats precisely so six call sites cannot
    // pair one item's numbers with another's interval.
    const h = mount([
      att(PROG.id, true, 0), att(PROG.id, true, 0),
      att(`${PROG.id}-pattern`, false, 0),
    ]);
    expect(h.widthsFor(chordBar)).toEqual(['40%', '0%', '60%']);
    expect(h.widthsFor(patternBar)).toEqual(['0%', '20%', '80%']);
    h.unmount();
  });

  it('orders ticks oldest first', () => {
    // ASYMMETRIC — a palindrome reads the same reversed.
    const h = mount([
      att(PROG.id, true, 0), att(PROG.id, false, 1), att(PROG.id, false, 2),
    ]);
    expect(h.ticksFor(chordBar).slice(0, 3).map(t => t.dataset.outcome))
      .toEqual(['wrong', 'wrong', 'right']);
    h.unmount();
  });
});
