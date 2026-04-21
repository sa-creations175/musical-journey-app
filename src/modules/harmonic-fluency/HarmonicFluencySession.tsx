import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AttemptRecord } from '../../lib/db';
import { updateDailySummary } from '../../lib/dailySummaries';
import ScaleDegreeCompass from './ScaleDegreeCompass';
import LinearScaleStrip from './LinearScaleStrip';
import { degreeNote, parseKeyRoot } from './catalog';
import type { Flashcard, FlashcardCategory } from './catalog';
import { recordAttempt, toggleFlag } from './spacedRepetition';

const MODULE_ID = 'harmonic-fluency';
const FADE_STREAK_THRESHOLD = 5;

export type DisplayMode = 'text' | 'number-grid' | 'keyboard';
export type TimerMode = 'off' | '5' | '10' | '15';

interface Props {
  queue: Flashcard[];
  displayMode: DisplayMode;
  timerMode: TimerMode;
  onExit: (stats: SessionStats) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
}

export interface SessionStats {
  total: number;
  correct: number;
  categoryStreaks: Partial<Record<FlashcardCategory, number>>;
}

interface CardOutcome {
  card: Flashcard;
  chosen: string | null;
  correct: boolean;
  timedOut: boolean;
}

export default function HarmonicFluencySession({
  queue,
  displayMode,
  timerMode,
  onExit,
  onDisplayModeChange,
}: Props) {
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Array<CardOutcome | undefined>>(
    () => queue.map(() => undefined),
  );
  const [streaks, setStreaks] = useState<Map<FlashcardCategory, number>>(new Map());
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  const timerRef = useRef<number | null>(null);
  const card = queue[index];
  const currentOutcome = outcomes[index];
  const hasAnswered = currentOutcome !== undefined;
  const chosen = currentOutcome?.chosen ?? null;
  const timerSecs = timerMode === 'off' ? null : parseInt(timerMode, 10);
  const isLast = index === queue.length - 1;
  const answeredCount = outcomes.filter(o => o !== undefined).length;

  // --- Per-card flag state --------------------------------------------
  const flagged = useLiveQuery(async () => {
    const state = card ? await db.flashcardStates.get(card.id) : undefined;
    return !!state?.isFlagged;
  }, [card?.id]) ?? false;

  // --- Category-fade visual aid logic --------------------------------
  const fadedCategories = useMemo(() => {
    const s = new Set<FlashcardCategory>();
    streaks.forEach((count, cat) => {
      if (count >= FADE_STREAK_THRESHOLD) s.add(cat);
    });
    return s;
  }, [streaks]);

  const choices = useMemo(() => {
    if (!card) return [];
    const opts = [card.correctAnswer, ...card.decoys];
    // Deterministic per-card shuffle so Previous shows the same order.
    let h = 0;
    for (let i = 0; i < card.id.length; i++) h = (h * 31 + card.id.charCodeAt(i)) | 0;
    return [...opts].sort((a, b) => {
      const ah = ((a.charCodeAt(0) || 0) + h) % 97;
      const bh = ((b.charCodeAt(0) || 0) + h) % 97;
      return ah - bh;
    });
  }, [card]);

  // --- Timer lifecycle ------------------------------------------------
  useEffect(() => {
    // Fresh card shown: restart the clock only for unanswered cards.
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (timerSecs !== null && card && !hasAnswered) {
      setTimeLeft(timerSecs);
    } else {
      setTimeLeft(null);
    }
  }, [index, card, timerSecs, hasAnswered]);

  useEffect(() => {
    if (timeLeft === null || hasAnswered || !card) return;
    if (timeLeft <= 0) {
      handleAnswer(null, true);
      return;
    }
    timerRef.current = window.setTimeout(() => setTimeLeft(t => (t === null ? null : t - 1)), 1000);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, hasAnswered, card]);

  async function handleAnswer(choice: string | null, timedOut = false) {
    if (hasAnswered || !card) return;
    const isCorrect = !timedOut && choice === card.correctAnswer;

    const record: AttemptRecord = {
      moduleId: MODULE_ID,
      itemId: card.id,
      correct: isCorrect,
      timestamp: Date.now(),
    };
    await db.attempts.add(record);
    await recordAttempt(card.id, isCorrect);
    await updateDailySummary(MODULE_ID);

    setOutcomes(prev => {
      const next = [...prev];
      next[index] = { card, chosen: choice, correct: isCorrect, timedOut };
      return next;
    });
    setStreaks(prev => {
      const next = new Map(prev);
      const cur = next.get(card.category) ?? 0;
      next.set(card.category, isCorrect ? cur + 1 : 0);
      return next;
    });
    // NB: no auto-advance — user taps Next manually.
  }

  function handleNext() {
    if (isLast) {
      setDone(true);
    } else {
      setIndex(i => i + 1);
    }
  }
  function handlePrev() {
    if (index > 0) setIndex(i => i - 1);
  }

  async function handleToggleFlag() {
    if (!card) return;
    await toggleFlag(card.id);
  }

  function handleEnd() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    onExit({
      total: answeredCount,
      correct: outcomes.filter(o => o?.correct).length,
      categoryStreaks: Object.fromEntries(streaks) as Partial<Record<FlashcardCategory, number>>,
    });
  }

  // --- Keyboard shortcuts --------------------------------------------
  // Refs so the handler reads the latest values without having to be
  // re-registered on every render.
  const shortcutRef = useRef({
    hasAnswered,
    canPrev: index > 0,
    choices,
    done,
  });
  shortcutRef.current = { hasAnswered, canPrev: index > 0, choices, done };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt) {
        const tag = tgt.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (tgt.isContentEditable) return;
      }
      if (shortcutRef.current.done) return;

      switch (e.key) {
        case 'ArrowRight':
        case ' ': {
          if (shortcutRef.current.hasAnswered) {
            e.preventDefault();
            handleNext();
          }
          break;
        }
        case 'ArrowLeft': {
          if (shortcutRef.current.canPrev) {
            e.preventDefault();
            handlePrev();
          }
          break;
        }
        case 'f':
        case 'F': {
          e.preventDefault();
          handleToggleFlag();
          break;
        }
        case '1':
        case '2':
        case '3':
        case '4': {
          if (!shortcutRef.current.hasAnswered) {
            const optIdx = parseInt(e.key, 10) - 1;
            const opt = shortcutRef.current.choices[optIdx];
            if (opt !== undefined) {
              e.preventDefault();
              handleAnswer(opt);
            }
          }
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (done) {
    return (
      <SummaryCard
        outcomes={outcomes.filter((o): o is CardOutcome => o !== undefined)}
        onExit={handleEnd}
      />
    );
  }

  if (!card) {
    return (
      <div className="rounded-card border border-neutral-200 dark:border-neutral-800 p-6 text-center text-sm text-neutral-500">
        no cards to practice.
      </div>
    );
  }

  const isFaded = fadedCategories.has(card.category);
  const showVisual = displayMode !== 'text' && !isFaded;

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-neutral-500">
            card <span className="font-mono tabular-nums">{index + 1}</span> / {queue.length}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-neutral-400">
            {card.categoryName}
          </span>
          <span className="text-neutral-400">
            cards this session: <span className="font-mono tabular-nums">{answeredCount}</span> / {queue.length}
          </span>
          {timeLeft !== null && !hasAnswered && (
            <span className={`font-mono tabular-nums ${timeLeft <= 3 ? 'text-needswork' : 'text-neutral-500'}`}>
              {timeLeft}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleFlag}
            aria-label={flagged ? 'unflag card' : 'flag card for later'}
            title={flagged ? 'flagged — click to remove' : 'flag for later (F)'}
            className={`text-lg leading-none ${
              flagged ? 'text-developing' : 'text-neutral-300 hover:text-developing'
            }`}
          >
            {flagged ? '★' : '☆'}
          </button>
          <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-[10px]">
            {(['text', 'number-grid', 'keyboard'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => onDisplayModeChange(mode)}
                className={`px-2 py-0.5 rounded-md transition ${
                  displayMode === mode
                    ? 'bg-fluent text-white'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                {mode === 'text' ? 'text' : mode === 'number-grid' ? 'grid' : 'keyboard'}
              </button>
            ))}
          </div>
          <button onClick={handleEnd} className="text-neutral-500 hover:text-fluent">
            end session
          </button>
        </div>
      </div>

      {/* Question */}
      <div className="text-center">
        <p className="text-base sm:text-lg font-medium">{card.question}</p>
      </div>

      {/* Visual aid */}
      {showVisual && <VisualAid card={card} answered={hasAnswered} chosen={chosen} />}

      {/* Choices — shows numeric hint so users know which key selects what */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {choices.map((opt, i) => {
          const isCorrect = opt === card.correctAnswer;
          const isChosen = opt === chosen;
          let cls = 'px-4 py-3 rounded-lg border text-sm transition text-left inline-flex items-center gap-2';
          if (!hasAnswered) {
            cls += ' border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent cursor-pointer';
          } else if (isCorrect) {
            cls += ' border-fluent bg-fluent/10 text-fluent';
          } else if (isChosen) {
            cls += ' border-needswork bg-needswork/10 text-needswork';
          } else {
            cls += ' border-neutral-200 dark:border-neutral-700 opacity-50';
          }
          return (
            <button
              key={opt}
              onClick={() => handleAnswer(opt)}
              disabled={hasAnswered}
              className={cls}
            >
              <span className="font-mono text-[10px] text-neutral-400 w-3 text-right shrink-0">
                {i + 1}
              </span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>

      {/* Feedback */}
      {hasAnswered && (
        <div className="space-y-2">
          <div className="text-sm">
            {chosen === card.correctAnswer ? (
              <span className="text-fluent font-medium">✓ correct</span>
            ) : chosen === null ? (
              <span className="text-needswork font-medium">× timed out</span>
            ) : (
              <span className="text-needswork font-medium">× not quite</span>
            )}
            {chosen !== card.correctAnswer && (
              <span className="ml-3 text-xs text-neutral-500">
                correct answer: <span className="font-mono text-fluent">{card.correctAnswer}</span>
              </span>
            )}
            {card.explanation && (
              <div className="mt-1 text-xs text-neutral-500 italic">{card.explanation}</div>
            )}
          </div>
        </div>
      )}

      {isFaded && displayMode !== 'text' && (
        <p className="text-[11px] text-neutral-400 italic text-center">
          visuals faded — you're on a streak in this category. miss one and they'll return.
        </p>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-neutral-200 dark:border-neutral-800">
        <button
          onClick={handlePrev}
          disabled={index === 0}
          className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs hover:border-fluent hover:text-fluent disabled:opacity-40 disabled:cursor-not-allowed"
          title="previous card (←)"
        >
          ← previous
        </button>
        <div className="text-[10px] text-neutral-400 hidden sm:block">
          shortcuts: <span className="font-mono">1–4</span> answer ·
          <span className="font-mono ml-1">space</span>/<span className="font-mono">→</span> next ·
          <span className="font-mono ml-1">←</span> previous ·
          <span className="font-mono ml-1">F</span> flag
        </div>
        <button
          onClick={handleNext}
          disabled={!hasAnswered}
          className={`px-4 py-1.5 rounded-md text-sm font-medium ${
            hasAnswered
              ? 'bg-fluent text-white hover:opacity-90'
              : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
          }`}
          title={isLast ? 'finish session (space / →)' : 'next card (space / →)'}
        >
          {isLast ? 'finish →' : 'next →'}
        </button>
      </div>
    </section>
  );
}

// --- Visual aid dispatcher -------------------------------------------
// Dispatch is keyed on card.category so each question type gets the
// visualization that actually teaches its skill:
//   · scale-degree-math / named-notes / reverse-key-pivots → linear
//     strip with stepwise counting (interval labels revealed after
//     answer so users count in their head first).
//   · diatonic-qualities / modes → plain compass, no arc — just a
//     reference layout of the 7 degrees.
//   · everything else → text-only (no visual).

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
        // Show the full scale's note names above each degree so the
        // user can read off the answer by counting.
        const root = parseKeyRoot(hint.key);
        const labels: Partial<Record<number, string>> = {};
        for (let d = 1; d <= 7; d++) labels[d] = degreeNote(root, d);
        degreeLabels = labels;
      } else if (card.category === 'reverse-key-pivots') {
        // Only the starting note is known up front; the tonic name
        // (= the correct answer) reveals after submission.
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

// --- Summary ---------------------------------------------------------

function SummaryCard({
  outcomes,
  onExit,
}: {
  outcomes: CardOutcome[];
  onExit: () => void;
}) {
  const total = outcomes.length;
  const correct = outcomes.filter(o => o.correct).length;
  const acc = total === 0 ? 0 : Math.round((correct / total) * 100);
  const byCategory = new Map<FlashcardCategory, { total: number; correct: number; name: string }>();
  for (const o of outcomes) {
    const cat = byCategory.get(o.card.category) ?? {
      total: 0, correct: 0, name: o.card.categoryName,
    };
    cat.total += 1;
    if (o.correct) cat.correct += 1;
    byCategory.set(o.card.category, cat);
  }
  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-5 space-y-4">
      <h2 className="text-lg font-medium tracking-tight">session complete</h2>
      <div className="flex items-baseline gap-4 text-sm flex-wrap">
        <span>
          <span className="text-neutral-500">answered: </span>
          <span className="font-mono">{total}</span>
        </span>
        <span>
          <span className="text-neutral-500">correct: </span>
          <span className="font-mono text-fluent">{correct}</span>
        </span>
        <span>
          <span className="text-neutral-500">accuracy: </span>
          <span className="font-mono">{acc}%</span>
        </span>
      </div>
      <div className="space-y-1.5 text-xs">
        {[...byCategory.entries()].map(([cat, stats]) => (
          <div key={cat} className="flex items-center justify-between">
            <span className="text-neutral-500">{stats.name}</span>
            <span className="font-mono">{stats.correct}/{stats.total}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onExit}
        className="px-4 py-2 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
      >
        done
      </button>
    </section>
  );
}
