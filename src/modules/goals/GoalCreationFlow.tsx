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
import {
  CROSS_KEY_PERCENT_DEFAULT,
  buildKeyStateHints,
  type KeyStateHint,
  type SongTargetSelection,
} from './songTarget';
import SongTargetSection, { SongPreview } from './SongTargetSection';
import Field from './Field';
import { inputClass } from './formStyles';

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
}

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

const EMPTY_DRAFT: Draft = {
  moduleId: null,
  songId: null,
  songTarget: defaultSongTarget(),
  earTraining: defaultEarTraining(),
  harmonicFluency: defaultHarmonicFluency(),
  shapesPatterns: defaultShapesPatterns(),
};

// ---- Per-step validity ---------------------------------------------

function isCurrentStepValid(stepId: StepDef['id'], draft: Draft): boolean {
  switch (stepId) {
    case '1':
      return draft.moduleId !== null;
    case '2':
      return isStep2Valid(draft);
    // TODO: real gates land in steps 9 / 10 alongside each step's UI.
    case '3':
    case '3.5':
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
  // TODO: Step 2 validity for the other two modules lands with their
  // UI in build steps 7–8. Until then, default-true.
  return true;
}

function isEarTrainingValid(t: EarTrainingTarget): boolean {
  // At least one target must be enabled.
  if (!t.accuracyEnabled && !t.consistencyEnabled) return false;
  if (t.accuracyEnabled && t.accuracyScope === 'specific') {
    if (!t.drillTypeId || !t.drillSubtypeId) return false;
  }
  if (t.consistencyEnabled && t.consistencyCount < 1) return false;
  return true;
}

function isHarmonicFluencyValid(t: HarmonicFluencyTarget): boolean {
  if (!t.accuracyEnabled && !t.consistencyEnabled) return false;
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

// ---- Component -----------------------------------------------------

export default function GoalCreationFlow({ open, onClose }: Props) {
  // `initialGoal` and `initialScope` are declared on Props so
  // consumers can pass them today, but not yet read here. Wired in
  // step 9 (scope pre-fill) and step 14 (edit-mode landing step).
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  // Wrap the parent's onClose so every close path resets to Step 1
  // with an empty draft. Routed to: Modal's Esc/backdrop/X (via the
  // onClose prop below), Back on Step 1 (via goBack), and Save (via
  // goNext on the last step). Re-opening always lands on Step 1
  // with no carry-over state.
  const handleClose = () => {
    setStepIndex(0);
    setDraft(EMPTY_DRAFT);
    onClose();
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
    if (!canAdvance) return;
    if (isLast) {
      // TODO: real save in step 11. Shell just dismisses; handleClose
      // resets stepIndex and draft.
      handleClose();
    } else {
      setStepIndex(i => Math.min(STEPS.length - 1, i + 1));
    }
  };

  const selectModule = (id: ModuleCardId) => {
    setDraft(d => {
      // No-op when re-selecting the same module — preserves any
      // module-specific selections the user has already made.
      if (d.moduleId === id) return d;
      return {
        ...d,
        moduleId: id,
        // Switching modules invalidates module-specific state.
        songId: null,
        songTarget: defaultSongTarget(),
        earTraining: defaultEarTraining(),
        harmonicFluency: defaultHarmonicFluency(),
        shapesPatterns: defaultShapesPatterns(),
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
        disabled={!canAdvance}
        className="px-4 py-2 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLast ? 'Save goal' : 'Next'}
      </button>
    </div>
  );

  return (
    <Modal open={open} onClose={handleClose} title={step.title} footer={footer}>
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
    case null:
      // Defensive — shouldn't be reachable since Step 1 gates Next on
      // module being set, but keeps types honest.
      return (
        <div className="min-h-[200px] flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
          Pick a module first.
        </div>
      );
    default:
      // TODO: Step 2 surfaces for the other two modules land in build
      // steps 7–8. Until then, placeholder so navigation works end-to-end.
      return (
        <div className="min-h-[200px] flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
          Step 2 for this module — coming soon.
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
        Pick at least one target. You can combine accuracy and consistency on a single goal.
      </p>
      <AccuracyTargetCard target={target} onChange={setTarget} />
      <ConsistencyTargetCard target={target} onChange={setTarget} />
      <EarTrainingPreview target={target} />
    </div>
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
}: {
  target: T;
  onChange: (next: T) => void;
  /** Field label and ARIA label for the count input. Defaults to
   *  "Sessions" — modules that consume minutes (e.g., Shapes &
   *  Patterns) override with "Minutes". */
  unitLabel?: string;
  /** Card-header hint text. Defaults to the sessions phrasing;
   *  override per module to keep the unit honest. */
  hint?: string;
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
      title="Consistency target"
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
        Pick at least one target. You can combine accuracy and consistency on a single goal.
      </p>
      <HarmonicFluencyAccuracyCard target={target} onChange={setTarget} />
      <ConsistencyTargetCard target={target} onChange={setTarget} />
      <TargetPreview text={previewHarmonicFluencyTarget(target)} />
    </div>
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
}: {
  label: string;
  accentHex: string;
  active: boolean;
  onClick: () => void;
}) {
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
