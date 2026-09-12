// @vitest-environment jsdom
/**
 * v43 — the three retired chord cards fold into the three they
 * duplicated.
 *
 * =====================================================================
 * THIS IS THE STEP THAT CAN LOSE SOMETHING.
 *
 * Commit 1 deleted three cards from the catalog, which is reversible by
 * putting them back. This moves what the reader ANSWERED on them —
 * attempts, a schedule with its due date and acquisition stage, diary
 * entries, flags and private notes — onto another card, and a fold that
 * dropped a row would be found weeks later as practice that never
 * happened. So the assertions here are about preservation, not about a
 * string changing.
 *
 * THE REAL FOLD IS UNDER TEST, not a restatement of it. The v36
 * precedent (`scaleIdentityMigration.test.ts`) copies its migration's
 * body into the test because a Dexie upgrade cannot be replayed; this
 * fold is nine tables and a merge rule each, so instead the rules live
 * in `migrations/retire913.ts`, `db.ts` v43 calls them, and so does
 * this file — against real Dexie tables with seeded rows.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import {
  RETIRED_TO_TARGET,
  foldItemRef,
  foldRetiredChordCards,
  foldSkillId,
  furtherStage,
  joinText,
  mergeChordCounts,
  mergeSpacing,
  type MigrationTable,
  type MigrationTx,
} from '../migrations/retire913';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

/** The upgrade transaction's shape, served by the live tables. Dexie's
 *  `Table` already has every method the migration asks for. */
const tx: MigrationTx = {
  table: (name: string) =>
    (db as unknown as Record<string, MigrationTable>)[name],
};

function spacingRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `sp-${String(over.itemRef)}-${String(over.hand ?? 'both')}`,
    itemRef: 'maj13:0',
    moduleRef: 'chord-recognition',
    hand: 'both',
    memoryType: 'recognition',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 3,
    lastEngagedAt: NOW,
    nextDueAt: NOW + 3 * DAY,
    performanceHistory: [],
    ...over,
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all([
    db.attempts.clear(), db.spacingState.clear(), db.chordQualities.clear(),
    db.harmonicDiaryEntries.clear(), db.skillAnnotations.clear(),
    db.etItemCuration.clear(), db.userPrefs.clear(), db.goals.clear(),
    db.practiceBlocks.clear(),
  ]);
});

describe('which refs move', () => {
  it('folds the three retired cards, in both key forms', () => {
    // Attempts and spacing carry `chordId:inversion`; curations, focus
    // selections and goal scopes carry the bare id. One rule, both.
    expect(foldItemRef('maj9_13')).toBe('maj13');
    expect(foldItemRef('dom9_13:0')).toBe('dom13:0');
    expect(foldItemRef('min9_11:0')).toBe('min11:0');
    expect(foldSkillId('chord-recognition:item:maj9_13'))
      .toBe('chord-recognition:item:maj13');
  });

  it('declines every ref it should not touch', () => {
    for (const ref of [
      'maj13', 'maj13:0', 'min11:0',   // the survivors — never re-folded
      'maj9', 'min9', 'dom13:0',
      'm3:asc',                        // an interval
      'ionian-tab1',                   // a mode
      'scale:major:C',                 // another module entirely
      'maj9_13x',                      // not the id, merely starts like it
    ]) {
      expect(foldItemRef(ref), ref).toBeNull();
    }
    expect(foldSkillId('intervals:asc:maj9_13')).toBeNull();
  });

  it('is idempotent — a folded ref folds no further', () => {
    for (const retired of Object.keys(RETIRED_TO_TARGET)) {
      const once = foldItemRef(retired) as string;
      expect(foldItemRef(once), once).toBeNull();
    }
  });
});

describe('two pieces of hand-written text', () => {
  it('keeps both, the survivor first, on one line break', () => {
    expect(joinText('mine', 'theirs')).toBe('mine\ntheirs');
  });

  it('never appends the same text twice', () => {
    // The retired row is deleted as it folds, so a second run has
    // nothing to append — this is the belt as well as the braces.
    const once = joinText('mine', 'theirs') as string;
    expect(joinText(once, 'theirs')).toBe(once);
  });

  it('handles an empty side without leaving a stray break', () => {
    expect(joinText('', 'theirs')).toBe('theirs');
    expect(joinText('mine', '')).toBe('mine');
    expect(joinText('', '')).toBeUndefined();
  });
});

