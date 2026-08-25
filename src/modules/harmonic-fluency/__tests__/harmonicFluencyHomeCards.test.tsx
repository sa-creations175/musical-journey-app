// @vitest-environment jsdom
/**
 * Harmonic fluency's category cards, and the case that forced the
 * per-tick interval.
 *
 * ---------------------------------------------------------------
 * A CARD HERE IS A CATEGORY, NOT AN ITEM.
 *
 * "Pentatonic scales" is 41 cards on 41 schedules. There is no single
 * interval for that card, and a median across items at 2-day and 30-day
 * intervals would describe neither while reading as a fact about every
 * rep in the strip.
 *
 * So each tick carries its own item's interval. A fixture where every
 * attempt shares an interval passes on the aggregate version — these
 * deliberately do not.
 *
 * REPLACES `harmonicFluencyTrackerBar.test.tsx`. The tracker rows this
 * pinned are now the cards; the assertions came across unchanged apart
 * from having to expand a card to reach the strip, which is itself the
 * behaviour 2a added.
 * ---------------------------------------------------------------
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { AttemptRecord } from '../../../lib/db';
import CategoryCardGrid, { NO_MODULE_ACCENT } from '../../../components/moduleHome/CategoryCardGrid';
import { harmonicFluencyCards } from '../homeCards';
import { tickOpacity } from '../../../lib/progressBar';
import { moduleMetaById } from '../../../lib/moduleMeta';
import { CATEGORY_LABELS, CATEGORY_ORDER, FLASHCARDS } from '../catalog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

/** Two items in ONE category, on very different schedules. */
const CAT = 'tritone-pairs' as const;
const ITEMS = FLASHCARDS.filter(c => c.category === CAT).slice(0, 2);
const SLOW = ITEMS[0].id;   // 30-day interval
const FAST = ITEMS[1].id;   // 2-day interval
const INTERVALS = new Map<string, number>([[SLOW, 30], [FAST, 2]]);

const att = (itemId: string, correct: boolean, daysAgo: number): AttemptRecord => ({
  moduleId: 'harmonic-fluency', itemId, correct, timestamp: NOW - daysAgo * DAY,
});

const ACCENT = moduleMetaById('harmonic-fluency')!.accentHex;

function mount(attempts: AttemptRecord[], drill?: (key: string) => void) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const cards = harmonicFluencyCards(attempts, INTERVALS, NOW);
  act(() => {
    root.render(
      <CategoryCardGrid
        cards={cards}
        moduleId="harmonic-fluency"
        onDrill={drill ?? (() => {})}
        now={NOW}
      />,
    );
  });
  const cardEl = () => container.querySelector(`[data-card-key="${CAT}"]`)!;
  const q = (sel: string) => cardEl().querySelector(sel) as HTMLElement | null;
  return {
    container,
    cardEl,
    expanded: () => cardEl().getAttribute('data-expanded') === 'true',
    toggle: () => { act(() => { (q('[data-testid="category-card-toggle"]') as HTMLElement).click(); }); },
    drill: () => { act(() => { (q('[data-testid="category-card-drill"]') as HTMLElement).click(); }); },
    bar: () => cardEl().querySelector('[role="progressbar"]')!,
    widths: () =>
      [...cardEl().querySelector('[role="progressbar"]')!.querySelectorAll('div')]
        .map(d => (d as HTMLElement).style.width),
    ticks: () => {
      const strip = cardEl().querySelector('[role="img"]');
      return strip ? ([...strip.querySelectorAll('[data-tick]')] as HTMLElement[]) : [];
    },
    text: () => cardEl().textContent ?? '',
    unmount: () => { act(() => { root.unmount(); }); container.remove(); },
  };
}

/**
 * The RGB channels of a rendered colour, alpha discarded.
 *
 * The tint is drawn as `${hex}0f`, which jsdom resolves to
 * `rgba(r, g, b, 0.06)`. What the assertion is about is WHICH hue
 * reached the DOM, not the wash strength — comparing the whole string
 * would make an opacity tweak look like a colour regression.
 */
