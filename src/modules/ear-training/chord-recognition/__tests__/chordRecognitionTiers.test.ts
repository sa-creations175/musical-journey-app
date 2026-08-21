import { describe, expect, it } from 'vitest';
import {
  CHORD_RECOGNITION_TIERS,
  MAX_TIER,
  getTierForItem,
  isTrackedItem,
  itemsForTier,
  toAttemptForm,
} from '../chordRecognitionTiers';
import {
  DEFAULT_INVERSION_POSITIONS,
  INVERSION_EXCLUDED_CHORD_IDS,
  INVERSION_TRAINED_TIERS,
  attemptItemId,
  inversionsForIntervalCount,
  type Inversion,
} from '../inversionUtils';
import { CHORD_SEEDS } from '../seed';

describe('chordRecognitionTiers', () => {
  describe('MAX_TIER', () => {
    it('is 5', () => {
      expect(MAX_TIER).toBe(5);
    });
  });

  describe('CHORD_RECOGNITION_TIERS — tier composition', () => {
    it('tier 1 holds the six core triads', () => {
      expect(CHORD_RECOGNITION_TIERS[1]).toEqual([
        'maj', 'min', 'dim', 'aug', 'sus2', 'sus4',
      ]);
    });

    it('tier 2 holds the six essential 7ths root position', () => {
      expect(CHORD_RECOGNITION_TIERS[2]).toEqual([
        'maj7', 'min7', 'dom7', 'dim7', 'm7b5', 'minMaj7',
      ]);
    });

    it('tier 3 holds the 15 PLAYABLE inversion item-refs', () => {
      // `aug:1` and `aug:2` were here and are not playable: an
      // augmented triad is a symmetric stack, so its inversions sound
      // identical and the quiz refuses them. Two unattainable items
      // meant tier 3 could never clear and the ladder stopped there —
      // see the composition test at the foot of this file.
      expect(CHORD_RECOGNITION_TIERS[3]).toEqual([
        'maj:1', 'maj:2',
        'min:1', 'min:2',
        'dim:1', 'dim:2',
        'maj7:1', 'maj7:2', 'maj7:3',
        'min7:1', 'min7:2', 'min7:3',
        'dom7:1', 'dom7:2', 'dom7:3',
      ]);
    });

    it('tier 4 holds the 12 extended maj/min items', () => {
      expect(CHORD_RECOGNITION_TIERS[4]).toEqual([
        'maj9', 'maj13', 'maj9_13', 'maj6', 'maj6_9', 'add9', 'add2',
        'min9', 'min11', 'min9_11', 'min6', 'min6_9',
      ]);
    });

    it('tier 5 holds the six altered-dominant items', () => {
      expect(CHORD_RECOGNITION_TIERS[5]).toEqual([
        'dom7sus4', 'dom7b9', 'dom7#9', 'dom7#9#5', 'dom9_13', 'dom13',
      ]);
    });

    it('all tier items are unique across tiers', () => {
      const seen = new Set<string>();
      for (let t = 1 as 1 | 2 | 3 | 4 | 5; t <= 5; t = (t + 1) as 1 | 2 | 3 | 4 | 5) {
        for (const item of CHORD_RECOGNITION_TIERS[t]) {
          expect(seen.has(item)).toBe(false);
          seen.add(item);
        }
      }
    });
  });

  describe('getTierForItem', () => {
    it('classifies tier 1 bare chordIds correctly', () => {
      expect(getTierForItem('maj')).toBe(1);
      expect(getTierForItem('min')).toBe(1);
      expect(getTierForItem('dim')).toBe(1);
      expect(getTierForItem('aug')).toBe(1);
      expect(getTierForItem('sus2')).toBe(1);
      expect(getTierForItem('sus4')).toBe(1);
    });

    it('classifies tier 1 attempt-form items (:0 suffix) correctly', () => {
      // `attemptItemId(chord.id, 0)` writes "maj:0" but the tier table
      // lists "maj". Normalisation should land them on tier 1.
      expect(getTierForItem('maj:0')).toBe(1);
      expect(getTierForItem('min:0')).toBe(1);
      expect(getTierForItem('sus2:0')).toBe(1);
    });

    it('classifies tier 2 root-position 7ths correctly', () => {
      expect(getTierForItem('maj7')).toBe(2);
      expect(getTierForItem('min7')).toBe(2);
      expect(getTierForItem('dom7')).toBe(2);
      expect(getTierForItem('dim7')).toBe(2);
      expect(getTierForItem('m7b5')).toBe(2);
      expect(getTierForItem('minMaj7')).toBe(2);
    });

    it('classifies tier 2 attempt-form 7ths correctly', () => {
      expect(getTierForItem('maj7:0')).toBe(2);
      expect(getTierForItem('m7b5:0')).toBe(2);
      expect(getTierForItem('minMaj7:0')).toBe(2);
    });

    it('classifies tier 3 inversion items correctly', () => {
      expect(getTierForItem('maj:1')).toBe(3);
      expect(getTierForItem('maj:2')).toBe(3);
      expect(getTierForItem('min:1')).toBe(3);
      expect(getTierForItem('maj7:1')).toBe(3);
      expect(getTierForItem('maj7:3')).toBe(3);
      expect(getTierForItem('dom7:3')).toBe(3);
    });

    it('classifies tier 4 extension chords correctly', () => {
      expect(getTierForItem('maj9')).toBe(4);
      expect(getTierForItem('maj13')).toBe(4);
      expect(getTierForItem('maj9_13')).toBe(4);
      expect(getTierForItem('maj6_9')).toBe(4);
      expect(getTierForItem('add9')).toBe(4);
      expect(getTierForItem('min11')).toBe(4);
      expect(getTierForItem('min6_9')).toBe(4);
    });

    it('classifies tier 5 altered dominants correctly', () => {
      expect(getTierForItem('dom7sus4')).toBe(5);
      expect(getTierForItem('dom7b9')).toBe(5);
      expect(getTierForItem('dom7#9')).toBe(5);
      expect(getTierForItem('dom7#9#5')).toBe(5);
      expect(getTierForItem('dom9_13')).toBe(5);
      expect(getTierForItem('dom13')).toBe(5);
    });

    it('throws on items outside the tier system', () => {
      // dim7 / m7b5 / minMaj7 inversions are intentionally excluded —
      // their root position is tier 2 but the inversions are not
      // part of the progression at all.
      expect(() => getTierForItem('dim7:1')).toThrow(/not part of the tier system/);
      expect(() => getTierForItem('m7b5:2')).toThrow(/not part of the tier system/);
      expect(() => getTierForItem('minMaj7:1')).toThrow(/not part of the tier system/);
      expect(() => getTierForItem('sus2:1')).toThrow(/not part of the tier system/);
      expect(() => getTierForItem('bogus')).toThrow(/not part of the tier system/);
    });
  });

  describe('isTrackedItem', () => {
    it('returns true for every item in every tier (both forms)', () => {
      for (let t = 1 as 1 | 2 | 3 | 4 | 5; t <= 5; t = (t + 1) as 1 | 2 | 3 | 4 | 5) {
        for (const item of CHORD_RECOGNITION_TIERS[t]) {
          expect(isTrackedItem(item)).toBe(true);
          expect(isTrackedItem(toAttemptForm(item))).toBe(true);
        }
      }
    });

    it('returns false for items outside the tier system', () => {
      expect(isTrackedItem('dim7:1')).toBe(false);
      expect(isTrackedItem('sus4:1')).toBe(false);
      expect(isTrackedItem('bogus')).toBe(false);
    });
  });

  describe('toAttemptForm', () => {
    it('appends :0 to bare chordIds', () => {
      expect(toAttemptForm('maj')).toBe('maj:0');
      expect(toAttemptForm('m7b5')).toBe('m7b5:0');
      expect(toAttemptForm('dom7sus4')).toBe('dom7sus4:0');
    });

    it('passes inversion-form items through unchanged', () => {
      expect(toAttemptForm('maj:1')).toBe('maj:1');
      expect(toAttemptForm('dom7:3')).toBe('dom7:3');
    });
  });

  describe('itemsForTier', () => {
    it('returns the same array as CHORD_RECOGNITION_TIERS[t]', () => {
      expect(itemsForTier(1)).toBe(CHORD_RECOGNITION_TIERS[1]);
      expect(itemsForTier(5)).toBe(CHORD_RECOGNITION_TIERS[5]);
    });
  });
});

