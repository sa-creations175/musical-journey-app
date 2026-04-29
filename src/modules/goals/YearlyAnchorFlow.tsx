import { useState } from 'react';
import Modal from '../../components/Modal';
import type { Goal } from '../../lib/db';
import { earTrainingCounts, harmonicFluencyCounts, shapesCounts } from '../../lib/moduleItemCounts';
import { DASHBOARD_META, PRACTICE_SESSIONS_META, moduleMetaById } from '../../lib/moduleMeta';
import {
  AccuracySlider,
  BreadthYesNoPicker,
  ConsistencyControl,
  DimensionSection,
  pruneMasteryToBreadth,
  type BreadthGroupOption,
  type BreadthState,
  type ConsistencyCadence,
} from './yearlyAnchorDimensions';
import { CategoryPillButton } from './GoalCreationFlow';

/**
 * Phase 2 step 5b — YearlyAnchorFlow shell.
 *
 * A yearly anchor expresses the user's complete intention for ONE
 * module across one calendar year. It is *not* one goal — it is a
 * small goal cluster (umbrella + up to 4 dimension records) all
 * feeding one yearly umbrella, together expressing four dimensions:
 *
 *   Breadth  → what do you want to cover?
 *   Mastery  → what do you want to truly own?
 *   Depth    → how well do you want to know it?
 *   Consistency → how often will you show up?
 *
 * (Production runs 3 questions — depth/mastery merged. Practice
 * consistency is a meta-habit with its own 3 questions: weekly floor /
 * monthly floor / aspiration. See PRACTICE_SESSIONS_DESIGN_3.md
 * "Yearly Anchor Flow" section for the full per-module spec.)
 *
 * This shell ships:
 *   - Modal lifecycle (open / Esc / backdrop / X close)
 *   - Two-screen navigation (intent → review)
 *   - 2-dot indicator
 *   - Back / Next / Save buttons in the right positions
 *   - Per-screen title + module-aware copy
 *
 * Still to land:
 *   - 5c — Screen 1 dimension components per module
 *   - 5d — Screen 2 review (auto-name, per-dimension Edit links,
 *          natural-language summary)
 *   - 5e — Save logic (transactional umbrella + N dimension records)
 *   - 5f — Trigger interstitial wired into goal-creation entry points
 *   - 5g — Tests
 *
 * Edit mode (`initialAnchor` prop) is wired but the decoder is a 5d
 * concern; for 5b the prop is plumbed through and the title flips to
 * "Review your yearly anchor" without round-tripping data.
 *
 * Why a separate component (not a branch inside GoalCreationFlow):
 * the two flows answer different questions. GoalCreationFlow is
 * "create one goal at any scope"; YearlyAnchorFlow is "express the
 * full year's intention for a module as an umbrella + cluster."
 * They share Modal + StepDots styling and reuse `moduleItemCounts`
 * for live denominators, but their drafts, validation, and save
 * shape are distinct enough that interleaving them would cost
 * clarity. Per the design doc, YearlyAnchorFlow bypasses Step 3.5
 * entirely — no parent picker, the flow IS the umbrella creation.
 */

// ---- Module identity (local, will sync with GoalCreationFlow in 5f) ----

/**
 * Module identifiers used by this flow. Mirrors `ModuleCardId` in
 * GoalCreationFlow.tsx — kept local for 5b so the shell change is
 * self-contained. Step 5f will extract a shared type when the
 * trigger interstitial needs to hand identifiers between both flows;
 * if a third consumer appears, promote to a shared module then.
 */
export type AnchorModuleId =
  | 'ear-training'
  | 'harmonic-fluency'
  | 'repertoire'
  | 'shapes-and-patterns'
  | 'production'
  | 'practice-consistency';

const MODULE_DISPLAY_NAME: Record<AnchorModuleId, string> = {
  'ear-training':         'Ear Training',
  'harmonic-fluency':     'Harmonic Fluency',
  'repertoire':           'Song Repertoire',
  'shapes-and-patterns':  'Shapes & Patterns',
  'production':           'Production',
  'practice-consistency': 'Practice consistency',
};

// ---- Screens ----------------------------------------------------------

type ScreenId = 'intent' | 'review';

const SCREENS: ReadonlyArray<{ id: ScreenId }> = [
  { id: 'intent' },
  { id: 'review' },
];

/**
 * Dimensions expressed on Screen 1, in the on-screen order specified
 * by the design doc. Screen 2's per-dimension Edit links (5d) take
 * one of these as a `focusDimension` prop so navigation back lands on
 * the right scrolled-into-view section.
 *
 * Production omits 'mastery' (depth/mastery merged) — handled in 5c
 * by branching on moduleId. Practice consistency's three questions
 * (weekly / monthly / aspiration) ride under the 'consistency' label.
 */
export type AnchorDimension = 'breadth' | 'mastery' | 'depth' | 'consistency';

