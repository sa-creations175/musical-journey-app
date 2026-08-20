import type { SequenceBreak, SequenceView } from '../../lib/db';

/**
 * The Progression Patterns sequence as an ANNOTATED VIEW over the grid.
 *
 * The grid stays the source of truth. Nothing here can delete, move or
 * alter a chord — hiding a token removes it from this strip and from
 * nowhere else. That constraint is what makes the feature tractable,
 * and it is why pattern DETECTION deliberately keeps reading the true
 * grid: if hiding changed what was detected, you could manufacture a
 * ii-V-I by hiding the chord in between, and the app would be lying
 * about your own music.
 *
 * ANCHORING. Breaks and hides key on `ChordPlacement.id` — a persistent
 * uuid — not on a position. Positional anchoring would silently
 * re-phrase the whole strip the moment a chord was added to an early
 * bar, which is exactly the failure this design exists to avoid. Ids
 * survive adding chords, reordering bars and deleting bars.
 *
 * WHY BREAKS FOLLOW THEIR CHORD, when lyrics deliberately do not follow
 * their bar. The anchor is a different kind of thing:
 *
 *   · a lyric anchors to a CELL — a position the user chose — so when
 *     structure changes it must NOT chase, or the app has moved work
 *     the user placed
 *   · a break anchors to a CHORD — a thing — so travelling with that
 *     chord is staying ATTACHED, not shifting. A break that did not
 *     follow its chord through a bar reorder would be the violation.
 *
 * Same principle, opposite surface behaviour. See the plan doc beside
 * "nothing shifts on its own".
 *
 * DELETION NEEDS NO SPECIAL CASE. Delete the chord a break sits on and
 * the break has no anchor, so the phrases it separated merge — and
 * merging combines their notes, exactly as deleting the break by hand
 * does. Nothing disappears unless the user deletes it.
 */

/** A phrase: the run of tokens between two breaks. */
export interface SequencePhrase {
  /** Placement ids to render, hidden ones already removed. */
  placementIds: string[];
  /** How this phrase ends. `end` is the final phrase. */
  endKind: 'separator' | 'row' | 'end';
  /** The break that ends it, so the UI can edit or remove it. */
  endsAfterPlacementId?: string;
  note?: string;
}

/**
 * Whether a phrase gets a note field.
 *
 * ---------------------------------------------------------------
 * A NOTE BELONGS TO A LINE, NOT TO A GROUPING
 *
 * Both surfaces used to ask `phrase.note || editing`, which offered a
 * field on EVERY phrase — including one ended by a separator. And the
 * field is `basis-full` in edit mode (deliberately: a textarea that
 * grew as you typed would otherwise move the wrap points and reflow the
 * chords of every following phrase, on every keystroke). In a wrapping
 * row, `basis-full` forces a full-width line.
 *
 * So the note field was what broke the line, not the separator. Five
 * same-line groupings became five lines, each with a field nobody
 * asked for.
 *
 * A separator divides a phrase WITHIN a line. A row break starts a new
 * one, and that is where an annotation belongs.
 * ---------------------------------------------------------------
 *
 * An existing note on a separator still renders. Dropping it outright
 * would leave writing stored but unreachable — the same unrecoverable
 * state `pruneDeletedPlacements` exists to prevent — so it stays
 * editable, and moving it elsewhere is a deliberate act.
 *
 * Pure, and shared, because the duplicated condition is how the two
 * surfaces came to have the identical bug.
 */
export function shouldOfferNote(
  phrase: Pick<SequencePhrase, 'note' | 'endKind'>,
  editing: boolean,
  hasVisibleTokens: boolean,
): boolean {
  // Nothing on screen to annotate.
  if (!hasVisibleTokens) return false;
  // Never strand writing that already exists.
  if (phrase.note) return true;
  // An empty field is offered only where a note would belong.
  return editing && phrase.endKind !== 'separator';
}

export const EMPTY_SEQUENCE_VIEW: SequenceView = { breaks: [], hidden: [] };

/** Notes combining keep both, visibly. A plain space would read as one
 *  note the user had written that way. */
const NOTE_JOIN = ' · ';

function joinNotes(...notes: Array<string | undefined>): string | undefined {
  const kept = notes.map(n => n?.trim()).filter((n): n is string => !!n);
  return kept.length > 0 ? kept.join(NOTE_JOIN) : undefined;
}

/**
 * Split the sequence into phrases, applying breaks and hides.
 *
 * `order` is the live sequence: one placement id per token, in reading
 * order. Anything in `view` naming an id outside it is ORPHANED — its
 * chord was deleted — and its note is carried forward into the next
 * surviving phrase rather than dropped. `breaks` is kept in sequence
 * order on write, which is what makes "the next one" well-defined
 * without knowing where the orphan used to sit.
 *
 * A break on a HIDDEN token still breaks: hiding is about what is
 * drawn, not about discarding the phrasing decision.
 */
export function buildPhrases(
  order: ReadonlyArray<string>,
  view: SequenceView = EMPTY_SEQUENCE_VIEW,
): SequencePhrase[] {
  const live = new Set(order);
  const hidden = new Set(view.hidden);
  const breakAt = new Map<string, SequenceBreak>();
  // Orphans first, so their notes are already pending when the walk
  // reaches the phrase that absorbs them.
  let carried: string | undefined;
  for (const b of view.breaks) {
    if (live.has(b.afterPlacementId)) breakAt.set(b.afterPlacementId, b);
    else carried = joinNotes(carried, b.note);
  }

  const phrases: SequencePhrase[] = [];
  let current: string[] = [];
  for (const id of order) {
    if (!hidden.has(id)) current.push(id);
    const brk = breakAt.get(id);
    if (!brk) continue;
    phrases.push({
      placementIds: current,
      endKind: brk.kind,
      endsAfterPlacementId: brk.afterPlacementId,
      note: joinNotes(carried, brk.note),
    });
    carried = undefined;
    current = [];
  }
  phrases.push({
    placementIds: current,
    endKind: 'end',
    note: joinNotes(carried, view.tailNote),
  });
  return phrases;
}