describe('what a merge preserves', () => {
  it('takes the further stage, the longer interval and the sooner due date', () => {
    const target = spacingRow({
      itemRef: 'maj13:0', acquisitionStage: 'acquiring',
      currentIntervalDays: 3, lastEngagedAt: NOW - 9 * DAY,
      nextDueAt: NOW + 20 * DAY, performanceHistory: [{ t: NOW - 9 * DAY }],
    });
    const retired = spacingRow({
      itemRef: 'maj9_13:0', acquisitionStage: 'consolidated',
      currentIntervalDays: 21, lastEngagedAt: NOW - 2 * DAY,
      nextDueAt: NOW + 2 * DAY, performanceHistory: [{ t: NOW - 2 * DAY }],
      studyLater: true, reviewFlagNote: 'the 13 still catches me',
    });
    const merged = mergeSpacing(target, retired);

    expect(merged.acquisitionStage).toBe('consolidated');
    expect(merged.currentIntervalDays).toBe(21);
    expect(merged.lastEngagedAt).toBe(NOW - 2 * DAY);
    // SOONER, not the survivor's own: a card due in two days is due in
    // two days, rather than having its date quietly pushed out.
    expect(merged.nextDueAt).toBe(NOW + 2 * DAY);
    expect(merged.performanceHistory).toHaveLength(2);
    // And what the reader wrote by hand comes across.
    expect(merged.studyLater).toBe(true);
    expect(merged.reviewFlagNote).toBe('the 13 still catches me');
  });

  it('reads an unknown stage as the earliest, never a promotion', () => {
    expect(furtherStage('acquired', 'mastered')).toBe('mastered');
    expect(furtherStage('mastered', 'acquired')).toBe('mastered');
    expect(furtherStage('acquired', 'nonsense')).toBe('acquired');
  });

  it('adds the tallies rather than taking one of them', () => {
    const merged = mergeChordCounts(
      { correct: 7, total: 10 }, { correct: 4, total: 9 },
    );
    expect(merged.correct).toBe(11);
    expect(merged.total).toBe(19);
  });
});

