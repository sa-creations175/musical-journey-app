/**
 * What a recorded movement IS, in the app's own vocabulary.
 *
 * =====================================================================
 * ONE FIELD, TWO VOCABULARIES, AND NEITHER IS THE NORMAL CASE.
 *
 * `mode:dorian` says this movement is an example of Dorian; the Scales
 * & Modes drill plays it and nothing else. `progression:major-251` says
 * it is an example of an entry on the shared progression list, which is
 * the Chord Movements & Passes grid.
 *
 * MOST MOVEMENTS ARE NEITHER. A movement is a thing Silas played and
 * wanted to keep, not an example of a category, and the untagged case
 * is the one to design for: the editor opens on "Nothing yet" and the
 * field stays absent until he says otherwise.
 *
 * =====================================================================
 * THE BUILT-IN MODE VAMPS RETIRED BECAUSE OF THIS.
 *
 * Ruled 10 Sep 2026: a mode plays only what Silas has recorded and
 * tagged with it. The vamps were written by the app — a Dorian loop
 * nobody had played — and the point of the drill is to sit inside a
 * sound he knows from a song. So the tag is not a label on a movement;
 * it is the whole of what the modes drill has to play.
 * =====================================================================
 */
import type { ChordMovement } from '../../../lib/db';
import { MODES } from '../../ear-training/scales-modes/catalog';
import {
  SHARED_PROGRESSIONS,
} from '../../ear-training/chord-progressions/sharedList';

/** A tag, parsed. Null for absent or unreadable. */
export type MovementTag =
  | { kind: 'mode'; id: string }
  | { kind: 'progression'; id: string };

export function parseMovementTag(raw: string | undefined): MovementTag | null {
  if (raw === undefined || raw === '') return null;
  const at = raw.indexOf(':');
  if (at < 0) return null;
  const kind = raw.slice(0, at);
  const id = raw.slice(at + 1);
  if (kind === 'mode' && MODES.some(m => m.id === id)) return { kind: 'mode', id };
  if (kind === 'progression' && SHARED_PROGRESSIONS.some(p => p.id === id)) {
    return { kind: 'progression', id };
  }
  // AN UNREADABLE TAG READS AS UNTAGGED rather than throwing. A mode or
  // a progression can be retired from a catalog while a movement still
  // names it, and a drill that crashed over that would be worse than
  // one that quietly has nothing to play.
  return null;
}

/** The stored string for a tag. */
export function movementTagValue(tag: MovementTag): string {
  return `${tag.kind}:${tag.id}`;
}

/** What the tag says on screen. */
export function movementTagLabel(tag: MovementTag): string {
  if (tag.kind === 'mode') {
    return MODES.find(m => m.id === tag.id)?.name ?? tag.id;
  }
  return SHARED_PROGRESSIONS.find(p => p.id === tag.id)?.name ?? tag.id;
}

/** Every tag the editor offers, in the order the two catalogs list. */
export function movementTagOptions(): Array<{
  value: string; label: string; group: 'Mode' | 'Progression';
}> {
  return [
    ...MODES.map(m => ({
      value: movementTagValue({ kind: 'mode', id: m.id }),
      label: m.name,
      group: 'Mode' as const,
    })),
    ...SHARED_PROGRESSIONS.map(p => ({
      value: movementTagValue({ kind: 'progression', id: p.id }),
      label: p.name,
      group: 'Progression' as const,
    })),
  ];
}

/**
 * The movements tagged with one thing, in the order they were recorded.
 *
 * EVERY ONE OF THEM, not the first. A mode with three recorded
 * movements has three things to sit inside, and the drill picks among
 * them rather than always playing the oldest.
 */
export function movementsTagged(
  movements: ReadonlyArray<ChordMovement>,
  tag: MovementTag,
): ChordMovement[] {
  const want = movementTagValue(tag);
  return movements.filter(m => m.tag === want);
}
