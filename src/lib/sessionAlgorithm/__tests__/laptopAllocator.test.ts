// @vitest-environment jsdom
/**
 * Tests for the laptop-scoped post-processes:
 *
 *   · applyLaptopTargetShares — rescales practice blocks to the
 *     LAPTOP_TARGET_SHARES table, drops modules outside the list,
 *     passes carve-outs through unchanged.
 *
 *   · applyLaptopBlockOrdering — clusters same-module blocks and
 *     parks Mental Viz immediately before the Repertoire chord-quiz
 *     warm-up.
 *
 * Both are no-ops on non-laptop contexts; verified explicitly.
 */
import { describe, expect, it } from 'vitest';
import {
  applyLaptopBlockOrdering,
  applyLaptopTargetShares,
} from '../laptopAllocator';
import { LAPTOP_TARGET_SHARES } from '../sessionDesign';
import type {
  ProposalBlock,
  ProposalCardData,
} from '../../../modules/practice/proposalTypes';

function mkBlock(p: Partial<ProposalBlock> & { id: string; moduleRef: string }): ProposalBlock {
  return {
    moduleLabel: p.moduleRef,
    moduleAccentHex: '#000',
    activityDescription: p.id,
    plannedSeconds: 600,
    whySnippet: '',
    itemRefs: [],
    isWarmup: false,
    ...p,
  };
}

function mkCard(blocks: ProposalBlock[]): ProposalCardData {
  return {
    kind: 'balanced',
    title: 'Test',
    blocks,
    totalSeconds: blocks.reduce((s, b) => s + b.plannedSeconds, 0),
  };
}

// ---------------------------------------------------------------------
// applyLaptopTargetShares
// ---------------------------------------------------------------------

