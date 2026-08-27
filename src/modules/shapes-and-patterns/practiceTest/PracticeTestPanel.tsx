/**
 * What opens when you press a square in the chord grid.
 *
 * =====================================================================
 * ONE PANEL, FOUR STEPS, ONE CLOCK RUNNING THROUGH ALL OF THEM.
 *
 *   choose    — Practice or Test. Nothing preselected. The clock
 *               starts either way, which is why the question is asked
 *               BEFORE the work rather than after it.
 *   session   — the session clock, the drills so far, and the two
 *               things you can do next.
 *   setup     — manner, length, and the metronome.
 *   drilling  — a countdown inside the session clock.
 *
 * The steps are a MODE of one panel rather than four modals, for the
 * reason `CellPanel` gives on the repertoire side: it is the same
 * sitting throughout, the header does not change, and nothing has been
 * written yet.
 *
 * COMMIT 1 OF 4. What is deliberately absent:
 *   · Test mode. The button is real and does nothing — a dead button
 *     rather than a half-built one, which is the call that was made.
 *   · Any rating. A finished drill goes onto the list NOT RATED and
 *     the rating step slots between those two moments in commit 2.
 *   · Any write. No spacingState, no drillSessions, no practice log.
 *     The drill list is React state and dies on reload.
 * =====================================================================
 */
import { useEffect, useRef, useState } from 'react';
import Modal from '../../../components/Modal';
import DrillMetronomeSetup from '../DrillMetronomeSetup';
import { useMetronomeState } from '../../../lib/useMetronome';
import { metronome } from '../../../lib/metronome';
import { formatClock, useSessionClock } from './sessionClock';
import {
  CHORD_RATE_LABEL,
  CHORD_RATE_OPTIONS,
  CHORD_TARGET_RATE,
  DRILL_LENGTHS,
  isAtTarget,
  mannerLabel,
  newDraft,
  rateFor,
  type CompletedDrill,
  type DrillDraft,
  type Manner,
  type SessionMode,
} from './drillModel';

type Step = 'choose' | 'session' | 'setup' | 'drilling';

interface Props {
  /** What the reader pressed, for the header — e.g. "Cmaj7". */
  cellLabel: string;
  /** The square within it — e.g. "Root position · Left hand". */
  skillLabel: string;
  onClose: () => void;
}

/** The floor a session has to clear before ending it means anything. */
const SESSION_FLOOR_SECONDS = 30;

