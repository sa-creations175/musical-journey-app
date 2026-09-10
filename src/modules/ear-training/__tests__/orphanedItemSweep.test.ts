/**
 * An ear-training row with no live item behind it gets said out loud.
 *
 * =====================================================================
 * THE HALF OF THE RULE THAT HAD NO REPORTER.
 *
 * The chord-progressions catalog was cut from sixty-nine progressions
 * to eight on 9 Sep 2026. The rule was followed — nothing deleted the
 * rows the other sixty-one had earned — and nothing said they were
 * there either. That is the case these tests are built around, and the
 * first of them is the one that matters most: on a database whose rows
 * all have live items, this says NOTHING. A check that prints on every
 * boot is a check nobody reads.
 *
 * =====================================================================
 * TWO CLAIMS, AND THE FIRST COULD GO WRONG SILENTLY.
 *
 * THAT IT TOUCHES NOTHING. A read-only sweep that deleted one row
 * would take a reader's history with it and nothing would look broken;
 * the item would simply read unpractised. The rows are counted before
 * and after.
 *
 * THAT IT ASKS EACH ITEM SPACE ITS OWN QUESTION. Five vocabularies,
 * seven tables, and the ways to get this wrong are all false
 * positives — reporting a chord because an inversion is unreachable,
 * a progression because a sub-skill ref is not a catalog item, a
 * unison because it was merged rather than retired. Every one of those
 * has a case here.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../lib/db';
import { spacingRowId } from '../../../lib/spacingState';
import { canonicalSkillId } from '../../skills/registry';
import { PROGRESSIONS } from '../chord-progressions/catalog';
import { MODES } from '../scales-modes/catalog';
import {
  describeOrphanedEtItems, reportOrphanedEtItems,
} from '../orphanedItemSweep';

const T = Date.UTC(2026, 8, 9);

/** One of the sixty-one, and the reason this file exists. */
const CUT = '12-bar-blues';
/** A progression that survived the cut. */
const LIVE_PROG = '2-5-1';
/** An id no ear-training catalog has ever held. */
const NEVER = 'zz-not-an-item';

function spacingRow(moduleRef: string, itemRef: string, over: Record<string, unknown> = {}) {
  return {
    id: spacingRowId(moduleRef, itemRef, 'both'),
    itemRef, moduleRef, hand: 'both',
    memoryType: 'declarative', acquisitionStage: 'acquired',
    currentIntervalDays: 21, lastEngagedAt: T, nextDueAt: T + 1000,
    performanceHistory: [{ t: T, kind: 'attempt', correct: true }],
    ...over,
  } as never;
}

let nextAttemptId = 0;
function attempt(moduleId: string, itemId: string, over: Record<string, unknown> = {}) {
  nextAttemptId += 1;
  return {
    id: `a${nextAttemptId}`, moduleId, itemId,
    timestamp: T + nextAttemptId, isCorrect: true, ...over,
  } as never;
}

async function rowCounts() {
  return {
    attempts: await db.attempts.count(),
    spacing: await db.spacingState.count(),
    curation: await db.etItemCuration.count(),
    annotations: await db.skillAnnotations.count(),
    diary: await db.harmonicDiaryEntries.count(),
    progressionAssociations: await db.progressionAssociations.count(),
    modeAssociations: await db.modeAssociations.count(),
    intervalDescriptions: await db.intervalDescriptions.count(),
  };
}

beforeEach(async () => {
  await Promise.all([
    db.attempts.clear(), db.spacingState.clear(), db.etItemCuration.clear(),
    db.skillAnnotations.clear(), db.harmonicDiaryEntries.clear(),
    db.progressionAssociations.clear(), db.modeAssociations.clear(),
    db.intervalDescriptions.clear(),
  ]);
  nextAttemptId = 0;
});

describe('silence is the expected outcome', () => {
  it('says nothing on an empty report', () => {
    expect(describeOrphanedEtItems({ orphans: [] })).toBeNull();
  });

  it('says nothing on a database whose rows all have live items', async () => {
    await db.spacingState.bulkPut([
      spacingRow('chord-progressions', LIVE_PROG),
      spacingRow('intervals', 'M3:asc'),
      spacingRow('scales-modes', `${MODES[0].id}-tab2`),
      spacingRow('chord-recognition', 'maj7:1'),
    ]);
    await db.attempts.bulkAdd([
      attempt('chord-progressions', `${LIVE_PROG}-pattern`),
      attempt('chord-progressions', 'key-detection:Eb'),
      attempt('chord-progressions', 'motion:1-5-asc'),
      attempt('chord-progressions', 'motion-first:1-5-asc'),
      attempt('chord-progressions', 'motion-mode:minimal'),
      attempt('intervals', 'M3', { direction: 'desc' }),
      attempt('chord-recognition', 'min'),
      attempt('scales-modes', `${MODES[1].id}-tab1`),
    ]);
    await db.etItemCuration.put({ itemRef: LIVE_PROG, updatedAt: T } as never);
    await db.progressionAssociations.put({
      progressionId: LIVE_PROG, text: 'the one I can hear', updatedAt: T,
    } as never);
    await db.modeAssociations.put({
      modeId: MODES[0].id, text: 'sunday morning', updatedAt: T,
    } as never);
    await db.intervalDescriptions.put({
      intervalKey: 'minor-3rd-ascending', text: 'the blues lift', updatedAt: T,
    } as never);

    const r = await reportOrphanedEtItems();
    expect(r.orphans).toEqual([]);
    expect(describeOrphanedEtItems(r)).toBeNull();
  });
});