describe('applyLaptopTargetShares', () => {
  it('no-op on non-laptop contexts', () => {
    const card = mkCard([
      mkBlock({ id: 'a', moduleRef: 'chord-progressions', plannedSeconds: 600 }),
      mkBlock({ id: 'b', moduleRef: 'harmonic-fluency', plannedSeconds: 600 }),
    ]);
    for (const context of ['keys', 'phone', 'full'] as const) {
      const out = applyLaptopTargetShares({ cards: [card], context });
      expect(out).toEqual([card]);
    }
  });

  it('drops modules outside the laptop target list', () => {
    const card = mkCard([
      mkBlock({ id: 'cp', moduleRef: 'chord-progressions', plannedSeconds: 600 }),
      mkBlock({ id: 'sm', moduleRef: 'scales-modes',       plannedSeconds: 600 }),
      mkBlock({ id: 'sp', moduleRef: 'shapes-and-patterns',plannedSeconds: 600 }),
      mkBlock({ id: 'hf', moduleRef: 'harmonic-fluency',   plannedSeconds: 600 }),
    ]);
    const [out] = applyLaptopTargetShares({ cards: [card], context: 'laptop' });
    expect(out.blocks.map(b => b.id)).toEqual(['hf']);
  });

  it('passes carve-outs through (vocab, mental viz, Repertoire warm-up)', () => {
    const card = mkCard([
      mkBlock({ id: 'block-production-vocab', moduleRef: 'production', plannedSeconds: 378, isWarmup: false }),
      mkBlock({ id: 'block-mental-viz',       moduleRef: 'shapes-and-patterns', plannedSeconds: 432, isWarmup: false }),
      mkBlock({ id: 'chord-quiz', moduleRef: 'repertoire', plannedSeconds: 180, isWarmup: true }),
      mkBlock({ id: 'hf',         moduleRef: 'harmonic-fluency', plannedSeconds: 810 }),
      mkBlock({ id: 'prod',       moduleRef: 'production',       plannedSeconds: 2970 }),
    ]);
    const [out] = applyLaptopTargetShares({ cards: [card], context: 'laptop' });
    // Carve-outs preserved with unchanged seconds.
    expect(out.blocks.find(b => b.id === 'block-production-vocab')!.plannedSeconds).toBe(378);
    expect(out.blocks.find(b => b.id === 'block-mental-viz')!.plannedSeconds).toBe(432);
    expect(out.blocks.find(b => b.id === 'chord-quiz')!.plannedSeconds).toBe(180);
  });

  it('rescales practice blocks to the target shares for a 90-min session', () => {
    // 90-min laptop with all 5 categories populated.
    const total = 90 * 60;
    const vocab    = Math.round(total * LAPTOP_TARGET_SHARES.PRODUCTION_VOCAB); // 378
    const mv       = Math.round(total * LAPTOP_TARGET_SHARES.MENTAL_VIZ);       // 432
    const practice = total - vocab - mv;                                         // 4590s
    // Equal-seed practice blocks so the rescale is the visible effect:
    const card = mkCard([
      mkBlock({ id: 'block-production-vocab', moduleRef: 'production', plannedSeconds: vocab }),
      mkBlock({ id: 'block-mental-viz',       moduleRef: 'shapes-and-patterns', plannedSeconds: mv }),
      mkBlock({ id: 'prod', moduleRef: 'production',         plannedSeconds: 1530 }),
      mkBlock({ id: 'hf',   moduleRef: 'harmonic-fluency',   plannedSeconds: 1530 }),
      mkBlock({ id: 'iv',   moduleRef: 'intervals',          plannedSeconds: 765  }),
      mkBlock({ id: 'cr',   moduleRef: 'chord-recognition',  plannedSeconds: 765  }),
    ]);
    const [out] = applyLaptopTargetShares({ cards: [card], context: 'laptop' });

    // Expected practice splits — Production 55/85, HF 15/85, intervals
    // 7.5/85, chord-recognition 7.5/85 (the rounding remainder is
    // absorbed by the last practice block).
    const prod = out.blocks.find(b => b.id === 'prod')!;
    const hf   = out.blocks.find(b => b.id === 'hf')!;
    const iv   = out.blocks.find(b => b.id === 'iv')!;
    const cr   = out.blocks.find(b => b.id === 'cr')!;
    const sumPractice = prod.plannedSeconds + hf.plannedSeconds + iv.plannedSeconds + cr.plannedSeconds;
    expect(sumPractice).toBe(practice);

    // Per-block share (within ±1s for rounding).
    expect(prod.plannedSeconds).toBeCloseTo(practice * (0.55 / 0.85), -1);
    expect(hf.plannedSeconds).toBeCloseTo(practice * (0.15 / 0.85), -1);
    expect(iv.plannedSeconds).toBeCloseTo(practice * (0.075 / 0.85), -1);
    expect(cr.plannedSeconds).toBeCloseTo(practice * (0.075 / 0.85), -1);
  });

  it('redistributes a missing module\'s share to the modules present', () => {
    // Only Production + HF — ET is absent.  Their normalised shares:
    //   Production = 0.55 / 0.70 ≈ 78.6 %
    //   HF         = 0.15 / 0.70 ≈ 21.4 %
    const practice = 5000;
    const card = mkCard([
      mkBlock({ id: 'prod', moduleRef: 'production',       plannedSeconds: 2500 }),
      mkBlock({ id: 'hf',   moduleRef: 'harmonic-fluency', plannedSeconds: 2500 }),
    ]);
    const [out] = applyLaptopTargetShares({ cards: [card], context: 'laptop' });

    const prod = out.blocks.find(b => b.id === 'prod')!;
    const hf   = out.blocks.find(b => b.id === 'hf')!;
    expect(prod.plannedSeconds + hf.plannedSeconds).toBe(practice);
    expect(prod.plannedSeconds).toBeCloseTo(practice * (0.55 / 0.70), -1);
    expect(hf.plannedSeconds).toBeCloseTo(practice * (0.15 / 0.70), -1);
  });

  it('honest fallback when no practice-eligible blocks survive', () => {
    const card = mkCard([
      mkBlock({ id: 'cp', moduleRef: 'chord-progressions', plannedSeconds: 600 }),
    ]);
    const [out] = applyLaptopTargetShares({ cards: [card], context: 'laptop' });
    // No rescale; return card unchanged so the user sees something.
    expect(out).toBe(card);
  });

  it('recomputes totalSeconds after dropping + rescaling', () => {
    const card = mkCard([
      mkBlock({ id: 'block-mental-viz', moduleRef: 'shapes-and-patterns', plannedSeconds: 400 }),
      mkBlock({ id: 'cp',   moduleRef: 'chord-progressions', plannedSeconds: 600 }),
      mkBlock({ id: 'hf',   moduleRef: 'harmonic-fluency',   plannedSeconds: 800 }),
      mkBlock({ id: 'prod', moduleRef: 'production',         plannedSeconds: 1200 }),
    ]);
    const [out] = applyLaptopTargetShares({ cards: [card], context: 'laptop' });
    // Dropped: chord-progressions (600). Practice budget = 800 + 1200 = 2000.
    // Total = 400 (mv) + 2000 (practice) = 2400.
    expect(out.totalSeconds).toBe(2400);
  });
});

// ---------------------------------------------------------------------
// applyLaptopBlockOrdering
// ---------------------------------------------------------------------

