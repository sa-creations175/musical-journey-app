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
import { moduleMetaById } from '../../lib/moduleMeta';
import type { PracticeSessionRating } from '../../lib/db';
import type { SessionBlock } from '../../lib/sessionTimer/types';

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

      <BlockList blocks={state.blocks} />

      {/* Bottom zone (6d) — affirmation field — lands next. */}
      {/* Done button (6k) — final substep. */}
    </div>
  );
}

// ---------------------------------------------------------------------
// Middle zone — block list (6c)
// ---------------------------------------------------------------------

function BlockList({ blocks }: { blocks: ReadonlyArray<SessionBlock> }) {
  // Skip pending blocks (the user ended the session before reaching
  // them) — the summary records what happened, not what was planned.
  const finished = blocks.filter(
    b => b.status === 'completed' || b.status === 'skipped',
  );

  if (finished.length === 0) {
    return (
      <p className="text-center text-xs italic text-neutral-500">
        No blocks completed.
      </p>
    );
  }

  return (
    <section className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">
        What you did
      </div>
      <ul className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden divide-y divide-neutral-200 dark:divide-neutral-800">
        {finished.map(block => (
          <BlockRow key={block.id} block={block} />
        ))}
      </ul>
    </section>
  );
}

function BlockRow({ block }: { block: SessionBlock }) {
  const meta = moduleMetaById(block.moduleRef);
  const accent = meta?.accentHex ?? '#4a9088';
  const moduleLabel = meta?.label ?? block.moduleRef;

  const activeMin = Math.floor(block.activeMs / 60_000);
  const activeSec = Math.floor((block.activeMs % 60_000) / 1000);
  const durationLabel =
    activeMin > 0
      ? activeSec > 0
        ? `${activeMin}m ${activeSec}s`
        : `${activeMin}m`
      : `${activeSec}s`;

  // 6f–6i compute milestone / delta strings as they fire engagement
  // writes; the result will be threaded onto the block (or a side
  // table keyed by block id) for display here. For now, the right-
  // hand side is intentionally blank when nothing notable happened
  // — the design says "milestone OR quiet delta OR nothing."
  const rightAnnotation: string | null = null;

  return (
    <li className="flex items-center gap-3 px-3 py-2 bg-white dark:bg-neutral-900">
      <span
        aria-hidden
        className="inline-block w-1 self-stretch rounded-sm shrink-0"
        style={{ backgroundColor: accent }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className="text-[10px] uppercase tracking-wider font-medium shrink-0"
            style={{ color: accent }}
          >
            {moduleLabel}
          </span>
          <span className="text-sm text-neutral-800 dark:text-neutral-100 truncate">
            {block.label ?? block.moduleRef}
          </span>
        </div>
        <div className="text-[11px] text-neutral-500">
          {durationLabel}
          {block.status === 'skipped' && ' · skipped'}
          {block.rating && (
            <>
              {' · '}
              <span className="capitalize">{block.rating}</span>
            </>
          )}
        </div>
      </div>
      {rightAnnotation && (
        <div className="text-[11px] text-neutral-600 dark:text-neutral-300 shrink-0 max-w-[40%] text-right">
          {rightAnnotation}
        </div>
      )}
    </li>
  );
}
