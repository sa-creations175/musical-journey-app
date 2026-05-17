// @vitest-environment jsdom
/**
 * Tests for applyFullArcShares — the keyboard arc floor for full
 * sessions. The invariant: keyboard content gets at least
 * FULL_KEYBOARD_MIN_SHARE (60 %) of session time. No-op on every
 * other context. Warm-ups stay locked at their original seconds.
 */
import { describe, expect, it } from 'vitest';
import { applyFullArcShares } from '../fullArcAllocator';
import {
  FULL_KEYBOARD_MIN_SHARE,
  FULL_NON_KEYBOARD_MAX_SHARE,
} from '../sessionDesign';
import type {
  ProposalBlock,
  ProposalCardData,
} from '../../../modules/practice/proposalTypes';

function mkBlock(p: Partial<ProposalBlock> & {
  id: string;
  moduleRef: string;
  isKeyboardRequired: boolean;
}): ProposalBlock {
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

describe('applyFullArcShares', () => {
  it('constants sum to 1.0 — keyboard floor and non-keyboard cap are the same invariant', () => {
    expect(FULL_KEYBOARD_MIN_SHARE + FULL_NON_KEYBOARD_MAX_SHARE).toBe(1.0);
  });

  it('no-op on non-full contexts', () => {
    const card = mkCard([
      mkBlock({ id: 'sp', moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 1000 }),
      mkBlock({ id: 'hf', moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 2000 }),
    ]);
    for (const context of ['keys', 'laptop', 'phone'] as const) {
      const out = applyFullArcShares({ cards: [card], context });
      expect(out).toEqual([card]);
    }
  });

  it('no-op when keyboard share already meets the 60 % floor', () => {
    // KB = 3600 / 6000 = 60 % = exactly the floor.
    const card = mkCard([
      mkBlock({ id: 'sp', moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 3600 }),
      mkBlock({ id: 'hf', moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 2400 }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out).toBe(card);
  });

  it('no-op when keyboard share is comfortably above the floor', () => {
    // KB = 4800 / 6000 = 80 %.
    const card = mkCard([
      mkBlock({ id: 'sp', moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 4800 }),
      mkBlock({ id: 'hf', moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 1200 }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out).toBe(card);
  });

  it('rescales when keyboard falls below the floor — exactly 60 % after, total preserved', () => {
    // KB = 2400 / 6000 = 40 % (well below). NK should shrink to 40 %,
    // KB grow to 60 %.
    const total = 6000;
    const card = mkCard([
      mkBlock({ id: 'sp',   moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 1600 }),
      mkBlock({ id: 'rep',  moduleRef: 'repertoire',          isKeyboardRequired: true,  plannedSeconds: 800  }),
      mkBlock({ id: 'hf',   moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 2000 }),
      mkBlock({ id: 'iv',   moduleRef: 'intervals',           isKeyboardRequired: false, plannedSeconds: 1000 }),
      mkBlock({ id: 'prod', moduleRef: 'production',          isKeyboardRequired: false, plannedSeconds: 600  }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });

    const kbAfter = out.blocks.filter(b => b.isKeyboardRequired).reduce((s, b) => s + b.plannedSeconds, 0);
    const nkAfter = out.blocks.filter(b => !b.isKeyboardRequired).reduce((s, b) => s + b.plannedSeconds, 0);

    expect(kbAfter + nkAfter).toBe(total);
    expect(kbAfter).toBe(Math.round(total * FULL_KEYBOARD_MIN_SHARE)); // 3600
    expect(nkAfter).toBe(total - kbAfter); // 2400
  });

  it('warm-ups stay locked at original seconds', () => {
    const total = 6000;
    const card = mkCard([
      mkBlock({ id: 'quiz', moduleRef: 'repertoire',          isKeyboardRequired: true,  isWarmup: true, plannedSeconds: 180 }),
      mkBlock({ id: 'prep', moduleRef: 'repertoire',          isKeyboardRequired: true,  isWarmup: true, plannedSeconds: 90  }),
      mkBlock({ id: 'sp',   moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 1330 }),
      mkBlock({ id: 'rep',  moduleRef: 'repertoire',          isKeyboardRequired: true,  plannedSeconds: 1000 }),
      mkBlock({ id: 'hf',   moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 2000 }),
      mkBlock({ id: 'iv',   moduleRef: 'intervals',           isKeyboardRequired: false, plannedSeconds: 1400 }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });

    expect(out.blocks.find(b => b.id === 'quiz')!.plannedSeconds).toBe(180);
    expect(out.blocks.find(b => b.id === 'prep')!.plannedSeconds).toBe(90);
    expect(out.totalSeconds).toBe(total);

    const kbAfter = out.blocks.filter(b => b.isKeyboardRequired).reduce((s, b) => s + b.plannedSeconds, 0);
    expect(kbAfter).toBe(Math.round(total * FULL_KEYBOARD_MIN_SHARE));
  });

  it('preserves original block order after the rescale', () => {
    const card = mkCard([
      mkBlock({ id: 'sp',  moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 1600 }),
      mkBlock({ id: 'hf',  moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 2000 }),
      mkBlock({ id: 'rep', moduleRef: 'repertoire',          isKeyboardRequired: true,  plannedSeconds: 800  }),
      mkBlock({ id: 'iv',  moduleRef: 'intervals',           isKeyboardRequired: false, plannedSeconds: 1600 }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out.blocks.map(b => b.id)).toEqual(['sp', 'hf', 'rep', 'iv']);
  });

  it('no-op when card has zero non-keyboard non-warm-up blocks (nothing to shrink)', () => {
    const card = mkCard([
      mkBlock({ id: 'sp',  moduleRef: 'shapes-and-patterns', isKeyboardRequired: true, plannedSeconds: 3000 }),
      mkBlock({ id: 'rep', moduleRef: 'repertoire',          isKeyboardRequired: true, plannedSeconds: 3000 }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out).toBe(card);
  });

  it('no-op when card has zero keyboard non-warm-up blocks (nothing to grow into)', () => {
    // 100 % non-keyboard card — the rescale can't conjure keyboard
    // content from nothing. Leave it alone (honest fallback).
    const card = mkCard([
      mkBlock({ id: 'hf', moduleRef: 'harmonic-fluency', isKeyboardRequired: false, plannedSeconds: 1800 }),
      mkBlock({ id: 'iv', moduleRef: 'intervals',        isKeyboardRequired: false, plannedSeconds: 1800 }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out).toBe(card);
  });

  it('bails when warm-ups eat enough that either non-warm-up bucket would underflow', () => {
    // Warm-ups: 4500 s KB + 0 NK out of 6000-s card → 75 % KB warm-ups.
    // Target KB total = 3600. Target KB non-warm-up = 3600 - 4500 = -900.
    // Bail.
    const card = mkCard([
      mkBlock({ id: 'quiz', moduleRef: 'repertoire',          isKeyboardRequired: true,  isWarmup: true, plannedSeconds: 4500 }),
      mkBlock({ id: 'sp',   moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 100  }),
      mkBlock({ id: 'hf',   moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 1400 }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out).toBe(card);
  });

  it('defensive partitioning: undefined isKeyboardRequired counts as keyboard (never strands content)', () => {
    // Mystery block with no flag — treated as keyboard so it doesn't
    // get pulled into the NK pool and shrunk.
    const card = mkCard([
      mkBlock({ id: 'mystery', moduleRef: 'shapes-and-patterns', isKeyboardRequired: undefined as unknown as boolean, plannedSeconds: 1500 }),
      mkBlock({ id: 'hf',      moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 4500 }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out.totalSeconds).toBe(6000);
    // KB share = 1500/6000 = 25 % → rescale grows KB to 60 % (3600s),
    // NK shrinks to 40 % (2400s).
    expect(out.blocks.find(b => b.id === 'mystery')!.plannedSeconds).toBe(3600);
    expect(out.blocks.find(b => b.id === 'hf')!.plannedSeconds).toBe(2400);
  });

  it('defensive partitioning: undefined isWarmup counts as non-warm-up (eligible for rescale)', () => {
    const card = mkCard([
      mkBlock({ id: 'sp', moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  isWarmup: undefined as unknown as boolean, plannedSeconds: 1000 }),
      mkBlock({ id: 'hf', moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 5000 }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out.totalSeconds).toBe(6000);
    // KB share = 1000/6000 = 17 % → rescale grows KB to 3600, NK to 2400.
    expect(out.blocks.find(b => b.id === 'sp')!.plannedSeconds).toBe(3600);
    expect(out.blocks.find(b => b.id === 'hf')!.plannedSeconds).toBe(2400);
  });

  it('full session realistic case: KB-warm-ups + KB + NK — rescale lifts KB to 60 %, NK held under 40 %', () => {
    // Mirrors a 90-min full session: mental viz + S&P scales (warmup)
    // + S&P walk + S&P VL + chord-quiz (warmup) + scale-prep (warmup)
    // + spotlight + HF + ET + Production. Starts with KB share well
    // below the floor; rescale lifts it to exactly 60 %.
    const total = 5400;
    const card = mkCard([
      mkBlock({ id: 'mv',         moduleRef: 'shapes-and-patterns', isKeyboardRequired: false, plannedSeconds: 240  }),
      mkBlock({ id: 'sp-scales',  moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  isWarmup: true, plannedSeconds: 300 }),
      mkBlock({ id: 'sp-walk',    moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 500  }),
      mkBlock({ id: 'sp-vl',      moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 400  }),
      mkBlock({ id: 'rep-quiz',   moduleRef: 'repertoire',          isKeyboardRequired: true,  isWarmup: true, plannedSeconds: 180 }),
      mkBlock({ id: 'rep-prep',   moduleRef: 'repertoire',          isKeyboardRequired: true,  isWarmup: true, plannedSeconds: 90  }),
      mkBlock({ id: 'rep-spot',   moduleRef: 'repertoire',          isKeyboardRequired: true,  plannedSeconds: 800  }),
      mkBlock({ id: 'hf',         moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 1200 }),
      mkBlock({ id: 'iv',         moduleRef: 'intervals',           isKeyboardRequired: false, plannedSeconds: 800  }),
      mkBlock({ id: 'prod',       moduleRef: 'production',          isKeyboardRequired: false, plannedSeconds: 890  }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });

    const kbAfter = out.blocks.filter(b => b.isKeyboardRequired).reduce((s, b) => s + b.plannedSeconds, 0);
    const nkAfter = out.blocks.filter(b => !b.isKeyboardRequired).reduce((s, b) => s + b.plannedSeconds, 0);
    expect(kbAfter + nkAfter).toBe(total);
    expect(kbAfter).toBe(Math.round(total * FULL_KEYBOARD_MIN_SHARE)); // 3240
    expect(nkAfter).toBeLessThanOrEqual(Math.round(total * FULL_NON_KEYBOARD_MAX_SHARE));

    // Warm-ups locked.
    expect(out.blocks.find(b => b.id === 'sp-scales')!.plannedSeconds).toBe(300);
    expect(out.blocks.find(b => b.id === 'rep-quiz')!.plannedSeconds).toBe(180);
    expect(out.blocks.find(b => b.id === 'rep-prep')!.plannedSeconds).toBe(90);
  });
});
