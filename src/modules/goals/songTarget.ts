import type { Goal, RepertoireStage, Song } from '../../lib/db';

/**
 * Song-goal targeting helpers (Phase 1 song-goal addendum, April 26,
 * 2026). When a goal's related items resolve to a single song, the
 * form swaps the generic items_at_level flow for granularity-aware
 * song targeting (whole song / song section / key).
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
 *                                                  (Phase 1.5 — UI disabled
 *                                                   in Phase 1)
 *
 * KEY uses the same human-readable shape stored on Song.key
 * ('C', 'F', 'Bb', 'F#', etc.). State is one of 'comfortable' or
 * 'solid' for key/section scopes.
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

// ---- State-tag derivation (best-effort from RepertoireStage) -------

/**
 * Phase 1 maps the legacy `RepertoireStage` (`learning` / `comfortable`
 * / `cross-key` / `internalized` / `maintenance`) to the addendum's
 * five-level song vocabulary as faithfully as possible:
 *
 *   learning      → still working sections; below Solid
 *   comfortable   → ambiguous (sections may be solid OR whole-song
 *                   may be solid); treated as below Solid for tag
 *                   purposes so users aren't blocked from setting a
 *                   Solid-in-original-key goal
 *   cross-key     → at or beyond Solid; user is currently working
 *                   across keys (Cross-key is "current")
 *   internalized  → at or beyond Cross-key 100%
 *   maintenance   → at or beyond Internalized
 *
 * The Song Progression Redesign (Phase 1.5) replaces this best-effort
 * mapping with a precise model. Until then, this is the honest read
 * we can offer.
 */
export type SongStateTag = 'achieved' | 'current' | 'stretch' | null;

interface WholeOptionTags {
  solid: SongStateTag;
  crossKey: SongStateTag;
  internalized: SongStateTag;
}

export function deriveWholeOptionTags(stage: RepertoireStage | undefined): WholeOptionTags {
  switch (stage) {
    case 'maintenance':
    case 'internalized':
      return { solid: 'achieved', crossKey: 'achieved', internalized: 'achieved' };
    case 'cross-key':
      // At Solid; actively working across keys; Internalized is far off.
      return { solid: 'achieved', crossKey: 'current', internalized: 'stretch' };
    case 'learning':
    case 'comfortable':
    case undefined:
    default:
      // Below Solid; everything is forward-looking. Solid is the
      // honest next milestone (no tag); Internalized is a stretch.
      return { solid: null, crossKey: null, internalized: 'stretch' };
  }
}

/** Whether a Solid-in-original-key target should be unselectable
 *  because the song is already there. */
export function isSolidAchieved(stage: RepertoireStage | undefined): boolean {
  return stage === 'cross-key' || stage === 'internalized' || stage === 'maintenance';
}

// ---- Encode (form state → Goal fields) -----------------------------

export interface SongTargetSelection {
  granularity: SongGranularity;
  wholeOption: SongWholeOption | null;
  crossKeyPercent: number;
  /** Concrete major key, e.g. 'F'. Empty string when unset. */
  keyTarget: string;
  keyState: SongKeyState;
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
  // section: UI is disabled in Phase 1; never reaches here.
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

  // SECTION: ignored in Phase 1 (no UI). Caller will fall back to
  // generic display in describeGoal.
  return null;
}

function baseSelection(over: Partial<SongTargetSelection>): SongTargetSelection {
  return {
    granularity: 'whole',
    wholeOption: null,
    crossKeyPercent: CROSS_KEY_PERCENT_DEFAULT,
    keyTarget: '',
    keyState: 'comfortable',
    ...over,
  };
}

// ---- Preview / display ---------------------------------------------

interface PreviewSong {
  title: string;
  key?: string;
}

/**
 * Render the natural-language preview for a song-mode goal. Returns
 * null when the selection isn't fully specified.
 *
 * Examples (per addendum):
 *   "Take Mirror to Solid in C"
 *   "Take Mirror to Cross-key 50%"
 *   "Take Mirror to Internalized"
 *   "Get Mirror Comfortable in F"
 *   "Get Mirror Solid in F"
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
  return null;
}