describe('the fold, on a seeded row for each retired card', () => {
  it('moves everything when the surviving card has nothing yet', async () => {
    for (const [retired, target] of Object.entries(RETIRED_TO_TARGET)) {
      await db.attempts.put({
        id: `att-${retired}`, moduleId: 'chord-recognition',
        itemId: `${retired}:0`, correct: true, timestamp: NOW,
      } as never);
      await db.spacingState.put(spacingRow({
        id: `sp-${retired}`, itemRef: `${retired}:0`,
        acquisitionStage: 'consolidated', currentIntervalDays: 21,
      }) as never);
      await db.harmonicDiaryEntries.put({
        entryId: `e-${retired}`, skillId: `chord-recognition:item:${retired}`,
        userText: `what ${retired} feels like`, isStarterEdited: true,
        emotionalTags: ['soulful'], genreTags: ['r&b'],
        createdAt: NOW, lastEdited: NOW,
      } as never);
      await db.etItemCuration.put({
        itemRef: retired, flagged: true, flagNote: `note on ${retired}`,
        updatedAt: NOW,
      } as never);
      await db.skillAnnotations.put({
        skillId: `chord-recognition:item:${retired}`,
        tags: [`tag-${retired}`], note: `a private note on ${retired}`,
        createdAt: NOW, updatedAt: NOW,
      } as never);
      await db.chordQualities.put({
        id: retired, name: retired, tier: 'extensions', family: 'major',
        intervals: [0], formula: '1', soundDefault: '', correct: 4, total: 9,
      } as never);
      await db.chordQualities.put({
        id: target, name: target, tier: 'extensions', family: 'major',
        intervals: [0], formula: '1', soundDefault: '', correct: 7, total: 10,
      } as never);
    }

    const counts = await foldRetiredChordCards(tx);
    expect(counts.attempts).toBe(3);
    expect(counts.spacingMoved).toBe(3);
    expect(counts.diaryMoved).toBe(3);
    expect(counts.curations).toBe(3);
    expect(counts.annotations).toBe(3);
    expect(counts.chordRows).toBe(3);

    for (const [retired, target] of Object.entries(RETIRED_TO_TARGET)) {
      // Nothing is left under the retired id, anywhere.
      expect(await db.chordQualities.get(retired), retired).toBeUndefined();
      expect(await db.etItemCuration.get(retired), retired).toBeUndefined();
      expect(
        (await db.attempts.toArray()).filter(a => a.itemId.startsWith(retired)),
        retired,
      ).toHaveLength(0);

      // And it is all under the surviving one, with its state intact.
      const moved = (await db.spacingState.toArray())
        .find(r => r.itemRef === `${target}:0`);
      expect(moved, target).toBeDefined();
      expect(moved!.acquisitionStage, target).toBe('consolidated');
      expect(moved!.currentIntervalDays, target).toBe(21);

      const entry = (await db.harmonicDiaryEntries.toArray())
        .find(e => e.skillId === `chord-recognition:item:${target}`);
      expect(entry?.userText, target).toBe(`what ${retired} feels like`);

      // The annotation is keyed ON the skill id, so it moves as a new
      // row plus a delete — and the private note comes with it.
      expect(
        await db.skillAnnotations.get(`chord-recognition:item:${retired}`), retired,
      ).toBeUndefined();
      const annotation = await db.skillAnnotations
        .get(`chord-recognition:item:${target}`);
      expect(annotation?.tags, target).toEqual([`tag-${retired}`]);
      expect(annotation?.note, target).toBe(`a private note on ${retired}`);

      // The tally is the two added together, not one of them.
      const chord = await db.chordQualities.get(target);
      expect(chord?.correct, target).toBe(11);
      expect(chord?.total, target).toBe(19);
    }
  });

  it('keeps the surviving entry’s text and appends the retired one', async () => {
    // Silas's rule: the target keeps its own words, and the retired
    // card's are not silently dropped — they land underneath so he can
    // tidy them himself.
    await db.harmonicDiaryEntries.put({
      entryId: 'e-target', skillId: 'chord-recognition:item:maj13',
      userText: 'the Glasper chord', isStarterEdited: true,
      emotionalTags: ['warm'], genreTags: ['neo-soul'],
      createdAt: NOW, lastEdited: NOW,
    } as never);
    await db.harmonicDiaryEntries.put({
      entryId: 'e-retired', skillId: 'chord-recognition:item:maj9_13',
      userText: 'the AB voicing major', isStarterEdited: true,
      emotionalTags: ['dreamy'], genreTags: ['jazz'],
      createdAt: NOW, lastEdited: NOW + DAY,
    } as never);

    const counts = await foldRetiredChordCards(tx);
    expect(counts.diaryMerged).toBe(1);

    const entries = await db.harmonicDiaryEntries.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].userText).toBe('the Glasper chord\nthe AB voicing major');
    // Both sets of tags survive the merge too.
    expect([...entries[0].emotionalTags].sort()).toEqual(['dreamy', 'warm']);
    expect([...entries[0].genreTags].sort()).toEqual(['jazz', 'neo-soul']);
  });

  it('merges the schedule when the reader answered both cards', async () => {
    // The case v36's rewrite would have DROPPED. There a collision was
    // unreachable; here it is the ordinary case — anyone who drilled
    // Tier 4 answered both — so the row merges instead.
    await db.spacingState.put(spacingRow({
      id: 'sp-target', itemRef: 'min11:0', acquisitionStage: 'acquiring',
      currentIntervalDays: 2, nextDueAt: NOW + 20 * DAY,
    }) as never);
    await db.spacingState.put(spacingRow({
      id: 'sp-retired', itemRef: 'min9_11:0', acquisitionStage: 'mastered',
      currentIntervalDays: 30, nextDueAt: NOW + 4 * DAY, reviewFlagged: true,
    }) as never);

    const counts = await foldRetiredChordCards(tx);
    expect(counts.spacingMerged).toBe(1);

    const rows = await db.spacingState.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].itemRef).toBe('min11:0');
    expect(rows[0].acquisitionStage).toBe('mastered');
    expect(rows[0].currentIntervalDays).toBe(30);
    expect(rows[0].nextDueAt).toBe(NOW + 4 * DAY);
    expect(rows[0].reviewFlagged).toBe(true);
  });

  it('rewrites a focus selection, a goal scope and a past block', async () => {
    await db.userPrefs.put({
      key: 'chordRecognitionFocusSelection',
      value: ['maj13', 'maj9_13', 'min9_11'],
    } as never);
    await db.goals.put({
      id: 'g1', relatedItems: ['dom9_13', 'maj9'], relatedModules: ['ear-training'],
    } as never);
    await db.practiceBlocks.put({
      id: 'b1', sessionId: 's1', orderIndex: 0, moduleRef: 'ear-training',
      itemRefs: ['min9_11:0', 'maj9:0'],
    } as never);

    await foldRetiredChordCards(tx);

    // Deduped: maj13 was already chosen, so folding maj9_13 onto it
    // must not leave the same chord in the list twice.
    expect((await db.userPrefs.get('chordRecognitionFocusSelection'))?.value)
      .toEqual(['maj13', 'min11']);
    expect((await db.goals.get('g1'))?.relatedItems).toEqual(['dom13', 'maj9']);
    expect((await db.practiceBlocks.get('b1'))?.itemRefs)
      .toEqual(['min11:0', 'maj9:0']);
  });

  it('changes nothing on a second run', async () => {
    await db.attempts.put({
      id: 'att-1', moduleId: 'chord-recognition', itemId: 'maj9_13:0',
      correct: true, timestamp: NOW,
    } as never);
    await db.spacingState.put(spacingRow({
      id: 'sp-1', itemRef: 'maj9_13:0',
    }) as never);

    await foldRetiredChordCards(tx);
    const after = await db.spacingState.toArray();

    const second = await foldRetiredChordCards(tx);
    expect(second.attempts).toBe(0);
    expect(second.spacingMoved).toBe(0);
    expect(second.spacingMerged).toBe(0);
    expect(await db.spacingState.toArray()).toEqual(after);
  });
});
