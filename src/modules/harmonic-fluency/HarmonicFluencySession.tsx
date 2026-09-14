/**
 * HarmonicFluency thin wrapper around the generic FlashcardSession.
 *
 * The module-specific bits live here: the visual-aid dispatcher
 * (LinearScaleStrip / ScaleDegreeCompass), the explanation linkifier
 * (`CardExplanation`), and the persistence pipeline (db.attempts +
 * recordEngagement + dailySummary).
 * Generic UI behavior (queue, timer, choices, streaks, summary,
 * shortcuts) is in src/lib/flashcards/FlashcardSession.tsx.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import type { AttemptRecord } from '../../lib/db';
import { addAttempt } from '../../lib/practiceWrites';
import { elapsedFields, timedOutFields } from '../../lib/attemptTiming';
import { updateDailySummary } from '../../lib/dailySummaries';
import ScaleDegreeCompass from './ScaleDegreeCompass';
import LinearScaleStrip from './LinearScaleStrip';
import { degreeNote, parseKeyRoot } from './catalog';
import { respellProgressionCard } from './catalogExpansions';
import { respellRow } from '../../lib/progressionRow';
import { useProgressionSpelling } from '../../lib/progressionSpelling';
import type { Flashcard, FlashcardCategory } from './catalog';
import {
  getCardSpacingMany, setReviewFlag, toggleStudyLater,
} from '../../lib/flashcards/cardSpacing';
import { recordEngagement } from '../../lib/spacingState';
import LydianChordRows from './LydianChordRows';
import DegreeGroundedRows from './DegreeGroundedRows';
import CardPlayback from './CardPlayback';
import DegreeNoteReveal from './DegreeNoteReveal';
import ModalScaleReveal from './ModalScaleReveal';
import DegreeKeyboardAnswer from './DegreeKeyboardAnswer';
import BuiltAnswer from './builtAnswers/BuiltAnswer';
import CardExplanation from './CardExplanation';
import { degreeNoteOptionLabel, isPressedCard, parsePressedId } from './degreeNoteCards';
import DegreeKeyboard, { degreeKeyboardSpec } from './DegreeKeyboard';
import { qualityOfCardId } from './scaleDegreeQualityCards';
import ChordQualitiesChart from '../../components/ChordQualitiesChart';
import { diatonicCell } from './diatonicCell';
import FlashcardSession, {
  type CardAnsweredArgs,
  type FlashcardSessionStats,
  type TimerMode,
} from '../../lib/flashcards/FlashcardSession';

const MODULE_ID = 'harmonic-fluency';

export type DisplayMode = 'text' | 'number-grid' | 'keyboard';
export type { TimerMode };

interface Props {
  queue: Flashcard[];
  displayMode: DisplayMode;
  timerMode: TimerMode;
  onExit: (stats: SessionStats) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
  /** True when the user has explicitly narrowed the pool (flagged-only
      or hand-picked categories) and the queue has fewer than 4 unique
      cards. In that case the attempt still logs to the DB (so daily
      goal, streaks, and the calendar work normally), but we skip the
      spacing engagement so a tight drill can't push easy cards further
      out. */
  focusProtected?: boolean;
}

export interface SessionStats {
  total: number;
  correct: number;
  categoryStreaks: Partial<Record<FlashcardCategory, number>>;
}

const VISUAL_MODES = [
  { id: 'text', label: 'Text' },
  { id: 'number-grid', label: 'Grid' },
  { id: 'keyboard', label: 'Keyboard' },
] as const;

