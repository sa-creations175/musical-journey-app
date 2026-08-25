// @vitest-environment jsdom
/**
 * The card fills the height its row gives it.
 *
 * =====================================================================
 * WHAT THIS CAN AND CANNOT SHOW.
 *
 * jsdom has NO LAYOUT ENGINE. It does not run CSS grid, it does not
 * resolve `stretch`, and every `offsetHeight` here is 0. So nothing
 * below claims two cards are the same height or that a strip is gone —
 * those are for the app, on a real screen.
 *
 * What it pins is the MECHANISM the fix rests on: the card is a flex
 * COLUMN and the region under the header is the one that GROWS, so the
 * slack a stretched row hands the shorter card lands inside the tinted
 * area instead of below it. If someone drops `flex-col`, or moves
 * `grow` onto the header, the white strip comes back — and that is what
 * these catch.
 *
 * They also pin the asymmetry that made it visible: a card WITH a
 * `countDetail` line renders more lines than one without, which is why
 * ear training's two top cards differ at all.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import CategoryCard from '../CategoryCard';
import CategoryCardGrid from '../CategoryCardGrid';
import type { CategoryCardModel } from '../model';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const model = (over: Partial<CategoryCardModel> = {}): CategoryCardModel => ({
  key: 'k', label: 'intervals', itemCount: 25, countDetail: null,
  description: null, window: [], rollingCorrect: 0, rollingTotal: 0,
  tier: 'untouched', itemsSeen: 0, lastPracticedDaysAgo: null, ...over,
});

function mount(node: React.ReactNode): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(node); });
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null;
});

const card = (el: HTMLElement) => el.querySelector('[data-testid="category-card"]')!;
/** The region under the header — the one that must absorb the slack. */
const barRegion = (el: HTMLElement) =>
  card(el).querySelector('[data-testid="category-card-toggle"]')!.nextElementSibling!;

describe('the card is a column', () => {
  it('stacks as flex, so the slack can be placed rather than falling to the bottom', () => {
    const el = mount(<CategoryCard card={model()} accentHex="#5a8752" expanded={false} onToggle={() => {}} onDrill={() => {}} now={0} />);
    const cls = card(el).className;
    expect(cls).toContain('flex');
    expect(cls).toContain('flex-col');
  });

  it('grows the region under the header, not the header', () => {
    const el = mount(<CategoryCard card={model()} accentHex="#5a8752" expanded={false} onToggle={() => {}} onDrill={() => {}} now={0} />);
    expect(barRegion(el).className).toContain('grow');
    // The header must NOT grow: its tint would stretch and the bar
    // would be pinned to the bottom edge, which is the same defect
    // upside down.
    const header = card(el).querySelector('[data-testid="category-card-toggle"]')!;
    expect(header.className).not.toContain('grow');
  });

  it('keeps the tint on the region that grows, while collapsed', () => {
    // The slack is only invisible if what fills it is the same colour
    // as what surrounds it.
    const el = mount(<CategoryCard card={model()} accentHex="#5a8752" expanded={false} onToggle={() => {}} onDrill={() => {}} now={0} />);
    expect((barRegion(el) as HTMLElement).style.backgroundColor).not.toBe('');
  });

  it('carries no written-down height', () => {
    // The row's tallest card sets the height. A `h-[N]` or a min-height
    // here would be a number to keep in step with the content.
    const el = mount(<CategoryCard card={model()} accentHex="#5a8752" expanded={false} onToggle={() => {}} onDrill={() => {}} now={0} />);
    const c = card(el) as HTMLElement;
    expect(c.className).not.toMatch(/\bh-\[/);
    expect(c.className).not.toMatch(/\bmin-h-/);
    expect(c.style.height).toBe('');
    expect(c.style.minHeight).toBe('');
  });
});

describe('why two cards in a row differ at all', () => {
  it('a countDetail line is an extra line the other card does not have', () => {
    // Ear training's intervals card has one (`intervalCountSummary`);
    // chord recognition passes null. That difference is the whole
    // source of the slack.
    const withDetail = mount(
      <CategoryCard card={model({ countDetail: '25 rows across 13 intervals' })} accentHex="#5a8752" expanded={false} onToggle={() => {}} onDrill={() => {}} now={0} />,
    );
    expect(withDetail.textContent).toContain('25 rows across 13 intervals');
    act(() => root!.unmount());
    container!.remove();

    const without = mount(
      <CategoryCard card={model()} accentHex="#5a8752" expanded={false} onToggle={() => {}} onDrill={() => {}} now={0} />,
    );
    expect(without.textContent).not.toContain('25 rows across 13 intervals');
  });

  it('the grid still lets the row decide the height', () => {
    // No `items-start`, which would collapse each card to its content
    // and take the shared height away entirely.
    const el = mount(
      <CategoryCardGrid
        cards={[model({ key: 'a' }), model({ key: 'b', countDetail: 'a second line' })]}
        moduleId="ear-training"
        onDrill={() => {}}
        now={0}
      />,
    );
    const grid = el.querySelector('[data-testid="category-card-grid"]')!;
    expect(grid.className).toContain('grid');
    expect(grid.className).not.toContain('items-start');
    expect(grid.querySelectorAll('[data-testid="category-card"]')).toHaveLength(2);
  });
});
