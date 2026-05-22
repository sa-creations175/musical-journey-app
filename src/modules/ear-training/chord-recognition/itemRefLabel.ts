/**
 * Readable labels for chord-recognition attempt itemRefs.
 *
 * Item-refs use the `chordId:inversion` shape from inversionUtils
 * (e.g. "min:0", "maj7:1"). Raw, they read as cryptic codes — this
 * maps them to the chord's display name (and inversion when not root)
 * for surfaces that list a block's items, like the session prep
 * screen's per-item breakdown.
 */
import { CHORD_SEEDS } from './seed';
import { INVERSION_LABEL, parseAttemptItemId } from './inversionUtils';

const NAME_BY_ID: ReadonlyMap<string, string> = new Map(
  CHORD_SEEDS.map(c => [c.id, c.name]),
);

/**
 * "min:0" → "Minor"; "maj7:1" → "Major 7 · 1st inversion".
 * Unknown chord ids fall back to the bare id (never the raw `:N`).
 */
export function labelForChordRecognitionItemRef(itemRef: string): string {
  const { chordId, inversion } = parseAttemptItemId(itemRef);
  const name = NAME_BY_ID.get(chordId) ?? chordId;
  return inversion === 0 ? name : `${name} · ${INVERSION_LABEL[inversion]}`;
}
