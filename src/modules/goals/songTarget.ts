import type { Goal, Song, SongKey } from '../../lib/db';
import { computeSolidDecayState } from '../repertoire/matrix/solidDecay';
import type { SongLevelStateName } from '../repertoire/matrix/songLevelState';

/**
 * Song-goal targeting helpers. When a goal's related items resolve
 * to a single song, the form swaps the generic items_at_level flow
 * for granularity-aware song targeting (whole song / song section /
 * key).
 *
 * The targeting choice maps onto the existing Goal record fields
 * (`targetMetric`, `targetValue`, `targetUnit`) — no schema change.
 * `targetMetric` is the discriminator; this module owns the string
 * values it can take in song mode.
 *
 * Encoding table:
 *
 *   targetMetric                    targetValue   targetUnit
 *   ─────────────────────────────   ───────────   ──────────────────────
 *   song_whole_at_level             null          'solid'
 *   song_whole_at_level             null          'internalized'
 *   song_whole_at_level             20–100 (%)    'cross_key'
 *   song_key_at_state               null          '<KEY>:<state>'
 *                                                  e.g. 'F:comfortable'
 *   song_section_at_state           null          '<sectionId>:<KEY>:<state>'
 *                                                  e.g.
 *                                                  'sec-7c3:F:comfortable'
 *
 * KEY uses the same human-readable shape stored on Song.key
 * ('C', 'F', 'Bb', 'F#', etc.). State is one of 'comfortable' or
 * 'solid' for key/section scopes.
 *
 * Phase 1.5 step 7 update: the previous Phase 1 helpers
 * (`deriveWholeOptionTags`, `isSolidAchieved`) read from the legacy
 * RepertoireStage — a best-effort approximation that drifted from
 * truth post-migration. Replaced here by `deriveWholeOptionTagsFromMatrix`
 * + `isSolidLockedFromMatrix`, which read directly from the matrix
 * data (songKeys + songLevelState + live decay). Section granularity
 * is also lit up in the same step: encode/decode + preview now know
 * how to round-trip section-level targets through Goal records.
 */

// ---- Metric IDs ----------------------------------------------------

export const SONG_METRIC = {
  WHOLE: 'song_whole_at_level',
  KEY: 'song_key_at_state',
  SECTION: 'song_section_at_state',
} as const;

export type SongMetric = typeof SONG_METRIC[keyof typeof SONG_METRIC];

export function isSongMetric(metric: string | null | undefined): metric is SongMetric {
  return metric === SONG_METRIC.WHOLE
      || metric === SONG_METRIC.KEY
      || metric === SONG_METRIC.SECTION;
}

// ---- Constants -----------------------------------------------------

/** The twelve major keys, ordered by circle of fifths starting at C.
 *  Used for the key picker dropdown in the song-goal modal. */
export const MAJOR_KEYS: readonly string[] = [
  'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F',
];

export type SongGranularity = 'whole' | 'section' | 'key';
export type SongWholeOption = 'solid' | 'cross_key' | 'internalized';
export type SongKeyState = 'comfortable' | 'solid';

/** Cross-key % slider bounds per the addendum spec. */
export const CROSS_KEY_PERCENT_MIN = 20;
export const CROSS_KEY_PERCENT_MAX = 100;
export const CROSS_KEY_PERCENT_STEP = 5;
export const CROSS_KEY_PERCENT_DEFAULT = 50;

// ---- State-tag derivation (matrix-aware) ---------------------------

export type SongStateTag = 'achieved' | 'current' | 'stretch' | null;

export interface WholeOptionTags {
  solid: SongStateTag;
  crossKey: SongStateTag;
  internalized: SongStateTag;
}

