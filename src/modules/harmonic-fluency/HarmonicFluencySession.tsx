/**
 * HarmonicFluency thin wrapper around the generic FlashcardSession.
 *
 * The module-specific bits live here: the visual-aid dispatcher
 * (LinearScaleStrip / ScaleDegreeCompass), the explanation linkifier
 * (ModeLinkify), and the persistence pipeline (db.attempts +
 * db.flashcardStates SR layer + recordEngagement + dailySummary).
 * Generic UI behavior (queue, timer, choices, streaks, summary,
 * shortcuts) is in src/lib/flashcards/FlashcardSession.tsx.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AttemptRecord } from '../../lib/db';
import { updateDailySummary } from '../../lib/dailySummaries';
import ScaleDegreeCompass from './ScaleDegreeCompass';
import LinearScaleStrip from './LinearScaleStrip';
import { degreeNote, parseKeyRoot } from './catalog';
import type { Flashcard, FlashcardCategory } from './catalog';
import { recordAttempt, toggleFlag } from './spacedRepetition';
import { setReviewFlag } from '../../lib/flashcards/spacedRepetition';
import { recordEngagement } from '../../lib/spacingState';
import ModeLinkify from '../ear-training/scales-modes/ModeLinkify';
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
      SM-2 update so a tight drill can't push easy cards further out. */
  focusProtected?: boolean;
}

export interface SessionStats {
  total: number;
  correct: number;
  categoryStreaks: Partial<Record<FlashcardCategory, number>>;
}

const VISUAL_MODES = [
  { id: 'text', label: 'text' },
  { id: 'number-grid', label: 'grid' },
  { id: 'keyboard', label: 'keyboard' },
] as const;

export default function HarmonicFluencySession({
  queue,
  displayMode,
  timerMode,
  onExit,
  onDisplayModeChange,
  focusProtected = false,
}: Props) {
  // Flag state — live query over db.flashcardStates for the cards in
  // queue. The shell consumes a Set<string> of flagged ids for ★
  // (study-later) and a separate set + note map for 🚩 (review meta).
  const flagState = useLiveQuery(async () => {
    const ids = queue.map(c => c.id);
    const states = await db.flashcardStates.where('cardId').anyOf(ids).toArray();
    const star = new Set<string>();
    const review = new Set<string>();
    const notes = new Map<string, string>();
    for (const s of states) {
      if (s.isFlagged) star.add(s.cardId);
      if (s.flagged) {
        review.add(s.cardId);
        if (s.flagNote) notes.set(s.cardId, s.flagNote);
      }
    }
    return { star, review, notes };
  }, [queue]) ?? { star: new Set<string>(), review: new Set<string>(), notes: new Map<string, string>() };

  const flaggedIds = flagState.star;
  const reviewFlaggedIds = flagState.review;
  const reviewFlagNotes = flagState.notes;

  async function handleCardAnswered({
    card,
    correct,
    timestamp,
    targetSeconds,
  }: CardAnsweredArgs<Flashcard>) {
    const record: AttemptRecord = {
      moduleId: MODULE_ID,
      itemId: card.id,
      correct,
      timestamp,
      ...(focusProtected ? { excludeFromFluency: true } : {}),
      ...(targetSeconds !== undefined ? { targetSeconds } : {}),
    };
    await db.attempts.add(record);
    await recordEngagement({
      itemRef: card.id,
      moduleRef: MODULE_ID,
      signal: { kind: 'attempt', correct },
      timestamp,
    });
    if (!focusProtected) {
      await recordAttempt(card.id, correct);
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
        await toggleFlag(cardId);
      }}
      reviewFlaggedIds={reviewFlaggedIds}
      reviewFlagNotes={reviewFlagNotes}
      onSetReviewFlag={async (cardId, flagged, note) => {
        await setReviewFlag(cardId, flagged, note);
      }}
      visualMode={displayMode}
      visualModes={VISUAL_MODES}
      onVisualModeChange={mode => onDisplayModeChange(mode as DisplayMode)}
      renderVisualAid={({ card, answered, chosen }) => (
        <VisualAid card={card} answered={answered} chosen={chosen} />
      )}
      renderExplanation={text => <ModeLinkify text={text} />}
      focusProtected={focusProtected}
    />
  );
}

// ---------------------------------------------------------------------
// Visual aid dispatcher — keyed on card.category so each question type
// gets the visualization that actually teaches its skill:
//   · scale-degree-math / named-notes / reverse-key-pivots → linear
//     strip with stepwise counting (interval labels revealed after
//     answer so users count in their head first).
//   · diatonic-qualities / modes → plain compass, no arc — just a
//     reference layout of the 7 degrees.
//   · everything else → text-only (no visual).
// ---------------------------------------------------------------------

function VisualAid({
  card,
  answered,
  chosen,
}: {
  card: Flashcard;
  answered: boolean;
  chosen: string | null;
}) {
  const hint = card.visualHint;
  if (!hint) return null;

  switch (card.category) {
    case 'scale-degree-math':
    case 'named-notes':
    case 'reverse-key-pivots': {
      if (hint.startingDegree === undefined) return null;

      let degreeLabels: Partial<Record<number, string>> | undefined;
      let degreeLabelsAfterAnswer: Partial<Record<number, string>> | undefined;

      if (card.category === 'named-notes' && hint.key) {
        const root = parseKeyRoot(hint.key);
        const labels: Partial<Record<number, string>> = {};
        for (let d = 1; d <= 7; d++) labels[d] = degreeNote(root, d);
        degreeLabels = labels;
      } else if (card.category === 'reverse-key-pivots') {
        if (hint.startingNote) {
          degreeLabels = { [hint.startingDegree]: hint.startingNote };
        }
        degreeLabelsAfterAnswer = { 1: parseKeyRoot(card.correctAnswer) };
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
            degreeLabelsAfterAnswer={degreeLabelsAfterAnswer}
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
