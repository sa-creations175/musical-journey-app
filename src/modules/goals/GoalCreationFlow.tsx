import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from '../../components/Modal';
import {
  db,
  type Goal,
  type GoalScope,
  type Song,
  type SongCell,
  type SongKey,
  type SongMatrixSection,
  type SongSection,
  type WantToLearnEntry,
} from '../../lib/db';
import { moduleMetaById, PRACTICE_SESSIONS_META, DASHBOARD_META } from '../../lib/moduleMeta';
import { computeSongLevelState } from '../repertoire/matrix/songLevelState';
import { DEFAULT_STAGE } from '../repertoire/stage';
import { CATEGORY_LABELS, type FlashcardCategory } from '../harmonic-fluency/catalog';
import {
  CHORD_QUALITIES,
  KEYS as SHAPES_KEYS,
  SCALES,
  VOICE_LEADING_PATTERNS,
  type QualityKind,
} from '../shapes-and-patterns/catalog';
import { PRODUCTION_PATHS } from '../production/content/paths';
import { lessonsByPath } from '../production/content/lessons';
import {
  SCOPE_ORDER,
  SCOPE_LABEL,
  defaultTargetDate,
  dateInputValue,
  dateInputToMs,
} from './scopeMeta';
import {
  CROSS_KEY_PERCENT_DEFAULT,
  buildKeyStateHints,
  decodeSongTarget,
  encodeSongTarget,
  previewSongTarget,
  type KeyStateHint,
  type SongTargetSelection,
} from './songTarget';
import { moduleForMetric } from './goalVocabulary';
import {
  COVERAGE_OVERALL_METRIC,
  COVERAGE_SPECIFIC_METRIC,
} from './coverageMetrics';
import SongTargetSection, { SongPreview } from './SongTargetSection';
import Field from './Field';
import { inputClass } from './formStyles';
import type { PracticeSessionContext } from '../../lib/db';

/**
 * Phase 1.6 — guided 5-step goal creation flow. Replaces
 * `GoalFormModal` once all build steps land.
 *
 * Built so far:
 *   Step 1 — module cards
 *   Step 2 — Song Repertoire target surface (this commit)
 *   Shell — navigation, 5-dot indicator, back/next
 *
 * Still to land: Step 2 for the other five modules (build steps 4–8),
 * scope cards (step 9), parent goal picker (step 10), save logic
 * (step 11), multi-target encoding (step 13), edit mode (step 14),
 * entry-point swap (step 15).
 *
 * See docs/GOAL_MODAL_REDESIGN.md for the full spec.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, opens in edit mode pre-filled from this goal. Edit
   *  flow will drop the user into the relevant step rather than
   *  starting at Step 1 — wired in step 14. */
  initialGoal?: Goal | null;
  /** When set (and `initialGoal` is null), opens in new-goal mode
   *  with this scope pre-filled. Consumed by Step 3 in step 9. */
  initialScope?: GoalScope | null;
}

// ---- Steps ---------------------------------------------------------

interface StepDef {
  id: '1' | '2' | '3' | '3.5' | '4';
  label: string;
  title: string;
}

const STEPS: StepDef[] = [
  { id: '1',   label: 'Step 1',   title: 'What do you want to work on?' },
  { id: '2',   label: 'Step 2',   title: 'What does success look like?' },
  { id: '3',   label: 'Step 3',   title: 'When do you want to achieve this?' },
  { id: '3.5', label: 'Step 3.5', title: 'Does this goal roll up into a bigger one?' },
  { id: '4',   label: 'Step 4',   title: 'Review and save' },
];

// ---- Module cards (Step 1) -----------------------------------------

/**
 * Goal-flow card identifiers. Five map onto existing `ModuleId`s
 * from moduleMeta (`harmonic-fluency`, `ear-training`,
 * `shapes-and-patterns`, `repertoire`, `production`); the sixth
 * — `practice-consistency` — is a goal-flow concept that doesn't
 * correspond to a learning module in the registry. Defined locally
 * because this is the only consumer; promote to a shared module
 * if a second surface needs it.
 */
type ModuleCardId =
  | 'ear-training'
  | 'harmonic-fluency'
  | 'repertoire'
  | 'shapes-and-patterns'
  | 'production'
  | 'practice-consistency';

interface ModuleCard {
  id: ModuleCardId;
  name: string;
  description: string;
  example: string;
}

/**
 * Canonical accent per card. Five values resolve through
 * `moduleMetaById` so the goal flow stays in lockstep with sidebar /
 * dashboard / catalogue if a hex is ever retuned. `practice-consistency`
 * has no entry in the module registry — it borrows
 * `PRACTICE_SESSIONS_META`'s teal because consistency goals are
 * fulfilled by Practice Sessions.
 */
/** Format a list of strings as natural English: "a", "a and b",
 *  "a, b, and c". Oxford comma. Used by preview-text builders that
 *  need to read multi-pick selections back to the user. */
function joinAnd(parts: ReadonlyArray<string>): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function accentHexForCard(id: ModuleCardId): string {
  if (id === 'practice-consistency') return PRACTICE_SESSIONS_META.accentHex;
  return moduleMetaById(id)?.accentHex ?? '#9ca3af';
}

// Order matches the spec's Step 1 table verbatim.
const MODULE_CARDS: ModuleCard[] = [
  {
    id: 'ear-training',
    name: 'Ear Training',
    description: 'Sharpen how you hear chords, intervals, and progressions',
    example: 'I want to improve my chord recognition accuracy to 80%',
  },
  {
    id: 'harmonic-fluency',
    name: 'Harmonic Fluency',
    description: 'Build speed and confidence reading and recognizing the starting and landing points of chords within a key',
    example: 'I want to reach 75% accuracy on chord motion math in all 12 keys',
  },
  {
    id: 'repertoire',
    name: 'Song Repertoire',
    description: 'Grow and deepen your playable song library',
    example: 'I want to get Mirror Solid in the original key',
  },
  {
    id: 'shapes-and-patterns',
    name: 'Shapes & Patterns',
    description: 'Internalize scales, chords, inversions, and patterns across the keyboard',
    example: 'I want to reach Comfortable proficiency level on major 7th inversions in 6 keys',
  },
  {
    id: 'production',
    name: 'Production',
    description: 'Expand your music production knowledge and workflow',
    example: 'I want to complete 4 new production lessons this month including the Sound Design lesson path',
  },
  {
    id: 'practice-consistency',
    name: 'Practice consistency',
    description: 'Build the habit of showing up regularly',
    example: 'I want to practice at least 4 days a week this month',
  },
];

// ---- Draft state ---------------------------------------------------

/**
 * Cumulative answers across the flow. Grows step-by-step.
 *
 * Module-specific slices are present-but-default when their module
 * isn't selected. Switching modules in Step 1 resets these to defaults
 * so stale picks don't carry over. As more modules land in build
 * steps 5–8, additional slices appear here.
 */
interface Draft {
  moduleId: ModuleCardId | null;
  // Song Repertoire (build step 3)
  songId: string | null;
  songTarget: SongTargetSelection;
  // Ear Training (build step 4)
  earTraining: EarTrainingTarget;
  // Harmonic Fluency (build step 5)
  harmonicFluency: HarmonicFluencyTarget;
  // Shapes & Patterns (build step 6)
  shapesPatterns: ShapesPatternsTarget;
  // Production (build step 7)
  production: ProductionTarget;
  // Practice consistency (build step 8)
  practiceConsistency: PracticeConsistencyTarget;
  // Step 3 — timeframe (build step 9)
  scope: GoalScope | null;
  /** Epoch ms. Null until scope is picked; auto-populates per
   *  scope and is user-editable thereafter. */
  targetDate: number | null;
  // Step 3.5 — parent goal (build step 10)
  parentGoal: ParentGoalChoice;
}

/**
 * Discriminated union for the parent-goal selection in Step 3.5.
 * The "unset" state distinguishes "user hasn't decided yet" from
 * "user explicitly chose no parent" — Step 3.5 validity gates Next
 * on a non-unset choice so the user can't skip the question.
 */
type ParentGoalChoice =
  | { kind: 'unset' }
  | { kind: 'none' }
  | { kind: 'linked'; goalId: string };

/**
 * Mirrors `defaultSongTarget` in GoalFormModal. Duplicated rather
 * than shared because the duplication resolves when GoalFormModal
 * goes away in build step 15.
 */
function defaultSongTarget(): SongTargetSelection {
  return {
    granularity: 'whole',
    wholeOption: null,
    crossKeyPercent: CROSS_KEY_PERCENT_DEFAULT,
    keyTarget: '',
    keyState: 'comfortable',
    sectionId: '',
  };
}

/**
 * Ear-training step 2 selection. Either or both targets can be
 * enabled — spec calls this out as "any combination selectable".
 * The encoding-to-Goal-record transform lives in build step 11
 * (single target) and step 13 (multi-target).
 */
interface EarTrainingTarget {
  /** Phase 2 2b — coverage (breadth) target: reach `acquired`
   *  acquisition stage on every item in the module, or one chosen
   *  group. Independent of accuracy and consistency; a goal can
   *  combine any subset of the three. */
  coverageEnabled: boolean;
  /** 'overall' = all 143 items across the four groups (one record);
   *  'specific' = one or more of the four groups (one record per
   *  picked group, all sharing parent_goal_id via the existing
   *  multi-target umbrella encoding from Phase 1.6). */
  coverageScope: 'overall' | 'specific';
  /** Group ids from EAR_TRAINING_COVERAGE_GROUPS. Empty array when
   *  scope is 'overall' or no group is yet picked. Multi-pick: each
   *  picked group becomes its own child record on save. */
  coverageGroupIds: string[];

  accuracyEnabled: boolean;
  /** 'overall' = the whole module's accuracy; 'specific' = one
   *  drill type + subtype combo. */
  accuracyScope: 'overall' | 'specific';
  /** Top-level drill identifier — null when scope is 'overall' or
   *  not yet picked. */
  drillTypeId: string | null;
  /** Sub-category within the drill type. Resets when drillTypeId
   *  changes. */
  drillSubtypeId: string | null;
  /** Target accuracy %. 50–95 in 5% steps. */
  accuracyPercent: number;

  consistencyEnabled: boolean;
  /** X sessions per cadence. min 1, no upper cap. */
  consistencyCount: number;
  consistencyCadence: 'week' | 'month';
}

function defaultEarTraining(): EarTrainingTarget {
  return {
    coverageEnabled: false,
    coverageScope: 'overall',
    coverageGroupIds: [],
    accuracyEnabled: false,
    accuracyScope: 'overall',
    drillTypeId: null,
    drillSubtypeId: null,
    accuracyPercent: 75,
    consistencyEnabled: false,
    consistencyCount: 3,
    consistencyCadence: 'week',
  };
}

/**
 * Harmonic-fluency step 2 selection. Same accuracy + consistency
 * shape as ear training; the only structural difference is that
 * "specific" accuracy targets a single flashcard category (no
 * cascading subtype), with the 12 categories grouped into 4 sections
 * for the picker UI.
 */
interface HarmonicFluencyTarget {
  /** Phase 2 2c — coverage (breadth) target: reach `acquired`
   *  acquisition stage on every flashcard in the module, or one or
   *  more chosen design-doc groups. Independent of accuracy and
   *  consistency; a goal can combine any subset of the three. */
  coverageEnabled: boolean;
  /** 'overall' = all 302 cards across the four groups (one record);
   *  'specific' = one or more of the four groups (one record per
   *  picked group, all sharing parent_goal_id via the auto-umbrella
   *  encoding in handleSave). */
  coverageScope: 'overall' | 'specific';
  /** Group ids from HARMONIC_FLUENCY_COVERAGE_GROUPS. Empty array
   *  when scope is 'overall' or no group is yet picked. Multi-pick:
   *  each picked group becomes its own child record on save. */
  coverageGroupIds: string[];

  accuracyEnabled: boolean;
  accuracyScope: 'overall' | 'specific';
  /** Single flashcard category id from `harmonic-fluency/catalog`.
   *  Null when scope is 'overall' or unselected. */
  categoryId: FlashcardCategory | null;
  accuracyPercent: number;

  consistencyEnabled: boolean;
  consistencyCount: number;
  consistencyCadence: 'week' | 'month';
}

function defaultHarmonicFluency(): HarmonicFluencyTarget {
  return {
    coverageEnabled: false,
    coverageScope: 'overall',
    coverageGroupIds: [],
    accuracyEnabled: false,
    accuracyScope: 'overall',
    categoryId: null,
    accuracyPercent: 75,
    consistencyEnabled: false,
    consistencyCount: 3,
    consistencyCadence: 'week',
  };
}

/**
 * Shapes & Patterns step 2 selection. Per
 * docs/SHAPES_PROFICIENCY_DESIGN.md, shapes use song vocabulary
 * (Learning → Comfortable → Solid → Internalized) and are tracked
 * per shape × key. Three activity areas are in scope (Mental
 * Visualization is excluded — different cognitive structure).
 *
 * Consistency uses the same three field names as ear-training /
 * harmonic-fluency so it can share the generic ConsistencyTargetCard.
 * The unit semantically is minutes (the card receives a unitLabel
 * override). Sessions-based consistency is deferred per the build-
 * step instruction.
 */
type ShapesActivityArea = 'scale_drills' | 'chord_shape_drills' | 'voice_leading';
type ShapesProficiencyLevel = 'learning' | 'comfortable' | 'solid' | 'internalized';

interface ShapesPatternsTarget {
  proficiencyEnabled: boolean;
  proficiencyScope: 'overall' | 'specific';
  /** Required for both 'overall' (scopes the rollup) and 'specific'. */
  activityArea: ShapesActivityArea | null;
  /** Catalog id from CHORD_QUALITIES / SCALES / VOICE_LEADING_PATTERNS.
   *  Required only for 'specific'. */
  shapeId: string | null;
  /** 'all' = the shape across all 12 keys; otherwise one of the 12
   *  major keys. Only meaningful for 'specific'. */
  keyTarget: 'all' | string;
  proficiencyLevel: ShapesProficiencyLevel;

  consistencyEnabled: boolean;
  /** Minutes per cadence — same field name as session-count consistency
   *  on other targets so the generic card can reuse the field. */
  consistencyCount: number;
  consistencyCadence: 'week' | 'month';
}

function defaultShapesPatterns(): ShapesPatternsTarget {
  return {
    proficiencyEnabled: false,
    proficiencyScope: 'overall',
    activityArea: null,
    shapeId: null,
    keyTarget: 'all',
    proficiencyLevel: 'comfortable',
    consistencyEnabled: false,
    // 20 mins/week mirrors the spec preview example.
    consistencyCount: 20,
    consistencyCadence: 'week',
  };
}

/**
 * Production step 2 selection. Two combinable targets:
 *   - Completion: either finish a specific path, or count up X new
 *     lessons. The two completion scopes are mutually exclusive
 *     within the completion target.
 *   - Time: hours per week or month. Reuses the consistency field
 *     names so the generic ConsistencyTargetCard can render it
 *     (with unitLabel="Hours" + a renamed cardTitle).
 *
 * Lesson count is intentionally not capped — the catalog has 56
 * total today but the user may set a goal beyond what's authored
 * if they're planning ahead.
 */
interface ProductionTarget {
  completionEnabled: boolean;
  completionScope: 'path' | 'count';
  /** Path id from PRODUCTION_PATHS — required when scope === 'path'. */
  pathId: string | null;
  /** Lesson count — meaningful when scope === 'count'. */
  lessonCount: number;

  consistencyEnabled: boolean;
  /** Hours per cadence — same field name as count-based consistency
   *  on other modules so the generic card can reuse it. */
  consistencyCount: number;
  consistencyCadence: 'week' | 'month';
}

function defaultProduction(): ProductionTarget {
  return {
    completionEnabled: false,
    completionScope: 'path',
    pathId: null,
    lessonCount: 4,
    consistencyEnabled: false,
    consistencyCount: 2,
    consistencyCadence: 'week',
  };
}