export default function HarmonicFluencySession({
  queue,
  displayMode,
  timerMode,
  onExit,
  onDisplayModeChange,
  focusProtected = false,
}: Props) {
  // ONE SPELLING EVERYWHERE — the chip that filters to this card, the
  // grid row that drills it and the question itself. The deck is baked
  // at module load, so the setting reaches it here.
  const [rowSpelling] = useProgressionSpelling();
  // Flag state — live query over the spacing rows for the cards in
  // queue. The shell consumes a Set<string> of flagged ids for ★
  // (study-later) and a separate set + note map for 🚩 (review meta).
  const flagState = useLiveQuery(async () => {
    const rows = await getCardSpacingMany(queue.map(c => c.id));
    const star = new Set<string>();
    const review = new Set<string>();
    const notes = new Map<string, string>();
    for (const [cardId, row] of rows) {
      if (row.studyLater) star.add(cardId);
      if (row.reviewFlagged) {
        review.add(cardId);
        if (row.reviewFlagNote) notes.set(cardId, row.reviewFlagNote);
      }
    }
    return { star, review, notes };
  }, [queue]) ?? { star: new Set<string>(), review: new Set<string>(), notes: new Map<string, string>() };

  const flaggedIds = flagState.star;
  const reviewFlaggedIds = flagState.review;
  const reviewFlagNotes = flagState.notes;

  async function handleCardAnswered({
    card,
    choice,
    correct,
    timestamp,
    targetSeconds,
    timedOut,
    shownAt,
  }: CardAnsweredArgs<Flashcard>) {
    const record: AttemptRecord = {
      moduleId: MODULE_ID,
      itemId: card.id,
      correct,
      timestamp,
      ...(focusProtected ? { excludeFromFluency: true } : {}),
      ...(targetSeconds !== undefined ? { targetSeconds } : {}),
      // Silent measurement — nothing reads either of these yet. The
      // clock starts when the card renders, which for a written
      // flashcard is when it becomes answerable.
      ...elapsedFields(shownAt, timestamp),
      ...timedOutFields(timedOut),
      // The option the reader picked, as TEXT — these decoys are
      // generated values and name no card, so this is deliberately not
      // `chosenItemId`. See the two fields' declarations.
      //
      // Omitted when `choice` is null, which is the shell's timeout
      // answer: no option was picked, and `timedOut` already says so.
      ...(choice !== null ? { chosenAnswerText: choice } : {}),
    };
    await addAttempt(record);
    // FOCUS PROTECTION MOVED, IT DID NOT DISAPPEAR.
    //
    // It used to gate the SM-2 write while `recordEngagement` ran
    // regardless — so a tight drill was protected on the scheduler
    // nothing read and unprotected on the one that decided when cards
    // actually came back. With the SM-2 write gone, leaving the gate
    // where it was would have left the flag doing nothing at all for
    // scheduling, which is a feature deleted by omission rather than a
    // refactor.
    //
    // So the gate is on the real engine now, which is what it always
    // meant: a hand-picked or flagged-only queue does not push its
    // cards further out. The attempt row is still written either way —
    // the rep happened, and daily goals, streaks and the calendar all
    // count it — and `excludeFromFluency` above still keeps it out of
    // the fluency score. Only the schedule sits out.
    if (!focusProtected) {
      await recordEngagement({
        itemRef: card.id,
        moduleRef: MODULE_ID,
        signal: { kind: 'attempt', correct },
        timestamp,
      });
    }
    await updateDailySummary(MODULE_ID);
  }

  function handleStatsExit(stats: FlashcardSessionStats) {
    onExit({
      total: stats.total,
      correct: stats.correct,
      categoryStreaks: stats.categoryStreaks as Partial<Record<FlashcardCategory, number>>,
    });
  }

  return (
    <FlashcardSession<Flashcard>
      queue={queue}
      timerMode={timerMode}
      onExit={handleStatsExit}
      onCardAnswered={handleCardAnswered}
      flaggedIds={flaggedIds}
      onToggleFlag={async cardId => {
        await toggleStudyLater(cardId);
      }}
      reviewFlaggedIds={reviewFlaggedIds}
      reviewFlagNotes={reviewFlagNotes}
      onSetReviewFlag={async (cardId, flagged, note) => {
        await setReviewFlag(cardId, flagged, note);
      }}
      visualMode={displayMode}
      visualModes={VISUAL_MODES}
      onVisualModeChange={mode => onDisplayModeChange(mode as DisplayMode)}
      renderVisualAid={({ card, mode, answered, chosen }) => (
        <VisualAid card={card} mode={mode} answered={answered} chosen={chosen} />
      )}
      /* ONE RENDERER FOR THE FAMILY. Mode names become links, and a
         key signature's accidentals take the colours the keyboard
         gives them — see `CardExplanation`, which decides which
         treatment a card gets from its `axis` rather than from its
         sentence. */
      renderExplanation={(text, card) => (
        <CardExplanation
          text={respellProgressionCard(card, rowSpelling)?.explanation ?? text}
          card={card}
        />
      )}
      /* THE QUESTION, RE-SPELLED. A progression card's question holds
         the row — "The 1-5-6m-4 in the key of F major is _____" — and
         the deck was built before the reader's spelling setting was
         read. Null on every other card, which falls through to the
         baked question. */
      renderQuestion={card => respellProgressionCard(card, rowSpelling)?.question ?? null}
      /* WHAT AN OPTION READS AS, where this deck knows more than the
         shell's spelling rule does — a note answer carries the key a
         player would actually press beside it, and a degree answer
         carries both of its names. Null everywhere else, which falls
         through to `glossTheoreticalSpellings` unchanged. */
      renderOptionLabel={(card, option) => (
        /* THE OPTIONS ARE THE ANSWER KEY and stay canonical — the
           session grades by comparing the tapped string to
           `correctAnswer` and writes it to the attempt row — so they
           are re-joined on the way to the eye rather than rebuilt.
           `respellRow` splits on the canonical middle dot, which no
           chord name contains. */
        card.category === 'progressions'
          ? respellRow(option, rowSpelling)
          : degreeNoteOptionLabel(card.id, option)
      )}
      renderFooter={(card, { answered }) => (
        <CardReference card={card} answered={answered} />
      )}
      /* THE KEYBOARD IN PLACE OF THE FOUR BUTTONS, on the pressed cards
         and nowhere else. Returning null everywhere else is what lets
         one family answer two ways without a second session component
         — see `renderAnswerSurface`. */
      renderAnswerSurface={({ card, answered, chosen, answer }) => (
        isPressedCard(card.id)
          ? (
            <DegreeKeyboardAnswer
              card={card}
              answered={answered}
              chosen={chosen}
              answer={answer}
            />
          )
          // SIX FAMILIES BUILD THEIR ANSWER INSTEAD OF PICKING IT.
          // `builtTargetFor` returns null for every other card, which
          // leaves the four buttons — see `renderAnswerSurface`'s own
          // note on returning null.
          : <BuiltAnswer card={card} answered={answered} answer={answer} />
      )}
      focusProtected={focusProtected}
    />
  );
}