// ---- Draft state -----------------------------------------------------

/**
 * Working state for the in-flight anchor. 5b ships only the module +
 * editable umbrella name; per-dimension state lands in 5c. The shape
 * is intentionally permissive (each dimension's slot is optional)
 * because dimensions are independent and a user might leave one or
 * more empty.
 */
export interface AnchorDraft {
  moduleId: AnchorModuleId;
  /** Auto-generated default ("[Module] [Year]"); editable inline on
   *  Screen 2. Null until 5d wires the editable input — the resolved
   *  name at save time falls back to the auto default. */
  name: string | null;
  /** Per-module dimension state. Sparse object — only the slot
   *  matching `moduleId` is populated. Mirrors GoalCreationFlow's
   *  module-keyed sub-target pattern. 5c.1–5c.3 ship the ET / HF /
   *  S&P slots; 5c.4–5c.6 land the rest. */
  earTraining?:     EarTrainingAnchor;
  harmonicFluency?: HarmonicFluencyAnchor;
  shapesPatterns?:  ShapesPatternsAnchor;
  // songRepertoire?:     SongRepertoireAnchor;        // 5c.4
  // production?:         ProductionAnchor;            // 5c.5
  // practiceConsistency?: PracticeConsistencyAnchor;  // 5c.6
}

// =====================================================================
// Ear Training dimension state
// =====================================================================

/** Group identifiers for ET coverage / mastery. Match the spacingState
 *  moduleRefs (intervals, chord-recognition, chord-progressions,
 *  scales-modes) so progress reads route cleanly through Step 4's
 *  `getCoverageCount(metric, subArea)` — see comments in
 *  `progress.ts` for the moduleRef ↔ sub-area equivalence. */
export type EarTrainingGroupId =
  | 'intervals'
  | 'chord-recognition'
  | 'chord-progressions'
  | 'scales-modes';

interface EarTrainingAnchor {
  breadth: BreadthState;
  /** Mastery's groupIds are always pruned to Breadth's scope by the
   *  coordinated `setBreadth` updater in Screen1EarTraining. State
   *  invariant: if breadth.kind === 'subset', every mastery groupId
   *  appears in breadth.groupIds. */
  mastery: { groupIds: EarTrainingGroupId[] };
  depth: { accuracyPercent: number };
  consistency: { count: number; cadence: ConsistencyCadence };
}

const ET_GROUP_LABELS: Record<EarTrainingGroupId, string> = {
  'intervals':          'intervals',
  'chord-recognition':  'chord recognition',
  'chord-progressions': 'chord progressions',
  'scales-modes':       'scales & modes',
};

const ET_GROUP_IDS: ReadonlyArray<EarTrainingGroupId> = [
  'intervals',
  'chord-recognition',
  'chord-progressions',
  'scales-modes',
];

function defaultEarTraining(): EarTrainingAnchor {
  return {
    breadth: { kind: 'all' },
    mastery: { groupIds: [] },
    depth: { accuracyPercent: 80 },
    consistency: { count: 4, cadence: 'week' },
  };
}

/**
 * True when the ET anchor has at least one populated dimension —
 * enough to advance to Screen 2 and save. "Populated" means the
 * user has expressed a non-default intention; defaults that the
 * user never touched do not count as populated. We treat the
 * default Depth (80%) and Consistency (4 / week) as the user's
 * accepted defaults — they signal "yes, ship these." Empty subset
 * Breadth (the user toggled to "No" but hasn't picked any group
 * yet) does NOT count as populated and the upstream gate blocks
 * advance until they pick one.
 *
 * Spec call: at least one dimension populated. With defaults pre-
 * filled for Depth and Consistency, the user is always "ready" once
 * the file mounts unless they actively toggled to a Breadth subset
 * with no picks. That's the desired ergonomics — empty defaults
 * commit the user to "yes, the defaults are fine."
 */
function isEarTrainingValid(et: EarTrainingAnchor): boolean {
  // Block: user toggled Breadth to subset but hasn't picked any group.
  if (et.breadth.kind === 'subset' && et.breadth.groupIds.length === 0) return false;
  return true;
}

// =====================================================================
// Harmonic Fluency dimension state
// =====================================================================

/** Group identifiers for HF coverage / mastery. Mirror the four
 *  groups GoalCreationFlow already exposes via the
 *  HARMONIC_FLUENCY_COVERAGE_GROUPS constant — same kebab-case ids
 *  stored in `targetUnit` for HF coverage_specific goals — so any
 *  future progress read can treat the two surfaces interchangeably.
 *  Keys also match `HF_GROUP_CATEGORIES` in `progress.ts` so the
 *  Step 4 progress router resolves them with no translation. */
export type HarmonicFluencyGroupId =
  | 'foundational'
  | 'chord-knowledge'
  | 'functional-applied'
  | 'ear-recognition';

