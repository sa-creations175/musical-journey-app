// @vitest-environment jsdom
/**
 * The strip, driving the real quiz.
 *
 * =====================================================================
 * BOTH HALVES, OR NEITHER PROVES ANYTHING.
 *
 * "The question on screen did not change" passes on a drill that
 * ignores the filter completely. "The new pool is serving" passes on a
 * drill that discards the card the instant the filter moves. Only the
 * pair distinguishes the contract — apply on the NEXT question — from
 * both ways of getting it wrong.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import IntervalsQuiz from '../IntervalsQuiz';
import { INTERVAL_SEEDS, directionsFor, intervalFacets } from '../seed';
import { intervalFacetList, allIntervalKeys } from '../facets';
import { allSelected, resolveFacets } from '../../../../lib/facetSelection';
import type { AttemptRecord, IntervalData } from '../../../../lib/db';

/**
 * jsdom has no AudioContext, and `playInterval` constructs one the
 * moment the reader presses play. Unmocked, every click leaves an
 * unhandled rejection — the assertions still pass and the run still
 * exits non-zero, which is the shape of failure that gets waved past.
 *
 * `intervalPlaybackMs` is stubbed rather than omitted: the quiz asks
 * how long the sound lasts so it can start its measurement clock, and
 * an undefined export throws inside the play handler.
 */
