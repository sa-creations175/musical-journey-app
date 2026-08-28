/**
 * What opens when you press a square in the chord grid.
 *
 * =====================================================================
 * ONE PANEL, ONE CLOCK, AND FIVE STEPS RUNNING INSIDE IT.
 *
 *   choose    — Practice or Test. Nothing preselected. The clock
 *               starts either way, which is why the question is asked
 *               BEFORE the work rather than after it.
 *   session   — the clock, the drills so far, and what to do next.
 *   setup     — style, length, and the metronome.
 *   drilling  — a countdown inside the session clock.
 *   drillrate — how that one went. Optional in practice, required in
 *               a test.
 *
 * THE SESSION CLOCK NEVER PAUSES, including on the rating screen. See
 * `sessionClock` for why.
 *
 * =====================================================================
 * WHEN THE TWO MODES WRITE, AND WHY THEY DIFFER.
 *
 * PRACTICE writes per drill, as each one is rated or skipped. A
 * practice sitting has no verdict of its own to wait for — each drill
 * is its own rep, and the band is the lowest of the last three of
 * them, capped at Developing.
 *
 * A TEST writes all three at once, at Save. The claim a test makes is
 * about the three together — the lowest of them sets the band — and
 * three separate writes would let a half-finished test sit in the
 * history looking like evidence. Nothing is written until the third
 * rep is rated and Save is pressed.
 * =====================================================================
 *
 * Commit 2 of 4. Still absent: the other three surfaces, the practice
 * log, and any Settings UI.
 */
import { useEffect, useRef, useState } from 'react';
import Modal from '../../../components/Modal';
import DrillMetronomeSetup from '../DrillMetronomeSetup';
import { useMetronomeState } from '../../../lib/useMetronome';
import MetronomeControl from '../../../components/MetronomeControl';
import { metronome } from '../../../lib/metronome';
import { FEEL_CARD_OPTIONS, MIN_REP_SECONDS } from '../drillModel';
import { isAtTarget, rateFor, type DrillSurface } from './surfaces';
import { formatClock, useSessionClock } from './sessionClock';
import type { BandVerdict } from '../../../lib/spacing/banding';
import { TIER_LABEL } from '../../../lib/tier';
import { PRACTICE_ACTIVITY_OPTIONS, type PracticeActivity } from '../../../lib/practiceActivities';
import {
  DRILL_LENGTHS,
  countsTowardTest,
  isTooShort,
  styleLabel,
  newDraft,
  type CompletedDrill,
  type DrillDraft,
  type SessionMode,
} from './drillModel';

type Step = 'choose' | 'session' | 'setup' | 'drilling' | 'drillrate' | 'wrap' | 'done';

/** Reps a test is made of. */
const TEST_REPS = 3;

interface Props {
  /** Everything that differs by surface: the labels, the rate, and the
   *  writer. See `surfaces.ts` — if a surface needs something that is
   *  not on that interface, that is drift rather than a difference. */
  surface: DrillSurface;
  onClose: () => void;
}