interface HarmonicFluencyAnchor {
  breadth: BreadthState;
  /** Mastery's groupIds are pruned to Breadth's scope by the
   *  coordinated `setBreadth` updater. Same invariant as ET. */
  mastery: { groupIds: HarmonicFluencyGroupId[] };
  depth: { accuracyPercent: number };
  consistency: { count: number; cadence: ConsistencyCadence };
}

const HF_GROUP_LABELS: Record<HarmonicFluencyGroupId, string> = {
  'foundational':       'foundational / math',
  'chord-knowledge':    'chord knowledge',
  'functional-applied': 'functional / applied',
  'ear-recognition':    'ear & recognition',
};

const HF_GROUP_IDS: ReadonlyArray<HarmonicFluencyGroupId> = [
  'foundational',
  'chord-knowledge',
  'functional-applied',
  'ear-recognition',
];

function defaultHarmonicFluency(): HarmonicFluencyAnchor {
  return {
    breadth: { kind: 'all' },
    mastery: { groupIds: [] },
    depth: { accuracyPercent: 80 },
    consistency: { count: 4, cadence: 'week' },
  };
}

function isHarmonicFluencyValid(hf: HarmonicFluencyAnchor): boolean {
  if (hf.breadth.kind === 'subset' && hf.breadth.groupIds.length === 0) return false;
  return true;
}

// =====================================================================
// Shapes & Patterns dimension state
// =====================================================================

/** Activity area identifiers for S&P coverage / depth / mastery.
 *  Snake_case to match the existing convention in `coverageMetrics.ts`,
 *  `progress.ts`, and `goal.targetUnit` storage on existing S&P
 *  coverage_specific goals. Mental Visualization is intentionally
 *  not represented — per the April 27 design call, it counts toward
 *  consistency only, not breadth/depth/mastery. Step 1e wires this
 *  into `itemRefForSkill` returning null. */
export type ShapesAreaId = 'chord_shape_drills' | 'scale_drills' | 'voice_leading';

interface ShapesPatternsAnchor {
  breadth: BreadthState;
  /** Areas the user wants to reach Solid in across all 12 keys.
   *  Pre-filtered to Breadth scope. Empty is a valid resting state
   *  ("no Depth ambition declared this year"). */
  depth: { areaIds: ShapesAreaId[] };
  /** Areas the user wants to truly own at the `mastered` stage.
   *  v1 ships area-level multi-select per the locked design call —
   *  the design doc's item-level picker is filed as a Step 5b
   *  follow-up. Pre-filtered to Breadth scope, same coupling rule
   *  as Depth. Independent of Depth — a user can declare Mastery
   *  ambition on areas they did not target for Depth (uncommon but
   *  coherent: "I want to truly own chord shapes; voice-leading
   *  doesn't need Solid first"). */
  mastery: { areaIds: ShapesAreaId[] };
  /** Consistency unit for S&P is minutes per cadence (vs. ET / HF's
   *  sessions). Mental Visualization activity DOES count toward this
   *  even though it's excluded from the breadth/depth/mastery shape
   *  — its sessions still write to drillSessions and the consistency
   *  reader (Step 4b+) sums all S&P drill time. */
  consistency: { count: number; cadence: ConsistencyCadence };
}

const SHAPES_AREA_LABELS: Record<ShapesAreaId, string> = {
  'chord_shape_drills': 'chord shape drills',
  'scale_drills':       'scale drills',
  'voice_leading':      'voice-leading',
};

const SHAPES_AREA_IDS: ReadonlyArray<ShapesAreaId> = [
  'chord_shape_drills',
  'scale_drills',
  'voice_leading',
];

function defaultShapesPatterns(): ShapesPatternsAnchor {
  return {
    breadth: { kind: 'all' },
    depth: { areaIds: [] },
    mastery: { areaIds: [] },
    // 30 min/week as a "casual but real" entry point — roughly 5 min
    // per session over 6 days. Crank-up via the input.
    consistency: { count: 30, cadence: 'week' },
  };
}

function isShapesPatternsValid(sp: ShapesPatternsAnchor): boolean {
  if (sp.breadth.kind === 'subset' && sp.breadth.groupIds.length === 0) return false;
  return true;
}

function buildInitialDraft(
  moduleId: AnchorModuleId,
  initialAnchor: Goal | null | undefined,
): AnchorDraft {
  // Edit mode (5d will flesh out): pull the umbrella's existing
  // name (its description, since umbrellas store the user-visible
  // name there). Create mode: name stays null and the auto default
  // resolves at save time.
  const draft: AnchorDraft = {
    moduleId,
    name: initialAnchor?.description ?? null,
  };
  // Seed the per-module slot for the chosen module. Other modules
  // land in 5c.4–5c.6.
  if (moduleId === 'ear-training') {
    draft.earTraining = defaultEarTraining();
  } else if (moduleId === 'harmonic-fluency') {
    draft.harmonicFluency = defaultHarmonicFluency();
  } else if (moduleId === 'shapes-and-patterns') {
    draft.shapesPatterns = defaultShapesPatterns();
  }
  return draft;
}

