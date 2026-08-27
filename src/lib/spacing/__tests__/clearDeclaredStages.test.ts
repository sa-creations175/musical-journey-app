/**
 * Clearing the declared stages — and, more importantly, what it refuses
 * to clear.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { db, type DrillSession, type DrillSkill, type SpacingState } from '../../db';
import { getPref } from '../../userPrefs';
import {
  PREF_DECLARED_STAGES_CLEARED, clearDeclaredChordShapeStages, declaredNeverDrilled,
} from '../clearDeclaredStages';

const row = (over: Partial<SpacingState> = {}): SpacingState => ({
  id: crypto.randomUUID(),
  itemRef: 'chord-shape:maj:C:root',
  moduleRef: 'shapes-and-patterns',
  hand: 'both',
  style: 'solid',
  memoryType: 'procedural',
  acquisitionStage: 'acquired',
  currentIntervalDays: 0,
  lastEngagedAt: null,
  nextDueAt: null,
  performanceHistory: [],
  ...over,
});

const skill = (over: Partial<DrillSkill> = {}): DrillSkill => ({
  id: crypto.randomUUID(),
  kind: 'chord-shape',
  keyName: 'C',
  quality: 'maj',
  inversionState: 'root',
  ...over,
} as DrillSkill);

const session = (skillId: string): DrillSession => ({
  id: crypto.randomUUID(),
  skillId,
  drillTypeId: 'dt-1',
  timestamp: 1,
  durationSeconds: 60,
  feelRating: 3,
  hand: 'both',
  style: 'solid',
} as DrillSession);

describe('what qualifies', () => {
  it('clears a staged row with no history and no drill', () => {
    expect(declaredNeverDrilled([row()], [], [])).toHaveLength(1);
  });

  it('keeps a row that has any performance history', () => {
    const r = row({ performanceHistory: [{ t: 1, kind: 'rating', rating: 'flying' }] });
    expect(declaredNeverDrilled([r], [], [])).toHaveLength(0);
  });

  it('keeps a row whose exact square has been drilled', () => {
    const sk = skill();
    expect(declaredNeverDrilled([row()], [sk], [session(sk.id)])).toHaveLength(0);
  });

  it('does NOT let a sibling inversion protect an undrilled one', () => {
    // The join is quality + key + inversionState. A drilled root
    // position must not save a declared 2nd inversion — that would
    // keep exactly the rows this exists to remove.
    const drilled = skill({ inversionState: 'root' });
    const declared = row({ itemRef: 'chord-shape:maj:C:inv2' });
    expect(declaredNeverDrilled([declared], [drilled], [session(drilled.id)]))
      .toHaveLength(1);
  });

  it('leaves an unstaged row alone', () => {
    expect(declaredNeverDrilled([row({ acquisitionStage: 'new' })], [], []))
      .toHaveLength(0);
  });

  it('leaves scales alone entirely', () => {
    // The prompt only ever ran on chord cells, so a staged scale row is
    // backfill from real history and not in scope.
    const scale = row({ itemRef: 'scale:major:C' });
    expect(declaredNeverDrilled([scale], [], [])).toHaveLength(0);
  });

  it('leaves other modules alone', () => {
    const hf = row({ moduleRef: 'harmonic-fluency', itemRef: 'chord-shape:maj:C:root' });
    expect(declaredNeverDrilled([hf], [], [])).toHaveLength(0);
  });
});

describe('running it', () => {
  beforeEach(async () => {
    await db.spacingState.clear();
    await db.drillSkills.clear();
    await db.drillSessions.clear();
    await db.userPrefs.clear();
  });

  it('deletes the row rather than resetting it to new', async () => {
    // Absence IS the canonical new state. A row saying "new" would be
    // a record that something happened here, and nothing did.
    await db.spacingState.add(row());
    const r = await clearDeclaredChordShapeStages();
    expect(r.cleared).toBe(1);
    expect(await db.spacingState.count()).toBe(0);
  });

  it('reports what it kept', async () => {
    const sk = skill();
    await db.drillSkills.add(sk);
    await db.drillSessions.add(session(sk.id));
    await db.spacingState.bulkAdd([
      row(),                                            // drilled → kept
      row({ itemRef: 'chord-shape:maj:C:inv2' }),       // declared → cleared
    ]);
    const r = await clearDeclaredChordShapeStages();
    expect(r.cleared).toBe(1);
    expect(r.keptWithEvidence).toBe(1);
    expect(await db.spacingState.count()).toBe(1);
  });

  it('runs once', async () => {
    await db.spacingState.add(row());
    await clearDeclaredChordShapeStages();
    await db.spacingState.add(row({ itemRef: 'chord-shape:maj:D:root' }));
    const second = await clearDeclaredChordShapeStages();
    expect(second.skipped).toBe(true);
    expect(await db.spacingState.count()).toBe(1);
  });

  it('sets its pref even when there was nothing to clear', async () => {
    const r = await clearDeclaredChordShapeStages();
    expect(r.cleared).toBe(0);
    expect(await getPref(PREF_DECLARED_STAGES_CLEARED, false)).toBe(true);
  });
});
