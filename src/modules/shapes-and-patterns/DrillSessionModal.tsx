import { useEffect, useRef, useState } from 'react';
import type { DrillSession, DrillSkill, DrillType } from '../../lib/db';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toaster';
import { metronome } from '../../lib/metronome';
import { useMetronomeState } from '../../lib/useMetronome';
import { useSessionTimer } from '../../lib/sessionTimer/SessionTimerContext';
import DrillMetronomeSetup from './DrillMetronomeSetup';
import {
  FEEL_EMOJI,
  FEEL_LABEL,
  formatDuration,
  logSession,
  MIN_REP_SECONDS,
  playDrillEndCue,
} from './drillModel';

interface Props {
  skill: DrillSkill;
  drillType: DrillType;
  onClose: () => void;
  onLogged: (session: DrillSession) => void;
  /** Seeds the countdown when opened by the in-session chord-shape
   *  runner (prep-flow drives this from the per-item time breakdown).
   *  Its presence flips the modal into in-session mode: auto-run (skip
   *  setup), no own session ownership, runner sequence controls.
   *  Omitted for standalone matrix-tap use. */
  initialTargetSeconds?: number;
  /** In-session only: the time the session allocated to this item
   *  (the prep-card breakdown value). Drives the subtitle. */
  sessionTargetSeconds?: number;
  /** In-session only: restart this same cell from the top (the runner
   *  remounts the modal for the same cell). */
  onRedo?: () => void;
  /** In-session only: step back to the previous cell (abandons this
   *  one without logging). */
  onPrevious?: () => void;
  /** In-session only: false on the first cell — disables Previous. */
  canGoPrevious?: boolean;
  /** In-session only: false on the last cell — Next reads "Finish". */
  canGoNext?: boolean;
}

type Phase = 'setup' | 'running' | 'paused' | 'assess';

// Per-item extend pills (in-session rating) — absolute re-drill lengths.
// Mirrors EXTEND_DRILL_OPTIONS in ScalesDrillModal / ActiveSessionScreen.
const EXTEND_DRILL_OPTIONS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: '+30s', seconds: 30 },
  { label: '+1 min', seconds: 60 },
  { label: '+2 min', seconds: 120 },
  { label: '+5 min', seconds: 300 },
];

/**
 * Drill runner: setup → running → (paused → running)* → assess.
 *
 * The per-drill countdown is local to this modal — its own setInterval,
 * its own elapsed/remaining state. Independent of the global session
 * timer.
 *
 * Phase 3 Step 1e — global session integration:
 *
 *   - The Shapes practice "session" is one block ("Shapes practice")
 *     in the global timer. It spans an arbitrary number of drill modal
 *     opens; the block timer accumulates total time on Shapes,
 *     auto-pausing on navigation away and surfacing in the global
 *     banner. The session ends when the user explicitly taps End on
 *     the banner — not when an individual drill completes or saves.
 *
 *   - On the FIRST drill of a session (timer idle / ended), this
 *     modal calls startSession with the persistent block. On
 *     subsequent drills (timer running / paused), it doesn't touch
 *     the timer — the existing session continues.
 *
 *   - Pause / resume from the banner (or auto-pause-on-navigation)
 *     is mirrored into this modal's local timer via a sync effect:
 *     external pause stops the local interval and metronome and
 *     flips the modal phase to 'paused'; external resume restarts
 *     them. The modal's own pause / resume buttons go the opposite
 *     direction (call pauseSession / resumeSession on the global
 *     timer; the sync effect picks the change up).
 *
 *   - When the user ends the session via the banner mid-drill, the
 *     sync effect snapshots the in-progress drill into assess phase
 *     so any practice time can still be saved.
 *
 *   - Cancel and save never touch the global timer. They only manage
 *     the per-drill record. The session keeps running for the next
 *     drill.
 */
