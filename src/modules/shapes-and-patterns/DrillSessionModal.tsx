import { useEffect, useRef, useState } from 'react';
import type { DrillSession, DrillSkill, DrillType } from '../../lib/db';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toaster';
import { metronome } from '../../lib/metronome';
import { useMetronomeState } from '../../lib/useMetronome';
import {
  FEEL_EMOJI,
  FEEL_LABEL,
  formatDuration,
  logSession,
  MIN_REP_SECONDS,
} from './drillModel';

interface Props {
  skill: DrillSkill;
  drillType: DrillType;
  onClose: () => void;
  onLogged: (session: DrillSession) => void;
}

type Phase = 'setup' | 'running' | 'paused' | 'complete' | 'assess';

/**
 * Drill runner: two-phase flow.
 *   setup  — target time editor, Start button, metronome preview.
 *   running — counts DOWN from target; metronome auto-plays.
 *   complete — arrives either by timer hitting 0 or user clicking
 *              Complete Early; transitions to assess.
 *   assess — feel rating + notes + Save.
 *
 * Metronome coordination: starts with driver='drill' when the user
 * clicks Start, stops with driver='drill' on any exit. If the user
 * had the metronome running with driver='user' before the drill,
 * it keeps running afterward (driverStack in the metronome singleton).
 */
export default function DrillSessionModal({ skill, drillType, onClose, onLogged }: Props) {
  const { toast } = useToast();
  const metroState = useMetronomeState();

  const [targetSeconds, setTargetSeconds] = useState(drillType.suggestedSeconds);
  const [phase, setPhase] = useState<Phase>('setup');
  const [remainingSeconds, setRemainingSeconds] = useState(drillType.suggestedSeconds);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [feel, setFeel] = useState<DrillSession['feelRating']>(3);
  const [notes, setNotes] = useState('');

  const intervalRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  // Cleanup on unmount — make sure we don't leave a drill-driven
  // metronome running or a ticking timer.
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

  const start = async () => {
    setPhase('running');
    setRemainingSeconds(targetSeconds);
    setElapsedSeconds(0);
    startedAtRef.current = Date.now();
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
          void playEndCue();
          setPhase('assess');
          return 0;
        }
        return next;
      });
    }, 1000);
  };

  const pause = () => {
    setPhase('paused');
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    metronome.stop('drill');
  };

  const resume = async () => {
    setPhase('running');
    await metronome.start('drill');
    tick();
  };

  const completeEarly = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    metronome.stop('drill');
    setPhase('assess');
  };

  const reset = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    metronome.stop('drill');
    setPhase('setup');
    setElapsedSeconds(0);
    setRemainingSeconds(targetSeconds);
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
      feelRating: feel,
      notes,
    });
    toast({
      message: `Logged ${formatDuration(elapsedSeconds)} on "${drillType.name}".`,
      variant: 'success',
    });
    onLogged(session);
  };

  const cancelWithoutLogging = () => {
    metronome.stop('drill');
    onClose();
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
      description={skill.label}
      footer={phase === 'assess' ? (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={cancelWithoutLogging}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            cancel — don't log
          </button>
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
        <div className="flex items-center justify-end">
          <button
            onClick={cancelWithoutLogging}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            cancel
          </button>
        </div>
      )}
    >
      {phase !== 'assess' ? (
        <div className="space-y-4 text-sm">
          {/* Target-time editor (setup phase only) */}
          {phase === 'setup' && (
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
          )}

          {/* Timer display */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 flex items-center justify-center">
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
                  className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm"
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
                  className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm"
                >
                  complete early
                </button>
                <button
                  onClick={reset}
                  className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-500"
                >
                  reset
                </button>
              </>
            )}
          </div>

          <p className="text-[11px] text-neutral-500 text-center italic">
            metronome: {metroState.playing ? 'on' : 'off'} · {metroState.bpm} bpm · {metroState.groove} · adjust from the header control.
          </p>
        </div>
      ) : (
        // --- Assessment phase -----------------------------------
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 text-center">
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

// Brief two-tone cue when the countdown completes. Intentionally
// short + distinct so the drill session feels like a timed block.
async function playEndCue() {
  try {
    const { ensureRunning } = await import('../../lib/audio');
    const ctx = await ensureRunning();
    const t = ctx.currentTime + 0.02;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 780 + i * 260;
      gain.gain.setValueAtTime(0, t + i * 0.22);
      gain.gain.linearRampToValueAtTime(0.25, t + i * 0.22 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.22);
      osc.stop(t + i * 0.22 + 0.2);
    }
  } catch {
    // non-fatal
  }
}
