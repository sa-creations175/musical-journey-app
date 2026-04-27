import { useState } from 'react';
import Modal from '../../components/Modal';
import type { Goal, GoalScope } from '../../lib/db';

/**
 * Phase 1.6 — guided 5-step goal creation flow. Replaces
 * `GoalFormModal` once all build steps land.
 *
 * Built so far:
 *   Step 1 — module cards (this commit)
 *   Shell — navigation, 5-dot indicator, back/next (previous commit)
 *
 * Still to land: target surfaces (Phase 1.6 build steps 3–8), scope
 * cards (step 9), parent goal picker (step 10), save logic (step 11),
 * multi-target encoding (step 13), edit mode (step 14), entry-point
 * swap (step 15).
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
 * Cumulative answers across the flow. Grows step-by-step — only
 * `moduleId` is meaningful today. Future steps add target,
 * timeframe, parent goal, and note fields.
 */
interface Draft {
  moduleId: ModuleCardId | null;
}

const EMPTY_DRAFT: Draft = {
  moduleId: null,
};

// ---- Per-step validity ---------------------------------------------

function isCurrentStepValid(stepId: StepDef['id'], draft: Draft): boolean {
  switch (stepId) {
    case '1':
      return draft.moduleId !== null;
    // TODO: real gates land in steps 3–10 alongside each step's UI.
    case '2':
    case '3':
    case '3.5':
    case '4':
    default:
      return true;
  }
}

// ---- Component -----------------------------------------------------

export default function GoalCreationFlow({ open, onClose }: Props) {
  // `initialGoal` and `initialScope` are declared on Props so
  // consumers can pass them today, but not yet read here. Wired in
  // step 9 (scope pre-fill) and step 14 (edit-mode landing step).
  // TODO (step 11): reset stepIndex AND draft when the modal is
  // closed externally — Esc, backdrop click, or the X button.
  // Currently re-opening lands on whatever step the user was on at
  // close, with whatever they had selected. Revisit when the rest
  // of draft state lands.
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const canAdvance = isCurrentStepValid(step.id, draft);

  const goBack = () => {
    if (isFirst) onClose();
    else setStepIndex(i => Math.max(0, i - 1));
  };

  const goNext = () => {
    if (!canAdvance) return;
    if (isLast) {
      // TODO: real save in step 11. Shell just dismisses.
      onClose();
      setStepIndex(0);
      setDraft(EMPTY_DRAFT);
    } else {
      setStepIndex(i => Math.min(STEPS.length - 1, i + 1));
    }
  };

  const selectModule = (id: ModuleCardId) => {
    setDraft(d => ({ ...d, moduleId: id }));
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
    <Modal open={open} onClose={onClose} title={step.title} footer={footer}>
      {renderStep(step, draft, selectModule)}
    </Modal>
  );
}

function renderStep(
  step: StepDef,
  draft: Draft,
  selectModule: (id: ModuleCardId) => void,
) {
  switch (step.id) {
    case '1':
      return <Step1ModuleCards selectedId={draft.moduleId} onSelect={selectModule} />;
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
  return (
    <button
      type="button"
      onClick={() => onSelect(card.id)}
      aria-pressed={selected}
      className={`text-left rounded-card border p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 ${
        selected
          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
      }`}
    >
      <div className="text-sm font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
        {card.name}
      </div>
      <div className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
        {card.description}
      </div>
      <div className="mt-2 text-xs italic text-neutral-500 dark:text-neutral-500 leading-relaxed">
        “{card.example}”
      </div>
    </button>
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
