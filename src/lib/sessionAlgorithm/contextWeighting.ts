/**
 * Phase 4 Step 5 — Context-aware session arcs.
 *
 * Two pieces:
 *
 *   isModuleAllowedForContext(moduleRef, context) — hard filter.
 *     Extends Phase 3's "shapes excluded under non-keys" rule with
 *     a new "HF + ET + Production excluded under keys/mixed" rule.
 *     Keys/mixed sessions are physical-instrument time: the algorithm
 *     should only surface Shapes & Patterns and Repertoire by
 *     default, leaving the cognitive modules (HF flashcards, ET ear
 *     quizzes, Production conceptual work) for laptop/phone arcs.
 *     User can still manually add an excluded module via the
 *     "+ Add module" affordance — the hard filter only governs what
 *     the algorithm proposes on its own.
 *
 *   contextFactorForModule(moduleRef, context) — per-block weight
 *     multiplier. Tunes the relative priority of modules that DO
 *     pass the hard filter. Laptop foregrounds Production with a
 *     moderate lift on HF + chord-progressions review; phone
 *     foregrounds all HF/ET cards (compact + commute-friendly) with
 *     a softer Production weight; keys leaves everything that passes
 *     the filter at neutral.
 *
 * Both helpers are pure. The session generator calls
 * isModuleAllowedForContext during the row hard-filter step, and
 * applies contextFactorForModule as a per-block multiplier after
 * per-item weighting + alongside the weekly-pace multiplier.
 */

import type { PracticeSessionContext } from '../db';
import { ET_MODULE_REFS, SHAPES_MODULE_REF } from '../../modules/goals/progress';
import {
  CONTEXT_FACTOR_NEUTRAL,
  FULL_FACTORS,
  KEYS_DEFAULT_ALLOWED_MODULES,
  KEYS_FACTORS,
  LAPTOP_FACTORS,
  PHONE_FACTORS,
} from './sessionDesign';

// Re-export the weight constants moved to sessionDesign.ts so
// downstream callers keep their existing import paths.
export { CONTEXT_FACTOR_NEUTRAL };

/**
 * True when the module is eligible to surface in the proposal for
 * the user's current context — combining the new keys/mixed
 * allowlist with the existing "non-keys excludes shapes physical
 * drills" rule. Returns true for any context/module combo not
 * covered by the exclusions.
 *
 * Filter rules:
 *
 *   keys → only Shapes + Repertoire pass; HF, all ET subs,
 *          Production are excluded by default (user can manually
 *          add via + Add module).
 *
 *   laptop / phone → Shapes excluded (physical-keys-only — same
 *                    rule the Phase 3 filter ships); everything
 *                    else passes the hard filter (weighting takes
 *                    over from there).
 *
 *   full → no hard filter. Keyboard is available so S&P and
 *          Repertoire pass; the user is also in front of a
 *          laptop/phone so HF, ET, Production pass too. Block
 *          ordering puts keyboard work first ("keys first, then
 *          everything") — that ordering lives in sequenceBlocks.
 */
export function isModuleAllowedForContext(
  moduleRef: string,
  context: PracticeSessionContext,
): boolean {
  if (context === 'keys') {
    return KEYS_DEFAULT_ALLOWED_MODULES.has(moduleRef);
  }
  if (context === 'full') {
    // Every module is in scope on a full session — keyboard +
    // device available at once.
    return true;
  }
  // laptop / phone — only the existing shapes-and-patterns exclusion
  // applies. Mental-viz isn't in spacingState so it's already absent.
  if (moduleRef === SHAPES_MODULE_REF) return false;
  return true;
}

// ---------------------------------------------------------------------
// Context-factor multipliers — per-block weight lift
// ---------------------------------------------------------------------

/**
 * Per-(context, moduleRef) weight multipliers. Modules excluded by
 * the hard filter aren't reached during normal proposal generation,
 * but if a "+ Add module" injection bypasses the filter, the
 * factor still applies — so these tables list every module
 * defensively. Excluded modules carry their natural weighting
 * intent for the injected case.
 *
 * Calibration: starting numbers below; recalibrate after real
 * sessions inform what each context actually looks like.
 *
 * Spec mapping:
 *
 *   Keys / Mixed — only Shapes + Repertoire surface; both neutral
 *                  (let the rest of the weight chain rank within).
 *
 *   Laptop — light HF/ET warm-up → chord progression review →
 *            Production dominant. HF 1.2 / chord-progressions 1.6 /
 *            other ET 1.0 / Production 1.5 / Repertoire 1.0.
 *
 *   Phone — HF/ET dominant, mental visualisation reachable
 *           (mental-viz is outside spacingState so no algorithm
 *           change; interpretation (i) from the design audit).
 *           Production gets a softer weight than laptop. HF 1.4 /
 *           all ET subs 1.4 / Production 1.0 / Repertoire 1.0.
 *
 *   ChordProgressionQuiz (placeholder — pending feature design):
 *     reserved 0 (excluded) on every context except keys until
 *     the quiz lands. When built it surfaces song chord
 *     progressions as a quizzable item on phone + laptop; flip
 *     this constant to the intended phone/laptop weight at that
 *     point.
 */
// Factor tables (KEYS_FACTORS, LAPTOP_FACTORS, PHONE_FACTORS,
// FULL_FACTORS) and the CONTEXT_FACTOR_NEUTRAL / placeholder weight
// constants moved to ./sessionDesign. Imported at the top of this
// file and consumed below by contextFactorForModule.

/**
 * Multiplicative weight factor for (context, moduleRef). Returns
 * 1.0 for any combo not explicitly tabled — keeps the default
 * neutral so modules added in the future don't accidentally drop
 * out of all contexts.
 *
 * Modules excluded by `isModuleAllowedForContext` still get a
 * factor here for the "+ Add module" injection case: a user who
 * manually overrides the hard filter for one module still gets
 * the context-appropriate weighting once it's in the pool.
 */
export function contextFactorForModule(
  moduleRef: string,
  context: PracticeSessionContext,
): number {
  let table: Readonly<Record<string, number>>;
  switch (context) {
    case 'keys':
      table = KEYS_FACTORS;
      break;
    case 'laptop':
      table = LAPTOP_FACTORS;
      break;
    case 'phone':
      table = PHONE_FACTORS;
      break;
    case 'full':
      table = FULL_FACTORS;
      break;
  }
  return table[moduleRef] ?? CONTEXT_FACTOR_NEUTRAL;
}

// Avoid unused-export warning on the ET module ref list (keeps it
// reachable for tests if needed without forcing the user-facing
// constants into the type surface).
export const _ET_MODULE_REFS_FOR_TESTS = ET_MODULE_REFS;