export default function PracticeTestPanel({ cellLabel, skillLabel, onClose }: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [mode, setMode] = useState<SessionMode | null>(null);
  const [drills, setDrills] = useState<CompletedDrill[]>([]);
  const [draft, setDraft] = useState<DrillDraft | null>(null);

  // Runs from the moment a mode is picked. Never paused — see the
  // module note on `sessionClock`.
  const sessionSeconds = useSessionClock(mode !== null);

  const close = () => {
    metronome.stop('drill');
    onClose();
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
        <ModeChooser
          onPick={next => {
            setMode(next);
            // TEST IS NOT WIRED. It selects, the clock starts, and the
            // session screen offers nothing to start — commit 1 ships
            // the chooser, not the path behind it.
            setStep('session');
          }}
        />
      )}

      {step === 'session' && mode !== null && (
        <SessionStep
          mode={mode}
          seconds={sessionSeconds}
          drills={drills}
          onStartDrill={() => { setDraft(newDraft()); setStep('setup'); }}
          onEndSession={close}
        />
      )}

      {step === 'setup' && draft !== null && mode !== null && (
        <SetupStep
          mode={mode}
          seconds={sessionSeconds}
          draft={draft}
          onChange={setDraft}
          onStart={() => setStep('drilling')}
          onCancel={() => { setDraft(null); setStep('session'); }}
        />
      )}

      {step === 'drilling' && draft !== null && draft.manner !== null && (
        <DrillingStep
          seconds={sessionSeconds}
          draft={draft}
          index={drills.length + 1}
          onFinish={ranSeconds => {
            // STRAIGHT ONTO THE LIST, UNRATED. The rating step lands
            // between these two lines in commit 2.
            setDrills(prev => [...prev, {
              id: `drill-${prev.length + 1}`,
              manner: draft.manner as Manner,
              ranSeconds,
              bpm: metronome.state.bpm,
              beatsPerShape: draft.beatsPerShape,
              rate: rateFor(metronome.state.bpm, draft.beatsPerShape),
              belowTarget: !isAtTarget(metronome.state.bpm, draft.beatsPerShape),
            }]);
            setDraft(null);
            setStep('session');
          }}
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
  mode, seconds, drills, onStartDrill, onEndSession,
}: {
  mode: SessionMode;
  seconds: number;
  drills: ReadonlyArray<CompletedDrill>;
  onStartDrill: () => void;
  onEndSession: () => void;
}) {
  const belowFloor = seconds < SESSION_FLOOR_SECONDS;
  return (
    <div className="space-y-4">
      <SessionClockFace seconds={seconds} mode={mode} />

      <div>
        <SectionLabel>
          {mode === 'test' ? 'The Three Test Drills' : 'Drills In This Session'}
        </SectionLabel>
        <DrillList mode={mode} drills={drills} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {mode === 'practice' && (
          <button
            type="button"
            onClick={onStartDrill}
            className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
          >
            Start A Practice Drill
          </button>
        )}
        <button
          type="button"
          onClick={onEndSession}
          disabled={belowFloor}
          className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm disabled:opacity-45 disabled:cursor-not-allowed"
        >
          End Session
        </button>
      </div>

      {belowFloor && (
        <p className="text-[11px] text-neutral-500 m-0">
          Under the {SESSION_FLOOR_SECONDS}-second floor —{' '}
          {SESSION_FLOOR_SECONDS - seconds}s more before this session counts.
        </p>
      )}
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
      {drills.map((d, i) => (
        <div
          key={d.id}
          className="flex items-center gap-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-2 text-xs"
        >
          <span className="font-mono text-[0.7rem] font-bold text-neutral-400">{i + 1}</span>
          <span className="flex-1 min-w-0">
            <b className="font-semibold">Drill {i + 1} · {mannerLabel(d.manner)}</b>
            <span className="block font-mono text-[0.66rem] text-neutral-400">
              {d.ranSeconds}s · {d.rate} {CHORD_RATE_LABEL}
            </span>
          </span>
          <span className="text-[11px] text-neutral-400 uppercase tracking-wide">Not Rated</span>
          {d.belowTarget && (
            <span className="text-[11px] font-bold text-developing">BELOW</span>
          )}
        </div>
      ))}
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

  return (
    <div className="space-y-4">
      <SessionClockFace seconds={seconds} mode={mode} />

      <div>
        <SectionLabel>Manner</SectionLabel>
        <div className="flex gap-1.5 flex-wrap">
          {(['broken', 'blocked'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...draft, manner: m })}
              aria-pressed={draft.manner === m}
              className={`px-3 py-1 rounded-md border text-sm ${
                draft.manner === m
                  ? 'bg-fluent text-white border-fluent font-semibold'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent'
              }`}
            >
              {mannerLabel(m)}
            </button>
          ))}
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

      {/* THE APP'S OWN METRONOME, not a reduced copy of it — which is
          what the prototype asks for in as many words. Everything it
          offers (tempo, groove, preview) is the same control the drill
          modals already use and writes to the same singleton. */}
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
  seconds, draft, index, onFinish,
}: {
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
      {/* The session clock stays on screen and keeps moving while this
          one counts down. Two clocks, two things measured. */}
      <SessionClockFace seconds={seconds} mode="practice" />

      <div className="rounded-lg border border-fluent p-4 text-center">
        <div className="font-mono tabular-nums text-4xl sm:text-5xl text-fluent">
          {formatClock(remaining)}
        </div>
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-neutral-400 mt-1">
          Drill {index}{draft.manner ? ` · ${mannerLabel(draft.manner)}` : ''}
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

/** A 250 ms interval that cleans itself up. Kept tiny and local — the
 *  callback changes identity every render, so it is held in a ref
 *  rather than made a dependency, which would restart the timer on
 *  every tick. */
function useEffectOnInterval(fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = window.setInterval(() => ref.current(), 250);
    return () => window.clearInterval(id);
  }, []);
}