// ---- Props -----------------------------------------------------------

interface Props {
  open: boolean;
  onClose: () => void;
  /** Which module this anchor is for. Required — yearly anchors are
   *  per-module by design. Step 5f's trigger interstitial passes
   *  this through from the user's module-card selection. */
  moduleId: AnchorModuleId;
  /** When set, opens in edit mode pre-filled from this umbrella
   *  goal. Decoder is a 5d concern; 5b plumbs the prop through and
   *  reuses the umbrella's `description` as the initial name. */
  initialAnchor?: Goal | null;
  /** Optional initial focused dimension. Used when Screen 2's
   *  per-dimension Edit link routes back to Screen 1; the dimension
   *  is scrolled into view. Wired in 5d. */
  focusDimension?: AnchorDimension | null;
}

// =====================================================================
// Component
// =====================================================================

export default function YearlyAnchorFlow({
  open,
  onClose,
  moduleId,
  initialAnchor,
  // focusDimension is plumbed through but not yet consumed — 5d wires
  // the scroll-into-view behavior. Renamed here to silence the
  // unused-var lint without burying the prop.
  focusDimension: _focusDimension,
}: Props) {
  const [screenIndex, setScreenIndex] = useState(0);
  const [draft, setDraft] = useState<AnchorDraft>(() =>
    buildInitialDraft(moduleId, initialAnchor),
  );
  const [saving, setSaving] = useState(false);

  const isEditing = !!initialAnchor;

  /**
   * Wrap the parent's onClose so every close path resets the flow
   * to Screen 1 with a freshly-rebuilt initial draft. Routed to:
   * Modal's Esc/backdrop/X (via the onClose prop below), Back on
   * Screen 1 (via goBack), and Save (via goNext on the last screen).
   * Re-opening always lands on Screen 1.
   */
  const handleClose = () => {
    setScreenIndex(0);
    setDraft(buildInitialDraft(moduleId, initialAnchor));
    setSaving(false);
    onClose();
  };

  /**
   * Save logic placeholder — 5e will write the umbrella + N
   * dimension records in a single transaction. For 5b we close
   * cleanly so the shell is testable end-to-end. The `saving` flag
   * exists from day one so 5e doesn't need to retrofit the loading
   * state into the button.
   */
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // 5e: write umbrella + dimension records here.
      console.warn('[yearly-anchor] save not yet implemented (Step 5e)', { draft });
      handleClose();
    } catch (err) {
      console.warn('[yearly-anchor] save failed', err);
      setSaving(false);
    }
  };

  const screen = SCREENS[screenIndex];
  const isFirst = screenIndex === 0;
  const isLast = screenIndex === SCREENS.length - 1;
  /** Per-screen advance gate. Screen 1's gate routes through the
   *  active module's validator; Screen 2's Save shares the gate.
   *  When a module's slot isn't yet populated (5c.4–5c.6 land the
   *  rest), we let the user advance so the shell is reachable end-
   *  to-end during the build. */
  const canAdvance = (() => {
    if (moduleId === 'ear-training' && draft.earTraining) {
      return isEarTrainingValid(draft.earTraining);
    }
    if (moduleId === 'harmonic-fluency' && draft.harmonicFluency) {
      return isHarmonicFluencyValid(draft.harmonicFluency);
    }
    if (moduleId === 'shapes-and-patterns' && draft.shapesPatterns) {
      return isShapesPatternsValid(draft.shapesPatterns);
    }
    return true;
  })();

  const goBack = () => {
    if (isFirst) handleClose();
    else setScreenIndex(i => Math.max(0, i - 1));
  };

  const goNext = () => {
    if (!canAdvance || saving) return;
    if (isLast) {
      void handleSave();
      return;
    }
    setScreenIndex(i => Math.min(SCREENS.length - 1, i + 1));
  };

  const updateDraft = (patch: Partial<AnchorDraft>) => {
    setDraft(d => ({ ...d, ...patch }));
  };

  // ---- Title ----------------------------------------------------------

  const moduleName = MODULE_DISPLAY_NAME[moduleId];
  const title = screen.id === 'intent'
    ? `Set your yearly intention for ${moduleName}`
    : 'Review your yearly anchor';

  // ---- Footer ---------------------------------------------------------

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={goBack}
        className="px-4 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        Back
      </button>
      <ScreenDots currentIndex={screenIndex} total={SCREENS.length} />
      <button
        type="button"
        onClick={goNext}
        disabled={!canAdvance || saving}
        className="px-4 py-2 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLast ? (saving ? 'Saving…' : 'Save anchor') : 'Next'}
      </button>
    </div>
  );

  // ---- Render ---------------------------------------------------------

  return (
    <Modal open={open} onClose={handleClose} title={title} footer={footer}>
      {screen.id === 'intent' ? (
        <ScreenIntent draft={draft} onUpdate={updateDraft} isEditing={isEditing} />
      ) : (
        <ScreenReview draft={draft} onUpdate={updateDraft} />
      )}
    </Modal>
  );
}

