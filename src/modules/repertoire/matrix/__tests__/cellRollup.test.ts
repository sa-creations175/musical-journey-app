// @vitest-environment jsdom
/**
 * Phase B Step 3 Part A — SongCellRunThrough rating.
 *
 * applyAttemptsToCell now stamps a session-level Flying / Cruising /
 * Crawling rating onto every run-through row it produces. These
 * tests pin:
 *   1. the rating lands on all rows from one save (it describes the
 *      session, not the individual attempt) when provided;
 *   2. a null rating leaves the field off entirely — pre-v22 /
 *      unrated semantics;
 *   3. the db round-trip through saveAttemptsAndRollup persists it;
 *   4. rated and unrated rows coexist — a row without a rating is a
 *      valid SongCellRunThrough and downstream counting
 *      (getWeeklyAttempts) is unaffected.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type SongCell, type SongKey } from '../../../../lib/db';
import {
  applyAttemptsToCell,
  isInTempoRange,
  saveAttemptsAndRollup,
  type AttemptDraft,
} from '../cellRollup';
import { getWeeklyAttempts } from '../../../../lib/weeklyAttempts';

const NOW = 1_700_000_000_000;
const SONG = 's1';

function mkCell(overrides: Partial<SongCell> = {}): SongCell {
  return {
    id: 'cell-1',
    songId: SONG,
    sectionId: 'sec-1',
    songKeyId: 'key-1',
    cellState: 'learning',
    comfortableAt: null,
    consecutiveCleanCount: 0,
    lastRunAt: null,
    lastRunWasClean: null,
    notes: null,
    lastEngagedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function mkKey(overrides: Partial<SongKey> = {}): SongKey {
  return {
    id: 'key-1',
    songId: SONG,
    keyName: 'C',
    isOriginalKey: true,
    keyState: 'learning',
    solidAt: null,
    solidDecayState: null,
    lastDecayCheckAt: null,
    livedWithSessionCount: 0,
    livedWithFirstSessionAt: null,
    livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0,
    wholeSongTestPassedAt: null,
    isRetestRecommended: false,
    lastEngagedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const TWO_ATTEMPTS: AttemptDraft[] = [
  { id: 'a1', bpm: 80, wasClean: true },
  { id: 'a2', bpm: 80, wasClean: true },
];

describe('applyAttemptsToCell — rating stamping', () => {
  it('stamps the rating on every run-through row when one is provided', () => {
    const { runThroughRows } = applyAttemptsToCell(
      mkCell(), TWO_ATTEMPTS, null, 3, false, null, NOW,
    );
    expect(runThroughRows).toHaveLength(2);
    expect(runThroughRows.every(r => r.rating === 3)).toBe(true);
  });

  it('omits the rating field entirely when rating is null', () => {
    const { runThroughRows } = applyAttemptsToCell(
      mkCell(), TWO_ATTEMPTS, null, null, false, null, NOW,
    );
    expect(runThroughRows).toHaveLength(2);
    for (const r of runThroughRows) {
      expect('rating' in r).toBe(false);
      expect(r.rating).toBeUndefined();
    }
  });

  it('gives every row from one save the same rating', () => {
    const { runThroughRows } = applyAttemptsToCell(
      mkCell(), TWO_ATTEMPTS, null, 4, false, null, NOW,
    );
    expect(new Set(runThroughRows.map(r => r.rating))).toEqual(new Set([4]));
  });

  it('produces no rows on a notes-only save — nothing to stamp', () => {
    const { runThroughRows } = applyAttemptsToCell(
      mkCell(), [], 'just notes', 1, false, null, NOW,
    );
    expect(runThroughRows).toHaveLength(0);
  });
});

describe('saveAttemptsAndRollup — rating round-trip', () => {
  beforeEach(async () => {
    await db.songCells.clear();
    await db.songKeys.clear();
    await db.songCellRunThroughs.clear();
  });

  async function save(
    rating: 4 | 3 | 1 | null,
    now: number,
  ): Promise<void> {
    const cell = mkCell();
    const songKey = mkKey();
    await db.songCells.put(cell);
    await db.songKeys.put(songKey);
    await saveAttemptsAndRollup({
      cell,
      songKey,
      siblingCells: [cell],
      attempts: [{ id: 'a1', bpm: 80, wasClean: true }],
      notes: null,
      rating,
      markComfortable: false,
      performanceTempo: null,
      expectedSectionCount: 1,
      now,
    });
  }

  it('persists the rating on the run-through rows', async () => {
    await save(3, NOW);
    const rows = await db.songCellRunThroughs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBe(3);
  });

  it('persists rows without a rating when none is picked', async () => {
    await save(null, NOW);
    const rows = await db.songCellRunThroughs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBeUndefined();
  });

  it('rated and unrated rows coexist and both count in getWeeklyAttempts', async () => {
    await save(4, NOW + 1_000);
    await save(null, NOW + 2_000); // an "existing-style" unrated row
    const count = await getWeeklyAttempts('repertoire', NOW, NOW + 10_000);
    expect(count).toBe(2);
  });
});

describe('practiceLogId — the link to a timed session', () => {
  it('stamps the id on every run-through when one is supplied', () => {
    const { runThroughRows } = applyAttemptsToCell(
      mkCell(), TWO_ATTEMPTS, null, null, false, null, NOW, 'plog-1',
    );
    expect(runThroughRows).toHaveLength(2);
    expect(runThroughRows.every(r => r.practiceLogId === 'plog-1')).toBe(true);
  });

  it('OMITS the field entirely when there is no session', () => {
    // Run-throughs logged without timing are an ordinary case, not a
    // degraded one. Writing an explicit null would make "logged
    // outside a session" indistinguishable from "field not yet
    // written" for any later reader.
    const { runThroughRows } = applyAttemptsToCell(
      mkCell(), TWO_ATTEMPTS, null, null, false, null, NOW,
    );
    expect(runThroughRows.every(r => !('practiceLogId' in r))).toBe(true);
  });

  it('carries no duration of its own', () => {
    // Duration lives on the practice log, never per run-through: a
    // 4-bar retry and a full read-through would otherwise carry equal
    // weight, and splitting a session across cells would invent a
    // distribution the user never gave.
    const { runThroughRows } = applyAttemptsToCell(
      mkCell(), TWO_ATTEMPTS, null, null, false, null, NOW, 'plog-1',
    );
    for (const row of runThroughRows) {
      expect('durationMin' in row).toBe(false);
      expect('durationSeconds' in row).toBe(false);
    }
  });
});

describe('optional tempo', () => {
  it('records a run-through with no tempo at all', () => {
    // The gate that used to block this — "type a BPM before you may
    // say it was clean" — was the same friction one level down from
    // the one duration capture removes.
    const { runThroughRows } = applyAttemptsToCell(
      mkCell(), [{ id: 'a1', bpm: null, wasClean: true }],
      null, null, false, null, NOW,
    );
    expect(runThroughRows).toHaveLength(1);
    expect(runThroughRows[0].tempoBpm).toBeNull();
    expect(runThroughRows[0].wasClean).toBe(true);
  });

  it('an untimed run does NOT advance the tempo gate', () => {
    // The gate asks "clean at performance tempo". "Clean at a tempo
    // you did not state" is not an answer to it, so the run is
    // recorded but must not count toward comfortable.
    expect(isInTempoRange(null, 120)).toBe(false);
  });

  it('...but counts when the song has no performance tempo to miss', () => {
    expect(isInTempoRange(null, null)).toBe(true);
  });

  it('still gates a stated tempo on the floor', () => {
    expect(isInTempoRange(115, 120)).toBe(true);
    expect(isInTempoRange(90, 120)).toBe(false);
  });
});

