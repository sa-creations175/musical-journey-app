import { describe, it, expect } from 'vitest';
import { MENTAL_VIZ_ITEMS, MENTAL_VIZ_ITEM_BY_REF } from '../mentalVizLibrary';

describe('mental-viz chord library', () => {
  it('enumerates 600 items (216 triads + 288 sevenths + 96 extended)', () => {
    expect(MENTAL_VIZ_ITEMS).toHaveLength(600);
    expect(MENTAL_VIZ_ITEMS.filter(i => i.itemRef.startsWith('mv:triad:'))).toHaveLength(216);
    expect(MENTAL_VIZ_ITEMS.filter(i => i.itemRef.startsWith('mv:seventh:'))).toHaveLength(288);
    const ext = MENTAL_VIZ_ITEMS.filter(i =>
      /^mv:(dom9_13|dom7#9#5|dom7b9):/.test(i.itemRef),
    );
    expect(ext).toHaveLength(96);
  });

  it('itemRefs are unique', () => {
    const refs = new Set(MENTAL_VIZ_ITEMS.map(i => i.itemRef));
    expect(refs.size).toBe(MENTAL_VIZ_ITEMS.length);
  });

  it('builds prompts in "[Key] [Quality] — [Inversion/Position]" form', () => {
    expect(MENTAL_VIZ_ITEM_BY_REF.get('mv:triad:maj:root:C')?.prompt).toBe('C Major — Root Position');
    expect(MENTAL_VIZ_ITEM_BY_REF.get('mv:triad:min:inv1:Eb')?.prompt).toBe('Eb Minor — 1st Inversion');
    expect(MENTAL_VIZ_ITEM_BY_REF.get('mv:seventh:maj7:root:C')?.prompt).toBe('C Major 7 — Root Position');
    expect(MENTAL_VIZ_ITEM_BY_REF.get('mv:dom9_13:A:G')?.prompt).toBe('G dom9(13) — A Position');
    expect(MENTAL_VIZ_ITEM_BY_REF.get('mv:dom7b9:from3:Bb')?.prompt).toBe('Bb dom7b9 — from 3rd');
  });

  it('dom7#9#5 carries the alternate name; shapes do not', () => {
    expect(MENTAL_VIZ_ITEM_BY_REF.get('mv:dom7#9#5:A:G')?.altName).toBe('dom7#9b13');
    expect(MENTAL_VIZ_ITEM_BY_REF.get('mv:triad:maj:root:C')?.altName).toBeUndefined();
  });

  it('every item has a 0–11 root pc and a non-empty voicing', () => {
    for (const i of MENTAL_VIZ_ITEMS) {
      expect(i.rootPc).toBeGreaterThanOrEqual(0);
      expect(i.rootPc).toBeLessThanOrEqual(11);
      expect(i.voicing.length).toBeGreaterThan(0);
    }
  });
});