function channels(rendered: string): [number, number, number] {
  const m = rendered.match(/rgba?\((\d+), (\d+), (\d+)/);
  if (!m) throw new Error(`unparseable colour: ${rendered}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function hexChannels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
});

describe('per-tick intervals — the reason for the field', () => {
  it('fades two SAME-AGED reps differently when their items differ', () => {
    // One category, one strip, two items, the same age and the same
    // outcome — only the schedule differs. Any aggregate interval makes
    // these identical.
    const h = mount([att(FAST, true, 4), att(SLOW, true, 4)]);
    h.toggle();
    // Oldest-first: both are 4 days old, so order is as supplied
    // reversed — SLOW first.
    const [slowTick, fastTick] = h.ticks();
    const slowOpacity = Number(slowTick.style.opacity);
    const fastOpacity = Number(fastTick.style.opacity);
    expect(slowOpacity).not.toBe(fastOpacity);
    expect(slowOpacity).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 30), 2);
    expect(fastOpacity).toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 2), 2);
    h.unmount();
  });

  it('falls back to the strip value for an item with no spacing row', () => {
    const unknown = FLASHCARDS.find(
      c => c.category === CAT && c.id !== SLOW && c.id !== FAST,
    )!.id;
    const h = mount([att(unknown, true, 4)]);
    h.toggle();
    expect(Number(h.ticks()[0].style.opacity))
      .toBeCloseTo(tickOpacity(NOW - 4 * DAY, NOW, 1), 2);
    h.unmount();
  });
});

describe('the shared bar', () => {
  it('draws three segments across the category', () => {
    const h = mount(Array.from({ length: 4 }, () => att(SLOW, true, 0)));
    expect(h.widths()).toEqual(['80%', '0%', '20%']);
    h.unmount();
  });

  it('renders a miss as amber, never as the grey remainder', () => {
    const h = mount([
      ...Array.from({ length: 4 }, () => att(SLOW, true, 0)),
      att(FAST, false, 0),
    ]);
    expect(h.widths()).toEqual(['80%', '20%', '0%']);
    h.unmount();
  });

  it('orders ticks oldest first', () => {
    // ASYMMETRIC — a palindrome reads the same reversed.
    const h = mount([
      att(SLOW, true, 0), att(SLOW, false, 1), att(SLOW, false, 2),
    ]);
    h.toggle();
    expect(h.ticks().slice(0, 3).map(t => t.dataset.outcome))
      .toEqual(['wrong', 'wrong', 'right']);
    h.unmount();
  });

  it('keeps the unrated state rather than a second empty branch', () => {
    const h = mount([att(SLOW, true, 0), att(SLOW, true, 0)]);
    expect(h.text()).toContain('2 of 5 attempts — 3 more to rate');
    expect(h.text()).not.toContain('no data yet — needs');
    h.unmount();
  });
});

describe('the collapsed card shows the bar and not the strip', () => {
  it('draws the bar collapsed, and adds the ticks only when expanded', () => {
    // The bar NEVER hides — hiding it would make a collapsed card say
    // nothing about where you stand, which is the card's whole job.
    const h = mount([att(SLOW, true, 0)]);
    expect(h.bar()).toBeTruthy();
    expect(h.ticks()).toHaveLength(0);
    h.toggle();
    expect(h.bar()).toBeTruthy();
    expect(h.ticks().length).toBeGreaterThan(0);
    h.unmount();
  });
});

describe('expanding and drilling are separate interactions', () => {
  it('does not drill when the card body is tapped', () => {
    // THE REVERSAL THAT MATTERS. A test that only checks the drill
    // button renders passes on a card where tapping the body drills —
    // which is the accident this design exists to prevent.
    const drilled: string[] = [];
    const h = mount([att(SLOW, true, 0)], k => drilled.push(k));
    h.toggle();
    expect(h.expanded()).toBe(true);
    expect(drilled).toEqual([]);
    h.unmount();
  });

  it('reaches the drill only through its own button, and passes the key', () => {
    const drilled: string[] = [];
    const h = mount([att(SLOW, true, 0)], k => drilled.push(k));
    // Collapsed, there is no drill button to press at all.
    expect(h.cardEl().querySelector('[data-testid="category-card-drill"]')).toBeNull();
    h.toggle();
    h.drill();
    // The KEY, not an index — a list that changed length between render
    // and tap would otherwise drill the wrong category.
    expect(drilled).toEqual([CAT]);
    h.unmount();
  });

  it('toggling one card leaves the others closed', () => {
    const h = mount([att(SLOW, true, 0)]);
    h.toggle();
    const open = [...h.container.querySelectorAll('[data-expanded="true"]')];
    expect(open).toHaveLength(1);
    expect(open[0].getAttribute('data-card-key')).toBe(CAT);
    h.unmount();
  });
});

describe('the card reads its tint and its counts from the shared sources', () => {
  it('tints from moduleMeta rather than a local literal', () => {
    // The grid takes a module ID and resolves the hex itself, so there
    // is no colour for a page to pass. This asserts the value that
    // reaches the DOM is the one `moduleMeta` holds — swap the lookup
    // for a literal and every card here changes colour.
    const h = mount([]);
    const toggle = h.cardEl()
      .querySelector('[data-testid="category-card-toggle"]') as HTMLElement;
    expect(channels(toggle.style.backgroundColor)).toEqual(hexChannels(ACCENT));
    h.unmount();
  });

  it('falls back to an un-branded grey for a module moduleMeta does not know', () => {
    // Not a guess at the module's colour: a wrong accent looks
    // deliberate and ships.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CategoryCardGrid
          cards={harmonicFluencyCards([], INTERVALS, NOW)}
          moduleId="not-a-module"
          onDrill={() => {}}
          now={NOW}
        />,
      );
    });
    const toggle = container
      .querySelector('[data-testid="category-card-toggle"]') as HTMLElement;
    expect(channels(toggle.style.backgroundColor)).toEqual(hexChannels(NO_MODULE_ACCENT));
    expect(channels(toggle.style.backgroundColor)).not.toEqual(hexChannels(ACCENT));
    act(() => { root.unmount(); });
    container.remove();
  });

  it('derives every category count from the catalog, not a written number', () => {
    // ALL FIFTEEN, not one. Checking a single category passes on a
    // hard-coded number that happens to match it — tritone-pairs has
    // twelve cards, so `itemCount: 12` survived the one-category
    // version of this test.
    const h = mount([att(SLOW, true, 0)]);
    const seen = new Map<string, string>();
    for (const el of h.container.querySelectorAll('[data-card-key]')) {
      seen.set(
        el.getAttribute('data-card-key')!,
        el.querySelector('[data-testid="category-card-count"]')!.textContent!,
      );
    }
    const expected = new Map(CATEGORY_ORDER.map(cat => [
      cat as string,
      `${cat === CAT ? 1 : 0}/${FLASHCARDS.filter(c => c.category === cat).length}`,
    ]));
    expect(seen).toEqual(expected);
    // Asymmetric: the counts are not all equal, so a constant fails.
    expect(new Set(expected.values()).size).toBeGreaterThan(1);
    h.unmount();
  });

  it('renders one card per category, in CATEGORY_ORDER', () => {
    // ASYMMETRIC: the order list is not alphabetical, so a card list
    // that sorted itself would differ here.
    const h = mount([]);
    const keys = [...h.container.querySelectorAll('[data-card-key]')]
      .map(el => el.getAttribute('data-card-key'));
    expect(keys).toEqual([...CATEGORY_ORDER]);
    expect(keys).not.toEqual([...CATEGORY_ORDER].sort());
    h.unmount();
  });

  it('labels from CATEGORY_LABELS', () => {
    const h = mount([]);
    expect(h.text()).toContain(CATEGORY_LABELS[CAT]);
    h.unmount();
  });
});

describe('progress detail is not pretending to work', () => {
  it('renders the button disabled rather than wiring it somewhere', () => {
    const h = mount([att(SLOW, true, 0)]);
    h.toggle();
    const btn = h.cardEl()
      .querySelector('[data-testid="category-card-progress-detail"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    h.unmount();
  });
});
