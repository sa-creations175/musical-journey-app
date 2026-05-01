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
  CUSTOM_TIME_MAX,
  CUSTOM_TIME_MIN,
  CUSTOM_TIME_STEP,
  EMPTY_DRAFT,
  TIME_PRESETS_MIN,
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
  /**
   * Candidate items the user can pick for "push on a specific item"
   * intent. Typically the algorithm's currently-acquiring + active-
   * goal-linked set. Empty list is fine — the picker shows a
   * graceful empty state and gently steers the user back to another
   * intent. Wired by the Practice Sessions home in Step 7a.
   */
  pushOnItemCandidates?: ReadonlyArray<{ itemRef: string; label: string }>;
}

export default function InputQuestionnaire({
  open,
  onClose,
  onGenerate,
  initialDayProfile,
  hasEarlierSessionsToday,
  pushOnItemCandidates,
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
          <Q1Time
            value={draft.timeMinutes}
            onChange={n => setDraft(d => ({ ...d, timeMinutes: n }))}
          />
          <Q2Context
            value={draft.context}
            onChange={c => setDraft(d => ({ ...d, context: c }))}
          />
          <Q3DayPlan
            value={draft.dayPlan}
            hasEarlierSessions={!!hasEarlierSessionsToday}
            onChange={p => setDraft(d => ({ ...d, dayPlan: p }))}
          />
          <Q4Intent
            value={draft.intent}
            candidates={pushOnItemCandidates ?? []}
            onChange={i => setDraft(d => ({ ...d, intent: i }))}
          />
          <Q5Energy
            value={draft.energy}
            onChange={e => setDraft(d => ({ ...d, energy: e }))}
          />
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

// ---------------------------------------------------------------------
// Q1 — Time available
// ---------------------------------------------------------------------

function Q1Time({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const isPresetValue = value !== null && (TIME_PRESETS_MIN as ReadonlyArray<number>).includes(value);
  const showCustom = customOpen || (value !== null && !isPresetValue);

  // Stepper anchor — when value is null we seed at 30 min (the
  // middle of the presets) so the +/- buttons feel oriented.
  const stepperValue = value ?? 30;

  const setPreset = (n: number) => {
    onChange(n);
    setCustomOpen(false);
  };
  const openCustom = () => setCustomOpen(true);
  const dec = () => onChange(Math.max(CUSTOM_TIME_MIN, stepperValue - CUSTOM_TIME_STEP));
  const inc = () => onChange(Math.min(CUSTOM_TIME_MAX, stepperValue + CUSTOM_TIME_STEP));

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">
        Time available
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {TIME_PRESETS_MIN.map(n => (
          <button
            key={n}
            onClick={() => setPreset(n)}
            className={pill(value === n && !showCustom)}
          >
            {n} min
          </button>
        ))}
        <button onClick={openCustom} className={pill(showCustom)}>
          custom
        </button>
      </div>
      {showCustom && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={dec}
            disabled={stepperValue <= CUSTOM_TIME_MIN}
            className={stepperBtn(stepperValue <= CUSTOM_TIME_MIN)}
            aria-label="decrease time"
          >
            −
          </button>
          <span className="font-mono tabular-nums text-sm w-16 text-center">
            {stepperValue} min
          </span>
          <button
            onClick={inc}
            disabled={stepperValue >= CUSTOM_TIME_MAX}
            className={stepperBtn(stepperValue >= CUSTOM_TIME_MAX)}
            aria-label="increase time"
          >
            +
          </button>
        </div>
      )}
    </section>
  );
}

function pill(active: boolean): string {
  return active
    ? 'px-2.5 py-1 rounded-md text-xs font-medium bg-fluent text-white border border-fluent'
    : 'px-2.5 py-1 rounded-md text-xs font-medium border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent';
}

function stepperBtn(disabled: boolean): string {
  return disabled
    ? 'w-7 h-7 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-300 cursor-not-allowed'
    : 'w-7 h-7 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent';
}

// ---------------------------------------------------------------------
// Q2 — Context
// ---------------------------------------------------------------------

const CONTEXT_OPTIONS: ReadonlyArray<{
  value: 'keys' | 'laptop' | 'phone';
  glyph: string;
  label: string;
}> = [
  { value: 'keys',   glyph: '⌨', label: 'keys' },
  { value: 'laptop', glyph: '▭', label: 'laptop' },
  { value: 'phone',  glyph: '▯', label: 'phone' },
];

function Q2Context({
  value,
  onChange,
}: {
  value: 'keys' | 'laptop' | 'phone' | 'mixed' | null;
  onChange: (c: 'keys' | 'laptop' | 'phone') => void;
}) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">
        Context
      </div>
      <div className="flex gap-1.5">
        {CONTEXT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={contextPill(value === opt.value)}
            aria-label={opt.label}
          >
            <span aria-hidden className="text-base leading-none">{opt.glyph}</span>
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function contextPill(active: boolean): string {
  const base =
    'flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border';
  return active
    ? `${base} bg-fluent text-white border-fluent`
    : `${base} border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent`;
}

// ---------------------------------------------------------------------
// Q3 — Day plan
// ---------------------------------------------------------------------

const DAY_PROFILES: ReadonlyArray<DayProfileChoice> = ['standard', 'light', 'deep', 'custom'];

function Q3DayPlan({
  value,
  hasEarlierSessions,
  onChange,
}: {
  value: import('./inputs').DayPlanChoice | null;
  hasEarlierSessions: boolean;
  onChange: (p: import('./inputs').DayPlanChoice) => void;
}) {
  const isJust = value?.kind === 'just_this_session';
  const isFirst = value?.kind === 'first_of_multiple';
  const isContinuing = value?.kind === 'continuing_today';

  const handleFirstClick = () => {
    if (isFirst) return;
    // Default to 'standard' for the fast path; user can change in
    // the profile picker below.
    onChange({ kind: 'first_of_multiple', profile: 'standard' });
  };

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">
        Day plan
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onChange({ kind: 'just_this_session' })}
          className={pill(isJust)}
        >
          just this session
        </button>
        <button onClick={handleFirstClick} className={pill(isFirst)}>
          first of multiple
        </button>
        {hasEarlierSessions && (
          <button
            onClick={() => onChange({ kind: 'continuing_today' })}
            className={pill(isContinuing)}
          >
            continuing today
          </button>
        )}
      </div>
      {isFirst && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
            Day profile
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DAY_PROFILES.map(p => (
              <button
                key={p}
                onClick={() => onChange({ kind: 'first_of_multiple', profile: p })}
                className={pill(value.profile === p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Q4 — Intent (+ inline item picker for push-on-specific)
// ---------------------------------------------------------------------

function Q4Intent({
  value,
  candidates,
  onChange,
}: {
  value: import('./inputs').IntentChoice | null;
  candidates: ReadonlyArray<{ itemRef: string; label: string }>;
  onChange: (i: import('./inputs').IntentChoice) => void;
}) {
  const isBal = value?.kind === 'balanced';
  const isLean = value?.kind === 'lean_to_goals';
  const isRecover = value?.kind === 'recover';
  const isPush = value?.kind === 'push_on_item';
  const pushedRef = isPush ? value.itemRef : null;

  const handlePushClick = () => {
    if (isPush) return;
    onChange({ kind: 'push_on_item', itemRef: null });
  };

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">
        Intent
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => onChange({ kind: 'balanced' })} className={pill(isBal)}>
          balanced
        </button>
        <button onClick={() => onChange({ kind: 'lean_to_goals' })} className={pill(isLean)}>
          lean to goals
        </button>
        <button onClick={() => onChange({ kind: 'recover' })} className={pill(isRecover)}>
          recover
        </button>
        <button onClick={handlePushClick} className={pill(isPush)}>
          push on item
        </button>
      </div>
      {isPush && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
            Pick an item
          </div>
          {candidates.length === 0 ? (
            <p className="text-[11px] italic text-neutral-500">
              No candidate items available — set a goal first, or pick a different intent.
            </p>
          ) : (
            <div className="max-h-32 overflow-y-auto pr-1 space-y-1">
              {candidates.map(c => (
                <button
                  key={c.itemRef}
                  onClick={() => onChange({ kind: 'push_on_item', itemRef: c.itemRef })}
                  className={`w-full text-left ${pill(c.itemRef === pushedRef)}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Q5 — Energy check-in (all skippable)
// ---------------------------------------------------------------------

function Q5Energy({
  value,
  onChange,
}: {
  value: import('./inputs').EnergyChoice;
  onChange: (e: import('./inputs').EnergyChoice) => void;
}) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">
        Energy <span className="text-neutral-400 normal-case">(skippable)</span>
      </div>
      <div className="space-y-1.5">
        <ScaleRow
          label="focus"
          value={value.focus}
          onChange={n => onChange({ ...value, focus: n })}
        />
        <ScaleRow
          label="motivation"
          value={value.motivation}
          onChange={n => onChange({ ...value, motivation: n })}
        />
        <ScaleRow
          label="inspiration"
          value={value.inspiration}
          onChange={n => onChange({ ...value, inspiration: n })}
        />
      </div>
    </section>
  );
}

function ScaleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-neutral-500 w-20 shrink-0">{label}</span>
      <div className="flex gap-1 flex-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onChange(value === n ? null : n)}
            aria-label={`${label} ${n}`}
            aria-pressed={value === n}
            className={`flex-1 py-1 rounded-md text-[11px] font-mono tabular-nums border ${
              value === n
                ? 'bg-fluent text-white border-fluent'
                : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