describe('applyLaptopBlockOrdering', () => {
  it('no-op on keys / phone contexts (laptop + full are in scope)', () => {
    const card = mkCard([
      mkBlock({ id: 'block-production-vocab', moduleRef: 'production', plannedSeconds: 200 }),
      mkBlock({ id: 'hf',                     moduleRef: 'harmonic-fluency', plannedSeconds: 400 }),
      mkBlock({ id: 'prod',                   moduleRef: 'production', plannedSeconds: 800 }),
    ]);
    for (const context of ['keys', 'phone'] as const) {
      const out = applyLaptopBlockOrdering({ cards: [card], context });
      expect(out).toEqual([card]);
    }
  });

  it('also fires on full — same ordering rules', () => {
    const card = mkCard([
      mkBlock({ id: 'block-mental-viz', moduleRef: 'shapes-and-patterns', plannedSeconds: 240 }),
      mkBlock({ id: 'sp',               moduleRef: 'shapes-and-patterns', plannedSeconds: 1500 }),
      mkBlock({ id: 'chord-quiz',       moduleRef: 'repertoire', isWarmup: true, plannedSeconds: 180 }),
      mkBlock({ id: 'rep',              moduleRef: 'repertoire', plannedSeconds: 1800 }),
      mkBlock({ id: 'hf',               moduleRef: 'harmonic-fluency', plannedSeconds: 500 }),
    ]);
    const [out] = applyLaptopBlockOrdering({ cards: [card], context: 'full' });
    // Mental Viz now sits immediately before the chord-quiz warm-up.
    const idxMv = out.blocks.findIndex(b => b.id === 'block-mental-viz');
    const idxCq = out.blocks.findIndex(b => b.id === 'chord-quiz');
    expect(idxMv).toBe(idxCq - 1);
  });

  it('clusters same-module blocks (Production Vocab + Production lessons)', () => {
    const card = mkCard([
      mkBlock({ id: 'block-production-vocab', moduleRef: 'production', plannedSeconds: 200 }),
      mkBlock({ id: 'hf',                     moduleRef: 'harmonic-fluency', plannedSeconds: 400 }),
      mkBlock({ id: 'iv',                     moduleRef: 'intervals', plannedSeconds: 200 }),
      mkBlock({ id: 'prod',                   moduleRef: 'production', plannedSeconds: 800 }),
    ]);
    const [out] = applyLaptopBlockOrdering({ cards: [card], context: 'laptop' });
    expect(out.blocks.map(b => b.id))
      .toEqual(['block-production-vocab', 'prod', 'hf', 'iv']);
  });

  it('parks Mental Viz immediately before the chord-quiz warm-up', () => {
    const card = mkCard([
      mkBlock({ id: 'hf',               moduleRef: 'harmonic-fluency', plannedSeconds: 400 }),
      mkBlock({ id: 'block-mental-viz', moduleRef: 'shapes-and-patterns', plannedSeconds: 200 }),
      mkBlock({ id: 'chord-quiz',       moduleRef: 'repertoire', isWarmup: true, plannedSeconds: 180 }),
      mkBlock({ id: 'prod',             moduleRef: 'production', plannedSeconds: 800 }),
    ]);
    const [out] = applyLaptopBlockOrdering({ cards: [card], context: 'laptop' });
    // Same-module cluster + MV-before-chord-quiz both fire.
    const idxMv   = out.blocks.findIndex(b => b.id === 'block-mental-viz');
    const idxCq   = out.blocks.findIndex(b => b.id === 'chord-quiz');
    expect(idxMv).toBe(idxCq - 1);
  });

  it('leaves order alone when chord-quiz is absent', () => {
    const card = mkCard([
      mkBlock({ id: 'block-mental-viz', moduleRef: 'shapes-and-patterns', plannedSeconds: 200 }),
      mkBlock({ id: 'hf',               moduleRef: 'harmonic-fluency', plannedSeconds: 400 }),
      mkBlock({ id: 'prod',             moduleRef: 'production', plannedSeconds: 800 }),
    ]);
    const [out] = applyLaptopBlockOrdering({ cards: [card], context: 'laptop' });
    expect(out.blocks.map(b => b.id))
      .toEqual(['block-mental-viz', 'hf', 'prod']);
  });

  it('leaves order alone when Mental Viz is absent', () => {
    const card = mkCard([
      mkBlock({ id: 'chord-quiz', moduleRef: 'repertoire', isWarmup: true, plannedSeconds: 180 }),
      mkBlock({ id: 'hf',         moduleRef: 'harmonic-fluency', plannedSeconds: 400 }),
      mkBlock({ id: 'prod',       moduleRef: 'production', plannedSeconds: 800 }),
    ]);
    const [out] = applyLaptopBlockOrdering({ cards: [card], context: 'laptop' });
    expect(out.blocks.map(b => b.id))
      .toEqual(['chord-quiz', 'hf', 'prod']);
  });

  it('totalSeconds preserved (order changes only, no time math)', () => {
    const card = mkCard([
      mkBlock({ id: 'block-mental-viz', moduleRef: 'shapes-and-patterns', plannedSeconds: 200 }),
      mkBlock({ id: 'chord-quiz',       moduleRef: 'repertoire', isWarmup: true, plannedSeconds: 180 }),
      mkBlock({ id: 'hf',               moduleRef: 'harmonic-fluency', plannedSeconds: 400 }),
    ]);
    const [out] = applyLaptopBlockOrdering({ cards: [card], context: 'laptop' });
    expect(out.totalSeconds).toBe(card.totalSeconds);
  });
});
