import { useState } from 'react';
import type { SongCell } from '../../../lib/db';
import MetronomeControl from '../../../components/MetronomeControl';
import {
  isInTempoRange,
  projectConsecutiveCleanCount,
  type AttemptDraft,
} from './cellRollup';

/**
 * The cell test — one section, one key, at tempo.
 *
 * ---------------------------------------------------------------
 * THE CELL GRAIN, AND ONLY THE CELL GRAIN.
 *
 * Three clean run-throughs at tempo, in a row, make THIS section in
 * THIS key comfortable. The two claims about the whole song in a key —
 * "Test song" and "run at tempo" — stay on `KeyRow` and are not
 * reachable from here. See the note at the top of `CellPanel`: a cell
 * cannot honestly speak for a song, and offering it the chance to
 * would put whole-song runs in the per-section table where nothing
 * downstream could tell them apart again.
 * ---------------------------------------------------------------
 *
 * THE STREAK PERSISTS ON THE CELL, unlike the whole-song test which
 * restarts at 0/3 every time it opens. That asymmetry is deliberate
 * and predates this panel: the whole-song test is a graduation and has
 * to be assembled in one sitting, while a cell is ordinary work that
 * accumulates. So this opens at whatever the cell already holds.
 *
 * TEMPO IS OPTIONAL, and a blank field is a run with no tempo rather
 * than a run that cannot be recorded. Below the floor, an attempt is
 * logged honestly and is simply not gate-relevant — a slow warm-up
 * pass is a different activity, not a failed test — which is why it
 * neither advances the streak nor resets it.
 */

interface Props {
  elapsed: string;
  cell: SongCell;
  performanceTempo: number | null;
  busy: boolean;
  onOpenLeadSheet: () => void;
  onCancel: () => void;
  onFinish: (attempts: AttemptDraft[], markComfortable: boolean) => void;
}