/**
 * Live-derive the whole-song option tags from matrix data. Replaces
 * the legacy RepertoireStage approximation.
 *
 *   Solid-in-original-key:
 *     'achieved' when the original key is solid AND not lapsed.
 *     'current' when solid + lapsed (the user has demonstrated solid
 *     in the past but needs a retest pass — setting this goal is
 *     equivalent to "run the retest").
 *     null otherwise.
 *
 *   Cross-key:
 *     'achieved' when songLevelState is 'cross_key' or 'internalized'.
 *     'current' when at 'solid' (next natural milestone is cross-key).
 *     null otherwise.
 *
 *   Internalized:
 *     'achieved' when at 'internalized'.
 *     'current' when at 'solid' or 'cross_key' (working toward it).
 *     'stretch' when below.
 *
 * `originalKey` is the songKeys row with isOriginalKey=true; null
 * when no such row exists yet (untouched migrated song with no
 * promoted original-key data). All-null tags result in that case.
 */
export function deriveWholeOptionTagsFromMatrix(
  songLevelState: SongLevelStateName,
  originalKey: SongKey | null,
  now: number,
): WholeOptionTags {
  const originalKeyIsLapsed = originalKey !== null
    && computeSolidDecayState(originalKey, now) === 'lapsed';

  let solidTag: SongStateTag = null;
  if (originalKey?.keyState === 'solid') {
    solidTag = originalKeyIsLapsed ? 'current' : 'achieved';
  }

  let crossKeyTag: SongStateTag = null;
  if (songLevelState === 'cross_key' || songLevelState === 'internalized') {
    crossKeyTag = 'achieved';
  } else if (songLevelState === 'solid') {
    crossKeyTag = 'current';
  }

  let internalizedTag: SongStateTag;
  if (songLevelState === 'internalized') internalizedTag = 'achieved';
  else if (songLevelState === 'solid' || songLevelState === 'cross_key') internalizedTag = 'current';
  else internalizedTag = 'stretch';

  return { solid: solidTag, crossKey: crossKeyTag, internalized: internalizedTag };
}

/**
 * Lock the Solid-in-original-key option only when the user is
 * already there and not lapsed. Lapsed solid is unlocked because
 * setting "Take to Solid" implicitly = run the retest, which is a
 * meaningful goal.
 */
export function isSolidLockedFromMatrix(
  originalKey: SongKey | null,
  now: number,
): boolean {
  if (!originalKey || originalKey.keyState !== 'solid') return false;
  return computeSolidDecayState(originalKey, now) !== 'lapsed';
}

/**
 * Per-key state hints for the key/section pickers. Keys not yet in
 * songKeys map to 'untouched'; otherwise the live-derived view of
 * keyState (with lapsed surfaced as a flag, since lapsed keys are
 * still keyState='solid' under the hood).
 */
export interface KeyStateHint {
  state: 'untouched' | 'learning' | 'comfortable' | 'solid';
  isLapsed: boolean;
}

export function buildKeyStateHints(
  songKeys: ReadonlyArray<SongKey>,
  now: number,
): Map<string, KeyStateHint> {
  const m = new Map<string, KeyStateHint>();
  for (const k of songKeys) {
    const decay = computeSolidDecayState(k, now);
    const state: KeyStateHint['state'] =
      k.keyState === 'not_started' ? 'untouched' : k.keyState;
    m.set(k.keyName, { state, isLapsed: decay === 'lapsed' });
  }
  return m;
}

// ---- Encode (form state → Goal fields) -----------------------------

export interface SongTargetSelection {
  granularity: SongGranularity;
  wholeOption: SongWholeOption | null;
  crossKeyPercent: number;
  /** Concrete major key, e.g. 'F'. Empty string when unset. Used for
   *  both 'key' and 'section' granularities. */
  keyTarget: string;
  keyState: SongKeyState;
  /** Section ID for 'section' granularity. Empty string when unset
   *  or when granularity is 'whole' / 'key'. */
  sectionId: string;
}

export interface EncodedSongTarget {
  targetMetric: string;
  targetValue: number | null;
  targetUnit: string;
}

