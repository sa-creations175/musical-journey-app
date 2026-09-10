/**
 * Tier unlock for ear-training scales/modes. Mirrors the
 * chord-recognition tierUnlock.ts architecture — same thresholds (see
 * `lib/ratingRules`), same staged-introduction batch (3 fresh items
 * per tier per session), same `'introduced' = has a spacingState row`
 * signal. Chord progressions had a third implementation of it until
 * 10 Sep 2026, when that ladder was retired.
 *
 * =====================================================================
 * TIER LAYOUT (catalog-tagged via `Mode.stage`), RULED 10 SEP 2026.
 *
 *   Tier 1: Ionian, Aeolian, harmonic minor, melodic minor
 *   Tier 2: Dorian, Mixolydian, Lydian, Phrygian, Locrian
 *
 * It was the seven modes of the major scale in Tier 1 with the two
 * minors held back — which put Locrian, a mode almost nothing is
 * written in, ahead of the natural minor. Tier 1 is now the four
 * scales a player already lives in; Tier 2 introduces the rest,
 * brightest and most-used first.
 *
 * The FIELD is still called `stage`; a reader sees Tier.
 * =====================================================================
 *
 * Cross-submodule gate: Tier 1 is locked behind chord-recognition
 * Tier 1 being CLEARED (CR's `unlockedTier >= 2`).
 *
 * itemRef format quirk: scales-modes records attempts AND
 * spacingState rows against `${mode.id}-tab1` (HearScaleTab) and
 * `${mode.id}-tab2` (SitInsideTab) — NOT bare mode IDs. The
 * tier system aggregates the two tab variants per mode for unlock
 * stats (a mode clears on its ≥10 COMBINED attempts, not on each of
 * the 14 mode×tab cells separately). The eligible set returned for the
 * candidates filter emits BOTH variant forms (`mode-tab1`,
 * `mode-tab2`) so spacingState rows match cleanly downstream.
 */
import { db, type SpacingState } from '../../../lib/db';
import { MODES, MAX_SCALE_MODE_STAGE, type ScaleModeStage, type ModeId } from './catalog';
import {
  isSubmoduleGated,
  loadEtSubmoduleStatus,
  maxAllowedScaleModesStage,
} from '../etStageGate';
import { feelOfAttempt } from '../../../lib/earTraining/heardFeel';
import { CLEAN_FEEL } from '../../../lib/fluencyScale';
import { itemsToClear, ratingRules } from '../../../lib/ratingRules';

const MODULE_REF = 'scales-modes';


/**
 * The bar a tier opens at, and what counts as clearing it.
 *
 * =====================================================================
 * A PASS IS RIGHT WITHOUT AN AID, AND THE BAR IS FLUENT'S.
 *
 * Silas's ruling of 10 Sep 2026. An attempt passes for unlocking if it
 * was right and no aid was taken — In flow (100) or Clean (75) on the
 * four-step scale. Replays are allowed: needing to hear it again is
 * slower, not wrong. Working on it (50) and Struggled (25) do not pass,
 * so a card answered with the bass soloed, or the right progression
 * from the wrong position, no longer opens anything.
 *
 * The threshold moves 75% → 80%, which is the same bar the Fluent
 * rating is drawn at. One number for "good enough", across the app.
 *
 * ROWS WITH NO RATING READ AS THE TWO ENDS OF THE SCALE — In flow for a
 * right answer, Struggled for a wrong one — so for a history written
 * before today the rule is exactly what it always was, and only the
 * threshold moved. Silas accepted that ladders may drop.
 * =====================================================================
 */
/**
 * The two numbers a clear is measured by, READ AT CALL TIME.
 *
 * Editable on the Settings page since 10 Sep 2026, so a module-level
 * `const` would freeze whatever was in force when the file was first
 * imported and the page's own promise — "a change re-grades on next
 * read" — would be false for every ladder.
 */
function clearBar() {
  const r = ratingRules();
  return { attempts: r.itemClearAttempts, accuracy: r.fluentFloor };
}

const STAGED_INTRODUCTION_BATCH_SIZE = 3;

export interface ItemStats {
  /** How many of the window's attempts PASSED — right, and no aid
   *  taken. Not the same as how many were right: an answer that needed
   *  the bass soloed is right and does not pass. */
  passes: number;
  total: number;
}

/** Strip the `-tab1` / `-tab2` suffix so per-tab attempts roll up
 *  to a single per-mode bucket. Mirrors how the user-facing spec
 *  ("Tier 2 unlocks when 80% of Tier 1's items meet the threshold")
 *  treats one mode as one item regardless of how many drill surfaces
 *  it has. */
function bareIdOf(attemptItemId: string): string {
  return attemptItemId.replace(/-tab[12]$/, '');
}

/** Walk lifetime attempts in db.attempts and produce per-mode-id
 *  correct/total tallies. `excludeFromFluency` rows skip per the
 *  chord-recognition convention. */