/**
 * Practice consistency step 2 selection. Single-target — the entire
 * card IS the consistency goal, so no enable/disable toggle. Unit is
 * days (not sessions / minutes / hours), since the question is "how
 * often will you show up at all".
 *
 * Cadence phrasing in the preview differs by unit: "a week" reads as
 * a recurring weekly target, "this month" reads as a one-shot monthly
 * count — semantically distinct intents the wording honors.
 */
interface PracticeConsistencyTarget {
  days: number;
  cadence: 'week' | 'month';
}

function defaultPracticeConsistency(): PracticeConsistencyTarget {
  return {
    days: 4,
    cadence: 'week',
  };
}

const EMPTY_DRAFT: Draft = {
  moduleId: null,
  songId: null,
  songTarget: defaultSongTarget(),
  earTraining: defaultEarTraining(),
  harmonicFluency: defaultHarmonicFluency(),
  shapesPatterns: defaultShapesPatterns(),
  production: defaultProduction(),
  practiceConsistency: defaultPracticeConsistency(),
  scope: null,
  targetDate: null,
  // Default to standalone — the safer default. Picking a parent is
  // an opt-in upgrade, not a required step. (Phase 2 2b hardening:
  // earlier behavior was 'unset', which forced a click in Step 3.5
  // and made it easy to accidentally click an auto-suggested
  // umbrella when the user really wanted standalone.)
  parentGoal: { kind: 'none' },
};

/**
 * Build the initial Draft for a fresh open.
 *
 *   - `initialGoal` set: edit mode. Decode the goal back into a Draft
 *     via decodeGoalToDraft (covers all new-vocabulary metrics). Old-
 *     vocabulary goals (`items_at_level` etc.) decode as null — caller
 *     should route them to GoalFormModal instead, but the EMPTY_DRAFT
 *     fallback keeps the new flow rendering safely if a stray edit
 *     attempt sneaks through.
 *   - `initialScope` set (and no `initialGoal`): create mode with the
 *     scope + target date pre-filled. Step 3 lands on that scope.
 *   - Neither set: empty draft, fresh create.
 */
function buildInitialDraft(
  initialScope: GoalScope | null | undefined,
  initialGoal: Goal | null | undefined,
): Draft {
  if (initialGoal) {
    return decodeGoalToDraft(initialGoal) ?? EMPTY_DRAFT;
  }
  if (initialScope) {
    return {
      ...EMPTY_DRAFT,
      scope: initialScope,
      targetDate: defaultTargetDate(initialScope),
    };
  }
  return EMPTY_DRAFT;
}

/**
 * True when the user picked a song goal at section granularity in
 * Step 2. Section goals are weekly-only per spec — Step 3 forces
 * scope=weekly and disables the other scope cards in this case.
 */
function isSectionGoal(draft: Draft): boolean {
  return draft.moduleId === 'repertoire'
    && draft.songTarget.granularity === 'section';
}

// ---- Per-step validity ---------------------------------------------

function isCurrentStepValid(stepId: StepDef['id'], draft: Draft): boolean {
  switch (stepId) {
    case '1':
      return draft.moduleId !== null;
    case '2':
      return isStep2Valid(draft);
    case '3':
      return draft.scope !== null && draft.targetDate !== null;
    case '3.5':
      // Step 3.5 forces an explicit choice — "No parent goal" counts
      // as a valid selection, but the user must actively pick.
      return draft.parentGoal.kind !== 'unset';
    case '4':
    default:
      return true;
  }
}

function isStep2Valid(draft: Draft): boolean {
  if (draft.moduleId === 'repertoire') {
    if (!draft.songId) return false;
    const t = draft.songTarget;
    if (t.granularity === 'whole') return t.wholeOption !== null;
    if (t.granularity === 'key') return t.keyTarget !== '';
    if (t.granularity === 'section') return t.sectionId !== '' && t.keyTarget !== '';
    return false;
  }
  if (draft.moduleId === 'ear-training') {
    return isEarTrainingValid(draft.earTraining);
  }
  if (draft.moduleId === 'harmonic-fluency') {
    return isHarmonicFluencyValid(draft.harmonicFluency);
  }
  if (draft.moduleId === 'shapes-and-patterns') {
    return isShapesPatternsValid(draft.shapesPatterns);
  }
  if (draft.moduleId === 'production') {
    return isProductionValid(draft.production);
  }
  if (draft.moduleId === 'practice-consistency') {
    return isPracticeConsistencyValid(draft.practiceConsistency);
  }
  return true;
}

function isEarTrainingValid(t: EarTrainingTarget): boolean {
  // At least one target must be enabled.
  if (!t.coverageEnabled && !t.accuracyEnabled && !t.consistencyEnabled) return false;
  if (t.coverageEnabled && t.coverageScope === 'specific') {
    if (t.coverageGroupIds.length < 1) return false;
  }
  if (t.accuracyEnabled && t.accuracyScope === 'specific') {
    if (!t.drillTypeId || !t.drillSubtypeId) return false;
  }
  if (t.consistencyEnabled && t.consistencyCount < 1) return false;
  return true;
}

function isHarmonicFluencyValid(t: HarmonicFluencyTarget): boolean {
  if (!t.coverageEnabled && !t.accuracyEnabled && !t.consistencyEnabled) return false;
  if (t.coverageEnabled && t.coverageScope === 'specific') {
    if (t.coverageGroupIds.length < 1) return false;
  }
  if (t.accuracyEnabled && t.accuracyScope === 'specific') {
    if (!t.categoryId) return false;
  }
  if (t.consistencyEnabled && t.consistencyCount < 1) return false;
  return true;
}

function isShapesPatternsValid(t: ShapesPatternsTarget): boolean {
  if (!t.proficiencyEnabled && !t.consistencyEnabled) return false;
  if (t.proficiencyEnabled) {
    if (!t.activityArea) return false;
    if (t.proficiencyScope === 'specific') {
      if (!t.shapeId) return false;
      if (!t.keyTarget) return false;
    }
  }
  if (t.consistencyEnabled && t.consistencyCount < 1) return false;
  return true;
}

function isProductionValid(t: ProductionTarget): boolean {
  if (!t.completionEnabled && !t.consistencyEnabled) return false;
  if (t.completionEnabled) {
    if (t.completionScope === 'path' && !t.pathId) return false;
    if (t.completionScope === 'count' && t.lessonCount < 1) return false;
  }
  if (t.consistencyEnabled && t.consistencyCount < 1) return false;
  return true;
}

function isPracticeConsistencyValid(t: PracticeConsistencyTarget): boolean {
  return t.days >= 1;
}

// ---- Component -----------------------------------------------------

export default function GoalCreationFlow({ open, onClose, initialScope, initialGoal }: Props) {
  // `initialScope` pre-fills Step 3 when the parent opens the flow
  // with a layer pre-selected (e.g. per-layer "+ Add"). `initialGoal`
  // (Phase 1.6 step 14) opens the flow in edit mode, decoding the
  // goal back into a Draft so all five steps land pre-filled.
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => buildInitialDraft(initialScope, initialGoal));
  const [saving, setSaving] = useState(false);

  const isEditing = !!initialGoal;

  // Wrap the parent's onClose so every close path resets to Step 1
  // with the freshly-rebuilt initial draft (preserving initialScope
  // / initialGoal pre-fill). Routed to: Modal's Esc/backdrop/X (via
  // the onClose prop below), Back on Step 1 (via goBack), and Save
  // (via goNext on the last step). Re-opening always lands on Step 1.
  const handleClose = () => {
    setStepIndex(0);
    setDraft(buildInitialDraft(initialScope, initialGoal));
    setSaving(false);
    onClose();
  };

  /**
   * Assemble the encoded records into Goal rows and persist via
   * `db.goals.put`. Multi-target draft → two rows that share their
   * parent_goal_id (the user's chosen parent if any, else null) per
   * the spec's "two linked records" decision.
   *
   * Async because we await-fetch the song record + matrix sections
   * for song goals (description rendering depends on them) and the
   * dexie writes themselves.
   */
  const handleSave = async () => {
    if (saving) return;
    if (!draft.moduleId || !draft.scope || draft.targetDate === null) return;
    setSaving(true);
    try {
      // Fetch song-only context up front so the same data feeds both
      // description and encoder. For non-song modules these are
      // empty/no-ops.
      let songRecord: Song | undefined;
      let sectionNamesById: ReadonlyMap<string, string> = new Map();
      if (draft.moduleId === 'repertoire' && draft.songId) {
        songRecord = await db.songs.get(draft.songId);
        if (!songRecord) {
          // Song was deleted between Step 2 and Save — abort silently
          // and let the user re-pick on next open.
          console.warn('[goal-flow] song missing on save; aborting');
          setSaving(false);
          return;
        }
        const sections = await db.songMatrixSections.where('songId').equals(draft.songId).toArray();
        sectionNamesById = new Map(
          sections.filter(s => !s.isArchived).map(s => [s.id, s.name]),
        );
      }

      const records = encodeRecordsForDraft(draft, songRecord, sectionNamesById);
      if (records.length === 0) {
        console.warn('[goal-flow] no records to save; aborting');
        setSaving(false);
        return;
      }

      const now = Date.now();
      const userPickedParentId = draft.parentGoal.kind === 'linked' ? draft.parentGoal.goalId : null;
      const contextTag = contextForModule(draft.moduleId);
      const relatedModules = relatedModulesForCard(draft.moduleId);
      const relatedItems = draft.songId ? [draft.songId] : [];

      // Multi-target encoding contract: sibling records produced from
      // a single draft (accuracy + consistency, multi-pick coverage
      // groups, etc.) MUST share a parent_goal_id so they're queryable
      // as one conceptual goal. Phase 1.6 Step 3.5 added the parent
      // picker (link-to-existing or standalone) but never implemented
      // auto-creation of a fresh umbrella for the standalone-multi
      // case — leaving siblings as orphan goals with parentGoalId
      // null, which breaks the contract stated in this file's
      // decodeGoalToDraft docblock and in BUILD_SEQUENCER_2.md.
      // Phase 2 2b's multi-pick coverage made the gap visible; the
      // fix lands here so it covers the existing accuracy+consistency
      // case too. Edit mode: if a goal that was previously single-
      // target gets a second slice added on edit, an umbrella is
      // auto-created and both records (the reused-id original and
      // the new sibling) end up under it.
      let effectiveParentGoalId = userPickedParentId;
      if (effectiveParentGoalId === null && records.length > 1) {
        const umbrellaId = uid('goal');
        const umbrellaDescription =
          computeGoalDescription(draft, songRecord, sectionNamesById)
          ?? records[0].description;
        await db.goals.add({
          id: umbrellaId,
          scope: draft.scope,
          description: umbrellaDescription,
          targetMetric: null,
          targetValue: null,
          targetUnit: null,
          currentValue: 0,
          contextTag,
          relatedModules,
          relatedItems,
          startDate: now,
          targetDate: draft.targetDate,
          status: 'active',
          parentGoalId: null,
          contributesNumericallyToParent: false,
          isUmbrella: true,
          lastEngagedAt: now,
        });
        effectiveParentGoalId = umbrellaId;
      }

      // Edit-mode bookkeeping: in edit mode we want to update the
      // original record in place (preserving id, currentValue,
      // startDate, lastEngagedAt) rather than create a new one.
      // When a multi-target draft produces 2 records, match the
      // original to the record whose slice kind (accuracy /
      // proficiency / completion vs. consistency-period) matches —
      // the OTHER record gets a new id. If no record matches the
      // original's slice kind (the user swapped slices entirely),
      // delete the original after writing the new records to avoid
      // an orphan.
      const originalIsConsistency = isEditing
        ? isConsistencySlice(initialGoal!.targetMetric)
        : false;
      let originalIdReused = false;

      // Multi-target: two records share parent_goal_id (per spec) but
      // are otherwise independent rows. Single-target: one record.
      for (const record of records) {
        // Defensive: if the encoder produced a malformed record,
        // skip with a loud error rather than persisting junk into
        // db.goals. This guard caught a real bug during step 11
        // verification — kept here as a regression alarm.
        if (!record.description || !record.targetMetric) {
          console.error('[goal-flow] BUG: encoder produced malformed record', { record, draft });
          continue;
        }
        const recordIsConsistency = isConsistencySlice(record.targetMetric);
        const reuseOriginalId =
          isEditing && !originalIdReused && recordIsConsistency === originalIsConsistency;

        const goal: Goal = {
          id: reuseOriginalId ? initialGoal!.id : uid('goal'),
          scope: draft.scope,
          description: record.description,
          targetMetric: record.targetMetric,
          targetValue: record.targetValue,
          targetUnit: record.targetUnit,
          currentValue: reuseOriginalId ? initialGoal!.currentValue : 0,
          contextTag,
          relatedModules,
          relatedItems,
          startDate: reuseOriginalId ? initialGoal!.startDate : now,
          targetDate: draft.targetDate,
          status: reuseOriginalId ? initialGoal!.status : 'active',
          parentGoalId: effectiveParentGoalId,
          contributesNumericallyToParent: reuseOriginalId
            ? initialGoal!.contributesNumericallyToParent
            : false,
          isUmbrella: reuseOriginalId ? initialGoal!.isUmbrella : false,
          lastEngagedAt: reuseOriginalId ? initialGoal!.lastEngagedAt : now,
        };
        if (reuseOriginalId) originalIdReused = true;
        await db.goals.put(goal);
      }

      // Slice swap during edit: the user toggled off the slice the
      // original belonged to and replaced it with the other slice.
      // No record matched the original — delete it so the goal's
      // identity is honored (the new record(s) become the goal).
      if (isEditing && !originalIdReused) {
        await db.goals.delete(initialGoal!.id);
      }

      handleClose();
    } catch (err) {
      console.warn('[goal-flow] save failed', err);
      setSaving(false);
    }
  };
  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const canAdvance = isCurrentStepValid(step.id, draft);

  const goBack = () => {
    if (isFirst) handleClose();
    else setStepIndex(i => Math.max(0, i - 1));
  };

  const goNext = () => {
    if (!canAdvance || saving) return;
    if (isLast) {
      void handleSave();
      return;
    }
    // Cross-step coupling: leaving Step 2 with a section-granularity
    // song goal forces scope to weekly per spec. Done here (rather
    // than reactively in Step 2) so the user explicitly commits
    // to advancing before the scope is locked.
    if (step.id === '2' && isSectionGoal(draft) && draft.scope !== 'weekly') {
      setDraft(d => ({
        ...d,
        scope: 'weekly',
        targetDate: defaultTargetDate('weekly'),
      }));
    }
    setStepIndex(i => Math.min(STEPS.length - 1, i + 1));
  };

  const selectModule = (id: ModuleCardId) => {
    setDraft(d => {
      // No-op when re-selecting the same module — preserves any
      // module-specific selections the user has already made.
      if (d.moduleId === id) return d;
      return {
        ...d,
        moduleId: id,
        // Switching modules invalidates module-specific state. Scope,
        // targetDate, and parentGoal are module-agnostic — keep them
        // across module switches so initialScope pre-fill (and any
        // user-set scope / parent picks) survive a Step-1 module
        // change. Section-locked weekly is handled at goNext time
        // when the user actually picks a section + advances, not
        // pre-emptively reset on module change.
        songId: null,
        songTarget: defaultSongTarget(),
        earTraining: defaultEarTraining(),
        harmonicFluency: defaultHarmonicFluency(),
        shapesPatterns: defaultShapesPatterns(),
        production: defaultProduction(),
        practiceConsistency: defaultPracticeConsistency(),
      };
    });
  };

  const updateDraft = (patch: Partial<Draft>) => {
    setDraft(d => ({ ...d, ...patch }));
  };

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={goBack}
        className="px-4 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        Back
      </button>
      <StepDots currentIndex={stepIndex} total={STEPS.length} />
      <button
        type="button"
        onClick={goNext}
        disabled={!canAdvance || saving}
        className="px-4 py-2 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLast ? (saving ? 'Saving…' : 'Save goal') : 'Next'}
      </button>
    </div>
  );

  // Scope banner: persistent context strip across all five steps when
  // the flow was opened from a scope-aware entry point (per-layer
  // "+ Add" / "+ Reflect"). Tracks the current draft.scope so it
  // updates if the user changes scope on Step 3 — the banner exists
  // because we opened in a scope-pre-filled context, but it always
  // reads the live current scope so the user knows where they stand.
  // Hidden when the flow was opened from the general "+ Set a goal"
  // button (initialScope is null).
  const showScopeBanner = !!initialScope && draft.scope !== null;

  return (
    <Modal open={open} onClose={handleClose} title={step.title} footer={footer}>
      {showScopeBanner && (
        <div className="rounded-md border border-fluent/30 bg-fluent/5 px-3 py-2 mb-3 text-xs font-medium text-fluent">
          Setting up a {SCOPE_LABEL[draft.scope!]} goal
        </div>
      )}
      {renderStep(step, draft, selectModule, updateDraft)}
    </Modal>
  );
}