// ── The tier table against what the quiz will play ───────────────────

describe('every tier item can actually be attempted', () => {
  /**
   * THE TEST THAT WAS MISSING.
   *
   * The tier table and the quiz's inversion rules were each correct
   * and were never checked against each other. Tier 3 listed `aug:1`
   * and `aug:2`, which `INVERSION_EXCLUDED_CHORD_IDS` refuses, and
   * nine seventh inversions that `stepTwoEligible` — foundational-only
   * until 21 Aug 2026 — could never generate. `computeUnlockedTier`
   * stops at the first incomplete tier, so the ladder capped at 3
   * permanently and nothing said so.
   *
   * An unattainable item in a tier is not a cosmetic error. It is a
   * tier that cannot be finished, and every tier above it going dark.
   */
  const CHORD_BY_ID = new Map(CHORD_SEEDS.map(c => [c.id, c]));

  /**
   * Mirrors `buildCandidates`: which item-refs the quiz can produce
   * with the DEFAULT settings.
   *
   * The default, not "every position enabled". A player who never
   * opens the drawer has to be able to finish the ladder, and the
   * fourth position is the only route to the three third-inversion
   * items in tier 3 — so a test written against a hard-coded
   * [0,1,2,3] passes while the shipped default leaves the tier
   * unclearable. Verified by reverting the default and watching this
   * stay green before it read the constant.
   */
  function playableRefs(): Set<string> {
    const positions: Inversion[] = DEFAULT_INVERSION_POSITIONS;
    const out = new Set<string>();
    for (const c of CHORD_SEEDS) {
      const trained =
        INVERSION_TRAINED_TIERS.has(c.tier)
        && !INVERSION_EXCLUDED_CHORD_IDS.has(c.id)
        && positions.length >= 2;
      const valid = inversionsForIntervalCount(c.intervals.length);
      const invs: Inversion[] = trained
        ? positions.filter(p => valid.includes(p))
        : [0];
      for (const inv of (invs.length > 0 ? invs : [0 as Inversion])) {
        out.add(attemptItemId(c.id, inv));
      }
    }
    return out;
  }

  it('the fixture can express the failure', () => {
    // Guard the guard: `playableRefs` must genuinely exclude things,
    // or "every item is playable" is a tautology over everything.
    const refs = playableRefs();
    expect(refs.has('aug:1')).toBe(false);
    expect(refs.has('dim7:1')).toBe(false);
    expect(refs.has('maj13:1')).toBe(false);
    expect(refs.has('maj7:3')).toBe(true);
  });

  for (const tier of [1, 2, 3, 4, 5] as const) {
    it(`tier ${tier} lists nothing the quiz refuses to serve`, () => {
      const refs = playableRefs();
      const unattainable = CHORD_RECOGNITION_TIERS[tier]
        .map(item => (item.includes(':') ? item : `${item}:0`))
        .filter(item => !refs.has(item));
      expect(unattainable, `tier ${tier} lists unattainable items`).toEqual([]);
    });
  }

  it('every tier item names a chord the catalog holds', () => {
    for (const [tier, items] of Object.entries(CHORD_RECOGNITION_TIERS)) {
      for (const item of items) {
        const chordId = item.split(':')[0];
        expect(CHORD_BY_ID.has(chordId), `tier ${tier}: ${item}`).toBe(true);
      }
    }
  });
});
