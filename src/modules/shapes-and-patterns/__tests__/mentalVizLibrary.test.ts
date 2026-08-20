import { describe, it, expect } from 'vitest';
import { MENTAL_VIZ_ITEMS, MENTAL_VIZ_ITEM_BY_REF } from '../mentalVizLibrary';

describe('mental-viz chord library', () => {
  it('enumerates 504 items (216 triads + 288 sevenths)', () => {
    expect(MENTAL_VIZ_ITEMS).toHaveLength(504);
    expect(MENTAL_VIZ_ITEMS.filter(i => i.itemRef.startsWith('mv:triad:'))).toHaveLength(216);
    expect(MENTAL_VIZ_ITEMS.filter(i => i.itemRef.startsWith('mv:seventh:'))).toHaveLength(288);
  });

  it('carries no extended-dominant items after the 20 Aug 2026 cut', () => {
    // The 96 extended dominant voicings are gone from the DRILL
    // library. EXTENDED_DOM_VOICINGS itself stays in mentalVizVoicing
    // — the lead-sheet carousel still seeds from it — so this pins the
    // enumeration, not the data.
    const ext = MENTAL_VIZ_ITEMS.filter(i =>
      /^mv:(dom9_13|dom7#9#5|dom7b9):/.test(i.itemRef),
    );
    expect(ext).toHaveLength(0);
  });

  it('itemRefs are unique', () => {
    const refs = new Set(MENTAL_VIZ_ITEMS.map(i => i.itemRef));
    expect(refs.size).toBe(MENTAL_VIZ_ITEMS.length);
  });

  it('builds prompts in "[Key] [Quality] — [Inversion/Position]" form', () => {
    expect(MENTAL_VIZ_ITEM_BY_REF.get('mv:triad:maj:root:C')?.prompt).toBe('C Major — Root Position');
    expect(MENTAL_VIZ_ITEM_BY_REF.get('mv:triad:min:inv1:Eb')?.prompt).toBe('Eb Minor — 1st Inversion');
    expect(MENTAL_VIZ_ITEM_BY_REF.get('mv:seventh:maj7:root:C')?.prompt).toBe('C Major 7 — Root Position');
    expect(MENTAL_VIZ_ITEM_BY_REF.get('mv:seventh:min7:inv3:Bb')?.prompt).toBe('Bb Minor 7 — 3rd Inversion');
  });

  it('no item carries an altName — the only producer was cut', () => {
    // The field stays on MentalVizItem: MentalVizChordDrill renders it,
    // and the planned "show notes, ask which chord" redesign wants it
    // back (C-E-G-A is C6 and arguably a rootless Am7).
    expect(MENTAL_VIZ_ITEMS.every(i => i.altName === undefined)).toBe(true);
  });

  it('every item has a 0–11 root pc and a non-empty voicing', () => {
    for (const i of MENTAL_VIZ_ITEMS) {
      expect(i.rootPc).toBeGreaterThanOrEqual(0);
      expect(i.rootPc).toBeLessThanOrEqual(11);
      expect(i.voicing.length).toBeGreaterThan(0);
    }
  });
});
