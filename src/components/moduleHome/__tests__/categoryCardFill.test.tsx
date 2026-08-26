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
import CategoryCardGrid, { CARD_MIN_WIDTH } from '../CategoryCardGrid';
import type { CategoryCardModel } from '../model';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const model = (over: Partial<CategoryCardModel> = {}): CategoryCardModel => ({
  key: 'k', label: 'intervals', itemCount: 25, countDetail: null,
  description: null, itemsSeen: 0, lastPracticedDaysAgo: null,
  accuracy: { window: [], rollingCorrect: 0, rollingTotal: 0, tier: 'untouched' },
  ...over,
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

  it('has a floor but no fixed height', () => {
    // The row's tallest card still sets that row's height — a `h-[N]`
    // would be a number to keep in step with the content. The MINIMUM
    // is different: it stops the same card looking shorter on one
    // module home than another, and it lives here so no page can pick
    // its own.
    const el = mount(<CategoryCard card={model()} accentHex="#5a8752" expanded={false} onToggle={() => {}} onDrill={() => {}} now={0} />);
    const c = card(el) as HTMLElement;
    // Anchored on a class boundary: `\bh-\[` also matches inside
    // `min-h-[…]`, which would make this assertion contradict the next.
    expect(c.className).not.toMatch(/(?:^|\s)h-\[/);
    expect(c.className).toMatch(/\bmin-h-/);
    expect(c.style.height).toBe('');
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

  it('sizes its columns from the card, not from a breakpoint', () => {
    // The one number is the card's minimum width; the column count
    // falls out of it. A page cannot narrow the grid because the page
    // no longer says anything about width.
    const el = mount(
      <CategoryCardGrid
        cards={[model({ key: 'a' }), model({ key: 'b' })]}
        moduleId="ear-training"
        onDrill={() => {}}
        now={0}
      />,
    );
    const grid = el.querySelector('[data-testid="category-card-grid"]') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toContain('auto-fill');
    expect(grid.style.gridTemplateColumns).toContain(CARD_MIN_WIDTH);
    expect(grid.className).not.toMatch(/max-w-/);
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

/**
 * The tint boundary sits at one height, whatever the header says.
 *
 * SAME CAVEAT AS ABOVE: jsdom has no layout engine, so none of this
 * measures a rendered pixel. What it pins is the MECHANISM — that the
 * header's height is written down rather than produced by its content,
 * and that the count is out of the flow that counts lines. Whether the
 * bars actually line up across a row is Silas's eye.
 */
describe('the header cannot be grown by its own content', () => {
  const titleBlock = (el: HTMLElement) =>
    el.querySelector('[data-testid="category-card-title-block"]') as HTMLElement;
  const count = (el: HTMLElement) =>
    el.querySelector('[data-testid="category-card-count"]') as HTMLElement;

  const SHORT = 'tritone pairs';
  const LONG = 'named notes across keys and then some more words still';

  it('gives the title block the same written height, short name or long', () => {
    const short = mount(
      <CategoryCard card={model({ label: SHORT })} accentHex="#5a8752" expanded={false}
        onToggle={() => {}} onDrill={() => {}} now={0} />,
    );
    const shortHeight = titleBlock(short).style.height;
    act(() => root?.unmount());
    container?.remove();

    const long = mount(
      <CategoryCard card={model({ label: LONG })} accentHex="#5a8752" expanded={false}
        onToggle={() => {}} onDrill={() => {}} now={0} />,
    );
    expect(titleBlock(long).style.height).toBe(shortHeight);
    // WRITTEN, not produced: an empty string would mean the content is
    // still sizing it and this test would pass on the old markup.
    expect(shortHeight).not.toBe('');
  });

  it('clips a third line rather than letting it push the boundary', () => {
    const el = mount(
      <CategoryCard card={model({ label: LONG })} accentHex="#5a8752" expanded={false}
        onToggle={() => {}} onDrill={() => {}} now={0} />,
    );
    expect(titleBlock(el).className).toContain('overflow-hidden');
  });

  it('takes the count out of the line flow, at the top right', () => {
    // FLOATED, so a long name wraps UNDER it instead of pushing it to a
    // line of its own. `ml-auto` in a flex row — what was here — is the
    // implementation that wraps.
    const el = mount(
      <CategoryCard card={model({ label: LONG })} accentHex="#5a8752" expanded={false}
        onToggle={() => {}} onDrill={() => {}} now={0} />,
    );
    expect(count(el).className).toContain('float-right');
    expect(count(el).className).not.toContain('ml-auto');
    // And it is inside the block whose height is fixed, so it cannot
    // add to any height at all.
    expect(titleBlock(el).contains(count(el))).toBe(true);
  });

  it('reserves the countDetail line on a card that has none', () => {
    // The asymmetry that made ear training's two top cards differ.
    const withDetail = mount(
      <CategoryCard card={model({ countDetail: '12 due' })} accentHex="#5a8752" expanded={false}
        onToggle={() => {}} onDrill={() => {}} now={0} />,
    );
    const lines = (el: HTMLElement) =>
      [...card(el).querySelectorAll('[style*="min-height"]')].map(
        n => (n as HTMLElement).style.minHeight,
      );
    const a = lines(withDetail);
    act(() => root?.unmount());
    container?.remove();

    const without = mount(
      <CategoryCard card={model({ countDetail: null })} accentHex="#5a8752" expanded={false}
        onToggle={() => {}} onDrill={() => {}} now={0} />,
    );
    expect(lines(without)).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
  });

  it('does not read its height from the module it is drawn for', () => {
    // NO PER-MODULE VALUE. Two different accents, one written height.
    const a = mount(
      <CategoryCard card={model()} accentHex="#5a8752" expanded={false}
        onToggle={() => {}} onDrill={() => {}} now={0} />,
    );
    const h = titleBlock(a).style.height;
    act(() => root?.unmount());
    container?.remove();

    const b = mount(
      <CategoryCard card={model()} accentHex="#7a5aa8" expanded={false}
        onToggle={() => {}} onDrill={() => {}} now={0} />,
    );
    expect(titleBlock(b).style.height).toBe(h);
  });
});
