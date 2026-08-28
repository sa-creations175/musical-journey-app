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
 *   setup     — manner, length, and the metronome.
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
import { metronome } from '../../../lib/metronome';
import type { DrillHand, DrillSkill, DrillType } from '../../../lib/db';
import { FEEL_CARD_OPTIONS, logSession, MIN_REP_SECONDS } from '../drillModel';
import { formatClock, useSessionClock } from './sessionClock';
import {
  CHORD_RATE_LABEL,
  CHORD_RATE_OPTIONS,
  CHORD_TARGET_RATE,
  DRILL_LENGTHS,
  countsTowardTest,
  isAtTarget,
  isTooShort,
  mannerLabel,
  newDraft,
  rateFor,
  type CompletedDrill,
  type DrillDraft,
  type Manner,
  type SessionMode,
} from './drillModel';

type Step = 'choose' | 'session' | 'setup' | 'drilling' | 'drillrate';

/** Reps a test is made of. */
const TEST_REPS = 3;

interface Props {
  /** The cell, for the header — e.g. "Cmaj7 (major seventh)". */
  cellLabel: string;
  /** The square within it — e.g. "Root position · Left". */
  skillLabel: string;
  /** The skill row the square stands for. Every write is against it. */
  skill: DrillSkill;
  /** The drill type a session row hangs off. Chord-shape sessions carry
   *  a real skill and type so time can be attributed by the join in
   *  `shapesTimeInvested`. */
  drillType: DrillType;
  hand: DrillHand;
  onClose: () => void;
}

