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
import {
  needsChordsLine,
  sectionFooterLine,
  type SectionChip,
  type SectionChipReading,
} from './sectionChips';

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
  /**
   * The section chips and their counts, read once per list by
   * `readSectionChips`.
   *
   * A READING, NOT A LIST OF CHIPS. The counts under the chips have to
   * agree with the chips themselves, and the only way to guarantee
   * that is for one function to produce both.
   */
  sections: SectionChipReading;
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
  sections,
  onOpen,
}: SongCardProps) {
  void lastPractisedAt;

  const footer = sectionFooterLine(sections);
  const needChords = needsChordsLine(sections);

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

      {/* THE SECTIONS, AS THEY STAND. Two axes per chip — see
          sectionChips.ts. A song with none says so in words: "0 of 0"
          and an empty bar both describe a lead sheet that has not been
          set up as though it were one that had been and scored zero. */}
      {sections.chips.length === 0 ? (
        <div className="text-[11px] text-neutral-400" data-testid="song-card-no-sections">
          No sections in this lead sheet
        </div>
      ) : (
        <div className="flex flex-wrap gap-1" data-testid="song-card-section-chips">
          {sections.chips.map(chip => (
            <SectionChipView key={chip.sectionId} chip={chip} />
          ))}
        </div>
      )}

      {needChords !== null && (
        <div className="text-[11px] text-neutral-500" data-testid="song-card-needs-chords">
          {needChords}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-neutral-500 min-w-0 truncate">
          {footer !== null && (
            <>
              <span data-testid="song-card-section-footer">{footer}</span>
              <span className="text-neutral-400 mx-1">·</span>
            </>
          )}
          {lastPractisedLabel === 'never' ? 'not practised yet' : `last ${lastPractisedLabel}`}
          <span className="text-neutral-400 mx-1">·</span>
          {addedLabel}
        </span>
        <button
          onClick={onOpen}
          className="px-3 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs hover:border-fluent hover:text-fluent"
        >
          open
        </button>
      </div>
    </article>
  );
}

/**
 * One section, drawn as two independent readings.
 *
 * THE BORDER AND THE FILL ARE SET SEPARATELY, from the two fields,
 * with no lookup table of combined states between them. That is the
 * point: a four-state enum would have to name "dashed and practised",
 * and the naming is where such an enum starts deciding that a
 * practised section must have a finished chart.
 *
 * The words are in the tooltip because the chip is a glance surface —
 * six of them fit on a card only as shapes. The `data-` attributes
 * carry the same two facts for tests, so a test asserts the axes
 * rather than a class string.
 */
function SectionChipView({ chip }: { chip: SectionChip }) {
  const fillClass =
    chip.fill === 'passed'
      ? 'bg-mastered/35'
      : chip.fill === 'practised'
        ? 'bg-developing/25'
        : 'bg-transparent';
  const fillWord =
    chip.fill === 'passed'
      ? 'passed'
      : chip.fill === 'practised'
        ? 'in progress'
        : 'not practised';
  return (
    <span
      data-testid="song-card-section-chip"
      data-chart={chip.chartComplete ? 'complete' : 'incomplete'}
      data-fill={chip.fill}
      title={`${chip.name} — ${chip.chartComplete ? 'chords added' : 'chords not added yet'}, ${fillWord}`}
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] max-w-[9rem] truncate border ${
        chip.chartComplete
          ? 'border-solid border-neutral-400 dark:border-neutral-500'
          : 'border-dashed border-neutral-300 dark:border-neutral-600'
      } ${fillClass} text-neutral-600 dark:text-neutral-300`}
    >
      {chip.name}
    </span>
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
