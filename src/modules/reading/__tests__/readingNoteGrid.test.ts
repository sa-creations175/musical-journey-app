/**
 * The note grid's axis says what the notes ARE.
 *
 * It used to be two rows over one axis of staff positions, −4 to 12.
 * A staff position is not a pitch — 0 is E4 in the treble clef and G2
 * in the bass — so a shared header could only print the coordinate.
 *
 * What is pinned here is that the names are DERIVED from the same two
 * functions the drill's own reveal caption goes through, that the two
 * clefs genuinely disagree, and that the staff frame is computed rather
 * than written down.
 */
import { describe, expect, it } from 'vitest';
import { CLEFS, NOTE_POSITIONS } from '../catalog';
import { pitchAtStaffPosition, scientificPitch } from '../pitch';
import { READING_GRIDS } from '../progressGrids';
import { READING_CATEGORY_LABEL } from '../skillRecords';
import { axisLabel, canTranspose, resolveView } from '../../../components/moduleHome/axis';

const grid = READING_GRIDS[READING_CATEGORY_LABEL.note]!;
const positions = resolveView(grid.columns, null).values;

describe('one grid per clef', () => {
  it('splits on the clef rather than rowing over a shared axis', () => {
    expect(grid.splitRows).toBe(true);
    expect(grid.rows).toBeDefined();
    expect(resolveView(grid.rows!, null).values).toEqual(CLEFS);
  });

  it('is not offered a transpose — the rows are already separate', () => {
    expect(canTranspose(grid)).toBe(false);
  });
});

describe('the note names', () => {
  it('are the catalog’s own, position by position and clef by clef', () => {
    // DERIVED, NOT LISTED. Every label is recomputed here the same way
    // the drill computes its caption; a hand-written axis would pass
    // this only until the catalog's range moved.
    for (const clef of CLEFS) {
      for (const p of positions) {
        expect(axisLabel(grid.columns, p, clef))
          .toBe(scientificPitch(pitchAtStaffPosition(clef, Number(p))));
      }
    }
  });

  it('covers exactly the catalog’s positions', () => {
    expect(positions).toEqual(NOTE_POSITIONS);
  });

  it('names a DIFFERENT note in each clef at every position', () => {
    // The defect in one sentence: a shared axis claimed one name for
    // two notes. Nowhere in the range do the two clefs agree.
    for (const p of positions) {
      expect(axisLabel(grid.columns, p, 'treble'))
        .not.toBe(axisLabel(grid.columns, p, 'bass'));
    }
  });
});

describe('the staff frame', () => {
  it('marks the five lines and their four spaces, and nothing beyond', () => {
    const framed = positions.filter(p => grid.columns.inFrame!(p));
    expect(framed).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('leaves the ledger positions outside it on both sides', () => {
    // Asymmetric on purpose: a frame that only closed above, or only
    // below, would pass a test that checked one end.
    expect(grid.columns.inFrame!(-1)).toBe(false);
    expect(grid.columns.inFrame!(9)).toBe(false);
  });
});
