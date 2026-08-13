import { describe, expect, it } from 'vitest';
import type { ChordFunction, Phrase, SequenceView, SongSection } from '../../../lib/db';
import {
  remapAnnotationIds,
  sequenceViewCommitPatch,
  zipIdRemap,
} from '../sequenceAnchors';
import { BASIC_ARRANGEMENT_ID } from '../beatsModel';
import { deriveBarGrid } from '../barGrid';

const cf = (fn: string, beats = 1): ChordFunction =>
  ({ function: fn, quality: '', beats }) as ChordFunction;

/** A legacy section: chords in phrase data, no stored placements. */
function legacySection(): SongSection {
  const beats = ['b0', 'b1', 'b2'].map(id => ({
    id,
    type: 'word' as const,
    text: '',
  }));
  const phrase: Phrase = {
    id: 'ph1',
    beats,
    chordsByArrangement: {
      [BASIC_ARRANGEMENT_ID]: {
        b0: cf('1'),
        b1: cf('4'),
        b2: cf('5'),
      },
    },
  };
  return {
    id: 'sec-1',
    songId: 's1',
    name: 'Verse',
    order: 0,
    lyrics: '',
    phrases: [phrase],
  } as SongSection;
}

/** Exactly what the strip's `sequenceOrder` is on a legacy section:
 *  the rendered cells' placement ids, tied continuations skipped. Taken
 *  from the real derivation rather than hand-written, so the test can't
 *  drift from the id format it is asserting about. */
const LEGACY_ORDER = deriveBarGrid(legacySection(), BASIC_ARRANGEMENT_ID, 4)
  .flatMap(bar => bar.cells)
  .filter(c => !c.tiedFromPrev)
  .map(c => c.placementId);

describe('zipIdRemap', () => {
  it('pairs by position', () => {
    const map = zipIdRemap(['l0', 'l1'], ['m0', 'm1']);
    expect([...map]).toEqual([
      ['l0', 'm0'],
      ['l1', 'm1'],
    ]);
  });

  it('leaves extras unpaired rather than guessing', () => {
    // A length mismatch means the two walks disagree about what a
    // chord is. Inventing a pairing would move an annotation onto an
    // unrelated chord — wrong is worse than absent.
    expect([...zipIdRemap(['l0', 'l1', 'l2'], ['m0'])]).toEqual([['l0', 'm0']]);
    expect([...zipIdRemap(['l0'], ['m0', 'm1'])]).toEqual([['l0', 'm0']]);
  });

  it('records nothing for ids that are already correct', () => {
    expect(zipIdRemap(['same'], ['same']).size).toBe(0);
  });
});

describe('remapAnnotationIds', () => {
  const view: SequenceView = {
    breaks: [{ afterPlacementId: 'l0', kind: 'separator', note: 'first' }],
    hidden: ['l1'],
    tailNote: 'coda',
  };

  it('rewrites hides and break anchors', () => {
    const out = remapAnnotationIds(
      view,
      new Map([
        ['l0', 'm0'],
        ['l1', 'm1'],
      ]),
    );
    expect(out.hidden).toEqual(['m1']);
    expect(out.breaks[0].afterPlacementId).toBe('m0');
  });

  it('keeps notes and the tail note intact', () => {
    const out = remapAnnotationIds(view, new Map([['l0', 'm0']]));
    expect(out.breaks[0].note).toBe('first');
    expect(out.tailNote).toBe('coda');
  });

  it('leaves an unmapped id alone rather than dropping it', () => {
    const out = remapAnnotationIds(view, new Map([['other', 'x']]));
    expect(out.hidden).toEqual(['l1']);
  });

  it('returns the SAME object when nothing needs rewriting', () => {
    expect(remapAnnotationIds(view, new Map())).toBe(view);
    expect(remapAnnotationIds(view, new Map([['nope', 'x']]))).toBe(view);
  });
});

describe('sequenceViewCommitPatch — the annotation survives materialisation', () => {
  const hideTheSecondChord = (): SequenceView => ({
    breaks: [],
    hidden: [LEGACY_ORDER[1]],
  });

  const patchFor = (next: SequenceView) =>
    sequenceViewCommitPatch({
      section: legacySection(),
      beatsPerBar: 4,
      eighths: false,
      activeArrangementId: BASIC_ARRANGEMENT_ID,
      legacyOrder: LEGACY_ORDER,
      next,
    });

  it('materialises the section and rewrites the hide onto a REAL placement', () => {
    // The failure this guards: the annotation used to be written
    // against ids that the same commit destroyed, so the hide hid
    // nothing and nothing said so.
    const patch = patchFor(hideTheSecondChord());
    const ids = patch.chordPlacements!.map(p => p.id);
    expect(ids).toHaveLength(3);
    expect(patch.sequenceView!.hidden).toHaveLength(1);
    expect(ids).toContain(patch.sequenceView!.hidden[0]);
  });

  it('lands the hide on the chord that was actually hidden', () => {
    const patch = patchFor(hideTheSecondChord());
    const hidden = patch.sequenceView!.hidden[0];
    const placement = patch.chordPlacements!.find(p => p.id === hidden)!;
    expect(placement.chord.function).toBe('4');
  });

  it('carries a break anchor across too', () => {
    const patch = patchFor({
      breaks: [
        { afterPlacementId: LEGACY_ORDER[0], kind: 'row', note: 'phrase one' },
      ],
      hidden: [],
    });
    const anchor = patch.sequenceView!.breaks[0].afterPlacementId;
    expect(patch.chordPlacements!.map(p => p.id)).toContain(anchor);
    expect(patch.sequenceView!.breaks[0].note).toBe('phrase one');
  });

  it('leaves no legacy id behind in the written annotation', () => {
    const patch = patchFor({
      breaks: [{ afterPlacementId: LEGACY_ORDER[0], kind: 'separator' }],
      hidden: [LEGACY_ORDER[2]],
    });
    const written = [
      ...patch.sequenceView!.hidden,
      ...patch.sequenceView!.breaks.map(b => b.afterPlacementId),
    ];
    expect(written.some(id => id.startsWith('legacy:'))).toBe(false);
  });

  it('does not depend on beat ids being stable', () => {
    // `normalizePhrase` mints fresh random beat ids for a phrase with
    // no stored `beats`, so an id-derived remap would resolve to
    // something that matches nothing. Two independent calls must still
    // agree about WHICH chord the annotation belongs to.
    const a = patchFor(hideTheSecondChord());
    const b = patchFor(hideTheSecondChord());
    const chordOf = (patch: Partial<SongSection>) =>
      patch.chordPlacements!.find(
        p => p.id === patch.sequenceView!.hidden[0],
      )!.chord.function;
    expect(chordOf(a)).toBe(chordOf(b));
  });

  it('writes no placements for an already-migrated section', () => {
    const migrated = {
      ...legacySection(),
      chordPlacements: [],
    } as SongSection;
    const patch = sequenceViewCommitPatch({
      section: migrated,
      beatsPerBar: 4,
      eighths: false,
      activeArrangementId: BASIC_ARRANGEMENT_ID,
      legacyOrder: [],
      next: { breaks: [], hidden: ['real-id'] },
    });
    expect(patch.chordPlacements).toBeUndefined();
    expect(patch.sequenceView!.hidden).toEqual(['real-id']);
  });
});
