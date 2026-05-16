/**
 * Phase B Step 9a Part B — algo spacing demand.
 *
 * The over-practice slice (Step 9a Part A) sets a 50% / 25% fractional
 * target of the memory-type tier. Part B adds a floor: when the
 * spacing-repetition algorithm has actual due-today demand exceeding
 * that target, the slice expands to clear the due items — still capped
 * at the tier constant so it never grows larger than a normal session.
 *
 *   slice = min(max(target, spacing_demand), tier_cap)
 *
 * Without Part B, the over-practice slice can be smaller than the
 * algo's due-today queue, pushing items past their review date
 * repeatedly and accumulating spacing debt. See
 * docs/PHASE_B_SESSION_PLANNING_DESIGN.md — Step 9a.
 *
 * Pure / synchronous. Operates on pre-loaded spacingState rows so the
 * caller (sessionGenerator) doesn't pay a second Dexie query — those
 * rows are already in hand from buildSessionProposals / planSession.
 *
 * Per-module dispatch:
 *
 *   harmonic-fluency   spacingState rows where moduleRef='harmonic-fluency'
 *                      AND nextDueAt != null AND nextDueAt <= asOf,
 *                      × TIME_PER_ATTEMPT_SECONDS['harmonic-fluency'].
 *
 *   ear-training       Same shape, but moduleRef ∈ ET_MODULE_REFS
 *                      (intervals / chord-recognition / chord-progressions
 *                      / scales-modes). × TIME_PER_ATTEMPT_SECONDS['ear-training'].
 *
 *   shapes-and-patterns  spacingState moduleRef='shapes-and-patterns',
 *                      due-filter as above, with PER-ITEM time-per-rep
 *                      because the three S&P sub-models (chord shapes /
 *                      scales / voice leading) have materially different
 *                      seed costs:
 *                        chord-shape:…:fluid        → 120 s (CHORD_SHAPE_FLUID_CELL_SECONDS)
 *                        chord-shape:…:(other)      →  90 s (CHORD_SHAPE_CELL_SECONDS)
 *                        scale:{kind}:…             → SCALE_KIND_SECONDS[kind]
 *                        vl:…                       → voiceLeadingCellSeconds(parsed)
 *                                                     (90 / 120 / 180 s depending on
 *                                                     pattern + ABA-251 level)
 *
 *   repertoire         Returns 0. Repertoire scheduling is user-driven
 *                      — SongCell uses a 'empty' | 'learning' |
 *                      'comfortable' state with no nextDueAt, and
 *                      SongCellRunThrough is an attempt log, not a due
 *                      queue. "Due today" isn't a meaningful concept
 *                      here; the slice falls through to the 50% / 25%
 *                      target with no expansion, which is correct.
 *
 *   production         Returns 0. Lessons progress through a mastery
 *                      enum (not-started → in-progress → completed →
 *                      mastered) with no due-date scheduling. The
 *                      Production-vocab block has its own SR layer
 *                      (db.flashcardStates) but that's a separate
 *                      pre-allocated carve-out, not part of the
 *                      over-practice slice math.
 *
 *   practice-consistency  Returns 0. Not a coverage module — never
 *                      reaches the over-practice path (defensive).
 *
 * Null nextDueAt is treated as NOT due (it indicates an unscheduled
 * row — either a Production assertSpacingStage write, a freshly
 * seeded backfill, or a hand-edited row). For spacing-demand we
 * count only what the SR algorithm has actually scheduled.
 */

import type { GoalFlowModuleId } from '../../modules/goals/goalVocabulary';
import type { SpacingState } from '../db';
import {
  ET_MODULE_REFS,
  HF_MODULE_REF,
  SHAPES_MODULE_REF,
} from '../../modules/goals/progress';
import {
  CHORD_SHAPE_CELL_SECONDS,
  CHORD_SHAPE_FLUID_CELL_SECONDS,
  SCALE_KIND_SECONDS,
  TIME_PER_ATTEMPT_SECONDS,
  voiceLeadingCellSeconds,
} from './timePerAttempt';
import { parseShapesItemRef } from '../../modules/shapes-and-patterns/drillModel';
import { parseVoiceLeadingItemRef } from '../../modules/shapes-and-patterns/catalog';

const ET_MODULE_REF_SET: ReadonlySet<string> = new Set(ET_MODULE_REFS);

/**
 * Algo spacing demand for `moduleId` in SECONDS, as of `asOf`.
 *
 * Pure — no Dexie call. Caller passes pre-loaded `spacingState` rows
 * (already loaded in both `buildSessionProposals` and
 * `planSession`).
 */
