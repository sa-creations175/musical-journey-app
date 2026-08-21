// @vitest-environment jsdom
/**
 * Logging ONE whole-song run-through in a key.
 *
 * The gap this fills: `saveKeyAttemptsAndRollup` is reachable only
 * through the whole-song test modal, which opens only once every
 * section's cell in the key is comfortable. So there was no way to
 * record "I played the song through in Ab once" without first doing
 * the full depth work in Ab — and Cross-key → Internalized asks for
 * exactly that single pass in each of eight keys.
 *
 * The property that matters most is a NEGATIVE one: however many
 * clean at-tempo singles are logged, none of them may promote a key.
 * The gate stays three consecutive clean runs in one sitting.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type SongCell, type SongKey } from '../../../../lib/db';
import {
  applyAttemptsToKey,
  logSingleKeyRun,
  saveKeyAttemptsAndRollup,
} from '../cellRollup';
import { isHeld } from '../keyProgress';
import { evaluateAdvancement } from '../../stage';

const NOW = 1_700_000_000_000;
const SONG = 's1';
const TEMPO = 100;

function mkKey(overrides: Partial<SongKey> = {}): SongKey {
  return {
    id: 'key-1', songId: SONG, keyName: 'Ab', isOriginalKey: false,
    keyState: 'not_started', solidAt: null, solidDecayState: null,
    lastDecayCheckAt: null, livedWithSessionCount: 0,
    livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
    isRetestRecommended: false, lastEngagedAt: null,
    createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function mkCell(overrides: Partial<SongCell> = {}): SongCell {
  return {
    id: 'cell-1', songId: SONG, sectionId: 'sec-1', songKeyId: 'key-1',
    cellState: 'comfortable', comfortableAt: NOW, consecutiveCleanCount: 3,
    lastRunAt: NOW, lastRunWasClean: true, notes: null, lastEngagedAt: NOW,
    createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

async function logRun(songKey: SongKey, wasClean: boolean, bpm: number, at: number) {
  await logSingleKeyRun({
    songKey,
    attempt: { id: `a-${at}`, bpm, wasClean },
    performanceTempo: TEMPO,
    siblingCells: [mkCell()],
    expectedSectionCount: 1,
    now: at,
  });
}

beforeEach(async () => {
  await db.songKeyRunThroughs.clear();
  await db.songKeys.clear();
});

describe('logSingleKeyRun', () => {
  it('writes one row tagged as a single run', async () => {
    const key = mkKey();
    await db.songKeys.put(key);
    await logRun(key, true, TEMPO, NOW);

    const rows = await db.songKeyRunThroughs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('single');
    expect(rows[0].wasClean).toBe(true);
    expect(rows[0].tempoBpm).toBe(TEMPO);
  });

  it('works on an UNTOUCHED key — the whole reason it exists', async () => {
    // The test modal cannot open here: keyState is not_started, so no
    // section in this key is comfortable. Before this writer there
    // was no way to record a run in such a key at all.
    const key = mkKey({ keyState: 'not_started' });
    await db.songKeys.put(key);
    await logRun(key, true, TEMPO, NOW);

    expect(await db.songKeyRunThroughs.count()).toBe(1);
    const after = await db.songKeys.get('key-1');
    expect(after?.keyState).toBe('not_started');
  });

  it('submits exactly ONE attempt per call — the braces', async () => {
    // This, not `markSolid: false`, is what actually stops a single
    // run promoting anything: saveKeyAttemptsAndRollup promotes on
    // `markSolid && finalCount >= 3`, and one attempt caps finalCount
    // at 1. Widening this function to take a list is the edit that
    // would matter, so it is what gets pinned.
    const key = mkKey({ keyState: 'comfortable' });
    await db.songKeys.put(key);
    await logRun(key, true, TEMPO, NOW);

    const rows = await db.songKeyRunThroughs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].consecutiveCleanCount).toBe(1);
  });

  it('never builds a streak across repeated calls — discrete sessions', async () => {
    // Ten clean at-tempo runs logged one at a time. Each call starts
    // its own session, so every row carries a count of 1 and none
    // ever reaches the gate's 3.
    let key = mkKey({ keyState: 'comfortable' });
    await db.songKeys.put(key);
    for (let i = 0; i < 10; i++) {
      key = (await db.songKeys.get('key-1'))!;
      await logRun(key, true, TEMPO, NOW + i * 1000);
    }
    const rows = await db.songKeyRunThroughs.toArray();
    expect(rows).toHaveLength(10);
    expect(rows.every(r => r.wasClean && r.tempoBpm === TEMPO)).toBe(true);
    expect(Math.max(...rows.map(r => r.consecutiveCleanCount))).toBe(1);
  });

  it('markSolid gates promotion — the belt, tested where it can act', async () => {
    // logSingleKeyRun's `markSolid: false` is unreachable-by-design
    // today, so it cannot be reversed through that function. Test it
    // where it IS binding: three clean at-tempo attempts in one call.
    // Same input, the flag the only difference.
    const key = mkKey({ keyState: 'comfortable' });
    const three = [1, 2, 3].map(i => ({ id: `a${i}`, bpm: TEMPO, wasClean: true }));
    const call = (markSolid: boolean) => saveKeyAttemptsAndRollup({
      songKey: key, attempts: three, markSolid, performanceTempo: TEMPO,
      isRetest: false, siblingCells: [mkCell()], expectedSectionCount: 1, now: NOW,
    });

    await db.songKeys.put(key);
    await call(false);
    expect((await db.songKeys.get('key-1'))?.wholeSongTestPassedAt).toBeNull();

    await db.songKeys.put(key);
    await call(true);
    expect((await db.songKeys.get('key-1'))?.wholeSongTestPassedAt).toBe(NOW);
  });

  it('leaves the key exactly where it was after ten clean singles', async () => {
    let key = mkKey({ keyState: 'comfortable' });
    await db.songKeys.put(key);
    for (let i = 0; i < 10; i++) {
      key = (await db.songKeys.get('key-1'))!;
      await logRun(key, true, TEMPO, NOW + i * 1000);
    }

    // Guard the guard: the runs really were logged, and really were
    // clean and at tempo — so a promotion would have been possible if
    // the rule allowed it.
    const rows = await db.songKeyRunThroughs.toArray();
    expect(rows).toHaveLength(10);
    expect(rows.every(r => r.wasClean && r.tempoBpm === TEMPO)).toBe(true);

    const after = await db.songKeys.get('key-1');
    expect(after?.wholeSongTestPassedAt).toBeNull();
    expect(after?.solidAt).toBeNull();
    expect(after?.keyState).toBe('comfortable');
  });

  it('counts as engagement — the decay clock resets', async () => {
    // Playing the song through is engagement by any reading, and
    // withholding it would let a key drift to lapsed while being
    // played.
    const key = mkKey({ keyState: 'comfortable', lastEngagedAt: NOW - 999_999 });
    await db.songKeys.put(key);
    await logRun(key, true, TEMPO, NOW);

    const after = await db.songKeys.get('key-1');
    expect(after?.lastEngagedAt).toBe(NOW);
  });

  it('does NOT clear a lapse — only a passed retest does that', async () => {
    const key = mkKey({
      keyState: 'solid', solidAt: NOW - 1, solidDecayState: 'lapsed',
      isRetestRecommended: true, wholeSongTestPassedAt: NOW - 1,
    });
    await db.songKeys.put(key);
    await logRun(key, true, TEMPO, NOW);

    const after = await db.songKeys.get('key-1');
    expect(after?.solidDecayState).toBe('lapsed');
    expect(after?.isRetestRecommended).toBe(true);
  });

  it('records a not-clean run honestly', async () => {
    const key = mkKey();
    await db.songKeys.put(key);
    await logRun(key, false, TEMPO, NOW);

    const rows = await db.songKeyRunThroughs.toArray();
    expect(rows[0].wasClean).toBe(false);
    expect(rows[0].kind).toBe('single');
  });
});

describe('kind separates the two events', () => {
  it('test-session rows are tagged test, so the two counters cannot merge', async () => {
    const key = mkKey({ keyState: 'comfortable' });
    await db.songKeys.put(key);

    await saveKeyAttemptsAndRollup({
      songKey: key,
      attempts: [{ id: 't1', bpm: TEMPO, wasClean: true }],
      markSolid: false,
      performanceTempo: TEMPO,
      isRetest: false,
      siblingCells: [mkCell()],
      expectedSectionCount: 1,
      now: NOW,
    });
    const fresh = (await db.songKeys.get('key-1'))!;
    await logRun(fresh, true, TEMPO, NOW + 5000);

    const rows = await db.songKeyRunThroughs.toArray();
    expect(rows.filter(r => r.kind !== 'single')).toHaveLength(1);
    expect(rows.filter(r => r.kind === 'single')).toHaveLength(1);
  });

  it('applyAttemptsToKey defaults to test, so pre-existing callers are unchanged', () => {
    const { runThroughRows } = applyAttemptsToKey(
      mkKey(), [{ id: 'a1', bpm: TEMPO, wasClean: true }], TEMPO, false, NOW,
    );
    expect(runThroughRows[0].kind).toBe('test');
  });
});

describe('testing past the gate', () => {
  /**
   * The override lets a song already in your hands reach Comfortable
   * without the section-by-section work. What it must NOT do is
   * fabricate the section work: `keyState` is recomputed from the
   * CELLS on a pass, so a key whose sections are not comfortable
   * stays where it is. Both halves are asserted, because the screen
   * promises exactly this split and either half silently flipping
   * would make it a lie.
   */
  it('a pass below the gate records the test but does not make the key solid', async () => {
    const key = mkKey({ keyState: 'learning' });
    await db.songKeys.put(key);

    await saveKeyAttemptsAndRollup({
      songKey: key,
      attempts: [1, 2, 3].map(i => ({ id: `a${i}`, bpm: TEMPO, wasClean: true })),
      markSolid: true,
      performanceTempo: TEMPO,
      isRetest: false,
      // The section is NOT comfortable — that is the whole premise.
      siblingCells: [mkCell({ cellState: 'learning', consecutiveCleanCount: 0 })],
      expectedSectionCount: 1,
      now: NOW,
    });

    const after = await db.songKeys.get('key-1');
    // Guard the guard: the gate really was met, so a refusal here
    // would be about the cells and not about the streak.
    expect(after?.wholeSongTestPassedAt).toBe(NOW);
    expect(after?.keyState).toBe('learning');
  });

  it('and that pass is what moves the song to Comfortable', async () => {
    // The consequence the confirm dialog promises, checked against the
    // rule rather than described. Same key, now flagged original.
    const key = mkKey({ keyState: 'learning', isOriginalKey: true, keyName: 'C' });
    await db.songKeys.put(key);
    await saveKeyAttemptsAndRollup({
      songKey: key,
      attempts: [1, 2, 3].map(i => ({ id: `b${i}`, bpm: TEMPO, wasClean: true })),
      markSolid: true,
      performanceTempo: TEMPO,
      isRetest: false,
      siblingCells: [mkCell({ cellState: 'learning', consecutiveCleanCount: 0 })],
      expectedSectionCount: 1,
      now: NOW,
    });
    const after = (await db.songKeys.get('key-1'))!;

    expect(evaluateAdvancement({
      currentStage: 'learning',
      songKeys: [after],
      keyRunThroughs: [],
      performanceTempo: TEMPO,
      now: NOW,
    }).suggest).toBe(true);
  });

  it('but the key still does not count toward cross-key', async () => {
    // isHeld needs comfortable-or-better, and a forced pass leaves the
    // key at learning. This is the trade the confirm dialog names.
    const key = mkKey({ keyState: 'learning' });
    await db.songKeys.put(key);
    await saveKeyAttemptsAndRollup({
      songKey: key,
      attempts: [1, 2, 3].map(i => ({ id: `c${i}`, bpm: TEMPO, wasClean: true })),
      markSolid: true, performanceTempo: TEMPO, isRetest: false,
      siblingCells: [mkCell({ cellState: 'learning', consecutiveCleanCount: 0 })],
      expectedSectionCount: 1, now: NOW,
    });
    const after = (await db.songKeys.get('key-1'))!;
    expect(isHeld(after, NOW)).toBe(false);
  });
});
