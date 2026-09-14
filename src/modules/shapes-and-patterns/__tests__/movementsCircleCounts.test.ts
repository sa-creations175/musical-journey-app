/**
 * The Circle of 4ths cell counts on Chord Movements & Passes (Silas,
 * 13 Sep 2026): 69 sub-cells × the twelve keys and the Circle, in the
 * catalog's own count, the section total and the dashboard's list —
 * which names the row and never spells the stored word.
 */
import { describe, expect, it } from 'vitest';
import { voiceLeadingTotalCellCount } from '../catalog';
import { sectionTargetCount } from '../cellTargets';
import { shapesCatalog } from '../../dashboard/read/catalogs';

describe('the Circle of 4ths cell counts on Chord Movements & Passes', () => {
  it('the catalog\'s count and the section\'s total agree: 69 × 13 = 897', () => {
    expect(voiceLeadingTotalCellCount()).toBe(897);
    expect(sectionTargetCount('voice-leading')).toBe(voiceLeadingTotalCellCount());
  });

  it('the dashboard lists a Circle row for every sub-cell, and names it', () => {
    const rows = shapesCatalog.items.filter(
      item => item.itemRefs.some(ref => ref.startsWith('vl:') && ref.endsWith(':circle')),
    );
    expect(rows).toHaveLength(69);
    for (const row of rows) {
      expect(row.label, row.itemRefs[0]).toContain('Circle of 4ths');
      expect(row.label, row.itemRefs[0]).not.toMatch(/circle$/);
    }
  });
});
