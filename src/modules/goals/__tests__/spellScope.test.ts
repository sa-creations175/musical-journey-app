/**
 * Spell the chord in a key joins goal scope from September on — the
 * Circle of 4ths rule (Silas, 14 Sep 2026). A goal whose window ends in
 * August never lists the family; a September goal does.
 */
import { describe, expect, it } from 'vitest';
import type { Goal } from '../../../lib/db';
import { COVERAGE_OVERALL_METRIC, COVERAGE_SPECIFIC_METRIC } from '../coverageMetrics';
import { SPELL_THE_CHORD_FROM, enumerateScopeForGoal } from '../scopeEnumeration';
import { FLASHCARDS } from '../../harmonic-fluency/catalog';

const monthly = (year: number, month: number, over: Partial<Goal>): Goal => ({
  id: `g-${year}-${month}`,
  scope: 'monthly',
  status: 'active',
  startDate: new Date(year, month, 1).getTime(),
  targetDate: new Date(year, month + 1, 1).getTime() - 1,
  ...over,
} as Goal);

const spell = (refs: string[]) => refs.filter(r => r.startsWith('cc-spell-'));

describe('the Spell the chord family in goal scope', () => {
  it('starts on 1 September 2026', () => {
    expect(SPELL_THE_CHORD_FROM).toBe(new Date(2026, 8, 1).getTime());
  });

  it('is in a September Chords goal and not in an August one', () => {
    const unit = { targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY, targetUnit: 'chord-knowledge' };
    const september = enumerateScopeForGoal(monthly(2026, 8, unit));
    const august = enumerateScopeForGoal(monthly(2026, 7, unit));
    expect(spell(september)).toHaveLength(91);
    expect(september).toHaveLength(235);
    expect(spell(august)).toHaveLength(0);
    expect(august).toHaveLength(144);
  });

  it('follows the same date on a whole-module goal', () => {
    const overall = { targetMetric: COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY };
    expect(enumerateScopeForGoal(monthly(2026, 8, overall))).toHaveLength(FLASHCARDS.length);
    expect(enumerateScopeForGoal(monthly(2026, 7, overall))).toHaveLength(FLASHCARDS.length - 91);
  });
});
