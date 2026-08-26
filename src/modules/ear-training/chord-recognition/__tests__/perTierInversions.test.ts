/**
 * Each tier holds its own inversion setting.
 *
 * =====================================================================
 * THE ARRANGEMENT THAT COULD NOT BE EXPRESSED BEFORE, and the reason
 * for the change: root-position triads while the sevenths run through
 * their inversions. A single shared list could not say it — turning the
 * 3rd inversion on for the sevenths turned it on for chords that do not
 * have one, and turning everything off to steady the triads took the
 * sevenths' inversions with it.
 *
 * The other half of this file is the rule that must survive the change
 * untouched: a PREFERENCE NEVER REACHES A DENOMINATOR. That is what the
 * 114 → 51 fix established, and a per-tier setting gives it more ways
 * to leak than a shared one had.
 * =====================================================================
 *
 * NOT A LAYOUT TEST. Whether a tier chip and its inversion chips read
 * as one control on a real screen is Silas's eye.
 */
import { describe, expect, it } from 'vitest';
import { CHORD_SEEDS } from '../seed';
import type { ChordData } from '../../../../lib/db';
import { inversionChoicesForTier, servedRefsFor } from '../facets';
import {
  DEFAULT_INVERSION_SETTINGS,
  INVERSION_TRAINED_TIERS,
  positionsForTier,
  reachableChordRefs,
  sanitizeInversionSettings,
  sanitizePositions,
  type InversionSettings,
} from '../inversionUtils';

const chords = CHORD_SEEDS.map(s => ({ ...s, correct: 0, total: 0 })) as ChordData[];
const served = (settings: InversionSettings) =>
  chords.reduce((n, c) => n + servedRefsFor(c, settings).length, 0);

/** Root-only triads, sevenths through everything. */
const SPLIT: InversionSettings = { foundational: [0], seventh: [0, 1, 2, 3] };

describe('the two tiers can differ', () => {
  it('serves one ref for a triad and four for a seventh under a split setting', () => {
    const triad = chords.find(c =>
      c.tier === 'foundational' && c.intervals.length === 3
      && !['sus2', 'sus4', 'aug'].includes(c.id))!;
    const seventh = chords.find(c => c.tier === 'seventh' && c.id !== 'dim7')!;
    expect(servedRefsFor(triad, SPLIT)).toEqual([`${triad.id}:0`]);
    expect(servedRefsFor(seventh, SPLIT)).toHaveLength(4);
  });

  it('changes the pool when only ONE tier moves', () => {
    // The whole point: a setting that moved both tiers together would
    // give the same number here as changing them both.
    const both = served({ foundational: [0], seventh: [0] });
    const onlyTriads = served(SPLIT);
    expect(onlyTriads).toBeGreaterThan(both);
    expect(onlyTriads).toBeLessThan(served(DEFAULT_INVERSION_SETTINGS));
  });

  it('leaves an untrained tier at root, whatever it is set to', () => {
    // Dominants and extensions have no inversion training at all, so a
    // stored value for one cannot start serving rotations the ladder
    // never asks about.
    const meddled: InversionSettings = { dominant: [0, 1, 2, 3], extensions: [0, 1, 2, 3] };
    for (const chord of chords.filter(c => !INVERSION_TRAINED_TIERS.has(c.tier))) {
      expect(servedRefsFor(chord, meddled), chord.id).toEqual([`${chord.id}:0`]);
    }
  });

  it('keeps an excluded chord at root even when its tier is wide open', () => {
    // dim7 is a seventh whose four inversions are the same four pitch
    // classes. The tier setting does not override that.
    const dim7 = chords.find(c => c.id === 'dim7')!;
    expect(servedRefsFor(dim7, DEFAULT_INVERSION_SETTINGS)).toEqual(['dim7:0']);
  });
});

