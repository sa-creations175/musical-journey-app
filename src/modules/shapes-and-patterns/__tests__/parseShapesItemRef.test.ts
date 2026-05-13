// @vitest-environment jsdom
/**
 * Pins the inverse relationship between `itemRefForSkill` (which
 * encodes spacingState keys for S&P drills) and `parseShapesItemRef`
 * (which decodes them back into descriptors). The session-proposal
 * "describe activity" path relies on the round-trip producing a
 * descriptor that `labelFor` can render — if the encoding shifts
 * without the decoder following, the proposal screen falls back to
 * the generic "drills · N items" label.
 *
 * Format reference (from itemRefForSkill in drillModel.ts):
 *   chord-shape (with inversion) → `chord-shape:{quality}:{keyName}:{inversionState}`
 *   chord-shape (no inversion)   → `chord-shape:{quality}:{keyName}`
 *   scale                        → `scale:{scale}:{keyName}`
 *   voice-leading                → `vl:{patternId}:{keyName}`
 *   mental-viz                   → null (no spacingState row)
 */
import { describe, expect, it } from 'vitest';
import {
  labelForShapesItemRef,
  parseShapesItemRef,
} from '../drillModel';

describe('parseShapesItemRef', () => {
  describe('chord-shape', () => {
    it('parses a triad with inversion state', () => {
      expect(parseShapesItemRef('chord-shape:maj:C:inv1')).toEqual({
        kind: 'chord-shape',
        keyName: 'C',
        quality: 'maj',
        inversionState: 'inv1',
      });
    });

    it('parses a seventh with inversion state', () => {
      expect(parseShapesItemRef('chord-shape:maj7:F#:fluid')).toEqual({
        kind: 'chord-shape',
        keyName: 'F#',
        quality: 'maj7',
        inversionState: 'fluid',
      });
    });

    it('parses an extension / special quality with no inversion suffix', () => {
      // Extensions + special voicings don't track inversion state —
      // itemRefForSkill omits the suffix. Parser returns null
      // inversion (matches `inversionState ?? null` on the DrillSkill row).
      expect(parseShapesItemRef('chord-shape:add9:Eb')).toEqual({
        kind: 'chord-shape',
        keyName: 'Eb',
        quality: 'add9',
        inversionState: null,
      });
    });

    it('parses the supplementary suffix (sevenths) explicitly', () => {
      expect(parseShapesItemRef('chord-shape:m7:G:supplementary')).toEqual({
        kind: 'chord-shape',
        keyName: 'G',
        quality: 'm7',
        inversionState: 'supplementary',
      });
    });
  });

  describe('scale + voice-leading', () => {
    it('parses a scale itemRef', () => {
      expect(parseShapesItemRef('scale:major:C')).toEqual({
        kind: 'scale',
        keyName: 'C',
        scale: 'major',
      });
    });

    it('parses a voice-leading itemRef (patternId may contain a hyphen)', () => {
      expect(parseShapesItemRef('vl:aba-251:Bb')).toEqual({
        kind: 'voice-leading',
        keyName: 'Bb',
        patternId: 'aba-251',
      });
    });
  });

  describe('defensive cases', () => {
    it('returns null for unknown kinds', () => {
      expect(parseShapesItemRef('mental-viz:shape-viz')).toBeNull();
      expect(parseShapesItemRef('bogus:foo:bar')).toBeNull();
    });

    it('returns null when the string is too short', () => {
      expect(parseShapesItemRef('scale:C')).toBeNull();
      expect(parseShapesItemRef('')).toBeNull();
    });

    it('coerces unrecognised inversionState tokens to null', () => {
      // Defensive: a legacy / hand-edited row might have an out-of-
      // vocabulary inversion suffix. The parser shouldn't fail —
      // it should drop the unknown state and produce a valid
      // descriptor for the rest. labelFor will then render the
      // base chord without an inversion qualifier.
      expect(parseShapesItemRef('chord-shape:maj:C:not-a-real-state')).toEqual({
        kind: 'chord-shape',
        keyName: 'C',
        quality: 'maj',
        inversionState: null,
      });
    });
  });
});

describe('labelForShapesItemRef', () => {
  it('renders the chord-shape label with inversion', () => {
    // labelFor's shape: "{keyName}{suffix} ({longName})[ — {state}]".
    // The exact suffix / long-name come from CHORD_QUALITY_BY_ID;
    // the test asserts the structural pieces are present rather
    // than pinning a literal string that could shift on catalog
    // edits.
    const label = labelForShapesItemRef('chord-shape:maj:C:inv1');
    expect(label).toMatch(/^C/);
    expect(label).toMatch(/major/i);
    expect(label).toMatch(/inv/i);
  });

  it('renders the scale label', () => {
    const label = labelForShapesItemRef('scale:major:C');
    expect(label).toMatch(/C/);
    expect(label).toMatch(/Major/i);
  });

  it('renders the voice-leading label', () => {
    const label = labelForShapesItemRef('vl:aba-251:Bb');
    expect(label).toMatch(/Bb/);
  });

  it('returns null for an unparseable itemRef', () => {
    expect(labelForShapesItemRef('bogus')).toBeNull();
    expect(labelForShapesItemRef('mental-viz:shape-viz')).toBeNull();
  });
});
