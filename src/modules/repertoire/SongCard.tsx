import type { ReactNode } from 'react';
import {
  CARD_ACTION_LABEL,
  CardActions,
  CardShell,
  CardSubLine,
  CardTitleBlock,
  cardTint,
} from '../../components/moduleHome/cardShell';
import type { Song } from '../../lib/db';
import { retestSuffix, type SongRetestState } from './songRetestState';
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
  /** The DERIVED stage, passed in rather than read off the song. The
   *  song row carries a watermark of the last derivation, and a card
   *  reading that directly would show a stale rung for one paint after
   *  a key lapsed. One derivation per list, shared. */
  stage: RepertoireStage;
  /**
   * What the badge adds to the rung — due, overdue, or nothing.
   *
   * Rolled up once per list by `songRetestState`, which is where the
   * rule that a LEARNING song never shows one lives.
   */
  retest: SongRetestState | null;
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
  /** Opens this song's chart. The same page as `onOpen`, arriving at
   *  the lead sheet rather than at the top. */
  onOpenLeadSheet: () => void;
  /** The module accent, so a song card is tinted the way every other
   *  module's cards are. Resolved by the list from `moduleMeta`. */
  accentHex: string;
  /**
   * The grip that reorders the list, or nothing.
   *
   * A SLOT, because only learning-order mode can be reordered and only
   * the list knows which mode it is in. It rides the title line rather
   * than a rail beside the card: in a grid there is no left-hand gutter
   * to put one in.
   */
  dragHandle?: ReactNode;
}

export default function SongCard({
  song,
  lastPractisedAt,
  lastPractisedLabel,
  addedLabel,
  freshness,
  stage,
  retest,
  sections,
  onOpen,
  onOpenLeadSheet,
  accentHex,
  dragHandle,
}: SongCardProps) {
  void lastPractisedAt;

  const suffix = retestSuffix(retest);
  const footer = sectionFooterLine(sections);
  const needChords = needsChordsLine(sections);

  return (
    <CardShell accentHex={accentHex} data-song-id={song.id}>
      {/* THE TINTED HEADER, the same one every module home draws — the
          title block is a written two lines, so a long song title
          cannot move the boundary under it. */}
      <div
        className="px-3 pt-3 pb-2"
        style={{ backgroundColor: cardTint(accentHex) }}
      >
        <CardTitleBlock
          trailing={(
            <span
              aria-hidden
              className={`float-right ml-2 mt-1.5 inline-block w-2 h-2 rounded-full ${FRESHNESS_DOT_CLASS[freshness]}`}
              title={`last practised ${lastPractisedLabel}`}
            />
          )}
        >
          {dragHandle}
          <span className="font-medium text-sm leading-5">{song.title}</span>
        </CardTitleBlock>
        <CardSubLine testId="song-card-artist">{song.artist}</CardSubLine>
      </div>

      {/* The body grows, so a stretched row's slack lands inside the
          card rather than as a pale strip beneath it. */}
      <div className="px-3 pb-2 pt-2 grow flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        {/* THE RUNG AND ITS CURRENCY, IN ONE BADGE. A rung is a claim
            that needs re-proving, and "Comfortable" alone reads as a
            settled fact. It used to be two pills — the rung, then a
            separate chip naming the key that was due — which let a
            reader take the rung in without taking in whether it still
            stood. One pill cannot be half-read. */}
        <span
          data-testid="song-card-stage"
          data-retest={retest?.state ?? 'held'}
          // THE RUNG'S OWN COLOUR, in every state. The suffix carries
          // what is different; recolouring the badge would be a second
          // encoding of the same fact, and the one colour the app
          // already means "due" by (#E88943, DemotionNotice's) sits so
          // close to `developing` that a Comfortable badge would barely
          // move. If this should shout louder, that is a call to make
          // looking at it.
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${STAGE_BADGE_CLASS[stage]}`}
          title={retest === null
            ? undefined
            : retest.state === 'due'
              ? 'due to be proven again'
              : 'past grace — this rung has dropped'}
        >
          {STAGE_LABEL[stage]}
          {suffix !== null && (
            <>
              <span aria-hidden className="opacity-50">·</span>
              <span data-testid="song-card-retest">{suffix}</span>
            </>
          )}
        </span>
        {/* THE "✨ ready" BADGE IS GONE, and it was never once seen.
            It rendered when the criteria for leaving the current rung
            were all met — but `deriveStage` returns the FIRST rung whose
            criteria are not all met, so for the derived stage this card
            is handed, "all met" is false by construction. Meeting the
            criteria IS the promotion now; there has been nothing to be
            ready for since the advance button was deleted.

            Nothing replaces it. `StageCriteriaPanel` on the song page
            already shows which criteria are outstanding, which is the
            question this badge was gesturing at. */}
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

      {/* THE FOOTER, AND THE LINE THAT SAYS WHEN. Kept as two reserved
          sub-lines so a song with no sections and a song with six split
          at the same height — the same rule the category card follows
          for its own optional line. */}
      <div className="mt-auto">
        <CardSubLine testId="song-card-section-footer">
          {footer}
        </CardSubLine>
        <CardSubLine testId="song-card-last-practised">
          {lastPractisedLabel === 'never' ? 'not practised yet' : `last ${lastPractisedLabel}`}
          <span className="text-neutral-400 mx-1">·</span>
          {addedLabel}
        </CardSubLine>
      </div>
      </div>

      {/* THE SAME TWO BUTTONS EVERY CARD CARRIES. No Progress Detail:
          the matrix on the song page IS this song's progress detail,
          and the button beside Open is the one place a reader would
          look for the chart. */}
      <div className="px-3 pb-3">
        <CardActions
          accentHex={accentHex}
          primary={{
            label: CARD_ACTION_LABEL,
            onClick: onOpen,
            testId: 'song-card-open',
          }}
          secondary={{
            label: 'Lead Sheet',
            onClick: onOpenLeadSheet,
            testId: 'song-card-lead-sheet',
          }}
        />
      </div>
    </CardShell>
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
