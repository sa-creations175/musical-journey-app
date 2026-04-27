import { useState } from 'react';
import Modal from '../../components/Modal';
import type { Goal, GoalScope } from '../../lib/db';

/**
 * Phase 1.6 — guided 5-step goal creation flow. Replaces
 * `GoalFormModal` once all build steps land. This file is Phase 1.6
 * step 1: shell only — navigation, dot indicator, back/next.
 * Module cards (step 2), target surfaces (steps 3–8), parent goal
 * picker (step 10), save logic (step 11), and entry-point swap
 * (step 15) all arrive in later commits.
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

export default function GoalCreationFlow({ open, onClose }: Props) {
  // `initialGoal` and `initialScope` are declared on Props so
  // consumers can pass them today, but not yet read here. Wired in
  // step 9 (scope pre-fill) and step 14 (edit-mode landing step).
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const goBack = () => {
    if (isFirst) onClose();
    else setStepIndex(i => Math.max(0, i - 1));
  };

  const goNext = () => {
    // TODO: real gate in steps 2–10 — Next should require the
    // current step's selection to be valid. Shell always advances.
    if (isLast) {
      // TODO: real save in step 11. Shell just dismisses.
      onClose();
      setStepIndex(0);
    } else {
      setStepIndex(i => Math.min(STEPS.length - 1, i + 1));
    }
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
        // TODO: real gate per step — disable until current step's
        // required selection is made.
        className="px-4 py-2 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700"
      >
        {isLast ? 'Save goal' : 'Next'}
      </button>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={step.title} footer={footer}>
      <div className="min-h-[200px] flex items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
        {step.label} — placeholder
      </div>
    </Modal>
  );
}

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