/** Encode a fully-specified selection into the Goal record's three
 *  target fields. Returns null when the selection is incomplete (the
 *  caller should disable Save / preview rendering). */
export function encodeSongTarget(sel: SongTargetSelection): EncodedSongTarget | null {
  if (sel.granularity === 'whole') {
    if (sel.wholeOption === 'solid') {
      return { targetMetric: SONG_METRIC.WHOLE, targetValue: null, targetUnit: 'solid' };
    }
    if (sel.wholeOption === 'internalized') {
      return { targetMetric: SONG_METRIC.WHOLE, targetValue: null, targetUnit: 'internalized' };
    }
    if (sel.wholeOption === 'cross_key') {
      return {
        targetMetric: SONG_METRIC.WHOLE,
        targetValue: clampCrossKeyPercent(sel.crossKeyPercent),
        targetUnit: 'cross_key',
      };
    }
    return null;
  }
  if (sel.granularity === 'key') {
    if (!sel.keyTarget) return null;
    return {
      targetMetric: SONG_METRIC.KEY,
      targetValue: null,
      targetUnit: `${sel.keyTarget}:${sel.keyState}`,
    };
  }
  if (sel.granularity === 'section') {
    if (!sel.sectionId || !sel.keyTarget) return null;
    return {
      targetMetric: SONG_METRIC.SECTION,
      targetValue: null,
      targetUnit: `${sel.sectionId}:${sel.keyTarget}:${sel.keyState}`,
    };
  }
  return null;
}

function clampCrossKeyPercent(p: number): number {
  if (!Number.isFinite(p)) return CROSS_KEY_PERCENT_DEFAULT;
  if (p < CROSS_KEY_PERCENT_MIN) return CROSS_KEY_PERCENT_MIN;
  if (p > CROSS_KEY_PERCENT_MAX) return CROSS_KEY_PERCENT_MAX;
  return Math.round(p / CROSS_KEY_PERCENT_STEP) * CROSS_KEY_PERCENT_STEP;
}

// ---- Decode (Goal fields → form state) -----------------------------

/** Decode an existing Goal record's target fields back into the
 *  song-mode form state. Returns null when the goal isn't a song-mode
 *  goal (caller falls back to generic flow). */
export function decodeSongTarget(goal: Goal): SongTargetSelection | null {
  if (!isSongMetric(goal.targetMetric)) return null;

  if (goal.targetMetric === SONG_METRIC.WHOLE) {
    const unit = goal.targetUnit ?? '';
    if (unit === 'solid') {
      return baseSelection({ granularity: 'whole', wholeOption: 'solid' });
    }
    if (unit === 'internalized') {
      return baseSelection({ granularity: 'whole', wholeOption: 'internalized' });
    }
    if (unit === 'cross_key') {
      const pct = goal.targetValue ?? CROSS_KEY_PERCENT_DEFAULT;
      return baseSelection({
        granularity: 'whole',
        wholeOption: 'cross_key',
        crossKeyPercent: clampCrossKeyPercent(pct),
      });
    }
    return baseSelection({ granularity: 'whole' });
  }

  if (goal.targetMetric === SONG_METRIC.KEY) {
    const [key, state] = (goal.targetUnit ?? '').split(':');
    return baseSelection({
      granularity: 'key',
      keyTarget: key ?? '',
      keyState: state === 'solid' ? 'solid' : 'comfortable',
    });
  }

  if (goal.targetMetric === SONG_METRIC.SECTION) {
    const [sectionId, key, state] = (goal.targetUnit ?? '').split(':');
    return baseSelection({
      granularity: 'section',
      sectionId: sectionId ?? '',
      keyTarget: key ?? '',
      keyState: state === 'solid' ? 'solid' : 'comfortable',
    });
  }

  return null;
}

