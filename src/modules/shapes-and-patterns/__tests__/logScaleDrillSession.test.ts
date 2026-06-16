// @vitest-environment jsdom
/**
 * Phase B Step 2 — Scales drill attempt counting.
 *
 * ScalesDrillModal historically only wrote spacingState, so scale
 * practice was invisible to getWeeklyAttempts (which tallies S&P
 * attempts from db.drillSessions). `logScaleDrillSession` closes
 * that gap: it writes a well-formed DrillSession row for each scale
 * drill, the same bucket chord shapes write to.
 *
 * These tests pin:
 *   1. the DrillSession row shape — itemRef stands in for skillId +
 *      drillTypeId, the 4-point feelRating is stored directly, and the
 *      optional fields (targetSeconds, notes) behave like logSession.
 *   2. that it stays out of db.drillTypes / db.spacingState — those
 *      are logSession's / the modal's job, not this helper's.
 *   3. that getWeeklyAttempts('shapes-and-patterns', …) now counts
 *      the rows it writes, windowed by timestamp.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../lib/db';
import { logScaleDrillSession } from '../drillModel';
import { getWeeklyAttempts } from '../../../lib/weeklyAttempts';

beforeEach(async () => {
  await db.drillSessions.clear();
  await db.drillTypes.clear();
  await db.spacingState.clear();
});

describe('logScaleDrillSession — DrillSession row shape', () => {
  it('writes a DrillSession row with the scale itemRef as skillId + drillTypeId', async () => {
    const before = Date.now();
    const session = await logScaleDrillSession({
      hand: 'both',
      itemRef: 'scale:major:C',
      durationSeconds: 47,
      feelRating: 3,
      targetSeconds: 30,
    });
    const after = Date.now();

    const rows = await db.drillSessions.toArray();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toEqual(session);
    expect(row.id).toBe(session.id);
    expect(row.id.startsWith('dses-')).toBe(true);
    expect(row.skillId).toBe('scale:major:C');
    expect(row.drillTypeId).toBe('scale:major:C');
    expect(row.durationSeconds).toBe(47);
    expect(row.targetSeconds).toBe(30);
    expect(row.feelRating).toBe(3);
    expect(row.timestamp).toBeGreaterThanOrEqual(before);
    expect(row.timestamp).toBeLessThanOrEqual(after);
  });

  it('stores the 4-point feelRating directly (1–4, including "working on it" = 2)', async () => {
    await logScaleDrillSession({ hand: 'both', itemRef: 'scale:major:C', durationSeconds: 30, feelRating: 4 });
    await logScaleDrillSession({ hand: 'both', itemRef: 'scale:major:D', durationSeconds: 30, feelRating: 3 });
    await logScaleDrillSession({ hand: 'both', itemRef: 'scale:major:G', durationSeconds: 30, feelRating: 2 });
    await logScaleDrillSession({ hand: 'both', itemRef: 'scale:natural-minor:E', durationSeconds: 90, feelRating: 1 });

    const byItem = new Map(
      (await db.drillSessions.toArray()).map(r => [r.skillId, r.feelRating]),
    );
    expect(byItem.get('scale:major:C')).toBe(4);
    expect(byItem.get('scale:major:D')).toBe(3);
    expect(byItem.get('scale:major:G')).toBe(2);
    expect(byItem.get('scale:natural-minor:E')).toBe(1);
  });

  it('preserves a pentatonic starting point in the itemRef-derived ids', async () => {
    await logScaleDrillSession({
      hand: 'both',
      itemRef: 'scale:major-pentatonic:5:Eb',
      durationSeconds: 30,
      feelRating: 4,
    });
    const row = (await db.drillSessions.toArray())[0];
    expect(row.skillId).toBe('scale:major-pentatonic:5:Eb');
    expect(row.drillTypeId).toBe('scale:major-pentatonic:5:Eb');
  });

  it('rounds durationSeconds + targetSeconds and trims notes', async () => {
    await logScaleDrillSession({
      hand: 'both',
      itemRef: 'scale:major:C',
      durationSeconds: 46.7,
      feelRating: 3,
      targetSeconds: 30.4,
      notes: '  felt smoother today  ',
    });
    const row = (await db.drillSessions.toArray())[0];
    expect(row.durationSeconds).toBe(47);
    expect(row.targetSeconds).toBe(30);
    expect(row.notes).toBe('felt smoother today');
  });

  it('omits targetSeconds when not supplied and notes when blank', async () => {
    await logScaleDrillSession({
      hand: 'both',
      itemRef: 'scale:major:C',
      durationSeconds: 30,
      feelRating: 4,
      notes: '   ',
    });
    const row = (await db.drillSessions.toArray())[0];
    expect('targetSeconds' in row).toBe(false);
    expect(row.notes).toBeUndefined();
  });

  it('does not touch db.drillTypes or db.spacingState', async () => {
    await logScaleDrillSession({
      hand: 'both',
      itemRef: 'scale:major:C',
      durationSeconds: 30,
      feelRating: 3,
    });
    expect(await db.drillTypes.count()).toBe(0);
    expect(await db.spacingState.count()).toBe(0);
  });
});

describe('logScaleDrillSession — counted by getWeeklyAttempts', () => {
  it('getWeeklyAttempts("shapes-and-patterns") counts scale drill rows in the window', async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    // Two scale drills logged "now".
    await logScaleDrillSession({ hand: 'both', itemRef: 'scale:major:C', durationSeconds: 30, feelRating: 3 });
    await logScaleDrillSession({ hand: 'both', itemRef: 'scale:natural-minor:A', durationSeconds: 90, feelRating: 1 });

    // A drill row well outside the window — must not be counted.
    await db.drillSessions.add({
      hand: 'both',
      style: 'solid',
      id: 'old-1',
      drillTypeId: 'scale:major:F',
      skillId: 'scale:major:F',
      durationSeconds: 30,
      feelRating: 3,
      timestamp: now - 30 * DAY,
    });

    const count = await getWeeklyAttempts(
      'shapes-and-patterns',
      now - DAY,
      now + DAY,
    );
    expect(count).toBe(2);
  });

  it('scale drill rows are counted alongside chord-shape rows in the same bucket', async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    // A chord-shape-style row (real skill uid) and a scale row — both
    // live in db.drillSessions and both count as S&P attempts.
    await db.drillSessions.add({
      hand: 'both',
      style: 'solid',
      id: 'cs-1',
      drillTypeId: 'dtype-abc',
      skillId: 'skill-abc',
      durationSeconds: 120,
      feelRating: 4,
      timestamp: now,
    });
    await logScaleDrillSession({ hand: 'both', itemRef: 'scale:major:C', durationSeconds: 30, feelRating: 4 });

    const count = await getWeeklyAttempts(
      'shapes-and-patterns',
      now - DAY,
      now + DAY,
    );
    expect(count).toBe(2);
  });
});
