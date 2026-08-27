/**
 * Repertoire's view of the spacing tree's Songs row.
 *
 * =====================================================================
 * THESE NUMBERS NO LONGER LIVE HERE. THEY LIVE ON THE SPACING PAGE.
 *
 * Four prefs used to be stored under this module — first interval,
 * longest interval, due-soon and grace — and edited from a section in
 * the settings modal. They are now the Songs row of the spacing tree,
 * which is the one place any timing number is set for anything.
 *
 * This file stays as the ADAPTER. Half a dozen repertoire and
 * dashboard surfaces already take a `SongKeySpacingSettings` and a
 * `DueWindows`, and rewriting all of them to resolve the tree
 * themselves would spread the tree's shape across the app for no gain.
 * They keep their shape; it is filled from the tree instead.
 *
 * WHAT WENT WITH THE PREFS. `boundsFrom` and `intervalSequence` are
 * gone. `boundsFrom` fed `recordEngagement`'s per-caller override,
 * which stopped being read when the two-stage engine landed and had
 * been silently doing nothing since; the Songs row replaces it.
 * `intervalSequence` drew the old settings section's read-out, and the
 * spacing page draws the real per-band sequences from the engine
 * itself.
 * =====================================================================
 */

import { getPref, setPref } from '../../lib/userPrefs';
import { ACCURACY_BANDS } from '../../lib/spacing/bands';
import { loadOverrides, saveOverrides, settingsForCard } from '../../lib/spacing/store';
import type { PartialSpacingSettings } from '../../lib/spacing/settings';
import type { DueWindows } from './matrix/keySpacing';

/** The tree node these numbers belong to. */
export const SONGS_NODE_ID = 'repertoire';

/** Any itemRef under repertoire resolves to the same Songs row. */
const ANY_SONG_ITEM = 'songkey:any';

// The four retired pref keys. Read once by the migration below, never
// written again.
export const PREF_FIRST_INTERVAL_DAYS = 'songKeyFirstIntervalDays';
export const PREF_LONGEST_INTERVAL_DAYS = 'songKeyLongestIntervalDays';
export const PREF_DUE_SOON_DAYS = 'songKeyDueSoonDays';
export const PREF_GRACE_DAYS = 'songKeyGraceDays';
export const PREF_SONG_PREFS_MIGRATED = 'songKeySpacingMovedToTree';

export interface SongKeySpacingSettings {
  firstIntervalDays: number;
  longestIntervalDays: number;
  dueSoonDays: number;
  graceDays: number;
}

/** The shipped values, read from the tree's own defaults so there is
 *  no second copy of any of them. */
export const SPACING_DEFAULTS: SongKeySpacingSettings = fromTree(
  settingsForCard('repertoire', ANY_SONG_ITEM, {}),
);

function fromTree(s: ReturnType<typeof settingsForCard>): SongKeySpacingSettings {
  return {
    firstIntervalDays: s.maintaining.firstWaitDays,
    // The top of the ladder. There is no single ceiling any more — a
    // song key is capped by the band it is in — so the highest one is
    // what "the most time that can ever pass" now means.
    longestIntervalDays: Math.max(
      ...ACCURACY_BANDS.map(b => s.maintaining.perBand[b.id].ceilingDays),
    ),
    dueSoonDays: s.stale.dueSoonDays,
    graceDays: s.stale.graceDays,
  };
}

export async function getSpacingSettings(): Promise<SongKeySpacingSettings> {
  const overrides = await loadOverrides();
  return fromTree(settingsForCard('repertoire', ANY_SONG_ITEM, overrides));
}

export function windowsFrom(settings: SongKeySpacingSettings): DueWindows {
  return {
    dueSoonDays: settings.dueSoonDays,
    graceDays: settings.graceDays,
  };
}

/**
 * Carry the four retired prefs onto the Songs row, once.
 *
 * =====================================================================
 * ONLY WHAT WAS ACTUALLY CHANGED IS CARRIED.
 *
 * A pref that never left its default is not a preference, it is the
 * default — writing it onto the Songs row as an override would mark
 * the row "changed" forever and pin it against any future change to
 * the shipped value. So each is compared to what it used to default to
 * and skipped when it matches.
 *
 * The old longest-interval was ONE ceiling for every key regardless of
 * how well it was known. There is no single field for it now, so a
 * customised value lands on the top band and the three below it keep
 * the shipped ladder — the reader asked for a maximum, and Mastered is
 * where the maximum lives.
 * =====================================================================
 */
export async function migrateSongSpacingPrefs(): Promise<{
  migrated: boolean;
  carried: string[];
}> {
  if (await getPref<boolean>(PREF_SONG_PREFS_MIGRATED, false)) {
    return { migrated: false, carried: [] };
  }

  const [first, longest, dueSoon, grace] = await Promise.all([
    getPref<number | null>(PREF_FIRST_INTERVAL_DAYS, null),
    getPref<number | null>(PREF_LONGEST_INTERVAL_DAYS, null),
    getPref<number | null>(PREF_DUE_SOON_DAYS, null),
    getPref<number | null>(PREF_GRACE_DAYS, null),
  ]);

  // What these used to default to, before the tree existed.
  const OLD_DEFAULTS = { first: 2, longest: 30, dueSoon: 7, grace: 7 };
  const usable = (v: number | null) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.round(v) : null;

  const carried: string[] = [];
  const patch: PartialSpacingSettings = {};

  const f = usable(first);
  if (f !== null && f !== OLD_DEFAULTS.first) {
    patch.maintaining = { ...patch.maintaining, firstWaitDays: f };
    carried.push('comes back in');
  }
  const l = usable(longest);
  if (l !== null && l !== OLD_DEFAULTS.longest) {
    patch.maintaining = {
      ...patch.maintaining,
      perBand: { mastered: { ceilingDays: l } },
    };
    carried.push('longest ceiling');
  }
  const d = usable(dueSoon);
  if (d !== null && d !== OLD_DEFAULTS.dueSoon) {
    patch.stale = { ...patch.stale, dueSoonDays: d };
    carried.push('due soon');
  }
  const g = usable(grace);
  if (g !== null && g !== OLD_DEFAULTS.grace) {
    patch.stale = { ...patch.stale, graceDays: g };
    carried.push('grace after due');
  }

  if (carried.length > 0) {
    const overrides = await loadOverrides();
    overrides[SONGS_NODE_ID] = { ...overrides[SONGS_NODE_ID], ...patch };
    await saveOverrides(overrides);
  }
  await setPref(PREF_SONG_PREFS_MIGRATED, true);
  return { migrated: true, carried };
}
