/**
 * Reading and writing a chord movement.
 *
 * =====================================================================
 * ONE PLACE THAT WRITES, so "what a new movement starts as" is a fact
 * about this file rather than about whichever screen created it. The
 * defaults below are the prototype's: 72 BPM, bass forward, no key, no
 * name.
 *
 * NO NAME IS INVENTED, and that is ruling 4 rather than an oversight. A
 * movement is created before it is named and the app never fills the
 * field in — `name` is an empty string until Silas types one, and every
 * surface that shows it has to cope with that.
 * =====================================================================
 */
import { db, MOVEMENT_ARRANGEMENT_ID, type ChordMovement, type ChordPlacement } from '../../../lib/db';

/** What a movement starts as, until Silas says otherwise. */
export const DEFAULT_MOVEMENT_BPM = 72;

/**
 * How many bars a movement's grid shows.
 *
 * DERIVED, NOT STORED. The signed-off prototype has no control for
 * adding a bar, so a stored bar count would be a number nothing could
 * change — see the `ChordMovement` header.
 *
 * The minimum is one, so a movement with nothing in it still has
 * somewhere to put its first chord.
 */
export const MIN_MOVEMENT_BARS = 1;

export function movementBarCount(movement: {
  placements: readonly ChordPlacement[];
}): number {
  // THE LAST BAR ANYTHING SITS IN, and `beats` does not extend that: a
  // duration is counted inside its own bar and nothing in this model
  // crosses a bar line. Reading it as a span is how a two-bar movement
  // would draw four.
  const last = movement.placements.reduce(
    (max, p) => Math.max(max, p.barIndex + 1),
    0,
  );
  return Math.max(MIN_MOVEMENT_BARS, last);
}

export function newMovement(timeSignature: string, now = Date.now()): ChordMovement {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    timeSignature,
    placements: [],
    playbackBpm: DEFAULT_MOVEMENT_BPM,
    bassBalance: 'forward',
    createdAt: now,
    updatedAt: now,
  };
}

export async function createMovement(
  timeSignature: string,
): Promise<ChordMovement> {
  const movement = newMovement(timeSignature);
  await db.chordMovements.add(movement);
  return movement;
}

/**
 * Change some fields of a movement, stamping `updatedAt`.
 *
 * THE STAMP IS NOT THE CALLER'S JOB. A screen that forgot it would
 * leave the list ordered by when a movement was last saved from
 * somewhere else, which is the kind of wrong nobody looks for.
 */
export async function updateMovement(
  id: string,
  changes: Partial<Omit<ChordMovement, 'id' | 'createdAt'>>,
  now = Date.now(),
): Promise<void> {
  await db.chordMovements.update(id, { ...changes, updatedAt: now });
}

export async function deleteMovement(id: string): Promise<void> {
  await db.chordMovements.delete(id);
}

/** Every movement, most recently touched first. */
export async function listMovements(): Promise<ChordMovement[]> {
  const rows = await db.chordMovements.toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getMovement(id: string): Promise<ChordMovement | undefined> {
  return db.chordMovements.get(id);
}

/** A placement on a movement's one grid. */
export function movementPlacement(
  fields: Omit<ChordPlacement, 'id' | 'arrangementId'>,
): ChordPlacement {
  return { id: crypto.randomUUID(), arrangementId: MOVEMENT_ARRANGEMENT_ID, ...fields };
}
