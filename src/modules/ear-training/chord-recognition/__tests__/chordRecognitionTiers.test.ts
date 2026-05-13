import { describe, expect, it } from 'vitest';
import {
  CHORD_RECOGNITION_TIERS,
  MAX_TIER,
  getTierForItem,
  isTrackedItem,
  itemsForTier,
  toAttemptForm,
} from '../chordRecognitionTiers';

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

    it('tier 3 holds the 17 inversion item-refs for T1+T2 chords', () => {
      expect(CHORD_RECOGNITION_TIERS[3]).toEqual([
        'maj:1', 'maj:2',
        'min:1', 'min:2',
        'dim:1', 'dim:2',
        'aug:1', 'aug:2',
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
      expect(getTierForItem('aug:2')).toBe(3);
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
