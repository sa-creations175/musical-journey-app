import type { SongKey, SongKeyState } from '../../../lib/db';
import { CIRCLE_OF_FOURTHS_KEYS } from './keys';
import { spellKey, type Spelling } from '../../../lib/spelling';
import { keyDueState, stateHoldsRung, type DueWindows } from './keySpacing';

/**
 * The primitives the stage-advancement rules read about a key: which
 * quadrant of the circle of fourths it sits in, and whether the user
 * currently holds it.
 *
 * ---------------------------------------------------------------
 * WHY THESE LIVE TOGETHER, AND WHY THEY ARE EXTRACTED AT ALL
 *
 * There are two ladders in this codebase that both describe how far
 * a song has come. `computeSongLevelState` derives learning /
 * comfortable / solid / cross_key / internalized from the matrix at
 * read time; `songs.stage` stores learning / comfortable / cross-key
 * / internalized and is what the user advances by hand.
 *
 * They are NOT the same claim and must not be collapsed by calling
 * one from the other. `computeSongLevelState`'s Internalized is "3+
 * keys at Solid with the lived-with gate satisfied"; the stage
 * ladder's Internalized is "the four quadrant keys held, plus one
 * clean at-tempo run in each of the remaining eight". Routing either
 * through the other would force one definition to bend, and both
 * would end up meaning something nobody chose.
 *
 * What they SHOULD share is the vocabulary underneath — what counts
 * as comfortable, what counts as still held, which keys are far
 * apart. That is this file. Shared primitives, separate conclusions.
 * ---------------------------------------------------------------
 */

/** Keys per quadrant, and how many quadrants that yields. Both
 *  derived from the cycle's own length so neither can drift from it. */
export const QUADRANT_SIZE = 3;
export const QUADRANT_COUNT = CIRCLE_OF_FOURTHS_KEYS.length / QUADRANT_SIZE;

/**
 * The circle of fourths cut into four consecutive runs of three.
 *
 * ---------------------------------------------------------------
 * DERIVED, NEVER WRITTEN OUT — AND THE REASON IS A LIVE TRAP.
 *
 * The design for these quadrants was stated as:
 *
 *     C F B♭ / E♭ A♭ D♭ / G♭ B E / A D G
 *
 * Written out by hand that way, the third quadrant would match
 * NOTHING. `songKeys.keyName` holds the matrix vocabulary, which
 * spells that key **F#** — see the notation note in ./keys.ts. And
 * the codebase contains a SECOND circle-of-fourths module,
 * repertoire/circleOfFourths.ts, which spells it **Gb** and whose
 * `canonicaliseKey` maps 'F#' → 'Gb', i.e. INTO the vocabulary the
 * matrix does not use.
 *
 * So a hand-written table is not merely duplication: it is a rule
 * that silently never fires on a twelfth of the keyboard, with no
 * error and nothing on screen to show for it — the exact failure
 * shape that `atTargetTempo` had. Slicing the canonical array cannot
 * express the bug, which is a stronger guarantee than a comment
 * warning about it.
 *
 * The spelling split between the two modules is a real problem and
 * outlives this file; it is logged on the build queue alongside
 * per-song enharmonic spelling, which shares its root.
 * ---------------------------------------------------------------
 *
 * Quadrants rather than a count because SPREAD is the claim. C, F
 * and Bb share most of their shapes, so three adjacent keys prove
 * much less than three spread ones — and since the cut is relative
 * to the fixed cycle rather than to the song, each song's original
 * key lands in a different quadrant and so demands a different set.
 */
export const KEY_QUADRANTS: ReadonlyArray<ReadonlyArray<string>> =
  Array.from({ length: QUADRANT_COUNT }, (_, i) =>
    CIRCLE_OF_FOURTHS_KEYS.slice(i * QUADRANT_SIZE, (i + 1) * QUADRANT_SIZE));

/** Human-readable member list, e.g. "C · F · B♭". Derived from the
 *  quadrant itself so the label can never name a key the quadrant
 *  does not contain.
 *
 *  Takes a spelling because it is a LABEL — nothing renders it today,
 *  which is exactly why it is worth converting now: an unspelled label
 *  waiting to be used is a bug scheduled for whoever uses it. */
export function quadrantLabel(quadrant: number, spelling: Spelling): string {
  return (KEY_QUADRANTS[quadrant] ?? [])
    .map(k => spellKey(k, spelling))
    .join(' · ');
}

