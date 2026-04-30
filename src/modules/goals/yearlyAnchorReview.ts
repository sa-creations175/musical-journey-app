/**
 * Phase 2 step 5d — pure helpers for the YearlyAnchorFlow review
 * screen.
 *
 * Three exports the Screen 2 surface composes:
 *
 *   defaultAnchorName(moduleId, year)
 *     — Auto-generated umbrella name ("Ear Training 2026").
 *
 *   dimensionRowsFor(draft)
 *     — Per-module list of `{ dimension, title, value }` rows
 *       describing each populated dimension's current state. Each
 *       row's `dimension` is the focus-target string Screen 1's
 *       useFocusDimension hook scrolls to when the user clicks
 *       that row's Edit link.
 *
 *   summarizeAnchor(draft, year, name)
 *     — Natural-language paragraph summarising the whole anchor in
 *       the style of the design doc example: "By Dec 31, 2026, you
 *       want to cover all 143 ear training items, master the Chord
 *       Recognition group, hit 85% overall accuracy, and practice
 *       4× per week."
 *
 * All three are pure functions over the `AnchorDraft` types
 * exported from YearlyAnchorFlow. Unit-tested without React.
 *
 * Live counts (e.g. "all 143 ear training items") flow through
 * `moduleItemCounts` from Step 3 — never hardcoded — so a future
 * catalog growth automatically updates the review wording.
 */

import type {
  AnchorDimension,
  AnchorDraft,
  AnchorModuleId,
  EarTrainingAnchor,
  HarmonicFluencyAnchor,
  PracticeConsistencyAnchor,
  ProductionAnchor,
  ShapesPatternsAnchor,
  SongRepertoireAnchor,
} from './YearlyAnchorFlow';
import {
  ET_GROUP_LABELS,
  HF_GROUP_LABELS,
  MODULE_DISPLAY_NAME,
  PRODUCTION_PATH_LABELS,
  SHAPES_AREA_LABELS,
} from './YearlyAnchorFlow';
import {
  earTrainingCounts,
  harmonicFluencyCounts,
  productionCounts,
  shapesCounts,
} from '../../lib/moduleItemCounts';

// =====================================================================
// Types
// =====================================================================

export interface DimensionReviewRow {
  /** Focus-target string Screen 1's useFocusDimension hook scrolls to. */
  dimension: AnchorDimension;
  /** Heading text for the row (e.g. "Breadth", "Mastery", "Weekly floor"). */
  title: string;
  /** Human-readable summary of this dimension's current state. */
  value: string;
}

// =====================================================================
// Default anchor name
// =====================================================================

/**
 * Per-module vision statement used as the auto-generated
 * umbrella name. No year suffix — these are timeless
 * commitments, not calendar entries. Editable inline on
 * Screen 2; this is the placeholder / fallback when the user
 * hasn't typed their own.
 */
const VISION_TITLES: Record<AnchorModuleId, string> = {
  'ear-training':
    'Make music speak to me — intervals, chords, progressions, all of it.',
  'harmonic-fluency':
    'Master the language of harmony.',
  'shapes-and-patterns':
    'Lock the shapes in. See them, hear them, flow between them — every key.',
  'repertoire':
    'Own my songs. Play them freely, shape them intentionally, make them mine.',
  'production':
    'Make the studio feel like home. Master the tools, play, and create freely.',
  'practice-consistency':
    'Show up every day. Make music practice as natural as breathing.',
};

/**
 * Returns the vision-statement default title for `moduleId`.
 * `year` is accepted but ignored — kept in the signature for
 * call-site compatibility with code paths that still pass it.
 */
export function defaultAnchorName(
  moduleId: AnchorModuleId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _year: number,
): string {
  return VISION_TITLES[moduleId];
}

/**
 * Detect any prior auto-name shape so the Goals home can
 * substitute the current vision statement at render time for
 * umbrellas saved before the rename. Catches:
 *
 *   - "[Module] [Year]"                                — Phase 1.6 default
 *   - "Build comprehensive [Module] mastery in [Year]" — 6c.2 default
 *
 * Real user-customized titles fall through to display as stored.
 * False-positive risk on a user who happens to have customized
 * to one of the legacy strings exactly — accepted; they can
 * edit again.
 */