// ---------------------------------------------------------------------
// Visual aid dispatcher — TWO AXES, and it used to read only one.
//
// Down the page, the CATEGORY chooses which visualization teaches the
// skill:
//   · scale-degree-math / named-notes / reverse-key-pivots → linear
//     strip with stepwise counting (interval labels revealed after
//     answer so users count in their head first).
//   · diatonic-qualities / modes → plain compass, no arc — just a
//     reference layout of the 7 degrees.
//   · everything else → text-only (no visual).
//
// Across it, the MODE chooses what those are drawn on. `keyboard` draws
// them on keys; `number-grid` draws them on the strip or the compass.
// The mode was handed in from the start and never read, which is why
// the keyboard toggle switched on and changed nothing — see
// `DegreeKeyboard.tsx`. `text` never gets here: `FlashcardSession`
// drops the visual aid entirely in that mode.
// ---------------------------------------------------------------------

function VisualAid({
  card,
  mode,
  answered,
  chosen,
}: {
  card: Flashcard;
  mode: string;
  answered: boolean;
  chosen: string | null;
}) {
  const hint = card.visualHint;
  if (!hint) return null;

  // ON KEYS, for every category that has a visual aid at all. The
  // keyboard reads the same hint the strip and the compass read, so
  // this is one branch rather than one per category — a category whose
  // aid is a compass has nothing different to say on a keyboard.
  if (mode === 'keyboard') {
    const spec = degreeKeyboardSpec(card, answered, chosen === card.correctAnswer);
    return spec === null
      ? null
      : <DegreeKeyboard spec={spec} keyLabel={hint.key} />;
  }

  switch (card.category) {
    // `degree-notes` here is THE F♯ CARD AND NOTHING ELSE. The
    // generated family carries no `visualHint` at all — it reveals
    // through `DegreeNoteReveal` — so the guard at the top of this
    // function already dropped every one of them before the switch.
    // The one survivor kept the hint it was written with, and this is
    // what draws it. See `F_SHARP_SURVIVOR` in `catalog.ts`.
    case 'scale-degree-math':
    case 'degree-notes': {
      if (hint.startingDegree === undefined) return null;

      let degreeLabels: Partial<Record<number, string>> | undefined;

      if (card.category === 'degree-notes' && hint.key) {
        const root = parseKeyRoot(hint.key);
        const labels: Partial<Record<number, string>> = {};
        for (let d = 1; d <= 7; d++) labels[d] = degreeNote(root, d);
        degreeLabels = labels;
      }

      return (
        <div className="flex justify-center">
          <LinearScaleStrip
            startingDegree={hint.startingDegree}
            destinationDegree={hint.destinationDegree}
            direction={hint.direction}
            distance={hint.distance}
            answered={answered}
            correct={chosen === card.correctAnswer}
            degreeLabels={degreeLabels}
          />
        </div>
      );
    }

    case 'diatonic-qualities':
    case 'modes': {
      if (hint.startingDegree === undefined) return null;
      return (
        <div className="flex justify-center">
          <ScaleDegreeCompass
            startingDegree={hint.startingDegree}
            showArc={false}
            size={180}
          />
        </div>
      );
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------
// Reference — NOT a visual aid, and the distinction is the point.
//
// `renderVisualAid` is gated twice in FlashcardSession: it disappears
// once you are on a streak in the category, and it is off entirely in
// `text` display mode. Both are correct for a TRAINING WHEEL, which is
// what that seam is for — a scaffold should retreat as you improve.
//
// A reference is the opposite kind of thing. The maj7♯11 rows are not
// an easier way to answer "what chord says Lydian"; they are the shape
// the answer names, and they should be readable on the hundredth
// correct answer as on the first. They are also not one of three
// renderings of the same content — they are content the card has never
// carried.
//
// So they render through `renderFooter`, which sits outside both gates.
// ---------------------------------------------------------------------

/** Which cards carry the chord rows, and which key each opens on. */
const LYDIAN_CHORD_CARDS: Readonly<Record<string, string | undefined>> = {
  // "The signature chord that says 'Lydian'" — no key of its own, so
  // it opens on the first of each quadrant.
  'mo-15': undefined,
  // "Lydian mode starts on which scale degree?" — the explanation is
  // about F Lydian, so row one opens on F. That single parameter is
  // the only difference between the two cards.
  'mo-3': 'F',
};

function CardReference({ card, answered }: { card: Flashcard; answered: boolean }) {
  // Reveal-side only. Before answering, the rows would hand over the
  // ♯11 the card is asking about — and, for a degree card, would spell
  // the answer out in four keys.
  if (!answered) return null;
  /**
   * DIATONIC CHORD QUALITIES REVEALS THE CHART, on every card (Silas,
   * 13 Sep 2026): opened on the card's own cell, so the card at the top
   * already reads the chord just answered, with the other modes folded.
   * A REFERENCE, so it sits in this ungated footer and stays on a streak.
   */
  const cell = diatonicCell(card);
  if (cell !== null) {
    return <ChordQualitiesChart select={cell} modesFolded framed />;
  }
  if (card.id in LYDIAN_CHORD_CARDS) {
    const openWith = LYDIAN_CHORD_CARDS[card.id];
    return <LydianChordRows {...(openWith ? { openWith } : {})} />;
  }
  const degree = qualityOfCardId(card.id);
  if (degree !== null) {
    return (
      <>
        <DegreeGroundedRows
          startDegree={degree.startDegree}
          quality={degree.quality}
          direction={degree.direction}
        />
        <CardPlayback card={card} />
      </>
    );
  }
  /**
   * THE WRITTEN DEGREE-AND-NOTE CARDS, once they have been answered:
   * where the note sits and what it sounds like.
   *
   * NOT ON THE PRESSED ONE. There the keyboard was the question, it is
   * already on screen with the answer marked on it, and a second board
   * underneath would be the same picture twice.
   */
  const pair = isPressedCard(card.id) ? null : parsePressedId(card.id);
  if (pair !== null) {
    return (
      <DegreeNoteReveal root={pair.root} degreeId={pair.degreeId} card={card} />
    );
  }
  /**
   * MODAL IMPROVISATION DRAWS ITS ANSWER SCALE, then plays it.
   *
   * The only family whose explanation names something on screen — "the
   * highlighted notes are the ones C major does not have" — so it is
   * the only one that has to put something there. See
   * `ModalScaleReveal`, which renders the play control itself.
   */
  if (card.category === 'modal-improvisation') {
    return <ModalScaleReveal card={card} />;
  }
  /**
   * EVERY OTHER FAMILY THAT HAS A SOUND (ruling 33).
   *
   * Slash chords, the little progressions, the pentatonics, the
   * major/minor key relations and the enharmonic pairs all reach here,
   * and the control decides for itself whether there is anything to
   * play — a card that has not said what it is about renders nothing.
   * So this is one line rather than a second switch on category beside
   * the one in `cardAudio`.
   */
  return <CardPlayback card={card} />;
}