export default function DrillSessionModal({
  skill,
  drillType,
  onClose,
  onLogged,
  initialTargetSeconds,
  sessionTargetSeconds,
  onRedo,
  onPrevious,
  canGoPrevious,
  canGoNext,
}: Props) {
  const { toast } = useToast();
  const metroState = useMetronomeState();
  const { state, startSession, pauseSession, resumeSession } = useSessionTimer();

  // In-session runner launch: the prep screen already set duration + BPM
  // + meter and the count-in just fired GO, so flow straight into a
  // running drill (skip setup). The session timer (not this modal) owns
  // the session; this modal never calls startSession in-session, and the
  // runner walks cells via the Previous/Next/Redo controls. Standalone
  // matrix-tap (no initialTargetSeconds) keeps the original flow exactly.
  const fromRunner = initialTargetSeconds !== undefined;
  const seed = fromRunner
    ? Math.max(60, initialTargetSeconds!)
    : drillType.suggestedSeconds;

  const [targetSeconds, setTargetSeconds] = useState(seed);
  const [phase, setPhase] = useState<Phase>(fromRunner ? 'running' : 'setup');
  const [remainingSeconds, setRemainingSeconds] = useState(seed);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [feel, setFeel] = useState<DrillSession['feelRating']>(3);
  const [notes, setNotes] = useState('');

  const intervalRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  // Cleanup on unmount — stop the local interval and metronome. Don't
  // touch the global session: a Shapes practice session may span
  // multiple drill modal cycles, and the banner is the canonical end.
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (phase === 'running' || phase === 'paused') {
        metronome.stop('drill');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In-session runner launch → auto-start the metronome + countdown on
  // mount (the modal opened in `running` phase; remaining/elapsed are
  // already seeded). The cleanup effect + every exit handler stop the
  // 'drill' driver, so this start stays balanced. Mirrors
  // ScalesDrillModal.
  useEffect(() => {
    if (fromRunner) {
      void metronome.start('drill');
      tick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror external global-timer transitions into local timer state.
  // Banner pause / auto-pause-on-navigation / hard-prompt-end-session
  // all change state.status without going through the modal's buttons;
  // this effect keeps the per-drill countdown in sync. Runs in-session
  // too so a banner pause freezes BOTH the metronome and this modal's
  // countdown (the runner's setInSessionDrillActive only stands the
  // drill-END watcher down; pause/resume still flow through here).
  useEffect(() => {
    if (phase !== 'running' && phase !== 'paused') return;

    if (state.status === 'paused' && phase === 'running') {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      metronome.stop('drill');
      setPhase('paused');
    } else if (state.status === 'running' && phase === 'paused') {
      setPhase('running');
      void metronome.start('drill');
      tick();
    } else if (state.status === 'idle' || state.status === 'ended') {
      // Session ended externally via banner. Snapshot into assess so
      // any in-progress drill time can still be saved by the user.
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      metronome.stop('drill');
      setPhase('assess');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const start = async () => {
    setPhase('running');
    setRemainingSeconds(targetSeconds);
    setElapsedSeconds(0);
    startedAtRef.current = Date.now();

    // First drill of a Shapes practice session — light up the global
    // timer with a single persistent "Shapes practice" block.
    // Subsequent drills join the existing session; block.activeMs
    // continues to accumulate.
    if (!fromRunner && (state.status === 'idle' || state.status === 'ended')) {
      startSession({
        origin: 'shapes-drill',
        activeModuleRef: 'shapes-and-patterns',
        blocks: [
          {
            moduleRef: 'shapes-and-patterns',
            label: 'Shapes practice',
            // Soft cap; the canonical end is the user tapping End on
            // the global banner, not the timer reaching this value.
            plannedSeconds: 60 * 60,
          },
        ],
      });
    }

    await metronome.start('drill');
    tick();
  };

  const tick = () => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
      setRemainingSeconds(prev => {
        const next = prev - 1;
        if (next <= 0) {
          window.clearInterval(intervalRef.current!);
          intervalRef.current = null;
          metronome.stop('drill');
          void playDrillEndCue();
          setPhase('assess');
          return 0;
        }
        return next;
      });
    }, 1000);
  };

  const pause = () => {
    // Drive the global timer; the sync effect mirrors it into local
    // cleanup (in-session too, now the effect is un-gated). Keeping this
    // global means this button and the banner pause behave identically.
    pauseSession({ reason: 'manual' });
  };

  const resume = () => {
    // Drive the global timer; the sync effect handles the local restart.
    resumeSession();
  };

  const completeEarly = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    metronome.stop('drill');
    // Do NOT end the global session — the Shapes practice continues.
    setPhase('assess');
  };

  // In-session "Redo": restart this same cell from the top. Tear down
  // the local timer + metronome, then signal the runner to remount.
  const handleRedo = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    metronome.stop('drill');
    onRedo?.();
  };

  // In-session "Previous": abandon this cell (no log) and step back to
  // the prior one. The runner remounts the modal for that cell.
  const handlePrevious = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    metronome.stop('drill');
    onPrevious?.();
  };

  // In-session per-item extend: drill THIS cell again for exactly
  // `seconds` more — restart the countdown in place, no remount.
  const handleExtendItem = (seconds: number) => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    metronome.stop('drill');
    setTargetSeconds(seconds);
    setElapsedSeconds(0);
    setRemainingSeconds(seconds);
    setPhase('running');
    void metronome.start('drill');
    tick();
  };

  const resetToSetup = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    metronome.stop('drill');
    setPhase('setup');
    setElapsedSeconds(0);
    setRemainingSeconds(targetSeconds);
    // Local-only reset; global session persists.
  };

  const save = async () => {
    if (elapsedSeconds < MIN_REP_SECONDS) {
      toast({
        message: `Practice for at least ${MIN_REP_SECONDS} seconds to log as a rep.`,
        variant: 'warning',
      });
      return;
    }
    const session = await logSession({
      skill,
      drillType,
      durationSeconds: elapsedSeconds,
      // Capture the user-selected countdown so future rolling-
      // average planning has the target alongside the actual.
      // `targetSeconds` defaults from `drillType.suggestedSeconds`
      // and may have been adjusted via the setup-phase picker.
      targetSeconds,
      feelRating: feel,
      notes,
    });
    toast({
      message: `Logged ${formatDuration(elapsedSeconds)} on "${drillType.name}".`,
      variant: 'success',
    });
    onLogged(session);
    // In-session: close so the runner advances to the next cell (its
    // onClose-after-log is swallowed via justLoggedRef). Standalone:
    // modal unmounts via parent (setActiveDrill(null)); global session
    // remains running for the next drill — banner is the canonical end.
    if (fromRunner) onClose();
  };

  const cancelWithoutLogging = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    metronome.stop('drill');
    onClose();
    // Same as save: don't touch the global session.
  };

  const mm = Math.floor((phase === 'assess' ? elapsedSeconds : remainingSeconds) / 60);
  const ss = ((phase === 'assess' ? elapsedSeconds : remainingSeconds) % 60)
    .toString()
    .padStart(2, '0');
  const belowMin = elapsedSeconds < MIN_REP_SECONDS;

  return (
    <Modal
      open
      onClose={phase === 'running' ? () => {} : cancelWithoutLogging}
      title={drillType.name}
      description={
        fromRunner && sessionTargetSeconds !== undefined
          ? `${skill.label} · ~${sessionTargetSeconds}s in this session`
          : skill.label
      }
      footer={phase === 'assess' ? (
        <div className="flex items-center justify-end gap-2">
          {fromRunner ? (
            <>
              <button
                onClick={handlePrevious}
                disabled={!canGoPrevious}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                title="Go back to the previous cell"
              >
                Previous
              </button>
              <button
                onClick={cancelWithoutLogging}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
                title={canGoNext ? 'Move on to the next cell' : 'Finish — end the drills and rate this block'}
              >
                {canGoNext ? 'Next' : 'Finish'}
              </button>
              <button
                onClick={handleRedo}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
                title="Restart this same cell from the top"
              >
                Redo
              </button>
            </>
          ) : (
            <button
              onClick={cancelWithoutLogging}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
            >
              cancel — don't log
            </button>
          )}
          <button
            onClick={save}
            disabled={belowMin}
            className={`px-4 py-1.5 rounded-md text-sm font-medium text-white ${
              belowMin
                ? 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
                : 'bg-fluent hover:opacity-90'
            }`}
          >
            complete drill
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2">
          {fromRunner && (
            <button
              onClick={handlePrevious}
              disabled={!canGoPrevious}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              title="Go back to the previous cell"
            >
              Previous
            </button>
          )}
          <button
            onClick={cancelWithoutLogging}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            {fromRunner ? (canGoNext ? 'Next' : 'Finish') : 'cancel'}
          </button>
        </div>
      )}
    >
      {phase !== 'assess' ? (
        <div className="space-y-4 text-sm">
          {/* Target-time editor + metronome setup (setup phase only) */}
          {phase === 'setup' && (
            <>
              <div className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-neutral-500 uppercase tracking-wide text-xs">target time</span>
                  <span className="font-mono tabular-nums">{formatDuration(targetSeconds)}</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={600}
                  step={15}
                  value={targetSeconds}
                  onChange={e => {
                    const next = Number(e.target.value);
                    setTargetSeconds(next);
                    setRemainingSeconds(next);
                  }}
                  className="w-full accent-fluent"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[60, 120, 180, 300, 420, 600].map(s => (
                    <button
                      key={s}
                      onClick={() => { setTargetSeconds(s); setRemainingSeconds(s); }}
                      className={`px-2 py-0.5 rounded border text-xs ${
                        targetSeconds === s
                          ? 'bg-fluent text-white border-fluent'
                          : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
                      }`}
                    >
                      {formatDuration(s)}
                    </button>
                  ))}
                </div>
              </div>
              <DrillMetronomeSetup />
            </>
          )}

          {/* Timer display */}
          <div className="rounded-lg border border-black/[0.07] p-4 flex items-center justify-center">
            <div
              className={`font-mono tabular-nums text-5xl sm:text-6xl ${
                phase === 'running' ? 'text-fluent' : 'text-neutral-700 dark:text-neutral-200'
              }`}
            >
              {mm}:{ss}
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {phase === 'setup' && (
              <button
                onClick={start}
                className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
              >
                start drill
              </button>
            )}
            {phase === 'running' && (
              <>
                <button
                  onClick={pause}
                  className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
                >
                  pause
                </button>
                <button
                  onClick={completeEarly}
                  disabled={belowMin}
                  className={`px-4 py-2 rounded-lg border text-sm ${
                    belowMin
                      ? 'border-neutral-200 dark:border-neutral-700 text-neutral-400 cursor-not-allowed'
                      : 'border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent'
                  }`}
                >
                  complete early
                </button>
              </>
            )}
            {phase === 'paused' && (
              <>
                <button
                  onClick={resume}
                  className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
                >
                  resume
                </button>
                <button
                  onClick={completeEarly}
                  disabled={belowMin}
                  className={`px-4 py-2 rounded-lg border text-sm ${
                    belowMin
                      ? 'border-neutral-200 dark:border-neutral-700 text-neutral-400 cursor-not-allowed'
                      : 'border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent'
                  }`}
                >
                  complete early
                </button>
                <button
                  onClick={resetToSetup}
                  className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-500"
                >
                  reset
                </button>
              </>
            )}
          </div>

          {belowMin && (phase === 'running' || phase === 'paused') && (
            <p className="text-[11px] text-neutral-500 text-center italic">
              practice for at least {MIN_REP_SECONDS} seconds before completing — cancel to exit without logging.
            </p>
          )}

          <p className="text-[11px] text-neutral-500 text-center italic">
            metronome: {metroState.playing ? 'on' : 'off'} · {metroState.bpm} bpm · {metroState.groove} · adjust from the header control.
          </p>
        </div>
      ) : (
        // --- Assessment phase -----------------------------------
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-black/[0.07] p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">practised</div>
            <div className="font-mono tabular-nums text-2xl">{formatDuration(elapsedSeconds)}</div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">how did it go?</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {([1, 2, 3, 4] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setFeel(v)}
                  className={`px-2.5 py-1 rounded-md border text-xs inline-flex items-center gap-1.5 ${
                    feel === v
                      ? 'bg-fluent text-white border-fluent'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
                  }`}
                >
                  <span aria-hidden>{FEEL_EMOJI[v]}</span>
                  <span>{FEEL_LABEL[v]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* In-session per-item extend: drill this same cell again for
              exactly the chosen length before moving on. */}
          {fromRunner && (
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-wide text-neutral-500">more time on this cell?</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {EXTEND_DRILL_OPTIONS.map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => handleExtendItem(opt.seconds)}
                    className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent text-xs font-medium"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-neutral-500">notes (optional)</span>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="what worked, what didn't, voicings to revisit"
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
            />
          </label>

          {belowMin && (
            <p className="text-xs text-developing italic">
              practice for at least {MIN_REP_SECONDS} seconds to log as a rep.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

// playDrillEndCue lives in ./drillModel — shared with the Scales /
// VL drill modals so all three S&P countdown timers have the same
// end-of-drill audio signature.