export function isLegacyAnchorName(
  desc: string,
  moduleId: AnchorModuleId,
  year: number,
): boolean {
  const trimmed = desc.trim();
  if (trimmed === `${MODULE_DISPLAY_NAME[moduleId]} ${year}`) return true;
  if (trimmed === `Build comprehensive ${MODULE_DISPLAY_NAME[moduleId]} mastery in ${year}`) return true;
  return false;
}

// =====================================================================
// Natural-English helpers
// =====================================================================

/** "a", "a and b", "a, b, and c". Oxford comma. */
function joinAnd(parts: ReadonlyArray<string>): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function cadenceLabel(cadence: 'week' | 'month'): string {
  return cadence === 'week' ? 'week' : 'month';
}

// =====================================================================
// Per-module: Ear Training
// =====================================================================

function summarizeEarTrainingBreadth(et: EarTrainingAnchor): string {
  if (et.breadth.kind === 'all') {
    const total = earTrainingCounts().total;
    return `All ${total} items`;
  }
  if (et.breadth.groupIds.length === 0) return 'Not yet picked';
  return joinAnd(et.breadth.groupIds.map(id => ET_GROUP_LABELS[id]));
}

function summarizeEarTrainingMastery(et: EarTrainingAnchor): string {
  if (et.mastery.groupIds.length === 0) return '—';
  return `Master ${joinAnd(et.mastery.groupIds.map(id => ET_GROUP_LABELS[id]))}`;
}

function dimensionRowsForEarTraining(et: EarTrainingAnchor): DimensionReviewRow[] {
  return [
    { dimension: 'breadth',     title: 'Breadth',     value: summarizeEarTrainingBreadth(et) },
    { dimension: 'mastery',     title: 'Mastery',     value: summarizeEarTrainingMastery(et) },
    { dimension: 'depth',       title: 'Depth',       value: `${et.depth.accuracyPercent}% target accuracy` },
    { dimension: 'consistency', title: 'Consistency', value: `${et.consistency.count}× per ${cadenceLabel(et.consistency.cadence)}` },
  ];
}

function summarizeEarTraining(et: EarTrainingAnchor, year: number): string {
  const breadthClause = et.breadth.kind === 'all'
    ? `cover all ${earTrainingCounts().total} ear training items`
    : et.breadth.groupIds.length === 0
      ? 'cover the groups you choose'
      : `cover the ${joinAnd(et.breadth.groupIds.map(id => ET_GROUP_LABELS[id]))} groups`;
  const masteryClause = et.mastery.groupIds.length === 0
    ? null
    : `master the ${joinAnd(et.mastery.groupIds.map(id => ET_GROUP_LABELS[id]))} groups`;
  const depthClause = `hit ${et.depth.accuracyPercent}% overall accuracy`;
  const consistencyClause = `practice ${et.consistency.count}× per ${cadenceLabel(et.consistency.cadence)}`;
  const clauses = [breadthClause, masteryClause, depthClause, consistencyClause].filter(Boolean) as string[];
  return `By Dec 31, ${year}, you want to ${joinAnd(clauses)}.`;
}

// =====================================================================
// Per-module: Harmonic Fluency
// =====================================================================

function summarizeHarmonicFluencyBreadth(hf: HarmonicFluencyAnchor): string {
  if (hf.breadth.kind === 'all') {
    const total = harmonicFluencyCounts().total;
    return `All ${total} cards`;
  }
  if (hf.breadth.groupIds.length === 0) return 'Not yet picked';
  return joinAnd(hf.breadth.groupIds.map(id => HF_GROUP_LABELS[id]));
}

function summarizeHarmonicFluencyMastery(hf: HarmonicFluencyAnchor): string {
  if (hf.mastery.groupIds.length === 0) return '—';
  return `Master ${joinAnd(hf.mastery.groupIds.map(id => HF_GROUP_LABELS[id]))}`;
}

