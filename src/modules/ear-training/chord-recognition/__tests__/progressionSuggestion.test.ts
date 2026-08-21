/**
 * What the progression suggests, and — mostly — what it declines to.
 *
 * The load-bearing assertions here are the silences. A suggestion that
 * fires when you are not skipping anything is noise; one that fires on
 * work you cannot do is worse than none, because it reads as guidance
 * and cannot be followed.
 */
import { describe, expect, it } from 'vitest';
import {
  PROGRESSION_TIER_BY_TAB,
  SUGGESTION_PREFIX,
  progressionSuggestionFor,
} from '../progressionSuggestion';
import {
  UNLOCK_MIN_ACCURACY,
  UNLOCK_MIN_ATTEMPTS,
  tierProgress,
} from '../tierUnlock';
import { CHORD_RECOGNITION_TIERS } from '../chordRecognitionTiers';

type Stats = Map<string, { correct: number; total: number }>;

/** A tally in which every named item is cleared, on the real
 *  threshold rather than a number written down here. */
function cleared(...items: string[]): Stats {
  const m: Stats = new Map();
  for (const i of items) {
    m.set(i.includes(':') ? i : `${i}:0`, {
      correct: UNLOCK_MIN_ATTEMPTS,
      total: UNLOCK_MIN_ATTEMPTS,
    });
  }
  return m;
}

const TIER_1 = [...CHORD_RECOGNITION_TIERS[1]];
const TIER_2 = [...CHORD_RECOGNITION_TIERS[2]];

describe('it fires only when you have jumped ahead', () => {
  const nothing: Stats = new Map();

  it('suggests the triads from a tab further up the ladder', () => {
    const s = progressionSuggestionFor('seventh', nothing)!;
    expect(s.tab).toBe('foundational');
    expect(s.headline).toBe('The foundational triads first.');
  });

  it('says nothing on the tab it would have suggested', () => {
    // Already doing it.
    expect(progressionSuggestionFor('foundational', nothing)).toBeNull();
  });

  it('says nothing on all chords', () => {
    // Drilling everything is not skipping anything.
    expect(progressionSuggestionFor('all', nothing)).toBeNull();
  });

  it('says nothing on a tab BEHIND the suggestion', () => {
    // Going back to review is not a mistake to correct.
    const s = cleared(...TIER_1);
    // Guard the guard: tier 2 really is what the ladder is waiting on.
    expect(tierProgress(1, s).cleared).toBe(tierProgress(1, s).total);
    expect(progressionSuggestionFor('foundational', s)).toBeNull();
    expect(progressionSuggestionFor('seventh', s)).toBeNull();
    expect(progressionSuggestionFor('extensions', s)!.tab).toBe('seventh');
  });

  it('fires from both tabs above the sevenths', () => {
    // NOT a test of the ordering — see below. Both are ahead of tier
    // 2 whichever order you read, so this only pins that neither is
    // skipped.
    const s = cleared(...TIER_1);
    expect(progressionSuggestionFor('dominant', s)!.tab).toBe('seventh');
    expect(progressionSuggestionFor('extensions', s)!.tab).toBe('seventh');
  });

  it('places the tabs on the LADDER, not on the strip', () => {
    // Dominant Variations is third in the strip and LAST in the
    // ladder; Extensions & Colors is fourth in both. Behaviour cannot
    // currently tell the two orderings apart, because only tiers 1 and
    // 2 are suggestable and both tabs sit above either way — verified
    // by reversing the map and watching every test stay green. So the
    // fact is asserted directly rather than through a behaviour that
    // does not depend on it yet.
    expect(PROGRESSION_TIER_BY_TAB.dominant)
      .toBeGreaterThan(PROGRESSION_TIER_BY_TAB.extensions);
    expect(PROGRESSION_TIER_BY_TAB.foundational)
      .toBeLessThan(PROGRESSION_TIER_BY_TAB.seventh);
  });
});

