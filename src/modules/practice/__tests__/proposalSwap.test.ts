// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  DIFFERENT_SUBMODULE_TOP_N,
  applySwap,
  applySwapWithCascade,
  differentSubmoduleAlternatives,
  moduleRefForSubmodule,
  sameSubmoduleAlternatives,
  submoduleKeyForBlock,
} from '../proposalSwap';
import type { ProposalBlock } from '../proposalTypes';
import type { Song, SpacingState } from '../../../lib/db';

const NOW = 1_700_000_000_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function mkBlock(p: Partial<ProposalBlock> & { id: string }): ProposalBlock {
  return {
    moduleRef: 'harmonic-fluency',
    moduleLabel: 'HF',
    moduleAccentHex: '#888',
    activityDescription: 'block ' + p.id,
    plannedSeconds: 600,
    whySnippet: '',
    itemRefs: [],
    isWarmup: false,
    ...p,
  };
}

function mkRow(p: Partial<SpacingState> & { itemRef: string; moduleRef: string }): SpacingState {
  return {
    id: 'row-' + p.itemRef,
    hand: 'both',
    style: 'solid',
    memoryType: 'declarative',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 1,
    lastEngagedAt: null,
    nextDueAt: null,
    performanceHistory: [],
    ...p,
  };
}

function mkSong(p: Partial<Song> & { id: string; title: string }): Song {
  return {
    artist: '',
    stage: 'learning',
    audioLinks: [],
    addedDate: NOW,
    learningOrder: 1,
    ...p,
  } as Song;
}

// ---------------------------------------------------------------------
// submoduleKeyForBlock
// ---------------------------------------------------------------------

describe('submoduleKeyForBlock', () => {
  it('returns moduleRef for non-S&P blocks', () => {
    expect(submoduleKeyForBlock(mkBlock({ id: 'a', moduleRef: 'harmonic-fluency' })))
      .toBe('harmonic-fluency');
    expect(submoduleKeyForBlock(mkBlock({ id: 'b', moduleRef: 'intervals' })))
      .toBe('intervals');
    expect(submoduleKeyForBlock(mkBlock({ id: 'c', moduleRef: 'repertoire' })))
      .toBe('repertoire');
  });

  it('discriminates S&P by itemRef prefix', () => {
    expect(submoduleKeyForBlock(mkBlock({
      id: 'cs', moduleRef: 'shapes-and-patterns',
      itemRefs: ['chord-shape:maj:C:root'],
    }))).toBe('shapes-and-patterns:chord-shape');
    expect(submoduleKeyForBlock(mkBlock({
      id: 'sc', moduleRef: 'shapes-and-patterns',
      itemRefs: ['scale:major:C'],
    }))).toBe('shapes-and-patterns:scale');
    expect(submoduleKeyForBlock(mkBlock({
      id: 'vl', moduleRef: 'shapes-and-patterns',
      itemRefs: ['vl:diatonic-cycle:pos1:C'],
    }))).toBe('shapes-and-patterns:vl');
  });

  it('falls back to moduleRef when S&P block has no items', () => {
    expect(submoduleKeyForBlock(mkBlock({
      id: 'sp', moduleRef: 'shapes-and-patterns', itemRefs: [],
    }))).toBe('shapes-and-patterns');
  });

  it('routes Rep scale-prep warm-up to the scales submodule (itemRef prefix wins)', () => {
    // Scale-prep blocks have moduleRef='repertoire' but their
    // itemRefs are scale: prefixed. They should swap-pool with the
    // S&P scales segment, not with other songs.
    expect(submoduleKeyForBlock(mkBlock({
      id: 'prep', moduleRef: 'repertoire', isWarmup: true,
      itemRefs: ['scale:major:C', 'scale:major-pentatonic:1:C'],
    }))).toBe('shapes-and-patterns:scale');
  });

  it('routes Rep chord-quiz warm-up to repertoire (songId itemRef, not scale-prefixed)', () => {
    expect(submoduleKeyForBlock(mkBlock({
      id: 'quiz', moduleRef: 'repertoire', isWarmup: true,
      itemRefs: ['song-mirror'],
    }))).toBe('repertoire');
  });
});

