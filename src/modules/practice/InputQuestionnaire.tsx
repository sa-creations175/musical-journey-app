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

import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  loadLastIntentKind,
  loadPrefill,
  savePrefill,
  type IntentKind,
} from './inputsPrefill';
import {
  deepFocusModuleOptions,
  shouldOfferDeepFocusSong,
  type DeepFocusModuleOption,
} from '../../lib/sessionAlgorithm/flexibleProposal';
import type { PaceBand } from '../../lib/sessionAlgorithm/pace';
import { db, type Goal, type Song, type SpacingState } from '../../lib/db';
import { loadWeeklyPace } from './sessionGenerator';
import type { WeeklyPaceResult } from '../../lib/sessionAlgorithm/weeklyPace';

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
}

export default function InputQuestionnaire({
  open,
  onClose,
  onGenerate,
  initialDayProfile,
  initialTimeMinutes,
  hasEarlierSessionsToday,
}: Props) {
  const [draft, setDraft] = useState<InputQuestionnaireDraft>(EMPTY_DRAFT);
  const panelRef = useRef<HTMLDivElement>(null);
  // Deep-focus picker source data — loaded once per sheet open.
  // `deepFocusModuleOptions` is filtered by draft.context inside a
  // useMemo below so switching Q2 re-derives without re-querying.
  // `songOptions` is context-independent (db.songs sorted by
  // learningOrder).
  const [deepFocusSource, setDeepFocusSource] = useState<{
    goals: ReadonlyArray<Goal>;
    spacingRows: ReadonlyArray<SpacingState>;
    weeklyPace: WeeklyPaceResult;
    songOptions: ReadonlyArray<{ songId: string; title: string }>;
    now: number;
  } | null>(null);
  // Last intent the user committed to (persisted on Accept, not
  // Generate). Surfaced as a "Last time: …" hint on Q4 — informational
  // only; never pre-selects.
  const [lastIntentKind, setLastIntentKind] = useState<IntentKind | null>(null);

  // Reset draft on every open. Order: EMPTY_DRAFT → userPrefs
  // pre-fill (Context + Day plan from last session) → initialDayProfile
  // override (Step 3h Deep tap-through). Time / Intent / Energy are
  // never pre-filled — per-session conscious choices.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      const [prefill, lastIntent] = await Promise.all([
        loadPrefill({ hasEarlierSessionsToday: !!hasEarlierSessionsToday }),
        loadLastIntentKind(),
      ]);
      if (cancelled) return;

      setDraft(
        seedDraft({
          prefilledContext: prefill.context,
          prefilledDayPlan: prefill.dayPlan,
          initialDayProfile: initialDayProfile ?? null,
          initialTimeMinutes: initialTimeMinutes ?? null,
        }),
      );
      setLastIntentKind(lastIntent);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, initialDayProfile, initialTimeMinutes, hasEarlierSessionsToday]);

  // Load deep-focus picker source data on every open. The picker
  // only renders inside Q4 (push_on_item), but loading on open keeps
  // the data ready by the time the user gets to Q4 — typical
  // questionnaire fills take longer than this query batch.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const now = Date.now();
      const [goals, spacingRows, weeklyPace, songs] = await Promise.all([
        db.goals.where('status').equals('active').toArray(),
        db.spacingState.toArray(),
        loadWeeklyPace(now),
        db.songs.orderBy('learningOrder').toArray(),
      ]);
      if (cancelled) return;
      setDeepFocusSource({
        goals,
        spacingRows,
        weeklyPace,
        songOptions: songs.map((s: Song) => ({ songId: s.id, title: s.title })),
        now,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const pushOnItemModuleOptions = useMemo<ReadonlyArray<DeepFocusModuleOption>>(() => {
    if (!deepFocusSource || !draft.context) return [];
    return deepFocusModuleOptions({
      context: draft.context,
      weeklyPace: deepFocusSource.weeklyPace,
      goals: deepFocusSource.goals,
      spacingRows: deepFocusSource.spacingRows,
      now: deepFocusSource.now,
    });
  }, [deepFocusSource, draft.context]);

  const pushOnItemSongOptions = deepFocusSource?.songOptions ?? [];

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
            moduleOptions={pushOnItemModuleOptions}
            songOptions={pushOnItemSongOptions}
            timeMinutes={draft.timeMinutes}
            lastIntentKind={lastIntentKind}
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

/** Plain-English descriptions rendered inline under each intent
 *  option's label. Doubles as aria-label so screen readers hear the
 *  same explanation sighted users read. */
const INTENT_DESCRIPTIONS = {
  balanced: 'The algo decides. Covers your most urgent items at the right balance.',
  lean_to_goals: 'Shifts time toward your most behind modules and submodules.',
  push_on_item: 'Full session on one module, or one module and a song at 60+ min.',
} as const;

const INTENT_LABELS: Record<IntentKind, string> = {
  balanced: 'Balanced',
  lean_to_goals: 'Lean to goals',
  push_on_item: 'Push on item',
};

const INTENT_ORDER: ReadonlyArray<IntentKind> = ['balanced', 'lean_to_goals', 'push_on_item'];

function Q4Intent({
  value,
  moduleOptions,
  songOptions,
  timeMinutes,
  lastIntentKind,
  onChange,
}: {
  value: import('./inputs').IntentChoice | null;
  moduleOptions: ReadonlyArray<DeepFocusModuleOption>;
  songOptions: ReadonlyArray<{ songId: string; title: string }>;
  timeMinutes: number | null;
  lastIntentKind: IntentKind | null;
  onChange: (i: import('./inputs').IntentChoice) => void;
}) {
  const isPush = value?.kind === 'push_on_item';
  const pickedModuleRef = isPush ? value.moduleRef : null;
  const pickedSongId = isPush ? value.songId : null;

  const handleIntentPick = (kind: IntentKind) => {
    if (kind === 'push_on_item') {
      // Re-picking push keeps any existing module/song pick.
      if (isPush) return;
      onChange({ kind: 'push_on_item', moduleRef: null, songId: null });
      return;
    }
    onChange({ kind });
  };

  const handlePickModule = (key: string) => {
    // Switching modules clears any prior song pick — the song step
    // is per-deep-focus-pick, not persistent across module changes.
    onChange({ kind: 'push_on_item', moduleRef: key, songId: null });
  };

  const handlePickSong = (songId: string | null) => {
    if (!isPush || pickedModuleRef === null) return;
    onChange({ kind: 'push_on_item', moduleRef: pickedModuleRef, songId });
  };

  const songStepVisible =
    isPush
    && pickedModuleRef !== null
    && timeMinutes !== null
    && shouldOfferDeepFocusSong(timeMinutes);

  return (
    <section>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-wide text-neutral-500">
          Intent
        </div>
        {lastIntentKind && (
          <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
            Last time: <span className="text-neutral-500 dark:text-neutral-400">{INTENT_LABELS[lastIntentKind]}</span>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        {INTENT_ORDER.map(kind => (
          <IntentOptionCard
            key={kind}
            label={INTENT_LABELS[kind]}
            description={INTENT_DESCRIPTIONS[kind]}
            active={value?.kind === kind}
            onClick={() => handleIntentPick(kind)}
          />
        ))}
      </div>
      {isPush && (
        <div className="mt-2 space-y-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
              Pick a module to focus on
            </div>
            {moduleOptions.length === 0 ? (
              <p className="text-[11px] italic text-neutral-500">
                No modules available for this context — pick a different context or intent.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto pr-1 space-y-1">
                {moduleOptions.map(opt => (
                  <ModulePickerRow
                    key={opt.key}
                    option={opt}
                    active={opt.key === pickedModuleRef}
                    onClick={() => handlePickModule(opt.key)}
                  />
                ))}
              </div>
            )}
          </div>
          {songStepVisible && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                Add a song? <span className="text-neutral-400 normal-case">(optional)</span>
              </div>
              {songOptions.length === 0 ? (
                <p className="text-[11px] italic text-neutral-500">
                  No actively-learning songs yet — add one in Goals.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => handlePickSong(null)}
                    className={pill(pickedSongId === null)}
                  >
                    skip
                  </button>
                  {songOptions.map(s => (
                    <button
                      key={s.songId}
                      onClick={() => handlePickSong(s.songId)}
                      className={pill(s.songId === pickedSongId)}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Full-width intent option card — stacked × 3 to make the choice
 *  feel deliberate. Label + inline one-line description; active state
 *  swaps to a tinted accent fill with colored text. */
function IntentOptionCard({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label}. ${description}`}
      className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
        active
          ? 'border-fluent bg-fluent/10 text-fluent'
          : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:bg-fluent/5'
      }`}
    >
      <div className="text-sm font-medium leading-tight">{label}</div>
      <div className={`text-[11px] leading-snug mt-0.5 ${active ? 'text-fluent/80' : 'text-neutral-500 dark:text-neutral-400'}`}>
        {description}
      </div>
    </button>
  );
}

/** One row in the deep-focus module picker. Shows the module label
 *  + a urgency pill on the right. Tinted left border in the module
 *  accent color so the user can scan by module color even with the
 *  pills collapsed. */
function ModulePickerRow({
  option,
  active,
  onClick,
}: {
  option: DeepFocusModuleOption;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded border text-left ${
        active
          ? 'border-fluent bg-fluent/10 text-neutral-900 dark:text-neutral-100'
          : 'border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:bg-fluent/5'
      }`}
      style={{ borderLeftWidth: 3, borderLeftColor: option.accentHex }}
    >
      <span className="text-[12px] truncate min-w-0 flex-1">{option.label}</span>
      <UrgencyPill band={option.band} />
    </button>
  );
}

/** Compact band indicator: ●● red (behind), ●○ amber (at-risk),
 *  ○ neutral (on track / ahead), nothing when no signal. */
function UrgencyPill({ band }: { band: PaceBand | null }) {
  if (band === null) return null;
  const { label, className } = (() => {
    switch (band) {
      case 'significantly-behind':
        return { label: 'behind', className: 'bg-needswork/15 text-needswork border-needswork/40' };
      case 'behind':
        return { label: 'behind', className: 'bg-needswork/10 text-needswork border-needswork/30' };
      case 'at-risk':
        return { label: 'slip',   className: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300' };
      case 'ahead':
        return { label: 'ok',     className: 'bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700' };
      case 'well-ahead':
        return { label: 'ahead',  className: 'bg-neutral-100 text-neutral-400 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-500 dark:border-neutral-700' };
    }
  })();
  return (
    <span
      className={`shrink-0 text-[9px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded border ${className}`}
    >
      {label}
    </span>
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

