// @vitest-environment jsdom
/**
 * findOrCreateSkill — self-heal contract.
 *
 * Pre-existing bug surfaced May 1, 2026: C major scale and C ABA-251
 * voice-leading cells had drillSkills rows without any drillTypes
 * rows in some local databases (left over from an earlier app version
 * where skill creation and default-types materialisation weren't in a
 * shared transaction). DrillListModal renders the "start drill"
 * button inside drillTypes.map(), so an empty types list leaves the
 * user unable to begin practice on those cells.
 *
 * Fix: when findOrCreateSkill encounters an existing skill that has
 * zero drillTypes, it re-materialises the defaults. Tests below
 * cover both the regular happy path and the new self-heal path.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { findOrCreateSkill } from '../drillModel';

describe('findOrCreateSkill', () => {
  beforeEach(async () => {
    await db.drillTypes.clear();
    await db.drillSkills.clear();
  });

  it('creates a skill + default drill types on first call', async () => {
    const skill = await findOrCreateSkill({
      kind: 'scale',
      keyName: 'C',
      scale: 'major',
    });
    const types = await db.drillTypes.where('skillId').equals(skill.id).toArray();
    expect(types.length).toBe(1);
    expect(types[0].name).toBe('Scale drill');
  });

  it('returns the existing skill without duplicating types on second call', async () => {
    const first = await findOrCreateSkill({
      kind: 'scale',
      keyName: 'C',
      scale: 'major',
    });
    const second = await findOrCreateSkill({
      kind: 'scale',
      keyName: 'C',
      scale: 'major',
    });
    expect(second.id).toBe(first.id);
    const types = await db.drillTypes.where('skillId').equals(first.id).toArray();
    expect(types.length).toBe(1);
  });

  it('self-heals an existing skill with zero drillTypes (scale)', async () => {
    // Simulate the stranded-skill state: skill row exists, no types.
    const stranded = {
      id: 'skill-stranded-c-major',
      kind: 'scale' as const,
      keyName: 'C',
      scale: 'major',
      label: 'C Major',
      createdAt: Date.now(),
    };
    await db.drillSkills.add(stranded);
    expect(await db.drillTypes.where('skillId').equals(stranded.id).count()).toBe(0);

    const result = await findOrCreateSkill({
      kind: 'scale',
      keyName: 'C',
      scale: 'major',
    });

    expect(result.id).toBe(stranded.id);
    const types = await db.drillTypes.where('skillId').equals(stranded.id).toArray();
    expect(types.length).toBe(1);
    expect(types[0].name).toBe('Scale drill');
  });

  it('self-heals an existing skill with zero drillTypes (voice-leading C ABA-251)', async () => {
    const stranded = {
      id: 'skill-stranded-aba-251-c',
      kind: 'voice-leading' as const,
      keyName: 'C',
      patternId: 'aba-251',
      label: 'ABA 251 voice-leading in C',
      createdAt: Date.now(),
    };
    await db.drillSkills.add(stranded);

    const result = await findOrCreateSkill({
      kind: 'voice-leading',
      keyName: 'C',
      patternId: 'aba-251',
    });

    expect(result.id).toBe(stranded.id);
    const types = await db.drillTypes.where('skillId').equals(stranded.id).toArray();
    expect(types.length).toBe(3);
    expect(types.map(t => t.name).sort()).toEqual([
      'At target tempo',
      'Connecting voicings smoothly',
      'Slow and clean',
    ]);
  });

  it('does not re-materialise defaults when types already exist', async () => {
    const first = await findOrCreateSkill({
      kind: 'scale',
      keyName: 'C',
      scale: 'major',
    });
    // User renamed the default — should not be overwritten.
    const types = await db.drillTypes.where('skillId').equals(first.id).toArray();
    await db.drillTypes.update(types[0].id, { name: 'My custom variation' });

    await findOrCreateSkill({ kind: 'scale', keyName: 'C', scale: 'major' });

    const after = await db.drillTypes.where('skillId').equals(first.id).toArray();
    expect(after.length).toBe(1);
    expect(after.find(t => t.id === types[0].id)?.name).toBe('My custom variation');
  });
});