function baseSelection(over: Partial<SongTargetSelection>): SongTargetSelection {
  return {
    granularity: 'whole',
    wholeOption: null,
    crossKeyPercent: CROSS_KEY_PERCENT_DEFAULT,
    keyTarget: '',
    keyState: 'comfortable',
    sectionId: '',
    ...over,
  };
}

// ---- Preview / display ---------------------------------------------

interface PreviewSong {
  title: string;
  key?: string;
  /** Section names indexed by id. Required for section-level
   *  preview; ignored otherwise. Falls back to "a section" when
   *  the id can't be resolved. */
  sectionNamesById?: ReadonlyMap<string, string>;
}

/**
 * Render the natural-language preview for a song-mode goal. Returns
 * null when the selection isn't fully specified.
 *
 * Examples:
 *   "Take Mirror to Solid in C"
 *   "Take Mirror to Cross-key 50%"
 *   "Take Mirror to Internalized"
 *   "Get Mirror Comfortable in F"
 *   "Get Mirror Solid in F"
 *   "Get the Bridge of Mirror Comfortable in F"
 */
export function previewSongTarget(
  sel: SongTargetSelection,
  song: PreviewSong,
): string | null {
  const title = song.title || 'this song';
  const originalKey = song.key && song.key.trim() !== '' ? song.key : 'the original key';

  if (sel.granularity === 'whole') {
    if (sel.wholeOption === 'solid') {
      return `Take ${title} to Solid in ${originalKey}`;
    }
    if (sel.wholeOption === 'internalized') {
      return `Take ${title} to Internalized`;
    }
    if (sel.wholeOption === 'cross_key') {
      const pct = clampCrossKeyPercent(sel.crossKeyPercent);
      return `Take ${title} to Cross-key ${pct}%`;
    }
    return null;
  }
  if (sel.granularity === 'key') {
    if (!sel.keyTarget) return null;
    const stateLabel = sel.keyState === 'solid' ? 'Solid' : 'Comfortable';
    return `Get ${title} ${stateLabel} in ${sel.keyTarget}`;
  }
  if (sel.granularity === 'section') {
    if (!sel.sectionId || !sel.keyTarget) return null;
    const sectionName = song.sectionNamesById?.get(sel.sectionId) ?? 'a section';
    const stateLabel = sel.keyState === 'solid' ? 'Solid' : 'Comfortable';
    return `Get the ${sectionName} of ${title} ${stateLabel} in ${sel.keyTarget}`;
  }
  return null;
}

/**
 * Build a goal-summary string for an arbitrary song-mode Goal record
 * — used by Goals home (`describeGoalTarget`) when the optional song
 * lookup is available. When no song record is supplied, falls back to
 * a generic phrasing without the song title or original-key value.
 */
export function describeSongGoalTarget(
  goal: Goal,
  song?: Pick<Song, 'title' | 'key'>,
): string | null {
  const sel = decodeSongTarget(goal);
  if (!sel) return null;
  if (song) {
    return previewSongTarget(sel, song);
  }
  // Generic fallback when the caller didn't resolve the song record
  // (e.g. song was deleted). Keeps the line readable without a name.
  if (sel.granularity === 'whole') {
    if (sel.wholeOption === 'solid') return 'Take song to Solid in original key';
    if (sel.wholeOption === 'internalized') return 'Take song to Internalized';
    if (sel.wholeOption === 'cross_key') {
      return `Take song to Cross-key ${clampCrossKeyPercent(sel.crossKeyPercent)}%`;
    }
  }
  if (sel.granularity === 'key' && sel.keyTarget) {
    const stateLabel = sel.keyState === 'solid' ? 'Solid' : 'Comfortable';
    return `Get song ${stateLabel} in ${sel.keyTarget}`;
  }
  if (sel.granularity === 'section' && sel.sectionId && sel.keyTarget) {
    const stateLabel = sel.keyState === 'solid' ? 'Solid' : 'Comfortable';
    return `Get a section of song ${stateLabel} in ${sel.keyTarget}`;
  }
  return null;
}
