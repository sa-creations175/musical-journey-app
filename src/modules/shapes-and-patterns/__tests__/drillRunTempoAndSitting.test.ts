/**
 * A run records what it was played at, and which sitting it was in.
 *
 * =====================================================================
 * NEITHER WAS RECORDED, AND BOTH WERE IN THE ROOM.
 *
 * The panel that runs a drill holds the metronome and holds the
 * session's id. The row it wrote carried neither, so the log could say
 * how a run went and how long it lasted and nothing about the two
 * things that place it: the speed and the sitting.
 *
 * ONE SOURCE EACH. The tempo is read from the metronome at the moment
 * the run ends; the sitting is the id the panel already minted. Nothing
 * reaches for the metronome's current setting afterwards, and nothing
 * matches a run to a sitting by timestamp — a join on time silently
 * mis-attributes any two runs that land in the same second.
 *
 * ABSENT STAYS ABSENT. A legacy row has neither and is never given
 * either; a run played in silence has no tempo, which is a real answer
 * and not a missing one.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type DrillSession } from '../../../lib/db';
import {
  logScaleDrillSession, logSession, logVoiceLeadingDrillSession,
} from '../drillModel';
import { sessionSecondsById } from '../handProgress';

const ITEM = 'scale:c-major:2oct';

const base = {
  itemRef: ITEM,
  hand: 'left' as const,
  durationSeconds: 60,
  feelRating: 3 as const,
};

/** A legacy row: written before either field existed. */
const legacy = (id: string, seconds: number): DrillSession => ({
  id, drillTypeId: ITEM, skillId: ITEM,
  hand: 'left', durationSeconds: seconds, timestamp: 1,
} as DrillSession);

beforeEach(async () => {
  await db.drillSessions.clear();
  await db.drillTypes.clear();
  await db.drillSkills.clear();
});

describe('the row carries both', () => {
  it('a scale run records the tempo and the sitting', async () => {
    await logScaleDrillSession({ ...base, bpm: 96, sessionId: 'ss-1' });
    const [row] = await db.drillSessions.toArray();
    expect(row.bpm).toBe(96);
    expect(row.sessionId).toBe('ss-1');
  });

  it('a voice-leading run does too', async () => {
    await logVoiceLeadingDrillSession({
      itemRef: 'vl:aba-251:level1:A:C', hand: 'both', durationSeconds: 90,
      feelRating: 3, bpm: 72, sessionId: 'ss-2',
    });
    const [row] = await db.drillSessions.toArray();
    expect(row.bpm).toBe(72);
    expect(row.sessionId).toBe('ss-2');
  });

  it('and so does a chord-shape run', async () => {
    const skill = {
      id: 'sk-1', kind: 'chord-shape' as const, quality: 'maj7',
      keyName: 'C', label: 'Cmaj7',
    };
    const drillType = {
      id: 'dt-1', skillId: 'sk-1', name: 'Root position',
      suggestedSeconds: 60, repCount: 0, totalSeconds: 0, order: 0,
    };
    await db.drillSkills.add(skill as never);
    await db.drillTypes.add(drillType as never);
    await logSession({
      skill: skill as never, drillType: drillType as never, hand: 'right',
      durationSeconds: 60, feelRating: 3, fromTest: false,
      bpm: 60, sessionId: 'ss-3',
    });
    const [row] = await db.drillSessions.toArray();
    expect(row.bpm).toBe(60);
    expect(row.sessionId).toBe('ss-3');
  });

  it('A SILENT RUN HAS NO TEMPO, and is not given one', async () => {
    await logScaleDrillSession({ ...base, sessionId: 'ss-1' });
    const [row] = await db.drillSessions.toArray();
    expect(row.bpm).toBeUndefined();
    expect(row.sessionId).toBe('ss-1');
  });

  it('A LEGACY ROW HAS NEITHER, and still reads', async () => {
    await db.drillSessions.add(legacy('legacy-1', 90));
    const [row] = await db.drillSessions.toArray();
    expect(row.bpm).toBeUndefined();
    expect(row.sessionId).toBeUndefined();
    // The two things a legacy row DOES carry are untouched.
    expect(row.durationSeconds).toBe(90);
    expect(row.timestamp).toBe(1);
  });
});

describe('the sittings, summed', () => {
  it('gathers the runs that name one sitting', async () => {
    await logScaleDrillSession({ ...base, durationSeconds: 60, sessionId: 'ss-1' });
    await logScaleDrillSession({ ...base, durationSeconds: 90, sessionId: 'ss-1' });
    await logScaleDrillSession({ ...base, durationSeconds: 30, sessionId: 'ss-2' });

    const totals = sessionSecondsById(await db.drillSessions.toArray());
    expect(totals.get('ss-1')).toBe(150);
    expect(totals.get('ss-2')).toBe(30);
  });

  it('and a row with no sitting joins none', async () => {
    await db.drillSessions.add(legacy('legacy-1', 90));
    await logScaleDrillSession({ ...base, durationSeconds: 60, sessionId: 'ss-1' });

    const totals = sessionSecondsById(await db.drillSessions.toArray());
    expect(totals.size).toBe(1);
    expect(totals.get('ss-1')).toBe(60);
  });

  it('crosses hands and cells — a sitting is a sitting', async () => {
    await logScaleDrillSession({
      ...base, hand: 'left', durationSeconds: 60, sessionId: 'ss-1',
    });
    await logScaleDrillSession({
      ...base, itemRef: 'scale:major:F', hand: 'both',
      durationSeconds: 40, sessionId: 'ss-1',
    });
    const totals = sessionSecondsById(await db.drillSessions.toArray());
    expect(totals.get('ss-1')).toBe(100);
  });
});
