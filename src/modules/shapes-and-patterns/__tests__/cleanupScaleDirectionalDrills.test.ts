// @vitest-environment jsdom
/**
 * Polish-sprint test — locks in the one-time migration that
 * collapses legacy ascending/descending scale drills into a
 * single "Scale drill" row, mirroring the seed change.
 *
 * Behavior:
 *   · "Scale ascending" + "Scale descending" rows are deleted
 *     along with any logged drillSessions referencing them.
 *   · "Both directions (continuous)" rows are renamed in place
 *     to "Scale drill".
 *   · Idempotent — second run is a no-op.
 *   · Non-scale skills (chord-shape, voice-leading, mental-viz)
 *     are untouched.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type DrillSession, type DrillSkill, type DrillType } from '../../../lib/db';
import { cleanupScaleDirectionalDrillsIfNeeded } from '../cleanup';

const NOW = 1_700_000_000_000;

function scaleSkill(partial: Partial<DrillSkill> = {}): DrillSkill {
  return {
    id: 'skill-c-major',
    kind: 'scale',
    keyName: 'C',
    scale: 'major',
    label: 'C Major',
    createdAt: NOW,
    ...partial,
  };
}

function drillType(partial: Partial<DrillType>): DrillType {
  return {
    id: 'dtype-x',
    skillId: 'skill-c-major',
    name: 'Scale drill',
    suggestedSeconds: 120,
    order: 0,
    repCount: 0,
    totalSeconds: 0,
    lastPracticedAt: null,
    ...partial,
  };
}

function session(partial: Partial<DrillSession>): DrillSession {
  return {
    id: 'sess-x',
    drillTypeId: 'dtype-x',
    skillId: 'skill-c-major',
    durationSeconds: 90,
    feelRating: 3,
    timestamp: NOW,
    ...partial,
  };
}

describe('cleanupScaleDirectionalDrillsIfNeeded', () => {
  beforeEach(async () => {
    await db.drillSessions.clear();
    await db.drillTypes.clear();
    await db.drillSkills.clear();
  });

  it('cascade-deletes ascending + descending rows and renames "Both directions" → "Scale drill"', async () => {
    await db.drillSkills.add(scaleSkill());
    await db.drillTypes.bulkAdd([
      drillType({ id: 'dt-asc', name: 'Scale ascending', order: 0 }),
      drillType({ id: 'dt-desc', name: 'Scale descending', order: 1 }),
      drillType({ id: 'dt-both', name: 'Both directions (continuous)', order: 2, repCount: 4, totalSeconds: 480 }),
    ]);
    await db.drillSessions.bulkAdd([
      session({ id: 'sess-asc-1', drillTypeId: 'dt-asc' }),
      session({ id: 'sess-both-1', drillTypeId: 'dt-both' }),
    ]);

    await cleanupScaleDirectionalDrillsIfNeeded();

    const types = await db.drillTypes.where('skillId').equals('skill-c-major').toArray();
    expect(types.map(t => t.name).sort()).toEqual(['Scale drill']);
    // The renamed row preserves its repCount + totalSeconds.
    expect(types[0].id).toBe('dt-both');
    expect(types[0].repCount).toBe(4);
    expect(types[0].totalSeconds).toBe(480);

    const remainingSessions = await db.drillSessions.toArray();
    expect(remainingSessions.map(s => s.id).sort()).toEqual(['sess-both-1']);
  });

  it('is idempotent — second run is a no-op', async () => {
    await db.drillSkills.add(scaleSkill());
    await db.drillTypes.bulkAdd([
      drillType({ id: 'dt-asc', name: 'Scale ascending', order: 0 }),
      drillType({ id: 'dt-both', name: 'Both directions (continuous)', order: 1 }),
    ]);

    await cleanupScaleDirectionalDrillsIfNeeded();
    const afterFirst = await db.drillTypes.toArray();

    await cleanupScaleDirectionalDrillsIfNeeded();
    const afterSecond = await db.drillTypes.toArray();

    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond.length).toBe(1);
    expect(afterSecond[0].name).toBe('Scale drill');
  });

  it('no-ops when no scale skills exist', async () => {
    // Only a chord-shape skill present; cleanup should not touch it.
    const chord: DrillSkill = {
      id: 'skill-chord-c-maj',
      kind: 'chord-shape',
      keyName: 'C',
      quality: 'maj',
      label: 'C (major)',
      createdAt: NOW,
    };
    await db.drillSkills.add(chord);
    await db.drillTypes.add(
      drillType({ id: 'dt-chord-root', skillId: chord.id, name: 'Root position', order: 0 }),
    );

    await cleanupScaleDirectionalDrillsIfNeeded();

    const types = await db.drillTypes.toArray();
    expect(types.length).toBe(1);
    expect(types[0].name).toBe('Root position');
  });

  it('only touches scale-kind skills — non-scale rows named "Scale ascending" are untouched (defensive)', async () => {
    // Theoretical edge: a non-scale skill with a row whose name happens
    // to match the legacy directional names. Cleanup is keyed on
    // skill.kind === 'scale', so this row should survive.
    const voiceLeading: DrillSkill = {
      id: 'skill-vl',
      kind: 'voice-leading',
      keyName: 'C',
      patternId: 'aba-251',
      label: 'ABA 251 voice-leading in C',
      createdAt: NOW,
    };
    await db.drillSkills.add(voiceLeading);
    await db.drillTypes.add(
      drillType({
        id: 'dt-vl-weird',
        skillId: voiceLeading.id,
        name: 'Scale ascending', // unlikely but defensively scoped
        order: 0,
      }),
    );

    await cleanupScaleDirectionalDrillsIfNeeded();

    const survived = await db.drillTypes.get('dt-vl-weird');
    expect(survived?.name).toBe('Scale ascending');
  });
});
