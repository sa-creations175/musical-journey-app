import { describe, expect, it } from 'vitest';
import { groupBlocks } from '../blockGrouping';
import type { ProposalBlock } from '../proposalTypes';

function mk(partial: Partial<ProposalBlock> & { id: string }): ProposalBlock {
  return {
    moduleRef: 'harmonic-fluency',
    moduleLabel: 'X',
    moduleAccentHex: '#888',
    activityDescription: 'block ' + partial.id,
    plannedSeconds: 600,
    whySnippet: '',
    itemRefs: [],
    isWarmup: false,
    ...partial,
  };
}

const chordQuiz = (id = 'cq') =>
  mk({ id, moduleRef: 'repertoire', isWarmup: true });
const scalePrep = (id = 'sp') =>
  mk({ id, moduleRef: 'repertoire', isWarmup: true, inSessionDrillKind: 'scales' });
const song = (id = 'song') =>
  mk({ id, moduleRef: 'repertoire', isSongPractice: true });
const mentalViz = (id = 'mv') =>
  mk({ id, moduleRef: 'shapes-and-patterns', quickLaunchRoute: '/shapes-and-patterns?tab=mental-viz' });
const et = (ref: string, id = ref) => mk({ id, moduleRef: ref });
const prodVocab = (id = 'prod-vocab') =>
  mk({ id, moduleRef: 'production', quickLaunchRoute: '/production?view=vocabulary' });
const prodLesson = (id = 'prod-lesson') => mk({ id, moduleRef: 'production' });

/** Convenience: groups as arrays of member ids. */
function ids(blocks: ProposalBlock[]): string[][] {
  return groupBlocks(blocks).map(g => g.items.map(b => b.id));
}

describe('groupBlocks — Rule 1: rep-warmup → song chain, no orphan fallback', () => {
  it('chains a chord-quiz + scale-prep forward to the song', () => {
    expect(ids([chordQuiz(), scalePrep(), song()])).toEqual([
      ['cq', 'sp', 'song'],
    ]);
  });

  it('an orphaned rep warm-up does NOT grab the next unrelated block (the bug)', () => {
    // chord-quiz with no song after it, no mental-viz → stays solo,
    // ET intervals stays in its own (ET-family) unit. Previously the
    // orphan fallback locked chord-quiz + intervals.
    expect(ids([chordQuiz(), et('intervals')])).toEqual([
      ['cq'],
      ['intervals'],
    ]);
  });

  it('an orphaned scale-prep (no mental-viz) stays solo', () => {
    expect(ids([scalePrep(), et('intervals')])).toEqual([['sp'], ['intervals']]);
  });
});

describe('groupBlocks — Rule 2: visualization/memorization pair', () => {
  it('locks an orphaned chord-quiz with mental-viz; ET family stays separate', () => {
    // The reported scenario: chord-quiz (no song) + mental-viz + ET.
    expect(ids([chordQuiz(), mentalViz(), et('intervals'), et('chord-recognition')])).toEqual([
      ['cq', 'mv'],
      ['intervals', 'chord-recognition'],
    ]);
  });

  it('does NOT pair when a song follows the chord-quiz — chain wins, mental-viz solo', () => {
    expect(ids([chordQuiz(), song(), mentalViz()])).toEqual([
      ['cq', 'song'],
      ['mv'],
    ]);
  });

  it('mental-viz with no orphaned chord-quiz stays solo', () => {
    expect(ids([mentalViz(), et('intervals')])).toEqual([['mv'], ['intervals']]);
  });

  it('a scale-prep orphan does NOT pair with mental-viz (chord-quiz only)', () => {
    expect(ids([scalePrep(), mentalViz()])).toEqual([['sp'], ['mv']]);
  });
});

describe('groupBlocks — Rule 3: ET family', () => {
  it('locks all ET sub-modules together regardless of order or blocks between', () => {
    expect(ids([et('intervals'), mk({ id: 'hf' }), et('chord-recognition'), et('chord-progressions')])).toEqual([
      ['intervals', 'chord-recognition', 'chord-progressions'],
      ['hf'],
    ]);
  });

  it('includes scales-modes (canonical ET_MODULE_REFS set)', () => {
    expect(ids([et('intervals'), et('scales-modes')])).toEqual([
      ['intervals', 'scales-modes'],
    ]);
  });

  it('a single ET block is its own (one-item) unit', () => {
    expect(ids([et('intervals'), mk({ id: 'hf' })])).toEqual([['intervals'], ['hf']]);
  });
});

describe('groupBlocks — Rule 4: Production family', () => {
  it('locks the vocab block and the lesson block together', () => {
    expect(ids([prodVocab(), prodLesson()])).toEqual([
      ['prod-vocab', 'prod-lesson'],
    ]);
  });

  it('keeps them together regardless of blocks sitting between them', () => {
    // Real shape: vocab is prepended to the front, lessons sit in the
    // allocator body, so a mental-viz / ET block can land between them.
    // The family pulls both into one unit at the first member's position.
    expect(
      ids([prodVocab(), mentalViz(), et('intervals'), prodLesson()]),
    ).toEqual([
      ['prod-vocab', 'prod-lesson'],
      ['mv'],
      ['intervals'],
    ]);
  });

  it('preserves relative order (vocab before lessons) within the group', () => {
    // groupBlocks emits items in original sequence order — even if the
    // lesson block happens to appear first, the group keeps that order.
    expect(ids([prodLesson(), prodVocab()])).toEqual([
      ['prod-lesson', 'prod-vocab'],
    ]);
  });

  it('a single Production block is its own (one-item) unit', () => {
    expect(ids([prodLesson(), mk({ id: 'hf' })])).toEqual([
      ['prod-lesson'],
      ['hf'],
    ]);
  });
});

describe('groupBlocks — unchanged cases', () => {
  it('S&P warm-up + walk are independent units', () => {
    expect(
      ids([
        mk({ id: 'sp-warmup', moduleRef: 'shapes-and-patterns', isWarmup: true }),
        mk({ id: 'sp-walk', moduleRef: 'shapes-and-patterns' }),
      ]),
    ).toEqual([['sp-warmup'], ['sp-walk']]);
  });

  it('plain non-grouped blocks each stand alone', () => {
    expect(ids([mk({ id: 'a' }), mk({ id: 'b' })])).toEqual([['a'], ['b']]);
  });
});
