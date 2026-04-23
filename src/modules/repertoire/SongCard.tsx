import type { Song } from '../../lib/db';
import {
  DEFAULT_STAGE,
  FRESHNESS_DOT_CLASS,
  STAGE_BADGE_CLASS,
  STAGE_LABEL,
  type Freshness,
} from './stage';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Human-friendly "added …" label:
 *   0 days   → "added today"
 *   1 day    → "added yesterday"
 *   2–6 days → "added N days ago"
 *   7–29 days → "added a/N weeks ago"
 *   30+ days → absolute "added Oct 2025"
 */
export function formatAddedDate(ts: number): string {
  const days = Math.max(0, Math.floor((Date.now() - ts) / DAY_MS));
  if (days === 0) return 'added today';
  if (days === 1) return 'added yesterday';
  if (days < 7) return `added ${days} days ago`;
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? 'added a week ago' : `added ${weeks} weeks ago`;
  }
  const d = new Date(ts);
  return `added ${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}

interface Props {
  song: Song;
  lastPractisedAt: number | null;
  lastPractisedLabel: string;
  addedLabel: string;
  freshness: Freshness;
  readyToAdvance?: boolean;
  onOpen: () => void;
}

export default function SongCard({
  song,
  lastPractisedAt,
  lastPractisedLabel,
  addedLabel,
  freshness,
  readyToAdvance,
  onOpen,
}: Props) {
  const stage = song.stage ?? DEFAULT_STAGE;
  void lastPractisedAt;

  return (
    <article
      className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 p-3 flex flex-col gap-2 hover:border-fluent/40 transition"
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className={`inline-block w-2 h-2 rounded-full mt-2 shrink-0 ${FRESHNESS_DOT_CLASS[freshness]}`}
          title={`last practised ${lastPractisedLabel}`}
        />
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-tight truncate">{song.title}</div>
          <div className="text-xs text-neutral-500 truncate">{song.artist}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${STAGE_BADGE_CLASS[stage]}`}
        >
          {STAGE_LABEL[stage]}
        </span>
        {readyToAdvance && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 border border-fluent/30 bg-fluent/10 text-fluent"
            title="meets criteria to advance — decide in song detail"
          >
            ✨ ready
          </span>
        )}
        {song.key && (
          <span className="text-neutral-500">
            key <span className="font-mono">{song.key}</span>
            {song.keyNeedsVerification && (
              <span className="ml-1 text-developing" title="key is an estimate — verify with the recording">?</span>
            )}
          </span>
        )}
        {song.tempoLabel && (
          <span className="text-neutral-500">· {song.tempoLabel}</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-neutral-500 min-w-0 truncate">
          {lastPractisedLabel === 'never' ? 'not practised yet' : `last ${lastPractisedLabel}`}
          <span className="text-neutral-400 mx-1">·</span>
          {addedLabel}
        </span>
        <button
          onClick={onOpen}
          className="px-3 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs hover:border-fluent hover:text-fluent"
        >
          open →
        </button>
      </div>
    </article>
  );
}
