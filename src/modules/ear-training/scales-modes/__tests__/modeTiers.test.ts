/**
 * Which modes are in which Tier, and the phrase that may not appear.
 *
 * =====================================================================
 * TIER 1 IS THE FOUR SCALES A PLAYER ALREADY LIVES IN.
 *
 * Silas's ruling of 10 Sep 2026. It was the seven modes of the major
 * scale, with harmonic and melodic minor held back — which put Locrian,
 * a mode almost nothing is written in, ahead of the natural minor, and
 * left two scales a reader plays every day behind a gate.
 *
 * The catalog ARRAY ORDER carries the ruling as well as the `stage`
 * field: within a tier it is the order the modes are introduced in, and
 * several surfaces walk the array. A test on `stage` alone would pass
 * on a shuffle.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { MODES, MODE_IDS } from '../catalog';
import { SCOPE_LABELS } from '../shared';

const idsAtStage = (stage: 1 | 2) =>
  MODES.filter(m => m.stage === stage).map(m => m.id);

describe('the two tiers', () => {
  it('opens on Ionian, Aeolian and the two minors', () => {
    expect(idsAtStage(1)).toEqual([
      'ionian', 'aeolian', 'harmonic-minor', 'melodic-minor',
    ]);
  });

  it('introduces the other five brightest and most used first', () => {
    // Dorian and Mixolydian are what a gospel or R&B player meets
    // first; Locrian is last because almost nothing is written in it.
    expect(idsAtStage(2)).toEqual([
      'dorian', 'mixolydian', 'lydian', 'phrygian', 'locrian',
    ]);
  });

  it('walks the catalog in tier order, so a surface reading it agrees', () => {
    expect(MODE_IDS).toEqual([...idsAtStage(1), ...idsAtStage(2)]);
  });

  it('moves no id and loses no mode', () => {
    // THE HALF THAT PROTECTS STORED HISTORY. The ids are itemRef
    // segments; a mode that changed tier keeps every rep logged
    // against it, because the id did not move with it.
    expect([...MODE_IDS].sort()).toEqual([
      'aeolian', 'dorian', 'harmonic-minor', 'ionian', 'locrian',
      'lydian', 'melodic-minor', 'mixolydian', 'phrygian',
    ]);
    expect(MODES).toHaveLength(9);
  });
});

describe('the phrase "church modes" appears nowhere a reader can see', () => {
  it('is absent from the scope labels', () => {
    // Ruled out on 10 Sep 2026. The scope ID is still `church` — it is
    // stored in userPrefs and a code identifier — and no label says it.
    for (const label of Object.values(SCOPE_LABELS)) {
      expect(label.toLowerCase(), label).not.toContain('church');
    }
  });

  it('is absent from every mode\'s own copy', () => {
    for (const mode of MODES) {
      const prose = [
        mode.name, mode.signatureAlteration, mode.quickDefinition,
        mode.starterDescription, ...mode.characteristicChords,
      ].join(' ').toLowerCase();
      expect(prose, mode.id).not.toContain('church');
    }
  });
});
