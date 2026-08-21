/**
 * Circle-of-fourths key sequencing for the "expand keys" progression
 * path, and the app's one input-normaliser for key names.
 *
 * Order:
 *
 *   C → F → Bb → Eb → Ab → Db → F# → B → E → A → D → G → (back to C)
 *
 * =====================================================================
 * THIS MODULE NO LONGER OWNS A KEY VOCABULARY.
 *
 * It used to hold its own twelve keys, spelling the sixth one **Gb**,
 * while `matrix/keys.ts` spelled it **F#** — and `songKeys.keyName`,
 * `drillSkills.keyName` and every chord-shape / voice-leading itemRef
 * stored the F# form. Two vocabularies for one wheel meant anything
 * written against the wrong one matched zero rows and failed silently,
 * with nothing on screen to show for it. `matrix/keyProgress.ts`
 * documents a near-miss where a hand-written Gb table would have made a
 * stage rule never fire on a twelfth of the keyboard.
 *
 * There is now ONE identity vocabulary — `CIRCLE_OF_FOURTHS_KEYS` in
 * `matrix/keys.ts` — and this module re-exports it rather than
 * restating it. A second copy cannot drift from a copy that does not
 * exist.
 *
 * Gb has not been lost, it has been demoted from an identity to a
 * SPELLING. It is what the user reads by default; `lib/spelling.ts`
 * produces it at render. See that module's header for why the identity
 * must stay put.
 * =====================================================================
 */

import { CIRCLE_OF_FOURTHS_KEYS } from './matrix/keys';
import { pitchClassOf } from '../../lib/spelling';

/** The wheel, starting at C. Twelve entries, no enharmonic duplicates.
 *  THE IDENTITY VOCABULARY — ASCII accidentals, and the exact strings
 *  stored in `songKeys.keyName` and embedded in itemRefs. Never render
 *  these directly; put them through `spellKey` first. */
export const CIRCLE_OF_FOURTHS: ReadonlyArray<string> = CIRCLE_OF_FOURTHS_KEYS;

/** Identity key name by pitch class. Derived from the vocabulary rather
 *  than written out, so `canonicaliseKey` cannot return a name the
 *  wheel does not contain — the failure the old hand-written map made
 *  possible in the other direction. */
const IDENTITY_BY_PITCH_CLASS: ReadonlyMap<number, string> = new Map(
  CIRCLE_OF_FOURTHS.map(k => [pitchClassOf(k) as number, k]),
);

/**
 * The identity name for a pitch class. The counterpart to `spellNote`:
 * that one answers "what should this be called", this one answers
 * "which of the twelve stored key names is this".
 *
 * Returns null only for a pitch class outside 0–11, which callers doing
 * modular arithmetic cannot produce.
 */
export function identityKeyForPitchClass(pitchClass: number): string | null {
  return IDENTITY_BY_PITCH_CLASS.get(((pitchClass % 12) + 12) % 12) ?? null;
}

/**
 * Map any accepted spelling of a major-key root to the app's identity
 * form. Returns null when the input does not resolve — caller decides
 * how to handle the freeform case.
 *
 * INPUT ONLY. This is how a pasted, imported or legacy key name is
 * brought into the vocabulary before it is used as a lookup. It is NOT
 * a display function and its output must not be rendered: it answers
 * "which key is this", not "what should this be called". The second
 * question belongs to `spellKey`, and routing display through here is
 * how F# would reach a screen under a flats default.
 *
 * Accepts sharps, flats, the four theoretical names (Cb, Fb, E#, B#)
 * and the Unicode accidental signs, because `pitchClassOf` does — so a
 * name that has already been through a display path still resolves.
 */
export function canonicaliseKey(rawKey: string): string | null {
  const pc = pitchClassOf(rawKey);
  if (pc === null) return null;
  return IDENTITY_BY_PITCH_CLASS.get(pc) ?? null;
}

/**
 * Walk the circle of fourths starting one step ahead of `originalKey`
 * and return every other key, in order, ending one step short of a
 * full rotation. Output excludes the original key itself, and is in the
 * identity vocabulary — spell it before showing it.
 *
 * Returns an empty array when `originalKey` doesn't normalise to any
 * known key — defensive for goal-of-month songs with a freeform key
 * string. Callers should treat `[]` as "we don't know how to sequence
 * this song's keys" and surface a UI fallback.
 *
 * @example
 *   generateCircleOfFourthsSequence('C')
 *   // → ['F','Bb','Eb','Ab','Db','F#','B','E','A','D','G']
 *
 *   generateCircleOfFourthsSequence('Gb')   // Gb canonicalises to F#
 *   // → ['B','E','A','D','G','C','F','Bb','Eb','Ab','Db']
 */
export function generateCircleOfFourthsSequence(originalKey: string): string[] {
  const canonical = canonicaliseKey(originalKey);
  if (!canonical) return [];
  const start = CIRCLE_OF_FOURTHS.indexOf(canonical);
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = 1; i < CIRCLE_OF_FOURTHS.length; i++) {
    out.push(CIRCLE_OF_FOURTHS[(start + i) % CIRCLE_OF_FOURTHS.length]);
  }
  return out;
}
