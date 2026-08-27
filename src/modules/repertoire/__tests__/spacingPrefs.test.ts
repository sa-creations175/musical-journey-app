/**
 * Repertoire's adapter over the spacing tree's Songs row.
 *
 * ---------------------------------------------------------------
 * WHAT THIS FILE USED TO ASSERT, AND WHERE IT WENT.
 *
 * It tested `intervalSequence` — the old settings section's read-out —
 * and that the read-out matched `computeIntervalDays`. Both are gone:
 * there is no single ceiling to walk any more, and the spacing page
 * draws its sequences by running the real scheduler, which
 * `previewSequence` is tested for in the engine's own file. That rule
 * still holds, it is simply enforced somewhere else.
 *
 * What survives here is what still applies: defaults when nothing is
 * stored, and refusing a stored value that would make every key
 * permanently overdue.
 * ---------------------------------------------------------------
 */
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../../lib/db';
import { setPref } from '../../../lib/userPrefs';
import { PREF_SPACING_TREE } from '../../../lib/spacing/store';
import {
  PREF_DUE_SOON_DAYS, PREF_FIRST_INTERVAL_DAYS, PREF_GRACE_DAYS,
  PREF_LONGEST_INTERVAL_DAYS, PREF_SONG_PREFS_MIGRATED, SPACING_DEFAULTS,
  SONGS_NODE_ID, getSpacingSettings, migrateSongSpacingPrefs, windowsFrom,
} from '../spacingPrefs';

beforeEach(async () => {
  await db.userPrefs.clear();
});

describe('reading the Songs row', () => {
  it('returns the tree defaults when nothing is stored', async () => {
    expect(await getSpacingSettings()).toEqual(SPACING_DEFAULTS);
    expect(SPACING_DEFAULTS.firstIntervalDays).toBe(2);
    expect(SPACING_DEFAULTS.dueSoonDays).toBe(7);
    expect(SPACING_DEFAULTS.graceDays).toBe(7);
  });

  it('reports the top band as the longest a key can ever wait', () => {
    // There is no single ceiling any more — a key is capped by the
    // band it is in — so "the most time that can ever pass" is the
    // highest of the four.
    expect(SPACING_DEFAULTS.longestIntervalDays).toBe(60);
  });

  it('reads an override off the Songs row', async () => {
    await setPref(PREF_SPACING_TREE, {
      [SONGS_NODE_ID]: { stale: { graceDays: 14, dueSoonDays: 3 } },
    });
    const s = await getSpacingSettings();
    expect(windowsFrom(s)).toEqual({ dueSoonDays: 3, graceDays: 14 });
  });

  it('refuses a stored value that would make every key permanently overdue', async () => {
    // Zero and negative grace are rejected on read, so a bad value
    // arriving from another device cannot demote a whole library.
    await setPref(PREF_SPACING_TREE, { [SONGS_NODE_ID]: { stale: { graceDays: 0 } } });
    expect((await getSpacingSettings()).graceDays).toBe(SPACING_DEFAULTS.graceDays);
  });
});

describe('carrying the four retired prefs onto the tree', () => {
  it('carries only what was actually changed', async () => {
    await setPref(PREF_FIRST_INTERVAL_DAYS, 2);    // unchanged default
    await setPref(PREF_GRACE_DAYS, 14);            // customised
    const r = await migrateSongSpacingPrefs();
    expect(r.migrated).toBe(true);
    expect(r.carried).toEqual(['grace after due']);
    expect((await getSpacingSettings()).graceDays).toBe(14);
    // The untouched one is still inheriting, not pinned as an override.
    expect((await getSpacingSettings()).firstIntervalDays).toBe(2);
  });

  it('puts a customised longest interval on the top band', async () => {
    await setPref(PREF_LONGEST_INTERVAL_DAYS, 45);
    await migrateSongSpacingPrefs();
    expect((await getSpacingSettings()).longestIntervalDays).toBe(45);
  });

  it('carries nothing when every pref sat at its old default', async () => {
    await setPref(PREF_FIRST_INTERVAL_DAYS, 2);
    await setPref(PREF_LONGEST_INTERVAL_DAYS, 30);
    await setPref(PREF_DUE_SOON_DAYS, 7);
    await setPref(PREF_GRACE_DAYS, 7);
    const r = await migrateSongSpacingPrefs();
    expect(r.carried).toEqual([]);
  });

  it('runs once', async () => {
    await setPref(PREF_GRACE_DAYS, 21);
    await migrateSongSpacingPrefs();
    const second = await migrateSongSpacingPrefs();
    expect(second.migrated).toBe(false);
    expect(second.carried).toEqual([]);
  });

  it('does not re-run after the flag is set, even with prefs present', async () => {
    await setPref(PREF_SONG_PREFS_MIGRATED, true);
    await setPref(PREF_GRACE_DAYS, 21);
    const r = await migrateSongSpacingPrefs();
    expect(r.migrated).toBe(false);
    expect((await getSpacingSettings()).graceDays).toBe(SPACING_DEFAULTS.graceDays);
  });
});