describe('the sixty-one, which is what this was built for', () => {
  it('finds a cut progression across every table it touched', async () => {
    await db.attempts.bulkAdd([
      attempt('chord-progressions', CUT),
      attempt('chord-progressions', CUT),
      attempt('chord-progressions', `${CUT}-pattern`),
    ]);
    await db.spacingState.put(spacingRow('chord-progressions', CUT));

    const r = await reportOrphanedEtItems();
    // Two refs, because the pattern round is its own row: the sweep
    // reports what is stored rather than folding it into a guess.
    expect(r.orphans.map(o => o.ref).sort()).toEqual([CUT, `${CUT}-pattern`]);
    const main = r.orphans.find(o => o.ref === CUT)!;
    expect(main.scope).toBe('chord progressions');
    // Every table the scope reads, zero included — and "chord
    // progressions" reads three, because its associations live in a
    // table of their own and are still the same item space.
    expect(main.counts).toEqual({ attempts: 2, spacing: 1, association: 0 });
    expect(describeOrphanedEtItems(r)).toContain(
      `[et] ${CUT} is not in chord progressions and still has 2 attempt(s), 1 spacing row(s)`,
    );
  });

  it('reaches its curation, its association and its diary entry', async () => {
    await db.etItemCuration.put({
      itemRef: CUT, flagged: true, flagNote: 'come back to this', updatedAt: T,
    } as never);
    await db.progressionAssociations.put({
      progressionId: CUT, text: 'grief and swagger', updatedAt: T,
    } as never);
    await db.harmonicDiaryEntries.put({
      entryId: 'hd-1',
      skillId: canonicalSkillId('chord-progressions', 'item', CUT),
      userText: 'finally heard the turnaround', createdAt: T, updatedAt: T,
    } as never);

    const r = await reportOrphanedEtItems();
    const curation = r.orphans.find(o => o.counts.curation === 1)!;
    expect(curation.scope).toBe('ear training');
    expect(curation.authored).toEqual(['flagNote', 'flagged']);

    const association = r.orphans.find(o => o.counts.association === 1)!;
    expect(association.scope).toBe('chord progressions');

    const diary = r.orphans.find(o => o.counts.diary === 1)!;
    expect(diary.ref).toBe('chord-progressions:item:12-bar-blues');
  });

  it('says how many rows and in which table, and nothing else', async () => {
    // The brief's rule for the line. No advice, no count of what was
    // cut, no offer to tidy: the rows are not going anywhere and the
    // decision is a person's.
    await db.attempts.add(attempt('chord-progressions', CUT));
    const line = describeOrphanedEtItems(await reportOrphanedEtItems())!;
    expect(line).toBe(
      '[et] 12-bar-blues is not in chord progressions and still has 1 attempt(s)',
    );
  });

  it('leaves the eight survivors alone', async () => {
    for (const p of PROGRESSIONS) {
      await db.attempts.add(attempt('chord-progressions', p.id));
    }
    await db.attempts.add(attempt('chord-progressions', CUT));
    const r = await reportOrphanedEtItems();
    expect(r.orphans.map(o => o.ref)).toEqual([CUT]);
  });
});

