import type { SequenceView, SongSection } from '../../lib/db';
import { materializeChordPlacements } from './barGrid';

/**
 * Keeping strip annotations attached to real chords across the moment a
 * section stops being legacy.
 *
 * THE FAILURE THIS EXISTS TO STOP. A section with no stored
 * `chordPlacements` renders through the legacy packer, which gives each
 * chord a SYNTHETIC id — `legacy:phraseId:beatId`. Annotate the strip
 * there and `commitSequenceView` materialises the section in the same
 * write, replacing every id with a `mat-…` one. The annotation was
 * written against ids that ceased to exist in the same transaction: a
 * hide that hides nothing, a break that breaks nothing, and no message,
 * because from the app's point of view the write succeeded.
 *
 * WHY THE REMAP IS POSITIONAL AND NOT BY ID. `resolveLegacyPlacementId`
 * can derive a `mat-` id from a legacy one, and that looks like the
 * obvious answer. It is not safe here: `normalizePhrase` MINTS FRESH
 * RANDOM BEAT IDS on every call for a phrase that has no stored `beats`
 * array, so the id embedded in the annotation came from a different
 * call than the one materialisation is about to make. Deriving would
 * produce a `mat-` id that matches nothing.
 *
 * Both sequences are the same thing counted the same way — one entry
 * per source chord, in document order, tied continuations skipped — so
 * position is the correspondence that actually holds. Nothing here
 * depends on an id being stable, because none of them are.
 */

/**
 * Pair each legacy token with the materialised placement that replaced
 * it, BY POSITION.
 *
 * Extra entries on either side are left unpaired rather than guessed
 * at: a length mismatch means the two walks disagree about what a chord
 * is, and inventing a pairing would move an annotation onto an
 * unrelated chord — worse than leaving it orphaned, because it would be
 * wrong instead of absent.
 */
export function zipIdRemap(
  legacyOrder: ReadonlyArray<string>,
  materialisedOrder: ReadonlyArray<string>,
): Map<string, string> {
  const out = new Map<string, string>();
  const n = Math.min(legacyOrder.length, materialisedOrder.length);
  for (let i = 0; i < n; i++) {
    if (legacyOrder[i] !== materialisedOrder[i]) {
      out.set(legacyOrder[i], materialisedOrder[i]);
    }
  }
  return out;
}

/**
 * Rewrite every anchor in a view through `idMap`. Ids with no entry are
 * left exactly as they are — an unmapped id is no worse off than it was,
 * and silently dropping it would destroy the annotation outright.
 *
 * Returns the SAME view object when nothing needed rewriting, so a
 * caller can skip a pointless write.
 */
export function remapAnnotationIds(
  view: SequenceView,
  idMap: ReadonlyMap<string, string>,
): SequenceView {
  if (idMap.size === 0) return view;
  const touches =
    view.hidden.some(id => idMap.has(id)) ||
    view.breaks.some(b => idMap.has(b.afterPlacementId));
  if (!touches) return view;
  return {
    ...view,
    hidden: view.hidden.map(id => idMap.get(id) ?? id),
    breaks: view.breaks.map(b =>
      idMap.has(b.afterPlacementId)
        ? { ...b, afterPlacementId: idMap.get(b.afterPlacementId)! }
        : b,
    ),
  };
}

export interface SequenceCommitInput {
  section: SongSection;
  beatsPerBar: number;
  eighths: boolean;
  activeArrangementId: string;
  /** The strip's live token order at the time the annotation was made.
   *  On a legacy section these are `legacy:…` ids. */
  legacyOrder: ReadonlyArray<string>;
  /** The annotation the user just made. */
  next: SequenceView;
}

/**
 * The patch that writes an annotation, materialising the section first
 * when it is still legacy and carrying the annotation across the id
 * change in the same write.
 *
 * Pure, so the thing that used to fail silently can be asserted.
 */
export function sequenceViewCommitPatch(
  input: SequenceCommitInput,
): Partial<SongSection> {
  const { section, beatsPerBar, eighths, activeArrangementId, legacyOrder, next } =
    input;

  if (section.chordPlacements !== undefined) return { sequenceView: next };

  const chordPlacements = materializeChordPlacements(
    section,
    beatsPerBar,
    eighths,
  );
  const materialisedOrder = chordPlacements
    .filter(p => p.arrangementId === activeArrangementId)
    .map(p => p.id);

  return {
    chordPlacements,
    sequenceView: remapAnnotationIds(
      next,
      zipIdRemap(legacyOrder, materialisedOrder),
    ),
  };
}
