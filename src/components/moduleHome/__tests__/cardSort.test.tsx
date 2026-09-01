// @vitest-environment jsdom
/**
 * The order the cards on a module home are in.
 *
 * =====================================================================
 * THE LADDER IS ASSERTED AGAINST `TIER_ORDER`, NOT AGAINST A LIST
 * TYPED HERE. A test carrying its own copy of the rungs would agree
 * with the code until the day the ladder moved, and then both would be
 * wrong together — which is the shape of the roll-up bug this codebase
 * already paid for once.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import CategoryCardGrid from '../CategoryCardGrid';
import {
  CARD_SORT_FIELD, CARD_SORT_ORDERS, resolveCardSort, sortCards,
} from '../cardSort';
import type { CategoryCardModel } from '../model';
import { TIER_ORDER, type Tier } from '../../../lib/tier';
import { db } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/** A card that shows a tier — harmonic fluency, ear training, reading. */
function tiered(key: string, tier: Tier, daysAgo: number | null): CategoryCardModel {
  return {
    key, label: key, itemCount: 10, countDetail: null, description: null,
    accuracy: { window: [], rollingCorrect: 0, rollingTotal: 0, tier },
    itemsSeen: 1,
    lastPracticedDaysAgo: daysAgo,
  };
}

/** A card that shows a Fluent+ share instead — Shapes & Patterns. */
function shaped(key: string, fluentPlus: number, daysAgo: number | null): CategoryCardModel {
  return {
    key, label: key, itemCount: 100, countDetail: null, description: null,
    accuracy: null, itemsSeen: fluentPlus, fluentPlus,
    lastPracticedDaysAgo: daysAgo,
  };
}

const keys = (cards: readonly CategoryCardModel[]) => cards.map(c => c.key);

describe('sorting by status', () => {
  it('runs in the ladder order the app already declares, lowest first', () => {
    // One card per rung, handed over in the ladder's own order (best
    // first) — so a sort that did nothing would fail.
    const cards = TIER_ORDER.map(t => tiered(t, t, 0));
    expect(keys(sortCards(cards, 'status')))
      .toEqual([...TIER_ORDER].reverse());
  });

  it('leads with the rung furthest from done', () => {
    const cards = [tiered('a', 'mastered', 0), tiered('b', 'untouched', 0)];
    expect(keys(sortCards(cards, 'status'))).toEqual(['b', 'a']);
  });

  it('ranks the cards that carry no rung by the share they show instead', () => {
    // Shapes & Patterns records a duration and a self-rating, so its
    // cards have no tier. What stands in its place is Fluent+ of the
    // section's targets.
    const cards = [shaped('a', 90, 0), shaped('b', 10, 0), shaped('c', 50, 0)];
    expect(keys(sortCards(cards, 'status'))).toEqual(['b', 'c', 'a']);
  });

  it('treats a section with no targets as nothing done', () => {
    const none: CategoryCardModel = {
      ...shaped('empty', 0, 0), itemCount: 0, fluentPlus: 0,
    };
    expect(keys(sortCards([shaped('some', 50, 0), none], 'status')))
      .toEqual(['empty', 'some']);
  });

  it('keeps the declared order between cards that stand at the same rung', () => {
    const cards = [
      tiered('first', 'developing', 0),
      tiered('second', 'developing', 0),
      tiered('third', 'developing', 0),
    ];
    expect(keys(sortCards(cards, 'status'))).toEqual(['first', 'second', 'third']);
  });
});

describe('sorting by last practiced', () => {
  it('leads with the longest ago', () => {
    const cards = [tiered('a', 'fluent', 1), tiered('b', 'fluent', 40), tiered('c', 'fluent', 7)];
    expect(keys(sortCards(cards, 'last-practiced'))).toEqual(['b', 'c', 'a']);
  });

  it('puts a card never practised at all in front of every one that has been', () => {
    // Never is longer ago than any number of days.
    const cards = [tiered('a', 'fluent', 400), tiered('b', 'untouched', null)];
    expect(keys(sortCards(cards, 'last-practiced'))).toEqual(['b', 'a']);
  });
});

describe('the declared order', () => {
  it('is the list itself, untouched', () => {
    const cards = [tiered('a', 'mastered', 30), tiered('b', 'untouched', 0)];
    expect(sortCards(cards, 'declared')).toBe(cards);
  });

  it('is what an unrecognised remembered value falls back to', () => {
    // The stored value is only ever a hint — same rule `resolveView`
    // follows, so renaming an order cannot leave a page unable to draw.
    expect(resolveCardSort('by-vibes')).toBe('declared');
    expect(resolveCardSort(null)).toBe('declared');
  });

  it('leads the control, so it is what an untouched page shows', () => {
    expect(CARD_SORT_ORDERS[0].id).toBe('declared');
  });
});

// ---------------------------------------------------------------------

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.userPrefs.clear();
});

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
}

const CARDS = [
  tiered('one', 'mastered', 1),
  tiered('two', 'untouched', 30),
  tiered('three', 'developing', 9),
];

async function render(sortable = true) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <CategoryCardGrid
        cards={CARDS}
        moduleId="harmonic-fluency"
        onDrill={() => {}}
        sortable={sortable}
        now={Date.now()}
      />,
    );
  });
  await settle();
  return container!;
}

const shownKeys = () =>
  [...container!.querySelectorAll('[data-card-key]')]
    .map(el => el.getAttribute('data-card-key'));

async function press(id: string) {
  const b = container!.querySelector(`[data-testid="card-sort-${id}"]`) as HTMLElement;
  await act(async () => { b.click(); });
  await settle();
}

describe('the control on a module home', () => {
  it('leaves the cards where the adapter put them until it is pressed', async () => {
    await render();
    expect(shownKeys()).toEqual(['one', 'two', 'three']);
    expect(
      (container!.querySelector('[data-testid="card-sort-declared"]'))
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('reflows the same grid', async () => {
    // Sorting changes the order, not the layout: the cards stay in the
    // one grid every module home lays them out in.
    const el = await render();
    await press('status');
    expect(shownKeys()).toEqual(['two', 'three', 'one']);
    expect(el.querySelectorAll('[data-testid="category-card-grid"]')).toHaveLength(1);
    expect(shownKeys()).toHaveLength(CARDS.length);
  });

  it('sorts by last practiced too', async () => {
    await render();
    await press('last-practiced');
    expect(shownKeys()).toEqual(['two', 'three', 'one']);
  });

  it('goes back to the declared order', async () => {
    await render();
    await press('status');
    await press('declared');
    expect(shownKeys()).toEqual(['one', 'two', 'three']);
  });

  it('remembers the choice through leaving the page and coming back', async () => {
    await render();
    await press('last-practiced');

    await act(async () => root!.unmount());
    container!.remove();
    await render();

    expect(shownKeys()).toEqual(['two', 'three', 'one']);
    expect(
      (container!.querySelector('[data-testid="card-sort-last-practiced"]'))
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('remembers it in the store the axis views already use', async () => {
    // ONE MECHANISM FOR A REMEMBERED DISPLAY CHOICE. A second stored
    // shape is a second thing to load and a second thing to go stale.
    await render();
    await press('status');
    const row = await db.userPrefs.get('moduleHome.axisViews');
    expect(row?.value).toMatchObject({ [CARD_SORT_FIELD]: 'status' });
  });

  it('is not drawn on a grid that was not given it', async () => {
    const el = await render(false);
    expect(el.querySelector('[data-testid="card-sort-status"]')).toBeNull();
    expect(shownKeys()).toEqual(['one', 'two', 'three']);
  });
});