describe('the false positives each item space could produce', () => {
  it('does not report a chord because one of its inversions is unreachable', async () => {
    // An inversion is not an item. Which inversions a drill will play
    // is a live setting, and the augmented triad has no audible one —
    // reporting `aug:3` would be reporting a chord plainly in the
    // catalog.
    await db.attempts.bulkAdd([
      attempt('chord-recognition', 'aug:3'),
      attempt('chord-recognition', 'dim7:2'),
      attempt('chord-recognition', 'maj13:1'),
    ]);
    const r = await reportOrphanedEtItems();
    expect(r.orphans).toEqual([]);
  });

  it('does report a chord the library no longer holds', async () => {
    await db.attempts.add(attempt('chord-recognition', 'zz-gone:0'));
    const r = await reportOrphanedEtItems();
    expect(r.orphans.map(o => o.ref)).toEqual(['zz-gone:0']);
    expect(r.orphans[0].scope).toBe('chord recognition');
  });

  it('does not report the three sub-skill shapes of a live progression', async () => {
    // None of them is a catalog item; every one has a live thing
    // behind it.
    await db.attempts.bulkAdd([
      attempt('chord-progressions', `${LIVE_PROG}-pattern`),
      attempt('chord-progressions', `${LIVE_PROG}-inversion`),
      attempt('chord-progressions', 'motion-mode:full'),
      attempt('chord-progressions', 'motion-mode:partial'),
    ]);
    expect((await reportOrphanedEtItems()).orphans).toEqual([]);
  });

  it('does not report a descending unison, which was merged and not retired', async () => {
    // At zero semitones the same MIDI note sounds twice whichever
    // branch plays it, so `P1:desc` rows are real unison practice.
    await db.attempts.add(attempt('intervals', 'P1', { direction: 'desc' }));
    await db.spacingState.put(spacingRow('intervals', 'P1:desc'));
    expect((await reportOrphanedEtItems()).orphans).toEqual([]);
  });

  it('reads an attempt with no direction as ascending', async () => {
    await db.attempts.add(attempt('intervals', 'm6'));
    expect((await reportOrphanedEtItems()).orphans).toEqual([]);
  });

  it('does report an interval the seeds no longer hold', async () => {
    await db.attempts.add(attempt('intervals', 'M13', { direction: 'asc' }));
    const r = await reportOrphanedEtItems();
    expect(r.orphans.map(o => o.ref)).toEqual(['M13:asc']);
    expect(r.orphans[0].scope).toBe('intervals');
  });

  it('keeps the interval descriptions apart from the intervals drill', async () => {
    // Two catalogs, two key shapes. Folding them would report every
    // row in one of them.
    await db.intervalDescriptions.bulkPut([
      { intervalKey: 'tritone-descending', text: 'a', updatedAt: T },
      { intervalKey: 'M3:asc', text: 'b', updatedAt: T },
    ] as never);
    const r = await reportOrphanedEtItems();
    expect(r.orphans.map(o => o.ref)).toEqual(['M3:asc']);
    expect(r.orphans[0].scope).toBe('interval descriptions');
  });

  it('leaves other modules entirely alone', async () => {
    await db.attempts.bulkAdd([
      attempt('harmonic-fluency', 'zz-not-a-card'),
      attempt('reading', 'zz-not-a-reading-item'),
    ]);
    await db.spacingState.put(spacingRow('shapes-and-patterns', 'vl:zz:zz:C'));
    await db.skillAnnotations.put({
      skillId: canonicalSkillId('harmonic-fluency', 'card', NEVER),
      note: 'x', tags: [], createdAt: T, updatedAt: T,
    } as never);
    expect((await reportOrphanedEtItems()).orphans).toEqual([]);
  });
});

describe('it reads and never writes', () => {
  it('deletes nothing, on a database full of orphans', async () => {
    for (const id of [CUT, 'gospel-walk-up', 'pj-morton-turnaround']) {
      await db.attempts.add(attempt('chord-progressions', id));
      await db.spacingState.put(spacingRow('chord-progressions', id));
      await db.etItemCuration.put({ itemRef: id, hidden: true, updatedAt: T } as never);
      await db.progressionAssociations.put({
        progressionId: id, text: 'x', updatedAt: T,
      } as never);
      await db.skillAnnotations.put({
        skillId: canonicalSkillId('chord-progressions', 'item', id),
        priority: 'high', tags: [], createdAt: T, updatedAt: T,
      } as never);
      await db.harmonicDiaryEntries.put({
        entryId: `hd-${id}`,
        skillId: canonicalSkillId('chord-progressions', 'item', id),
        userText: 'x', createdAt: T, updatedAt: T,
      } as never);
    }
    await db.modeAssociations.put({ modeId: 'zz-gone', text: 'x', updatedAt: T } as never);
    await db.intervalDescriptions.put({
      intervalKey: 'zz-gone-ascending', text: 'x', updatedAt: T,
    } as never);

    const before = await rowCounts();
    const r = await reportOrphanedEtItems();
    expect(r.orphans.length).toBeGreaterThan(3);
    expect(await rowCounts()).toEqual(before);
  });

  it('is unchanged by running twice', async () => {
    await db.spacingState.put(spacingRow('chord-progressions', CUT));
    const first = await reportOrphanedEtItems();
    const second = await reportOrphanedEtItems();
    expect(second).toEqual(first);
    expect((await rowCounts()).spacing).toBe(1);
  });
});

describe('the line', () => {
  it('names what a reader wrote, separately from what the app wrote', async () => {
    await db.spacingState.put(spacingRow('chord-progressions', CUT, {
      studyLater: true, reviewFlagNote: 'the walk-up again',
    }));
    const line = describeOrphanedEtItems(await reportOrphanedEtItems())!;
    expect(line).toContain('reviewFlagNote, studyLater written by hand');
  });

  it('gives one line per orphaned item, in scope then ref order', async () => {
    await db.attempts.bulkAdd([
      attempt('intervals', 'M13', { direction: 'asc' }),
      attempt('chord-progressions', 'plagal-vamp'),
      attempt('chord-progressions', '1-4-vamp'),
    ]);
    const lines = describeOrphanedEtItems(await reportOrphanedEtItems())!.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('[et] 1-4-vamp is not in chord progressions');
    expect(lines[1]).toContain('[et] plagal-vamp is not in chord progressions');
    expect(lines[2]).toContain('[et] M13:asc is not in intervals');
  });
});