// =====================================================================
// Screen 1 — Set your intention
// =====================================================================

/**
 * Per-module router. Each module's dimension surface is its own
 * component below; this wrapper picks the right one and renders the
 * shared intro paragraph above it. Modules whose dimensions land in
 * later substeps fall through to a 5c.x placeholder so the shell
 * stays reachable end-to-end during the build.
 *
 * Dimension order on Screen 1 matches the design call:
 *   Breadth → Mastery → Depth → Consistency
 * (Production omits Mastery; Songs swaps to count-based dimensions;
 *  Practice consistency uses a different 3-question shape entirely.)
 */
function ScreenIntent({
  draft,
  onUpdate,
  isEditing,
}: {
  draft: AnchorDraft;
  onUpdate: (patch: Partial<AnchorDraft>) => void;
  isEditing: boolean;
}) {
  const moduleName = MODULE_DISPLAY_NAME[draft.moduleId];
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        A yearly anchor sets your full intention for {moduleName}. It's a small
        cluster of goals that together describe what you want to cover, how
        deeply, and how often.
      </p>
      {draft.moduleId === 'ear-training' && draft.earTraining && (
        <Screen1EarTraining
          state={draft.earTraining}
          onChange={next => onUpdate({ earTraining: next })}
        />
      )}
      {draft.moduleId === 'harmonic-fluency' && draft.harmonicFluency && (
        <Screen1HarmonicFluency
          state={draft.harmonicFluency}
          onChange={next => onUpdate({ harmonicFluency: next })}
        />
      )}
      {draft.moduleId === 'shapes-and-patterns' && draft.shapesPatterns && (
        <Screen1ShapesPatterns
          state={draft.shapesPatterns}
          onChange={next => onUpdate({ shapesPatterns: next })}
        />
      )}
      {draft.moduleId !== 'ear-training'
        && draft.moduleId !== 'harmonic-fluency'
        && draft.moduleId !== 'shapes-and-patterns' && (
        <div className="rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
          Dimension questions for {moduleName} land in a later 5c substep.
          {isEditing && <span className="block mt-2 text-xs">Edit mode active.</span>}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Ear Training — dimension surface
// =====================================================================

/**
 * Ear Training dimension surface. Four sections in
 * Breadth → Mastery → Depth → Consistency order. Mastery's group
 * options are pre-filtered to the Breadth selection; the
 * coordinated `setBreadth` updater also prunes Mastery's selected
 * groupIds when Breadth narrows so state stays truthful at all
 * times (per the locked design — pruning is destructive; widening
 * Breadth back to "all" does not restore previously-pruned
 * selections).
 *
 * Live denominators come from `earTrainingCounts()` (Step 3) so the
 * Breadth question's "all 143 items" wording flows from the catalog
 * rather than hardcoded copy. Mastery, Depth, and Consistency all
 * use shared primitives from `yearlyAnchorDimensions.tsx`.
 */
function Screen1EarTraining({
  state,
  onChange,
}: {
  state: EarTrainingAnchor;
  onChange: (next: EarTrainingAnchor) => void;
}) {
  const counts = earTrainingCounts();
  // Single ET module accent for the breadth pills. ET groups don't
  // have pre-existing per-group accent definitions (unlike HF, which
  // maps each of the 4 groups to a borrowed module color); single-
  // accent reads cleanly at 4-pill scale.
  const etAccent = moduleMetaById('ear-training')?.accentHex ?? '#5a8752';

  const breadthGroupOptions: BreadthGroupOption[] = ET_GROUP_IDS.map(id => ({
    id,
    label: ET_GROUP_LABELS[id],
    accentHex: etAccent,
  }));

  // Coordinated updater: when Breadth changes, Mastery's selected
  // groupIds are pruned to the new Breadth scope in the same call.
  // pruneMasteryToBreadth is unit-tested in
  // yearlyAnchorDimensions.test.ts.
  const setBreadth = (nextBreadth: BreadthState) => {
    const prunedMasteryIds = pruneMasteryToBreadth(
      nextBreadth,
      state.mastery.groupIds,
    ) as EarTrainingGroupId[];
    onChange({
      ...state,
      breadth: nextBreadth,
      mastery: { groupIds: prunedMasteryIds },
    });
  };

  // Mastery's visible options are filtered to Breadth's scope.
  const visibleMasteryGroups: ReadonlyArray<EarTrainingGroupId> =
    state.breadth.kind === 'all'
      ? ET_GROUP_IDS
      : ET_GROUP_IDS.filter(id => state.breadth.kind === 'subset' && state.breadth.groupIds.includes(id));

  const toggleMasteryGroup = (id: EarTrainingGroupId) => {
    const has = state.mastery.groupIds.includes(id);
    const next = has
      ? state.mastery.groupIds.filter(g => g !== id)
      : [...state.mastery.groupIds, id];
    onChange({ ...state, mastery: { groupIds: next } });
  };

  return (
    <div className="flex flex-col gap-5">
      <DimensionSection
        title="Breadth"
        question={`Do you want to work through all ${counts.total} ear training items this year?`}
      >
        <BreadthYesNoPicker
          yesLabel={`Yes — work through all ${counts.total} items`}
          noLabel="No — just specific groups"
          groups={breadthGroupOptions}
          value={state.breadth}
          onChange={setBreadth}
        />
      </DimensionSection>

      <DimensionSection
        title="Mastery"
        question={
          state.breadth.kind === 'subset' && state.breadth.groupIds.length === 0
            ? 'Pick at least one group above to choose what to master.'
            : 'Are there specific groups you want to truly master?'
        }
      >
        {visibleMasteryGroups.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No groups available — pick a Breadth selection above first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleMasteryGroups.map(id => (
              <CategoryPillButton
                key={id}
                label={ET_GROUP_LABELS[id]}
                accentHex={etAccent}
                active={state.mastery.groupIds.includes(id)}
                onClick={() => toggleMasteryGroup(id)}
                selectedStyle="accent"
              />
            ))}
          </div>
        )}
      </DimensionSection>

      <DimensionSection
        title="Depth"
        question="What overall accuracy level do you want to reach across all of Ear Training by year end?"
      >
        <AccuracySlider
          value={state.depth.accuracyPercent}
          onChange={p => onChange({ ...state, depth: { accuracyPercent: p } })}
        />
      </DimensionSection>

      <DimensionSection
        title="Consistency"
        question="How many times per week do you want to practice Ear Training?"
      >
        <ConsistencyControl
          unit="sessions"
          count={state.consistency.count}
          cadence={state.consistency.cadence}
          onChange={next => onChange({ ...state, consistency: next })}
        />
      </DimensionSection>
    </div>
  );
}

// =====================================================================
// Harmonic Fluency — dimension surface
// =====================================================================

/**
 * Harmonic Fluency dimension surface. Same four-section shape as
 * Ear Training (Breadth → Mastery → Depth → Consistency) but with
 * HF's four groups (Foundational / Math, Chord Knowledge,
 * Functional / Applied, Ear & Recognition) and per-group accent
 * colors so the picker reads the same as GoalCreationFlow's
 * existing accuracy-specific HF picker. Slate-blue / deep-rose /
 * teal / forest-green — borrowed from sibling modules so each group
 * carries its own visual identity at 4-pill scale.
 *
 * Coordinated breadth/mastery pruning, validation, and live
 * denominator from harmonicFluencyCounts() (Step 3) all mirror the
 * ET surface — only the group set + accents differ.
 *
 * Note: the design doc lists per-group descriptions
 * ("Foundational / Math — The building blocks…"). Those are not
 * surfaced on Screen 1 today (4 pills with clear labels read
 * cleanly without expanded copy); filed as Phase 7 polish if
 * onboarding signals the need.
 */
function Screen1HarmonicFluency({
  state,
  onChange,
}: {
  state: HarmonicFluencyAnchor;
  onChange: (next: HarmonicFluencyAnchor) => void;
}) {
  const counts = harmonicFluencyCounts();

  // Per-group accent palette — mirrors the existing
  // HARMONIC_FLUENCY_COVERAGE_GROUPS in GoalCreationFlow.tsx so the
  // two surfaces stay in lockstep visually. If a hex is ever retuned
  // in moduleMeta the change flows through here.
  const HF_GROUP_ACCENTS: Record<HarmonicFluencyGroupId, string> = {
    'foundational':       DASHBOARD_META.accentHex,                                        // slate-blue
    'chord-knowledge':    moduleMetaById('repertoire')?.accentHex      ?? '#a8556b',        // deep rose
    'functional-applied': PRACTICE_SESSIONS_META.accentHex,                                // teal
    'ear-recognition':    moduleMetaById('ear-training')?.accentHex    ?? '#5a8752',        // forest green
  };

  const breadthGroupOptions: BreadthGroupOption[] = HF_GROUP_IDS.map(id => ({
    id,
    label: HF_GROUP_LABELS[id],
    accentHex: HF_GROUP_ACCENTS[id],
  }));

  const setBreadth = (nextBreadth: BreadthState) => {
    const prunedMasteryIds = pruneMasteryToBreadth(
      nextBreadth,
      state.mastery.groupIds,
    ) as HarmonicFluencyGroupId[];
    onChange({
      ...state,
      breadth: nextBreadth,
      mastery: { groupIds: prunedMasteryIds },
    });
  };

  const visibleMasteryGroups: ReadonlyArray<HarmonicFluencyGroupId> =
    state.breadth.kind === 'all'
      ? HF_GROUP_IDS
      : HF_GROUP_IDS.filter(id => state.breadth.kind === 'subset' && state.breadth.groupIds.includes(id));

  const toggleMasteryGroup = (id: HarmonicFluencyGroupId) => {
    const has = state.mastery.groupIds.includes(id);
    const next = has
      ? state.mastery.groupIds.filter(g => g !== id)
      : [...state.mastery.groupIds, id];
    onChange({ ...state, mastery: { groupIds: next } });
  };

  return (
    <div className="flex flex-col gap-5">
      <DimensionSection
        title="Breadth"
        question={`Do you want to work through all ${counts.total} harmonic fluency cards this year?`}
      >
        <BreadthYesNoPicker
          yesLabel={`Yes — work through all ${counts.total} cards`}
          noLabel="No — just specific groups"
          groups={breadthGroupOptions}
          value={state.breadth}
          onChange={setBreadth}
        />
      </DimensionSection>

      <DimensionSection
        title="Mastery"
        question={
          state.breadth.kind === 'subset' && state.breadth.groupIds.length === 0
            ? 'Pick at least one group above to choose what to master.'
            : 'Are there specific areas you want to truly master?'
        }
      >
        {visibleMasteryGroups.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No groups available — pick a Breadth selection above first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleMasteryGroups.map(id => (
              <CategoryPillButton
                key={id}
                label={HF_GROUP_LABELS[id]}
                accentHex={HF_GROUP_ACCENTS[id]}
                active={state.mastery.groupIds.includes(id)}
                onClick={() => toggleMasteryGroup(id)}
                selectedStyle="accent"
              />
            ))}
          </div>
        )}
      </DimensionSection>

      <DimensionSection
        title="Depth"
        question="What overall accuracy level do you want to reach across all of Harmonic Fluency by year end?"
      >
        <AccuracySlider
          value={state.depth.accuracyPercent}
          onChange={p => onChange({ ...state, depth: { accuracyPercent: p } })}
        />
      </DimensionSection>

      <DimensionSection
        title="Consistency"
        question="How many times per week do you want to practice Harmonic Fluency?"
      >
        <ConsistencyControl
          unit="sessions"
          count={state.consistency.count}
          cadence={state.consistency.cadence}
          onChange={next => onChange({ ...state, consistency: next })}
        />
      </DimensionSection>
    </div>
  );
}

