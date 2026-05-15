/**
 * Phase B Step 9b follow-up — coverage-goal scope enumeration.
 *
 * Returns the full set of itemRefs a coverage goal's scope COVERS,
 * walking each module's source-of-truth catalog. Pure — no Dexie,
 * no React. Used by carryover.ts to detect uncovered scope items
 * INCLUDING items the user never touched (no spacingState row).
 *
 * Mirrors `moduleItemCounts.ts`'s catalog-walk approach but returns
 * IDs rather than counts. Each per-metric branch reuses the same
 * source arrays (`FLASHCARDS`, `CHORD_QUALITIES`, `SCALE_CELLS`,
 * `INTERVAL_SEEDS`, …) so catalog growth flows through automatically.
 *
 * `relatedItems` are NOT merged in here — this returns the metric-
 * driven scope only. Callers that want the full effective scope
 * (metric ∪ explicit additions) union `goal.relatedItems` on top.
 */

import type { Goal } from '../../lib/db';
import {
  COVERAGE_OVERALL_METRIC,
  COVERAGE_SPECIFIC_METRIC,
  isCoverageOverallMetric,
  isCoverageSpecificMetric,
} from './coverageMetrics';
import { HF_GROUP_CATEGORIES } from './progress';
import { itemRefMatcherForCoverageGroup } from './shapesCoverageGroups';
import { FLASHCARDS } from '../harmonic-fluency/catalog';
import {
  CHORD_QUALITIES,
  enumerateVoiceLeadingCells,
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  KEYS,
  VOICE_LEADING_PATTERNS,
} from '../shapes-and-patterns/catalog';
import { SCALE_CELLS } from '../shapes-and-patterns/scaleSkills';
import { INTERVAL_SEEDS } from '../ear-training/intervals/seed';
import { CHORD_SEEDS } from '../ear-training/chord-recognition/seed';
import { PROGRESSIONS } from '../ear-training/chord-progressions/catalog';
import { MODES } from '../ear-training/scales-modes/catalog';
import { PRODUCTION_PATHS } from '../production/content/paths';
import { lessonsByPath } from '../production/content/lessons';
import { ET_MODULE_REFS } from './progress';

// =====================================================================
// Per-module enumerators — each one mirrors moduleItemCounts.ts's
// catalog walk and produces the matching itemRefs (not just counts).
// =====================================================================

function enumerateHF(): string[] {
  return FLASHCARDS.map(c => c.id);
}

function enumerateHFByCategorySubArea(subArea: string): string[] {
  const categories = HF_GROUP_CATEGORIES[subArea];
  if (!categories) return [];
  const set = new Set(categories);
  return FLASHCARDS.filter(c => set.has(c.category)).map(c => c.id);
}

function enumerateAllChordShapes(): string[] {
  const out: string[] = [];
  for (const q of CHORD_QUALITIES) {
    const states = INVERSION_STATES_FOR_CHORD_SHAPE_KIND[q.kind];
    for (const key of KEYS) {
      for (const state of states) {
        // Supplementary rows are practice tools, not coverage-gating
        // — moduleItemCounts and the Shapes coverage matchers both
        // exclude them. Keep parity here.
        if (state === 'supplementary') continue;
        out.push(
          state
            ? `chord-shape:${q.id}:${key}:${state}`
            : `chord-shape:${q.id}:${key}`,
        );
      }
    }
  }
  return out;
}

function enumerateAllScales(): string[] {
  return SCALE_CELLS.map(c => c.itemRef);
}

function enumerateAllVoiceLeading(): string[] {
  const out: string[] = [];
  for (const p of VOICE_LEADING_PATTERNS) {
    for (const key of KEYS) {
      for (const ref of enumerateVoiceLeadingCells(p, key)) {
        out.push(ref);
      }
    }
  }
  return out;
}

function enumerateAllShapes(): string[] {
  return [
    ...enumerateAllChordShapes(),
    ...enumerateAllScales(),
    ...enumerateAllVoiceLeading(),
  ];
}

/** ET sub-area enumerators — `subArea` matches a moduleRef:
 *  'intervals' | 'chord-recognition' | 'chord-progressions' |
 *  'scales-modes'. Item-id formats match what each submodule's
 *  attempt writer logs against spacingState (see
 *  moduleItemCounts.ts's design note). */