function dimensionRowsForHarmonicFluency(hf: HarmonicFluencyAnchor): DimensionReviewRow[] {
  return [
    { dimension: 'breadth',     title: 'Breadth',     value: summarizeHarmonicFluencyBreadth(hf) },
    { dimension: 'mastery',     title: 'Mastery',     value: summarizeHarmonicFluencyMastery(hf) },
    { dimension: 'depth',       title: 'Depth',       value: `${hf.depth.accuracyPercent}% target accuracy` },
    { dimension: 'consistency', title: 'Consistency', value: `${hf.consistency.count}× per ${cadenceLabel(hf.consistency.cadence)}` },
  ];
}

function summarizeHarmonicFluency(hf: HarmonicFluencyAnchor, year: number): string {
  const breadthClause = hf.breadth.kind === 'all'
    ? `cover all ${harmonicFluencyCounts().total} harmonic fluency cards`
    : hf.breadth.groupIds.length === 0
      ? 'cover the groups you choose'
      : `cover the ${joinAnd(hf.breadth.groupIds.map(id => HF_GROUP_LABELS[id]))} groups`;
  const masteryClause = hf.mastery.groupIds.length === 0
    ? null
    : `master the ${joinAnd(hf.mastery.groupIds.map(id => HF_GROUP_LABELS[id]))} groups`;
  const depthClause = `hit ${hf.depth.accuracyPercent}% overall accuracy`;
  const consistencyClause = `practice ${hf.consistency.count}× per ${cadenceLabel(hf.consistency.cadence)}`;
  const clauses = [breadthClause, masteryClause, depthClause, consistencyClause].filter(Boolean) as string[];
  return `By Dec 31, ${year}, you want to ${joinAnd(clauses)}.`;
}

// =====================================================================
// Per-module: Shapes & Patterns
// =====================================================================

function summarizeShapesBreadth(sp: ShapesPatternsAnchor): string {
  if (sp.breadth.kind === 'all') {
    const total = shapesCounts().total;
    return `All ${total} shapes`;
  }
  if (sp.breadth.groupIds.length === 0) return 'Not yet picked';
  return joinAnd(sp.breadth.groupIds.map(id => SHAPES_AREA_LABELS[id as keyof typeof SHAPES_AREA_LABELS]));
}

function summarizeShapesDepth(sp: ShapesPatternsAnchor): string {
  if (sp.depth.areaIds.length === 0) return '—';
  return `Reach Solid in ${joinAnd(sp.depth.areaIds.map(id => SHAPES_AREA_LABELS[id]))}`;
}

function summarizeShapesMastery(sp: ShapesPatternsAnchor): string {
  if (sp.mastery.areaIds.length === 0) return '—';
  return `Truly own ${joinAnd(sp.mastery.areaIds.map(id => SHAPES_AREA_LABELS[id]))}`;
}

function dimensionRowsForShapes(sp: ShapesPatternsAnchor): DimensionReviewRow[] {
  // Order matches Screen 1: Breadth → Depth → Mastery → Consistency.
  return [
    { dimension: 'breadth',     title: 'Breadth',     value: summarizeShapesBreadth(sp) },
    { dimension: 'depth',       title: 'Depth',       value: summarizeShapesDepth(sp) },
    { dimension: 'mastery',     title: 'Mastery',     value: summarizeShapesMastery(sp) },
    { dimension: 'consistency', title: 'Consistency', value: `${sp.consistency.count} minutes per ${cadenceLabel(sp.consistency.cadence)}` },
  ];
}

function summarizeShapes(sp: ShapesPatternsAnchor, year: number): string {
  const breadthClause = sp.breadth.kind === 'all'
    ? `work toward Comfortable across all ${shapesCounts().total} shapes`
    : sp.breadth.groupIds.length === 0
      ? 'work toward Comfortable in the areas you choose'
      : `work toward Comfortable in ${joinAnd(sp.breadth.groupIds.map(id => SHAPES_AREA_LABELS[id as keyof typeof SHAPES_AREA_LABELS]))}`;
  const depthClause = sp.depth.areaIds.length === 0
    ? null
    : `reach Solid in ${joinAnd(sp.depth.areaIds.map(id => SHAPES_AREA_LABELS[id]))}`;
  const masteryClause = sp.mastery.areaIds.length === 0
    ? null
    : `truly own ${joinAnd(sp.mastery.areaIds.map(id => SHAPES_AREA_LABELS[id]))}`;
  const consistencyClause = `practice ${sp.consistency.count} minutes per ${cadenceLabel(sp.consistency.cadence)}`;
  const clauses = [breadthClause, depthClause, masteryClause, consistencyClause].filter(Boolean) as string[];
  return `By Dec 31, ${year}, you want to ${joinAnd(clauses)}.`;
}