/** Order breaks by where they sit in the sequence, so "the next break"
 *  is meaningful after any edit. */
function sorted(
  breaks: ReadonlyArray<SequenceBreak>,
  order: ReadonlyArray<string>,
): SequenceBreak[] {
  const at = new Map(order.map((id, i) => [id, i]));
  // Orphans keep their relative order and sort last, so they still
  // carry forward predictably.
  return [...breaks].sort(
    (a, b) =>
      (at.get(a.afterPlacementId) ?? Number.MAX_SAFE_INTEGER) -
      (at.get(b.afterPlacementId) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Add a break after a token, or change an existing one's kind. The
 *  note is preserved — changing separator to row is not a delete. */
export function setBreak(
  view: SequenceView,
  afterPlacementId: string,
  kind: 'separator' | 'row',
  order: ReadonlyArray<string>,
): SequenceView {
  const existing = view.breaks.find(b => b.afterPlacementId === afterPlacementId);
  const next = existing
    ? view.breaks.map(b =>
        b.afterPlacementId === afterPlacementId ? { ...b, kind } : b,
      )
    : [...view.breaks, { afterPlacementId, kind }];
  return { ...view, breaks: sorted(next, order) };
}

/**
 * Remove a break, merging the phrase it ended into the one after it.
 *
 * The two notes COMBINE rather than one winning: a break is a boundary
 * between two things the user described separately, and removing the
 * boundary is not a reason to discard either description.
 */
export function removeBreak(
  view: SequenceView,
  afterPlacementId: string,
  order: ReadonlyArray<string>,
): SequenceView {
  const ordered = sorted(view.breaks, order);
  const i = ordered.findIndex(b => b.afterPlacementId === afterPlacementId);
  if (i < 0) return { ...view };
  const removed = ordered[i];
  const rest = ordered.filter((_, n) => n !== i);
  if (i < rest.length) {
    // Merge forward into the break that now ends the joined phrase.
    return {
      ...view,
      breaks: rest.map((b, n) =>
        n === i ? { ...b, note: joinNotes(removed.note, b.note) } : b,
      ),
    };
  }
  // It was the last break, so the joined phrase is the tail.
  return {
    ...view,
    breaks: rest,
    tailNote: joinNotes(removed.note, view.tailNote),
  };
}

/**
 * Drop every annotation anchored to a chord that has just been deleted
 * from the grid.
 *
 * DELETION FLOWS ONE DIRECTION. The lead sheet is the source of truth,
 * so removing a chord there removes its strip annotations too. Without
 * this, a hide on a deleted chord survives forever: it filters nothing,
 * renders nothing, and no UI can reach it, so it can never be undone.
 * That is the unrecoverable state this closes.
 *
 * DELETING A CHORD IS NOT DELETING A NOTE. A break's note describes the
 * phrase ENDING at it, and that phrase still exists — it has merely
 * lost its boundary. So breaks are removed through `removeBreak`, which
 * merges the note forward into whatever break now ends the joined
 * phrase (or into the tail). A raw filter would silently destroy
 * writing the user did, which is the same class of loss the module's
 * "nothing disappears unless the user deletes it" rule exists to
 * prevent.
 *
 * `orderBefore` is the sequence as it stood BEFORE the deletion, so the
 * removed breaks still have positions and each note merges into the
 * right neighbour. Passing the post-deletion order would sort the dead
 * anchors last and pile their notes onto the tail.
 *
 * Returns the SAME view object when nothing was anchored to the deleted
 * chords, so a caller can skip a pointless write.
 */
export function pruneDeletedPlacements(
  view: SequenceView,
  deletedIds: ReadonlyArray<string>,
  orderBefore: ReadonlyArray<string>,
): SequenceView {
  const deleted = new Set(deletedIds);
  if (deleted.size === 0) return view;

  // Sequence order, so each merge lands on the break that now ends the
  // joined phrase rather than on an arbitrary one.
  const anchors = sorted(view.breaks, orderBefore)
    .map(b => b.afterPlacementId)
    .filter(id => deleted.has(id));
  const hiddenChanged = view.hidden.some(id => deleted.has(id));
  if (anchors.length === 0 && !hiddenChanged) return view;

  let next = view;
  for (const id of anchors) next = removeBreak(next, id, orderBefore);
  return { ...next, hidden: next.hidden.filter(id => !deleted.has(id)) };
}

/** Show or hide one token in the strip. The chord is untouched. */
export function toggleHidden(
  view: SequenceView,
  placementId: string,
): SequenceView {
  const hidden = view.hidden.includes(placementId)
    ? view.hidden.filter(id => id !== placementId)
    : [...view.hidden, placementId];
  return { ...view, hidden };
}

/** Write a phrase's note. `undefined` afterPlacementId targets the
 *  final phrase, which has no break to hang it on. */
export function setPhraseNote(
  view: SequenceView,
  afterPlacementId: string | undefined,
  note: string,
): SequenceView {
  const clean = note.trim() === '' ? undefined : note;
  if (afterPlacementId === undefined) return { ...view, tailNote: clean };
  return {
    ...view,
    breaks: view.breaks.map(b =>
      b.afterPlacementId === afterPlacementId ? { ...b, note: clean } : b,
    ),
  };
}

/** True when the view carries nothing worth storing. */
export function isEmptyView(view: SequenceView): boolean {
  return (
    view.breaks.length === 0 && view.hidden.length === 0 && !view.tailNote
  );
}
