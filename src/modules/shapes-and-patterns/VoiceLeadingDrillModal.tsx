/**
 * Slim drill runner for a single Voice-Leading sub-cell. Mirrors
 * DrillSessionModal's countdown flow exactly (setup → running →
 * paused → assess), minus the global-session integration — VL
 * drilling is independent of the active Practice Sessions timer.
 * The metronome IS integrated (driver key `'drill'`, stacks with
 * any other active driver) so the click runs while the drill is in
 * progress; status surfaces under the transport.
 *
 *   · setup     — user picks a target duration via slider + preset
 *                 chips. Default = `voiceLeadingCellSeconds(desc)`
 *                 (90 / 120 / 180 s depending on pattern + type).
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
 *   1. A DrillSession row via `logVoiceLeadingDrillSession` —
 *      records BOTH `targetSeconds` (the user-set countdown) and
 *      `durationSeconds` (actual elapsed). Matches DrillSessionModal's
 *      save shape.
 *   2. `recordEngagement` against the sub-cell itemRef with the
 *      procedural-memory rating signal.
 *
 * Accepts a specific sub-cell itemRef. The session-algorithm path
 * still uses `pickMostDueVoiceLeadingSubCell` exported from
 * catalog.ts to pick candidate sub-cells when proposing blocks;
 * that picker is not called inside this modal.
 *
 * Unparseable itemRefs short-circuit to a placeholder state.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../../components/Modal';
import { metronome } from '../../lib/metronome';
import { useMetronomeState } from '../../lib/useMetronome';
import { recordEngagement } from '../../lib/spacingState';
import { voiceLeadingCellSeconds } from '../../lib/sessionAlgorithm/timePerAttempt';
import {
  feelToRating,
  formatDuration,
  logVoiceLeadingDrillSession,
  MIN_REP_SECONDS,
  playDrillEndCue,
} from './drillModel';
import {
  parseVoiceLeadingItemRef,
  VOICE_LEADING_PATTERN_BY_ID,
  voiceLeadingSubCellLabel,
} from './catalog';
import type { DrillSession } from '../../lib/db';
import DrillMetronomeSetup from './DrillMetronomeSetup';
import DrillAssessment from './DrillAssessment';

interface Props {
  /** Canonical VL sub-cell itemRef. The grid tap supplies this
   *  directly so the modal targets the exact cell the user picked. */
  itemRef: string;
  onClose: () => void;
  onLogged?: () => void;
  /** Seeds the countdown when the modal is opened by the in-session VL
   *  runner (the prep-flow drives this from the per-item time
   *  breakdown). Its presence flips the modal into in-session mode:
   *  auto-run (skip setup), runner sequence controls. Defaults to the
   *  cell's canonical duration when omitted (standalone matrix-tap). */
  initialTargetSeconds?: number;
  /** In-session runner only: the time the session allocated to this
   *  item. Drives the subtitle. */
  sessionTargetSeconds?: number;
  /** In-session runner only: restart this same sub-cell from the top
   *  (the runner remounts the modal for the same itemRef). */
  onRedo?: () => void;
  /** In-session runner only: step back to the previous sub-cell
   *  (abandons this one without logging). */
  onPrevious?: () => void;
  /** In-session runner only: false on the first item — disables Previous. */
  canGoPrevious?: boolean;
  /** In-session runner only: false on the last item — Next reads "Finish". */
  canGoNext?: boolean;
}

type Phase = 'setup' | 'running' | 'paused' | 'assess';

/** Mirror of DrillSessionModal's setup-phase preset chips. */
const PRESETS = [60, 120, 180, 300, 420, 600] as const;

