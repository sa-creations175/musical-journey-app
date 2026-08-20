import { describe, expect, it } from 'vitest';
import { qualityIdFromSuffix } from '../voicingQualityMap';
import {
  QUALITY_INTERVALS,
  VOICING_QUALITY_SUFFIX,
  VOICING_TRIAD_IDS,
  VOICING_SEVENTH_IDS,
  VOICING_EXTENSION_IDS,
  VOICING_SPECIAL_IDS,
} from '../catalog';

/**
 * These pin the voicing vocabulary to QUALITY_INTERVALS and NOT to
 * CHORD_QUALITIES. The drill catalog is deliberately smaller (triads +
 * sevenths only, 20 Aug 2026); a chart must still be able to spell an
 * extension and get real voicings back. If someone re-points this file
 * at CHORD_QUALITIES, these fail.
 */
describe('voicing vocabulary — independent of the drill catalog', () => {
  it('covers every quality the voicing engine can spell', () => {
    expect(Object.keys(VOICING_QUALITY_SUFFIX).sort())
      .toEqual(Object.keys(QUALITY_INTERVALS).sort());
  });

  it('groups partition the vocabulary with no overlap or omission', () => {
    const grouped = [
      ...VOICING_TRIAD_IDS,
      ...VOICING_SEVENTH_IDS,
      ...VOICING_EXTENSION_IDS,
      ...VOICING_SPECIAL_IDS,
    ];
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(grouped.sort()).toEqual(Object.keys(QUALITY_INTERVALS).sort());
  });

  it('keeps extensions and sixths spellable after the drill-catalog cut', () => {
    // The exact suffixes a player types on a chart for the qualities
    // that are NOT in the drill catalog.
    expect(qualityIdFromSuffix('6/9')).toEqual({ id: 'maj6_9', exact: true });
    expect(qualityIdFromSuffix('maj9')).toEqual({ id: 'maj9', exact: true });
    expect(qualityIdFromSuffix('13')).toEqual({ id: 'dom13', exact: true });
    expect(qualityIdFromSuffix('add9')).toEqual({ id: 'add9', exact: true });
    expect(qualityIdFromSuffix('m6')).toEqual({ id: 'min6', exact: true });
    expect(qualityIdFromSuffix('maj7#11')).toEqual({ id: 'maj7s11', exact: true });
  });
});

describe('qualityIdFromSuffix', () => {
  it('maps every canonical voicing suffix to its own id (exact)', () => {
    for (const [id, suffix] of Object.entries(VOICING_QUALITY_SUFFIX)) {
      expect(qualityIdFromSuffix(suffix)).toEqual({ id, exact: true });
    }
  });

  it('maps the empty suffix to the major triad', () => {
    expect(qualityIdFromSuffix('')).toEqual({ id: 'maj', exact: true });
    expect(qualityIdFromSuffix(undefined)).toEqual({ id: 'maj', exact: true });
    expect(qualityIdFromSuffix('  ')).toEqual({ id: 'maj', exact: true });
  });

  it('distinguishes minor / major / dominant sevenths by case + form', () => {
    expect(qualityIdFromSuffix('m7')).toEqual({ id: 'min7', exact: true });
    expect(qualityIdFromSuffix('M7')).toEqual({ id: 'maj7', exact: true });
    expect(qualityIdFromSuffix('7')).toEqual({ id: 'dom7', exact: true });
    expect(qualityIdFromSuffix('maj7')).toEqual({ id: 'maj7', exact: true });
  });

  it('folds common alternate spellings (exact)', () => {
    const cases: Record<string, string> = {
      dim: 'dim',
      dim7: 'dim7',
      aug: 'aug',
      M: 'maj',
      maj: 'maj',
      min: 'min',
      '-': 'min',
      '-7': 'min7',
      min9: 'min9',
      'ø': 'm7b5',
      'ø7': 'm7b5',
      min7b5: 'm7b5',
      mmaj7: 'mmaj7',
      minmaj7: 'mmaj7',
      sus: 'sus4',
      '69': 'maj6_9',
      'Δ': 'maj7',
    };
    for (const [suffix, id] of Object.entries(cases)) {
      expect(qualityIdFromSuffix(suffix)).toEqual({ id, exact: true });
    }
  });

  it('falls back to a sensible base for unknown input (never exact)', () => {
    const cases: Record<string, string> = {
      xyz: 'maj',          // unrecognized → major triad
      'weird-junk': 'maj', // non-leading '-' is not a minor marker
      '-shrug': 'min',     // leading '-' → minor base
      'm???': 'min',       // leading m, not maj → minor base
      '13#11alt': 'dom7',  // ext token, no maj marker → dominant
      'dimwhatever': 'dim',
      'augfoo': 'aug',
    };
    for (const [suffix, id] of Object.entries(cases)) {
      const r = qualityIdFromSuffix(suffix);
      expect(r.id).toBe(id);
      expect(r.exact).toBe(false);
    }
  });

  it('always returns an id present in QUALITY_INTERVALS and never throws', () => {
    const inputs = [
      '', 'm', 'M', 'maj7', 'm7', '7', 'm7b5', '°', '°7', '+', 'sus2', 'sus4',
      'add9', '6/9', 'xyz', '???', '🎹', 'm(maj7)', '7b9', '7#9', '7b13',
      'maj7#11', '13', '11', '9', undefined,
    ];
    for (const input of inputs) {
      const r = qualityIdFromSuffix(input as string | undefined);
      expect(r.id in QUALITY_INTERVALS).toBe(true);
    }
  });
});