export function computeAlgoSpacingDemandSeconds(
  moduleId: GoalFlowModuleId,
  spacingRows: ReadonlyArray<SpacingState>,
  asOf: number,
): number {
  switch (moduleId) {
    case 'harmonic-fluency':
      return countDueRows(spacingRows, asOf, r => r.moduleRef === HF_MODULE_REF)
        * TIME_PER_ATTEMPT_SECONDS['harmonic-fluency'];

    case 'ear-training':
      return countDueRows(spacingRows, asOf, r => ET_MODULE_REF_SET.has(r.moduleRef))
        * TIME_PER_ATTEMPT_SECONDS['ear-training'];

    case 'shapes-and-patterns': {
      let seconds = 0;
      for (const r of spacingRows) {
        if (r.moduleRef !== SHAPES_MODULE_REF) continue;
        if (!isDue(r.nextDueAt, asOf)) continue;
        seconds += secondsForShapesItem(r.itemRef);
      }
      return seconds;
    }

    case 'repertoire':
      // No spacing-state due-today concept — see header.
      return 0;

    case 'production':
      // Mastery-enum progression, no due-date scheduling — see header.
      return 0;

    case 'practice-consistency':
      // Not a coverage module; can't reach the over-practice slice.
      return 0;
  }
}

/** Convenience: minutes wrapper around seconds. Returns the seconds
 *  divided by 60 — unrounded; callers round for display. */
export function computeAlgoSpacingDemandMinutes(
  moduleId: GoalFlowModuleId,
  spacingRows: ReadonlyArray<SpacingState>,
  asOf: number,
): number {
  return computeAlgoSpacingDemandSeconds(moduleId, spacingRows, asOf) / 60;
}

// ---------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------

function isDue(nextDueAt: number | null, asOf: number): boolean {
  return nextDueAt !== null && nextDueAt <= asOf;
}

function countDueRows(
  rows: ReadonlyArray<SpacingState>,
  asOf: number,
  modulePredicate: (row: SpacingState) => boolean,
): number {
  let count = 0;
  for (const r of rows) {
    if (!modulePredicate(r)) continue;
    if (!isDue(r.nextDueAt, asOf)) continue;
    count += 1;
  }
  return count;
}

/**
 * Time-per-rep for an S&P spacingState row, in seconds. Routes by
 * itemRef shape — chord-shape (fluid vs. inversion), scale (per
 * scale kind), voice-leading — to the seeds in timePerAttempt.ts.
 *
 * Unknown / unparseable refs fall back to CHORD_SHAPE_CELL_SECONDS
 * (90 s) — defensive against future itemRef shapes; the dominant
 * cardinality is chord-shapes and 90 s is the modal value.
 */
function secondsForShapesItem(itemRef: string): number {
  const desc = parseShapesItemRef(itemRef);
  if (!desc) return CHORD_SHAPE_CELL_SECONDS;
  switch (desc.kind) {
    case 'chord-shape':
      return desc.inversionState === 'fluid'
        ? CHORD_SHAPE_FLUID_CELL_SECONDS
        : CHORD_SHAPE_CELL_SECONDS;
    case 'scale': {
      // ScaleDescriptor.scale is typed as string (the parser narrows
      // at runtime but the descriptor stays loose). Look up by key;
      // unknown / future scale kinds fall back to the default cell
      // seed rather than crashing.
      const s = SCALE_KIND_SECONDS[desc.scale as keyof typeof SCALE_KIND_SECONDS];
      return s ?? CHORD_SHAPE_CELL_SECONDS;
    }
    case 'voice-leading': {
      // The full sub-cell descriptor lives one layer down — re-parse
      // here so we honor per-pattern (and per-type for the
      // type-position patterns) time seeds rather than averaging
      // across the catalog. Unparseable rows fall through to the
      // generic CHORD_SHAPE_CELL_SECONDS baseline at the end (no
      // VL spacingState rows pre-date this catalog, so an
      // unparseable vl: row signals hand-edited / future data).
      const vl = parseVoiceLeadingItemRef(itemRef);
      if (vl) return voiceLeadingCellSeconds(vl);
      return CHORD_SHAPE_CELL_SECONDS;
    }
    case 'mental-viz':
      // parseShapesItemRef never returns 'mental-viz' (no `mv:` prefix
      // path), so this branch is unreachable at runtime. Required for
      // TS exhaustiveness.
      return CHORD_SHAPE_CELL_SECONDS;
  }
}