describe('it goes quiet past tier 2', () => {
  it('says nothing once the triads and sevenths are done', () => {
    // THE RULE THIS PINS. Tier 3 is inversions, which are not a tab -
    // they live under Foundational Triads and Seventh Chords with the
    // gear on. The fire rule asks whether a tab is ahead of what the
    // ladder wants, and a step with no tab has no position in that
    // comparison. Skipping it to reach tiers 4 and 5 would recommend
    // extensions while the ladder wants inversions.
    const s = cleared(...TIER_1, ...TIER_2);
    expect(progressionSuggestionFor('extensions', s)).toBeNull();
    expect(progressionSuggestionFor('dominant', s)).toBeNull();
    expect(progressionSuggestionFor('foundational', s)).toBeNull();
  });

  it('the fixture really does clear both tiers', () => {
    // Guard the guard: without this, the silence above could be a
    // fixture that never reached tier 2 rather than a decision.
    const s = cleared(...TIER_1, ...TIER_2);
    for (const tier of [1, 2] as const) {
      const p = tierProgress(tier, s);
      expect(p.cleared, `tier ${tier}`).toBe(p.total);
    }
    expect(tierProgress(3, s).cleared).toBe(0);
  });
});

describe('what it says', () => {
  const partial = cleared(TIER_1[0], TIER_1[1], TIER_1[2]);

  it('opens with an instruction, not a status', () => {
    const s = progressionSuggestionFor('seventh', partial)!;
    // A sentence, capitalised after the dash.
    expect(`${SUGGESTION_PREFIX}${s.headline}`)
      .toBe('Suggestion — The foundational triads first.');
  });

  it('counts live, on the same definition the unlock walk gates on', () => {
    const s = progressionSuggestionFor('seventh', partial)!;
    expect(s.cleared).toBe(3);
    expect(s.total).toBe(TIER_1.length);
    expect(s.progress).toContain(`cleared ${s.cleared} of ${s.total}`);
  });

  it('moves as the count does', () => {
    // Guard against a hard-coded 3 of 6: a different tally must
    // produce a different sentence.
    const one = progressionSuggestionFor('seventh', cleared(TIER_1[0]))!;
    const five = progressionSuggestionFor('seventh', cleared(...TIER_1.slice(0, 5)))!;
    expect(one.cleared).toBe(1);
    expect(five.cleared).toBe(5);
    expect(one.progress).not.toBe(five.progress);
  });

  it('DEFINES cleared rather than leaving it to be inferred', () => {
    // An undefined threshold on a screen is the thing this layer
    // exists to remove — and the numbers come from the constants the
    // gate reads, so the sentence cannot describe a rule the code no
    // longer follows.
    const s = progressionSuggestionFor('seventh', partial)!;
    expect(s.progress).toContain(`${UNLOCK_MIN_ATTEMPTS} attempts`);
    expect(s.progress).toContain(`${Math.round(UNLOCK_MIN_ACCURACY * 100)}% correct`);
  });

  it('says why in musical terms rather than procedural ones', () => {
    const s = progressionSuggestionFor('seventh', partial)!;
    expect(s.why).toContain('triad with a note added');
    // Not "because tier 2 is locked" — it is not.
    expect(s.why.toLowerCase()).not.toContain('lock');
  });

  it('states outright that nothing is locked', () => {
    // This tab strip WAS silently gated for three months. The clause
    // is owed out loud rather than left to be discovered.
    const s = progressionSuggestionFor('seventh', partial)!;
    expect(s.disclaimer).toContain('Nothing is locked');
    expect(s.disclaimer).toContain('every tab plays');
  });

  it('names the sevenths once the triads are done', () => {
    const s = progressionSuggestionFor('extensions', cleared(...TIER_1))!;
    expect(s.headline).toBe('The seventh chords next.');
    expect(s.why).toContain('seventh chords with more on top');
    expect(s.total).toBe(TIER_2.length);
  });
});