// =====================================================================
// Per-module: Song Repertoire
// =====================================================================

function dimensionRowsForSongRepertoire(sr: SongRepertoireAnchor): DimensionReviewRow[] {
  return [
    { dimension: 'breadth',     title: 'Breadth (Comfortable)',     value: sr.breadthCount === 0 ? '—' : `${sr.breadthCount} songs`  },
    { dimension: 'depth',       title: 'Depth (Solid)',             value: sr.depthCount === 0 ? '—' : `${sr.depthCount} songs`     },
    { dimension: 'mastery',     title: 'Mastery (Internalized)',    value: sr.masteryCount === 0 ? '—' : `${sr.masteryCount} songs` },
    { dimension: 'consistency', title: 'Consistency',               value: `${sr.consistency.count}× per ${cadenceLabel(sr.consistency.cadence)}` },
  ];
}

function summarizeSongRepertoire(sr: SongRepertoireAnchor, year: number): string {
  const clauses: string[] = [];
  if (sr.breadthCount > 0) clauses.push(`know how to play ${sr.breadthCount} song${sr.breadthCount === 1 ? '' : 's'}`);
  if (sr.depthCount > 0)   clauses.push(`be performance-ready on ${sr.depthCount} song${sr.depthCount === 1 ? '' : 's'}`);
  if (sr.masteryCount > 0) clauses.push(`internalize ${sr.masteryCount} song${sr.masteryCount === 1 ? '' : 's'}`);
  clauses.push(`cultivate Song Repertoire ${sr.consistency.count}× per ${cadenceLabel(sr.consistency.cadence)}`);
  return `By Dec 31, ${year}, you want to ${joinAnd(clauses)}.`;
}

// =====================================================================
// Per-module: Production
// =====================================================================

function summarizeProductionBreadth(p: ProductionAnchor): string {
  if (p.breadth.kind === 'all') {
    const total = productionCounts().total;
    return `All ${total} lessons`;
  }
  if (p.breadth.groupIds.length === 0) return 'Not yet picked';
  return joinAnd(p.breadth.groupIds.map(id => PRODUCTION_PATH_LABELS[id as keyof typeof PRODUCTION_PATH_LABELS]));
}

function summarizeProductionDepth(p: ProductionAnchor): string {
  if (p.depth.pathIds.length === 0) return '—';
  return `Go deep on ${joinAnd(p.depth.pathIds.map(id => PRODUCTION_PATH_LABELS[id]))}`;
}

function dimensionRowsForProduction(p: ProductionAnchor): DimensionReviewRow[] {
  // Production is 3 questions only — Mastery omitted.
  return [
    { dimension: 'breadth',     title: 'Breadth',     value: summarizeProductionBreadth(p) },
    { dimension: 'depth',       title: 'Depth',       value: summarizeProductionDepth(p)   },
    { dimension: 'consistency', title: 'Consistency', value: `${p.consistency.count} hours per ${cadenceLabel(p.consistency.cadence)}` },
  ];
}

function summarizeProduction(p: ProductionAnchor, year: number): string {
  const breadthClause = p.breadth.kind === 'all'
    ? `work through all ${productionCounts().total} production lessons`
    : p.breadth.groupIds.length === 0
      ? 'work through the paths you choose'
      : `work through ${joinAnd(p.breadth.groupIds.map(id => PRODUCTION_PATH_LABELS[id as keyof typeof PRODUCTION_PATH_LABELS]))}`;
  const depthClause = p.depth.pathIds.length === 0
    ? null
    : `go deepest on ${joinAnd(p.depth.pathIds.map(id => PRODUCTION_PATH_LABELS[id]))}`;
  const consistencyClause = `spend ${p.consistency.count} hours per ${cadenceLabel(p.consistency.cadence)}`;
  const clauses = [breadthClause, depthClause, consistencyClause].filter(Boolean) as string[];
  return `By Dec 31, ${year}, you want to ${joinAnd(clauses)}.`;
}

