import { useState } from 'react';
import type { SongPracticeLog, SongSection } from '../../lib/db';
import { humanAgo } from './stage';

interface Props {
  logs: SongPracticeLog[];
  sections: SongSection[];
}

const FEEL_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'struggled',
  2: 'working on it',
  3: 'comfortable',
  4: 'in flow',
  5: 'breakthrough',
};
const FEEL_EMOJI: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '😓', 2: '🧗', 3: '🙂', 4: '🎶', 5: '✨',
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
        no practice sessions logged yet. click "log a practice session" to start the record.
      </p>
    );
  }

  return (
    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
      {logs.map(log => {
        const open = expanded === log.id;
        const date = new Date(log.timestamp);
        const feel = log.feelRating;
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
                <span aria-hidden title={FEEL_LABELS[feel]}>{FEEL_EMOJI[feel]}</span>
              </div>
              <span className="text-[11px] text-neutral-400">
                {humanAgo(log.timestamp)}
              </span>
            </button>
            {open && (
              <div className="mt-2 ml-1 pl-3 border-l-2 border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
                <div>
                  <span className="text-neutral-500">feel:</span> {FEEL_LABELS[feel]}
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
