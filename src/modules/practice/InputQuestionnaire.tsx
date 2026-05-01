/**
 * Phase 3 Step 3 — Input questionnaire bottom sheet.
 *
 * Five questions stack vertically: Time → Context → Day plan →
 * Intent → Energy. Slides up from the bottom of the viewport on
 * mobile; centered modal on desktop. No typing anywhere — every
 * interaction is a tap (presets, icons, toggles, scale rows).
 *
 * Generate button always visible at the bottom; disabled until the
 * required fields land. Energy is skippable.
 *
 * 3a (this commit) ships the shell + the draft state machine + the
 * Generate gate. Each subsequent substep (3b–3f) wires one question.
 * 3g adds pre-fill from userPrefs; 3h adds the external Deep-day
 * tap-through hook.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  EMPTY_DRAFT,
  finalizeDraft,
  isDraftComplete,
  type DayProfileChoice,
  type InputQuestionnaireDraft,
  type InputQuestionnaireResult,
} from './inputs';

interface Props {
  open: boolean;
  onClose: () => void;
  onGenerate: (inputs: InputQuestionnaireResult) => void;
  /**
   * Pre-select Day plan = "First of multiple" with the supplied
   * profile when the sheet opens. Used by Step 7c — the Practice
   * Sessions home feasibility banner taps through here with
   * profile = 'deep' so the user lands on Deep without tapping.
   * Wired in Step 3h.
   */
  initialDayProfile?: DayProfileChoice | null;
  /** True when at least one practice session has been logged today
   *  — gates Q3's "Continuing today's plan" option. Step 3d wires
   *  the gate; Step 3g pulls the value from the day's session log. */
  hasEarlierSessionsToday?: boolean;
}

export default function InputQuestionnaire({
  open,
  onClose,
  onGenerate,
  initialDayProfile,
}: Props) {
  const [draft, setDraft] = useState<InputQuestionnaireDraft>(EMPTY_DRAFT);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset draft on every open. Pre-fill (3g) and Deep tap-through (3h)
  // hooks layer on top of EMPTY_DRAFT here so each open starts from a
  // known state.
  useEffect(() => {
    if (!open) return;
    const seeded: InputQuestionnaireDraft = { ...EMPTY_DRAFT };
    if (initialDayProfile) {
      seeded.dayPlan = { kind: 'first_of_multiple', profile: initialDayProfile };
    }
    setDraft(seeded);
  }, [open, initialDayProfile]);

  // Body scroll lock + Escape to close, mirroring the standard Modal.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const complete = isDraftComplete(draft);

  const handleGenerate = () => {
    if (!complete) return;
    onGenerate(finalizeDraft(draft));
  };

  // Subsequent substeps replace these placeholders with real
  // question UI. Each substep is a self-contained diff — drop the
  // placeholder, drop in the question, wire setDraft.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Plan your practice session"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-neutral-900 w-full sm:max-w-md sm:rounded-card rounded-t-card border-t sm:border border-neutral-200 dark:border-neutral-800 shadow-xl flex flex-col max-h-[90vh] focus:outline-none"
      >
        <header className="shrink-0 px-4 sm:px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-medium tracking-tight">Plan your session</h3>
          <button
            onClick={onClose}
            aria-label="close"
            className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 text-xl leading-none -mt-1"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-3 space-y-4 text-sm">
          <QuestionPlaceholder slotLabel="Time" />
          <QuestionPlaceholder slotLabel="Context" />
          <QuestionPlaceholder slotLabel="Day plan" />
          <QuestionPlaceholder slotLabel="Intent" />
          <QuestionPlaceholder slotLabel="Energy" />
        </div>

        <footer className="shrink-0 px-4 sm:px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs"
          >
            cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!complete}
            className={`px-4 py-1.5 rounded-md text-xs font-medium text-white ${
              complete
                ? 'bg-fluent hover:opacity-90'
                : 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
            }`}
          >
            generate
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function QuestionPlaceholder({ slotLabel }: { slotLabel: string }) {
  return (
    <section className="rounded-md border border-dashed border-neutral-200 dark:border-neutral-700 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
        {slotLabel}
      </div>
      <div className="text-xs text-neutral-500">
        Q slot — landing in a later substep.
      </div>
    </section>
  );
}
