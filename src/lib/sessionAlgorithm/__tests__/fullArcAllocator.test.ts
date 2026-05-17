// @vitest-environment jsdom
/**
 * Tests for applyFullArcShares — the non-keyboard arc floor for
 * full sessions. No-op on every other context. Inside 'full',
 * rescales only when non-keyboard content sits below the floor;
 * warm-ups stay locked at their original seconds.
 */
import { describe, expect, it } from 'vitest';
import { applyFullArcShares } from '../fullArcAllocator';
import { FULL_NON_KEYBOARD_MIN_SHARE } from '../sessionDesign';
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
  it('no-op on non-full contexts', () => {
    const card = mkCard([
      mkBlock({ id: 'sp', moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 3000 }),
      mkBlock({ id: 'hf', moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 200  }),
    ]);
    for (const context of ['keys', 'laptop', 'phone'] as const) {
      const out = applyFullArcShares({ cards: [card], context });
      expect(out).toEqual([card]);
    }
  });

  it('no-op when non-keyboard share already meets the floor', () => {
    // Non-keyboard share = 1800 / 6000 = 30 % = exactly the floor.
    const card = mkCard([
      mkBlock({ id: 'sp', moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 4200 }),
      mkBlock({ id: 'hf', moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 1800 }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out).toBe(card);
  });

  it('rescales when non-keyboard falls below the floor — exactly 30 % after, total preserved', () => {
    // 90-min full session. KB has 5400 s, NK has 0 (no non-keyboard
    // blocks)... let's instead seed with under-floor: NK = 600s out
    // of 6000s total = 10 %.
    const total = 6000;
    const card = mkCard([
      mkBlock({ id: 'sp',   moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 3600 }),
      mkBlock({ id: 'rep',  moduleRef: 'repertoire',          isKeyboardRequired: true,  plannedSeconds: 1800 }),
      mkBlock({ id: 'hf',   moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 400  }),
      mkBlock({ id: 'iv',   moduleRef: 'intervals',           isKeyboardRequired: false, plannedSeconds: 200  }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });

    const kbAfter = out.blocks.filter(b => b.isKeyboardRequired).reduce((s, b) => s + b.plannedSeconds, 0);
    const nkAfter = out.blocks.filter(b => !b.isKeyboardRequired).reduce((s, b) => s + b.plannedSeconds, 0);

    expect(kbAfter + nkAfter).toBe(total);
    expect(nkAfter).toBe(Math.round(total * FULL_NON_KEYBOARD_MIN_SHARE)); // 1800
    expect(kbAfter).toBe(total - nkAfter);
  });

  it('warm-ups stay locked at original seconds', () => {
    const total = 6000;
    const card = mkCard([
      mkBlock({ id: 'quiz', moduleRef: 'repertoire',          isKeyboardRequired: true,  isWarmup: true,  plannedSeconds: 180 }),
      mkBlock({ id: 'prep', moduleRef: 'repertoire',          isKeyboardRequired: true,  isWarmup: true,  plannedSeconds: 90  }),
      mkBlock({ id: 'sp',   moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 3330 }),
      mkBlock({ id: 'rep',  moduleRef: 'repertoire',          isKeyboardRequired: true,  plannedSeconds: 2000 }),
      mkBlock({ id: 'hf',   moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 400  }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });

    expect(out.blocks.find(b => b.id === 'quiz')!.plannedSeconds).toBe(180);
    expect(out.blocks.find(b => b.id === 'prep')!.plannedSeconds).toBe(90);
    expect(out.totalSeconds).toBe(total);

    const nkAfter = out.blocks.filter(b => !b.isKeyboardRequired).reduce((s, b) => s + b.plannedSeconds, 0);
    expect(nkAfter).toBe(Math.round(total * FULL_NON_KEYBOARD_MIN_SHARE));
  });

  it('preserves original block order after the rescale', () => {
    const card = mkCard([
      mkBlock({ id: 'sp',  moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 3600 }),
      mkBlock({ id: 'hf',  moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 200  }),
      mkBlock({ id: 'rep', moduleRef: 'repertoire',          isKeyboardRequired: true,  plannedSeconds: 2000 }),
      mkBlock({ id: 'iv',  moduleRef: 'intervals',           isKeyboardRequired: false, plannedSeconds: 200  }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out.blocks.map(b => b.id)).toEqual(['sp', 'hf', 'rep', 'iv']);
  });

  it('no-op when card has zero non-keyboard blocks (nothing to grow into)', () => {
    const card = mkCard([
      mkBlock({ id: 'sp',  moduleRef: 'shapes-and-patterns', isKeyboardRequired: true, plannedSeconds: 3000 }),
      mkBlock({ id: 'rep', moduleRef: 'repertoire',          isKeyboardRequired: true, plannedSeconds: 3000 }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out).toBe(card);
  });

  it('no-op when card has only non-keyboard warm-ups (no non-warm-up recipient)', () => {
    const card = mkCard([
      mkBlock({ id: 'sp',  moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 3000 }),
      mkBlock({ id: 'mv',  moduleRef: 'shapes-and-patterns', isKeyboardRequired: false, isWarmup: true, plannedSeconds: 240 }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out).toBe(card);
  });

  it('no-op when card has zero keyboard blocks (nothing to shrink)', () => {
    const card = mkCard([
      mkBlock({ id: 'hf', moduleRef: 'harmonic-fluency', isKeyboardRequired: false, plannedSeconds: 1800 }),
      mkBlock({ id: 'iv', moduleRef: 'intervals',        isKeyboardRequired: false, plannedSeconds: 1800 }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out).toBe(card);
  });

  it('honest fallback — warm-up-only keyboard with non-keyboard below floor', () => {
    // Warm-ups eat 200s. Practice budget 5800. NK = 100 (1.7%).
    // Target NK = 1800. Target KB = 6000 - 200 (warmups) - 1800 = 4000.
    // KB non-warm-up bucket has 1 block — 4000 ≥ 1 (the floor count),
    // so the rescale proceeds normally.
    const card = mkCard([
      mkBlock({ id: 'quiz', moduleRef: 'repertoire',          isKeyboardRequired: true,  isWarmup: true, plannedSeconds: 200  }),
      mkBlock({ id: 'sp',   moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 5700 }),
      mkBlock({ id: 'hf',   moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 100  }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out.totalSeconds).toBe(6000);
    expect(out.blocks.find(b => b.id === 'quiz')!.plannedSeconds).toBe(200);
    expect(out.blocks.find(b => b.id === 'hf')!.plannedSeconds).toBe(1800);
    expect(out.blocks.find(b => b.id === 'sp')!.plannedSeconds).toBe(4000);
  });

  it('bails when warm-ups eat enough that keyboard non-warm-up would underflow', () => {
    // Warm-ups eat 4500 s of 6000-s card → 75%. Target NK = 1800.
    // Target KB (non-warm-up) = 6000 - 4500 - 1800 = -300. Bail.
    const card = mkCard([
      mkBlock({ id: 'quiz', moduleRef: 'repertoire',          isKeyboardRequired: true,  isWarmup: true, plannedSeconds: 4500 }),
      mkBlock({ id: 'sp',   moduleRef: 'shapes-and-patterns', isKeyboardRequired: true,  plannedSeconds: 1400 }),
      mkBlock({ id: 'hf',   moduleRef: 'harmonic-fluency',    isKeyboardRequired: false, plannedSeconds: 100  }),
    ]);
    const [out] = applyFullArcShares({ cards: [card], context: 'full' });
    expect(out).toBe(card);
  });
});