vi.mock('../../../../lib/audio', () => ({
  playInterval: async () => {},
  intervalPlaybackMs: () => 0,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const intervals: IntervalData[] = INTERVAL_SEEDS.map(seed => ({
  ...seed, ascAnchor: null, descAnchor: null,
} as unknown as IntervalData));

async function render(attempts: AttemptRecord[] = []): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <IntervalsQuiz intervals={intervals} attempts={attempts} />
      </MemoryRouter>,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

const served = () =>
  container!.querySelector('[data-item-key]')!.getAttribute('data-item-key');

async function click(el: Element | null | undefined, what: string) {
  expect(el, `no element for ${what}`).toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}

/**
 * Reduce a facet to exactly one value.
 *
 * The strip loads with every chip lit, so narrowing means DESELECTING
 * the others rather than selecting one — which is the whole behavioural
 * consequence of the lit-everything default and is why these tests read
 * differently from the ones written against the empty default.
 */
async function keepOnly(facetId: string, valueId: string): Promise<number | null> {
  const others = [...container!.querySelectorAll(`[data-facet="${facetId}"]`)]
    .filter(el => el.getAttribute('data-value') !== valueId);
  // EVERY intermediate deselection that still resolves to something is
  // applied, so the pool moves several times inside one call. The last
  // non-empty value is what "your previous pool" will name — captured
  // here rather than recomputed, because recomputing it would mean
  // modelling this loop a second time.
  let lastServing: number | null = shownServing();
  for (const el of others) {
    await click(el, `deselect ${el.getAttribute('data-value')}`);
    const now = shownServing();
    if (now !== null) lastServing = now;
  }
  return lastServing;
}

const byText = (text: RegExp) =>
  [...container!.querySelectorAll('button')]
    .find(b => text.test((b.textContent ?? '').trim()));

const countText = () =>
  container!.querySelector('[data-testid="filter-count"]')!.textContent ?? '';

/** The "N of M" the strip is currently showing, or null when it is not
 *  in that state. Used to capture what was serving immediately before a
 *  selection went empty. */
function shownServing(): number | null {
  const m = countText().match(/(\d+) of \d+/);
  return m ? Number(m[1]) : null;
}

/**
 * Any enabled answer button.
 *
 * Found by `title`, which the timeline sets to the interval's name —
 * the cells render an id in a span and no accessible label, so text
 * matching finds nothing.
 */
const anyAnswerOption = () =>
  [...container!.querySelectorAll('button[title]')]
    .find(b => !(b as HTMLButtonElement).disabled
      && INTERVAL_SEEDS.some(s => s.name === b.getAttribute('title')));

describe('the strip replaces the direction tabs', () => {
  it('renders three facets and no direction tab strip', async () => {
    await render();
    const facetRows = new Set(
      [...container!.querySelectorAll('[data-facet]')]
        .map(el => el.getAttribute('data-facet')),
    );
    expect([...facetRows].sort()).toEqual(['consonance', 'direction', 'distance']);
    // The old tabs offered a literal "both"; the strip expresses that
    // as nothing selected, so no chip should carry it.
    expect(byText(/^both$/)).toBeUndefined();
  });

  it('reaches every state the old tabs could', async () => {
    // both / asc / desc. Nothing selected is `both`; each single
    // direction value reproduces its tab.
    const facets = intervalFacetList();
    const all = allIntervalKeys();
    expect(resolveFacets(facets, {}).narrowed).toBe(false);
    const asc = resolveFacets(facets, { direction: ['asc'] }).keys;
    const desc = resolveFacets(facets, { direction: ['desc'] }).keys;
    expect(asc.every(k => k.endsWith('|asc'))).toBe(true);
    expect(desc.every(k => k.endsWith('|desc'))).toBe(true);
    // And selecting both directions is the same pool as selecting none.
    const bothDirs = resolveFacets(facets, { direction: ['asc', 'desc'] }).keys;
    expect([...bothDirs].sort()).toEqual([...all].sort());
  });
});

describe('the live count matches what is actually served', () => {
  it('lights every chip on a fresh load, resolving to the whole pool', async () => {
    // BOTH HALVES. That the chips are lit, AND that lighting them
    // resolves to the same pool as lighting none — equality alone would
    // pass on a strip that still started empty.
    const el = await render();
    const chips = [...el.querySelectorAll('[data-facet]')] as HTMLElement[];
    expect(chips.length).toBeGreaterThan(0);
    for (const c of chips) {
      expect(c.getAttribute('aria-pressed'), c.getAttribute('data-value') ?? '').toBe('true');
    }
    const facets = intervalFacetList();
    expect(resolveFacets(facets, allSelected(facets)).keys.length)
      .toBe(allIntervalKeys().length);
    expect(countText()).toContain(`${allIntervalKeys().length} of ${allIntervalKeys().length}`);
  });

  it('falls back to the un-narrowed reading if every chip is turned off', async () => {
    // The rule "nothing selected does not constrain" is still true; it
    // is just no longer where a drill starts.
    const el = await render();
    for (const c of [...el.querySelectorAll('[data-facet]')]) await click(c, 'deselect');
    expect(countText()).toContain(`${allIntervalKeys().length} in pool`);
  });

  it('shows the resolved size, derived from the same source', async () => {
    await render();
    await keepOnly('consonance', 'dissonant');
    // Derived here the same way the component derives it, so the test
    // cannot drift from the implementation by carrying its own number.
    const expected = resolveFacets(intervalFacetList(), { consonance: ['dissonant'] }).keys.length;
    expect(countText()).toContain(`${expected} of ${allIntervalKeys().length}`);
    // ASYMMETRIC: the narrowed count must not equal the pool, or the
    // assertion above would pass on a strip that never narrows.
    expect(expected).toBeLessThan(allIntervalKeys().length);
  });

  it('says so, rather than showing 0, when nothing matches', async () => {
    await render();
    // perfect AND near is the unison alone; perfect AND... find a pair
    // that genuinely resolves to nothing, derived rather than assumed.
    const facets = intervalFacetList();
    const empty = (['perfect', 'imperfect', 'dissonant'] as const).flatMap(c =>
      (['near', 'middle', 'far'] as const).map(d => ({ c, d })))
      .find(({ c, d }) => resolveFacets(facets, { consonance: [c], distance: [d] }).keys.length === 0);
    expect(empty, 'no empty combination exists in the catalog').toBeTruthy();

    await keepOnly('consonance', empty!.c);
    const previous = await keepOnly('distance', empty!.d);
    expect(container!.querySelector('[data-testid="filter-count-empty"]')).not.toBeNull();
    expect(countText()).not.toMatch(/\b0 of\b/);
    // THE PREVIOUS POOL IS THE LAST ONE APPLIED, and it is CAPTURED
    // rather than recomputed. Every deselection that still resolves to
    // something is applied, so the "previous" pool depends on the order
    // the chips were turned off — recomputing it here would be a second
    // model of that sequence, and a wrong one the first time the
    // sequence changed.
    expect(previous, 'nothing was serving before the empty selection').not.toBeNull();
    expect(previous!).toBeGreaterThan(0);
    expect(previous!).toBeLessThan(allIntervalKeys().length);
    expect(countText()).toContain(`keeping your previous pool of ${previous}`);
  });
});

describe('the filter applies to the NEXT question', () => {
  /**
   * A selection disjoint from whatever is on screen.
   *
   * Computed after the question is served, so the test never assumes
   * which interval came up — the quiz picks adaptively.
   */
  function disjointSelection(currentKey: string) {
    const facets = intervalFacetList();
    for (const c of ['perfect', 'imperfect', 'dissonant'] as const) {
      const keys = resolveFacets(facets, { consonance: [c] }).keys;
      if (keys.length > 0 && !keys.includes(currentKey)) return { value: c, keys };
    }
    throw new Error('no disjoint consonance group');
  }

  it('leaves the question on screen alone, then serves the new pool', async () => {
    await render();
    await click(byText(/play interval/i), 'play');
    const before = served()!;
    expect(before).toBeTruthy();

    const { value, keys } = disjointSelection(before);
    expect(keys).not.toContain(before);

    await keepOnly('consonance', value);

    // HALF ONE: the question the reader was asked is still the question.
    expect(served()).toBe(before);

    // Answer it — any option — then advance.
    await click(anyAnswerOption(), 'an answer option');
    await click(byText(/next interval/i), 'next');

    // HALF TWO: the new pool is serving. Without this, a drill that
    // ignored the filter entirely would pass half one.
    expect(keys).toContain(served()!);
  });

  it('keeps serving the previous pool when a selection resolves to zero', async () => {
    await render();
    await click(byText(/play interval/i), 'play');

    // Narrow to something real first, so there IS a previous pool.
    await keepOnly('direction', 'asc');
    const answeredKey = served()!;

    // Now add a combination that resolves to nothing.
    const facets = intervalFacetList();
    const empty = (['perfect', 'imperfect', 'dissonant'] as const).flatMap(c =>
      (['near', 'middle', 'far'] as const).map(d => ({ c, d })))
      .find(({ c, d }) => resolveFacets(facets, { consonance: [c], distance: [d] }).keys.length === 0)!;
    await keepOnly('consonance', empty.c);
    const previous = await keepOnly('distance', empty.d);

    // THE MESSAGE NAMES THE POOL THAT IS PLAYING, captured immediately
    // before the selection went empty rather than recomputed here.
    expect(previous, 'nothing was serving before the empty selection').not.toBeNull();
    expect(previous!).toBeLessThan(allIntervalKeys().length);
    expect(countText()).toContain(`keeping your previous pool of ${previous}`);
    expect(countText()).not.toContain(`pool of ${allIntervalKeys().length}`);

    expect(served()).toBe(answeredKey);
    await click(anyAnswerOption(), 'an answer option');
    await click(byText(/next interval/i), 'next');

    // THE DRILL ACTUALLY ADVANCED, and to an ascending item.
    //
    // `endsWith('|asc')` alone is not enough: if the empty selection
    // WERE applied, the candidate pool would be empty, `startNew` would
    // return before serving anything, and the last ascending question
    // would still be on screen — passing an assertion about its suffix
    // while the drill was in fact stuck. So the answered state has to
    // be gone too.
    expect(byText(/next interval/i), 'still stuck on the answered card').toBeUndefined();
    expect(served()!.endsWith('|asc')).toBe(true);
  });
});

describe('the facets read the catalog tags', () => {
  it('groups every interval by intervalFacets, not a second table', async () => {
    const facets = intervalFacetList();
    const consonance = facets.find(f => f.id === 'consonance')!;
    for (const seed of INTERVAL_SEEDS) {
      const tag = intervalFacets(seed.id)!.consonance;
      const value = consonance.values.find(v => v.id === tag)!;
      for (const dir of directionsFor(seed.semitones)) {
        expect(value.keys, `${seed.id}|${dir}`).toContain(`${seed.id}|${dir}`);
      }
    }
  });

  it('offers no descending unison, because the catalog has none', async () => {
    const direction = intervalFacetList().find(f => f.id === 'direction')!;
    const desc = direction.values.find(v => v.id === 'desc')!;
    expect(desc.keys).not.toContain('P1|desc');
    expect(desc.keys).toContain('P8|desc');
  });
});
