// @vitest-environment jsdom
/**
 * The intervals tracker draws the shared bar, once per DIRECTION.
 *
 * Ascending and descending are separately scheduled — the drill writes
 * `${id}:asc` and `${id}:desc` as distinct spacing rows — so each gets
 * its own strip with its own ages. A test on one direction passes on a
 * component that renders the same strip twice.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { AttemptRecord, IntervalData } from '../../../../lib/db';
import FluencyTracker from '../FluencyTracker';
import { tickOpacity } from '../../../../lib/progressBar';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

/** ONE interval, TWO directions, DIFFERENT schedules. */
const INTERVALS = new Map<string, number>([
  ['P5:asc', 30],
  ['P5:desc', 2],
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

const iv: IntervalData = {
  id: 'P5', name: 'Perfect 5th', semitones: 7,
  ascAnchorDefault: 'Star Wars', descAnchorDefault: 'Flintstones',
  ascCorrect: 0, ascTotal: 0, descCorrect: 0, descTotal: 0,
};

const att = (
  direction: 'asc' | 'desc', correct: boolean, daysAgo: number,
): AttemptRecord => ({
  moduleId: 'intervals', itemId: 'P5', direction, correct,
  timestamp: NOW - daysAgo * DAY,
});

function mount(attempts: AttemptRecord[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<FluencyTracker intervals={[iv]} attempts={attempts} />);
  });
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

const ASC = 'Perfect 5th ascending';
const DESC = 'Perfect 5th descending';

describe('two directions, two bars', () => {
  it('gives each direction its OWN segments', () => {
    // Four right ascending, one wrong descending. A component
    // rendering one strip twice shows the same widths in both.
    const h = mount([
      ...Array.from({ length: 4 }, () => att('asc', true, 0)),
      att('desc', false, 0),
    ]);
    expect(h.widthsFor(ASC)).toEqual(['80%', '0%', '20%']);
    expect(h.widthsFor(DESC)).toEqual(['0%', '20%', '80%']);
    h.unmount();
  });

  it('gives each direction its OWN strip contents', () => {
    const h = mount([att('asc', true, 0), att('desc', false, 0)]);
    expect(h.ticksFor(ASC)[0].dataset.outcome).toBe('right');
    expect(h.ticksFor(DESC)[0].dataset.outcome).toBe('wrong');
    h.unmount();
  });
});

describe('each direction fades on its own interval', () => {
  it('ages the same-dated rep differently per direction', () => {
    // THE ONE-DIRECTION TEST CANNOT SEE THIS. Same interval, same age,
    // same outcome — only the schedule differs.
    const h = mount([att('asc', true, 4), att('desc', true, 4)]);
    const asc = Number(h.ticksFor(ASC)[0].style.opacity);
    const desc = Number(h.ticksFor(DESC)[0].style.opacity);
    expect(asc).toBeGreaterThan(desc);
    expect(asc).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 30), 2);
    expect(desc).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 2), 2);
    h.unmount();
  });

  it('orders each direction’s ticks oldest first', () => {
    // ASYMMETRIC per direction, and different between them, so a
    // strip rendered twice or reversed cannot match.
    const h = mount([
      att('asc', true, 0), att('asc', false, 1), att('asc', false, 2),
      att('desc', false, 0), att('desc', true, 1), att('desc', true, 2),
    ]);
    expect(h.ticksFor(ASC).slice(0, 3).map(t => t.dataset.outcome))
      .toEqual(['wrong', 'wrong', 'right']);
    expect(h.ticksFor(DESC).slice(0, 3).map(t => t.dataset.outcome))
      .toEqual(['right', 'right', 'wrong']);
    h.unmount();
  });
});

describe('the label reads the bar’s source', () => {
  it('counts attempts per direction rather than denying them', () => {
    const h = mount([att('asc', true, 0), att('asc', true, 0)]);
    expect(h.text()).toContain('2 of 5 attempts — 3 more to rate');
    expect(h.text()).not.toContain('no data yet — needs');
    h.unmount();
  });
});
