import { describe, expect, it } from 'vitest';
import type { SequenceView } from '../../../lib/db';
import {
  EMPTY_SEQUENCE_VIEW,
  buildPhrases,
  isEmptyView,
  pruneDeletedPlacements,
  removeBreak,
  setBreak,
  setPhraseNote,
  shouldOfferNote,
  toggleHidden,
} from '../sequenceView';

// `order` is the live sequence: one placement id per token. Ids are
// persistent uuids in the app; short strings here.
const ORDER = ['p0', 'p1', 'p2', 'p3', 'p4'];
const shape = (view: SequenceView, order = ORDER) =>
  buildPhrases(order, view).map(p => p.placementIds.join(''));

describe('buildPhrases — no annotations', () => {
  it('is one phrase over the whole sequence', () => {
    const phrases = buildPhrases(ORDER);
    expect(phrases).toHaveLength(1);
    expect(phrases[0].placementIds).toEqual(ORDER);
    expect(phrases[0].endKind).toBe('end');
  });

  it('handles an empty sequence', () => {
    expect(buildPhrases([])).toEqual([
      { placementIds: [], endKind: 'end', note: undefined },
    ]);
  });
});

describe('buildPhrases — breaks', () => {
  it('splits after the anchoring token, which stays in its phrase', () => {
    const v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    expect(shape(v)).toEqual(['p0p1', 'p2p3p4']);
  });

  it('carries the break kind through', () => {
    const v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'separator', ORDER);
    expect(buildPhrases(ORDER, v)[0].endKind).toBe('separator');
  });

  it('supports several, in sequence order regardless of insertion order', () => {
    let v = setBreak(EMPTY_SEQUENCE_VIEW, 'p3', 'row', ORDER);
    v = setBreak(v, 'p0', 'separator', ORDER);
    expect(shape(v)).toEqual(['p0', 'p1p2p3', 'p4']);
  });

  it('changing a break’s kind keeps its note — that is not a delete', () => {
    let v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    v = setPhraseNote(v, 'p1', 'intro');
    v = setBreak(v, 'p1', 'separator', ORDER);
    expect(buildPhrases(ORDER, v)[0]).toMatchObject({
      endKind: 'separator',
      note: 'intro',
    });
  });

  it('a break on the LAST token leaves an empty final phrase', () => {
    const v = setBreak(EMPTY_SEQUENCE_VIEW, 'p4', 'row', ORDER);
    expect(shape(v)).toEqual(['p0p1p2p3p4', '']);
  });
});

describe('buildPhrases — hiding', () => {
  it('removes the token from the strip only', () => {
    const v = toggleHidden(EMPTY_SEQUENCE_VIEW, 'p1');
    expect(shape(v)).toEqual(['p0p2p3p4']);
  });

  it('toggles back', () => {
    const v = toggleHidden(toggleHidden(EMPTY_SEQUENCE_VIEW, 'p1'), 'p1');
    expect(v.hidden).toEqual([]);
  });

  it('a break on a HIDDEN token still breaks', () => {
    // Hiding is about what is drawn, not about discarding a phrasing
    // decision the user made.
    let v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    v = toggleHidden(v, 'p1');
    expect(shape(v)).toEqual(['p0', 'p2p3p4']);
  });

  it('hiding never touches the order it was given', () => {
    const order = [...ORDER];
    buildPhrases(order, toggleHidden(EMPTY_SEQUENCE_VIEW, 'p2'));
    expect(order).toEqual(ORDER);
  });
});

describe('removeBreak — phrases merge, notes combine', () => {
  it('merges the two phrases', () => {
    let v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    v = setBreak(v, 'p3', 'row', ORDER);
    expect(shape(v)).toEqual(['p0p1', 'p2p3', 'p4']);
    v = removeBreak(v, 'p1', ORDER);
    expect(shape(v)).toEqual(['p0p1p2p3', 'p4']);
  });

  it('COMBINES the notes rather than picking a winner', () => {
    let v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    v = setBreak(v, 'p3', 'row', ORDER);
    v = setPhraseNote(v, 'p1', 'intro');
    v = setPhraseNote(v, 'p3', 'turnaround');
    v = removeBreak(v, 'p1', ORDER);
    expect(buildPhrases(ORDER, v)[0].note).toBe('intro · turnaround');
  });

  it('merges the last break’s note into the tail', () => {
    let v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    v = setPhraseNote(v, 'p1', 'intro');
    v = setPhraseNote(v, undefined, 'outro');
    v = removeBreak(v, 'p1', ORDER);
    expect(v.tailNote).toBe('intro · outro');
    expect(buildPhrases(ORDER, v)[0].note).toBe('intro · outro');
  });

  it('keeps a lone note when the other phrase has none', () => {
    let v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    v = setPhraseNote(v, 'p1', 'intro');
    v = removeBreak(v, 'p1', ORDER);
    expect(v.tailNote).toBe('intro');
  });

  it('is a no-op for a break that is not there', () => {
    const v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    expect(removeBreak(v, 'p9', ORDER)).toEqual(v);
  });
});