export default function PracticeTestPanel({ surface, onClose }: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [mode, setMode] = useState<SessionMode | null>(null);
  const [drills, setDrills] = useState<CompletedDrill[]>([]);
  const [draft, setDraft] = useState<DrillDraft | null>(null);
  const [ranSeconds, setRanSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  /** What the item reads after the session was written, and how it was
   *  rated — the two things the done step reports. */
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** What the run in progress covered. Empty means the item the panel
   *  was opened on — see DrillRecord.scope. */
  const [scope, setScope] = useState<readonly string[]>([]);

  const sessionSeconds = useSessionClock(mode !== null);

  const close = () => {
    metronome.stop('drill');
    onClose();
  };

  /** Everything one finished drill needs, before it is known whether
   *  it will be written. */
  const completed = (feel: CompletedDrill['feel']): CompletedDrill => {
    const d = draft as DrillDraft;
    const bpm = metronome.state.bpm;
    return {
      id: `drill-${drills.length + 1}`,
      style: d.style,
      ranSeconds,
      bpm,
      per: d.per,
      rate: rateFor(surface, bpm, d.per),
      belowTarget: !isAtTarget(surface, bpm, d.per),
      feel,
      tooShort: isTooShort(ranSeconds, MIN_REP_SECONDS),
    };
  };

  /** Practice: one drill, written as it is rated. */
  const finishPracticeDrill = async (feel: CompletedDrill['feel']) => {
    if (saving) return;
    const d = completed(feel);
    setDrills(prev => [...prev, d]);
    setDraft(null);
    setStep('session');
    // TOO SHORT WRITES NOTHING. It is on the list saying so, which is
    // the honest version — the run is not hidden, it just did not
    // clear the floor.
    if (d.tooShort) return;
    setSaving(true);
    try {
      // THE STYLE IS RECORDED, NOT ACTED ON — it rides onto the
      // session row for the practice log and stops there. A skipped
      // rating still writes the row, because the time happened and
      // last-drilled should move; the writer records no engagement
      // without a feel, so an unrated drill leaves the band alone.
      await surface.write({
        ranSeconds: d.ranSeconds,
        // A COUNT-UP RUN HAS NO TARGET. Recording the draft's length
        // would be a number nobody set.
        targetSeconds: surface.countsUp ? 0 : (draft as DrillDraft).targetSeconds,
        // WHAT THE RUN COVERED. Empty means the item the panel was
        // opened on — the writer reads null as exactly that, so the
        // claim stays the smallest one the evidence supports.
        scope: scope.length > 0 ? scope : null,
        style: d.style,
        feel: d.feel,
        fromTest: false,
      });
      setScope([]);
    } finally {
      setSaving(false);
    }
  };

  /** Test: the three are collected, then written together at Save. */
  const finishTestDrill = (feel: CompletedDrill['feel']) => {
    setDrills(prev => [...prev, completed(feel)]);
    setDraft(null);
    setStep('session');
  };

  const saveTest = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const reps = drills.filter(countsTowardTest).slice(0, TEST_REPS);
      for (const d of reps) {
        await surface.write({
          ranSeconds: d.ranSeconds,
          targetSeconds: surface.countsUp ? 0 : d.ranSeconds,
          // A test is three runs of the thing being tested. Scoping one
          // of them to something else would make the three not be three
          // reps of one item.
          scope: null,
          // A test drill is always blocked, where there is a style at
          // all. The writer drops it on surfaces that have none.
          style: surface.hasStyle ? 'blocked' : null,
          feel: d.feel,
          fromTest: true,
        });
      }
      setOutcome({
        kind: 'test',
        feel: null,
        derived: false,
        verdict: await surface.readVerdict(),
      });
      setStep('done');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title={surface.cellLabel}
      description={surface.skillLabel}
      footer={<PanelFooter step={step} mode={mode} onClose={close} />}
    >
      {step === 'choose' && (
        <ModeChooser onPick={next => { setMode(next); setStep('session'); }} />
      )}

      {/* A METRONOME ON THE SESSION. Plenty of the work on a song
          happens between runs — reading the chart, finding a voicing,
          playing a passage over — and a click that only exists inside
          a timed drill is not available for any of it. */}
      {step === 'session' && mode !== null && surface.sessionMetronome && (
        <MetronomeControl />
      )}

      {step === 'session' && mode !== null && surface.openItem !== null && (
        <button
          type="button"
          onClick={surface.openItem}
          className="w-full px-3 py-2.5 rounded-lg bg-info text-white text-sm font-medium hover:opacity-90"
        >
          Open Lead Sheet
        </button>
      )}

      {step === 'session' && mode !== null && (
        <SessionStep
          mode={mode}
          seconds={sessionSeconds}
          drills={drills}
          saving={saving}
          surface={surface}
          onStartDrill={() => { setDraft(newDraft()); setStep('setup'); }}
          onSaveTest={() => void saveTest()}
          onEndSession={() => {
            // PRACTICE ENDS AT THE WRAP, not at the door. The session's
            // own rating had nowhere to land before this — End Session
            // called onClose and the sitting's verdict was dropped.
            if (mode === 'practice') setStep('wrap');
            else close();
          }}
        />
      )}

      {step === 'setup' && draft !== null && mode !== null && (
        <SetupStep
          mode={mode}
          seconds={sessionSeconds}
          draft={draft}
          surface={surface}
          onChange={setDraft}
          onStart={() => { setRanSeconds(0); setStep('drilling'); }}
          onCancel={() => { setDraft(null); setStep('session'); }}
        />
      )}

      {step === 'drilling' && draft !== null && mode !== null && (
        <DrillingStep
          mode={mode}
          seconds={sessionSeconds}
          draft={draft}
          index={drills.length + 1}
          surface={surface}
          onFinish={ran => { setRanSeconds(ran); setStep('drillrate'); }}
        />
      )}

      {step === 'done' && outcome !== null && (
        <DoneStep outcome={outcome} onClose={close} />
      )}

      {step === 'wrap' && mode !== null && (
        <WrapStep
          seconds={sessionSeconds}
          mode={mode}
          drills={drills}
          surface={surface}
          saving={saving}
          onLog={async (feel) => {
            if (saving) return;
            setSaving(true);
            try {
              if (feel !== null) {
                // A REP LIKE ANY OTHER. The band rule is unchanged:
                // practice caps at Developing, and only a test at
                // tempo goes past it.
                await surface.writeSessionRating(feel, false);
              }
              setOutcome({
                kind: 'practice',
                feel,
                derived: derivedFeelOf(drills) !== null,
                verdict: await surface.readVerdict(),
              });
              setStep('done');
            } finally {
              setSaving(false);
            }
          }}
        />
      )}

      {step === 'drillrate' && draft !== null && mode !== null && (
        <DrillRateStep
          surface={surface}
          openedOn={surface.scopeOptions?.find(o => o.id === surface.openedOnScopeId)?.label ?? null}
          scope={scope}
          onScope={setScope}
          mode={mode}
          seconds={sessionSeconds}
          ranSeconds={ranSeconds}
          index={drills.length + 1}
          onRate={feel => {
            if (mode === 'test') finishTestDrill(feel);
            else void finishPracticeDrill(feel);
          }}
          onSkip={() => void finishPracticeDrill(null)}
        />
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------

function PanelFooter({ step, mode, onClose }: {
  step: Step; mode: SessionMode | null; onClose: () => void;
}) {
  const names = mode === 'test'
    ? ['Skill', 'Mode', 'Test Drills', 'Save', 'Done']
    : ['Skill', 'Mode', 'Practice', 'Wrap Up', 'Done'];
  const position = step === 'choose' ? 1 : 2;
  return (
    <div className="flex items-center justify-between gap-3 w-full">
      <button
        type="button"
        onClick={onClose}
        className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
      >
        Close
      </button>
      <div className="flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
        {names.map((name, i) => (
          <span key={name} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="opacity-50">›</span>}
            <span className={i <= position ? 'text-fluent' : undefined}>{name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A label, and the hint the prototype puts beside it.
 *
 * THE HINTS ARE THE PROTOTYPE'S, not invented here. Every label in it
 * carries one except `Pick A Skill`, whose hint was deleted for being
 * a fragment. The rule is: build the ones the artefact carries, invent
 * none.
 */
function SectionLabel({ children, hint }: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-neutral-400 mb-2 flex items-baseline justify-between gap-3">
      <span>{children}</span>
      {hint && (
        <span className="normal-case tracking-normal font-medium text-neutral-500 text-[0.78rem]">
          {hint}
        </span>
      )}
    </p>
  );
}

function SessionClockFace({ seconds, mode }: { seconds: number; mode: SessionMode }) {
  return (
    <div className="rounded-lg border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900/40 p-4 text-center">
      <div className="font-mono tabular-nums text-3xl sm:text-4xl">{formatClock(seconds)}</div>
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-neutral-400 mt-1">
        {mode === 'test' ? 'This Test Session' : 'This Practice Session'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

function ModeChooser({ onPick }: { onPick: (mode: SessionMode) => void }) {
  return (
    <div className="space-y-3">
      <SectionLabel hint="The clock starts either way">What Are You About To Do</SectionLabel>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => onPick('practice')}
          className="text-left rounded-lg border border-neutral-200 dark:border-neutral-700 px-3.5 py-3 hover:border-fluent transition"
        >
          <div className="text-[0.96rem] font-semibold">Practice</div>
          <div className="text-xs text-neutral-500 leading-snug mt-0.5">
            Working it in. Start as many drills as you like inside it, at any
            tempo. Rating a drill is optional. Takes you as far as{' '}
            <b className="text-neutral-700 dark:text-neutral-200">Developing</b>.
          </div>
        </button>
        <button
          type="button"
          onClick={() => onPick('test')}
          className="text-left rounded-lg border border-neutral-200 dark:border-neutral-700 px-3.5 py-3 hover:border-fluent transition"
        >
          <div className="text-[0.96rem] font-semibold">Test</div>
          <div className="text-xs text-neutral-500 leading-snug mt-0.5">
            Three drills, each at or above your target rate, each one rated. The
            lowest of the three sets the rating. The only way to{' '}
            <b className="text-neutral-700 dark:text-neutral-200">Fluent</b> or{' '}
            <b className="text-neutral-700 dark:text-neutral-200">Mastered</b>.
          </div>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

function SessionStep({
  mode, seconds, drills, saving, surface, onStartDrill, onSaveTest, onEndSession,
}: {
  mode: SessionMode;
  seconds: number;
  drills: ReadonlyArray<CompletedDrill>;
  saving: boolean;
  surface: DrillSurface;
  onStartDrill: () => void;
  onSaveTest: () => void;
  onEndSession: () => void;
}) {
  const counting = drills.filter(countsTowardTest);
  const testComplete = mode === 'test' && counting.length >= TEST_REPS;
  const lowest = counting.slice(0, TEST_REPS)
    .reduce((low, d) => Math.min(low, d.feel ?? 4), 4);

  return (
    <div className="space-y-4">
      <SessionClockFace seconds={seconds} mode={mode} />

      <div>
        <SectionLabel
          hint={mode === 'test'
            ? 'All three at target, all three rated'
            : 'Optional — the session counts either way'}
        >
          {mode === 'test' ? 'The Three Test Drills' : 'Drills In This Session'}
        </SectionLabel>
        <DrillList mode={mode} drills={drills} surface={surface} />
      </div>

      {testComplete && (
        <div className="rounded-md border-l-[3px] border-fluent bg-fluent/5 px-3 py-2.5 text-xs text-neutral-700 dark:text-neutral-200">
          <b>Three drills at target, all rated.</b> The lowest of them was{' '}
          {FEEL_CARD_OPTIONS.find(o => o.value === lowest)?.label}, and that is
          what this will read.
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {!testComplete && (
          <button
            type="button"
            onClick={onStartDrill}
            className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            {mode === 'test'
              ? `Start Test ${counting.length + 1}`
              : 'Start A Practice Drill'}
          </button>
        )}
        {testComplete && (
          <button
            type="button"
            onClick={onSaveTest}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90 disabled:opacity-45"
          >
            {saving ? 'Saving…' : 'Save The Test'}
          </button>
        )}
        <button
          type="button"
          onClick={onEndSession}
          className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm"
        >
          End Session
        </button>
      </div>
    </div>
  );
}

function DrillList({ mode, drills, surface }: {
  mode: SessionMode;
  drills: ReadonlyArray<CompletedDrill>;
  surface: DrillSurface;
}) {
  if (drills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 px-3 py-3 text-center text-xs text-neutral-500">
        {mode === 'test'
          ? 'No test drills yet.'
          : 'No drills yet — the clock is still counting.'}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {drills.map((d, i) => {
        const feelLabel = d.feel === null
          ? null
          : FEEL_CARD_OPTIONS.find(o => o.value === d.feel)?.label;
        return (
          <div key={d.id} className="space-y-1">
            <div className="flex items-center gap-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-2 text-xs">
              <span className="font-mono text-[0.7rem] font-bold text-neutral-400">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <b className="font-semibold">
                  {mode === 'test' ? 'Test' : 'Drill'} {i + 1}{d.style ? ` · ${styleLabel(d.style)}` : ''}
                </b>
                <span className="block font-mono text-[0.66rem] text-neutral-400">
                  {d.ranSeconds}s · {d.rate} {surface.rateLabel}
                </span>
              </span>
              <span className={`text-[11px] ${feelLabel ? 'font-semibold' : 'text-neutral-400 uppercase tracking-wide'}`}>
                {feelLabel ?? 'Not Rated'}
              </span>
              {d.belowTarget && (
                <span className="text-[11px] font-bold text-developing">BELOW</span>
              )}
            </div>
            {d.tooShort && (
              <p className="text-[11px] text-developing m-0 pl-7">
                Under {MIN_REP_SECONDS} seconds, so this run was too short to
                count and nothing was saved for it.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------

function SetupStep({
  mode, seconds, draft, surface, onChange, onStart, onCancel,
}: {
  mode: SessionMode;
  seconds: number;
  draft: DrillDraft;
  surface: DrillSurface;
  onChange: (next: DrillDraft) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const metro = useMetronomeState();
  const rate = rateFor(surface, metro.bpm, draft.per);
  const atTarget = isAtTarget(surface, metro.bpm, draft.per);
  const isTest = mode === 'test';

  // A test drill is always blocked and in time. Set once on entering
  // the step rather than asked — see the panel below, which states it.
  useEffect(() => {
    if (isTest && draft.style !== 'blocked') onChange({ ...draft, style: 'blocked' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTest]);

  return (
    <div className="space-y-4">
      <SessionClockFace seconds={seconds} mode={mode} />

      {/* A TEST STATES ITS MANNER; PRACTICE PICKS ONE. Offering a
          disabled Broken chip in a test was a control that existed
          only to refuse — the sentence says the same thing and is
          not a dead button. */}
      {isTest ? (
        <div>
          <SectionLabel hint="A test drill is always blocked">Style</SectionLabel>
          <p className="text-sm text-neutral-700 dark:text-neutral-200 m-0">
            Blocked, at tempo.
          </p>
        </div>
      ) : (
        <div>
          <SectionLabel hint="Pick per drill, not per session">Style</SectionLabel>
          <div className="flex gap-1.5 flex-wrap">
            {(['broken', 'blocked'] as const).map(st => (
              <button
                key={st}
                type="button"
                onClick={() => onChange({ ...draft, style: st })}
                aria-pressed={draft.style === st}
                className={`px-3 py-1 rounded-md border text-sm ${
                  draft.style === st
                    ? 'bg-fluent text-white border-fluent font-semibold'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent'
                }`}
              >
                {styleLabel(st)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionLabel hint={`${draft.targetSeconds}s`}>How Long</SectionLabel>
        <div className="flex gap-1.5 flex-wrap">
          {DRILL_LENGTHS.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ ...draft, targetSeconds: v })}
              aria-pressed={draft.targetSeconds === v}
              className={`px-3 py-1 rounded-md border text-sm ${
                draft.targetSeconds === v
                  ? 'bg-fluent text-white border-fluent font-semibold'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent'
              }`}
            >
              {v}s
            </button>
          ))}
        </div>
      </div>

      <DrillMetronomeSetup />

      <div>
        <SectionLabel>Rate</SectionLabel>
        <div className="flex gap-1.5 flex-wrap">
          {surface.rateOptions.map(o => (
            <button
              key={o.per}
              type="button"
              onClick={() => onChange({ ...draft, per: o.per })}
              aria-pressed={draft.per === o.per}
              className={`px-3 py-1 rounded-md border text-sm ${
                draft.per === o.per
                  ? 'bg-fluent text-white border-fluent font-semibold'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 mt-2">
          <span className="font-mono text-[0.72rem] text-neutral-500">
            {rate} {surface.rateLabel}
          </span>
          <span className={`text-[0.69rem] font-bold ${atTarget ? 'text-fluent' : 'text-developing'}`}>
            {atTarget
              ? `AT TARGET (${surface.targetRate})`
              : `BELOW TARGET (${surface.targetRate})`}
          </span>
        </div>
      </div>

      {isTest && !atTarget && (
        <div className="rounded-md border-l-[3px] border-developing bg-developing/5 px-3 py-2.5 text-xs text-neutral-700 dark:text-neutral-200">
          <b>Below target.</b> This run will be logged, but it won't count
          toward the three. Raise the tempo, or change how many beats each
          shape gets.
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={draft.style === null}
          className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90 disabled:opacity-45 disabled:cursor-not-allowed"
        >
          Start Drill
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

function DrillingStep({
  mode, seconds, draft, index, surface, onFinish,
}: {
  mode: SessionMode;
  seconds: number;
  draft: DrillDraft;
  index: number;
  surface: DrillSurface;
  onFinish: (ranSeconds: number) => void;
}) {
  const metro = useMetronomeState();
  // A COUNT-UP SURFACE HAS NOTHING TO COUNT DOWN TO. The countdown is
  // still mounted so the hook order does not change between surfaces,
  // but it is handed 0 — which never fires — and the elapsed clock is
  // what is shown and what is recorded.
  const remaining = useDrillCountdown(
    surface.countsUp ? 0 : draft.targetSeconds,
    () => { if (!surface.countsUp) onFinish(draft.targetSeconds); },
  );
  const elapsed = useElapsed(surface.countsUp);
  const rate = rateFor(surface, metro.bpm, draft.per);
  const atTarget = isAtTarget(surface, metro.bpm, draft.per);

  return (
    <div className="space-y-4">
      <SessionClockFace seconds={seconds} mode={mode} />

      <div className="rounded-lg border border-fluent p-4 text-center">
        <div className="font-mono tabular-nums text-4xl sm:text-5xl text-fluent">
          {formatClock(surface.countsUp ? elapsed : remaining)}
        </div>
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-neutral-400 mt-1">
          {mode === 'test' ? 'Test' : 'Drill'} {index}
          {draft.style ? ` · ${styleLabel(draft.style)}` : ''}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[0.72rem] text-neutral-500">
          {metro.bpm} BPM · {rate} {surface.rateLabel}
        </span>
        <span className={`text-[0.69rem] font-bold ${atTarget ? 'text-fluent' : 'text-developing'}`}>
          {atTarget ? 'AT TARGET' : 'BELOW TARGET'}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onFinish(surface.countsUp ? elapsed : draft.targetSeconds - remaining)}
        className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
      >
        {surface.countsUp ? 'Done — Rate It' : 'Finish Now'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------

function DrillRateStep({
  mode, seconds, ranSeconds, index, surface, openedOn, scope, onScope, onRate, onSkip,
}: {
  mode: SessionMode;
  seconds: number;
  ranSeconds: number;
  index: number;
  surface: DrillSurface;
  /** The section the panel was opened on, for the hint. */
  openedOn: string | null;
  scope: readonly string[];
  onScope: (next: readonly string[]) => void;
  onRate: (feel: 1 | 2 | 3 | 4) => void;
  onSkip: () => void;
}) {
  const tooShort = isTooShort(ranSeconds, MIN_REP_SECONDS);
  const options = surface.scopeOptions;
  const wholeSong = options !== null && scope.length === options.length;
  return (
    <div className="space-y-4">
      <SessionClockFace seconds={seconds} mode={mode} />

      {tooShort && (
        <div className="rounded-md border-l-[3px] border-developing bg-developing/5 px-3 py-2.5 text-xs text-neutral-700 dark:text-neutral-200">
          <b>That run was {ranSeconds}s.</b> A run has to reach{' '}
          {MIN_REP_SECONDS} seconds to have been real, so this one goes on the
          list and nothing is saved for it.
        </div>
      )}

      {options !== null && (
        <div>
          <SectionLabel hint={openedOn !== null ? `You opened on ${openedOn}` : undefined}>
            What Was That Run
          </SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {options.map(opt => {
              const on = scope.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onScope(
                    on ? scope.filter(id => id !== opt.id) : [...scope, opt.id],
                  )}
                  className={`px-2.5 py-1 rounded-md border text-xs ${
                    on
                      ? 'bg-fluent text-white border-fluent font-medium'
                      : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onScope(wholeSong ? [] : options.map(o => o.id))}
              className={`px-2.5 py-1 rounded-md border text-xs ${
                wholeSong
                  ? 'bg-fluent text-white border-fluent font-medium'
                  : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              The Whole Song
            </button>
          </div>
          {wholeSong && (
            <div className="mt-2 rounded-md border-l-[3px] border-fluent bg-fluent/5 px-3 py-2.5 text-xs text-neutral-700 dark:text-neutral-200">
              <b>This counts for every section.</b> You played them all, so how
              it went is evidence about all of them — not just{' '}
              {openedOn ?? 'the one you opened'}.
            </div>
          )}
        </div>
      )}

      <div>
        <SectionLabel hint={mode === 'test' ? 'Required' : 'Optional'}>How Did That Go</SectionLabel>
        {/* BEST FIRST. The four words and their order are the same on
            every surface; only the direction differs from the block
            wrap-up, which reads worst-first. */}
        <div className="grid grid-cols-1 gap-2">
          {[...FEEL_CARD_OPTIONS].reverse().map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onRate(opt.value)}
              className={`w-full px-3 py-2 rounded-md border text-sm text-left transition-colors ${opt.inactiveClass}`}
            >
              <span className="font-medium">{opt.label}</span>
              <span className="ml-2 opacity-70 text-xs">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* NO SKIP IN A TEST. Every one of the three is rated — that is
          what makes the lowest of them mean anything. */}
      {mode === 'practice' && (
        <button
          type="button"
          onClick={onSkip}
          className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm"
        >
          Skip The Rating
        </button>
      )}

      <p className="sr-only">Drill {index}</p>
    </div>
  );
}

/**
 * The drill's own countdown.
 *
 * Separate from the session clock and stopped by reaching zero, which
 * is the one difference between them that matters. Counted off a
 * timestamp for the same reason the session clock is — a throttled
 * background tab must not be able to lengthen a drill.
 */
/** Seconds since this run started. The mirror of the countdown, for a
 *  surface where the run has no set length. */
function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffectOnInterval(() => { if (active) setSeconds(s => s + 1); });
  return seconds;
}

function useDrillCountdown(targetSeconds: number, onZero: () => void): number {
  const [remaining, setRemaining] = useState(targetSeconds);
  const startedAt = useState(() => Date.now())[0];
  const fired = useState(() => ({ done: false }))[0];

  useEffectOnInterval(() => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const left = Math.max(0, targetSeconds - elapsed);
    setRemaining(left);
    if (left === 0 && !fired.done) {
      fired.done = true;
      onZero();
    }
  });

  return remaining;
}

/** A 250 ms interval that cleans itself up. The callback changes
 *  identity every render, so it is held in a ref rather than made a
 *  dependency, which would restart the timer on every tick. */
function useEffectOnInterval(fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = window.setInterval(() => ref.current(), 250);
    return () => window.clearInterval(id);
  }, []);
}

// ---------------------------------------------------------------------

/**
 * The end of a practice sitting.
 *
 * =====================================================================
 * THIS WAS MISSING. Practice shipped with `End Session` calling
 * `onClose`, so the sitting's own rating had nowhere to land: the
 * drills wrote their reps and the session itself wrote nothing. Every
 * word here is the prototype's; the step is not.
 *
 * THE READING IS AVERAGED, AND A TEST IS NOT. A test takes the lowest
 * of three, because the one that went wrong is the evidence that has
 * not gone away. A practice sitting takes the average of what you did,
 * because nothing is being claimed — which is also why the reading can
 * be disagreed with and a test's cannot.
 *
 * THE CLOCK KEEPS RUNNING. It never pauses, and that includes here.
 * `useSessionClock` is driven by `mode !== null`, which is still true,
 * so this needs no code to be right — but it needs saying, because the
 * prototype stopped the clock at this step and that was a bug in the
 * prototype rather than a decision.
 * =====================================================================
 */
function WrapStep({
  seconds, mode, drills, surface, saving, onLog,
}: {
  seconds: number;
  mode: SessionMode;
  drills: CompletedDrill[];
  surface: DrillSurface;
  saving: boolean;
  onLog: (feel: 1 | 2 | 3 | 4 | null, extras: WrapExtras) => void;
}) {
  const rated = drills.filter(d => d.feel !== null);
  const derived = rated.length > 0
    ? (Math.round(
        rated.reduce((sum, d) => sum + (d.feel as number), 0) / rated.length,
      ) as 1 | 2 | 3 | 4)
    : null;

  const [picked, setPicked] = useState<1 | 2 | 3 | 4 | null>(derived);
  const [showOverride, setShowOverride] = useState(false);
  const overrode = derived !== null && picked !== derived;

  // WHAT HAPPENED, not how it went. These land on the practice log
  // beside the duration and never feed a status — evidence sets
  // status, and a ticked box is not evidence.
  const [activities, setActivities] = useState<PracticeActivity[]>([]);
  const [touched, setTouched] = useState<readonly string[]>(
    surface.openedOnScopeId !== null ? [surface.openedOnScopeId] : [],
  );
  const [note, setNote] = useState('');
  const openedOnLabel = surface.wrapSections
    ?.find(sec => sec.id === surface.openedOnScopeId)?.label ?? null;

  const wordFor = (feel: 1 | 2 | 3 | 4) =>
    FEEL_CARD_OPTIONS.find(o => o.value === feel)?.label ?? '';

  return (
    <div className="space-y-4">
      <SessionClockFace seconds={seconds} mode={mode} />

      <div className="rounded-md border-l-[3px] border-developing bg-developing/5 px-3 py-2.5 text-xs text-neutral-700 dark:text-neutral-200">
        <b>Practice stops at Developing.</b> However this session is rated, it
        cannot claim <b>Fluent</b>. A test at target can.
      </div>

      {drills.length > 0 && (
        <div>
          <SectionLabel>This Session</SectionLabel>
          <DrillList mode={mode} drills={drills} surface={surface} />
        </div>
      )}

      {derived !== null ? (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
              This Session Reads
            </span>
            <span className="text-sm font-medium">
              {picked !== null ? wordFor(picked) : ''}
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 leading-snug">
            {overrode
              ? <>You changed this from {wordFor(derived)}, which is what the drills averaged to.</>
              : <>Averaged from your {rated.length} rated drill{rated.length > 1 ? 's' : ''}. A test takes the lowest of three; a practice session takes the average of what you did.</>}
          </p>

          {!showOverride ? (
            <button
              type="button"
              onClick={() => {
                if (overrode) setPicked(derived);
                else setShowOverride(true);
              }}
              className="text-[11px] font-medium text-neutral-500 hover:text-fluent"
            >
              {overrode ? 'Change It Back' : 'Disagree?'}
            </button>
          ) : (
            <div className="space-y-2">
              <SectionLabel>Set It Yourself</SectionLabel>
              <div className="grid grid-cols-1 gap-2">
                {[...FEEL_CARD_OPTIONS].reverse().map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setPicked(opt.value); setShowOverride(false); }}
                    className={`w-full px-3 py-2 rounded-md border text-sm text-left transition-colors ${opt.inactiveClass}`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="ml-2 opacity-70 text-xs">
                      {opt.hint}
                      {opt.value === derived ? ' · what your drills averaged to' : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <SectionLabel
            hint={drills.length > 0 ? 'None of your drills were rated' : 'No drills this session'}
          >
            How Did It Go
          </SectionLabel>
          <div className="grid grid-cols-1 gap-2">
            {[...FEEL_CARD_OPTIONS].reverse().map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPicked(picked === opt.value ? null : opt.value)}
                className={`w-full px-3 py-2 rounded-md border text-sm text-left transition-colors ${
                  picked === opt.value ? opt.activeClass : opt.inactiveClass
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="ml-2 opacity-70 text-xs">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {surface.wrapAsksActivities && (
        <div>
          <SectionLabel hint="Pick any that apply">What Did You Work On</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {PRACTICE_ACTIVITY_OPTIONS.map(opt => {
              const on = activities.includes(opt.activity);
              return (
                <button
                  key={opt.activity}
                  type="button"
                  onClick={() => setActivities(prev => on
                    ? prev.filter(a => a !== opt.activity)
                    : [...prev, opt.activity])}
                  className={`px-2.5 py-1 rounded-md border text-xs ${
                    on
                      ? 'bg-fluent text-white border-fluent font-medium'
                      : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {surface.wrapSections !== null && (
        <div>
          <SectionLabel
            hint={openedOnLabel !== null ? `You started on ${openedOnLabel}` : undefined}
          >
            Sections You Touched
          </SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {surface.wrapSections.map(sec => {
              const on = touched.includes(sec.id);
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setTouched(prev => on
                    ? prev.filter(id => id !== sec.id)
                    : [...prev, sec.id])}
                  className={`px-2.5 py-1 rounded-md border text-xs ${
                    on
                      ? 'bg-fluent text-white border-fluent font-medium'
                      : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {sec.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <SectionLabel hint="Optional">A Note, If You Want One</SectionLabel>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="what worked, what didn't, voicings to revisit"
          className="w-full min-h-[3.4rem] rounded-md border border-neutral-300 dark:border-neutral-600 bg-transparent px-2.5 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => onLog(picked, { activities, touched, note })}
          className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Log The Session'}
        </button>
        {/* ONLY WHERE THERE IS NOTHING TO SKIP. With a reading on
            screen the button would offer to discard a number the user
            can already change. */}
        {picked === null && derived === null && (
          <button
            type="button"
            onClick={() => onLog(null, { activities, touched, note })}
            className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            Skip The Rating
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

/**
 * What the sitting CONSISTED OF, as opposed to how it went.
 *
 * These go to the practice log, never to a status. The distinction is
 * a written rule: the log records what happened in a sitting; the
 * rating records how it went. Evidence sets status — a note and a
 * ticked activity box do not.
 */
interface WrapExtras {
  activities: PracticeActivity[];
  touched: readonly string[];
  note: string;
}

/** What the session did, as the done step reports it. */
interface Outcome {
  kind: SessionMode;
  /** The session's own rating, where practice gave one. */
  feel: 1 | 2 | 3 | 4 | null;
  /** Whether that rating came from averaging the drills. */
  derived: boolean;
  /** What the item reads now, from the shared reader. */
  verdict: BandVerdict;
}

/** The average of the rated drills, or null when none were rated.
 *  Shared by the wrap and the done step so "averaged" cannot mean two
 *  different things a screen apart. */
function derivedFeelOf(
  drills: ReadonlyArray<CompletedDrill>,
): 1 | 2 | 3 | 4 | null {
  const rated = drills.filter(d => d.feel !== null);
  if (rated.length === 0) return null;
  return Math.round(
    rated.reduce((sum, d) => sum + (d.feel as number), 0) / rated.length,
  ) as 1 | 2 | 3 | 4;
}

/** The band's own word, from the app's one vocabulary. */
function verdictWord(v: BandVerdict): string {
  switch (v.kind) {
    case 'not-started': return TIER_LABEL.untouched;
    case 'started': return TIER_LABEL.started;
    case 'band':
      switch (v.band) {
        case 'needs-work': return TIER_LABEL.needsWork;
        case 'developing': return TIER_LABEL.developing;
        case 'fluent': return TIER_LABEL.fluent;
        case 'mastered': return TIER_LABEL.mastered;
      }
  }
}

/**
 * What the session did.
 *
 * =====================================================================
 * THE SESSION IS THE UNIT, so the session is what reports back. Before
 * this the panel simply closed and you found out by navigating back
 * and looking — which asks you to rate something and then declines to
 * say what the rating did.
 *
 * "NOW READS" IS THE ITEM, NOT THE RATING, and it comes from
 * `surface.readVerdict()` rather than being computed here. A second
 * opinion about a number the shared reader owns would drift the first
 * time the band rule moved, which it has twice in a day.
 *
 * The clock is gone from this step on purpose: the sitting is over,
 * and a running clock would say otherwise.
 * =====================================================================
 */
function DoneStep({ outcome, onClose }: {
  outcome: Outcome;
  onClose: () => void;
}) {
  const word = verdictWord(outcome.verdict);
  const banded = outcome.verdict.kind === 'band' ? outcome.verdict.band : null;
  const feelWord = outcome.feel === null
    ? null
    : FEEL_CARD_OPTIONS.find(o => o.value === outcome.feel)?.label ?? null;
  // Practice rated Clean or better, and the ceiling took it to
  // Developing anyway. The prototype's `capped`.
  const capped = outcome.kind === 'practice'
    && outcome.feel !== null && outcome.feel >= 3
    && banded === 'developing';

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
            Now Reads
          </span>
          <span className="text-sm font-medium">{word}</span>
        </div>
      </div>

      <div className="rounded-md border-l-[3px] border-fluent bg-fluent/5 px-3 py-2.5 text-xs text-neutral-700 dark:text-neutral-200">
        {outcome.kind === 'test' ? (
          banded === 'fluent' || banded === 'mastered'
            ? <><b>Three at target, all clean.</b> That&rsquo;s the claim made and recorded.</>
            : <>
                Three drills at target, each rated. The lowest set it.
                {banded === 'developing'
                  ? ' That brings this back in about a week rather than a month — which is what you want after a run went wrong.'
                  : ''}
              </>
        ) : capped ? (
          <>
            <b>Practice stops at Developing.</b> That session came out at Clean
            or better, but practice cannot claim <b>Fluent</b>. Go to Test mode
            and nail it at target, and it can.
          </>
        ) : feelWord !== null ? (
          <>
            Logged as <b>{feelWord}</b>
            {outcome.derived ? ', averaged from the drills inside it.' : '.'}
            {' '}Practice moves you as far as <b>Developing</b>.
          </>
        ) : (
          <>
            Logged with no ratings. <b>Started</b> means you met it and the
            clock proves it — there is just no verdict yet.
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm"
      >
        Close
      </button>
    </div>
  );
}
