import type { Song } from '../../lib/db';
import {
  DEFAULT_STAGE,
  FRESHNESS_DOT_CLASS,
  STAGE_BADGE_CLASS,
  STAGE_LABEL,
  type Freshness,
} from './stage';

interface Props {
  song: Song;
  lastPractisedAt: number | null;
  lastPractisedLabel: string;
  freshness: Freshness;
  onOpen: () => void;
}

export default function SongCard({
  song,
  lastPractisedAt,
  lastPractisedLabel,
  freshness,
  onOpen,
}: Props) {
  const stage = song.stage ?? DEFAULT_STAGE;
  void lastPractisedAt; // reserved for future "you haven't touched this in…" prompts

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
        <span className="text-[11px] text-neutral-500">
          {lastPractisedLabel === 'never' ? 'not practised yet' : `last practised ${lastPractisedLabel}`}
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
