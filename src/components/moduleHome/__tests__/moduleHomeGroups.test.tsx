// @vitest-environment jsdom
/**
 * Harmonic Fluency's home draws its three groups as headings; the other
 * module homes that share the grid render exactly as before.
 *
 * Walked in `hf-home-groups-prototype.html` (Silas, 14 Sep 2026): title,
 * then the group's card count in mono, a hairline under. The headings
 * always stay, and a sort reorders the families inside each group and
 * never across groups.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import HarmonicFluency from '../../../modules/harmonic-fluency/HarmonicFluency';
import EarTraining from '../../../modules/ear-training/EarTraining';
import Reading from '../../../modules/reading/Reading';
import ShapesAndPatterns from '../../../modules/shapes-and-patterns/ShapesAndPatterns';
import ProductionOverview from '../../../modules/production/ProductionOverview';
import { HARMONIC_FLUENCY_GROUPS } from '../../../modules/harmonic-fluency/coverageGroups';
import { FLASHCARDS } from '../../../modules/harmonic-fluency/catalog';
import { harmonicFluencyCards } from '../../../modules/harmonic-fluency/homeCards';
import { groupedCards } from '../cardGroups';
import { sortCards } from '../cardSort';
import { db, newAttemptId } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.userPrefs.clear();
  await db.attempts.clear();
});

const flush = async (n = 10) => {
  for (let i = 0; i < n; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
};

async function render(page: ReactNode, at: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<MemoryRouter initialEntries={[at]}>{page}</MemoryRouter>);
  });
  await flush();
  return container!;
}

/** Each drawn section's heading and card keys, in page order. */
const sections = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-testid="card-group"]')].map(s => ({
    key: s.getAttribute('data-group-key'),
    title: s.querySelector('[data-testid="card-group-heading"] h3')?.textContent ?? null,
    count: s.querySelector('[data-testid="card-group-count"]')?.textContent ?? null,
    cards: [...s.querySelectorAll('[data-card-key]')].map(c => c.getAttribute('data-card-key')),
  }));

const press = async (el: HTMLElement, order: string) => {
  await act(async () => {
    (el.querySelector(`[data-testid="card-sort-${order}"]`) as HTMLElement).click();
  });
  await flush(4);
};

/** A family's card count, off the catalog. */
const inGroup = (categories: readonly string[]) =>
  FLASHCARDS.filter(c => categories.includes(c.category)).length;

describe('the Harmonic Fluency home', () => {
  it('heads its three groups in the walked order, each with its live card count', async () => {
    const el = await render(<HarmonicFluency />, '/harmonic-fluency');
    const drawn = sections(el);
    expect(drawn.map(s => s.title)).toEqual([
      'Notes, Degrees, Scales & Keys', 'Chords', 'Movement',
    ]);
    // The prototype's figures, and the catalog's.
    expect(drawn.map(s => s.count)).toEqual(['1,193 cards', '235 cards', '252 cards']);
    HARMONIC_FLUENCY_GROUPS.forEach((g, i) => {
      expect(drawn[i].count).toBe(`${inGroup(g.categories).toLocaleString('en-US')} cards`);
    });
  });

  it('lists each group’s families in the declared order', async () => {
    const el = await render(<HarmonicFluency />, '/harmonic-fluency');
    expect(sections(el).map(s => s.cards)).toEqual([
      ['degree-notes', 'scale-degree-math', 'key-signatures', 'enharmonic-equivalents', 'intervals', 'modes'],
      ['diatonic-qualities', 'slash-chords', 'chord-construction'],
      ['progressions', 'modal-improvisation', 'functional-harmony'],
    ]);
    // The mono count sits in the heading, after the title.
    const heading = el.querySelector('[data-testid="card-group-heading"]')!;
    expect(heading.querySelector('[data-testid="card-group-count"]')!.className).toContain('font-mono');
  });

  it('keeps the headings and reorders only within a group when sorted', async () => {
    // Degrees And Notes practised today: by last practiced it goes to the
    // END — of its own group, never past Chords and Movement.
    const practised = FLASHCARDS.find(c => c.category === 'degree-notes')!;
    await db.attempts.add({
      id: newAttemptId(), moduleId: 'harmonic-fluency', itemId: practised.id,
      correct: true, timestamp: Date.now(),
    });
    const el = await render(<HarmonicFluency />, '/harmonic-fluency');
    const declared = sections(el);

    await press(el, 'last-practiced');
    const sorted = sections(el);
    expect(sorted.map(s => s.title)).toEqual(declared.map(s => s.title));
    expect(sorted.map(s => s.count)).toEqual(declared.map(s => s.count));
    sorted.forEach((s, i) => {
      expect([...s.cards].sort(), s.title!).toEqual([...declared[i].cards].sort());
    });
    expect(sorted[0].cards.at(-1)).toBe('degree-notes');
    expect(sorted[0].cards).not.toEqual(declared[0].cards);

    await press(el, 'status');
    expect(sections(el).map(s => s.title)).toEqual(declared.map(s => s.title));

    await press(el, 'declared');
    expect(sections(el)).toEqual(declared);
  });
});

