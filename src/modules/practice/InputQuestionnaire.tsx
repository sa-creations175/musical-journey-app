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
  seedDraft,
  type DayProfileChoice,
  type InputQuestionnaireDraft,
  type InputQuestionnaireResult,
} from './inputs';
import { loadPrefill, savePrefill } from './inputsPrefill';

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
  /** Pre-seed Q1's time selection. Set by the goals-need-today
   *  screen so the user's chosen time carries through without a
   *  second tap. */
  initialTimeMinutes?: number | null;
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
  initialTimeMinutes,
  hasEarlierSessionsToday,
  pushOnItemCandidates,
}: Props) {
  const [draft, setDraft] = useState<InputQuestionnaireDraft>(EMPTY_DRAFT);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset draft on every open. Order: EMPTY_DRAFT → userPrefs
  // pre-fill (Context + Day plan from last session) → initialDayProfile
  // override (Step 3h Deep tap-through). Time / Intent / Energy are
  // never pre-filled — per-session conscious choices.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      const prefill = await loadPrefill({
        hasEarlierSessionsToday: !!hasEarlierSessionsToday,
      });
      if (cancelled) return;

      setDraft(
        seedDraft({
          prefilledContext: prefill.context,
          prefilledDayPlan: prefill.dayPlan,
          initialDayProfile: initialDayProfile ?? null,
          initialTimeMinutes: initialTimeMinutes ?? null,
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [open, initialDayProfile, initialTimeMinutes, hasEarlierSessionsToday]);

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
    const result = finalizeDraft(draft);
    // Persist Context + Day plan for next session's pre-fill. Fire
    // and forget — no point blocking Generate on a userPref write.
    void savePrefill({ context: result.context, dayPlan: result.dayPlan });
    onGenerate(result);
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
            fullSessionMinutes={initialTimeMinutes ?? null}
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
  fullSessionMinutes,
}: {
  value: number | null;
  onChange: (n: number) => void;
  /** When set, surfaces an extra "Full session — X min" pill at
   *  the front of the row. The pill takes precedence over the
   *  custom-stepper path so a goals-need session whose total
   *  doesn't match a standard preset (e.g. 50, 80, 130 min) still
   *  shows up as a named option, not as a Custom value. */
  fullSessionMinutes?: number | null;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const fullSession =
    fullSessionMinutes != null && fullSessionMinutes > 0
      ? fullSessionMinutes
      : null;
  const isFullSessionValue = fullSession !== null && value === fullSession;
  const isPresetValue =
    value !== null && (TIME_PRESETS_MIN as ReadonlyArray<number>).includes(value);
  const showCustom =
    customOpen
    || (value !== null && !isPresetValue && !isFullSessionValue);

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

  // When the full session minute count happens to collide with one
  // of the standard presets, hide the matching preset to avoid two
  // pills carrying the same value side-by-side.
  const presetsToShow = TIME_PRESETS_MIN.filter(
    n => fullSession === null || n !== fullSession,
  );

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">
        Time available
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {fullSession !== null && (
          <button
            onClick={() => setPreset(fullSession)}
            className={pill(isFullSessionValue && !showCustom)}
          >
            Full session — {fullSession} min
          </button>
        )}
        {presetsToShow.map(n => (
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
  value: 'keys' | 'laptop' | 'phone' | 'full';
  glyph: string;
  label: string;
  subtitle: string;
}> = [
  { value: 'keys',   glyph: '⌨', label: 'Keys',         subtitle: 'keyboard only' },
  { value: 'laptop', glyph: '▭', label: 'Laptop',       subtitle: 'no keyboard, DAW available' },
  { value: 'phone',  glyph: '▯', label: 'Phone',        subtitle: 'most constrained' },
  { value: 'full',   glyph: '⊕', label: 'Full session', subtitle: 'keys first, then everything' },
];

function Q2Context({
  value,
  onChange,
}: {
  value: 'keys' | 'laptop' | 'phone' | 'full' | null;
  onChange: (c: 'keys' | 'laptop' | 'phone' | 'full') => void;
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
            aria-label={`${opt.label} — ${opt.subtitle}`}
          >
            <span aria-hidden className="text-base leading-none mb-0.5">
              {opt.glyph}
            </span>
            <span className="text-xs font-medium">{opt.label}</span>
            <span className={`text-[10px] leading-tight ${
              value === opt.value
                ? 'text-white/80'
                : 'text-neutral-500 dark:text-neutral-400'
            }`}>
              {opt.subtitle}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function contextPill(active: boolean): string {
  const base =
    'flex-1 inline-flex flex-col items-center justify-center gap-0 px-2 py-2 rounded-md border text-center';
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

/** Plain-English descriptions shown via the IntentInfoTip popover
 *  next to each intent pill. Used as both popover text and
 *  aria-label so screen readers see the same explanation hover users
 *  do. */
const INTENT_DESCRIPTIONS = {
  balanced: 'Mix of all your active goals, weighted by urgency and pace',
  lean_to_goals: 'Prioritizes your most behind or time-sensitive goals',
  push_on_item: 'Deep focus on one module or goal for the full session',
} as const;

/**
 * ⓘ icon with a hover/focus/tap-triggered popover. The shared
 * `InfoTip` in goals/atoms.tsx uses the native HTML `title`
 * attribute, which has a ~1.5s reveal delay on desktop and never
 * shows on touch — wrong fit for a questionnaire where the user is
 * actively deciding between options and needs the description
 * promptly. This variant renders the text inline as a positioned
 * span so the user sees it instantly on hover or focus, and on
 * touch by tapping the icon.
 */
function IntentInfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-label={text}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 focus:outline-none focus:text-fluent"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 1a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 2.25a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zM7.25 7h1.5v5h-1.5V7z" />
        </svg>
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-10 left-1/2 -translate-x-1/2 top-full mt-1.5 w-56 px-2.5 py-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[11px] leading-snug shadow-lg pointer-events-none"
        >
          {text}
        </span>
      )}
    </span>
  );
}

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
      <div className="flex flex-wrap gap-x-2 gap-y-1.5">
        <span className="flex items-center gap-1">
          <button onClick={() => onChange({ kind: 'balanced' })} className={pill(isBal)}>
            balanced
          </button>
          <IntentInfoTip text={INTENT_DESCRIPTIONS.balanced} />
        </span>
        <span className="flex items-center gap-1">
          <button onClick={() => onChange({ kind: 'lean_to_goals' })} className={pill(isLean)}>
            lean to goals
          </button>
          <IntentInfoTip text={INTENT_DESCRIPTIONS.lean_to_goals} />
        </span>
        <span className="flex items-center gap-1">
          <button onClick={handlePushClick} className={pill(isPush)}>
            push on item
          </button>
          <IntentInfoTip text={INTENT_DESCRIPTIONS.push_on_item} />
        </span>
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