// =====================================================================
// Shapes & Patterns — dimension surface
// =====================================================================

/**
 * Shapes & Patterns dimension surface. First divergence from the
 * ET / HF pattern:
 *
 *   - **Depth is a multi-pick area selector**, not an accuracy
 *     slider. The question is "Which areas do you want to reach
 *     Solid in across all 12 keys?" — area-level, not module-wide
 *     percent.
 *
 *   - **Mastery is also area-level for v1** (per the locked Q5
 *     answer). The design doc's item-level "specific shapes you
 *     want to truly own" picker is filed as a Step 5b follow-up.
 *
 *   - **Both Depth and Mastery are pre-filtered to Breadth**, using
 *     the same `pruneMasteryToBreadth` helper as ET / HF. The
 *     coordinated `setBreadth` updater prunes both in the same
 *     state update so neither dimension can hold area ids that fell
 *     outside the active Breadth scope.
 *
 *   - **Consistency unit is minutes/week**, not sessions, mirroring
 *     S&P's session-time tracking (drillSessions write durations).
 *     Mental Visualization activity DOES count toward this even
 *     though it's excluded from breadth/depth/mastery.
 *
 * Single S&P module accent for all three pills — same call as
 * GoalCreationFlow's S&P coverage picker (3 pills with clear
 * labels read cleanly without per-pill differentiation).
 */