describe('moduleRefForSubmodule', () => {
  it('strips the sub-suffix for S&P keys', () => {
    expect(moduleRefForSubmodule('shapes-and-patterns:vl')).toBe('shapes-and-patterns');
    expect(moduleRefForSubmodule('shapes-and-patterns:chord-shape')).toBe('shapes-and-patterns');
  });
  it('passes through bare moduleRefs', () => {
    expect(moduleRefForSubmodule('harmonic-fluency')).toBe('harmonic-fluency');
    expect(moduleRefForSubmodule('intervals')).toBe('intervals');
  });
});

// ---------------------------------------------------------------------
// sameSubmoduleAlternatives
// ---------------------------------------------------------------------

describe('sameSubmoduleAlternatives', () => {
  it('sorts by urgency (most-overdue first; null nextDueAt last)', () => {
    // Block: HF card 'a'. Alternatives: 'b' (overdue 5d), 'c' (overdue
    // 2d), 'd' (untouched). Expected order: b, c, d.
    const block = mkBlock({ id: 'block', itemRefs: ['a'] });
    const rows: SpacingState[] = [
      mkRow({ itemRef: 'a', moduleRef: 'harmonic-fluency', nextDueAt: NOW - ONE_DAY_MS * 1 }),
      mkRow({ itemRef: 'b', moduleRef: 'harmonic-fluency', nextDueAt: NOW - ONE_DAY_MS * 5 }),
      mkRow({ itemRef: 'c', moduleRef: 'harmonic-fluency', nextDueAt: NOW - ONE_DAY_MS * 2 }),
      mkRow({ itemRef: 'd', moduleRef: 'harmonic-fluency', nextDueAt: null }),
    ];
    const out = sameSubmoduleAlternatives({
      block, allBlocks: [block], spacingRows: rows, songs: [], now: NOW,
    });
    expect(out.map(o => o.itemRef)).toEqual(['b', 'c', 'd']);
  });

  it('excludes items already present in any block in the proposal', () => {
    // Two blocks. Alternatives for block-1 must exclude items from
    // BOTH block-1 and block-2.
    const block1 = mkBlock({ id: 'b1', itemRefs: ['a'] });
    const block2 = mkBlock({ id: 'b2', itemRefs: ['b'] });
    const rows: SpacingState[] = [
      mkRow({ itemRef: 'a', moduleRef: 'harmonic-fluency', nextDueAt: NOW - 1 }),
      mkRow({ itemRef: 'b', moduleRef: 'harmonic-fluency', nextDueAt: NOW - 1 }),
      mkRow({ itemRef: 'c', moduleRef: 'harmonic-fluency', nextDueAt: NOW - 1 }),
    ];
    const out = sameSubmoduleAlternatives({
      block: block1, allBlocks: [block1, block2],
      spacingRows: rows, songs: [], now: NOW,
    });
    expect(out.map(o => o.itemRef)).toEqual(['c']);
  });

  it('honors S&P submodule discrimination — VL block surfaces only vl: items', () => {
    const block = mkBlock({
      id: 'vlBlock', moduleRef: 'shapes-and-patterns',
      itemRefs: ['vl:diatonic-cycle:pos1:C'],
    });
    const rows: SpacingState[] = [
      mkRow({ itemRef: 'vl:five-one:guide-tones:A:F', moduleRef: 'shapes-and-patterns', nextDueAt: NOW - 1 }),
      // Same-module but DIFFERENT submodule — must be excluded.
      mkRow({ itemRef: 'chord-shape:maj:C:root', moduleRef: 'shapes-and-patterns', nextDueAt: NOW - 1 }),
      mkRow({ itemRef: 'scale:major:C', moduleRef: 'shapes-and-patterns', nextDueAt: NOW - 1 }),
    ];
    const out = sameSubmoduleAlternatives({
      block, allBlocks: [block], spacingRows: rows, songs: [], now: NOW,
    });
    expect(out.map(o => o.itemRef)).toEqual(['vl:five-one:guide-tones:A:F']);
  });

  it('Repertoire blocks source from songs (learningOrder set), sorted ASC by learningOrder', () => {
    const block = mkBlock({
      id: 'repBlock', moduleRef: 'repertoire', itemRefs: ['song-current'],
    });
    const songs: Song[] = [
      mkSong({ id: 'song-current', title: 'Current Song', learningOrder: 1 }),
      mkSong({ id: 'song-second', title: 'Second Song', learningOrder: 2 }),
      mkSong({ id: 'song-third', title: 'Third Song', learningOrder: 3 }),
      // No learningOrder — should be excluded.
      mkSong({ id: 'song-untracked', title: 'Untracked', learningOrder: undefined as unknown as number }),
    ];
    const out = sameSubmoduleAlternatives({
      block, allBlocks: [block], spacingRows: [], songs, now: NOW,
    });
    // learningOrder ASC. Current (1) excluded. Untracked excluded.
    expect(out.map(o => o.itemRef)).toEqual(['song-second', 'song-third']);
  });

  it('Production blocks return [] for same-submodule swap (v1 scope)', () => {
    const block = mkBlock({
      id: 'prodBlock', moduleRef: 'production', itemRefs: ['wf-01'],
    });
    const rows: SpacingState[] = [
      mkRow({ itemRef: 'wf-02', moduleRef: 'production', nextDueAt: NOW - 1 }),
    ];
    expect(
      sameSubmoduleAlternatives({
        block, allBlocks: [block], spacingRows: rows, songs: [], now: NOW,
      }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// differentSubmoduleAlternatives
// ---------------------------------------------------------------------

describe('differentSubmoduleAlternatives', () => {
  it('returns one row per other submodule with up to 3 top items each', () => {
    const block = mkBlock({
      id: 'hfBlock', moduleRef: 'harmonic-fluency', itemRefs: ['hf-a'],
    });
    const rows: SpacingState[] = [
      // Different submodule: intervals — 4 items, top 3 should appear.
      mkRow({ itemRef: 'P5', moduleRef: 'intervals', nextDueAt: NOW - ONE_DAY_MS * 5 }),
      mkRow({ itemRef: 'M3', moduleRef: 'intervals', nextDueAt: NOW - ONE_DAY_MS * 4 }),
      mkRow({ itemRef: 'm3', moduleRef: 'intervals', nextDueAt: NOW - ONE_DAY_MS * 3 }),
      mkRow({ itemRef: 'P4', moduleRef: 'intervals', nextDueAt: NOW - ONE_DAY_MS * 1 }),
      // Different submodule: chord-recognition — 1 item, shows all 1.
      mkRow({ itemRef: 'maj7', moduleRef: 'chord-recognition', nextDueAt: NOW - ONE_DAY_MS * 2 }),
    ];
    const out = differentSubmoduleAlternatives({
      block, allBlocks: [block], spacingRows: rows, songs: [],
      context: 'full', now: NOW,
    });
    const intervalsOpt = out.find(o => o.submoduleKey === 'intervals');
    expect(intervalsOpt).toBeDefined();
    expect(intervalsOpt!.topItems.map(i => i.itemRef))
      .toEqual(['P5', 'M3', 'm3']);
    expect(intervalsOpt!.topItems.length).toBe(DIFFERENT_SUBMODULE_TOP_N);
    const crOpt = out.find(o => o.submoduleKey === 'chord-recognition');
    expect(crOpt!.topItems.length).toBe(1);
  });

  it('excludes the current submodule from the list', () => {
    const block = mkBlock({
      id: 'vlBlock', moduleRef: 'shapes-and-patterns',
      itemRefs: ['vl:diatonic-cycle:pos1:C'],
    });
    const rows: SpacingState[] = [
      // Same submodule (vl) — must NOT appear.
      mkRow({ itemRef: 'vl:five-one:guide-tones:A:F', moduleRef: 'shapes-and-patterns', nextDueAt: NOW - 1 }),
      // Different S&P submodule (chord-shape) — should appear.
      mkRow({ itemRef: 'chord-shape:maj:C:root', moduleRef: 'shapes-and-patterns', nextDueAt: NOW - 1 }),
    ];
    const out = differentSubmoduleAlternatives({
      block, allBlocks: [block], spacingRows: rows, songs: [],
      context: 'full', now: NOW,
    });
    expect(out.map(o => o.submoduleKey)).toEqual(['shapes-and-patterns:chord-shape']);
  });

  it('filters submodules by context (keys excludes ET / HF / Production)', () => {
    const block = mkBlock({
      id: 'spBlock', moduleRef: 'shapes-and-patterns',
      itemRefs: ['chord-shape:maj:C:root'],
    });
    const rows: SpacingState[] = [
      mkRow({ itemRef: 'P5', moduleRef: 'intervals', nextDueAt: NOW - 1 }),
      mkRow({ itemRef: 'card-a', moduleRef: 'harmonic-fluency', nextDueAt: NOW - 1 }),
      mkRow({ itemRef: 'vl:five-one:guide-tones:A:F', moduleRef: 'shapes-and-patterns', nextDueAt: NOW - 1 }),
    ];
    const out = differentSubmoduleAlternatives({
      block, allBlocks: [block], spacingRows: rows, songs: [],
      // keys context allows Shapes + Repertoire only.
      context: 'keys', now: NOW,
    });
    expect(out.map(o => o.submoduleKey)).toEqual(['shapes-and-patterns:vl']);
  });

  it('sorts submodules by their top item urgency (most-overdue first)', () => {
    const block = mkBlock({
      id: 'hfBlock', moduleRef: 'harmonic-fluency', itemRefs: ['x'],
    });
    const rows: SpacingState[] = [
      // intervals top: 3d overdue
      mkRow({ itemRef: 'P5', moduleRef: 'intervals', nextDueAt: NOW - ONE_DAY_MS * 3 }),
      // chord-recognition top: 10d overdue
      mkRow({ itemRef: 'maj', moduleRef: 'chord-recognition', nextDueAt: NOW - ONE_DAY_MS * 10 }),
      // chord-progressions top: 1d overdue
      mkRow({ itemRef: '1-4-5', moduleRef: 'chord-progressions', nextDueAt: NOW - ONE_DAY_MS * 1 }),
    ];
    const out = differentSubmoduleAlternatives({
      block, allBlocks: [block], spacingRows: rows, songs: [],
      context: 'full', now: NOW,
    });
    expect(out.map(o => o.submoduleKey)).toEqual([
      'chord-recognition', 'intervals', 'chord-progressions',
    ]);
  });

  it('surfaces Repertoire as its own submodule with songs as items (learningOrder ASC)', () => {
    const block = mkBlock({
      id: 'hfBlock', moduleRef: 'harmonic-fluency', itemRefs: ['x'],
    });
    const songs: Song[] = [
      mkSong({ id: 's1', title: 'Song 1', learningOrder: 1 }),
      mkSong({ id: 's2', title: 'Song 2', learningOrder: 2 }),
    ];
    const out = differentSubmoduleAlternatives({
      block, allBlocks: [block], spacingRows: [], songs,
      context: 'full', now: NOW,
    });
    const repOpt = out.find(o => o.submoduleKey === 'repertoire');
    expect(repOpt).toBeDefined();
    expect(repOpt!.topItems.map(t => t.itemRef)).toEqual(['s1', 's2']);
  });

  it('excludes items already in the proposal across all blocks', () => {
    const block = mkBlock({
      id: 'hfBlock', moduleRef: 'harmonic-fluency', itemRefs: ['x'],
    });
    // The interval P5 is already on a different block; it shouldn't
    // surface as a swap option.
    const intervalsBlock = mkBlock({
      id: 'intBlock', moduleRef: 'intervals', itemRefs: ['P5'],
    });
    const rows: SpacingState[] = [
      mkRow({ itemRef: 'P5', moduleRef: 'intervals', nextDueAt: NOW - ONE_DAY_MS * 5 }),
      mkRow({ itemRef: 'M3', moduleRef: 'intervals', nextDueAt: NOW - ONE_DAY_MS * 1 }),
    ];
    const out = differentSubmoduleAlternatives({
      block, allBlocks: [block, intervalsBlock], spacingRows: rows, songs: [],
      context: 'full', now: NOW,
    });
    const intervalsOpt = out.find(o => o.submoduleKey === 'intervals');
    expect(intervalsOpt!.topItems.map(t => t.itemRef)).toEqual(['M3']);
  });
});

// ---------------------------------------------------------------------
// applySwap
// ---------------------------------------------------------------------

describe('applySwap', () => {
  it('preserves id, position, and plannedSeconds on same-submodule swap', () => {
    const blocks = [
      mkBlock({ id: 'a', plannedSeconds: 600, moduleRef: 'intervals', itemRefs: ['P5'] }),
      mkBlock({ id: 'b', plannedSeconds: 900 }),
    ];
    const out = applySwap(blocks, 'a', {
      kind: 'same-submodule', itemRef: 'M3', label: 'Major 3rd',
    });
    expect(out.length).toBe(2);
    expect(out[0].id).toBe('a');
    expect(out[0].plannedSeconds).toBe(600);
    expect(out[0].moduleRef).toBe('intervals');
    expect(out[0].itemRefs).toEqual(['M3']);
    expect(out[0].activityDescription).toBe('Major 3rd');
    expect(out[1]).toBe(blocks[1]); // untouched
  });

  it('swaps module metadata + drops original drill-modal hints on different-submodule', () => {
    const block = mkBlock({
      id: 'a', plannedSeconds: 600,
      moduleRef: 'shapes-and-patterns',
      moduleLabel: 'shapes & patterns',
      moduleAccentHex: '#d4885a',
      itemRefs: ['chord-shape:maj:C:root'],
      inSessionDrillKind: 'chord-shapes',
      quickLaunchRoute: '/shapes-and-patterns?tab=mental-viz',
    });
    const out = applySwap([block], 'a', {
      kind: 'different-submodule',
      submoduleKey: 'intervals',
      moduleRef: 'intervals',
      itemRef: 'P5',
      label: 'Perfect 5th',
    });
    expect(out[0].id).toBe('a');
    expect(out[0].plannedSeconds).toBe(600);
    expect(out[0].moduleRef).toBe('intervals');
    expect(out[0].itemRefs).toEqual(['P5']);
    expect(out[0].activityDescription).toBe('Perfect 5th');
    expect(out[0].inSessionDrillKind).toBeUndefined();
    expect(out[0].quickLaunchRoute).toBeUndefined();
    expect(out[0].isWarmup).toBe(false);
    expect(out[0].isSongPractice).toBe(false);
    // Module label / accent should re-derive from intervals' moduleMeta.
    expect(out[0].moduleLabel).toBe('intervals');
  });

  it('flips isSongPractice true when swapping to Repertoire', () => {
    const block = mkBlock({ id: 'a', moduleRef: 'intervals', itemRefs: ['P5'] });
    const out = applySwap([block], 'a', {
      kind: 'different-submodule',
      submoduleKey: 'repertoire',
      moduleRef: 'repertoire',
      itemRef: 'song-1',
      label: 'Mirror',
    });
    expect(out[0].moduleRef).toBe('repertoire');
    expect(out[0].isSongPractice).toBe(true);
    expect(out[0].isKeyboardRequired).toBe(true);
  });

  it('is a no-op when blockId is unknown', () => {
    const blocks = [mkBlock({ id: 'a' })];
    const out = applySwap(blocks, 'nope', {
      kind: 'same-submodule', itemRef: 'x', label: 'x',
    });
    expect(out).toEqual(blocks);
    expect(out[0]).toBe(blocks[0]);
  });
});

// ---------------------------------------------------------------------
// applySwap — warm-up preservation
// ---------------------------------------------------------------------

describe('applySwap on warm-up blocks', () => {
  it('preserves isWarmup=true on same-submodule chord-quiz swap', () => {
    const quiz = mkBlock({
      id: 'quiz', moduleRef: 'repertoire', isWarmup: true,
      itemRefs: ['song-old'],
      activityDescription: 'Practice memorizing the chord progression — Old Song',
    });
    const out = applySwap([quiz], 'quiz', {
      kind: 'same-submodule', itemRef: 'song-new', label: 'New Song',
    });
    expect(out[0].isWarmup).toBe(true);
    expect(out[0].itemRefs).toEqual(['song-new']);
    // Chord-quiz template rebuilt with the new song's title.
    expect(out[0].activityDescription).toBe(
      'Practice memorizing the chord progression — New Song',
    );
  });

  it('preserves isWarmup=true on same-submodule scale-prep swap (uses raw label)', () => {
    const prep = mkBlock({
      id: 'prep', moduleRef: 'repertoire', isWarmup: true,
      itemRefs: ['scale:major:C', 'scale:major-pentatonic:1:C'],
      activityDescription: 'SCALES — prep for Old Song · C (major + major pent)',
    });
    const out = applySwap([prep], 'prep', {
      kind: 'same-submodule', itemRef: 'scale:natural-minor:F',
      label: 'F natural minor scale',
    });
    expect(out[0].isWarmup).toBe(true);
    expect(out[0].itemRefs).toEqual(['scale:natural-minor:F']);
    // Scale-prep doesn't use a template — the swap-picker label
    // stands in directly (acceptable per the plan; cascade flow
    // rebuilds the prep template only when the anchor itself swaps).
    expect(out[0].activityDescription).toBe('F natural minor scale');
  });

  it('preserves isWarmup=true on same-submodule S&P scales warm-up swap', () => {
    const spWarmup = mkBlock({
      id: 'sp-warmup', moduleRef: 'shapes-and-patterns', isWarmup: true,
      itemRefs: ['scale:major:C'],
    });
    const out = applySwap([spWarmup], 'sp-warmup', {
      kind: 'same-submodule', itemRef: 'scale:major-pentatonic:5:G',
      label: 'G major pent from 5',
    });
    expect(out[0].isWarmup).toBe(true);
  });

  it('drops isWarmup on different-submodule swap (existing behaviour)', () => {
    const quiz = mkBlock({
      id: 'quiz', moduleRef: 'repertoire', isWarmup: true,
      itemRefs: ['song-mirror'],
    });
    const out = applySwap([quiz], 'quiz', {
      kind: 'different-submodule', submoduleKey: 'intervals',
      moduleRef: 'intervals', itemRef: 'P5', label: 'Perfect 5th',
    });
    expect(out[0].isWarmup).toBe(false);
  });
});

// ---------------------------------------------------------------------
// applySwapWithCascade — song-anchor cascade
// ---------------------------------------------------------------------

describe('applySwapWithCascade', () => {
  // Layout for these tests: [chord-quiz, scale-prep, song-anchor].
  // Mirrors the canonical Rep group from groupBlocks.
  function buildAnchorGroup(songId: string, title: string) {
    return [
      mkBlock({
        id: 'quiz', moduleRef: 'repertoire', isWarmup: true,
        itemRefs: [songId],
        activityDescription: `Practice memorizing the chord progression — ${title}`,
      }),
      mkBlock({
        id: 'prep', moduleRef: 'repertoire', isWarmup: true,
        itemRefs: ['scale:major:C', 'scale:major-pentatonic:1:C'],
        activityDescription: `SCALES — prep for ${title} · C (major + major pent)`,
      }),
      mkBlock({
        id: 'anchor', moduleRef: 'repertoire', isSongPractice: true,
        itemRefs: [songId],
        activityDescription: title,
      }),
    ];
  }

  it('cascade-updates chord-quiz + scale-prep when anchor swaps to another major-key song', () => {
    const blocks = buildAnchorGroup('song-mirror', 'Mirror');
    const newSong = mkSong({ id: 'song-newer', title: 'Newer Song', key: 'F' });
    const songsById = new Map<string, Song>([[newSong.id, newSong]]);

    const out = applySwapWithCascade({
      blocks, blockId: 'anchor',
      choice: {
        kind: 'same-submodule', itemRef: newSong.id, label: newSong.title,
      },
      songsById,
    });

    const quiz = out.find(b => b.id === 'quiz')!;
    expect(quiz.itemRefs).toEqual(['song-newer']);
    expect(quiz.activityDescription).toBe(
      'Practice memorizing the chord progression — Newer Song',
    );

    const prep = out.find(b => b.id === 'prep')!;
    expect(prep.itemRefs).toEqual([
      'scale:major:F',
      'scale:major-pentatonic:1:F',
    ]);
    expect(prep.activityDescription).toBe(
      'SCALES — prep for Newer Song · F (major + major pent)',
    );

    const anchor = out.find(b => b.id === 'anchor')!;
    expect(anchor.itemRefs).toEqual(['song-newer']);
    expect(anchor.activityDescription).toBe('Newer Song');
  });

  it('regenerates scale-prep with minor variants when the new song key is minor', () => {
    const blocks = buildAnchorGroup('song-mirror', 'Mirror');
    const minorSong = mkSong({
      id: 'song-min', title: 'Minor Tune', key: 'A minor',
    });
    const songsById = new Map<string, Song>([[minorSong.id, minorSong]]);

    const out = applySwapWithCascade({
      blocks, blockId: 'anchor',
      choice: {
        kind: 'same-submodule', itemRef: minorSong.id, label: minorSong.title,
      },
      songsById,
    });

    const prep = out.find(b => b.id === 'prep')!;
    expect(prep.itemRefs).toEqual([
      'scale:natural-minor:A',
      'scale:minor-pentatonic:1:A',
    ]);
    expect(prep.activityDescription).toBe(
      'SCALES — prep for Minor Tune · A (natural minor + minor pent)',
    );
  });

  it('strips paired warm-ups when anchor swaps to a non-Repertoire module', () => {
    const blocks = buildAnchorGroup('song-mirror', 'Mirror');
    const out = applySwapWithCascade({
      blocks, blockId: 'anchor',
      choice: {
        kind: 'different-submodule', submoduleKey: 'intervals',
        moduleRef: 'intervals', itemRef: 'P5', label: 'Perfect 5th',
      },
      songsById: new Map<string, Song>(),
    });

    // Warm-ups gone, anchor replaced with the intervals block.
    expect(out.map(b => b.id)).toEqual(['anchor']);
    expect(out[0].moduleRef).toBe('intervals');
    expect(out[0].itemRefs).toEqual(['P5']);
  });

  it('does NOT cascade when the swapped block is not a song-anchor', () => {
    const blocks = buildAnchorGroup('song-mirror', 'Mirror');
    const out = applySwapWithCascade({
      blocks, blockId: 'quiz',  // swapping the warm-up itself, not the anchor
      choice: {
        kind: 'same-submodule', itemRef: 'song-other', label: 'Other Song',
      },
      songsById: new Map<string, Song>(),
    });
    // Anchor + scale-prep stay untouched; only the chord-quiz changes.
    const anchor = out.find(b => b.id === 'anchor')!;
    expect(anchor.itemRefs).toEqual(['song-mirror']);
    const prep = out.find(b => b.id === 'prep')!;
    expect(prep.itemRefs).toEqual(['scale:major:C', 'scale:major-pentatonic:1:C']);
  });

  it('leaves scale-prep unchanged when the new song has no parseable key (defensive)', () => {
    const blocks = buildAnchorGroup('song-mirror', 'Mirror');
    const unparseable = mkSong({
      id: 'song-bad', title: 'Bad Key', key: 'not-a-key',
    });
    const songsById = new Map<string, Song>([[unparseable.id, unparseable]]);

    const out = applySwapWithCascade({
      blocks, blockId: 'anchor',
      choice: {
        kind: 'same-submodule', itemRef: unparseable.id, label: unparseable.title,
      },
      songsById,
    });

    // Scale-prep keeps original itemRefs since regeneration failed.
    const prep = out.find(b => b.id === 'prep')!;
    expect(prep.itemRefs).toEqual(['scale:major:C', 'scale:major-pentatonic:1:C']);
    // Chord-quiz still cascades — its template doesn't depend on key.
    const quiz = out.find(b => b.id === 'quiz')!;
    expect(quiz.itemRefs).toEqual(['song-bad']);
    expect(quiz.activityDescription).toBe(
      'Practice memorizing the chord progression — Bad Key',
    );
  });
});
