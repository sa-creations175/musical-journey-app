// @vitest-environment jsdom
/**
 * One renderer, rated or not — asserted through the DOM.
 *
 * The model tests pin the arithmetic. These pin that the component
 * actually draws all three segments from it, that the rated and
 * unrated bars go through the same path, and that the ⓘ text follows
 * the constants rather than being written out.
 */
import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import ProgressBar from '../ProgressBar';
import { MIN_ATTEMPTS_FOR_TIER } from '../../lib/tier';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function mount(attempts: Array<{ correct: boolean; timestamp: number }>, intervalDays = 7) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ProgressBar
        attempts={attempts}
        intervalDays={intervalDays}
        now={NOW}
        label="Perfect 5th ascending"
      />,
    );
  });
  const bar = container.querySelector('[role="progressbar"]')!;
  const widths = [...bar.querySelectorAll('div')]
    .map(d => (d as HTMLElement).style.width);
  return {
    container,
    bar,
    widths,
    ticks: () => [...container.querySelectorAll('[data-tick]')] as HTMLElement[],
    clickInfo: () => {
      const btn = container.querySelector('button')!;
      act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    },
    text: () => container.textContent ?? '',
    unmount: () => { act(() => { root.unmount(); }); container.remove(); },
  };
}

const rep = (correct: boolean, daysAgo: number) =>
  ({ correct, timestamp: NOW - daysAgo * DAY });

describe('the same renderer draws rated and unrated', () => {
  it('draws three segments whether rated or not', () => {
    const unrated = mount([rep(true, 0), rep(true, 0), rep(true, 0), rep(true, 0)]);
    expect(unrated.widths).toEqual(['80%', '0%', '20%']);
    unrated.unmount();

    const rated = mount([rep(true, 0), rep(true, 0), rep(true, 0), rep(true, 0), rep(false, 0)]);
    expect(rated.widths).toEqual(['80%', '20%', '0%']);
    rated.unmount();

    // Same three elements, same order, in both. Not two code paths.
    expect(unrated.widths).toHaveLength(3);
    expect(rated.widths).toHaveLength(3);
  });

  it('renders four right answers as a filled bar, not an empty one', () => {
    // The reported bug: below five attempts the tier is `untouched`,
    // so the bar painted grey at 80% width.
    const h = mount([rep(true, 0), rep(true, 0), rep(true, 0), rep(true, 0)]);
    expect(h.widths[0]).toBe('80%');       // green, not grey
    expect(h.widths[1]).toBe('0%');        // no amber — nothing was wrong
    h.unmount();
  });

  it('shows all three at once mid-way', () => {
    const h = mount([rep(true, 0), rep(true, 0), rep(true, 0), rep(false, 0)]);
    expect(h.widths).toEqual(['60%', '20%', '20%']);
    h.unmount();
  });
});

describe('the ticks fade individually', () => {
  it('gives two attempts of different ages different opacities', () => {
    const h = mount([rep(true, 0), rep(true, 60)]);
    const [first, second] = h.ticks();
    // Oldest leftmost: the 60-day-old rep is tick 0, today's is tick 1.
    expect(Number(first.style.opacity)).toBeLessThan(1);
    expect(Number(second.style.opacity)).toBe(1);
    h.unmount();
  });

  it('maps each tick to its own attempt, OLDEST first', () => {
    // ASYMMETRIC ON PURPOSE. A palindrome reads the same reversed, so
    // it would pass on a strip rendered in the wrong direction.
    // `rep` takes daysAgo, so this list is newest-first as callers
    // supply it; the strip must come out the other way round.
    const h = mount([rep(true, 0), rep(false, 1), rep(false, 2)]);
    const outcomes = h.ticks().slice(0, 3).map(t => t.dataset.outcome);
    expect(outcomes).toEqual(['wrong', 'wrong', 'right']);
    h.unmount();
  });

  it('leaves the BAR unfaded while ticks fade', () => {
    // If everything dims, nothing reads as dimmed.
    const h = mount([rep(true, 90), rep(true, 90)]);
    const segments = [...h.bar.querySelectorAll('div')] as HTMLElement[];
    for (const s of segments) expect(s.style.opacity).toBe('');
    expect(Number(h.ticks()[0].style.opacity)).toBeLessThan(1);
    h.unmount();
  });
});

describe('a screen reader gets both', () => {
  it('gives the bar a role and a value', () => {
    const h = mount([rep(true, 0), rep(false, 0)]);
    expect(h.bar.getAttribute('role')).toBe('progressbar');
    expect(h.bar.getAttribute('aria-valuenow')).toBeTruthy();
    expect(h.bar.getAttribute('aria-label')).toContain('Perfect 5th ascending');
    expect(h.bar.getAttribute('aria-label')).toContain('more to be rated');
    h.unmount();
  });

  it('gives the strip its own label, because it says more than the bar', () => {
    const h = mount([rep(true, 0), rep(false, 1)]);
    const strip = h.container.querySelector('[role="img"]')!;
    expect(strip.getAttribute('aria-label'))
      .toContain('oldest first: wrong, right');
    h.unmount();
  });
});

describe('the ⓘ content is derived', () => {
  it('follows MIN_ATTEMPTS_FOR_TIER rather than a written number', () => {
    // Reads the constant at assert time. If the constant moves and the
    // copy is hand-written, this fails.
    const h = mount([rep(true, 0)]);
    h.clickInfo();
    expect(h.text()).toContain(`${MIN_ATTEMPTS_FOR_TIER} attempts`);
    h.unmount();
  });

  it('follows the item’s own interval', () => {
    const a = mount([rep(true, 0)], 7);
    a.clickInfo();
    expect(a.text()).toContain('7 days');
    a.unmount();

    const b = mount([rep(true, 0)], 21);
    b.clickInfo();
    expect(b.text()).toContain('21 days');
    b.unmount();
  });

  it('stays closed until asked', () => {
    const h = mount([rep(true, 0)]);
    expect(h.text()).not.toContain('Green is an answer');
    h.clickInfo();
    expect(h.text()).toContain('Green is an answer');
    h.unmount();
  });
});
