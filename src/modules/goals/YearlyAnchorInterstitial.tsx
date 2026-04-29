import Modal from '../../components/Modal';
import { MODULE_DISPLAY_NAME, type AnchorModuleId } from './YearlyAnchorFlow';

/**
 * Phase 2 step 5f — trigger interstitial.
 *
 * Modal-on-modal dialog that fires from GoalCreationFlow when the
 * user advances Step 1 → Step 2 with a module selected for which
 * no active yearly anchor exists. Per the locked design call:
 * preserves agency. Two buttons, neither implicit:
 *
 *   [Set yearly anchor first] — closes GoalCreationFlow and opens
 *     YearlyAnchorFlow for the picked module. The user's in-
 *     progress goal draft is discarded; they'll come back to goal
 *     creation once the anchor is saved (Phase 7 polish: preserve
 *     the draft and resume after anchor).
 *
 *   [Skip — just create this goal] — dismisses the prompt for this
 *     module within the current GoalCreationFlow session and
 *     advances to Step 2 normally. Reopening the flow refires the
 *     check.
 *
 * The `dismiss for session` semantic is per-module, not global —
 * if the user later picks a different module that also has no
 * anchor, the interstitial fires again for that module.
 */
export default function YearlyAnchorInterstitial({
  open,
  moduleId,
  onSetAnchor,
  onSkip,
}: {
  open: boolean;
  /** Module the user just selected on Step 1. Required when open. */
  moduleId: AnchorModuleId | null;
  /** User picked "Set yearly anchor first" — parent should close
   *  GoalCreationFlow and open YearlyAnchorFlow with this moduleId. */
  onSetAnchor: () => void;
  /** User picked "Skip — just create this goal" — dismiss the
   *  interstitial for this module in the current session and
   *  advance to Step 2. */
  onSkip: () => void;
}) {
  if (!moduleId) return null;
  const moduleName = MODULE_DISPLAY_NAME[moduleId];

  const footer = (
    <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2">
      <button
        type="button"
        onClick={onSkip}
        className="px-4 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        Skip — just create this goal
      </button>
      <button
        type="button"
        onClick={onSetAnchor}
        className="px-4 py-2 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700"
        data-autofocus
      >
        Set yearly anchor first
      </button>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onSkip}
      title={`Set a yearly anchor for ${moduleName} first?`}
      footer={footer}
    >
      <div className="flex flex-col gap-3 text-sm text-neutral-700 dark:text-neutral-200">
        <p>
          A yearly anchor sets your full intention for {moduleName} —
          what you want to cover, how deeply, and how often. It takes
          a couple of minutes and gives every goal you create after
          it a place to fit.
        </p>
        <p className="text-neutral-500 dark:text-neutral-400">
          You can skip this and come back later — there's a permanent
          prompt in your by-module view.
        </p>
      </div>
    </Modal>
  );
}
