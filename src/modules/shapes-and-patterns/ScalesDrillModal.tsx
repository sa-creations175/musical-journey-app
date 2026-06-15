/**
 * Slim drill runner for a single Scales cell. Mirrors
 * DrillSessionModal's countdown flow exactly (setup → running →
 * paused → assess), minus the global-session integration —
 * Scales drilling is independent of the active Practice Sessions
 * timer. The metronome IS integrated (driver key `'drill'`,
 * stacks with any other active driver) so the click runs while
 * the drill is in progress; status surfaces under the transport.
 *
 *   · setup     — user picks a target duration via slider + preset
 *                 chips. Default = SCALE_KIND_SECONDS[cell.kind]
 *                 (30 s for maintenance scales; 90 s for natural
 *                 minor drill cells).
 *   · running   — timer counts DOWN from target. "Complete early"
 *                 button skips ahead to assess (disabled below
 *                 MIN_REP_SECONDS).
 *   · paused    — resume / complete early / reset to setup.
 *   · assess    — auto-entered when the countdown reaches zero
 *                 (with a brief two-tone end-cue chime via
 *                 playDrillEndCue). User picks Flying / Cruising /
 *                 Crawling and saves; save is disabled below
 *                 MIN_REP_SECONDS.
 *
 * Two writes happen on save:
 *   1. A DrillSession row via `logScaleDrillSession` — records BOTH
 *      `targetSeconds` (the user-set countdown) and `durationSeconds`
 *      (actual elapsed). Matches DrillSessionModal's save shape.
 *   2. `recordEngagement` against the cell's scale itemRef with the
 *      procedural-memory rating signal — the canonical proficiency
 *      signal.
 *
 * For natural-minor cells the assess phase additionally surfaces the
 * relative-major callout from the design doc.
 */
import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal';
import { metronome } from '../../lib/metronome';
import { useMetronomeState } from '../../lib/useMetronome';
import { recordEngagement } from '../../lib/spacingState';
import { HANDS_PER_SHAPE_ITEM, SCALE_KIND_SECONDS } from '../../lib/sessionAlgorithm/timePerAttempt';
import {
  feelToRating,
  formatDuration,
  logScaleDrillSession,
  MIN_REP_SECONDS,
  playDrillEndCue,
} from './drillModel';
import { relativeMajorOf } from './spTiers';
import type { ScaleCell } from './scaleSkills';
import type { DrillSession } from '../../lib/db';
import DrillMetronomeSetup from './DrillMetronomeSetup';
import DrillAssessment from './DrillAssessment';

interface Props {
  cell: ScaleCell;
  onClose: () => void;
  onLogged?: () => void;
  /** Seeds the countdown when the modal is opened by an in-session
   *  runner (the prep-flow drives this from the per-item time
   *  breakdown). Defaults to the cell's canonical duration when
   *  omitted (standalone matrix-tap use). */
  initialTargetSeconds?: number;
  /** In-session runner only: replaces the rating screen's single
   *  "cancel" with explicit Skip (cancel path) + Redo. Redo restarts
   *  the same item from the top; the runner remounts the modal for
   *  the same cell. Omitted for standalone use. */
  onRedo?: () => void;
  /** In-session runner only: the time the session allocated to this
   *  item (the prep-card breakdown value). When set, the subtitle
   *  reads "~Xs in this session" instead of the cell's standalone
   *  canonical suggestion. Omitted for standalone matrix-tap use. */
  sessionTargetSeconds?: number;
  /** In-session runner only: jump back to the previous scale in the
   *  sequence (abandons the current item without logging). */
  onPrevious?: () => void;
  /** In-session runner only: false on the first scale — disables the
   *  "Previous scale" control. */
  canGoPrevious?: boolean;
  /** In-session runner only: false on the last scale — disables the
   *  "Next scale" control. */
  canGoNext?: boolean;
}

type Phase = 'setup' | 'running' | 'paused' | 'assess';

// Every scale item is drilled left → right → both, each its own timer +
// rating + spacing state. The modal walks these in order, advancing on
// each "Save rating"; only after Both does it hand back to the runner.
const HANDS = ['left', 'right', 'both'] as const;
const HAND_LABEL: Record<(typeof HANDS)[number], string> = {
  left: 'Left hand',
  right: 'Right hand',
  both: 'Both hands',
};

/** Mirror of DrillSessionModal's setup-phase preset chips. The
 *  slider covers the 30–600 s range; chips provide quick jumps to
 *  common drill lengths. */
const PRESETS = [60, 120, 180, 300, 420, 600] as const;

/** Suggested per-cell drill duration in seconds — the canonical
 *  SCALE_KIND_SECONDS seed (major + pents ride a fast 30 s warm-up;
 *  natural minor — the drill cell — gets the 90 s drill window). */
function suggestedDurationFor(cell: ScaleCell): number {
  return SCALE_KIND_SECONDS[cell.kind];
}

function cellTitle(cell: ScaleCell): string {
  return cell.startingPoint
    ? `${cell.keyName} ${labelForKind(cell.kind)} — from ${cell.startingPoint}`
    : `${cell.keyName} ${labelForKind(cell.kind)}`;
}