function enumerateETSub(subArea: string): string[] {
  switch (subArea) {
    case 'intervals':
      // IntervalsQuiz writes `${id}:${direction}` — 13 seeds × 2.
      return INTERVAL_SEEDS.flatMap(s => [`${s.id}:asc`, `${s.id}:desc`]);
    case 'chord-recognition':
      // Legacy 1-per-chord granularity (moduleItemCounts uses
      // CHORD_SEEDS.length). Inversion variants attach the same
      // chord ID at the catalog level; the per-inversion split
      // (`${id}:${inv}` from attemptItemId) is a practice-mode
      // subdivision, not a coverage-counting one.
      return CHORD_SEEDS.map(s => s.id);
    case 'chord-progressions':
      return PROGRESSIONS.map(p => p.id);
    case 'scales-modes':
      // HearScale + SitInside log separate rows: `${mode.id}-tab1`
      // and `${mode.id}-tab2`. See shared.ts scaleItemId/vampItemId.
      return MODES.flatMap(m => [`${m.id}-tab1`, `${m.id}-tab2`]);
    default:
      return [];
  }
}

function enumerateAllET(): string[] {
  return ET_MODULE_REFS.flatMap(m => enumerateETSub(m));
}

function enumerateAllProduction(): string[] {
  return PRODUCTION_PATHS.flatMap(p => lessonsByPath(p.id).map(l => l.id));
}

// =====================================================================
// Public — per-goal scope enumeration
// =====================================================================

/**
 * Full scope itemRefs for a coverage goal — metric-driven only.
 * Returns [] for non-coverage metrics (consistency, accuracy, song,
 * production-completion) — those don't have an enumerable item scope
 * for carry-over purposes.
 *
 * Callers that want the EFFECTIVE scope (metric ∪ goal.relatedItems
 * explicit additions) union relatedItems on top — this helper stays
 * focused on the metric-driven catalog walk so a goal with no
 * relatedItems extension still gets the catalog scope, and a goal
 * with carryover-extended relatedItems gets the union when callers
 * combine the two.
 */
export function enumerateScopeForGoal(goal: Goal): string[] {
  const metric = goal.targetMetric;
  if (!metric) return [];

  if (isCoverageOverallMetric(metric)) {
    if (metric === COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY) return enumerateHF();
    if (metric === COVERAGE_OVERALL_METRIC.EAR_TRAINING)     return enumerateAllET();
    if (metric === COVERAGE_OVERALL_METRIC.SHAPES)           return enumerateAllShapes();
    if (metric === COVERAGE_OVERALL_METRIC.PRODUCTION)       return enumerateAllProduction();
  }

  if (isCoverageSpecificMetric(metric)) {
    const subArea = goal.targetUnit;
    if (!subArea) return [];

    if (metric === COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY) {
      return enumerateHFByCategorySubArea(subArea);
    }
    if (metric === COVERAGE_SPECIFIC_METRIC.EAR_TRAINING) {
      return enumerateETSub(subArea);
    }
    if (metric === COVERAGE_SPECIFIC_METRIC.SHAPES) {
      const matcher = itemRefMatcherForCoverageGroup(subArea);
      if (!matcher) return [];
      return enumerateAllShapes().filter(matcher);
    }
    if (metric === COVERAGE_SPECIFIC_METRIC.PRODUCTION) {
      return lessonsByPath(subArea).map(l => l.id);
    }
  }

  return [];
}

/**
 * Effective scope for a coverage goal — metric scope ∪ relatedItems
 * (deduped). Returns [] when the metric has no enumerable scope and
 * `relatedItems` is empty.
 *
 * This IS the scope the candidate pool + carryover detection should
 * treat as in-scope post-9b-follow-up: explicit additions (Accept's
 * leftover itemRefs appended to relatedItems) act as scope
 * extensions on top of the metric predicate.
 */
export function effectiveScopeForGoal(goal: Goal): string[] {
  const metric = enumerateScopeForGoal(goal);
  if (goal.relatedItems.length === 0) return metric;
  const set = new Set(metric);
  for (const ref of goal.relatedItems) set.add(ref);
  return [...set];
}
