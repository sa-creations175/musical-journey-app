import { useState } from 'react';
import {
  barSegments, progressBarExplanation, tickStrip, tickStripLabel,
  type TickAttempt,
} from '../lib/progressBar';

/**
 * The one progress bar. Three segments, and a strip of the reps behind
 * them.
 *
 * ---------------------------------------------------------------
 * ONE RENDERER, RATED OR NOT.
 *
 * There is no empty state and no second code path. An unrated item is
 * the same three segments with grey still present, because "you have
 * not finished proving this yet" and "you got some of these wrong" are
 * different facts that were sharing a colour and a shape.
 *
 * Every width comes from `barSegments`, so width and colour cannot
 * disagree — which is exactly what they did before: accuracy drove the
 * width while tier drove the colour, and below five attempts the tier
 * was `untouched`, so four right answers painted an 80%-wide grey bar.
 * ---------------------------------------------------------------
 *
 * THE BAR NEVER FADES. Only ticks do. If everything dims, nothing
 * reads as dimmed.
 */

interface Props {
  /** Attempts in the rolling window, newest FIRST. The strip's order is
   *  part of its meaning. */
  attempts: ReadonlyArray<TickAttempt>;
  /** The item's own spacing interval, which each tick's age is measured
   *  against. */
  intervalDays: number;
  /** Passed in rather than read from the clock, so a render is pure and
   *  a test needs no fake timer. */
  now: number;
  /** Names the item for a screen reader — "Perfect 5th ascending". */
  label: string;
}

export default function ProgressBar({ attempts, intervalDays, now, label }: Props) {
  const [infoOpen, setInfoOpen] = useState(false);
  const correct = attempts.filter(a => a.correct).length;
  const seg = barSegments({ correct, wrong: attempts.length - correct });
  const ticks = tickStrip(attempts, now, intervalDays);
  const stripText = tickStripLabel(ticks);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <div
          className="flex-1 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden flex"
          role="progressbar"
          aria-valuenow={seg.correctPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={
            `${label}: ${correct} right, ${attempts.length - correct} wrong`
            + (seg.rated
              ? ''
              : `, ${seg.denominator - seg.attempted} more to be rated`)
          }
        >
          <div className="h-full bg-fluent" style={{ width: `${seg.correctPct}%` }} />
          <div className="h-full bg-developing" style={{ width: `${seg.wrongPct}%` }} />
          {/* Grey is drawn, not left as track, so its meaning is a
              segment with a width rather than an absence. */}
          <div
            className="h-full bg-neutral-200 dark:bg-neutral-700"
            style={{ width: `${seg.pendingPct}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => setInfoOpen(o => !o)}
          aria-expanded={infoOpen}
          aria-label="What do the colours mean?"
          className={`shrink-0 w-4 h-4 rounded-full border text-[9px] leading-none ${
            infoOpen
              ? 'border-fluent bg-fluent text-white'
              : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:border-fluent hover:text-fluent'
          }`}
        >
          i
        </button>
      </div>

      {/* The strip carries what the bar cannot: a sequence, and how old
          each rep is. So it gets its own text equivalent. */}
      <div className="flex gap-[2px]" role="img" aria-label={stripText}>
        {ticks.map(t => (
          <span
            key={t.index}
            className={`h-1.5 flex-1 rounded-[1px] ${
              t.correct === null
                ? 'bg-neutral-200 dark:bg-neutral-700'
                : t.correct ? 'bg-fluent' : 'bg-developing'
            }`}
            style={{ opacity: t.opacity }}
            data-tick={t.index}
            data-outcome={t.correct === null ? 'empty' : t.correct ? 'right' : 'wrong'}
          />
        ))}
      </div>

      {infoOpen && (
        <div className="rounded-md border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900 px-2.5 py-2 space-y-1.5">
          {progressBarExplanation(intervalDays).map(line => (
            <p key={line} className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