function renderStep(
  step: StepDef,
  draft: Draft,
  selectModule: (id: ModuleCardId) => void,
  updateDraft: (patch: Partial<Draft>) => void,
) {
  switch (step.id) {
    case '1':
      return <Step1ModuleCards selectedId={draft.moduleId} onSelect={selectModule} />;
    case '2':
      return <Step2View draft={draft} onUpdate={updateDraft} />;
    case '3':
      return <Step3View draft={draft} onUpdate={updateDraft} />;
    case '3.5':
      return <Step3HalfView draft={draft} onUpdate={updateDraft} />;
    case '4':
      return <Step4View draft={draft} />;
    default:
      return (
        <div className="min-h-[200px] flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
          {step.label} — placeholder
        </div>
      );
  }
}

// ---- Step 1 view ---------------------------------------------------

function Step1ModuleCards({
  selectedId,
  onSelect,
}: {
  selectedId: ModuleCardId | null;
  onSelect: (id: ModuleCardId) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {MODULE_CARDS.map(card => (
        <ModuleCardButton
          key={card.id}
          card={card}
          selected={selectedId === card.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function ModuleCardButton({
  card,
  selected,
  onSelect,
}: {
  card: ModuleCard;
  selected: boolean;
  onSelect: (id: ModuleCardId) => void;
}) {
  // Hex alpha suffixes mirror the existing Dashboard / SkillsCatalogue
  // pattern: 33 (~20%) for the resting border tint, full hex on hover
  // and selected, 0f (~6%) for the transient hover wash, 1a (~10%)
  // for the sticky selected fill.
  const accentHex = accentHexForCard(card.id);
  const restBorder = `${accentHex}33`;
  const fullBorder = accentHex;
  const hoverBg = `${accentHex}0f`;
  const selectedBg = `${accentHex}1a`;

  return (
    <button
      type="button"
      onClick={() => onSelect(card.id)}
      aria-pressed={selected}
      onMouseEnter={selected ? undefined : (e) => {
        e.currentTarget.style.borderColor = fullBorder;
        e.currentTarget.style.backgroundColor = hoverBg;
      }}
      onMouseLeave={selected ? undefined : (e) => {
        e.currentTarget.style.borderColor = restBorder;
        e.currentTarget.style.backgroundColor = '';
      }}
      style={{
        borderColor: selected ? fullBorder : restBorder,
        backgroundColor: selected ? selectedBg : undefined,
      }}
      className="text-left flex flex-col items-start rounded-card border p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
    >
      <div className="text-sm font-medium tracking-tight" style={{ color: accentHex }}>
        {card.name}
      </div>
      <div className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
        {card.description}
      </div>
      <div className="mt-2 text-xs italic text-neutral-500 dark:text-neutral-400 leading-relaxed">
        “{card.example}”
      </div>
    </button>
  );
}

// ---- Step 2 dispatcher ---------------------------------------------

function Step2View({
  draft,
  onUpdate,
}: {
  draft: Draft;
  onUpdate: (patch: Partial<Draft>) => void;
}) {
  switch (draft.moduleId) {
    case 'repertoire':
      return <Step2SongRepertoire draft={draft} onUpdate={onUpdate} />;
    case 'ear-training':
      return <Step2EarTraining draft={draft} onUpdate={onUpdate} />;
    case 'harmonic-fluency':
      return <Step2HarmonicFluency draft={draft} onUpdate={onUpdate} />;
    case 'shapes-and-patterns':
      return <Step2ShapesPatterns draft={draft} onUpdate={onUpdate} />;
    case 'production':
      return <Step2Production draft={draft} onUpdate={onUpdate} />;
    case 'practice-consistency':
      return <Step2PracticeConsistency draft={draft} onUpdate={onUpdate} />;
    case null:
    default:
      // Defensive — `null` shouldn't be reachable since Step 1 gates
      // Next on module being set, and the six concrete cases above
      // exhaust ModuleCardId. The default arm keeps types honest.
      return (
        <div className="min-h-[200px] flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
          Pick a module first.
        </div>
      );
  }
}

// ---- Step 2 — Song Repertoire --------------------------------------

function Step2SongRepertoire({
  draft,
  onUpdate,
}: {
  draft: Draft;
  onUpdate: (patch: Partial<Draft>) => void;
}) {
  // Live song list + want-to-learn backlog for the picker. Both
  // tables are small; client-side filter / sort.
  const allSongs = useLiveQuery(
    () => db.songs.toArray(),
    [],
    [] as Song[],
  );
  const wantToLearn = useLiveQuery(
    () => db.wantToLearn.toArray(),
    [],
    [] as WantToLearnEntry[],
  );
  const songRecord = useMemo(
    () => draft.songId ? allSongs.find(s => s.id === draft.songId) : undefined,
    [allSongs, draft.songId],
  );
  // True only when we know the song list has loaded but the picked
  // song isn't in it (e.g., deleted between sessions). While the
  // initial query is pending `allSongs` is the empty-array default,
  // so we'd false-positive without the loaded-check.
  const songMissing = draft.songId !== null && allSongs.length > 0 && !songRecord;

  // Matrix queries — only meaningful with a song picked. Returning
  // empty-array defaults keeps the hook order stable.
  const matrixSongKeys = useLiveQuery(
    () => {
      if (!draft.songId) return [] as SongKey[];
      return db.songKeys.where('songId').equals(draft.songId).toArray();
    },
    [draft.songId],
    [] as SongKey[],
  );
  const matrixSongCells = useLiveQuery(
    () => {
      if (!draft.songId) return [] as SongCell[];
      return db.songCells.where('songId').equals(draft.songId).toArray();
    },
    [draft.songId],
    [] as SongCell[],
  );
  const matrixSections = useLiveQuery(
    () => {
      if (!draft.songId) return [] as SongMatrixSection[];
      return db.songMatrixSections.where('songId').equals(draft.songId).sortBy('displayOrder');
    },
    [draft.songId],
    [] as SongMatrixSection[],
  );

  // Mount-time decay snapshot — matches GoalFormModal's pattern.
  // Re-mounting via Step 1 → Step 2 navigation refreshes it, which
  // is fine for daily-resolution decay.
  const [now] = useState(() => Date.now());

  const visibleMatrixSections = useMemo(
    () => matrixSections.filter(s => !s.isArchived),
    [matrixSections],
  );
  const sectionAvailable = visibleMatrixSections.length > 0;
  // TODO (build step 9): wire to draft.scope once Step 3 lands.
  // Section granularity is gated on weekly scope per spec; until
  // scope is collected, treat the slot as eligible so users can
  // pick section now and we'll validate at Step 3 / Step 4.
  const sectionWeeklyEligible = true;

  const songLevelState = useMemo(
    () => songRecord
      ? computeSongLevelState(matrixSongKeys, matrixSongCells, visibleMatrixSections.length, now)
      : null,
    [songRecord, matrixSongKeys, matrixSongCells, visibleMatrixSections.length, now],
  );
  const originalMatrixKey = useMemo(
    () => matrixSongKeys.find(k => k.isOriginalKey) ?? null,
    [matrixSongKeys],
  );
  const keyStateHints = useMemo(
    () => songRecord
      ? buildKeyStateHints(matrixSongKeys, now)
      : new Map<string, KeyStateHint>(),
    [songRecord, matrixSongKeys, now],
  );
  const sectionNamesById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of visibleMatrixSections) m.set(s.id, s.name);
    return m;
  }, [visibleMatrixSections]);

  const setSongTarget = (next: SongTargetSelection) => {
    onUpdate({ songTarget: next });
  };
  const setSongId = (id: string | null) => {
    // Clear target when song changes — different song, different
    // matrix data, and the previously-picked section ID may not
    // exist on the new song.
    onUpdate({
      songId: id,
      songTarget: defaultSongTarget(),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <SongPicker
        songs={allSongs}
        wantToLearn={wantToLearn}
        selectedSongId={draft.songId}
        onSelect={setSongId}
      />
      {draft.songId && songRecord && (
        <>
          <SongTargetSection
            song={songRecord}
            songMissing={songMissing}
            selection={draft.songTarget}
            onChange={setSongTarget}
            sectionAvailable={sectionAvailable}
            sectionWeeklyEligible={sectionWeeklyEligible}
            songLevelState={songLevelState}
            originalMatrixKey={originalMatrixKey}
            visibleMatrixSections={visibleMatrixSections}
            keyStateHints={keyStateHints}
            now={now}
          />
          <SongPreview
            selection={draft.songTarget}
            song={songRecord}
            sectionNamesById={sectionNamesById}
          />
        </>
      )}
    </div>
  );
}

function SongPicker({
  songs,
  wantToLearn,
  selectedSongId,
  onSelect,
}: {
  songs: ReadonlyArray<Song>;
  wantToLearn: ReadonlyArray<WantToLearnEntry>;
  selectedSongId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [pendingPromote, setPendingPromote] = useState<WantToLearnEntry | null>(null);
  const [promoting, setPromoting] = useState(false);
  const selectedSong = selectedSongId ? songs.find(s => s.id === selectedSongId) : undefined;

  const filteredSongs = useMemo(() => {
    const sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title));
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(s => s.title.toLowerCase().includes(q));
  }, [songs, query]);

  const filteredWants = useMemo(() => {
    const sorted = [...wantToLearn].sort((a, b) => a.title.localeCompare(b.title));
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(w => w.title.toLowerCase().includes(q));
  }, [wantToLearn, query]);

  // Custom div+span structure rather than the shared Field component
  // (which wraps in <label>) — labelling an input + a list of buttons
  // with one <label> can cause browsers to delegate the button clicks
  // to the input via the labeled-control activation behavior.

  // Pending-promote intermediate state — surfaced when a Want-to-Learn
  // entry is clicked. Explicit consent before the row gets converted
  // to an active Song. Mirrors the existing AddSongModal / WantToLearnView
  // promote pattern: setting a goal is itself a strong commitment, but
  // we still ask before mutating the source-of-truth.
  if (pendingPromote && !selectedSong) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">Song</span>
        <div className="rounded-md border border-fluent/30 bg-fluent/5 px-3 py-3 flex flex-col gap-2">
          <div>
            <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
              {pendingPromote.title}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {pendingPromote.artist}
            </div>
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            This song is in Want to Learn. Setting a goal will move it to your active repertoire.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                setPromoting(true);
                try {
                  const newId = await promoteWantToLearnEntry(pendingPromote);
                  setPendingPromote(null);
                  setQuery('');
                  onSelect(newId);
                } catch (err) {
                  console.warn('[goal-flow] promote failed', err);
                  setPromoting(false);
                }
              }}
              disabled={promoting}
              className="px-3 py-1.5 text-xs rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {promoting ? 'Moving…' : 'Move and continue'}
            </button>
            <button
              type="button"
              onClick={() => setPendingPromote(null)}
              disabled={promoting}
              className="px-3 py-1.5 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedSong) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">Song</span>
        <div className="flex items-center justify-between gap-2 rounded-md border border-fluent/30 bg-fluent/5 px-3 py-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
              {selectedSong.title}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {selectedSong.artist}{selectedSong.key ? ` • ${selectedSong.key}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onSelect(null); setQuery(''); }}
            className="shrink-0 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  // Default browse view — both sections always visible, search
  // filters in place.
  const noResults = filteredSongs.length === 0 && filteredWants.length === 0;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">Song</span>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search songs by title…"
        className={inputClass()}
      />
      <div className="mt-1.5 flex flex-col rounded-md border border-neutral-200 dark:border-neutral-800 max-h-72 overflow-y-auto">
        {filteredSongs.length > 0 && (
          <>
            <SongPickerSectionHeader>Active repertoire</SongPickerSectionHeader>
            {filteredSongs.map(song => (
              <SongPickerRow
                key={song.id}
                title={song.title}
                subtitle={`${song.artist}${song.key ? ` • ${song.key}` : ''}`}
                onClick={() => onSelect(song.id)}
              />
            ))}
          </>
        )}
        {filteredWants.length > 0 && (
          <>
            <SongPickerSectionHeader>Want to learn</SongPickerSectionHeader>
            {filteredWants.map(entry => (
              <SongPickerRow
                key={entry.id}
                title={entry.title}
                subtitle={entry.artist}
                onClick={() => setPendingPromote(entry)}
              />
            ))}
          </>
        )}
        {noResults && (
          <div className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400 italic">
            {query.trim() ? `No songs match “${query}”.` : 'No songs in your library yet.'}
          </div>
        )}
      </div>
    </div>
  );
}

function SongPickerSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800">
      {children}
    </div>
  );
}

function SongPickerRow({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/60 border-b border-neutral-100 dark:border-neutral-800 last:border-b-0"
    >
      <div className="font-medium text-neutral-800 dark:text-neutral-100 truncate">
        {title}
      </div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
        {subtitle}
      </div>
    </button>
  );
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

/**
 * Promote a Want-to-Learn entry into an active Song record. Mirrors
 * the existing flow in `WantToLearnView.promote` and `AddSongModal`'s
 * Path A: creates a Song row with the entry's title / artist / why,
 * seeds three default sections (Verse / Chorus / Bridge) so the
 * old-schema sections aren't empty, and deletes the source entry —
 * all in one transaction so a partial failure doesn't strand data.
 *
 * Returns the new song's id so the caller can immediately wire it
 * into the goal's selection.
 */
async function promoteWantToLearnEntry(entry: WantToLearnEntry): Promise<string> {
  const now = Date.now();
  const songId = uid('song');
  const song: Song = {
    id: songId,
    title: entry.title,
    artist: entry.artist,
    description: entry.why,
    stage: DEFAULT_STAGE,
    audioLinks: entry.link ? [entry.link] : [],
    youtubeLink: entry.link?.includes('youtube') ? entry.link : undefined,
    spotifyLink: entry.link?.includes('spotify') ? entry.link : undefined,
    addedDate: now,
  };
  const sections: SongSection[] = ['Verse', 'Chorus', 'Bridge'].map((name, idx) => ({
    id: uid('section'),
    songId,
    name,
    order: idx,
    lyrics: '',
  }));
  await db.transaction('rw', [db.songs, db.songSections, db.wantToLearn], async () => {
    await db.songs.add(song);
    await db.songSections.bulkAdd(sections);
    await db.wantToLearn.delete(entry.id);
  });
  return songId;
}

// ---- Step 2 — Ear Training -----------------------------------------

/**
 * Drill-type catalog for the ear-training accuracy picker. IDs are
 * stable identifiers the Practice Sessions algorithm (Phase 3) will
 * read from saved goals; labels mirror what users see in the actual
 * ear-training quiz UI verbatim — including casing — so the goal
 * flow doesn't introduce a second vocabulary for the same thing.
 *
 * Casing is intentionally mixed: top-level drills are lowercase
 * because the ear-training nav tabs are lowercase, but Chord
 * Recognition's subtypes are title case because the chord-recognition
 * quiz's section labels are title case. Honest to source-of-truth.
 */
interface DrillType {
  id: string;
  label: string;
  subtypes: ReadonlyArray<{ id: string; label: string }>;
}

const EAR_TRAINING_DRILL_TYPES: ReadonlyArray<DrillType> = [
  {
    id: 'intervals',
    label: 'intervals',
    subtypes: [
      { id: 'ascending',  label: 'ascending'  },
      { id: 'descending', label: 'descending' },
      { id: 'both',       label: 'both'       },
    ],
  },
  {
    id: 'chord-recognition',
    label: 'chord recognition',
    subtypes: [
      { id: 'foundational', label: 'Foundational Triads' },
      { id: 'seventh',      label: 'Seventh Chords'      },
      { id: 'dominant',     label: 'Dominant Variations' },
      { id: 'extensions',   label: 'Extensions & Colors' },
    ],
  },
  {
    id: 'chord-progressions',
    label: 'chord progressions',
    subtypes: [
      { id: 'key-detection',    label: 'key detection'    },
      { id: 'chord-motion',     label: 'chord motion'     },
      { id: 'full-progression', label: 'full progression' },
    ],
  },
  {
    id: 'scales-modes',
    label: 'scales & modes',
    subtypes: [
      { id: 'modes',                label: 'modes'                },
      { id: 'minor-scale-variants', label: 'minor scale variants' },
    ],
  },
];

const ACCURACY_PCT_MIN = 50;
const ACCURACY_PCT_MAX = 95;
const ACCURACY_PCT_STEP = 5;

/**
 * Coverage-target groups for ear training. Each group's `denominator`
 * is the count of distinct catalog items the user must reach
 * `acquired` stage on for that group to count as covered.
 *
 * Counts mirror the Phase 2 audit: 26 intervals (13 × 2 directions) +
 * 30 chord-recognition + 69 chord-progressions + 18 scales-modes
 * (9 modes × 2 tabs) = 143 total.
 *
 * TODO 2/3: replace these hardcoded denominators with the live
 * `moduleItemCounts` helper when step 3 ships, so content additions
 * (new modes, new chord progressions) update automatically. The
 * helper's single source of truth lives in the catalogs.
 */
const EAR_TRAINING_COVERAGE_GROUPS = [
  { id: 'intervals',          label: 'intervals',          denominator: 26 },
  { id: 'chord-recognition',  label: 'chord recognition',  denominator: 30 },
  { id: 'chord-progressions', label: 'chord progressions', denominator: 69 },
  { id: 'scales-modes',       label: 'scales & modes',     denominator: 18 },
] as const;

const EAR_TRAINING_TOTAL_ITEMS = EAR_TRAINING_COVERAGE_GROUPS
  .reduce((sum, g) => sum + g.denominator, 0);

function Step2EarTraining({
  draft,
  onUpdate,
}: {
  draft: Draft;
  onUpdate: (patch: Partial<Draft>) => void;
}) {
  const target = draft.earTraining;
  const setTarget = (next: EarTrainingTarget) => onUpdate({ earTraining: next });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Pick at least one target. You can combine coverage, accuracy, and consistency on a single goal.
      </p>
      <EarTrainingCoverageCard target={target} onChange={setTarget} />
      <AccuracyTargetCard target={target} onChange={setTarget} />
      <ConsistencyTargetCard target={target} onChange={setTarget} />
      <EarTrainingPreview target={target} />
    </div>
  );
}

function EarTrainingCoverageCard({
  target,
  onChange,
}: {
  target: EarTrainingTarget;
  onChange: (next: EarTrainingTarget) => void;
}) {
  const earTrainingAccent =
    moduleMetaById('ear-training')?.accentHex ?? '#5a8752';
  const toggle = () => onChange({ ...target, coverageEnabled: !target.coverageEnabled });
  const setScope = (scope: EarTrainingTarget['coverageScope']) => {
    if (scope === target.coverageScope) return;
    // Switching to 'overall' clears the group picks so we don't carry
    // stale specific selections. Switching to 'specific' leaves them
    // empty for the user to fill in.
    onChange({
      ...target,
      coverageScope: scope,
      coverageGroupIds: scope === 'overall' ? [] : target.coverageGroupIds,
    });
  };
  const toggleGroup = (id: string) => {
    const next = target.coverageGroupIds.includes(id)
      ? target.coverageGroupIds.filter(x => x !== id)
      : [...target.coverageGroupIds, id];
    onChange({ ...target, coverageGroupIds: next });
  };

  return (
    <ToggleCard
      title="Coverage target"
      hint="Reach the acquired stage on every item in the module — or one or more chosen groups."
      enabled={target.coverageEnabled}
      onToggle={toggle}
    >
      <Field label="Scope">
        <div className="flex gap-1.5">
          <PillButton
            label={`All of ear training (${EAR_TRAINING_TOTAL_ITEMS} items)`}
            active={target.coverageScope === 'overall'}
            onClick={() => setScope('overall')}
          />
          <PillButton
            label="One or more groups"
            active={target.coverageScope === 'specific'}
            onClick={() => setScope('specific')}
          />
        </div>
      </Field>
      {target.coverageScope === 'specific' && (
        <Field label="Groups (pick one or more)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {EAR_TRAINING_COVERAGE_GROUPS.map(group => (
              <CategoryPillButton
                key={group.id}
                label={`${group.label} (${group.denominator} items)`}
                accentHex={earTrainingAccent}
                active={target.coverageGroupIds.includes(group.id)}
                onClick={() => toggleGroup(group.id)}
              />
            ))}
          </div>
        </Field>
      )}
    </ToggleCard>
  );
}

function AccuracyTargetCard({
  target,
  onChange,
}: {
  target: EarTrainingTarget;
  onChange: (next: EarTrainingTarget) => void;
}) {
  const drill = EAR_TRAINING_DRILL_TYPES.find(d => d.id === target.drillTypeId) ?? null;

  const toggle = () => onChange({ ...target, accuracyEnabled: !target.accuracyEnabled });
  const setScope = (scope: EarTrainingTarget['accuracyScope']) => {
    if (scope === target.accuracyScope) return;
    // Switching to 'overall' clears the cascade so we don't carry a
    // stale specific pick. Switching to 'specific' leaves them empty
    // for the user to fill in.
    onChange({
      ...target,
      accuracyScope: scope,
      drillTypeId: scope === 'overall' ? null : target.drillTypeId,
      drillSubtypeId: scope === 'overall' ? null : target.drillSubtypeId,
    });
  };
  const setDrillType = (id: string) => {
    // Resetting subtype on type change — the previous subtype belongs
    // to a different drill and would encode a nonsense combination.
    onChange({ ...target, drillTypeId: id || null, drillSubtypeId: null });
  };
  const setDrillSubtype = (id: string) => {
    onChange({ ...target, drillSubtypeId: id || null });
  };
  const setPercent = (p: number) => {
    onChange({ ...target, accuracyPercent: p });
  };

  return (
    <ToggleCard
      title="Accuracy target"
      hint="Reach a target accuracy percentage."
      enabled={target.accuracyEnabled}
      onToggle={toggle}
    >
      <Field label="Scope">
        <div className="flex gap-1.5">
          <PillButton
            label="Overall accuracy"
            active={target.accuracyScope === 'overall'}
            onClick={() => setScope('overall')}
          />
          <PillButton
            label="Specific drill type"
            active={target.accuracyScope === 'specific'}
            onClick={() => setScope('specific')}
          />
        </div>
      </Field>
      {target.accuracyScope === 'specific' && (
        <>
          <Field label="Drill type">
            <select
              value={target.drillTypeId ?? ''}
              onChange={e => setDrillType(e.target.value)}
              className={inputClass()}
            >
              <option value="">Pick a drill type…</option>
              {EAR_TRAINING_DRILL_TYPES.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </Field>
          {drill && (
            <Field label="Subtype">
              <select
                value={target.drillSubtypeId ?? ''}
                onChange={e => setDrillSubtype(e.target.value)}
                className={inputClass()}
              >
                <option value="">Pick a subtype…</option>
                {drill.subtypes.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </Field>
          )}
        </>
      )}
      <Field label={`Accuracy: ${target.accuracyPercent}%`}>
        <input
          type="range"
          min={ACCURACY_PCT_MIN}
          max={ACCURACY_PCT_MAX}
          step={ACCURACY_PCT_STEP}
          value={target.accuracyPercent}
          onChange={e => setPercent(Number(e.target.value))}
          className="w-full"
          aria-label="Target accuracy percentage"
        />
      </Field>
    </ToggleCard>
  );
}

/**
 * Generic over any target shape that carries the standard consistency
 * triple. Both EarTrainingTarget and HarmonicFluencyTarget satisfy
 * this — and any future module's accuracy+consistency target can
 * reuse the card by adopting the same field names.
 */
interface ConsistencyFields {
  consistencyEnabled: boolean;
  consistencyCount: number;
  consistencyCadence: 'week' | 'month';
}

function ConsistencyTargetCard<T extends ConsistencyFields>({
  target,
  onChange,
  unitLabel = 'Sessions',
  hint = 'Show up regularly — sessions per week or month.',
  cardTitle = 'Consistency target',
}: {
  target: T;
  onChange: (next: T) => void;
  /** Field label and ARIA label for the count input. Defaults to
   *  "Sessions" — modules that consume minutes (e.g., Shapes &
   *  Patterns) or hours (e.g., Production) override accordingly. */
  unitLabel?: string;
  /** Card-header hint text. Defaults to the sessions phrasing;
   *  override per module to keep the unit honest. */
  hint?: string;
  /** Card-header title. Defaults to "Consistency target" — Production
   *  overrides with "Time target" since hours-as-time reads more
   *  naturally there. */
  cardTitle?: string;
}) {
  const toggle = () => onChange({ ...target, consistencyEnabled: !target.consistencyEnabled });
  const setCount = (n: number) => {
    // Allow empty string to read as 0 from the input; clamp at 1
    // floor on save / preview but keep the raw value for editing fluency.
    onChange({ ...target, consistencyCount: Number.isFinite(n) ? n : 0 });
  };
  const setCadence = (c: 'week' | 'month') => {
    if (c === target.consistencyCadence) return;
    onChange({ ...target, consistencyCadence: c });
  };

  return (
    <ToggleCard
      title={cardTitle}
      hint={hint}
      enabled={target.consistencyEnabled}
      onToggle={toggle}
    >
      <div className="flex items-end gap-2">
        <Field label={unitLabel}>
          <input
            type="number"
            min={1}
            value={target.consistencyCount === 0 ? '' : target.consistencyCount}
            onChange={e => setCount(Number(e.target.value))}
            className={`${inputClass()} w-20`}
            aria-label={`${unitLabel} per cadence`}
          />
        </Field>
        <div className="flex gap-1.5 pb-[2px]">
          <PillButton
            label="per week"
            active={target.consistencyCadence === 'week'}
            onClick={() => setCadence('week')}
          />
          <PillButton
            label="per month"
            active={target.consistencyCadence === 'month'}
            onClick={() => setCadence('month')}
          />
        </div>
      </div>
    </ToggleCard>
  );
}

function ToggleCard({
  title,
  hint,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-md border transition ${
        enabled
          ? 'border-fluent/40 bg-fluent/5'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={enabled}
        aria-expanded={enabled}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/40 rounded-t-md"
      >
        <CheckboxIndicator checked={enabled} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
            {title}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {hint}
          </div>
        </div>
      </button>
      {enabled && (
        <div className="px-3 pb-3 pt-2 border-t border-fluent/30 flex flex-col gap-3">
          {children}
        </div>
      )}
    </div>
  );
}

function CheckboxIndicator({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center transition ${
        checked
          ? 'bg-fluent border-fluent text-white'
          : 'border-neutral-400 dark:border-neutral-600 bg-white dark:bg-neutral-900'
      }`}
    >
      {checked && (
        <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-current">
          <path d="M3.7 7.5 L1 4.8 L1.9 3.9 L3.7 5.7 L8.1 1.3 L9 2.2 Z" />
        </svg>
      )}
    </span>
  );
}

function PillButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'px-3 py-1.5 text-sm rounded-md border transition',
        active
          ? 'border-fluent bg-fluent/10 text-fluent'
          : 'border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent/60',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function EarTrainingPreview({ target }: { target: EarTrainingTarget }) {
  return <TargetPreview text={previewEarTrainingTarget(target)} />;
}

/**
 * Shared preview block — fluent-tinted card with the natural-language
 * goal text, or an empty-state hint. Used by the per-module previews
 * (ear training, harmonic fluency, and future modules) so the
 * presentation stays identical across surfaces while each owns its
 * own text-rendering helper.
 */
function TargetPreview({ text }: { text: string | null }) {
  return (
    <div className="rounded-md border border-fluent/30 bg-fluent/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-fluent mb-0.5">Preview</div>
      <div className="text-sm text-neutral-800 dark:text-neutral-100">
        {text ?? <span className="text-neutral-500 italic">Pick a target above to preview your goal.</span>}
      </div>
    </div>
  );
}

/**
 * Natural-language preview rendering. Matches spec example phrasing:
 *   accuracy-only / overall:   "Improve my overall ear training accuracy to 75%"
 *   accuracy-only / specific:  "Reach 80% accuracy on chord recognition — Seventh Chords"
 *   consistency-only:          "Practice ear training at least 4 times a week"
 *   both combined:             "<accuracy clause> and practice at least 3 times a week"
 *
 * Module name is included only on the leading clause for natural read.
 */
function previewEarTrainingTarget(target: EarTrainingTarget): string | null {
  const parts: string[] = [];
  if (target.coverageEnabled) {
    if (target.coverageScope === 'overall') {
      parts.push(`Cover all ${EAR_TRAINING_TOTAL_ITEMS} ear training items (acquired)`);
    } else {
      const picked = EAR_TRAINING_COVERAGE_GROUPS.filter(g =>
        target.coverageGroupIds.includes(g.id),
      );
      if (picked.length === 0) return parts.length > 0 ? parts.join(' and ') : null;
      const totalDenominator = picked.reduce((sum, g) => sum + g.denominator, 0);
      const labelList = joinAnd(picked.map(g => g.label));
      const itemPhrase = picked.length === 1 ? `items in ${labelList}` : `items across ${labelList}`;
      parts.push(`Cover all ${totalDenominator} ${itemPhrase} (acquired)`);
    }
  }
  if (target.accuracyEnabled) {
    if (target.accuracyScope === 'overall') {
      parts.push(`Improve my overall ear training accuracy to ${target.accuracyPercent}%`);
    } else {
      const drill = EAR_TRAINING_DRILL_TYPES.find(d => d.id === target.drillTypeId);
      const subtype = drill?.subtypes.find(s => s.id === target.drillSubtypeId);
      if (!drill || !subtype) return null;
      parts.push(`Reach ${target.accuracyPercent}% accuracy on ${drill.label} — ${subtype.label}`);
    }
  }
  if (target.consistencyEnabled) {
    if (target.consistencyCount < 1) return parts.length > 0 ? parts.join(' and ') : null;
    const verb = parts.length === 0 ? 'Practice ear training' : 'practice';
    const times = target.consistencyCount === 1 ? 'time' : 'times';
    const cadence = target.consistencyCadence;
    parts.push(`${verb} at least ${target.consistencyCount} ${times} a ${cadence}`);
  }
  if (parts.length === 0) return null;
  return parts.join(' and ');
}

// ---- Step 2 — Harmonic Fluency -------------------------------------

/**
 * 12 flashcard categories grouped into 4 sections per the spec.
 * Group titles are spec-locked; category IDs and labels resolve
 * through `harmonic-fluency/catalog` so the goal flow stays in
 * lockstep with the existing module's vocabulary if a label is ever
 * retuned.
 */
interface HarmonicFluencyGroup {
  id: string;
  title: string;
  /** Subtle accent borrowed from an existing module's canonical hex —
   *  resolved through moduleMetaById / *_META exports so the goal flow
   *  stays in lockstep with the rest of the app if a hex is retuned.
   *  Used for the group header text and the resting border tint of
   *  each category card. Selected state stays fluent (HF's parent
   *  accent) so the chosen category reads as "selected for this
   *  harmonic fluency goal" rather than "selected within group". */
  accentHex: string;
  categories: ReadonlyArray<FlashcardCategory>;
}

const HARMONIC_FLUENCY_GROUPS: ReadonlyArray<HarmonicFluencyGroup> = [
  {
    id: 'foundational',
    title: 'Foundational / Math',
    accentHex: DASHBOARD_META.accentHex,                                // slate-blue
    categories: ['scale-degree-math', 'named-notes', 'key-signatures'],
  },
  {
    id: 'chord-knowledge',
    title: 'Chord Knowledge',
    accentHex: moduleMetaById('repertoire')?.accentHex ?? '#a8556b',    // deep rose
    categories: ['diatonic-qualities', 'chord-construction', 'slash-chords'],
  },
  {
    id: 'functional-applied',
    title: 'Functional / Applied',
    accentHex: PRACTICE_SESSIONS_META.accentHex,                        // teal
    categories: ['functional-harmony', 'reverse-key-pivots', 'progressions'],
  },
  {
    id: 'ear-recognition',
    title: 'Ear & Recognition',
    accentHex: moduleMetaById('ear-training')?.accentHex ?? '#5a8752',  // forest green — direct semantic match
    categories: ['modes', 'intervals', 'ear-theory'],
  },
];

/**
 * Coverage-target groups for harmonic fluency. Each group's
 * `denominator` is the count of distinct flashcards the user must
 * reach `acquired` stage on for that group to count as covered.
 *
 * Counts are sums across the categories that make up each group
 * (categories are still listed in HARMONIC_FLUENCY_GROUPS for the
 * accuracy-specific picker — coverage uses the whole-group level
 * instead, which is a different concern, so the two constants are
 * kept separate).
 *
 *   foundational       = sdm 84 + nn 24 + ks 22 = 130
 *   chord-knowledge    = dq 20 + cc 20 + sc 15  = 55
 *   functional-applied = fh 19 + rkp 24 + pr 20 = 63
 *   ear-recognition    = mo 19 + iv 20 + et 15  = 54
 *   total                                        = 302
 *
 * Accent colors mirror HARMONIC_FLUENCY_GROUPS so the coverage pills
 * read the same as the existing accuracy-specific picker.
 *
 * TODO 2/3: replace these hardcoded denominators with the live
 * `moduleItemCounts` helper when step 3 ships, so catalog churn
 * (new categories, retuned cards) updates automatically.
 */
interface HarmonicFluencyCoverageGroup {
  id: string;
  label: string;
  denominator: number;
  accentHex: string;
}

const HARMONIC_FLUENCY_COVERAGE_GROUPS: ReadonlyArray<HarmonicFluencyCoverageGroup> = [
  { id: 'foundational',       label: 'foundational / math',  denominator: 130, accentHex: DASHBOARD_META.accentHex },
  { id: 'chord-knowledge',    label: 'chord knowledge',      denominator: 55,  accentHex: moduleMetaById('repertoire')?.accentHex ?? '#a8556b' },
  { id: 'functional-applied', label: 'functional / applied', denominator: 63,  accentHex: PRACTICE_SESSIONS_META.accentHex },
  { id: 'ear-recognition',    label: 'ear & recognition',    denominator: 54,  accentHex: moduleMetaById('ear-training')?.accentHex ?? '#5a8752' },
];

const HARMONIC_FLUENCY_TOTAL_ITEMS = HARMONIC_FLUENCY_COVERAGE_GROUPS
  .reduce((sum, g) => sum + g.denominator, 0);

function Step2HarmonicFluency({
  draft,
  onUpdate,
}: {
  draft: Draft;
  onUpdate: (patch: Partial<Draft>) => void;
}) {
  const target = draft.harmonicFluency;
  const setTarget = (next: HarmonicFluencyTarget) => onUpdate({ harmonicFluency: next });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Pick at least one target. You can combine coverage, accuracy, and consistency on a single goal.
      </p>
      <HarmonicFluencyCoverageCard target={target} onChange={setTarget} />
      <HarmonicFluencyAccuracyCard target={target} onChange={setTarget} />
      <ConsistencyTargetCard target={target} onChange={setTarget} />
      <TargetPreview text={previewHarmonicFluencyTarget(target)} />
    </div>
  );
}

