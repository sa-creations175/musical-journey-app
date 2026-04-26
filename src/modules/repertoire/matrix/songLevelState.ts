import type { SongCell, SongKey } from '../../../lib/db';

/**
 * Song-level state per SONG_PROGRESSION_DESIGN_3.md lines 276-283.
 * Derived from the matrix at read time — never stored.
 *
 *   Internalized — 3+ keys at Solid AND lived-with gate satisfied
 *                  AND none lapsed
 *   Solid        — original key is Solid
 *   Cross-key    — original key Comfortable or Solid AND any
 *                  non-original key has cells
 *   Comfortable  — original key Comfortable AND no non-original
 *                  cells
 *   Learning     — fallthrough; %% = cells comfortable in original
 *                  / total sections
 *
 * Cross-key %% can also accrue alongside Learning when non-original
 * cells exist while the original key is still Learning (per spec
 * note line 283). The shape returned reflects that: we always
 * compute crossKeyPercent and let the consumer decide whether to
 * display it for a given top-level state.
 */

export type SongLevelStateName =
  | 'learning'
  | 'comfortable'
  | 'solid'
  | 'cross_key'
  | 'internalized';

export interface SongLevelState {
  state: SongLevelStateName;
  /** Percent (0–100) of original-key cells at 'comfortable'. Always
   *  computed; meaningful primarily when state === 'learning'. */
  learningPercent: number;
  /** Percent (0–100) of non-original-key cells at 'comfortable',
   *  denominated by 11 keys × total sections per the cross-key
   *  formula on spec line 47. Always computed; meaningful when
   *  state === 'cross_key' OR (state === 'learning' AND value > 0). */
  crossKeyPercent: number;
  /** Number of keys currently at Solid (not lapsed). Surfaced for
   *  the header summary; the Internalized gate check uses this. */
  solidKeyCount: number;
}

/** Spec section "Internalized gate":
 *    - 3 or more keys are at Solid
 *    - Lived-with gate satisfied per key (>= 5 sessions in a rolling
 *      14-day window)
 *    - Decay has not lapsed any of those keys back below Solid
 *
 *  In step 3a there's no engagement data yet for migrated songs, so
 *  the lived-with check returns false for them and song-level state
 *  caps at Solid. Honest stance per spec — the user earns
 *  Internalized through fresh practice, not by virtue of migration. */
function isLivedWith(key: SongKey): boolean {
  return key.livedWithSessionsInWindow >= 5;
}

function isSolidNotLapsed(key: SongKey): boolean {
  return key.keyState === 'solid' && key.solidDecayState !== 'lapsed';
}

export function computeSongLevelState(
  songKeys: ReadonlyArray<SongKey>,
  songCells: ReadonlyArray<SongCell>,
  totalSections: number,
): SongLevelState {
  const originalKey = songKeys.find(k => k.isOriginalKey) ?? null;
  const nonOriginalKeyIds = new Set(
    songKeys.filter(k => !k.isOriginalKey).map(k => k.id),
  );

  const originalKeyCells = originalKey
    ? songCells.filter(c => c.songKeyId === originalKey.id)
    : [];
  const nonOriginalKeyCells = songCells.filter(c => nonOriginalKeyIds.has(c.songKeyId));

  const originalComfortable = originalKeyCells.filter(c => c.cellState === 'comfortable').length;
  const nonOriginalComfortable = nonOriginalKeyCells.filter(c => c.cellState === 'comfortable').length;

  const learningPercent = totalSections > 0
    ? Math.round((originalComfortable / totalSections) * 100)
    : 0;
  // Cross-key denominator is 11 (non-original keys) × totalSections,
  // per the spec's tunable parameters table.
  const crossKeyDenominator = totalSections > 0 ? 11 * totalSections : 0;
  const crossKeyPercent = crossKeyDenominator > 0
    ? Math.round((nonOriginalComfortable / crossKeyDenominator) * 100)
    : 0;

  const solidKeys = songKeys.filter(isSolidNotLapsed);
  const solidLivedWithKeys = solidKeys.filter(isLivedWith);
  const internalized = solidLivedWithKeys.length >= 3;

  const state = ((): SongLevelStateName => {
    if (internalized) return 'internalized';
    if (originalKey?.keyState === 'solid') return 'solid';
    // After the early-return above, the original key can no longer
    // be 'solid'; TS narrows accordingly. Spec's "Cross-key" rule
    // is "original Comfortable OR Solid" — the Solid arm is already
    // handled, so checking 'comfortable' alone covers what reaches
    // this point.
    if (originalKey?.keyState === 'comfortable' && nonOriginalKeyCells.length > 0) {
      return 'cross_key';
    }
    if (originalKey?.keyState === 'comfortable') return 'comfortable';
    return 'learning';
  })();

  return {
    state,
    learningPercent,
    crossKeyPercent,
    solidKeyCount: solidKeys.length,
  };
}

/** Display label for the song-level state pill. */
export function songLevelStateLabel(state: SongLevelStateName): string {
  switch (state) {
    case 'learning':     return 'Learning';
    case 'comfortable':  return 'Comfortable';
    case 'solid':        return 'Solid';
    case 'cross_key':    return 'Cross-key';
    case 'internalized': return 'Internalized';
  }
}