export default function TestStep({
  elapsed, cell, performanceTempo, busy,
  onOpenLeadSheet, onCancel, onFinish,
}: Props) {
  const [attempts, setAttempts] = useState<AttemptDraft[]>([]);
  const [bpmInput, setBpmInput] = useState<string>(
    performanceTempo === null ? '' : String(performanceTempo),
  );

  const parsedBpm = parseInt(bpmInput, 10);
  const hasBpm = Number.isFinite(parsedBpm) && parsedBpm > 0;
  // Blank is allowed. Only a negative or unparseable entry is
  // rejected, and only by refusing to add the attempt.
  const bpmValid = bpmInput.trim() === '' || hasBpm;

  const projected = projectConsecutiveCleanCount(
    cell.consecutiveCleanCount,
    attempts,
    performanceTempo,
  );
  const alreadyComfortable = cell.cellState === 'comfortable';
  const canMarkComfortable = !alreadyComfortable && projected >= 3;

  const add = (wasClean: boolean) => {
    if (!bpmValid) return;
    setAttempts(prev => [...prev, {
      id: `attempt-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`,
      bpm: hasBpm ? parsedBpm : null,
      wasClean,
    }]);
  };

  return (
    <div className="px-4 pb-4 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-mono tabular-nums text-3xl text-neutral-900 dark:text-neutral-50">
          {elapsed}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          on this song
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* The same control practice uses. A test is where a click
            matters most — "clean at tempo" is the claim being made —
            and a second, smaller metronome would be a second thing to
            keep in step with the first. */}
        <MetronomeControl />
      </div>

      <StreakLine
        projected={projected}
        alreadyComfortable={alreadyComfortable}
        performanceTempo={performanceTempo}
      />

      <AttemptList
        attempts={attempts}
        performanceTempo={performanceTempo}
        onDelete={id => setAttempts(prev => prev.filter(a => a.id !== id))}
      />

      <div className="space-y-1.5">
        <label className="block text-[11px] text-neutral-600 dark:text-neutral-300">
          Tempo for the next run <span className="text-neutral-400">(optional)</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={bpmInput}
            onChange={e => setBpmInput(e.target.value)}
            placeholder="bpm"
            aria-label="Tempo in bpm"
            className={`w-20 px-2 py-1.5 rounded-md border bg-transparent text-sm text-neutral-800 dark:text-neutral-100 ${
              bpmValid
                ? 'border-neutral-200 dark:border-neutral-700'
                : 'border-needswork'
            }`}
          />
          <button
            type="button"
            onClick={() => add(true)}
            disabled={!bpmValid}
            className="flex-1 px-3 py-1.5 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90 disabled:opacity-40"
          >
            clean
          </button>
          <button
            type="button"
            onClick={() => add(false)}
            disabled={!bpmValid}
            className="flex-1 px-3 py-1.5 rounded-md border border-needswork text-needswork text-xs font-medium hover:bg-needswork/10 disabled:opacity-40"
          >
            not clean
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenLeadSheet}
        className="w-full px-3 py-3 rounded-lg bg-info text-white text-sm font-medium hover:opacity-90"
      >
        Open lead sheet
      </button>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          title="Stops the timer and records nothing."
          className="px-3 py-2 text-xs text-neutral-500 hover:text-needswork"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onFinish(attempts, false)}
          className="ml-auto px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 text-sm hover:border-fluent disabled:opacity-40"
        >
          Save runs
        </button>
        {!alreadyComfortable && (
          <button
            type="button"
            disabled={busy || !canMarkComfortable}
            onClick={() => onFinish(attempts, true)}
            title={canMarkComfortable
              ? undefined
              : 'Three clean runs in a row at tempo enables this.'}
            className="px-3 py-2 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:opacity-90 disabled:opacity-40"
          >
            Mark comfortable
          </button>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------

/**
 * Where the streak stands, counting the work rather than the rule.
 *
 * Says `2 of 3 clean runs in a row` rather than a bare fraction, for
 * the reason the criteria panel was rewritten: a count with no unit
 * reads as a count of rules satisfied. It also names the tempo floor,
 * because an attempt below it counts for nothing and a user watching
 * the number not move deserves to know why.
 */
function StreakLine({
  projected, alreadyComfortable, performanceTempo,
}: {
  projected: number;
  alreadyComfortable: boolean;
  performanceTempo: number | null;
}) {
  if (alreadyComfortable) {
    return (
      <p className="text-[11px] text-neutral-600 dark:text-neutral-300">
        This section is already comfortable in this key. Runs logged here
        still count toward the whole-song test on the row.
      </p>
    );
  }
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100">
        {projected} of 3 clean runs in a row
      </p>
      <p className="text-[11px] text-neutral-500 leading-snug">
        {performanceTempo === null
          ? 'No performance tempo set for this song, so every run counts.'
          : `At or above ${performanceTempo - 10} bpm counts. Slower runs are logged, but neither advance the count nor reset it.`}
      </p>
    </div>
  );
}

/** The runs logged this sitting. Nothing is written until Save. */
function AttemptList({
  attempts, performanceTempo, onDelete,
}: {
  attempts: ReadonlyArray<AttemptDraft>;
  performanceTempo: number | null;
  onDelete: (id: string) => void;
}) {
  if (attempts.length === 0) {
    return (
      <p className="text-[11px] text-neutral-400">
        No runs logged yet this sitting.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {attempts.map((a, i) => {
        const counts = isInTempoRange(a.bpm, performanceTempo);
        return (
          <li
            key={a.id}
            className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-200"
          >
            <span className="text-neutral-400 w-4 tabular-nums">{i + 1}</span>
            <span className={a.wasClean ? 'text-fluent' : 'text-needswork'}>
              {a.wasClean ? 'clean' : 'not clean'}
            </span>
            <span className="text-neutral-500 tabular-nums">
              {a.bpm === null ? 'no tempo' : `${a.bpm} bpm`}
            </span>
            {!counts && (
              <span
                className="text-[10px] text-neutral-400"
                title="Below the tempo floor, so it neither advances the count nor resets it."
              >
                below floor
              </span>
            )}
            <button
              type="button"
              onClick={() => onDelete(a.id)}
              aria-label={`Remove run ${i + 1}`}
              className="ml-auto text-neutral-400 hover:text-needswork"
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
