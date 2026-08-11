import { describe, expect, it } from 'vitest';
import type { SequenceView } from '../../../lib/db';
import {
  EMPTY_SEQUENCE_VIEW,
  buildPhrases,
  isEmptyView,
  removeBreak,
  setBreak,
  setPhraseNote,
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