describe('a deleted chord needs no special case', () => {
  // Delete the chord a break sits on and the break has no anchor, so
  // the phrases merge and the notes combine — exactly as removing the
  // break by hand does.
  const SHORTER = ['p0', 'p2', 'p3', 'p4'];

  it('merges the phrases its break separated', () => {
    let v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    v = setBreak(v, 'p3', 'row', ORDER);
    expect(shape(v, SHORTER)).toEqual(['p0p2p3', 'p4']);
  });

  it('carries the orphaned note forward into the joined phrase', () => {
    let v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    v = setBreak(v, 'p3', 'row', ORDER);
    v = setPhraseNote(v, 'p1', 'intro');
    v = setPhraseNote(v, 'p3', 'turnaround');
    expect(buildPhrases(SHORTER, v)[0].note).toBe('intro · turnaround');
  });

  it('carries it to the tail when no break survives', () => {
    let v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    v = setPhraseNote(v, 'p1', 'intro');
    v = setPhraseNote(v, undefined, 'outro');
    expect(buildPhrases(SHORTER, v)).toHaveLength(1);
    expect(buildPhrases(SHORTER, v)[0].note).toBe('intro · outro');
  });

  it('a hide on a deleted chord is simply inert', () => {
    const v = toggleHidden(EMPTY_SEQUENCE_VIEW, 'p1');
    expect(shape(v, SHORTER)).toEqual(['p0p2p3p4']);
  });
});

describe('positional stability — the reason ids are the anchor', () => {
  it('adding a chord EARLIER does not re-phrase anything', () => {
    // The failure a positional anchor would cause: every break shifts
    // and the phrasing is silently wrong.
    let v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    v = setBreak(v, 'p3', 'separator', ORDER);
    const withNew = ['new', ...ORDER];
    expect(shape(v, withNew)).toEqual(['newp0p1', 'p2p3', 'p4']);
  });

  it('reordering follows the chords, because that is what breaks attach to', () => {
    const v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    const moved = ['p2', 'p3', 'p0', 'p1', 'p4'];
    expect(shape(v, moved)).toEqual(['p2p3p0p1', 'p4']);
  });
});

describe('setPhraseNote', () => {
  it('writes and clears a break note', () => {
    let v = setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER);
    v = setPhraseNote(v, 'p1', 'intro');
    expect(buildPhrases(ORDER, v)[0].note).toBe('intro');
    v = setPhraseNote(v, 'p1', '   ');
    expect(buildPhrases(ORDER, v)[0].note).toBeUndefined();
  });

  it('writes the final phrase’s note with no break to hang it on', () => {
    const v = setPhraseNote(EMPTY_SEQUENCE_VIEW, undefined, 'outro');
    expect(buildPhrases(ORDER, v)[0].note).toBe('outro');
  });
});

