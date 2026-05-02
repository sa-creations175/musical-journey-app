/**
 * Phase 3 Step 6 — End-of-session summary screen.
 *
 * Replaces the placeholder rendered by ActiveSessionScreen when
 * state.status === 'ended'. Three zones per design Part 8:
 *
 *   Top    (6b) — "Session complete" + total active time + block
 *                 count + one-tap session rating.
 *   Middle (6c) — block list with milestone / quiet delta on the
 *                 right side per block.
 *   Bottom (6d) — affirmation field, free text, optional.
 *
 * Plus 6e — unrated-blocks batch list, 6f–6j — engagement writes,
 * 6k — Done button that persists + reset()s the timer and
 * navigates back.
 *
 * 6b ships the top zone only; subsequent substeps fill in.
 */
import { useState } from 'react';
import {
  useSessionTimer,
  useSessionTimes,
} from '../../lib/sessionTimer/SessionTimerContext';
import { formatActiveTime } from '../../lib/sessionTimer/formatActiveTime';
import type { PracticeSessionRating } from '../../lib/db';

const SESSION_RATING_OPTIONS: ReadonlyArray<{
  value: PracticeSessionRating;
  label: string;
  /** Tailwind classes for the active state. Distinct tones per
   *  design — celebratory / steady / honest, NOT red. */
  activeClass: string;
  inactiveClass: string;
}> = [
  {
    value: 'locked_in',
    label: 'Locked in',
    activeClass: 'bg-amber-500 text-white border-amber-500',
    inactiveClass:
      'border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10',
  },
  {
    value: 'solid',
    label: 'Solid',
    activeClass: 'bg-fluent text-white border-fluent',
    inactiveClass:
      'border-fluent/40 text-fluent hover:bg-fluent/10',
  },
  {
    value: 'going_through_it',
    label: 'Going through it',
    activeClass: 'bg-teal-700 text-white border-teal-700',
    inactiveClass:
      'border-teal-700/40 text-teal-700 dark:text-teal-400 hover:bg-teal-700/10',
  },
];

export default function EndOfSessionSummary() {
  const { state } = useSessionTimer();
  const times = useSessionTimes();

  const [sessionRating, setSessionRating] =
    useState<PracticeSessionRating | null>(null);

  const totalActiveSec = Math.floor(times.activeMs / 1000);
  const completedBlocks = state.blocks.filter(
    b => b.status === 'completed' || b.status === 'skipped',
  ).length;

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <section className="text-center space-y-2">
        <h2 className="text-xl font-medium tracking-tight">Session complete</h2>
        <div className="flex items-center justify-center gap-3 text-sm text-neutral-600 dark:text-neutral-300">
          <span className="font-mono tabular-nums text-base">
            {formatActiveTime(totalActiveSec * 1000)}
          </span>
          <span aria-hidden className="text-neutral-300">·</span>
          <span>
            {completedBlocks} block{completedBlocks === 1 ? '' : 's'}
          </span>
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-neutral-500 text-center">
          How did this session feel?
        </div>
        <div className="flex items-stretch justify-center gap-2">
          {SESSION_RATING_OPTIONS.map(opt => {
            const active = sessionRating === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  setSessionRating(active ? null : opt.value)
                }
                aria-pressed={active}
                className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                  active ? opt.activeClass : opt.inactiveClass
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Middle zone (6c) lands next. */}
      {/* Bottom zone (6d) — affirmation field — lands after that. */}
      {/* Done button (6k) — final substep. */}
    </div>
  );
}