function HarmonicFluencyCoverageCard({
  target,
  onChange,
}: {
  target: HarmonicFluencyTarget;
  onChange: (next: HarmonicFluencyTarget) => void;
}) {
  const toggle = () => onChange({ ...target, coverageEnabled: !target.coverageEnabled });
  const setScope = (scope: HarmonicFluencyTarget['coverageScope']) => {
    if (scope === target.coverageScope) return;
    // Same reset semantics as ear-training's coverage card: switching
    // to 'overall' clears the group picks; switching to 'specific'
    // leaves them empty for the user to fill in.
    onChange({
      ...target,
      coverageScope: scope,
      coverageGroupIds: scope === 'overall' ? [] : target.coverageGroupIds,
    });
  };
  const toggleGroup = (id: string) => {
    const next = target.coverageGroupIds.includes(id)
      ? target.coverageGroupIds.filter(x => x !== id)
      : [...target.coverageGroupIds, id];
    onChange({ ...target, coverageGroupIds: next });
  };

  return (
    <ToggleCard
      title="Coverage target"
      hint="Reach the acquired stage on every flashcard in the module — or one or more chosen groups."
      enabled={target.coverageEnabled}
      onToggle={toggle}
    >
      <Field label="Scope">
        <div className="flex gap-1.5">
          <PillButton
            label={`All of harmonic fluency (${HARMONIC_FLUENCY_TOTAL_ITEMS} items)`}
            active={target.coverageScope === 'overall'}
            onClick={() => setScope('overall')}
          />
          <PillButton
            label="One or more groups"
            active={target.coverageScope === 'specific'}
            onClick={() => setScope('specific')}
          />
        </div>
      </Field>
      {target.coverageScope === 'specific' && (
        <Field label="Groups (pick one or more)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {HARMONIC_FLUENCY_COVERAGE_GROUPS.map(group => (
              <CategoryPillButton
                key={group.id}
                label={`${group.label} (${group.denominator} items)`}
                accentHex={group.accentHex}
                active={target.coverageGroupIds.includes(group.id)}
                onClick={() => toggleGroup(group.id)}
                selectedStyle="accent"
              />
            ))}
          </div>
        </Field>
      )}
    </ToggleCard>
  );
}