/**
 * Which quadrant a key sits in, or null when the key is not one of
 * the twelve the matrix recognises.
 *
 * Null is REACHABLE, not defensive padding: `materialise` leaves
 * non-canonical leftover rows barren rather than deleting them, and
 * a song record can carry a freeform key string. Returning null lets
 * a caller decline to count something it cannot place, rather than
 * silently filing it under quadrant 0.
 */
export function quadrantOf(keyName: string): number | null {
  const idx = CIRCLE_OF_FOURTHS_KEYS.indexOf(keyName);
  if (idx < 0) return null;
  return Math.floor(idx / QUADRANT_SIZE);
}

/** The set of quadrants covered by a list of key names. Unrecognised
 *  spellings contribute nothing rather than throwing — the caller
 *  sees a smaller set, which reads as "not yet covered" rather than
 *  as a crash mid-render. */
export function coveredQuadrants(keyNames: Iterable<string>): Set<number> {
  const out = new Set<number>();
  for (const name of keyNames) {
    const q = quadrantOf(name);
    if (q !== null) out.add(q);
  }
  return out;
}

/**
 * Comfortable or better.
 *
 * `solid` MUST count. It is not a sibling of comfortable but a
 * superset of it: `computeKeyStateFromCells` returns 'solid' only
 * when every cell is comfortable AND the whole-song test has passed,
 * so a solid key is a comfortable key that has additionally proved
 * itself. A predicate written as `state === 'comfortable'` would
 * exclude precisely the keys the user has taken furthest.
 */
export function isComfortableOrBetter(state: SongKeyState): boolean {
  return state === 'comfortable' || state === 'solid';
}

/**
 * Whether the user still holds this key right now.
 *
 * Comfortable-or-better AND not overdue.
 *
 * ---------------------------------------------------------------
 * THIS USED TO ASK A FLAT QUESTION AND NO LONGER DOES.
 *
 * The old rule was `computeSolidDecayState(...) !== 'lapsed'` — 30
 * days since last engagement, every key on every song, however many
 * times it had been proven. A song proven five times came due exactly
 * as often as one that scraped through once: the opposite of what
 * spacing is for, in an app that already drills every other module
 * with a real spacing engine.
 *
 * It now reads a due date that STRETCHES with each pass and shortens
 * on a failed test, with both windows around it under the user's
 * control. Only `overdue` — past due AND past grace — stops holding
 * the rung; due and due-soon are warnings with time left to act.
 *
 * `nextDueAt` is passed in rather than read here so this stays pure
 * and synchronous. It is called inside the stage rules, which run in
 * a `useMemo` during render, and a Dexie read there is a different
 * kind of bug.
 */
export function isHeld(
  songKey: SongKey,
  now: number,
  /** When this key is next due, or null when never proven. */
  nextDueAt: number | null,
  windows: DueWindows,
): boolean {
  if (!isComfortableOrBetter(songKey.keyState)) return false;
  return stateHoldsRung(keyDueState(nextDueAt, now, windows));
}

/**
 * Which key is holding each quadrant, and which have gone overdue.
 *
 * The shape the demotion notice needs: showing what is still standing
 * beside what fell is the point, because a list of absences alone does
 * not say where the song is.
 *
 * A quadrant reports the FIRST held key it finds rather than all of
 * them. The rule asks for one key per quadrant, so a second adds
 * nothing to the claim — and naming three keys where one is required
 * would imply the others were also lost when one lapses.
 */
export function quadrantHoldings(
  songKeys: ReadonlyArray<SongKey>,
  now: number,
  dueByKeyId: ReadonlyMap<string, number | null>,
  windows: DueWindows,
): { heldByQuadrant: Array<string | null>; lapsedKeys: string[] } {
  const heldByQuadrant: Array<string | null> = KEY_QUADRANTS.map(() => null);
  const lapsedKeys: string[] = [];

  for (const key of songKeys) {
    if (!isComfortableOrBetter(key.keyState)) continue;
    const due = dueByKeyId.get(key.id) ?? null;
    const held = isHeld(key, now, due, windows);
    if (!held) {
      lapsedKeys.push(key.keyName);
      continue;
    }
    const q = quadrantOf(key.keyName);
    if (q === null) continue;
    if (heldByQuadrant[q] === null) heldByQuadrant[q] = key.keyName;
  }

  return { heldByQuadrant, lapsedKeys };
}