function labelForKind(kind: ScaleCell['kind']): string {
  switch (kind) {
    case 'major':            return 'Major Scale';
    case 'natural-minor':    return 'Natural Minor';
    case 'major-pentatonic': return 'Major Pentatonic';
    case 'minor-pentatonic': return 'Minor Pentatonic';
  }
}

export default function ScalesDrillModal({
  cell,
  onClose,
  onLogged,
  initialTargetSeconds,
  onRedo,
  onPrevious,
  canGoPrevious,
  canGoNext,
}: Props) {
  const metroState = useMetronomeState();
  const suggested = suggestedDurationFor(cell);
  // Launched by the in-session runner (per-item time supplied) → the
  // prep screen already set duration + BPM + meter and the count-in
  // just fired GO, so flow straight into a running drill (no setup
  // screen). Standalone matrix-tap keeps the setup screen.
  const fromRunner = initialTargetSeconds !== undefined;
  // PER-HAND countdown seconds. The runner supplies the whole-item
  // budget (all three hands), so divide by the hand count; standalone
  // matrix-tap uses the cell's canonical per-hand duration. Floored at
  // 30s so a hand always gets a real drill.
  const seed = fromRunner
    ? Math.max(30, Math.round(initialTargetSeconds! / HANDS_PER_SHAPE_ITEM))
    : Math.max(30, suggested);
  const [targetSeconds, setTargetSeconds] = useState(seed);
  const [remainingSeconds, setRemainingSeconds] = useState(seed);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [phase, setPhase] = useState<Phase>(fromRunner ? 'running' : 'setup');
  // Which hand of the left → right → both walk we're on for this item.
  const [handIndex, setHandIndex] = useState(0);
  const currentHand = HANDS[handIndex];
  const [feel, setFeel] = useState<DrillSession['feelRating'] | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef<number | null>(null);

  // Cleanup on unmount — stop the local interval and metronome.
  // Mirrors DrillSessionModal's cleanup pattern.
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

  const startTick = () => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
      setRemainingSeconds(prev => {
        const next = prev - 1;
        if (next <= 0) {
          if (intervalRef.current !== null) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          metronome.stop('drill');
          void playDrillEndCue();
          setPhase('assess');
          return 0;
        }
        return next;
      });
    }, 1000);
  };

  const stopTick = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Runner launch → auto-start the metronome + countdown on mount (the
  // modal opened in `running` phase). remaining/elapsed are already
  // seeded above. The cleanup effect + every exit handler stop the
  // 'drill' driver, so this start stays balanced.
  useEffect(() => {
    if (fromRunner) {
      void metronome.start('drill');
      startTick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = () => {
    setPhase('running');
    setElapsedSeconds(0);
    setRemainingSeconds(targetSeconds);
    void metronome.start('drill');
    startTick();
  };

  const handlePause = () => {
    stopTick();
    metronome.stop('drill');
    setPhase('paused');
  };

  const handleResume = () => {
    setPhase('running');
    void metronome.start('drill');
    startTick();
  };

  const handleCompleteEarly = () => {
    stopTick();
    metronome.stop('drill');
    setPhase('assess');
  };

  const handleResetToSetup = () => {
    stopTick();
    metronome.stop('drill');
    setPhase('setup');
    setElapsedSeconds(0);
    setRemainingSeconds(targetSeconds);
  };

  const handleCancel = () => {
    stopTick();
    metronome.stop('drill');
    onClose();
  };

  // Runner "Redo": restart this same item from the top. Tear down the
  // local timer + metronome, then signal the runner to remount the
  // modal for the same cell.
  const handleRedo = () => {
    stopTick();
    metronome.stop('drill');
    onRedo?.();
  };

  // Runner "Previous scale": abandon this scale (no log) and step back
  // to the prior one. The runner remounts the modal for that cell.
  const handlePrevious = () => {
    stopTick();
    metronome.stop('drill');
    onPrevious?.();
  };

  // Per-item "extend" (runner rating screen): drill THIS scale again for
  // exactly `seconds` more — restart the countdown in place at the new
  // target, no runner remount needed.
  const handleExtendItem = (seconds: number) => {
    stopTick();
    metronome.stop('drill');
    setFeel(null);
    setTargetSeconds(seconds);
    setElapsedSeconds(0);
    setRemainingSeconds(seconds);
    setPhase('running');
    void metronome.start('drill');
    startTick();
  };

  // Advance to the next hand within this item: a lightweight in-modal
  // refresh (no dark overlay) — reset the rating + countdown and drop
  // straight back into a running drill for the next hand.
  const advanceToHand = (nextIndex: number) => {
    setHandIndex(nextIndex);
    setFeel(null);
    setNotes('');
    setElapsedSeconds(0);
    setRemainingSeconds(targetSeconds);
    setPhase('running');
    void metronome.start('drill');
    startTick();
  };

  const handleSave = async () => {
    if (saving || feel === null || belowMin) return;
    setSaving(true);
    try {
      // Log THIS hand's rating against its own spacing state. Records
      // BOTH the user-set countdown (`targetSeconds`) and the actual
      // elapsed (`durationSeconds`); recordEngagement (the proficiency
      // signal) follows — each hand advances independently.
      await logScaleDrillSession({
        itemRef: cell.itemRef,
        hand: currentHand,
        durationSeconds: elapsedSeconds,
        feelRating: feel,
        targetSeconds,
        notes,
      });
      await recordEngagement({
        itemRef: cell.itemRef,
        moduleRef: 'shapes-and-patterns',
        hand: currentHand,
        signal: { kind: 'rating', rating: feelToRating(feel) },
      });
      if (handIndex < HANDS.length - 1) {
        // More hands to drill — refresh in place for the next hand.
        advanceToHand(handIndex + 1);
      } else {
        // Both hands done → hand back to the runner (UP NEXT / block end).
        onLogged?.();
        onClose();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[scales-drill] save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const belowMin = elapsedSeconds < MIN_REP_SECONDS;
  const title = cellTitle(cell);
  // Display: countdown in setup/running/paused, elapsed in assess.
  const displaySeconds = phase === 'assess' ? elapsedSeconds : remainingSeconds;

  // Relative-major callout — natural-minor cells only, in the
  // assess phase. Per design doc: drilling C natural minor primes
  // the user for Eb major next.
  const showRelativeMajor = cell.kind === 'natural-minor' && phase === 'assess';
  const relativeMajor = showRelativeMajor ? relativeMajorOf(cell.keyName) : null;

  return (
    <Modal
      open
      // Prevent accidental close during running — matches DrillSessionModal.
      onClose={phase === 'running' ? () => {} : handleCancel}
      title={title}
      description={
        `${HAND_LABEL[currentHand]} · ` +
        (fromRunner
          ? `~${targetSeconds}s in this session`
          : `~${targetSeconds}s suggested`)
      }
      footer={phase === 'assess' ? (
        <div className="flex items-center justify-end gap-2">
          {onRedo ? (
            <>
              <button
                onClick={handlePrevious}
                disabled={!canGoPrevious}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                title="Go back to the previous scale"
              >
                Previous scale
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
                title={canGoNext ? 'Move on to the next scale' : 'Finish — end the drills and rate this block'}
              >
                {canGoNext ? 'Next scale' : 'Finish'}
              </button>
              <button
                onClick={handleRedo}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
                title="Restart this same scale from the top"
              >
                Redo
              </button>
            </>
          ) : (
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
            >
              cancel — don't log
            </button>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={feel === null || saving || belowMin}
            className={`px-4 py-1.5 rounded-md text-sm font-medium text-white ${
              feel === null || saving || belowMin
                ? 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
                : 'bg-fluent hover:opacity-90'
            }`}
          >
            {saving ? 'Saving…' : 'Save rating'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2">
          {onRedo && (
            <button
              onClick={handlePrevious}
              disabled={!canGoPrevious}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              title="Go back to the previous scale"
            >
              Previous scale
            </button>
          )}
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            {onRedo ? (canGoNext ? 'Next scale' : 'Finish') : 'cancel'}
          </button>
        </div>
      )}
    >
      {phase !== 'assess' ? (
        <div className="space-y-4 text-sm">
          {/* Target-duration picker + metronome setup (setup phase only) */}
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
                  {PRESETS.map(s => (
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

          {/* Countdown display */}
          <div className="rounded-lg border border-black/[0.07] p-4 flex items-center justify-center">
            <div
              className={`font-mono tabular-nums text-5xl sm:text-6xl ${
                phase === 'running' ? 'text-fluent' : 'text-neutral-700 dark:text-neutral-200'
              }`}
            >
              {formatDuration(displaySeconds)}
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {phase === 'setup' && (
              <button
                onClick={handleStart}
                className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
              >
                Start drill
              </button>
            )}
            {phase === 'running' && (
              <>
                <button
                  onClick={handlePause}
                  className="px-4 py-2 rounded-lg border border-fluent text-fluent text-sm font-medium hover:bg-fluent/10"
                >
                  pause
                </button>
                <button
                  onClick={handleCompleteEarly}
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
                  onClick={handleResume}
                  className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
                >
                  resume
                </button>
                <button
                  onClick={handleCompleteEarly}
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
                  onClick={handleResetToSetup}
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
        <DrillAssessment
          elapsedSeconds={elapsedSeconds}
          feel={feel}
          onFeelChange={setFeel}
          moreTimeLabel="More time on this scale?"
          onExtend={handleExtendItem}
          notes={notes}
          onNotesChange={setNotes}
          belowMin={belowMin}
        >
          {showRelativeMajor && relativeMajor && (
            <div className="rounded-md border border-fluent/30 bg-fluent/5 p-3 text-xs space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-fluent">
                Relative major
              </div>
              <div className="text-neutral-700 dark:text-neutral-200">
                <span className="font-mono">{cell.keyName} natural minor</span>
                {' → relative major: '}
                <span className="font-mono font-medium">{relativeMajor}</span>
              </div>
              <div className="text-neutral-500">
                Same seven notes, different tonic — handy to drill {relativeMajor} major next.
              </div>
            </div>
          )}
        </DrillAssessment>
      )}
    </Modal>
  );
}