function Screen1ShapesPatterns({
  state,
  onChange,
}: {
  state: ShapesPatternsAnchor;
  onChange: (next: ShapesPatternsAnchor) => void;
}) {
  const counts = shapesCounts();
  const spAccent = moduleMetaById('shapes-and-patterns')?.accentHex ?? '#d4885a';

  const breadthGroupOptions: BreadthGroupOption[] = SHAPES_AREA_IDS.map(id => ({
    id,
    label: SHAPES_AREA_LABELS[id],
    accentHex: spAccent,
  }));

  // Coordinated updater: prune BOTH Depth and Mastery when Breadth
  // changes. Re-uses pruneMasteryToBreadth — its name is a leftover
  // from the ET/HF case but its behavior is generic over any string-
  // id list. If a fourth coupled-prune consumer appears, rename to
  // pruneIdsToBreadth across all callers.
  const setBreadth = (nextBreadth: BreadthState) => {
    const prunedDepth = pruneMasteryToBreadth(
      nextBreadth,
      state.depth.areaIds,
    ) as ShapesAreaId[];
    const prunedMastery = pruneMasteryToBreadth(
      nextBreadth,
      state.mastery.areaIds,
    ) as ShapesAreaId[];
    onChange({
      ...state,
      breadth: nextBreadth,
      depth: { areaIds: prunedDepth },
      mastery: { areaIds: prunedMastery },
    });
  };

  const visibleAreas: ReadonlyArray<ShapesAreaId> =
    state.breadth.kind === 'all'
      ? SHAPES_AREA_IDS
      : SHAPES_AREA_IDS.filter(id => state.breadth.kind === 'subset' && state.breadth.groupIds.includes(id));

  const toggleDepthArea = (id: ShapesAreaId) => {
    const has = state.depth.areaIds.includes(id);
    const next = has
      ? state.depth.areaIds.filter(g => g !== id)
      : [...state.depth.areaIds, id];
    onChange({ ...state, depth: { areaIds: next } });
  };

  const toggleMasteryArea = (id: ShapesAreaId) => {
    const has = state.mastery.areaIds.includes(id);
    const next = has
      ? state.mastery.areaIds.filter(g => g !== id)
      : [...state.mastery.areaIds, id];
    onChange({ ...state, mastery: { areaIds: next } });
  };

  return (
    <div className="flex flex-col gap-5">
      <DimensionSection
        title="Breadth"
        question={`Do you want to work toward Comfortable across all ${counts.total} shapes this year? (Mental Visualization is excluded — it counts toward consistency only.)`}
      >
        <BreadthYesNoPicker
          yesLabel={`Yes — work toward Comfortable across all ${counts.total} shapes`}
          noLabel="No — just specific areas"
          groups={breadthGroupOptions}
          value={state.breadth}
          onChange={setBreadth}
        />
      </DimensionSection>

      <DimensionSection
        title="Depth"
        question={
          state.breadth.kind === 'subset' && state.breadth.groupIds.length === 0
            ? 'Pick at least one area above to choose where to push depth.'
            : 'Which areas do you want to reach Solid in across all 12 keys?'
        }
      >
        {visibleAreas.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No areas available — pick a Breadth selection above first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleAreas.map(id => (
              <CategoryPillButton
                key={id}
                label={SHAPES_AREA_LABELS[id]}
                accentHex={spAccent}
                active={state.depth.areaIds.includes(id)}
                onClick={() => toggleDepthArea(id)}
                selectedStyle="accent"
              />
            ))}
          </div>
        )}
      </DimensionSection>

      <DimensionSection
        title="Mastery"
        question={
          state.breadth.kind === 'subset' && state.breadth.groupIds.length === 0
            ? 'Pick at least one area above to choose what to truly own.'
            : 'Are there specific areas you want to truly own — Solid in all 12 keys, no hesitation? (v1 ships area-level; per-shape picker coming later.)'
        }
      >
        {visibleAreas.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No areas available — pick a Breadth selection above first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleAreas.map(id => (
              <CategoryPillButton
                key={id}
                label={SHAPES_AREA_LABELS[id]}
                accentHex={spAccent}
                active={state.mastery.areaIds.includes(id)}
                onClick={() => toggleMasteryArea(id)}
                selectedStyle="accent"
              />
            ))}
          </div>
        )}
      </DimensionSection>

      <DimensionSection
        title="Consistency"
        question="How many minutes a week do you want to practice Shapes & Patterns?"
      >
        <ConsistencyControl
          unit="minutes"
          count={state.consistency.count}
          cadence={state.consistency.cadence}
          onChange={next => onChange({ ...state, consistency: next })}
          min={5}
        />
      </DimensionSection>
    </div>
  );
}

// =====================================================================
// Screen 2 — Review
// =====================================================================

/**
 * Screen 2 placeholder. 5d wires the auto-generated name (editable
 * inline at top), four dimension review rows with per-dimension Edit
 * links, and the natural-language summary block at the bottom with
 * the left accent border.
 */
function ScreenReview({
  draft,
}: {
  draft: AnchorDraft;
  onUpdate: (patch: Partial<AnchorDraft>) => void;
}) {
  const moduleName = MODULE_DISPLAY_NAME[draft.moduleId];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Review your {moduleName} anchor before saving.
      </p>
      <div className="rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
        Auto-generated name + per-dimension review rows + natural-language
        summary land in step 5d.
      </div>
    </div>
  );
}

// =====================================================================
// 2-dot screen indicator
// =====================================================================

/**
 * Mirrors GoalCreationFlow's StepDots component, scoped to the
 * 2-screen YearlyAnchorFlow shape. Kept local so the flow has no
 * cross-file coupling for a 15-line presentational component;
 * promote to a shared `goals/StepDots.tsx` if a third consumer
 * appears.
 */
function ScreenDots({ currentIndex, total }: { currentIndex: number; total: number }) {
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