export default function VoiceLeadingDrillModal({
  itemRef,
  onClose,
  onLogged,
  initialTargetSeconds,
  sessionTargetSeconds,
  onRedo,
  onPrevious,
  canGoPrevious,
  canGoNext,
}: Props) {
  const metroState = useMetronomeState();
  const desc = useMemo(() => parseVoiceLeadingItemRef(itemRef), [itemRef]);
  const pattern = desc ? VOICE_LEADING_PATTERN_BY_ID.get(desc.patternId) : undefined;
  const subCellLabel = desc ? voiceLeadingSubCellLabel(desc) : null;
  const suggested = desc ? voiceLeadingCellSeconds(desc) : 90;
  const keyName = desc?.keyName ?? '';

  // Launched by the in-session runner (per-item time supplied) → the
  // prep screen already set duration + BPM + meter and the count-in
  // just fired GO, so flow straight into a running drill (no setup
  // screen). Standalone matrix-tap keeps the setup screen. Mirrors
  // ScalesDrillModal.
  const fromRunner = initialTargetSeconds !== undefined;
  const seed = Math.max(
    initialTargetSeconds !== undefined ? 60 : 30,
    initialTargetSeconds ?? suggested,
  );

  const [targetSeconds, setTargetSeconds] = useState(seed);
  const [remainingSeconds, setRemainingSeconds] = useState(seed);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [phase, setPhase] = useState<Phase>(fromRunner ? 'running' : 'setup');
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
  // modal opened in `running` phase; remaining/elapsed are already
  // seeded). The cleanup effect + every exit handler stop the 'drill'
  // driver, so this start stays balanced. Mirrors ScalesDrillModal.
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

  // Runner "Redo": restart this same sub-cell from the top. Tear down
  // the local timer + metronome, then signal the runner to remount.
  const handleRedo = () => {
    stopTick();
    metronome.stop('drill');
    onRedo?.();
  };

  // Runner "Previous": abandon this sub-cell (no log) and step back to
  // the prior one. The runner remounts the modal for that item.
  const handlePrevious = () => {
    stopTick();
    metronome.stop('drill');
    onPrevious?.();
  };

  // Per-item "extend": drill THIS sub-cell again for exactly `seconds`
  // more — restart the countdown in place at the new target. Mirrors
  // ScalesDrillModal / DrillSessionModal.
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

  const handleSave = async () => {
    if (saving || feel === null || !desc || belowMin) return;
    setSaving(true);
    try {
      // DrillSession row first — the attempt-counting record. Records
      // BOTH the user-set countdown (`targetSeconds`) and the actual
      // elapsed (`durationSeconds`). recordEngagement (the proficiency
      // signal) follows.
      await logVoiceLeadingDrillSession({
        itemRef,
        durationSeconds: elapsedSeconds,
        feelRating: feel,
        targetSeconds,
        notes,
      });
      await recordEngagement({
        itemRef,
        moduleRef: 'shapes-and-patterns',
        signal: { kind: 'rating', rating: feelToRating(feel) },
      });
      onLogged?.();
      onClose();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[vl-drill] save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const belowMin = elapsedSeconds < MIN_REP_SECONDS;
  const title = pattern && keyName
    ? `${pattern.label} in ${keyName}`
    : 'Voice-leading drill';
  const suggestionLabel = sessionTargetSeconds !== undefined
    ? `~${sessionTargetSeconds}s in this session`
    : `~${suggested}s suggested`;
  const description = subCellLabel
    ? `${subCellLabel} · ${suggestionLabel}`
    : suggestionLabel;
  // Display: countdown in setup/running/paused, elapsed in assess.
  const displaySeconds = phase === 'assess' ? elapsedSeconds : remainingSeconds;

  return (
    <Modal
      open
      // Prevent accidental close during running — matches DrillSessionModal.
      onClose={phase === 'running' ? () => {} : handleCancel}
      title={title}
      description={description}
      footer={phase === 'assess' ? (
        <div className="flex items-center justify-end gap-2">
          {onRedo ? (
            <>
              <button
                onClick={handlePrevious}
                disabled={!canGoPrevious}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                title="Go back to the previous pattern"
              >
                Previous
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
                title={canGoNext ? 'Move on to the next pattern' : 'Finish — end the drills and rate this block'}
              >
                {canGoNext ? 'Next' : 'Finish'}
              </button>
              <button
                onClick={handleRedo}
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
                title="Restart this same pattern from the top"
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
            disabled={feel === null || saving || !desc || belowMin}
            className={`px-4 py-1.5 rounded-md text-sm font-medium text-white ${
              feel === null || saving || !desc || belowMin
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
              title="Go back to the previous pattern"
            >
              Previous
            </button>
          )}
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            {onRedo ? (canGoNext ? 'Next' : 'Finish') : 'cancel'}
          </button>
        </div>
      )}
    >
      {!desc ? (
        <div className="text-sm text-neutral-600 dark:text-neutral-300">
          This sub-cell isn't in the built-in voice-leading catalog. Try
          tapping one of the highlighted cells in the grid.
        </div>
      ) : phase !== 'assess' ? (
        <div className="space-y-4 text-sm">
          {/* Target-duration picker + metronome setup (setup phase only) */}
          {phase === 'setup' && (
            <>
              {subCellLabel && (
                <div className="rounded-md border border-fluent/30 bg-fluent/5 p-3 text-xs">
                  <div className="text-[10px] uppercase tracking-wide text-fluent mb-1">
                    Sub-cell
                  </div>
                  <div className="text-neutral-700 dark:text-neutral-200 font-medium">
                    {subCellLabel}
                  </div>
                </div>
              )}
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
          moreTimeLabel="More time on this pattern?"
          onExtend={handleExtendItem}
          notes={notes}
          onNotesChange={setNotes}
          belowMin={belowMin}
        />
      )}
    </Modal>
  );
}
