/**
 * A Chord Movements & Passes row's chords, named in a key — the line
 * under the twelve during a Circle of 4ths drill ("In F: Gm7 · C7 ·
 * Fmaj7").
 *
 * =====================================================================
 * THE SAME CHORDS THE ROW ALREADY PLAYS, NAMED THE WAY THEY ARE NAMED.
 *
 * A built-in row is a shared-list entry at a rung and a position, and
 * `passVoicing.voiceEntry` is where its chords are named for the cell
 * player — so the line reads them from there, in the key being drilled.
 *
 * A captured movement's chords are the ones written on its lead sheet,
 * in the order they sit there, named in letters by the lead sheet's own
 * renderer (`renderConcrete`). Its stored durations are not read: in a
 * Circle drill the Rate is what moves (Silas, 13 Sep 2026).
 * =====================================================================
 */
import type { ChordMovement, ChordPlacement } from '../../lib/db';
import type { Spelling } from '../../lib/spelling';
import { renderConcrete } from '../repertoire/chordFunction';
import { voiceEntry } from '../ear-training/chord-progressions/passVoicing';
import { SHARED_PROGRESSION_BY_ID } from '../ear-training/chord-progressions/sharedList';
import { KEYS } from './catalog';
import { cellForPlayer } from './cellForPlayer';

/** Where a chord sits on the lead sheet: bar, then beat, then offbeat. */
const slot = (p: ChordPlacement) => (p.barIndex * 1000 + p.beatPos) * 2 + (p.offbeat ? 1 : 0);

/** The ref with its key (or `circle`) replaced by `keyName`. */
function inKey(itemRef: string, keyName: string): string {
  const parts = itemRef.split(':');
  parts[parts.length - 1] = keyName;
  return parts.join(':');
}

/**
 * The row's chords in `keyName`, in order. `movement` is the captured
 * movement the ref belongs to, where it is one; absent, the ref is a
 * built-in row's. Empty where there is nothing to name.
 */
export function circleChordNames(
  itemRef: string,
  keyName: string,
  spelling: Spelling,
  movement?: ChordMovement,
): string[] {
  if (movement !== undefined) {
    return [...movement.placements]
      .sort((a, b) => slot(a) - slot(b))
      .map(p => renderConcrete(p.chord, keyName, spelling))
      .filter(name => name !== '');
  }
  const cell = cellForPlayer(inKey(itemRef, keyName));
  const entry = cell === null ? undefined : SHARED_PROGRESSION_BY_ID.get(cell.entryId);
  if (cell === null || entry === undefined) return [];
  return voiceEntry(entry, KEYS.indexOf(keyName as (typeof KEYS)[number]), cell.rung, cell.position, { spelling })
    .map(c => c.name);
}
