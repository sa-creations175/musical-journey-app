/**
 * The Circle of 4ths cell, underneath: its targets, its name, its count.
 *
 * Silas's decision of 14 Sep 2026: a thirteenth cell in every quality
 * column, with a key cell's targets on its own itemRefs, nothing written
 * to the twelve key cells, and its targets in the progress totals.
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { DrillSkill, DrillType } from '../../../lib/db';
import { CIRCLE_KEY, KEYS } from '../catalog';
import {
  chordCellTargets, sectionTargets, targetKey, targetsAcrossKeys,
} from '../cellTargets';
import { labelFor, parseShapesItemRef } from '../drillModel';
import { chordShapeSurface } from '../practiceTest/makeSurfaces';

describe('the Circle of 4ths cell', () => {
  it("has a key cell's targets, on its own itemRefs", () => {
    const circle = chordCellTargets('min7', CIRCLE_KEY);
    expect(circle).toHaveLength(chordCellTargets('min7', 'C').length);
    expect(circle.every(t => t.itemRef.startsWith('chord-shape:min7:circle:'))).toBe(true);
    expect(parseShapesItemRef('chord-shape:min7:circle:inv1')).toMatchObject({
      kind: 'chord-shape', keyName: CIRCLE_KEY, quality: 'min7', inversionState: 'inv1',
    });
  });

  it('is in the chord-shape total: 1944 key targets and 162 circle targets', () => {
    const all = sectionTargets('chord-shapes');
    expect(all).toHaveLength(2106);
    // Six triads × 4 states × 3 hands, six sevenths × 5 × 3.
    expect(all.filter(t => t.itemRef.includes(':circle:'))).toHaveLength(72 + 90);
  });

  it('is in its row for Apply to every key', () => {
    const across = targetsAcrossKeys(targetKey('chord-shape:maj:C:inv2', 'left'));
    expect(across).toHaveLength(KEYS.length + 1);
    expect(across).toContain(targetKey('chord-shape:maj:circle:inv2', 'left'));
  });

  it('names itself where a key would be', () => {
    const label = labelFor({
      kind: 'chord-shape', keyName: CIRCLE_KEY, quality: 'min7', inversionState: 'root',
    });
    expect(label.startsWith('Circle of 4ths (')).toBe(true);
    expect(label).not.toContain('circle');
  });

  it('shows the twelve during a drill, and a key cell does not', () => {
    const make = (keyName: string) => chordShapeSurface({
      cellLabel: '',
      skillLabel: 'Root position · Left hand',
      skill: {
        id: 's', kind: 'chord-shape', keyName, quality: 'maj',
        inversionState: 'root', label: '', createdAt: 0,
      } as DrillSkill,
      drillType: {
        id: 'd', skillId: 's', name: 'Drill', suggestedSeconds: 60, order: 0,
        repCount: 0, totalSeconds: 0, lastPracticedAt: null,
      } as DrillType,
      hand: 'left',
    });
    expect(make(CIRCLE_KEY).renderDuringDrill).toBeTypeOf('function');
    expect(make('C').renderDuringDrill ?? null).toBeNull();
  });
});