export default function PracticeTestPanel({
  cellLabel, skillLabel, skill, drillType, hand, onClose,
}: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [mode, setMode] = useState<SessionMode | null>(null);
  const [drills, setDrills] = useState<CompletedDrill[]>([]);
  const [draft, setDraft] = useState<DrillDraft | null>(null);
  const [ranSeconds, setRanSeconds] = useState(0);
  const [saving, setSaving] = useState(false);

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
      manner: d.manner as Manner,
      ranSeconds,
      bpm,
      beatsPerShape: d.beatsPerShape,
      rate: rateFor(bpm, d.beatsPerShape),
      belowTarget: !isAtTarget(bpm, d.beatsPerShape),
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
      await logSession({
        skill,
        drillType,
        hand,
        // Broken and blocked are the app's existing arpeggiated /
        // solid. Whether they SHOULD be separate spacing rows is an
        // open structural question; this follows what the rest of the
        // app already means by those rows rather than inventing a
        // third answer while the question is open.
        style: d.manner === 'broken' ? 'arpeggiated' : 'solid',
        durationSeconds: d.ranSeconds,
        targetSeconds: (draft as DrillDraft).targetSeconds,
        // A skipped rating still writes the SESSION — the time
        // happened and the square's last-drilled should move — but
        // `logSession` only records an engagement when there is a feel
        // to record, so an unrated drill leaves the band alone.
        ...(d.feel !== null ? { feelRating: d.feel, fromTest: false } : {}),
      });
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
        await logSession({
          skill,
          drillType,
          hand,
          // A test drill is always blocked.
          style: 'solid',
          durationSeconds: d.ranSeconds,
          targetSeconds: d.ranSeconds,
          feelRating: d.feel as 1 | 2 | 3 | 4,
          fromTest: true,
        });
      }
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title={cellLabel}
      description={skillLabel}
      footer={<PanelFooter step={step} mode={mode} onClose={close} />}
    >
      {step === 'choose' && (
        <ModeChooser onPick={next => { setMode(next); setStep('session'); }} />
      )}

      {step === 'session' && mode !== null && (
        <SessionStep
          mode={mode}
          seconds={sessionSeconds}
          drills={drills}
          saving={saving}
          onStartDrill={() => { setDraft(newDraft()); setStep('setup'); }}
          onSaveTest={() => void saveTest()}
          onEndSession={close}
        />
      )}

      {step === 'setup' && draft !== null && mode !== null && (
        <SetupStep
          mode={mode}
          seconds={sessionSeconds}
          draft={draft}
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
          onFinish={ran => { setRanSeconds(ran); setStep('drillrate'); }}
        />
      )}

      {step === 'drillrate' && draft !== null && mode !== null && (
        <DrillRateStep
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-neutral-400 mb-2">
      {children}
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
      <SectionLabel>What Are You About To Do</SectionLabel>
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
  mode, seconds, drills, saving, onStartDrill, onSaveTest, onEndSession,
}: {
  mode: SessionMode;
  seconds: number;
  drills: ReadonlyArray<CompletedDrill>;
  saving: boolean;
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
        <SectionLabel>
          {mode === 'test' ? 'The Three Test Drills' : 'Drills In This Session'}
        </SectionLabel>
        <DrillList mode={mode} drills={drills} />
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

function DrillList({ mode, drills }: {
  mode: SessionMode; drills: ReadonlyArray<CompletedDrill>;
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
                  {mode === 'test' ? 'Test' : 'Drill'} {i + 1} · {mannerLabel(d.manner)}
                </b>
                <span className="block font-mono text-[0.66rem] text-neutral-400">
                  {d.ranSeconds}s · {d.rate} {CHORD_RATE_LABEL}
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
  mode, seconds, draft, onChange, onStart, onCancel,
}: {
  mode: SessionMode;
  seconds: number;
  draft: DrillDraft;
  onChange: (next: DrillDraft) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const metro = useMetronomeState();
  const rate = rateFor(metro.bpm, draft.beatsPerShape);
  const atTarget = isAtTarget(metro.bpm, draft.beatsPerShape);
  const isTest = mode === 'test';

  // A test drill is always blocked, so the choice is made rather than
  // offered. Done in an effect rather than by reading `mode` at save
  // time so the screen shows what will be recorded.
  useEffect(() => {
    if (isTest && draft.manner !== 'blocked') onChange({ ...draft, manner: 'blocked' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTest]);

  return (
    <div className="space-y-4">
      <SessionClockFace seconds={seconds} mode={mode} />

      <div>
        <SectionLabel>Manner</SectionLabel>
        <div className="flex gap-1.5 flex-wrap">
          {(['broken', 'blocked'] as const).map(m => {
            const disabled = isTest && m === 'broken';
            return (
              <button
                key={m}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...draft, manner: m })}
                aria-pressed={draft.manner === m}
                className={`px-3 py-1 rounded-md border text-sm disabled:opacity-40 disabled:cursor-not-allowed ${
                  draft.manner === m
                    ? 'bg-fluent text-white border-fluent font-semibold'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent'
                }`}
              >
                {mannerLabel(m)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <SectionLabel>How Long</SectionLabel>
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
          {CHORD_RATE_OPTIONS.map(o => (
            <button
              key={o.beatsPerShape}
              type="button"
              onClick={() => onChange({ ...draft, beatsPerShape: o.beatsPerShape })}
              aria-pressed={draft.beatsPerShape === o.beatsPerShape}
              className={`px-3 py-1 rounded-md border text-sm ${
                draft.beatsPerShape === o.beatsPerShape
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
            {rate} {CHORD_RATE_LABEL}
          </span>
          <span className={`text-[0.69rem] font-bold ${atTarget ? 'text-fluent' : 'text-developing'}`}>
            {atTarget
              ? `AT TARGET (${CHORD_TARGET_RATE})`
              : `BELOW TARGET (${CHORD_TARGET_RATE})`}
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
          disabled={draft.manner === null}
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
  mode, seconds, draft, index, onFinish,
}: {
  mode: SessionMode;
  seconds: number;
  draft: DrillDraft;
  index: number;
  onFinish: (ranSeconds: number) => void;
}) {
  const metro = useMetronomeState();
  const remaining = useDrillCountdown(draft.targetSeconds, () =>
    onFinish(draft.targetSeconds));
  const rate = rateFor(metro.bpm, draft.beatsPerShape);
  const atTarget = isAtTarget(metro.bpm, draft.beatsPerShape);

  return (
    <div className="space-y-4">
      <SessionClockFace seconds={seconds} mode={mode} />

      <div className="rounded-lg border border-fluent p-4 text-center">
        <div className="font-mono tabular-nums text-4xl sm:text-5xl text-fluent">
          {formatClock(remaining)}
        </div>
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-neutral-400 mt-1">
          {mode === 'test' ? 'Test' : 'Drill'} {index}
          {draft.manner ? ` · ${mannerLabel(draft.manner)}` : ''}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[0.72rem] text-neutral-500">
          {metro.bpm} BPM · {rate} {CHORD_RATE_LABEL}
        </span>
        <span className={`text-[0.69rem] font-bold ${atTarget ? 'text-fluent' : 'text-developing'}`}>
          {atTarget ? 'AT TARGET' : 'BELOW TARGET'}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onFinish(draft.targetSeconds - remaining)}
        className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
      >
        Finish Now
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------

function DrillRateStep({
  mode, seconds, ranSeconds, index, onRate, onSkip,
}: {
  mode: SessionMode;
  seconds: number;
  ranSeconds: number;
  index: number;
  onRate: (feel: 1 | 2 | 3 | 4) => void;
  onSkip: () => void;
}) {
  const tooShort = isTooShort(ranSeconds, MIN_REP_SECONDS);
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

      <div>
        <SectionLabel>How Did That Go</SectionLabel>
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
