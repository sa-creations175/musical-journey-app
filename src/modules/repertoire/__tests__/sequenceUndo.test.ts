// @vitest-environment jsdom
/**
 * The progression-edit undo stack.
 *
 * Two things carry real consequences: the stack must not reach across
 * songs, and a restore must not resurrect an annotation onto a chord
 * deleted since the edit. That second one produces a row which filters
 * nothing, renders nothing and is reachable from no UI — so it could
 * never be removed again, which is the unrecoverable state
 * `pruneDeletedPlacements` exists to prevent.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { SequenceView } from '../../../lib/db';
import {
  UNDO_LIMIT,
  __resetUndoForTests,
  deadAnchors,
  peekUndo,
  popUndo,
  pushUndo,
  setUndoSong,
  undoDepth,
} from '../sequenceUndo';
import { pruneDeletedPlacements } from '../sequenceView';

const SONG = 'song-1';

function view(over: Partial<SequenceView> = {}): SequenceView {
  return { breaks: [], hidden: [], ...over };
}

function entry(over: Partial<Parameters<typeof pushUndo>[0]> = {}) {
  return {
    songId: SONG,
    sectionId: 'sec-1',
    before: view(),
    orderAtCapture: ['a', 'b', 'c'],
    label: 'separator',
    ...over,
  };
}

beforeEach(() => {
  __resetUndoForTests();
  setUndoSong(SONG);
});

describe('the stack', () => {
  it('returns entries most-recent first', () => {
    pushUndo(entry({ label: 'first' }));
    pushUndo(entry({ label: 'second' }));
    expect(popUndo()?.label).toBe('second');
    expect(popUndo()?.label).toBe('first');
    expect(popUndo()).toBeNull();
  });

  it('holds a run of edits, not just the last', () => {
    // The reported case: five separators added before noticing. A
    // single-level undo would have reversed one of them.
    for (let i = 0; i < 5; i++) pushUndo(entry({ label: `sep-${i}` }));
    expect(undoDepth()).toBe(5);
    for (let i = 4; i >= 0; i--) expect(popUndo()?.label).toBe(`sep-${i}`);
  });

  it('drops the oldest past the limit rather than growing forever', () => {
    for (let i = 0; i < UNDO_LIMIT + 5; i++) pushUndo(entry({ label: `e${i}` }));
    expect(undoDepth()).toBe(UNDO_LIMIT);
    // The five oldest are gone; the newest survived.
    expect(peekUndo()?.label).toBe(`e${UNDO_LIMIT + 4}`);
  });

  it('peek does not consume', () => {
    pushUndo(entry({ label: 'kept' }));
    expect(peekUndo()?.label).toBe('kept');
    expect(undoDepth()).toBe(1);
  });
});

describe('song scoping', () => {
  it('clears when the song changes', () => {
    pushUndo(entry());
    setUndoSong('song-2');
    expect(undoDepth()).toBe(0);
  });

  it('REFUSES an entry from a different song', () => {
    // Guards against a late write from a song already navigated away
    // from landing on the new song's stack.
    pushUndo(entry({ songId: 'song-2' }));
    expect(undoDepth()).toBe(0);
  });

  it('does NOT clear when re-set to the same song', () => {
    // A re-render must not wipe the user's history.
    pushUndo(entry());
    setUndoSong(SONG);
    setUndoSong(SONG);
    expect(undoDepth()).toBe(1);
  });
});

describe('deadAnchors', () => {
  it('finds break anchors whose chord is gone', () => {
    const v = view({ breaks: [{ afterPlacementId: 'gone', kind: 'separator' }] });
    expect(deadAnchors(v, ['a', 'b'])).toEqual(['gone']);
  });

  it('finds hidden ids whose chord is gone', () => {
    expect(deadAnchors(view({ hidden: ['gone'] }), ['a'])).toEqual(['gone']);
  });

  it('returns nothing when every anchor is still live', () => {
    const v = view({
      breaks: [{ afterPlacementId: 'a', kind: 'row' }],
      hidden: ['b'],
    });
    expect(deadAnchors(v, ['a', 'b', 'c'])).toEqual([]);
  });

  it('DEDUPES an id that is both a break anchor and hidden', () => {
    // pruneDeletedPlacements walks the list and removes each break it
    // is given; the same break twice would merge its note forward a
    // second time, corrupting a neighbouring note.
    const v = view({
      breaks: [{ afterPlacementId: 'gone', kind: 'row', note: 'x' }],
      hidden: ['gone'],
    });
    expect(deadAnchors(v, [])).toEqual(['gone']);
  });
});

describe('restoring against a changed grid', () => {
  it('does not put an annotation back onto a deleted chord', () => {
    // The whole hazard. 'b' was deleted after the edit; restoring the
    // captured view verbatim would re-create an unreachable break.
    const before = view({
      breaks: [
        { afterPlacementId: 'a', kind: 'row', note: 'first' },
        { afterPlacementId: 'b', kind: 'row', note: 'second' },
      ],
    });
    const orderAtCapture = ['a', 'b', 'c'];
    const currentOrder = ['a', 'c'];

    const dead = deadAnchors(before, currentOrder);
    const restored = pruneDeletedPlacements(before, dead, orderAtCapture);

    expect(restored.breaks.map(b => b.afterPlacementId)).toEqual(['a']);
  });

  it('carries the orphaned note forward rather than dropping it', () => {
    // Deleting a chord is not deleting a note: the phrase the note
    // described still exists, it has merely lost its boundary.
    const before = view({
      breaks: [
        { afterPlacementId: 'a', kind: 'row', note: 'first' },
        { afterPlacementId: 'b', kind: 'row', note: 'second' },
      ],
    });
    const restored = pruneDeletedPlacements(
      before, deadAnchors(before, ['a', 'c']), ['a', 'b', 'c'],
    );
    // 'second' merged into the tail — the phrase it ended is now the
    // final one.
    expect(restored.tailNote).toContain('second');
  });

  it('uses the CAPTURE order so a note merges into the right neighbour', () => {
    // Pruning against today's order would sort the dead anchor last and
    // pile its note onto the tail instead of onto the break that now
    // ends the joined phrase.
    const before = view({
      breaks: [
        { afterPlacementId: 'a', kind: 'row', note: 'early' },
        { afterPlacementId: 'c', kind: 'row', note: 'late' },
      ],
    });
    const restored = pruneDeletedPlacements(
      before, ['a'], ['a', 'b', 'c'],
    );
    const survivor = restored.breaks.find(b => b.afterPlacementId === 'c');
    expect(survivor?.note).toContain('early');
    expect(survivor?.note).toContain('late');
    expect(restored.tailNote).toBeUndefined();
  });

  it('leaves an untouched view exactly as captured', () => {
    const before = view({
      breaks: [{ afterPlacementId: 'a', kind: 'separator', note: 'keep' }],
      hidden: ['b'],
    });
    expect(deadAnchors(before, ['a', 'b'])).toEqual([]);
  });
});
