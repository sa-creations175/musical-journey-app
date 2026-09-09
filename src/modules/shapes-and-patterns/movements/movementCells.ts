/**
 * A movement's place in the grid.
 *
 * =====================================================================
 * RULING 20: NOTHING SPECIAL. A movement is rated per key, twelve keys,
 * the same four ratings, the same spacing engine, the same Progress
 * Details, the same place in the schedule as everything else on Shapes
 * & Patterns.
 *
 * That is a claim about itemRefs more than about screens. Everything
 * downstream of a cell — the spacing rows, the drill session, the
 * session budget, the time invested, the dashboard's leaf labels — keys
 * on the `vl:` prefix and treats the rest as opaque. So a movement's
 * cell is a `vl:` ref and nothing else has to learn what a movement is.
 *
 * =====================================================================
 * THREE SEGMENTS, WHICH IS THE SHAPE THAT ROUND-TRIPS.
 *
 *     vl:{movementId}:{keyName}
 *
 * `parseShapesItemRef` reads a `vl:` ref as `{patternId, keyName}` with
 * the key always last, and `itemRefFor` rebuilds it as
 * `vl:{patternId}:{keyName}`. A movement id in the patternId slot goes
 * out and comes back unchanged; a four-segment shape would not, because
 * the descriptor has nowhere to keep the middle.
 *
 * `parseVoiceLeadingItemRef` needs four segments and a catalog pattern,
 * so it returns null here — correctly. A movement has no sub-cell
 * dimensions: no starting position, no voicing type, no inversion.
 * ONE COLUMN, which is ruling 20's other half.
 *
 * A movement id is a uuid, so it cannot collide with a catalog
 * pattern's id.
 * =====================================================================
 */
import type { ChordMovement } from '../../../lib/db';
import type { Spelling } from '../../../lib/spelling';
import { spellKey } from '../../../lib/spelling';
import { KEYS_CIRCLE_OF_FOURTHS, type VoiceLeadingGridRow } from '../catalog';

/** What an unnamed movement is called wherever one has to be named. */
export const UNNAMED_MOVEMENT = 'Unnamed movement';

/** One cell: this movement, in this key. */
export function movementItemRef(movementId: string, keyName: string): string {
  return `vl:${movementId}:${keyName}`;
}

/** The movement a cell belongs to, or null where the ref is a catalog
 *  pattern's rather than a movement's. Membership decides — the shape
 *  alone cannot, because a legacy pattern-level ref wears it too. */
export function movementIdForRef(
  itemRef: string, known: ReadonlySet<string>,
): string | null {
  const parts = itemRef.split(':');
  if (parts.length !== 3 || parts[0] !== 'vl') return null;
  return known.has(parts[1]) ? parts[1] : null;
}

/**
 * The movement's one grid row.
 *
 * ONE, not several. A catalog pattern fans out into starting positions
 * and voicing types because those are different things under the hands;
 * a movement is the thing Silas pressed, and there is only one of it.
 * The label is its name because there is nothing else to distinguish a
 * row that has no siblings.
 */
export function movementGridRows(movement: ChordMovement): VoiceLeadingGridRow[] {
  return [{
    rowId: movement.id,
    label: movement.name || UNNAMED_MOVEMENT,
    itemRefForKey: (keyName: string) => movementItemRef(movement.id, keyName),
  }];
}

/** Every cell a movement contributes — twelve keys, one row. */
export function movementCellRefs(movementId: string): string[] {
  return KEYS_CIRCLE_OF_FOURTHS.map(k => movementItemRef(movementId, k));
}

/** "Walk-up in E♭" — what Progress Details and the drill panel call a
 *  movement's cell. Same shape as a pattern cell's label. */
export function movementCellLabel(
  movement: ChordMovement, keyName: string, spelling: Spelling,
): string {
  return `${movement.name || UNNAMED_MOVEMENT} in ${spellKey(keyName, spelling)}`;
}