function HarmonicFluencyAccuracyCard({
  target,
  onChange,
}: {
  target: HarmonicFluencyTarget;
  onChange: (next: HarmonicFluencyTarget) => void;
}) {
  const toggle = () => onChange({ ...target, accuracyEnabled: !target.accuracyEnabled });
  const setScope = (scope: HarmonicFluencyTarget['accuracyScope']) => {
    if (scope === target.accuracyScope) return;
    onChange({
      ...target,
      accuracyScope: scope,
      categoryId: scope === 'overall' ? null : target.categoryId,
    });
  };
  const setCategory = (id: FlashcardCategory) => {
    onChange({ ...target, categoryId: id });
  };
  const setPercent = (p: number) => {
    onChange({ ...target, accuracyPercent: p });
  };

  return (
    <ToggleCard
      title="Accuracy target"
      hint="Reach a target accuracy percentage."
      enabled={target.accuracyEnabled}
      onToggle={toggle}
    >
      <Field label="Scope">
        <div className="flex gap-1.5">
          <PillButton
            label="Overall accuracy"
            active={target.accuracyScope === 'overall'}
            onClick={() => setScope('overall')}
          />
          <PillButton
            label="Specific category"
            active={target.accuracyScope === 'specific'}
            onClick={() => setScope('specific')}
          />
        </div>
      </Field>
      {target.accuracyScope === 'specific' && (
        <div className="flex flex-col gap-3">
          {HARMONIC_FLUENCY_GROUPS.map(group => (
            <div key={group.id}>
              <div
                className="text-[10px] uppercase tracking-wide mb-1.5"
                style={{ color: group.accentHex }}
              >
                {group.title}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {group.categories.map(catId => (
                  <CategoryPillButton
                    key={catId}
                    label={CATEGORY_LABELS[catId]}
                    accentHex={group.accentHex}
                    active={target.categoryId === catId}
                    onClick={() => setCategory(catId)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Field label={`Accuracy: ${target.accuracyPercent}%`}>
        <input
          type="range"
          min={ACCURACY_PCT_MIN}
          max={ACCURACY_PCT_MAX}
          step={ACCURACY_PCT_STEP}
          value={target.accuracyPercent}
          onChange={e => setPercent(Number(e.target.value))}
          className="w-full"
          aria-label="Target accuracy percentage"
        />
      </Field>
    </ToggleCard>
  );
}

/**
 * Spec preview phrasing:
 *   accuracy / overall:    "Improve my overall harmonic fluency accuracy to 75%"
 *   accuracy / specific:   "Reach 80% accuracy on Scale Degree Math"
 *   consistency-only:      "Practice harmonic fluency at least 3 times a week"
 *   both:                  "<accuracy> and practice at least 3 times a week"
 *
 * No subtype dash — categories are leaf labels.
 */
function previewHarmonicFluencyTarget(target: HarmonicFluencyTarget): string | null {
  const parts: string[] = [];
  if (target.coverageEnabled) {
    if (target.coverageScope === 'overall') {
      parts.push(`Cover all ${HARMONIC_FLUENCY_TOTAL_ITEMS} harmonic fluency items (acquired)`);
    } else {
      const picked = HARMONIC_FLUENCY_COVERAGE_GROUPS.filter(g =>
        target.coverageGroupIds.includes(g.id),
      );
      if (picked.length === 0) return parts.length > 0 ? parts.join(' and ') : null;
      const totalDenominator = picked.reduce((sum, g) => sum + g.denominator, 0);
      const labelList = joinAnd(picked.map(g => g.label));
      const itemPhrase = picked.length === 1 ? `items in ${labelList}` : `items across ${labelList}`;
      parts.push(`Cover all ${totalDenominator} ${itemPhrase} (acquired)`);
    }
  }
  if (target.accuracyEnabled) {
    if (target.accuracyScope === 'overall') {
      parts.push(`Improve my overall harmonic fluency accuracy to ${target.accuracyPercent}%`);
    } else {
      if (!target.categoryId) return null;
      const label = CATEGORY_LABELS[target.categoryId];
      parts.push(`Reach ${target.accuracyPercent}% accuracy on ${label}`);
    }
  }
  if (target.consistencyEnabled) {
    if (target.consistencyCount < 1) return parts.length > 0 ? parts.join(' and ') : null;
    const verb = parts.length === 0 ? 'Practice harmonic fluency' : 'practice';
    const times = target.consistencyCount === 1 ? 'time' : 'times';
    parts.push(`${verb} at least ${target.consistencyCount} ${times} a ${target.consistencyCadence}`);
  }
  if (parts.length === 0) return null;
  return parts.join(' and ');
}

/**
 * Accent-aware variant of PillButton for the Harmonic Fluency group
 * grid. At rest: 33-alpha border in the group's accent hex (subtle
 * differentiation between the four sections). Hover: full accent.
 * Selected: full fluent (parent module accent) — the chosen category
 * reads as "selected for this HF goal" rather than "selected within
 * its group", and gives all 12 buttons a single shared selected
 * treatment regardless of which group they belong to.
 */
function CategoryPillButton({
  label,
  accentHex,
  active,
  onClick,
  selectedStyle = 'fluent',
}: {
  label: string;
  accentHex: string;
  active: boolean;
  onClick: () => void;
  /** 'fluent' (default): selected pills use the global fluent accent
   *  regardless of `accentHex`. Used by the HF accuracy-specific
   *  picker — the chosen category reads as "selected for this goal",
   *  not "selected within its group", giving all 12 buttons a single
   *  shared selected treatment.
   *
   *  'accent': selected pills use `accentHex` directly (border, tint,
   *  text). Used by the coverage pickers where the GROUP IS the
   *  entity being selected, so the group's identity should persist
   *  visibly in both selected and unselected states. Unselected
   *  pills also use `accentHex` at full opacity (vs. the 33-alpha
   *  rest border in 'fluent' mode) so per-group color is clear at
   *  4-pill scale rather than washed out. */
  selectedStyle?: 'fluent' | 'accent';
}) {
  if (selectedStyle === 'accent') {
    const tint = `${accentHex}1a`;
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        style={active
          ? { borderColor: accentHex, backgroundColor: tint, color: accentHex }
          : { borderColor: accentHex, color: accentHex }
        }
        className="px-3 py-1.5 text-sm rounded-md border transition text-left"
      >
        {label}
      </button>
    );
  }

  // 'fluent' branch — original behavior, unchanged.
  const restBorder = `${accentHex}33`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      onMouseEnter={active ? undefined : (e) => {
        e.currentTarget.style.borderColor = accentHex;
      }}
      onMouseLeave={active ? undefined : (e) => {
        e.currentTarget.style.borderColor = restBorder;
      }}
      style={active ? undefined : { borderColor: restBorder }}
      className={[
        'px-3 py-1.5 text-sm rounded-md border transition text-left',
        active
          ? 'border-fluent bg-fluent/10 text-fluent'
          : 'text-neutral-700 dark:text-neutral-200',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ---- Step 2 — Shapes & Patterns ------------------------------------

interface ShapesActivityAreaDef {
  id: ShapesActivityArea;
  label: string;
}

const SHAPES_ACTIVITY_AREAS: ReadonlyArray<ShapesActivityAreaDef> = [
  { id: 'scale_drills',       label: 'Scale Drills' },
  { id: 'chord_shape_drills', label: 'Chord Shape Drills' },
  { id: 'voice_leading',      label: 'Voice-Leading' },
];

function activityAreaLabel(area: ShapesActivityArea): string {
  return SHAPES_ACTIVITY_AREAS.find(a => a.id === area)?.label ?? area;
}

const SHAPES_LEVELS: ReadonlyArray<{ id: ShapesProficiencyLevel; label: string }> = [
  { id: 'learning',     label: 'Learning'     },
  { id: 'comfortable',  label: 'Comfortable'  },
  { id: 'solid',        label: 'Solid'        },
  { id: 'internalized', label: 'Internalized' },
];

function levelLabel(level: ShapesProficiencyLevel): string {
  return SHAPES_LEVELS.find(l => l.id === level)?.label ?? level;
}

const CHORD_QUALITY_KIND_LABELS: Record<QualityKind, string> = {
  triad:     'Triads',
  seventh:   'Seventh chords',
  extension: 'Extensions',
  special:   'Special',
};
const CHORD_QUALITY_KIND_ORDER: ReadonlyArray<QualityKind> = ['triad', 'seventh', 'extension', 'special'];

/**
 * Resolve the display label for a shape id within an activity area.
 * Returns null when the id can't be found in the relevant catalog —
 * defensive against stale draft state if a shape ever gets removed
 * from the catalog.
 */
function shapeLabel(area: ShapesActivityArea, shapeId: string): string | null {
  if (area === 'scale_drills') {
    return SCALES.find(s => s.id === shapeId)?.label ?? null;
  }
  if (area === 'chord_shape_drills') {
    return CHORD_QUALITIES.find(c => c.id === shapeId)?.label ?? null;
  }
  if (area === 'voice_leading') {
    return VOICE_LEADING_PATTERNS.find(p => p.id === shapeId)?.label ?? null;
  }
  return null;
}

function Step2ShapesPatterns({
  draft,
  onUpdate,
}: {
  draft: Draft;
  onUpdate: (patch: Partial<Draft>) => void;
}) {
  const target = draft.shapesPatterns;
  const setTarget = (next: ShapesPatternsTarget) => onUpdate({ shapesPatterns: next });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Pick at least one target. You can combine proficiency and consistency on a single goal.
      </p>
      <ShapesProficiencyCard target={target} onChange={setTarget} />
      <ConsistencyTargetCard
        target={target}
        onChange={setTarget}
        unitLabel="Minutes"
        hint="Show up regularly — minutes per week or month."
      />
      <TargetPreview text={previewShapesPatternsTarget(target)} />
    </div>
  );
}

function ShapesProficiencyCard({
  target,
  onChange,
}: {
  target: ShapesPatternsTarget;
  onChange: (next: ShapesPatternsTarget) => void;
}) {
  const toggle = () => onChange({ ...target, proficiencyEnabled: !target.proficiencyEnabled });
  const setScope = (scope: ShapesPatternsTarget['proficiencyScope']) => {
    if (scope === target.proficiencyScope) return;
    // Clear specific-only fields when collapsing back to overall;
    // leaving the activity area + level intact since they're shared.
    onChange({
      ...target,
      proficiencyScope: scope,
      shapeId: scope === 'overall' ? null : target.shapeId,
      keyTarget: scope === 'overall' ? 'all' : target.keyTarget,
    });
  };
  const setActivityArea = (area: ShapesActivityArea | '') => {
    // Switching activity area invalidates the shape id (different
    // catalog) and resets the key picker to its default.
    onChange({
      ...target,
      activityArea: area === '' ? null : area,
      shapeId: null,
      keyTarget: 'all',
    });
  };
  const setShape = (id: string) => onChange({ ...target, shapeId: id || null });
  const setKey = (k: string) => onChange({ ...target, keyTarget: k });
  const setLevel = (level: ShapesProficiencyLevel) => onChange({ ...target, proficiencyLevel: level });

  return (
    <ToggleCard
      title="Proficiency target"
      hint="Reach a target level on a shape — or across an activity area."
      enabled={target.proficiencyEnabled}
      onToggle={toggle}
    >
      <Field label="Scope">
        <div className="flex gap-1.5">
          <PillButton
            label="Overall (activity area)"
            active={target.proficiencyScope === 'overall'}
            onClick={() => setScope('overall')}
          />
          <PillButton
            label="Specific shape"
            active={target.proficiencyScope === 'specific'}
            onClick={() => setScope('specific')}
          />
        </div>
      </Field>
      <Field label="Activity area">
        <select
          value={target.activityArea ?? ''}
          onChange={e => setActivityArea(e.target.value as ShapesActivityArea | '')}
          className={inputClass()}
        >
          <option value="">Pick an activity area…</option>
          {SHAPES_ACTIVITY_AREAS.map(a => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </Field>
      {target.proficiencyScope === 'specific' && target.activityArea && (
        <Field label="Shape">
          <select
            value={target.shapeId ?? ''}
            onChange={e => setShape(e.target.value)}
            className={inputClass()}
          >
            <option value="">Pick a shape…</option>
            <ShapeOptionsForArea area={target.activityArea} />
          </select>
        </Field>
      )}
      {target.proficiencyScope === 'specific' && target.shapeId && (
        <Field label="Key">
          <select
            value={target.keyTarget}
            onChange={e => setKey(e.target.value)}
            className={inputClass()}
          >
            <option value="all">All 12 keys</option>
            {SHAPES_KEYS.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Target level">
        <div className="flex flex-wrap gap-1.5">
          {SHAPES_LEVELS.map(l => (
            <PillButton
              key={l.id}
              label={l.label}
              active={target.proficiencyLevel === l.id}
              onClick={() => setLevel(l.id)}
            />
          ))}
        </div>
      </Field>
    </ToggleCard>
  );
}

/**
 * Returns the <option> elements for the shape dropdown given an
 * activity area. Chord shapes get optgroups (29 entries — flat would
 * be hard to scan); scales and voice-leading patterns are short
 * enough to render flat.
 */
function ShapeOptionsForArea({ area }: { area: ShapesActivityArea }) {
  if (area === 'scale_drills') {
    return (
      <>
        {SCALES.map(s => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </>
    );
  }
  if (area === 'voice_leading') {
    return (
      <>
        {VOICE_LEADING_PATTERNS.map(p => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </>
    );
  }
  // chord_shape_drills — group by quality kind for legibility.
  return (
    <>
      {CHORD_QUALITY_KIND_ORDER.map(kind => {
        const entries = CHORD_QUALITIES.filter(c => c.kind === kind);
        if (entries.length === 0) return null;
        return (
          <optgroup key={kind} label={CHORD_QUALITY_KIND_LABELS[kind]}>
            {entries.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

/**
 * Spec preview phrasing:
 *   proficiency / overall:    "Improve my overall Chord Shape Drills proficiency to Comfortable across all keys"
 *   proficiency / specific:   "Reach Comfortable proficiency level on Major 7 in C"
 *                             "Reach Solid proficiency level on Major scale in all 12 keys"
 *   consistency-only:         "Practice shapes & patterns at least 20 minutes a week"
 *   both:                     "<proficiency> and practice at least 20 minutes a week"
 *
 * Scale shapes get a " scale" suffix in the preview so labels like
 * "Major" / "Natural Minor" read as a complete noun ("Reach … on
 * Major scale in C"). Chord and voice-leading labels are already
 * complete nouns in the catalog so no suffix is added.
 */
function previewShapesPatternsTarget(target: ShapesPatternsTarget): string | null {
  const parts: string[] = [];
  if (target.proficiencyEnabled) {
    if (!target.activityArea) return null;
    const level = levelLabel(target.proficiencyLevel);
    if (target.proficiencyScope === 'overall') {
      parts.push(`Improve my overall ${activityAreaLabel(target.activityArea)} proficiency to ${level} across all keys`);
    } else {
      if (!target.shapeId) return null;
      const label = shapeLabel(target.activityArea, target.shapeId);
      if (!label) return null;
      const fullShape = target.activityArea === 'scale_drills' ? `${label} scale` : label;
      const keyText = target.keyTarget === 'all' ? 'all 12 keys' : target.keyTarget;
      parts.push(`Reach ${level} proficiency level on ${fullShape} in ${keyText}`);
    }
  }
  if (target.consistencyEnabled) {
    if (target.consistencyCount < 1) return parts.length > 0 ? parts.join(' and ') : null;
    const verb = parts.length === 0 ? 'Practice shapes & patterns' : 'practice';
    const minutesWord = target.consistencyCount === 1 ? 'minute' : 'minutes';
    parts.push(`${verb} at least ${target.consistencyCount} ${minutesWord} a ${target.consistencyCadence}`);
  }
  if (parts.length === 0) return null;
  return parts.join(' and ');
}

// ---- Step 2 — Production -------------------------------------------

function Step2Production({
  draft,
  onUpdate,
}: {
  draft: Draft;
  onUpdate: (patch: Partial<Draft>) => void;
}) {
  const target = draft.production;
  const setTarget = (next: ProductionTarget) => onUpdate({ production: next });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Pick at least one target. You can combine completion and time on a single goal.
      </p>
      <ProductionCompletionCard target={target} onChange={setTarget} />
      <ConsistencyTargetCard
        target={target}
        onChange={setTarget}
        cardTitle="Time target"
        unitLabel="Hours"
        hint="How much time at the workstation per week or month."
      />
      <TargetPreview text={previewProductionTarget(target)} />
    </div>
  );
}

function ProductionCompletionCard({
  target,
  onChange,
}: {
  target: ProductionTarget;
  onChange: (next: ProductionTarget) => void;
}) {
  // Local string state for the lesson-count input. Decouples the
  // displayed text from the parsed number in the draft, which fixes
  // a Safari quirk where a controlled type="number" input can drop
  // focus when its value alternates between '' and a number on each
  // keystroke (clearing the field). Stays in sync because the only
  // mutator is `handleLessonInput` below; external resets remount
  // this component (modal close / module switch) so the initializer
  // re-runs against the fresh target.
  const [lessonText, setLessonText] = useState(
    target.lessonCount === 0 ? '' : String(target.lessonCount),
  );

  const toggle = () => onChange({ ...target, completionEnabled: !target.completionEnabled });
  const setScope = (scope: ProductionTarget['completionScope']) => {
    if (scope === target.completionScope) return;
    // Switching scope leaves the other scope's field intact so a
    // user toggling back and forth doesn't lose work — only the
    // active scope's field is consulted at save time.
    onChange({ ...target, completionScope: scope });
  };
  const setPath = (id: string) => onChange({ ...target, pathId: id || null });
  const handleLessonInput = (text: string) => {
    setLessonText(text);
    if (text === '') {
      onChange({ ...target, lessonCount: 0 });
      return;
    }
    const n = Number(text);
    if (Number.isFinite(n)) {
      onChange({ ...target, lessonCount: n });
    }
  };

  return (
    <ToggleCard
      title="Completion target"
      hint="Finish a path, or rack up new lessons."
      enabled={target.completionEnabled}
      onToggle={toggle}
    >
      <Field label="Scope">
        <div className="flex gap-1.5">
          <PillButton
            label="Complete a path"
            active={target.completionScope === 'path'}
            onClick={() => setScope('path')}
          />
          <PillButton
            label="Complete X lessons"
            active={target.completionScope === 'count'}
            onClick={() => setScope('count')}
          />
        </div>
      </Field>
      {target.completionScope === 'path' && (
        <Field label="Path">
          <select
            value={target.pathId ?? ''}
            onChange={e => setPath(e.target.value)}
            className={inputClass()}
          >
            <option value="">Pick a path…</option>
            {PRODUCTION_PATHS.map(p => {
              const count = lessonsByPath(p.id).length;
              return (
                <option key={p.id} value={p.id}>
                  {p.title} ({count} lessons)
                </option>
              );
            })}
          </select>
        </Field>
      )}
      {target.completionScope === 'count' && (
        // Manual div + span instead of <Field> (which wraps in
        // <label>) — wrapping a controlled type="number" input in a
        // <label> can cause Safari to redirect focus when the value
        // transitions to empty, especially with min={1} constraint
        // validation tripping. Same fix as the Practice consistency
        // days input.
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
            Lessons
          </span>
          <input
            type="number"
            min={1}
            value={lessonText}
            onChange={e => handleLessonInput(e.target.value)}
            className={`${inputClass()} w-20`}
            aria-label="New lessons to complete"
          />
        </div>
      )}
    </ToggleCard>
  );
}

/**
 * Preview phrasing:
 *   completion / path:    "Complete the Workflow Foundations path"
 *   completion / count:   "Complete 4 new production lessons"
 *   time-only:            "Spend at least 2 hours a week on production"
 *   both (path + time):   "Complete the Workflow Foundations path and spend at least 2 hours a week on production"
 *   both (count + time):  "Complete 4 new production lessons and spend at least 2 hours a week on production"
 *
 * Time clause uses "spend … on production" rather than the
 * "practice production" verb the other modules use — production
 * work is at-the-workstation time, which "spend" reads more
 * naturally for than "practice". Module name moves to a trailing
 * "on production" so the verb stays clean in both standalone and
 * combined cases.
 */
function previewProductionTarget(target: ProductionTarget): string | null {
  const parts: string[] = [];
  if (target.completionEnabled) {
    if (target.completionScope === 'path') {
      if (!target.pathId) return null;
      const path = PRODUCTION_PATHS.find(p => p.id === target.pathId);
      if (!path) return null;
      parts.push(`Complete the ${path.title} path`);
    } else {
      if (target.lessonCount < 1) return null;
      const word = target.lessonCount === 1 ? 'lesson' : 'lessons';
      parts.push(`Complete ${target.lessonCount} new production ${word}`);
    }
  }
  if (target.consistencyEnabled) {
    if (target.consistencyCount < 1) return parts.length > 0 ? parts.join(' and ') : null;
    const verb = parts.length === 0 ? 'Spend' : 'spend';
    const hoursWord = target.consistencyCount === 1 ? 'hour' : 'hours';
    parts.push(`${verb} at least ${target.consistencyCount} ${hoursWord} a ${target.consistencyCadence} on production`);
  }
  if (parts.length === 0) return null;
  return parts.join(' and ');
}

// ---- Step 2 — Practice consistency ---------------------------------

function Step2PracticeConsistency({
  draft,
  onUpdate,
}: {
  draft: Draft;
  onUpdate: (patch: Partial<Draft>) => void;
}) {
  const target = draft.practiceConsistency;
  const setTarget = (next: PracticeConsistencyTarget) => onUpdate({ practiceConsistency: next });

  // Local string state for the days input — same Safari focus fix
  // pattern as Production's lesson-count input. The number-typed
  // input loses its cursor when value transitions between '' and a
  // number; storing the displayed text separately keeps focus stable.
  const [daysText, setDaysText] = useState(
    target.days === 0 ? '' : String(target.days),
  );

  const handleDaysInput = (text: string) => {
    setDaysText(text);
    if (text === '') {
      setTarget({ ...target, days: 0 });
      return;
    }
    const n = Number(text);
    if (Number.isFinite(n)) {
      setTarget({ ...target, days: n });
    }
  };
  const setCadence = (c: 'week' | 'month') => {
    if (c === target.cadence) return;
    setTarget({ ...target, cadence: c });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        How many days a week or month do you want to practice?
      </p>
      <div className="rounded-md border border-fluent/40 bg-fluent/5 px-3 py-3 flex items-end gap-2">
        {/* Manual div + span instead of <Field> (which wraps in
            <label>). Wrapping a number input in a <label> that's a
            flex sibling to focusable buttons can cause Safari to
            redirect focus when the input clears — especially with
            min={1} constraint validation tripping on empty value.
            Same pattern SongPicker uses. */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
            Days
          </span>
          <input
            type="number"
            min={1}
            value={daysText}
            onChange={e => handleDaysInput(e.target.value)}
            className={`${inputClass()} w-20`}
            aria-label="Days per cadence"
          />
        </div>
        <div className="flex gap-1.5 pb-[2px]">
          <PillButton
            label="per week"
            active={target.cadence === 'week'}
            onClick={() => setCadence('week')}
          />
          <PillButton
            label="per month"
            active={target.cadence === 'month'}
            onClick={() => setCadence('month')}
          />
        </div>
      </div>
      <TargetPreview text={previewPracticeConsistencyTarget(target)} />
    </div>
  );
}

/**
 * Preview phrasing:
 *   per week:   "Practice at least 4 days a week"
 *   per month:  "Practice at least 20 days this month"
 *   singular:   "Practice at least 1 day a week"
 *
 * The cadence phrasing intentionally differs by unit: "a week"
 * reads as a recurring weekly target, "this month" reads as a
 * one-shot monthly count.
 */
function previewPracticeConsistencyTarget(target: PracticeConsistencyTarget): string | null {
  if (target.days < 1) return null;
  const dayWord = target.days === 1 ? 'day' : 'days';
  const period = target.cadence === 'week' ? 'a week' : 'this month';
  return `Practice at least ${target.days} ${dayWord} ${period}`;
}

// ---- Step 3 — timeframe --------------------------------------------

function Step3View({
  draft,
  onUpdate,
}: {
  draft: Draft;
  onUpdate: (patch: Partial<Draft>) => void;
}) {
  // Section goals are weekly-only per spec. The five non-weekly
  // cards render disabled with a tooltip; clicking them is a no-op.
  // goNext from Step 2 already forces scope=weekly for section goals,
  // so by the time this view renders the lock is already in effect.
  const sectionLocked = isSectionGoal(draft);

  const setScope = (scope: GoalScope) => {
    if (sectionLocked && scope !== 'weekly') return;
    if (scope === draft.scope) return;
    // Auto-populate target date on scope change. User can override
    // via the date input below. Also reset the parent-goal choice —
    // parent eligibility filters by scope, so a previously valid
    // parent may no longer be eligible after the scope changes. The
    // reset target is 'none' (standalone), matching the EMPTY_DRAFT
    // default, so the safe choice survives the scope change.
    onUpdate({
      scope,
      targetDate: defaultTargetDate(scope),
      parentGoal: { kind: 'none' },
    });
  };

  const setTargetDate = (value: string) => {
    const ms = dateInputToMs(value);
    onUpdate({ targetDate: ms });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {sectionLocked
          ? 'Section goals are weekly only.'
          : 'Pick a horizon. Target date auto-populates and can be edited below.'}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {SCOPE_ORDER.map(scope => {
          const disabled = sectionLocked && scope !== 'weekly';
          return (
            <ScopeCard
              key={scope}
              label={SCOPE_LABEL[scope]}
              active={draft.scope === scope}
              disabled={disabled}
              onClick={() => setScope(scope)}
              tooltip={disabled ? 'Section goals are weekly only' : undefined}
            />
          );
        })}
      </div>
      <Field label="Target date">
        <input
          type="date"
          value={draft.targetDate !== null ? dateInputValue(draft.targetDate) : ''}
          onChange={e => setTargetDate(e.target.value)}
          className={inputClass()}
        />
      </Field>
    </div>
  );
}

function ScopeCard({
  label,
  active,
  disabled,
  tooltip,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  tooltip?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-pressed={active}
      title={tooltip}
      className={[
        'rounded-md border px-3 py-3 transition text-center text-sm font-medium',
        active
          ? 'border-fluent bg-fluent/10 text-fluent'
          : 'border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200',
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : !active
            ? 'hover:border-fluent/60 cursor-pointer'
            : 'cursor-pointer',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ---- Step 3.5 — parent goal ----------------------------------------

/**
 * Map the goal-flow card identifier to the matching ModuleId in
 * `relatedModules` arrays on existing Goal records. Returns null
 * for `practice-consistency`, which has no module-registry
 * counterpart — those goals are matched purely on scope, no module
 * filter.
 */
function moduleIdForCard(id: ModuleCardId | null): string | null {
  if (id === null) return null;
  if (id === 'practice-consistency') return null;
  return id;
}

/**
 * Partition the eligible parent-goal pool into "Suggested" (module
 * match against the child's module) and "All" (eligible by scope but
 * no module match). Both arrays sorted by scope, broader first, so
 * yearly suggestions outrank quarterly and so on.
 */
function splitParentCandidates(
  goals: ReadonlyArray<Goal>,
  childScope: GoalScope,
  childModule: ModuleCardId | null,
): { suggested: Goal[]; rest: Goal[] } {
  const childScopeIdx = SCOPE_ORDER.indexOf(childScope);
  const eligible = goals.filter(g => SCOPE_ORDER.indexOf(g.scope) > childScopeIdx);
  const moduleKey = moduleIdForCard(childModule);

  const suggested: Goal[] = [];
  const rest: Goal[] = [];
  for (const g of eligible) {
    if (moduleKey && g.relatedModules.includes(moduleKey)) {
      suggested.push(g);
    } else {
      rest.push(g);
    }
  }
  const broaderFirst = (a: Goal, b: Goal) =>
    SCOPE_ORDER.indexOf(b.scope) - SCOPE_ORDER.indexOf(a.scope);
  suggested.sort(broaderFirst);
  rest.sort(broaderFirst);
  return { suggested, rest };
}

function parentGoalCardLabel(g: Goal): string {
  const desc = g.description.trim();
  if (desc.length > 0) return desc;
  return `(untitled ${SCOPE_LABEL[g.scope]} goal)`;
}

function Step3HalfView({
  draft,
  onUpdate,
}: {
  draft: Draft;
  onUpdate: (patch: Partial<Draft>) => void;
}) {
  const allGoals = useLiveQuery(
    () => db.goals.where('status').equals('active').toArray(),
    [],
    [] as Goal[],
  );

  const { suggested, rest } = useMemo(() => {
    if (!draft.scope) return { suggested: [] as Goal[], rest: [] as Goal[] };
    return splitParentCandidates(allGoals, draft.scope, draft.moduleId);
  }, [allGoals, draft.scope, draft.moduleId]);

  const setNone = () => onUpdate({ parentGoal: { kind: 'none' } });
  const setLinked = (goalId: string) => onUpdate({ parentGoal: { kind: 'linked', goalId } });

  const noneSelected = draft.parentGoal.kind === 'none';
  const linkedId = draft.parentGoal.kind === 'linked' ? draft.parentGoal.goalId : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Most goals roll up into a yearly umbrella. Pick a parent or mark this as standalone.
      </p>

      <ParentChoiceCard
        title="No parent goal"
        subtitle="Default · standalone"
        active={noneSelected}
        onClick={setNone}
      />

      {(suggested.length > 0 || rest.length > 0) && (
        <div
          className="border-t border-neutral-200 dark:border-neutral-800 my-1"
          aria-hidden="true"
        />
      )}

      {suggested.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Suggested
          </div>
          {suggested.map(g => (
            <ParentChoiceCard
              key={g.id}
              title={parentGoalCardLabel(g)}
              subtitle={SCOPE_LABEL[g.scope]}
              active={linkedId === g.id}
              onClick={() => setLinked(g.id)}
            />
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {suggested.length > 0 ? 'All goals' : 'Available goals'}
          </div>
          {rest.map(g => (
            <ParentChoiceCard
              key={g.id}
              title={parentGoalCardLabel(g)}
              subtitle={SCOPE_LABEL[g.scope]}
              active={linkedId === g.id}
              onClick={() => setLinked(g.id)}
            />
          ))}
        </div>
      )}

      {suggested.length === 0 && rest.length === 0 && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400 italic px-1">
          No broader-scope goals exist yet — only "No parent goal" is available.
        </div>
      )}

      {/* Create-new-parent shortcut. The exact flow (nested modal vs.
          deferred creation) is TBD per the spec — for now this surfaces
          the affordance with a tooltip so the UX intent is visible
          without committing to an implementation. */}
      <button
        type="button"
        disabled
        title="Coming soon — for now, save this goal then add a parent goal separately."
        className="self-start text-xs text-neutral-500 dark:text-neutral-400 px-3 py-1.5 rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 cursor-not-allowed opacity-60"
      >
        + Create new parent goal
      </button>
    </div>
  );
}

function ParentChoiceCard({
  title,
  subtitle,
  active,
  onClick,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition',
        active
          ? 'border-fluent bg-fluent/10'
          : 'border-neutral-200 dark:border-neutral-800 hover:border-fluent/60',
      ].join(' ')}
    >
      <span className={[
        'text-sm font-medium truncate',
        active ? 'text-fluent' : 'text-neutral-800 dark:text-neutral-100',
      ].join(' ')}>
        {title}
      </span>
      <span className={[
        'shrink-0 text-[10px] uppercase tracking-wide',
        active
          ? 'text-fluent/80'
          : 'text-neutral-500 dark:text-neutral-400',
      ].join(' ')}>
        {subtitle}
      </span>
    </button>
  );
}

// ---- Step 4 — review + save ----------------------------------------

/**
 * Map a goal-flow card identifier to the moduleId(s) we stamp into
 * a Goal record's `relatedModules`. Five card ids match registry
 * module ids 1:1; `practice-consistency` has no module-registry
 * counterpart so its goals carry no related module.
 */
function relatedModulesForCard(id: ModuleCardId | null): string[] {
  if (id === null) return [];
  if (id === 'practice-consistency') return [];
  return [id];
}

/**
 * Default practice context inferred from the chosen module per the
 * spec's "Context inferred from module" rule. Practice consistency
 * has no specific context — it's a meta-target across all modules,
 * so contextTag stays null.
 */
function contextForModule(id: ModuleCardId | null): PracticeSessionContext | null {
  switch (id) {
    case 'repertoire':           return 'keys';   // physical keyboard
    case 'shapes-and-patterns':  return 'keys';   // physical keyboard
    case 'ear-training':         return 'mixed';  // laptop or phone
    case 'harmonic-fluency':     return 'mixed';  // keyboard / laptop / phone
    case 'production':           return 'laptop'; // DAW
    case 'practice-consistency': return null;
    case null:                   return null;
  }
}

/**
 * True when the active module's draft has both target slices enabled
 * — accuracy + consistency for ear-training / harmonic-fluency,
 * proficiency + consistency for shapes & patterns, completion + time
 * for production. Drives the "Multi-target" pill on Step 4 and the
 * two-records branch in encodeRecordsForDraft.
 */
function isMultiTarget(draft: Draft): boolean {
  switch (draft.moduleId) {
    case 'ear-training':         return draft.earTraining.accuracyEnabled && draft.earTraining.consistencyEnabled;
    case 'harmonic-fluency':     return draft.harmonicFluency.accuracyEnabled && draft.harmonicFluency.consistencyEnabled;
    case 'shapes-and-patterns':  return draft.shapesPatterns.proficiencyEnabled && draft.shapesPatterns.consistencyEnabled;
    case 'production':           return draft.production.completionEnabled && draft.production.consistencyEnabled;
    default:                     return false;
  }
}

function moduleLabelForCard(id: ModuleCardId): string {
  return MODULE_CARDS.find(c => c.id === id)?.name ?? id;
}

function formatTargetDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---- Per-record encoding -------------------------------------------

/**
 * One row that becomes a Goal record at save time. For multi-target
 * goals (ear-training accuracy + consistency, etc.), the encoder
 * returns two entries; siblings share parent_goal_id at save time
 * per the spec's "two linked records sharing parent_goal_id" rule.
 */
interface EncodedRecord {
  /** Sliced natural-language description for this specific record.
   *  Multi-target goals slice the combined preview so each record's
   *  description honestly reflects only its own target metric. */
  description: string;
  targetMetric: string;
  targetValue: number | null;
  targetUnit: string | null;
}

function encodeEarTraining(t: EarTrainingTarget): EncodedRecord[] {
  const records: EncodedRecord[] = [];
  // Coverage emitted FIRST so multi-target goals list breadth before
  // accuracy + consistency — matches the design doc dimension order
  // (Breadth → Depth → Mastery → Consistency).
  if (t.coverageEnabled) {
    if (t.coverageScope === 'overall') {
      records.push({
        description: `Cover all ${EAR_TRAINING_TOTAL_ITEMS} ear training items (acquired)`,
        targetMetric: COVERAGE_OVERALL_METRIC.EAR_TRAINING,
        targetValue: EAR_TRAINING_TOTAL_ITEMS,
        targetUnit: 'items',
      });
    } else {
      // Multi-pick: each picked group becomes its own child record.
      // The save loop in handleSave wraps them under a shared
      // parent_goal_id (existing umbrella encoding from Phase 1.6).
      // On edit, each child is opened independently per the
      // single-target-per-record convention (decodeGoalToDraft
      // docblock). See save-on-edit analysis: behavior is C
      // (add-as-siblings) for any new picks, untouched siblings
      // are preserved.
      for (const groupId of t.coverageGroupIds) {
        const group = EAR_TRAINING_COVERAGE_GROUPS.find(g => g.id === groupId);
        if (!group) continue;
        records.push({
          description: `Cover all ${group.denominator} items in ${group.label} (acquired)`,
          targetMetric: COVERAGE_SPECIFIC_METRIC.EAR_TRAINING,
          targetValue: group.denominator,
          targetUnit: group.id,
        });
      }
    }
  }
  if (t.accuracyEnabled) {
    const sliced = previewEarTrainingTarget({ ...t, consistencyEnabled: false });
    if (sliced) {
      if (t.accuracyScope === 'overall') {
        records.push({
          description: sliced,
          targetMetric: 'ear_training_accuracy_overall',
          targetValue: t.accuracyPercent,
          targetUnit: null,
        });
      } else if (t.drillTypeId && t.drillSubtypeId) {
        records.push({
          description: sliced,
          targetMetric: 'ear_training_accuracy_specific',
          targetValue: t.accuracyPercent,
          targetUnit: `${t.drillTypeId}:${t.drillSubtypeId}`,
        });
      }
    }
  }
  if (t.consistencyEnabled && t.consistencyCount >= 1) {
    const sliced = previewEarTrainingTarget({ ...t, accuracyEnabled: false });
    if (sliced) {
      records.push({
        description: sliced,
        targetMetric: 'ear_training_sessions_per_cadence',
        targetValue: t.consistencyCount,
        targetUnit: t.consistencyCadence,
      });
    }
  }
  return records;
}

function encodeHarmonicFluency(t: HarmonicFluencyTarget): EncodedRecord[] {
  const records: EncodedRecord[] = [];
  // Coverage emitted FIRST so multi-target goals list breadth before
  // accuracy + consistency — matches the design doc dimension order
  // (Breadth → Depth → Mastery → Consistency).
  if (t.coverageEnabled) {
    if (t.coverageScope === 'overall') {
      records.push({
        description: `Cover all ${HARMONIC_FLUENCY_TOTAL_ITEMS} harmonic fluency items (acquired)`,
        targetMetric: COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY,
        targetValue: HARMONIC_FLUENCY_TOTAL_ITEMS,
        targetUnit: 'items',
      });
    } else {
      // Multi-pick: each picked group becomes its own child record.
      // The save loop in handleSave wraps them under a shared
      // parent_goal_id (auto-umbrella encoding from 2b's handleSave
      // edit). On edit, each child is opened independently per the
      // single-target-per-record convention.
      for (const groupId of t.coverageGroupIds) {
        const group = HARMONIC_FLUENCY_COVERAGE_GROUPS.find(g => g.id === groupId);
        if (!group) continue;
        records.push({
          description: `Cover all ${group.denominator} items in ${group.label} (acquired)`,
          targetMetric: COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY,
          targetValue: group.denominator,
          targetUnit: group.id,
        });
      }
    }
  }
  if (t.accuracyEnabled) {
    const sliced = previewHarmonicFluencyTarget({ ...t, consistencyEnabled: false });
    if (sliced) {
      if (t.accuracyScope === 'overall') {
        records.push({
          description: sliced,
          targetMetric: 'harmonic_fluency_accuracy_overall',
          targetValue: t.accuracyPercent,
          targetUnit: null,
        });
      } else if (t.categoryId) {
        records.push({
          description: sliced,
          targetMetric: 'harmonic_fluency_accuracy_specific',
          targetValue: t.accuracyPercent,
          targetUnit: t.categoryId,
        });
      }
    }
  }
  if (t.consistencyEnabled && t.consistencyCount >= 1) {
    const sliced = previewHarmonicFluencyTarget({ ...t, accuracyEnabled: false });
    if (sliced) {
      records.push({
        description: sliced,
        targetMetric: 'harmonic_fluency_sessions_per_cadence',
        targetValue: t.consistencyCount,
        targetUnit: t.consistencyCadence,
      });
    }
  }
  return records;
}

function encodeShapesPatterns(t: ShapesPatternsTarget): EncodedRecord[] {
  const records: EncodedRecord[] = [];
  if (t.proficiencyEnabled && t.activityArea) {
    const sliced = previewShapesPatternsTarget({ ...t, consistencyEnabled: false });
    if (sliced) {
      if (t.proficiencyScope === 'overall') {
        records.push({
          description: sliced,
          targetMetric: 'shapes_proficiency_overall',
          targetValue: null,
          targetUnit: `${t.activityArea}:${t.proficiencyLevel}`,
        });
      } else if (t.shapeId && t.keyTarget) {
        records.push({
          description: sliced,
          targetMetric: 'shapes_proficiency_specific',
          targetValue: null,
          targetUnit: `${t.activityArea}:${t.shapeId}:${t.keyTarget}:${t.proficiencyLevel}`,
        });
      }
    }
  }
  if (t.consistencyEnabled && t.consistencyCount >= 1) {
    const sliced = previewShapesPatternsTarget({ ...t, proficiencyEnabled: false });
    if (sliced) {
      records.push({
        description: sliced,
        targetMetric: 'shapes_minutes_per_cadence',
        targetValue: t.consistencyCount,
        targetUnit: t.consistencyCadence,
      });
    }
  }
  return records;
}

function encodeProduction(t: ProductionTarget): EncodedRecord[] {
  const records: EncodedRecord[] = [];
  if (t.completionEnabled) {
    const sliced = previewProductionTarget({ ...t, consistencyEnabled: false });
    if (sliced) {
      if (t.completionScope === 'path' && t.pathId) {
        records.push({
          description: sliced,
          targetMetric: 'production_path_completion',
          targetValue: null,
          targetUnit: t.pathId,
        });
      } else if (t.completionScope === 'count' && t.lessonCount >= 1) {
        records.push({
          description: sliced,
          targetMetric: 'production_lessons_count',
          targetValue: t.lessonCount,
          targetUnit: 'lessons',
        });
      }
    }
  }
  if (t.consistencyEnabled && t.consistencyCount >= 1) {
    const sliced = previewProductionTarget({ ...t, completionEnabled: false });
    if (sliced) {
      records.push({
        description: sliced,
        targetMetric: 'production_hours_per_cadence',
        targetValue: t.consistencyCount,
        targetUnit: t.consistencyCadence,
      });
    }
  }
  return records;
}

function encodePracticeConsistency(t: PracticeConsistencyTarget): EncodedRecord[] {
  if (t.days < 1) return [];
  const sliced = previewPracticeConsistencyTarget(t);
  if (!sliced) return [];
  return [{
    description: sliced,
    targetMetric: 'practice_days_per_cadence',
    targetValue: t.days,
    targetUnit: t.cadence,
  }];
}

function encodeSongRecord(
  draft: Draft,
  songRecord: Song,
  sectionNamesById: ReadonlyMap<string, string>,
): EncodedRecord[] {
  const encoded = encodeSongTarget(draft.songTarget);
  if (!encoded) return [];
  const description = previewSongTarget(draft.songTarget, {
    title: songRecord.title,
    key: songRecord.key,
    sectionNamesById,
  });
  if (!description) return [];
  return [{
    description,
    targetMetric: encoded.targetMetric,
    targetValue: encoded.targetValue,
    targetUnit: encoded.targetUnit,
  }];
}

/**
 * Dispatch to the per-module encoder. Returns the array of records
 * to write — 1 entry for single-target goals, 2 for multi-target
 * (one row per metric). Caller wraps each into a full Goal record
 * with shared metadata (scope, targetDate, parentGoalId, etc.) at
 * save time.
 */
function encodeRecordsForDraft(
  draft: Draft,
  songRecord: Song | undefined,
  sectionNamesById: ReadonlyMap<string, string>,
): EncodedRecord[] {
  switch (draft.moduleId) {
    case 'repertoire':
      if (!songRecord) return [];
      return encodeSongRecord(draft, songRecord, sectionNamesById);
    case 'ear-training':         return encodeEarTraining(draft.earTraining);
    case 'harmonic-fluency':     return encodeHarmonicFluency(draft.harmonicFluency);
    case 'shapes-and-patterns':  return encodeShapesPatterns(draft.shapesPatterns);
    case 'production':           return encodeProduction(draft.production);
    case 'practice-consistency': return encodePracticeConsistency(draft.practiceConsistency);
    default:                     return [];
  }
}

// ---- Decoders for edit mode ----------------------------------------

/**
 * True when this metric is the consistency-half of a multi-target
 * pair. Used at edit save time to match the encoder's output back
 * to the original Goal record by slice kind, so we update in place
 * rather than orphan the original.
 */
function isConsistencySlice(metric: string | null): boolean {
  if (!metric) return false;
  return metric.endsWith('_per_cadence');
}

function decodeEarTraining(goal: Goal): EarTrainingTarget {
  const t = defaultEarTraining();
  if (goal.targetMetric === COVERAGE_OVERALL_METRIC.EAR_TRAINING) {
    t.coverageEnabled = true;
    t.coverageScope = 'overall';
    t.coverageGroupIds = [];
  } else if (goal.targetMetric === COVERAGE_SPECIFIC_METRIC.EAR_TRAINING) {
    t.coverageEnabled = true;
    t.coverageScope = 'specific';
    // Edit mode is per-record (see decodeGoalToDraft docblock), so
    // we only see the clicked sibling's group id here. The user can
    // add more groups in the multi-pick UI to create new siblings on
    // save, or uncheck this one + check another to swap (the original
    // record id is reused for the first encoded record per the save
    // loop's classification-matching logic).
    t.coverageGroupIds = goal.targetUnit ? [goal.targetUnit] : [];
  } else if (goal.targetMetric === 'ear_training_accuracy_overall') {
    t.accuracyEnabled = true;
    t.accuracyScope = 'overall';
    t.accuracyPercent = typeof goal.targetValue === 'number' ? goal.targetValue : t.accuracyPercent;
  } else if (goal.targetMetric === 'ear_training_accuracy_specific') {
    t.accuracyEnabled = true;
    t.accuracyScope = 'specific';
    t.accuracyPercent = typeof goal.targetValue === 'number' ? goal.targetValue : t.accuracyPercent;
    const [drillTypeId, drillSubtypeId] = (goal.targetUnit ?? '').split(':');
    t.drillTypeId = drillTypeId || null;
    t.drillSubtypeId = drillSubtypeId || null;
  } else if (goal.targetMetric === 'ear_training_sessions_per_cadence') {
    t.consistencyEnabled = true;
    t.consistencyCount = typeof goal.targetValue === 'number' ? goal.targetValue : t.consistencyCount;
    t.consistencyCadence = goal.targetUnit === 'month' ? 'month' : 'week';
  }
  return t;
}

function decodeHarmonicFluency(goal: Goal): HarmonicFluencyTarget {
  const t = defaultHarmonicFluency();
  if (goal.targetMetric === COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY) {
    t.coverageEnabled = true;
    t.coverageScope = 'overall';
    t.coverageGroupIds = [];
  } else if (goal.targetMetric === COVERAGE_SPECIFIC_METRIC.HARMONIC_FLUENCY) {
    t.coverageEnabled = true;
    t.coverageScope = 'specific';
    // Edit mode is per-record — only the clicked sibling's group id
    // is restored. Adding more groups in the multi-pick UI on edit
    // creates new siblings on save (Behavior C from 2b's analysis).
    t.coverageGroupIds = goal.targetUnit ? [goal.targetUnit] : [];
  } else if (goal.targetMetric === 'harmonic_fluency_accuracy_overall') {
    t.accuracyEnabled = true;
    t.accuracyScope = 'overall';
    t.accuracyPercent = typeof goal.targetValue === 'number' ? goal.targetValue : t.accuracyPercent;
  } else if (goal.targetMetric === 'harmonic_fluency_accuracy_specific') {
    t.accuracyEnabled = true;
    t.accuracyScope = 'specific';
    t.accuracyPercent = typeof goal.targetValue === 'number' ? goal.targetValue : t.accuracyPercent;
    t.categoryId = (goal.targetUnit as FlashcardCategory) || null;
  } else if (goal.targetMetric === 'harmonic_fluency_sessions_per_cadence') {
    t.consistencyEnabled = true;
    t.consistencyCount = typeof goal.targetValue === 'number' ? goal.targetValue : t.consistencyCount;
    t.consistencyCadence = goal.targetUnit === 'month' ? 'month' : 'week';
  }
  return t;
}

function decodeShapesPatterns(goal: Goal): ShapesPatternsTarget {
  const t = defaultShapesPatterns();
  if (goal.targetMetric === 'shapes_proficiency_overall') {
    t.proficiencyEnabled = true;
    t.proficiencyScope = 'overall';
    const [area, level] = (goal.targetUnit ?? '').split(':');
    if (area === 'scale_drills' || area === 'chord_shape_drills' || area === 'voice_leading') {
      t.activityArea = area;
    }
    if (level === 'learning' || level === 'comfortable' || level === 'solid' || level === 'internalized') {
      t.proficiencyLevel = level;
    }
  } else if (goal.targetMetric === 'shapes_proficiency_specific') {
    t.proficiencyEnabled = true;
    t.proficiencyScope = 'specific';
    const [area, shapeId, keyTarget, level] = (goal.targetUnit ?? '').split(':');
    if (area === 'scale_drills' || area === 'chord_shape_drills' || area === 'voice_leading') {
      t.activityArea = area;
    }
    t.shapeId = shapeId || null;
    t.keyTarget = keyTarget || 'all';
    if (level === 'learning' || level === 'comfortable' || level === 'solid' || level === 'internalized') {
      t.proficiencyLevel = level;
    }
  } else if (goal.targetMetric === 'shapes_minutes_per_cadence') {
    t.consistencyEnabled = true;
    t.consistencyCount = typeof goal.targetValue === 'number' ? goal.targetValue : t.consistencyCount;
    t.consistencyCadence = goal.targetUnit === 'month' ? 'month' : 'week';
  }
  return t;
}

function decodeProduction(goal: Goal): ProductionTarget {
  const t = defaultProduction();
  if (goal.targetMetric === 'production_path_completion') {
    t.completionEnabled = true;
    t.completionScope = 'path';
    t.pathId = goal.targetUnit ?? null;
  } else if (goal.targetMetric === 'production_lessons_count') {
    t.completionEnabled = true;
    t.completionScope = 'count';
    t.lessonCount = typeof goal.targetValue === 'number' ? goal.targetValue : t.lessonCount;
  } else if (goal.targetMetric === 'production_hours_per_cadence') {
    t.consistencyEnabled = true;
    t.consistencyCount = typeof goal.targetValue === 'number' ? goal.targetValue : t.consistencyCount;
    t.consistencyCadence = goal.targetUnit === 'month' ? 'month' : 'week';
  }
  return t;
}

function decodePracticeConsistency(goal: Goal): PracticeConsistencyTarget {
  const t = defaultPracticeConsistency();
  if (goal.targetMetric === 'practice_days_per_cadence') {
    t.days = typeof goal.targetValue === 'number' ? goal.targetValue : t.days;
    t.cadence = goal.targetUnit === 'month' ? 'month' : 'week';
  }
  return t;
}

/**
 * Decode a saved Goal record back into a fully-populated Draft.
 * Returns null for old-vocabulary goals — caller falls back to
 * EMPTY_DRAFT (or, in step 15's entry-point swap, routes to
 * GoalFormModal instead of the new flow).
 *
 * Each module decoder populates only the slice that matches the
 * goal's targetMetric. Multi-target goals (saved as two records
 * sharing parent_goal_id) are edited independently per the step 14
 * design call — clicking one record opens it as a single-target
 * draft showing only that slice.
 */
function decodeGoalToDraft(goal: Goal): Draft | null {
  const moduleId = moduleForMetric(goal.targetMetric);
  if (!moduleId) return null;

  const baseDraft: Draft = {
    ...EMPTY_DRAFT,
    moduleId,
    scope: goal.scope,
    targetDate: goal.targetDate,
    parentGoal: goal.parentGoalId
      ? { kind: 'linked', goalId: goal.parentGoalId }
      : { kind: 'none' },
  };

  switch (moduleId) {
    case 'repertoire': {
      const decoded = decodeSongTarget(goal);
      return {
        ...baseDraft,
        songId: goal.relatedItems[0] ?? null,
        songTarget: decoded ?? defaultSongTarget(),
      };
    }
    case 'ear-training':
      return { ...baseDraft, earTraining: decodeEarTraining(goal) };
    case 'harmonic-fluency':
      return { ...baseDraft, harmonicFluency: decodeHarmonicFluency(goal) };
    case 'shapes-and-patterns':
      return { ...baseDraft, shapesPatterns: decodeShapesPatterns(goal) };
    case 'production':
      return { ...baseDraft, production: decodeProduction(goal) };
    case 'practice-consistency':
      return { ...baseDraft, practiceConsistency: decodePracticeConsistency(goal) };
  }
}

/**
 * Combined natural-language preview for the review block. Multi-
 * target goals render as the two slices joined with "and"; single-
 * target goals render their preview as-is. Reuses the per-module
 * preview helpers we already use elsewhere in the flow.
 */
function computeGoalDescription(
  draft: Draft,
  songRecord: Song | undefined,
  sectionNamesById: ReadonlyMap<string, string>,
): string | null {
  switch (draft.moduleId) {
    case 'repertoire':
      if (!songRecord) return null;
      return previewSongTarget(draft.songTarget, {
        title: songRecord.title,
        key: songRecord.key,
        sectionNamesById,
      });
    case 'ear-training':         return previewEarTrainingTarget(draft.earTraining);
    case 'harmonic-fluency':     return previewHarmonicFluencyTarget(draft.harmonicFluency);
    case 'shapes-and-patterns':  return previewShapesPatternsTarget(draft.shapesPatterns);
    case 'production':           return previewProductionTarget(draft.production);
    case 'practice-consistency': return previewPracticeConsistencyTarget(draft.practiceConsistency);
    default:                     return null;
  }
}

// ---- Step 4 view ---------------------------------------------------

function Step4View({ draft }: { draft: Draft }) {
  // Async wrappers normalise the return type for useLiveQuery — the
  // conditional `db.x.get(...)` paths return PromiseExtended which
  // TypeScript struggles to unify with a sync `undefined` fallback.
  const songRecord = useLiveQuery(
    async () => {
      if (!draft.songId) return undefined;
      return await db.songs.get(draft.songId);
    },
    [draft.songId],
    undefined as Song | undefined,
  );
  const matrixSections = useLiveQuery(
    () => {
      if (!draft.songId) return [] as SongMatrixSection[];
      return db.songMatrixSections.where('songId').equals(draft.songId).toArray();
    },
    [draft.songId],
    [] as SongMatrixSection[],
  );
  const parentGoalRecord = useLiveQuery(
    async () => {
      if (draft.parentGoal.kind !== 'linked') return undefined;
      return await db.goals.get(draft.parentGoal.goalId);
    },
    [draft.parentGoal],
    undefined as Goal | undefined,
  );

  const sectionNamesById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of matrixSections.filter(s => !s.isArchived)) m.set(s.id, s.name);
    return m;
  }, [matrixSections]);

  const description = useMemo(
    () => computeGoalDescription(draft, songRecord, sectionNamesById),
    [draft, songRecord, sectionNamesById],
  );

  const moduleLabel = draft.moduleId !== null ? moduleLabelForCard(draft.moduleId) : null;
  const moduleAccent = draft.moduleId !== null ? accentHexForCard(draft.moduleId) : null;
  const parentLabel = parentGoalRecord
    ? (parentGoalRecord.description.trim() || `(untitled ${SCOPE_LABEL[parentGoalRecord.scope]} goal)`)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-fluent/30 bg-fluent/5 px-4 py-4">
        <div className="text-[10px] uppercase tracking-wide text-fluent mb-1">Your goal</div>
        <div className="text-base font-medium text-neutral-800 dark:text-neutral-100 leading-snug">
          {description ?? <span className="text-neutral-500 italic">Goal description unavailable.</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {moduleLabel && moduleAccent && (
          <span
            className="rounded-md px-2.5 py-1 text-xs font-medium"
            style={{
              color: moduleAccent,
              backgroundColor: `${moduleAccent}1a`,
              border: `1px solid ${moduleAccent}33`,
            }}
          >
            {moduleLabel}
          </span>
        )}
        {draft.scope && <ReviewPill>{SCOPE_LABEL[draft.scope]}</ReviewPill>}
        {draft.targetDate !== null && <ReviewPill>{formatTargetDate(draft.targetDate)}</ReviewPill>}
        {parentLabel && <ReviewPill>Parent: {parentLabel}</ReviewPill>}
        {draft.parentGoal.kind === 'none' && <ReviewPill>Standalone</ReviewPill>}
        {isMultiTarget(draft) && <ReviewPill>Multi-target</ReviewPill>}
      </div>
    </div>
  );
}

function ReviewPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-2.5 py-1 text-xs text-neutral-700 dark:text-neutral-200">
      {children}
    </span>
  );
}

// ---- Dot indicator -------------------------------------------------

function StepDots({ currentIndex, total }: { currentIndex: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => {
        const active = i === currentIndex;
        return (
          <span
            key={i}
            className={`h-2 rounded-full transition-all ${
              active ? 'w-6 bg-teal-500' : 'w-2 bg-neutral-300 dark:bg-neutral-700'
            }`}
          />
        );
      })}
    </div>
  );
}
