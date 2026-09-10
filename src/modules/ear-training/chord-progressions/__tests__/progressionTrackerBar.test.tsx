// @vitest-environment jsdom
/**
 * The progressions tracker draws the shared bar at six call sites.
 *
 * They all route through one `StatRow`, which reads its interval from
 * a context with NO DEFAULT — a missed provider throws rather than
 * rendering solid ticks that look entirely correct.
 */
import { describe, expect, it, vi } from 'vitest';
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
const OTHER = PROGRESSIONS[1];

/** Where the Full Progression card files an attempt: one per position.
 *  The tracker reads these and nothing else since 10 Sep 2026. */
const ref = (id: string, position = 1) => `full-progression:${id}:pos${position}`;

/** Two PROGRESSIONS, separately scheduled. The two sub-skills of one
 *  row share an itemRef now — they are two readings of one attempt —
 *  so the rule that a window is paired with its own item is proved on
 *  a pair that really differs. */
const INTERVALS = new Map<string, number>([
  [ref(PROG.id), 30],
  [ref(OTHER.id), 2],
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

const att = (
  itemId: string, correct: boolean, daysAgo: number, feelRating?: 1 | 2 | 3 | 4,
): AttemptRecord => ({
  moduleId: 'chord-progressions', itemId, correct, timestamp: NOW - daysAgo * DAY,
  ...(feelRating === undefined ? {} : { feelRating }),
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

const chordBar = `${PROG.name} position accuracy`;
const namedBar = `${PROG.name} progression recognition`;
const otherBar = `${OTHER.name} position accuracy`;

describe('the shared bar', () => {
  it('draws three segments, with grey as unmade attempts', () => {
    const h = mount(Array.from({ length: 4 }, () => att(ref(PROG.id), true, 0)));
    expect(h.widthsFor(chordBar)).toEqual(['80%', '0%', '20%']);
    h.unmount();
  });

  it('renders a miss as amber, never as the grey remainder', () => {
    const h = mount([
      ...Array.from({ length: 4 }, () => att(ref(PROG.id), true, 0)),
      att(ref(PROG.id), false, 0),
    ]);
    expect(h.widthsFor(chordBar)).toEqual(['80%', '20%', '0%']);
    h.unmount();
  });
});

describe('the label reads the bar’s source', () => {
  it('counts attempts rather than denying them', () => {
    const h = mount([att(ref(PROG.id), true, 0), att(ref(PROG.id), true, 0)]);
    expect(h.text()).toContain('2 of 5 attempts — 3 more to rate');
    expect(h.text()).not.toContain('no data yet — needs');
    h.unmount();
  });
});

describe('each sub-skill fades on its own interval', () => {
  it('gives the same-aged rep different opacities per progression', () => {
    const h = mount([
      att(ref(PROG.id), true, 4),
      att(ref(OTHER.id), true, 4),
    ]);
    const mine = Number(h.ticksFor(chordBar)[0].style.opacity);
    const theirs = Number(h.ticksFor(otherBar)[0].style.opacity);
    expect(mine).toBeGreaterThan(theirs);
    expect(mine).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 30), 2);
    expect(theirs).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 2), 2);
    h.unmount();
  });

  it('pairs each window with its OWN item, not a neighbour’s', () => {
    // itemId travels with the stats precisely so six call sites cannot
    // pair one item's numbers with another's interval.
    const h = mount([
      att(ref(PROG.id), true, 0), att(ref(PROG.id), true, 0),
      att(ref(OTHER.id), false, 0),
    ]);
    expect(h.widthsFor(chordBar)).toEqual(['40%', '0%', '60%']);
    expect(h.widthsFor(otherBar)).toEqual(['0%', '20%', '80%']);
    h.unmount();
  });

  it('reads the position from the whole progression, one row per entry', () => {
    // THE CARD FILES ONE ATTEMPT PER POSITION and the row is about the
    // progression, so the row sums them.
    const h = mount([
      att(ref(PROG.id, 1), true, 0),
      att(ref(PROG.id, 2), true, 0),
      att(ref(PROG.id, 3), true, 0),
    ]);
    expect(h.widthsFor(chordBar)).toEqual(['60%', '0%', '40%']);
    h.unmount();
  });

  it('splits the progression from the position on the four-step rating', () => {
    // Working on it is the right progression from the wrong position:
    // it counts for what the reader named and not for where they placed
    // it. Struggled is the progression missed and counts for neither.
    const h = mount([
      att(ref(PROG.id), true, 0, 4),
      att(ref(PROG.id), false, 0, 2),
      att(ref(PROG.id), false, 0, 1),
    ]);
    expect(h.widthsFor(namedBar)).toEqual(['40%', '20%', '40%']);
    expect(h.widthsFor(chordBar)).toEqual(['20%', '40%', '40%']);
    h.unmount();
  });

  it('orders ticks oldest first', () => {
    // ASYMMETRIC — a palindrome reads the same reversed.
    const h = mount([
      att(ref(PROG.id), true, 0), att(ref(PROG.id), false, 1),
      att(ref(PROG.id), false, 2),
    ]);
    expect(h.ticksFor(chordBar).slice(0, 3).map(t => t.dataset.outcome))
      .toEqual(['wrong', 'wrong', 'right']);
    h.unmount();
  });
});

describe('the Chord Motion view', () => {
  it('shows no scaffolding breakdown, even over stored scaffolding rows', () => {
    // THE ROWS STILL EXIST — Chord Motion wrote `motion-mode:*` until
    // scaffolding retired on 10 Sep 2026 — so a breakdown reading them
    // would render a frozen split. Feed it some and look.
    const t = mount([
      att('motion-mode:full', true, 3),
      att('motion-mode:minimal', false, 3),
      att('motion:1-4-asc', true, 1),
    ]);
    const tab = [...document.querySelectorAll('button')]
      .find(b => b.textContent === 'Chord Motion');
    if (!tab) throw new Error('no Chord Motion tab');
    act(() => { tab.click(); });
    // Guard the guard: this IS the Chord Motion view.
    expect(t.text()).toMatch(/2nds — \d+ motions/);
    expect(t.text()).not.toMatch(/Scaffolding|scaffolding/);
    t.unmount();
  });
});
