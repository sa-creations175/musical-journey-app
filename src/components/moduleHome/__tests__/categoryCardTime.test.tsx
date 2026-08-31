// @vitest-environment jsdom
/**
 * The two lines that replaced the per-hand bars.
 *
 * =====================================================================
 * `4d ago · 7m` READS AS ONE FACT, AND IT IS TWO.
 *
 * A time and a date on one line say that all seven of those minutes
 * happened four days ago. They are different measurements — everything
 * ever spent, and when it was last touched — so each gets a line and a
 * label:
 *
 *     Total time 7m — 5m practice, 2m testing
 *     Last practiced 4d ago
 *
 * **Total time** is the phrase Progress Details uses one level down.
 * One word for one thing, not a second name per surface.
 *
 * =====================================================================
 * AND THE BARS ARE GONE.
 *
 * Three of them, L / R / BOTH, drawn in the shape the accuracy modules
 * use, measuring coverage per hand. Nothing on the card said which of
 * those it was, and nobody could tell what they meant.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import CategoryCard from '../CategoryCard';
import type { CategoryCardModel } from '../model';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const model = (over: Partial<CategoryCardModel> = {}): CategoryCardModel => ({
  key: 'scales', label: 'scales', itemCount: 96, countDetail: null,
  description: null, itemsSeen: 0, lastPracticedDaysAgo: null,
  // Shapes & Patterns records a duration and a self-rating, never
  // right/wrong — so no window, no tier, no bar.
  accuracy: null,
  ...over,
});

function mount(over: Partial<CategoryCardModel> = {}): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <CategoryCard
        card={model(over)}
        accentHex="#7c3aed"
        expanded={false}
        onToggle={() => {}}
        onDrill={() => {}}
        now={1_800_000_000_000}
      />,
    );
  });
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null;
});

const text = () => (container?.textContent ?? '').replace(/\s+/g, ' ');

describe('the card says how long, and when, on two lines', () => {
  it('labels the total and splits practice from testing', () => {
    mount({
      timeInvested: { practiceSeconds: 300, testingSeconds: 120 },
      lastPracticedDaysAgo: 4,
    });
    expect(text()).toContain('Total time 7m — 5m practice, 2m testing');
  });

  it('and labels when it was last touched, on its OWN line', () => {
    const el = mount({
      timeInvested: { practiceSeconds: 300, testingSeconds: 120 },
      lastPracticedDaysAgo: 4,
    });
    expect(text()).toContain('Last practiced 4d ago');
    // Two lines, not one — the whole point. `7m` must not sit beside
    // `4d ago` where it reads as when those minutes happened.
    const time = el.querySelector('[data-testid="category-card-time"]');
    const last = el.querySelector('[data-testid="category-card-last-practiced"]');
    expect(time).not.toBeNull();
    expect(last).not.toBeNull();
    expect(time!.parentElement).not.toBe(last!.parentElement);
  });

  it('a section never practised shows the total and no date', () => {
    mount({
      timeInvested: { practiceSeconds: 60, testingSeconds: 0 },
      lastPracticedDaysAgo: null,
    });
    expect(text()).toContain('Total time 1m');
    expect(text()).not.toContain('Last practiced');
  });

  it('ABSENT, NOT ZERO — a section with nothing logged shows no time', () => {
    mount({ lastPracticedDaysAgo: 4 });
    expect(text()).not.toContain('Total time');
  });
});

describe('the per-hand bars are gone', () => {
  it('no bars are drawn, whatever the card carries', () => {
    const el = mount({
      timeInvested: { practiceSeconds: 300, testingSeconds: 120 },
      lastPracticedDaysAgo: 4,
      fluentPlus: 12,
    });
    expect(el.querySelector('[data-testid="category-card-bars"]')).toBeNull();
    expect(el.querySelector('[data-testid="category-card-bar"]')).toBeNull();
    expect(text()).not.toMatch(/\bBOTH\b/);
  });
});

describe('no retired word appears', () => {
  it('the numerator reads Fluent+, not acquired', () => {
    mount({ fluentPlus: 12, itemCount: 96 });
    expect(text()).toContain('12 of 96 Fluent+');
    expect(text()).not.toContain('acquired');
    expect(text()).not.toContain('Acquired');
    expect(text()).not.toContain('In Progress');
    expect(text()).not.toContain('Not Started');
  });

  it('and a module with no such rule still reads seen/total', () => {
    // Absent means "seen and total are the same question here", which
    // is every module but this one.
    mount({ itemsSeen: 7, itemCount: 25 });
    expect(text()).toContain('7/25');
    expect(text()).not.toContain('Fluent+');
  });
});
