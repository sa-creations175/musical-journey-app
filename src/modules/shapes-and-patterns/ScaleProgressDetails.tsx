import { useState } from 'react';
import type { DrillHand, DrillSession } from '../../lib/db';
import { bandVerdictLabel, type BandVerdict } from '../../lib/spacing/banding';
import ProgressTrackerBand from '../../components/moduleHome/ProgressTrackerBand';
import {
  cellTime, formatAgo, formatDuration, type HandProgress,
} from './handProgress';

/**
 * Everything about one cell, standing under the grid.
 *
 * =====================================================================
 * IT IS A SECTION, NOT A POP-UP, AND THAT IS THE POINT.
 *
 * Tapping a cell used to open a modal: the grid went away, you read one
 * square's story through a window, and you closed it to get back. So
 * comparing two cells meant opening and closing two windows, and the
 * thing you were comparing them against — the grid — was hidden while
 * you did it.
 *
 * This stands below the grid and fills. The grid never moves, and the
 * page scrolls the band to the top so the answer is where you are
 * looking.
 *
 * The band is the app's own dark green `ProgressTrackerBand`, the same
 * one every other module's detail section uses.
 *
 * =====================================================================
 * WHAT THE LOGS DO NOT SHOW, AND WHY IT IS ABSENT RATHER THAN GUESSED.
 *
 * A run's TEMPO and the SITTING IT CAME FROM are not recorded on a
 * drill row. The tempo could be read off the metronome's current
 * setting and the sitting matched by timestamp — both would be a guess
 * wearing a join, wrong the moment two runs land in the same second and
 * unfalsifiable once on screen. So each run shows what was recorded:
 * its rating, its length and when it was.
 * =====================================================================
 */

const HAND_LABEL: Readonly<Record<DrillHand, string>> = {
  left: 'Left hand',
  right: 'Right hand',
  both: 'Both hands',
};

const DRILL_LABEL: Readonly<Record<DrillHand, string>> = {
  left: 'Drill left hand',
  right: 'Drill right hand',
  both: 'Drill both hands',
};

const FEEL_WORD: Record<number, string> = {
  1: 'Struggled', 2: 'Working on it', 3: 'Clean', 4: 'In flow',
};

interface Props {
  /** The cell's name, or null when none has been picked. */
  cellLabel: string | null;
  hands: ReadonlyArray<HandProgress>;
  /** The cell's own status — the roll-up of the counted hands. */
  verdict: BandVerdict;
  /** Which rule produced it, in the word the control uses. */
  ruleWord: 'furthest' | 'lowest';
  /** Which hands are out of the score, by hand. */
  notCounted: ReadonlySet<DrillHand>;
  onToggleCounted: (hand: DrillHand) => void;
  onDrill: (hand: DrillHand) => void;
  now: number;
  ref?: React.Ref<HTMLDivElement>;
}