describe('the coverage denominator does not move', () => {
  const denominator = () => reachableChordRefs(CHORD_SEEDS).length;

  it('holds across every setting, split ones included', () => {
    // THE 114 → 51 RULE. The strip count is what you are about to
    // drill and moves; the denominator is what can ever be asked and
    // does not.
    const before = denominator();
    for (const settings of [
      DEFAULT_INVERSION_SETTINGS,
      SPLIT,
      { foundational: [0], seventh: [0] } as InversionSettings,
      { foundational: [0, 1, 2], seventh: [0, 3] } as InversionSettings,
    ]) {
      expect(served(settings), 'the strip count').toBeGreaterThan(0);
      expect(denominator(), 'the denominator').toBe(before);
    }
  });

  it('is not equal to any of those strip counts, because it answers another question', () => {
    const total = denominator();
    expect(served({ foundational: [0], seventh: [0] })).not.toBe(total);
    expect(total).toBeGreaterThan(0);
  });
});

describe('which chips a tier offers', () => {
  it('gives triads three and sevenths four, derived from their chords', () => {
    expect(inversionChoicesForTier(chords, 'foundational')).toEqual([0, 1, 2]);
    expect(inversionChoicesForTier(chords, 'seventh')).toEqual([0, 1, 2, 3]);
  });

  it('offers none for a tier with no inversion training', () => {
    // No chips rather than a row of dead ones.
    expect(inversionChoicesForTier(chords, 'dominant')).toEqual([]);
    expect(inversionChoicesForTier(chords, 'extensions')).toEqual([]);
  });

  it('reads the widest REACHABLE chord, not the widest chord', () => {
    // A tier holding only dim7 — four notes, excluded from inversion
    // training — must offer nothing, not four chips for positions no
    // chord in it can be asked in.
    const onlyExcluded = chords.filter(c => c.id === 'dim7')
      .map(c => ({ ...c, tier: 'seventh' as const }));
    expect(inversionChoicesForTier(onlyExcluded, 'seventh')).toEqual([]);
  });
});

describe('reading a stored value back', () => {
  it('accepts the old shared array and applies it to both tiers', () => {
    // The migration. A reader upgrading has one list stored, and this
    // is exactly what the app was doing with it a moment before.
    const migrated = sanitizeInversionSettings([0, 1]);
    expect(positionsForTier(migrated, 'foundational')).toEqual([0, 1]);
    expect(positionsForTier(migrated, 'seventh')).toEqual([0, 1]);
  });

  it('accepts the per-tier object and keeps the tiers apart', () => {
    const read = sanitizeInversionSettings({ foundational: [0], seventh: [0, 2] });
    expect(positionsForTier(read, 'foundational')).toEqual([0]);
    expect(positionsForTier(read, 'seventh')).toEqual([0, 2]);
  });

  it('falls back to the default for a tier the stored value omits', () => {
    const read = sanitizeInversionSettings({ foundational: [0] });
    expect(positionsForTier(read, 'seventh')).toEqual(DEFAULT_INVERSION_SETTINGS.seventh);
  });

  it('drops junk and clamps an empty tier to root', () => {
    // These cross a sync boundary; a tier set to nothing would serve
    // nothing at all.
    expect(sanitizePositions([9, -1, 'x', 1, 1])).toEqual([1]);
    expect(sanitizePositions([])).toEqual([0]);
    expect(positionsForTier(sanitizeInversionSettings({ seventh: [] }), 'seventh'))
      .toEqual([0]);
  });

  it('falls back whole when the stored value is nonsense', () => {
    expect(sanitizeInversionSettings(null)).toEqual(DEFAULT_INVERSION_SETTINGS);
    expect(sanitizeInversionSettings(42)).toEqual(DEFAULT_INVERSION_SETTINGS);
  });

  it('answers root-only for a tier that is not inversion-trained', () => {
    expect(positionsForTier(DEFAULT_INVERSION_SETTINGS, 'extensions')).toEqual([0]);
  });
});
