import type { SongCell, SongKey } from '../../../lib/db';
import { computeSolidDecayState } from './solidDecay';

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
 *
 * ---------------------------------------------------------------
 * "HAS CELLS" IS NOT "HAS PRACTISED"
 *
 * The spec sentence above says Cross-key means "any non-original key
 * has cells", and this file used to implement it literally, as
 * `nonOriginalKeyCells.length > 0`. That held only while cells were
 * created one key at a time by an explicit user choice — the row
 * existing WAS the choice.
 *
 * It stops holding the moment the matrix materialises all 12 keys
 * up front: every song would read Cross-key the instant its original
 * key reached Comfortable, having never been played in another key.
 * The distinction the state machine actually wants is ENGAGEMENT, so
 * that is what `isCellEngaged` encodes, and the spec's wording is
 * read as intent rather than as a predicate.
 * ---------------------------------------------------------------
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

/**
 * Whether a cell represents practice that actually happened.
 *
 * A materialised cell starts `empty` with `lastRunAt: null`; both move
 * only through `cellRollup`, i.e. only when the user logs a run-through.
 *
 * Both fields are checked, not just `cellState`: a run-through that
 * wasn't clean sets `lastRunAt` while leaving the state at `empty`
 * (see applyAttemptsToCell). That is still engagement — the user
 * played it — and counting it as untouched would under-report exactly
 * the cells they are working hardest on.
 *
 * Exported as the single definition of "engaged" so the state machine
 * and the cross-key prompt cannot drift apart on it.
 */
export function isCellEngaged(cell: SongCell): boolean {
  return cell.cellState !== 'empty' || cell.lastRunAt !== null;
}

/**
 * Whether a key row represents practice that actually happened —
 * the signal behind the matrix's row dimming.
 *
 * Was `songKey !== null` inline in KeyRow. Row existence answered
 * "is this key in the grid", which after materialisation is true for
 * all 12; every row would un-dim and the grid would lose the only
 * at-a-glance mark of where the user has actually been.
 *
 * `keyState` moves only through cellRollup, so it is the state
 * machine's own answer to the same question. Lifted out of the
 * component so it can be tested on the predicate rather than on
 * rendered output — a count of rows would pass either way.
 */
export function isKeyRowEngaged(songKey: SongKey | null): boolean {
  return songKey !== null && songKey.keyState !== 'not_started';
}

/**
 * Whether the user has practised this song in any key other than the
 * original — the real signal behind both the Cross-key state and the
 * cross-key expansion prompt.
 *
 * Deliberately derived from CELLS rather than from the existence of
 * `songKeys` rows: after full materialisation every song has 12 key
 * rows, so counting rows would answer "does the grid exist", not
 * "have they gone cross-key".
 */
export function hasCrossKeyEngagement(
  songKeys: ReadonlyArray<SongKey>,
  songCells: ReadonlyArray<SongCell>,
): boolean {
  const nonOriginalKeyIds = new Set(
    songKeys.filter(k => !k.isOriginalKey).map(k => k.id),
  );
  if (nonOriginalKeyIds.size === 0) return false;
  return songCells.some(
    c => nonOriginalKeyIds.has(c.songKeyId) && isCellEngaged(c),
  );
}

/** Live-derive lapsed status — the persisted solidDecayState column
 *  can lag behind real time during long unopened windows. In-view
 *  callers always pass `now` so the rollup uses fresh truth rather
 *  than the stale snapshot. */
function isSolidNotLapsed(key: SongKey, now: number): boolean {
  if (key.keyState !== 'solid') return false;
  return computeSolidDecayState(key, now) !== 'lapsed';
}

export function computeSongLevelState(
  songKeys: ReadonlyArray<SongKey>,
  songCells: ReadonlyArray<SongCell>,
  totalSections: number,
  now: number,
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

  const solidKeys = songKeys.filter(k => isSolidNotLapsed(k, now));
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
    // ENGAGED non-original cells, not merely existing ones — see the
    // header note. `nonOriginalKeyCells` is the materialised grid;
    // filtering it is what separates "has 11 other rows" from "has
    // played it in another key".
    if (
      originalKey?.keyState === 'comfortable'
      && nonOriginalKeyCells.some(isCellEngaged)
    ) {
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