async function loadLifetimeStats(): Promise<Map<string, ItemStats>> {
  const attempts = await db.attempts.where('moduleId').equals(MODULE_REF).toArray();
  const stats = new Map<string, ItemStats>();
  for (const a of attempts) {
    if (a.excludeFromFluency) continue;
    const id = bareIdOf(a.itemId);
    const cur = stats.get(id) ?? { passes: 0, total: 0 };
    cur.total += 1;
    if (feelOfAttempt(a) >= CLEAN_FEEL) cur.passes += 1;
    stats.set(id, cur);
  }
  return stats;
}

/** Mode IDs in catalog declaration order for a given stage. Used
 *  both by the unlock walk and the staged-introduction batch so
 *  the order is deterministic across renders. */
export function modesForStage(stage: ScaleModeStage): ModeId[] {
  return MODES.filter(m => m.stage === stage).map(m => m.id);
}

/** Convert a bare mode ID to BOTH per-tab variant forms — what
 *  the spacingState rows + candidates.ts comparison consume. */
function variantsFor(modeId: string): string[] {
  return [`${modeId}-tab1`, `${modeId}-tab2`];
}

/** Pure unlock walk. Public so tests can pass fixture stats. Stage
 *  1 is the floor; cross-submodule gate (CR T1 cleared) is enforced
 *  separately at the integration layer. */
export function computeUnlockedScaleModesStage(
  statsByModeId: ReadonlyMap<string, ItemStats>,
): ScaleModeStage {
  let unlocked: ScaleModeStage = 1;
  for (let stage = 1; stage < MAX_SCALE_MODE_STAGE; stage++) {
    const items = modesForStage(stage as ScaleModeStage);
    if (items.length === 0) continue;
    // EIGHTY PER CENT OF THE ITEMS, NOT ALL OF THEM. Ruled 10 Sep
    // 2026; the share and its rounding are `ratingRules`'.
    const cleared = items.filter(id => {
      const s = statsByModeId.get(id);
      if (!s) return false;
      if (s.total < clearBar().attempts) return false;
      return s.passes / s.total >= clearBar().accuracy;
    }).length;
    if (cleared < itemsToClear(items.length)) break;
    unlocked = (stage + 1) as ScaleModeStage;
  }
  return unlocked;
}

/** Highest stage unlocked from scales-modes alone (no cross-
 *  submodule gate). DB-aware wrapper around computeUnlockedScaleModesStage. */
export async function getUnlockedScaleModesStage(): Promise<ScaleModeStage> {
  const stats = await loadLifetimeStats();
  return computeUnlockedScaleModesStage(stats);
}

/**
 * Eligible per-tab itemRefs for a session. Pure — caller supplies
 * the spacingState rows used for the introduced signal.
 *
 * Composition mirrors chord-recognition / chord-progressions:
 *   · review pool — introduced items from stages below unlocked
 *   · current stage introduced items
 *   · up to 3 fresh items from the current stage
 *
 * "Introduced" for a mode = at least one of its per-tab variants
 * has a spacingState row. Once introduced, BOTH per-tab variants
 * surface so the mode shows up in either drill surface.
 */
export function getEligibleScaleModeItems(
  unlockedStage: ScaleModeStage,
  spacingStateRows: ReadonlyArray<SpacingState>,
): string[] {
  const introducedModes = new Set<string>();
  for (const row of spacingStateRows) {
    if (row.moduleRef !== MODULE_REF) continue;
    introducedModes.add(bareIdOf(row.itemRef));
  }

  const out: string[] = [];
  const push = (id: string) => {
    for (const v of variantsFor(id)) out.push(v);
  };

  // (1) Review pool — earlier stages, introduced modes only.
  for (let stage = 1; stage < unlockedStage; stage++) {
    for (const id of modesForStage(stage as ScaleModeStage)) {
      if (introducedModes.has(id)) push(id);
    }
  }

  // (2) Current stage — introduced always; fresh staged to BATCH_SIZE.
  const current = modesForStage(unlockedStage);
  const fresh: string[] = [];
  for (const id of current) {
    if (introducedModes.has(id)) push(id);
    else fresh.push(id);
  }
  for (const id of fresh.slice(0, STAGED_INTRODUCTION_BATCH_SIZE)) push(id);

  return out;
}

/**
 * Cross-submodule gate. Delegates to `etStageGate.ts` so the gate
 * rules live in one place. Scales-modes Stage 2 is gated behind ET
 * Stage 3 — chord-recognition Tier 2 cleared — even after scales-modes
 * Stage 1 is earned within the submodule. It used to require a
 * progressions stage as well; that ladder retired on 10 Sep 2026.
 */
export async function loadScaleModesEligibleSet(
  spacingRows: ReadonlyArray<SpacingState>,
): Promise<ReadonlySet<string>> {
  const status = await loadEtSubmoduleStatus();
  if (isSubmoduleGated(status)) return new Set<string>();
  const earned = await getUnlockedScaleModesStage();
  const ceiling = maxAllowedScaleModesStage(status);
  const effective = Math.min(earned, ceiling) as ScaleModeStage;
  return new Set(getEligibleScaleModeItems(effective, spacingRows));
}

export { MODULE_REF as SCALES_MODES_MODULE_REF };
export {
  clearBar,
  STAGED_INTRODUCTION_BATCH_SIZE,
};
