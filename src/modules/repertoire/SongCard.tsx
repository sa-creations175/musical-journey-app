import type { Song } from '../../lib/db';
import type { SongDueReading } from './songDueState';
import { spellKey, type Spelling } from '../../lib/spelling';
import {
  FRESHNESS_DOT_CLASS,
  STAGE_BADGE_CLASS,
  STAGE_LABEL,
  type Freshness,
} from './stage';
import type { RepertoireStage } from '../../lib/db';

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

export interface SongCardProps {
  song: Song;
  lastPractisedAt: number | null;
  lastPractisedLabel: string;
  addedLabel: string;
  freshness: Freshness;
  readyToAdvance?: boolean;
  /** The DERIVED stage, passed in rather than read off the song. The
   *  song row carries a watermark of the last derivation, and a card
   *  reading that directly would show a stale rung for one paint after
   *  a key lapsed. One derivation per list, shared. */
  stage: RepertoireStage;
  /**
   * Re-proving still available on this song, or null when there is
   * none. Rolled up once per list by `songDueReading` — see its header
   * for why an OVERDUE key is not in here.
   */
  due: SongDueReading | null;
  /** How the due keys are named back. Per song, resolved by the list. */
  spelling: Spelling;
  onOpen: () => void;
}

export default function SongCard({
  song,
  lastPractisedAt,
  lastPractisedLabel,
  addedLabel,
  freshness,
  readyToAdvance,
  stage,
  due,
  spelling,
  onOpen,
}: SongCardProps) {
  void lastPractisedAt;

  return (
    <article
      className="rounded-lg border border-black/[0.07] bg-white/80 dark:bg-neutral-900/80 p-3 flex flex-col gap-2 hover:border-fluent/40 transition"
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
        {/* THE GRID'S OWN WORDS. `KeyRow` has rendered `due` and
            `soon` against these states since 3d-0a, in these colours.
            A card saying "needs a retest" would be a second name for a
            fact the matrix already names, and two names for one fact
            is how a reader starts wondering whether they are two. */}
        {due !== null && <DueChip due={due} spelling={spelling} />}
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

/**
 * What is due, and in which key.
 *
 * Names the KEY, not just the fact. "due" alone sends you to the song
 * page to find out which row to tap; the key name is the thing you act
 * on, and it is one word. With more than one, the count carries the
 * rest rather than a list that would not fit a card.
 */
function DueChip({ due, spelling }: { due: SongDueReading; spelling: Spelling }) {
  const keys = due.state === 'due' ? due.dueKeys : due.soonKeys;
  const first = spellKey(keys[0].key.keyName, spelling);
  const extra = keys.length - 1;
  const label = due.state === 'due' ? 'due' : 'soon';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${
        due.state === 'due'
          ? 'border-[#E88943]/40 bg-[#E88943]/10 text-[#E88943]'
          : 'border-neutral-200 dark:border-neutral-700 text-neutral-500'
      }`}
      title={due.state === 'due'
        ? 'due to be proven again'
        : 'due soon'}
    >
      {label} · key of {first}{extra > 0 ? ` +${extra}` : ''}
    </span>
  );
}