// =====================================================================
// Per-module: Practice Consistency
// =====================================================================

function dimensionRowsForPracticeConsistency(pc: PracticeConsistencyAnchor): DimensionReviewRow[] {
  return [
    { dimension: 'weeklyFloor',  title: 'Weekly floor',  value: `${pc.weeklyFloor} day${pc.weeklyFloor === 1 ? '' : 's'} per week`   },
    { dimension: 'monthlyFloor', title: 'Monthly floor', value: `${pc.monthlyFloor} day${pc.monthlyFloor === 1 ? '' : 's'} per month` },
    { dimension: 'aspiration',   title: 'Aspiration',    value: `${pc.aspiration} day${pc.aspiration === 1 ? '' : 's'} per week`     },
  ];
}

function summarizePracticeConsistency(pc: PracticeConsistencyAnchor, year: number): string {
  return (
    `By Dec 31, ${year}, you want to hold a floor of ${pc.weeklyFloor} day${pc.weeklyFloor === 1 ? '' : 's'} per week ` +
    `(${pc.monthlyFloor} per month as the safety net) ` +
    `and aspire to ${pc.aspiration} day${pc.aspiration === 1 ? '' : 's'} per week.`
  );
}

// =====================================================================
// Top-level dispatchers
// =====================================================================

/**
 * Returns the per-dimension review rows for the active module slot
 * on the draft. Returns an empty array when no slot is populated
 * (defensive — should not happen in normal flow since
 * buildInitialDraft seeds the slot for every supported moduleId).
 */
export function dimensionRowsFor(draft: AnchorDraft): DimensionReviewRow[] {
  if (draft.moduleId === 'ear-training' && draft.earTraining) {
    return dimensionRowsForEarTraining(draft.earTraining);
  }
  if (draft.moduleId === 'harmonic-fluency' && draft.harmonicFluency) {
    return dimensionRowsForHarmonicFluency(draft.harmonicFluency);
  }
  if (draft.moduleId === 'shapes-and-patterns' && draft.shapesPatterns) {
    return dimensionRowsForShapes(draft.shapesPatterns);
  }
  if (draft.moduleId === 'repertoire' && draft.songRepertoire) {
    return dimensionRowsForSongRepertoire(draft.songRepertoire);
  }
  if (draft.moduleId === 'production' && draft.production) {
    return dimensionRowsForProduction(draft.production);
  }
  if (draft.moduleId === 'practice-consistency' && draft.practiceConsistency) {
    return dimensionRowsForPracticeConsistency(draft.practiceConsistency);
  }
  return [];
}

/**
 * Returns the natural-language summary paragraph for the draft.
 * The `name` parameter is the resolved umbrella name (user-edited
 * or default) — surfaced before the summary in the review UI but
 * not embedded in the sentence itself; the summary stays focused
 * on what the user is committing to.
 */
export function summarizeAnchor(
  draft: AnchorDraft,
  year: number,
  // `name` is part of the public contract because future copy may
  // weave it in ("Your Ear Training 2026 anchor commits you to…").
  // For now the summary is name-agnostic; the param keeps the
  // function signature stable when that copy lands.
  _name: string,
): string {
  if (draft.moduleId === 'ear-training' && draft.earTraining) {
    return summarizeEarTraining(draft.earTraining, year);
  }
  if (draft.moduleId === 'harmonic-fluency' && draft.harmonicFluency) {
    return summarizeHarmonicFluency(draft.harmonicFluency, year);
  }
  if (draft.moduleId === 'shapes-and-patterns' && draft.shapesPatterns) {
    return summarizeShapes(draft.shapesPatterns, year);
  }
  if (draft.moduleId === 'repertoire' && draft.songRepertoire) {
    return summarizeSongRepertoire(draft.songRepertoire, year);
  }
  if (draft.moduleId === 'production' && draft.production) {
    return summarizeProduction(draft.production, year);
  }
  if (draft.moduleId === 'practice-consistency' && draft.practiceConsistency) {
    return summarizePracticeConsistency(draft.practiceConsistency, year);
  }
  return '';
}
