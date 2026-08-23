/**
 * The song page has one shape now.
 *
 * ---------------------------------------------------------------
 * WHY SOURCE-LEVEL RATHER THAN A RENDER TEST.
 *
 * These are absences — the drag-reorder is gone, two cards are gone —
 * and rendering proves an absence only for the props you happened to
 * pass. A card that reappeared behind a condition the test did not
 * hit would render as nothing and pass.
 *
 * They are also the kind of thing a later edit restores by accident:
 * dnd-kit is still a dependency used elsewhere on the page's siblings,
 * and "why this song" is a phrase that reads like it wants its own
 * heading.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';

const SOURCES: Record<string, string> = import.meta.glob(
  '../**/*.{ts,tsx}',
  { eager: true, query: '?raw', import: 'default' },
);

function read(suffix: string): string {
  const hit = Object.entries(SOURCES).find(([p]) => p.endsWith(suffix));
  if (!hit) throw new Error(`no source found for ${suffix}`);
  return hit[1];
}

const DETAIL = read('SongDetailView.tsx');

describe('the page order is fixed', () => {
  it('the sweep found the file', () => {
    // Guard the guard: a glob that matched nothing makes every
    // assertion below vacuously true.
    expect(DETAIL.length).toBeGreaterThan(10_000);
    expect(DETAIL).toContain('SongMatrixView');
  });

  it('no drag-to-reorder machinery remains', () => {
    // The order was user-controlled and stored on
    // `songs.sectionOrder`. That freedom was worth less than a shape
    // you can learn.
    for (const marker of ['DndContext', 'SortableContext', 'useSortable', 'SortableSection']) {
      expect(DETAIL).not.toContain(`<${marker}`);
    }
    expect(DETAIL).not.toContain("from '@dnd-kit/core'");
    expect(DETAIL).not.toContain("from '@dnd-kit/sortable'");
  });

  it('does not read or write the stored card order', () => {
    // The field is deliberately LEFT on the row — unindexed, riding in
    // the sync blob, costing nothing — but nothing may consult it.
    expect(DETAIL).not.toContain('sectionOrder:');
    expect(DETAIL).not.toContain('song?.sectionOrder');
  });

  it('renders the cards in the settled order', () => {
    // Metadata, matrix, lead sheet, associations. Asserted by the
    // position of each card's own marker, so a card moved rather than
    // deleted still fails.
    const order = [
      '{/* Metadata */}',
      '>matrix</h3>',
      '>lead sheet</h3>',
      '<SongAssociationsSection',
    ].map(m => {
      const at = DETAIL.indexOf(m);
      expect(at, `missing marker: ${m}`).toBeGreaterThan(-1);
      return at;
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('two cards were absorbed, not merely hidden', () => {
  it('"why this song" is no longer its own card', () => {
    // Its content — the note and the reference links — moved into
    // metadata, which answers the same question: what IS this song.
    expect(DETAIL).not.toContain('>why this song</h3>');
  });

  it('the note and the links moved WITH it', () => {
    // Guard the guard: deleting the heading and losing the content
    // would satisfy the assertion above.
    expect(DETAIL).toContain('+ add a note about this song');
    expect(DETAIL).toContain('spotify ↗');
  });

  it('"learning status" is no longer its own card', () => {
    // The matrix is the song's dashboard, so its status and what would
    // advance it belong in that card rather than two scrolls below it.
    expect(DETAIL).not.toContain('>learning status</h3>');
  });

  it('the stage block moved WITH it, into the matrix card', () => {
    const matrixAt = DETAIL.indexOf('>matrix</h3>');
    const leadAt = DETAIL.indexOf('>lead sheet</h3>');
    const panelAt = DETAIL.indexOf('<StageCriteriaPanel');
    expect(panelAt).toBeGreaterThan(matrixAt);
    expect(panelAt).toBeLessThan(leadAt);
  });
});
