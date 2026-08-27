import { useState } from 'react';
import type { SongPracticeLog, SongSection } from '../../lib/db';
import { humanAgo } from './stage';
import { feelEmoji, feelLabel, normaliseFeel, type Feel } from '../../lib/fluencyScale';

interface Props {
  logs: SongPracticeLog[];
  sections: SongSection[];
}

/**
 * The four words, from `fluencyScale`, which is the only definition.
 * This file used to hold its own copy saying "comfortable" where three
 * other files said "Clean".
 *
 * =====================================================================
 * A STORED 5 DISPLAYS AS "IN FLOW". THE 5 IS NOT REWRITTEN.
 *
 * "Breakthrough" was the fifth step of repertoire's old 1–5 scale.
 * Nothing can write one now — both `SongPracticeLog.feelRating` and
 * `DrillSession.feelRating` exclude 5 at the type level — and nothing
 * computes from it: `normaliseFeel` has always folded anything at or
 * above 4 onto 4, so every calculation in the app already treats the
 * scale as four levels.
 *
 * This list was the last surface still printing the fifth word, which
 * put a word on screen that is not one of the four. It now reads those
 * rows through the same `normaliseFeel` everything else uses. The
 * STORED value is untouched — a 5 is still a 5 on disk, and no history
 * was rewritten to change what it displays as.
 * =====================================================================
 */
const FEEL_LABELS: Record<Feel, string> = {
  1: feelLabel(1), 2: feelLabel(2), 3: feelLabel(3), 4: feelLabel(4),
};
const FEEL_EMOJI: Record<Feel, string> = {
  1: feelEmoji(1), 2: feelEmoji(2), 3: feelEmoji(3), 4: feelEmoji(4),
};

/**
 * Chronological practice-session list for a single song. Most recent
 * first. Each row is a one-line summary; clicking expands for notes /
 * sections / keys detail.
 */
export default function PracticeHistory({ logs, sections }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const sectionNameById = new Map(sections.map(s => [s.id, s.name]));

  if (logs.length === 0) {
    return (
      <p className="text-xs text-neutral-500 italic">
        no practice sessions logged yet. tap a cell in the matrix above to start one.
      </p>
    );
  }

  return (
    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
      {logs.map(log => {
        const open = expanded === log.id;
        const date = new Date(log.timestamp);
        // READ THROUGH `normaliseFeel`, which folds a legacy 5 onto 4.
        // The stored row keeps its 5; only what it displays as changes.
        const feel = normaliseFeel(log.feelRating ?? null);
        const sectionNames = log.sectionIds.length === 0
          ? 'whole song'
          : log.sectionIds.map(id => sectionNameById.get(id) ?? id).join(', ');
        return (
          <div key={log.id} className="py-2">
            <button
              onClick={() => setExpanded(open ? null : log.id)}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              <div className="flex items-center gap-2 text-sm flex-wrap min-w-0">
                <span className="text-neutral-500 tabular-nums">
                  {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                <span className="text-neutral-400">·</span>
                <span className="font-mono tabular-nums">{log.durationMin}m</span>
                <span className="text-neutral-400">·</span>
                <span className="text-neutral-700 dark:text-neutral-200 truncate">
                  {sectionNames}
                </span>
                {log.keys.length > 0 && (
                  <>
                    <span className="text-neutral-400">·</span>
                    <span className="text-neutral-500 font-mono">{log.keys.join(' · ')}</span>
                  </>
                )}
                {/* Absent when the session was logged without a
                    rating — the fast path. Shown as nothing rather
                    than as a neutral face, which would read as "it
                    was OK" for a session the user never judged. */}
                {feel !== null && (
                  <span aria-hidden title={FEEL_LABELS[feel]}>{FEEL_EMOJI[feel]}</span>
                )}
              </div>
              <span className="text-[11px] text-neutral-400">
                {humanAgo(log.timestamp)}
              </span>
            </button>
            {open && (
              <div className="mt-2 ml-1 pl-3 border-l-2 border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
                <div>
                  <span className="text-neutral-500">feel:</span>{' '}
                  {feel === null ? 'not rated' : FEEL_LABELS[feel]}
                </div>
                {log.atTargetTempo && (
                  <div className="text-fluent">marked as at-or-near target tempo</div>
                )}
                {log.notes && (
                  <div className="whitespace-pre-wrap italic">{log.notes}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