describe('groupedCards', () => {
  const now = Date.now();
  const practised = FLASHCARDS.find(c => c.category === 'degree-notes')!;
  const cards = harmonicFluencyCards(
    [{ moduleId: 'harmonic-fluency', itemId: practised.id, correct: true, timestamp: now }],
    new Map(),
    now,
  );
  const groups = HARMONIC_FLUENCY_GROUPS.map(g => ({ key: g.unit, title: g.title, cardKeys: g.categories }));

  it('sorts inside each group where a flat sort would cross them', () => {
    // The fixture moves: flat, the practised family lands after Movement.
    expect(sortCards(cards, 'last-practiced').at(-1)!.key).toBe('degree-notes');
    const grouped = groupedCards(cards, groups, 'last-practiced');
    expect(grouped.map(s => s.group?.key)).toEqual(groups.map(g => g.key));
    expect(grouped[0].cards.at(-1)!.key).toBe('degree-notes');
    expect(grouped[2].cards.map(c => c.key).sort())
      .toEqual([...groups[2].cardKeys].sort());
  });

  it('draws a card no group names after the groups, never dropping it', () => {
    const partial = groups.map(g => ({ ...g, cardKeys: g.cardKeys.filter(k => k !== 'modes') }));
    const out = groupedCards(cards, partial, 'declared');
    expect(out.at(-1)!.group).toBeNull();
    expect(out.at(-1)!.cards.map(c => c.key)).toEqual(['modes']);
  });
});

describe('the other module homes', () => {
  const OTHERS: Array<{ name: string; page: ReactNode; at: string }> = [
    { name: 'ear training', page: <EarTraining />, at: '/ear-training' },
    { name: 'reading', page: <Reading />, at: '/reading' },
    { name: 'shapes & patterns', page: <ShapesAndPatterns />, at: '/shapes-and-patterns' },
    {
      name: 'production',
      page: <ProductionOverview onOpenPath={() => {}} onOpenLesson={() => {}} onOpenVocabulary={() => {}} />,
      at: '/production',
    },
  ];

  for (const { name, page, at } of OTHERS) {
    it(`${name} renders as before: one grid, no headings`, async () => {
      const el = await render(page, at);
      const grids = el.querySelectorAll('[data-testid="category-card-grid"]');
      expect(grids.length, `${name}: grids`).toBe(1);
      expect(el.querySelectorAll('[data-card-key]').length, `${name}: cards`).toBeGreaterThan(0);
      expect(el.querySelector('[data-testid="card-group"]'), `${name}: a group`).toBeNull();
      expect(el.querySelector('[data-testid="card-group-heading"]'), `${name}: a heading`).toBeNull();
      // Every card is a direct child of the one grid, as before.
      for (const card of el.querySelectorAll('[data-card-key]')) {
        expect(card.closest('[data-testid="category-card-grid"]'), name).toBe(grids[0]);
      }
    });
  }
});
