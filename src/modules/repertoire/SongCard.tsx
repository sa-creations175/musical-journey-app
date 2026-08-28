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
  /**
   * Past this song's practice window for its rung — see
   * `practiceWindowPrefs`. Separate from `retest`: a song can be
   * neglected without any claim having decayed.
   */
  /** Sections on the lead sheet with no chords charted. Drives the
   *  one line that says a chart is unfinished. */
  sectionsNeedingChords: number;
  practiceStale: boolean;
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
  sectionsNeedingChords,
  practiceStale,
  onOpen,
  onOpenLeadSheet,
  accentHex,
  dragHandle,
}: SongCardProps) {
  void lastPractisedAt;

  const suffix = retestSuffix(retest);

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
              ? 'Due to Be Proven Again'
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

      {/* THE ONE PLACE THE APP SAYS A LEAD SHEET IS UNFINISHED.
          It went out with the section chips and came back on its own
          merits: it is about CHORDS, not about the retired cell state,
          and charting is what now moves a cell to Started — so this
          points at the next thing worth doing. Fed by the shared chord
          reader, so it cannot disagree with the matrix about which
          sections are charted. */}
      {sectionsNeedingChords > 0 && (
        <div
          // IT READS AS AN ACTION, NOT AS METADATA. It was
          // `text-neutral-500` at 11px — lighter than the "not
          // practised yet" line below it, which is a fact rather than
          // a job, so the only thing on the card that says what to do
          // next was the quietest thing on it.
          //
          // `text-info` is the app's non-grading informational colour,
          // and it is the same token the Started tile is painted in —
          // which is what charting produces. So the card's prompt and
          // the state it leads to are the same colour, and neither can
          // be mistaken for a grade.
          className="text-[11px] font-medium text-info"
          data-testid="song-card-needs-chords"
        >
          {sectionsNeedingChords} section{sectionsNeedingChords === 1 ? '' : 's'} still{' '}
          {sectionsNeedingChords === 1 ? 'needs' : 'need'} chords
        </div>
      )}

      {/* THE LINE THAT SAYS WHEN. The section footer beside it counted
          sections "passed" and "in progress" from the retired
          `cellState`, so it went with the chips — the matrix states the
          band in every key, which is the same fact told properly. */}
      <div className="mt-auto">
        {/* AMBER MEANS NEGLECTED, and only ever that. The badge above
            carries whether the RUNG still stands; this line carries
            whether the song has been played. Two facts, two places, so
            "needs attention" cannot come to mean both at once. */}
        <CardSubLine
          testId="song-card-last-practised"
          className={practiceStale ? 'text-developing' : 'text-neutral-500'}
        >
          <span data-stale={practiceStale ? 'true' : 'false'}>
            {lastPractisedLabel === 'never' ? 'not practised yet' : `last ${lastPractisedLabel}`}
          </span>
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

