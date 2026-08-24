// @vitest-environment jsdom
/**
 * The scales & modes tracker draws the shared bar, twice per row.
 *
 * Scale recognition and vamp recognition are separately scheduled
 * sub-skills of one mode, so each fades on its OWN interval — a single
 * interval for the row would age the rarer one at the commoner's rate.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { AttemptRecord } from '../../../../lib/db';
import FluencyTracker from '../FluencyTracker';
import { tickOpacity } from '../../../../lib/progressBar';
import { scaleItemId, vampItemId } from '../shared';
import { sortModes } from '../catalog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
// The tracker SORTS, so the first row on screen is not MODES[0]. Bars
// are addressed by mode name, which is also what a screen reader gets.
const MODE = sortModes('brightness')[0];

/** The two sub-skills of ONE mode, on different schedules. */
const INTERVALS = new Map<string, number>([
  [scaleItemId(MODE), 30],
  [vampItemId(MODE), 2],
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

const att = (itemId: string, correct: boolean, daysAgo: number): AttemptRecord => ({
  moduleId: 'scales-modes', itemId, correct, timestamp: NOW - daysAgo * DAY,
});

function mount(attempts: AttemptRecord[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<FluencyTracker attempts={attempts} sort="brightness" />);
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

describe('the shared bar, per sub-skill', () => {
  it('draws three segments for scale recognition', () => {
    const h = mount(Array.from({ length: 4 }, () =>
      att(scaleItemId(MODE), true, 0)));
    expect(h.widthsFor(`${MODE.name} scale recognition`)).toEqual(['80%', '0%', '20%']);
    h.unmount();
  });

  it('renders a miss as amber, not as the grey remainder', () => {
    const h = mount([
      ...Array.from({ length: 4 }, () => att(scaleItemId(MODE), true, 0)),
      att(scaleItemId(MODE), false, 0),
    ]);
    expect(h.widthsFor(`${MODE.name} scale recognition`)).toEqual(['80%', '20%', '0%']);
    h.unmount();
  });
});

describe('the label reads the bar’s own source', () => {
  it('counts attempts instead of claiming there are none', () => {
    const h = mount([att(scaleItemId(MODE), true, 0), att(scaleItemId(MODE), true, 0)]);
    expect(h.text()).toContain('2 of 5 attempts — 3 more to rate');
    expect(h.text()).not.toContain('no data — needs');
    h.unmount();
  });

  it('keeps a no-data state at genuinely zero', () => {
    const h = mount([]);
    expect(h.text()).toContain('no data yet');
    h.unmount();
  });
});

describe('the two sub-skills fade on their own intervals', () => {
  it('gives the same-aged rep different opacities per sub-skill', () => {
    // A single interval for the row makes these identical.
    const h = mount([
      att(scaleItemId(MODE), true, 4),
      att(vampItemId(MODE), true, 4),
    ]);
    const scale = Number(h.ticksFor(`${MODE.name} scale recognition`)[0].style.opacity);
    const vamp = Number(h.ticksFor(`${MODE.name} vamp recognition`)[0].style.opacity);
    expect(scale).toBeGreaterThan(vamp);
    expect(scale).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 30), 2);
    expect(vamp).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 2), 2);
    h.unmount();
  });

  it('orders ticks oldest first', () => {
    // ASYMMETRIC — a palindrome reads the same reversed.
    const h = mount([
      att(scaleItemId(MODE), true, 0),
      att(scaleItemId(MODE), false, 1),
      att(scaleItemId(MODE), false, 2),
    ]);
    expect(h.ticksFor(`${MODE.name} scale recognition`).slice(0, 3).map(t => t.dataset.outcome))
      .toEqual(['wrong', 'wrong', 'right']);
    h.unmount();
  });
});
