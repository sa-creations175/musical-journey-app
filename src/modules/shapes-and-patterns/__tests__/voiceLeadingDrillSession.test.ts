// @vitest-environment jsdom
/**
 * VL Phase 1 Commit 2 — drill session logger + sub-cell picker tests.
 *
 * Two halves:
 *   · logVoiceLeadingDrillSession — DrillSession row shape, ratings,
 *     attempt counting via getWeeklyAttempts, isolation from
 *     db.drillTypes / db.spacingState.
 *   · pickMostDueVoiceLeadingSubCell — priority tiers (no row →
 *     null nextDueAt → earliest nextDueAt), catalog-order tiebreak,
 *     custom-pattern null behavior.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../lib/db';
import { logVoiceLeadingDrillSession } from '../drillModel';
import {
  enumerateVoiceLeadingCells,
  pickMostDueVoiceLeadingSubCell,
  VOICE_LEADING_PATTERN_BY_ID,
  type VoiceLeadingPickerRow,
} from '../catalog';
import { getWeeklyAttempts } from '../../../lib/weeklyAttempts';

beforeEach(async () => {
  await db.drillSessions.clear();
  await db.drillTypes.clear();
  await db.spacingState.clear();
});

// ---------------------------------------------------------------------
// logVoiceLeadingDrillSession — DrillSession row shape
// ---------------------------------------------------------------------

describe('logVoiceLeadingDrillSession — row shape', () => {
  it('writes a DrillSession row with the VL sub-cell itemRef as skillId + drillTypeId', async () => {
    const before = Date.now();
    const session = await logVoiceLeadingDrillSession({
      itemRef: 'vl:major-251:guide-tones:A:C',
      durationSeconds: 92,
      rating: 'cruising',
      targetSeconds: 90,
    });
    const after = Date.now();

    const rows = await db.drillSessions.toArray();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toEqual(session);
    expect(row.id.startsWith('dses-')).toBe(true);
    expect(row.skillId).toBe('vl:major-251:guide-tones:A:C');
    expect(row.drillTypeId).toBe('vl:major-251:guide-tones:A:C');
    expect(row.durationSeconds).toBe(92);
    expect(row.targetSeconds).toBe(90);
    expect(row.feelRating).toBe(3); // cruising → 3
    expect(row.timestamp).toBeGreaterThanOrEqual(before);
    expect(row.timestamp).toBeLessThanOrEqual(after);
  });

  it('maps the 3-point rating onto feelRating (flying → 4, cruising → 3, crawling → 1)', async () => {
    await logVoiceLeadingDrillSession({ itemRef: 'vl:diatonic-cycle:pos1:C', durationSeconds: 180, rating: 'flying' });
    await logVoiceLeadingDrillSession({ itemRef: 'vl:dom7b9:pos2:G',         durationSeconds: 90,  rating: 'cruising' });
    await logVoiceLeadingDrillSession({ itemRef: 'vl:dim7:pos3:F',           durationSeconds: 90,  rating: 'crawling' });

    const byItem = new Map(
      (await db.drillSessions.toArray()).map(r => [r.skillId, r.feelRating]),
    );
    expect(byItem.get('vl:diatonic-cycle:pos1:C')).toBe(4);
    expect(byItem.get('vl:dom7b9:pos2:G')).toBe(3);
    expect(byItem.get('vl:dim7:pos3:F')).toBe(1);
  });

  it('rounds durationSeconds + targetSeconds and trims notes', async () => {
    await logVoiceLeadingDrillSession({
      itemRef: 'vl:major-251:aba-structure:B:F',
      durationSeconds: 121.6,
      rating: 'cruising',
      targetSeconds: 119.4,
      notes: '  capstone type is tougher in F  ',
    });
    const row = (await db.drillSessions.toArray())[0];
    expect(row.durationSeconds).toBe(122);
    expect(row.targetSeconds).toBe(119);
    expect(row.notes).toBe('capstone type is tougher in F');
  });

  it('omits targetSeconds when not supplied and notes when blank', async () => {
    await logVoiceLeadingDrillSession({
      itemRef: 'vl:major-251:guide-tones:A:C',
      durationSeconds: 90,
      rating: 'flying',
      notes: '   ',
    });
    const row = (await db.drillSessions.toArray())[0];
    expect('targetSeconds' in row).toBe(false);
    expect(row.notes).toBeUndefined();
  });

  it('does not touch db.drillTypes or db.spacingState (caller drives those separately)', async () => {
    await logVoiceLeadingDrillSession({
      itemRef: 'vl:major-251:guide-tones:A:C',
      durationSeconds: 90,
      rating: 'cruising',
    });
    expect(await db.drillTypes.count()).toBe(0);
    expect(await db.spacingState.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------
// logVoiceLeadingDrillSession — counted by getWeeklyAttempts
// ---------------------------------------------------------------------

describe('logVoiceLeadingDrillSession — counted by getWeeklyAttempts', () => {
  it('getWeeklyAttempts("shapes-and-patterns") counts VL drill rows in the window', async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    await logVoiceLeadingDrillSession({ itemRef: 'vl:major-251:guide-tones:A:C', durationSeconds: 90, rating: 'cruising' });
    await logVoiceLeadingDrillSession({ itemRef: 'vl:diatonic-cycle:pos1:F', durationSeconds: 180, rating: 'flying' });

    // Out-of-window row — must not count.
    await db.drillSessions.add({
      id: 'old-1',
      drillTypeId: 'vl:major-251:guide-tones:A:Bb',
      skillId: 'vl:major-251:guide-tones:A:Bb',
      durationSeconds: 90,
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

  it('VL rows count alongside chord-shape and scale rows in the same S&P bucket', async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    await db.drillSessions.add({
      id: 'cs-1',
      drillTypeId: 'dtype-abc',
      skillId: 'skill-abc',
      durationSeconds: 90,
      feelRating: 3,
      timestamp: now,
    });
    await logVoiceLeadingDrillSession({ itemRef: 'vl:major-251:guide-tones:A:C', durationSeconds: 90, rating: 'flying' });

    const count = await getWeeklyAttempts(
      'shapes-and-patterns',
      now - DAY,
      now + DAY,
    );
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------
// pickMostDueVoiceLeadingSubCell — priority tiers
// ---------------------------------------------------------------------

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

describe('pickMostDueVoiceLeadingSubCell — priority tiers', () => {
  it('returns null for a pattern id not in the catalog (custom patterns)', () => {
    expect(pickMostDueVoiceLeadingSubCell('custom-foo', 'C', [])).toBeNull();
    // Pre-correction patternId no longer in the catalog.
    expect(pickMostDueVoiceLeadingSubCell('aba-251', 'C', [])).toBeNull();
  });

  it('with no rows at all, returns the first enumerated sub-cell for the pattern × key (deterministic)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('major-251')!;
    const expected = enumerateVoiceLeadingCells(pat, 'C')[0];
    expect(pickMostDueVoiceLeadingSubCell('major-251', 'C', [])).toBe(expected);
  });

  it('prefers sub-cells with no spacingState row over any practised cell', () => {
    // major-251 in C has 6 sub-cells. Fill the FIRST sub-cell with a
    // row that has a long-overdue nextDueAt. The picker should still
    // prefer an untouched sub-cell over the first one.
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('major-251')!;
    const cells = enumerateVoiceLeadingCells(pat, 'C');
    const rows: VoiceLeadingPickerRow[] = [
      { itemRef: cells[0], nextDueAt: NOW - 100 * HOUR },
    ];
    const picked = pickMostDueVoiceLeadingSubCell('major-251', 'C', rows);
    // Must be one of the 5 untouched cells, never the first.
    expect(picked).not.toBe(cells[0]);
    expect(cells.slice(1)).toContain(picked);
  });

  it('among untouched cells, returns the first in catalog enumeration order (deterministic tiebreak)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('major-251')!;
    const cells = enumerateVoiceLeadingCells(pat, 'C');
    // Fill cells[3] only — first untouched cell is cells[0].
    const rows: VoiceLeadingPickerRow[] = [
      { itemRef: cells[3], nextDueAt: NOW },
    ];
    expect(pickMostDueVoiceLeadingSubCell('major-251', 'C', rows)).toBe(cells[0]);
  });

  it('all cells practised: prefers a row with null nextDueAt (unscheduled) over any scheduled row', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('diatonic-cycle')!;
    const cells = enumerateVoiceLeadingCells(pat, 'F');
    expect(cells).toHaveLength(3);
    const rows: VoiceLeadingPickerRow[] = [
      { itemRef: cells[0], nextDueAt: NOW - 10 * HOUR },
      { itemRef: cells[1], nextDueAt: null },               // unscheduled — highest priority among practised
      { itemRef: cells[2], nextDueAt: NOW - 100 * HOUR },
    ];
    expect(pickMostDueVoiceLeadingSubCell('diatonic-cycle', 'F', rows)).toBe(cells[1]);
  });

  it('all cells practised + scheduled: returns the row with the earliest nextDueAt', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('diatonic-cycle')!;
    const cells = enumerateVoiceLeadingCells(pat, 'F');
    const rows: VoiceLeadingPickerRow[] = [
      { itemRef: cells[0], nextDueAt: NOW + 5 * HOUR },
      { itemRef: cells[1], nextDueAt: NOW - 10 * HOUR },  // most overdue
      { itemRef: cells[2], nextDueAt: NOW + 2 * HOUR },
    ];
    expect(pickMostDueVoiceLeadingSubCell('diatonic-cycle', 'F', rows)).toBe(cells[1]);
  });

  it('ignores rows for OTHER patterns or OTHER keys when selecting', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('major-251')!;
    const cells = enumerateVoiceLeadingCells(pat, 'C');
    // Stuff the row list with unrelated sub-cells — picker must still
    // pick the first untouched cells of (major-251, C).
    const rows: VoiceLeadingPickerRow[] = [
      { itemRef: 'vl:major-251:guide-tones:A:G', nextDueAt: NOW - 100 * HOUR },
      { itemRef: 'vl:dim7:pos1:C',               nextDueAt: NOW - 100 * HOUR },
      { itemRef: 'scale:major:C',                nextDueAt: NOW - 100 * HOUR },
    ];
    expect(pickMostDueVoiceLeadingSubCell('major-251', 'C', rows)).toBe(cells[0]);
  });
});
