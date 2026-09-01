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
          onOpenGlossary={() => {}}
          onOpenReferenceTracks={() => {}}
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

  it('still carries the same four facts', async () => {
    await render();
    const labels = ['lessons-tried', 'in-progress', 'glossary', 'reference-tracks'];
    for (const id of labels) {
      expect(tile(id), id).not.toBeNull();
    }
    expect(tile('lessons-tried')!.textContent)
      .toContain(`0/${PRODUCTION_LESSONS.length}`);
    expect(tile('glossary')!.textContent).toContain(`0/${GLOSSARY.length}`);
  });

  it('drops the monospace face that made this module look different', async () => {
    const el = await render();
    const row = el.querySelector('[data-testid="summary-tiles"]')!;
    expect(row.innerHTML).not.toContain('font-mono');
  });

  it('keeps the two tiles that are also doors as buttons', async () => {
    await render();
    expect(tile('glossary')!.tagName).toBe('BUTTON');
    expect(tile('reference-tracks')!.tagName).toBe('BUTTON');
    expect(tile('lessons-tried')!.tagName).toBe('DIV');
  });

  it('has no Vocabulary tile — the card below is that door', async () => {
    await render();
    expect(tile('vocabulary')).toBeNull();
  });
});