export default function ScaleProgressDetails({
  cellLabel, hands, verdict, ruleWord, notCounted, onToggleCounted,
  onDrill, now, ref,
}: Props) {
  const [openHand, setOpenHand] = useState<DrillHand | null>(null);
  const [editing, setEditing] = useState(false);

  const counted = hands.filter(h => !notCounted.has(h.hand));
  const { practiceSeconds, testSeconds } = cellTime(counted);

  return (
    <div className="space-y-2">
      <ProgressTrackerBand
        ref={ref}
        data-testid="scale-progress-details"
        label="Progress Details"
        right={cellLabel ?? undefined}
      />

      {cellLabel === null ? (
        <p className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 px-3 py-6 text-center text-xs text-neutral-500">
          Pick a cell above and everything about it shows up here.
        </p>
      ) : (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700">
          <div className="flex items-baseline gap-3 px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
            <span className="text-sm font-medium">{cellLabel}</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => { setEditing(e => !e); setOpenHand(null); }}
              className="text-[11px] text-neutral-500 hover:text-fluent underline underline-offset-2"
            >
              {editing ? 'Done' : 'Edit what counts'}
            </button>
          </div>

          {editing && (
            <p className="px-3 py-2 text-[11px] leading-snug text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900/40">
              <b>Edit what counts.</b> Click a hand to take it out of this
              cell&rsquo;s score, or put it back. Nothing is deleted — it stops
              counting.
            </p>
          )}

          {/* THE ROLL-UP, AND THE TIME BEHIND IT. Both read the hands
              still counted, so the status and the number under it
              cannot describe different sets. */}
          <p className="px-3 py-2 text-xs leading-snug text-neutral-700 dark:text-neutral-200">
            Reads <b>{bandVerdictLabel(verdict)}</b> — the {ruleWord} of the{' '}
            <b>{counted.length}</b> hand{counted.length === 1 ? '' : 's'} still
            counted. <b>Total time</b> {formatDuration(practiceSeconds + testSeconds)}{' '}
            ({formatDuration(practiceSeconds)} practice, {formatDuration(testSeconds)} testing).
            Two octaves, always.
          </p>

          <div className="px-2 pb-2 space-y-1">
            {hands.map(h => {
              const out = notCounted.has(h.hand);
              const open = openHand === h.hand && !editing;
              return (
                <div key={h.hand}>
                  <button
                    type="button"
                    onClick={() => {
                      if (editing) { onToggleCounted(h.hand); return; }
                      setOpenHand(open ? null : h.hand);
                    }}
                    className={[
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs',
                      'hover:bg-neutral-50 dark:hover:bg-neutral-900/40',
                      out ? 'opacity-55' : '',
                    ].join(' ')}
                  >
                    <span aria-hidden className="text-[9px] text-neutral-400 w-2">
                      {open ? '▾' : '▸'}
                    </span>
                    <span className="font-medium w-24 shrink-0">{HAND_LABEL[h.hand]}</span>
                    <span className="shrink-0">{bandVerdictLabel(h.verdict)}</span>
                    <span className="flex-1 min-w-0 text-[11px] text-neutral-500 truncate">
                      <b>Total time</b>{' '}
                      {formatDuration(h.practiceSeconds + h.testSeconds)} (
                      {formatDuration(h.practiceSeconds)} practice,{' '}
                      {formatDuration(h.testSeconds)} testing)
                      {h.lastPracticedAt !== null && (
                        <> · <b>Last practiced</b> {formatAgo(h.lastPracticedAt, now)}</>
                      )}
                    </span>
                    {out && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 shrink-0">
                        not counted
                      </span>
                    )}
                  </button>

                  {open && (
                    <div className="ml-6 mb-2 space-y-2">
                      {/* THE DRILL BUTTON SITS ABOVE THE LOGS. What you
                          came to do, before the history of having done
                          it. */}
                      <button
                        type="button"
                        onClick={() => onDrill(h.hand)}
                        className="px-3 py-1.5 rounded-lg bg-fluent text-white text-xs font-medium hover:opacity-90"
                      >
                        {DRILL_LABEL[h.hand]}
                      </button>
                      <RunLog title="Practice runs" runs={h.practiceRuns} now={now} />
                      <RunLog title="Test runs" runs={h.testRuns} now={now} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** One log, newest first. */
function RunLog({ title, runs, now }: {
  title: string;
  runs: ReadonlyArray<DrillSession>;
  now: number;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
        {title}
      </div>
      {runs.length === 0 ? (
        <p className="text-[11px] text-neutral-400">None yet.</p>
      ) : (
        <div className="space-y-0.5">
          {runs.map((r, i) => (
            <div key={r.id} className="flex items-baseline gap-2 text-[11px]">
              <span className="font-mono text-neutral-400 w-6 shrink-0">
                #{runs.length - i}
              </span>
              <span className="font-medium">
                {r.feelRating ? FEEL_WORD[r.feelRating] : 'Not rated'}
              </span>
              <span className="text-neutral-500">
                {formatDuration(r.durationSeconds)} · {formatAgo(r.timestamp, now)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
