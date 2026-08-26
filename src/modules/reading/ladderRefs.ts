/**
 * Which catalog note items land on which position of the grand-staff
 * ladder.
 *
 * =====================================================================
 * A LADDER ROW IS A PITCH; A CATALOG ITEM IS A CLEF AND A POSITION.
 *
 * Those are not the same thing, and the mapping is many-to-one in
 * exactly one direction: the two clefs OVERLAP. Middle C is treble
 * position −2 and bass position 10 — two separate items, two separate
 * schedules, one row on the ladder. So a row carries a LIST, and the
 * vertical view draws one mark per clef that reaches it rather than
 * picking a winner.
 *
 * DERIVED BY WALKING THE CATALOG, never by listing pitches. The key is
 * `scientificPitch(pitchAtStaffPosition(...))`, which is the same pair
 * of functions the drill's reveal caption and the horizontal axis both
 * go through — and it is the format `staffLadder` gives a position's
 * id, so the two sides meet without either being written down.
 * =====================================================================
 *
 * The ladder is WIDER than the catalog: it draws three ledger lines
 * either side and the catalog stops at two, so its outermost rows map
 * to nothing. That is a gap to leave empty, not one to fill.
 */
import { CLEFS, NOTE_POSITIONS, noteItemRef, type Clef } from './catalog';
import { pitchAtStaffPosition, scientificPitch } from './pitch';

export interface LadderRef {
  clef: Clef;
  /** The catalog item at that clef and pitch. */
  itemRef: string;
}

/**
 * Every note item, keyed by the ladder position id it falls on.
 *
 * In `CLEFS` order within a row, so the marks read the same way every
 * time rather than in whatever order the walk happened to produce.
 */
export function noteRefsByPitch(): Map<string, LadderRef[]> {
  const out = new Map<string, LadderRef[]>();
  for (const clef of CLEFS) {
    for (const position of NOTE_POSITIONS) {
      const id = scientificPitch(pitchAtStaffPosition(clef, position));
      const at = out.get(id) ?? [];
      at.push({ clef, itemRef: noteItemRef(clef, position) });
      out.set(id, at);
    }
  }
  return out;
}