describe('isEmptyView', () => {
  it('is true only when nothing is annotated', () => {
    expect(isEmptyView(EMPTY_SEQUENCE_VIEW)).toBe(true);
    expect(isEmptyView(toggleHidden(EMPTY_SEQUENCE_VIEW, 'p1'))).toBe(false);
    expect(isEmptyView(setBreak(EMPTY_SEQUENCE_VIEW, 'p1', 'row', ORDER))).toBe(
      false,
    );
    expect(
      isEmptyView(setPhraseNote(EMPTY_SEQUENCE_VIEW, undefined, 'x')),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------
// pruneDeletedPlacements — deletion flows one direction
// ---------------------------------------------------------------------

describe('pruneDeletedPlacements', () => {
  it('returns the SAME object when nothing was anchored to the deleted chords', () => {
    const view: SequenceView = {
      breaks: [{ afterPlacementId: 'p1', kind: 'separator' }],
      hidden: ['p3'],
    };
    expect(pruneDeletedPlacements(view, ['p4'], ORDER)).toBe(view);
    expect(pruneDeletedPlacements(view, [], ORDER)).toBe(view);
  });

  it('drops a hide when its chord is deleted', () => {
    const view: SequenceView = { breaks: [], hidden: ['p1', 'p3'] };
    expect(pruneDeletedPlacements(view, ['p1'], ORDER).hidden).toEqual(['p3']);
  });

  it('closes the unrecoverable case: no hide survives its chord', () => {
    // An orphaned hide filters nothing, renders nothing, and no UI can
    // reach it — so it could never be undone. It must not be created.
    const view: SequenceView = { breaks: [], hidden: ['p2'] };
    const after = pruneDeletedPlacements(view, ['p2'], ORDER);
    expect(after.hidden).toEqual([]);
  });

  it('drops a break whose chord is deleted', () => {
    const view: SequenceView = {
      breaks: [{ afterPlacementId: 'p1', kind: 'separator' }],
      hidden: [],
    };
    expect(pruneDeletedPlacements(view, ['p1'], ORDER).breaks).toEqual([]);
  });

  it('CARRIES THE NOTE FORWARD — deleting a chord is not deleting a note', () => {
    // The phrase the note describes still exists; it has only lost its
    // boundary. A raw filter would destroy the writing.
    const view: SequenceView = {
      breaks: [
        { afterPlacementId: 'p1', kind: 'separator', note: 'first half' },
        { afterPlacementId: 'p3', kind: 'separator', note: 'second half' },
      ],
      hidden: [],
    };
    const after = pruneDeletedPlacements(view, ['p1'], ORDER);
    expect(after.breaks).toHaveLength(1);
    expect(after.breaks[0].afterPlacementId).toBe('p3');
    expect(after.breaks[0].note).toBe('first half · second half');
  });

  it('carries the last break\'s note into the tail', () => {
    const view: SequenceView = {
      breaks: [{ afterPlacementId: 'p3', kind: 'separator', note: 'ending' }],
      hidden: [],
      tailNote: 'coda',
    };
    const after = pruneDeletedPlacements(view, ['p3'], ORDER);
    expect(after.breaks).toEqual([]);
    expect(after.tailNote).toBe('ending · coda');
  });

  it('combines notes when two adjacent breaks are deleted together', () => {
    // A bar delete removes several chords at once.
    const view: SequenceView = {
      breaks: [
        { afterPlacementId: 'p0', kind: 'separator', note: 'a' },
        { afterPlacementId: 'p1', kind: 'separator', note: 'b' },
        { afterPlacementId: 'p3', kind: 'separator', note: 'c' },
      ],
      hidden: [],
    };
    const after = pruneDeletedPlacements(view, ['p0', 'p1'], ORDER);
    expect(after.breaks).toHaveLength(1);
    expect(after.breaks[0].afterPlacementId).toBe('p3');
    expect(after.breaks[0].note).toBe('a · b · c');
  });

  it('prunes hides and breaks together for a multi-chord delete', () => {
    const view: SequenceView = {
      breaks: [
        { afterPlacementId: 'p1', kind: 'separator', note: 'keep me' },
        { afterPlacementId: 'p4', kind: 'row' },
      ],
      hidden: ['p0', 'p2', 'p3'],
    };
    const after = pruneDeletedPlacements(view, ['p0', 'p1', 'p2'], ORDER);
    expect(after.hidden).toEqual(['p3']);
    expect(after.breaks.map(b => b.afterPlacementId)).toEqual(['p4']);
    expect(after.breaks[0].note).toBe('keep me');
  });

  it('leaves the surviving strip rendering correctly afterwards', () => {
    const view: SequenceView = {
      breaks: [{ afterPlacementId: 'p1', kind: 'separator' }],
      hidden: ['p2'],
    };
    const after = pruneDeletedPlacements(view, ['p1', 'p2'], ORDER);
    // p1 and p2 are gone from the grid, so the live order shrinks too.
    expect(shape(after, ['p0', 'p3', 'p4'])).toEqual(['p0p3p4']);
  });

  it('sorts by the order BEFORE deletion, so notes merge into the right neighbour', () => {
    // Passing the post-deletion order would sort the dead anchor last
    // and pile its note onto the tail instead of its neighbour.
    const view: SequenceView = {
      breaks: [
        { afterPlacementId: 'p1', kind: 'separator', note: 'early' },
        { afterPlacementId: 'p3', kind: 'separator', note: 'late' },
      ],
      hidden: [],
      tailNote: 'tail',
    };
    const after = pruneDeletedPlacements(view, ['p1'], ORDER);
    expect(after.breaks[0].note).toBe('early · late');
    expect(after.tailNote).toBe('tail');
  });

  it('is idempotent — pruning the same ids twice changes nothing further', () => {
    const view: SequenceView = {
      breaks: [{ afterPlacementId: 'p1', kind: 'separator', note: 'n' }],
      hidden: ['p1'],
    };
    const once = pruneDeletedPlacements(view, ['p1'], ORDER);
    expect(pruneDeletedPlacements(once, ['p1'], ORDER)).toBe(once);
  });
});

describe('shouldOfferNote — a note belongs to a line, not a grouping', () => {
  const sep = { endKind: 'separator' as const };
  const row = { endKind: 'row' as const };
  const tail = { endKind: 'end' as const };

  it('offers NO field on a separator, which is what broke the line', () => {
    // The reported bug: the note field is basis-full, so offering one
    // here forced a full-width wrap. Five same-line groupings became
    // five lines, each with a field nobody asked for.
    expect(shouldOfferNote(sep, true, true)).toBe(false);
  });

  it('offers a field on a row break, where an annotation belongs', () => {
    expect(shouldOfferNote(row, true, true)).toBe(true);
  });

  it('offers a field on the final phrase', () => {
    expect(shouldOfferNote(tail, true, true)).toBe(true);
  });

  it('STILL renders an existing note on a separator', () => {
    // Notes were storable on any break regardless of kind. Dropping
    // them outright would leave writing stored but unreachable from
    // any UI — the state pruneDeletedPlacements exists to prevent.
    expect(shouldOfferNote({ ...sep, note: 'written earlier' }, true, true)).toBe(true);
    // ...including outside edit mode, so it is readable as well.
    expect(shouldOfferNote({ ...sep, note: 'written earlier' }, false, true)).toBe(true);
  });

  it('offers nothing outside edit mode when there is no note', () => {
    expect(shouldOfferNote(row, false, true)).toBe(false);
    expect(shouldOfferNote(sep, false, true)).toBe(false);
  });

  it('offers nothing when the phrase has no visible tokens', () => {
    // A phrase whose chords are all hidden has nothing on screen to
    // annotate — even one carrying a note.
    expect(shouldOfferNote(row, true, false)).toBe(false);
    expect(shouldOfferNote({ ...row, note: 'x' }, true, false)).toBe(false);
  });
});

describe('converting a break keeps what was written about it', () => {
  it('changing row → separator preserves the note', () => {
    // The action behind "make it a separator": the user wants the
    // grouping to stop being a line break, NOT to lose what they wrote
    // about that phrase. A convert that dropped the note would be a
    // delete wearing a conversion's label.
    const view = {
      breaks: [{ afterPlacementId: 'a', kind: 'row' as const, note: 'the turnaround' }],
      hidden: [],
    };
    const next = setBreak(view, 'a', 'separator', ['a', 'b']);
    expect(next.breaks).toHaveLength(1);
    expect(next.breaks[0].kind).toBe('separator');
    expect(next.breaks[0].note).toBe('the turnaround');
  });

  it('changing separator → row preserves it too', () => {
    const view = {
      breaks: [{ afterPlacementId: 'a', kind: 'separator' as const, note: 'kept' }],
      hidden: [],
    };
    expect(setBreak(view, 'a', 'row', ['a', 'b']).breaks[0].note).toBe('kept');
  });

  it('does not add a second break at the same anchor', () => {
    const view = {
      breaks: [{ afterPlacementId: 'a', kind: 'row' as const }],
      hidden: [],
    };
    expect(setBreak(view, 'a', 'separator', ['a', 'b']).breaks).toHaveLength(1);
  });
});

