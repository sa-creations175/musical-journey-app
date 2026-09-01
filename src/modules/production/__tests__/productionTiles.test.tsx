// @vitest-environment jsdom
/**
 * Production's four standing facts, in the app's one tile shell.
 *
 * =====================================================================
 * WHAT CHANGED FOR A READER: the row at the top of the module used to
 * be four tall boxes with the figure stacked above its label, in a
 * monospace face nothing else in the app uses. It is four thin lines
 * now, in the body font, in the same shell the shapes pages use.
 *
 * jsdom has no layout, so nothing here measures a pixel. What it says
 * is that all four tiles come from the shared shell and still carry the
 * same four figures.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import ProductionOverview from '../ProductionOverview';
import { PRODUCTION_LESSONS } from '../content/lessons';
import { GLOSSARY } from '../content/glossary';
import { db } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.glossaryTermStates.clear();
  await db.productionLessons.clear();
  await db.attempts.clear();
});

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={['/production']}>
        <ProductionOverview
          onOpenPath={() => {}}
          onOpenLesson={() => {}}
          onOpenVocabulary={() => {}}
        />
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 12; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return container!;
}

const tile = (id: string) =>
  container!.querySelector(`[data-testid="summary-tile-${id}"]`) as HTMLElement | null;

describe('the row at the top of Production', () => {
  it('is the shared shell, not a fourth look', async () => {
    const el = await render();
    expect(el.querySelector('[data-testid="summary-tiles"]')).not.toBeNull();
  });

  it('carries the three things being TRACKED, and only those', async () => {
    // A tile is for something you are tracking — the things that appear
    // as categories in the dashboards. Reference material is not
    // progress and does not belong in the row.
    const el = await render();
    const labels = [...el.querySelectorAll('[data-label]')]
      .map(t => t.getAttribute('data-label'));
    expect(labels).toEqual(['lessons tried', 'in progress', 'vocabulary']);
    expect(tile('lessons-tried')!.textContent)
      .toContain(`0/${PRODUCTION_LESSONS.length}`);
  });

  it('has no Glossary tile and no Reference Tracks tile', async () => {
    // A browsable list of terms and a count of material available to
    // you. Neither is anything you have done.
    await render();
    expect(tile('glossary'), 'glossary').toBeNull();
    expect(tile('reference-tracks'), 'reference tracks').toBeNull();
  });

  it('gives Vocabulary the tile it was missing, reading the card below it', async () => {
    // Vocabulary is a drill, it is one of Production's dashboard
    // categories, and it had no tile. Its figure comes off the same
    // card model the card below shows, so the two cannot drift.
    const el = await render();
    const vocab = tile('vocabulary')!;
    expect(vocab).not.toBeNull();
    expect(vocab.textContent).toContain(`0/${GLOSSARY.length}`);

    const card = [...el.querySelectorAll('[data-card-key]')]
      .find(c => c.getAttribute('data-card-key') === 'vocabulary')!;
    const cardCount = card.querySelector('[data-testid="category-card-count"]')!;
    expect(cardCount.textContent).toContain(`0/${GLOSSARY.length}`);
  });

  it('drops the monospace face that made this module look different', async () => {
    const el = await render();
    const row = el.querySelector('[data-testid="summary-tiles"]')!;
    expect(row.innerHTML).not.toContain('font-mono');
  });
});

describe('the two reference doors', () => {
  it('are plain links in the header row, not tiles', async () => {
    // The same slot and the same treatment Reading's Notation Reference
    // has always used.
    const el = await render();
    const links = [...el.querySelectorAll('a')]
      .filter(a => ['Glossary', 'Reference Tracks'].includes(a.textContent ?? ''));
    expect(links.map(a => a.textContent)).toEqual(['Glossary', 'Reference Tracks']);
    for (const link of links) {
      expect(link.className, link.textContent ?? '').toContain('hover:text-fluent');
    }
  });

  it('still open what they always opened', async () => {
    // Only how you reach them changed. These are the addresses the
    // sidebar already points at, and `Production` dispatches on them.
    const el = await render();
    const href = (text: string) =>
      [...el.querySelectorAll('a')].find(a => a.textContent === text)
        ?.getAttribute('href');
    expect(href('Glossary')).toBe('/production?view=glossary');
    expect(href('Reference Tracks')).toBe('/production?view=reference-tracks');
  });
});
