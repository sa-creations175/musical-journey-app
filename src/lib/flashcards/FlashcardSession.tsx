/**
 * Generic 4-choice flashcard session shell.
 *
 * Lifted from HarmonicFluencySession so other modules (e.g. Production
 * Vocabulary) can reuse the same UI + interaction model without
 * cloning ~500 lines. The shell owns:
 *
 *   - queue navigation + per-card outcomes
 *   - 4-choice rendering with deterministic per-card decoy shuffle
 *   - timer modes (off / 5 / 10 / 15 s) with timeout-as-incorrect
 *   - keyboard shortcuts (1–4 answer · ←/→ nav · F flag)
 *   - per-category streak tracking + visual-aid fade after N correct
 *   - focus-protection notice for small queues
 *   - end-of-session summary card
 *
 * The shell is module-agnostic: it consumes a queue of `BaseFlashcard`
 * shapes and calls back to the caller for persistence (attempts,
 * spacingState, SR updates, daily summary). Visual aids and the
 * explanation linkifier ride in as render-prop slots so HF's
 * scale-degree visualisations stay HF-specific while Production's
 * text-only flow needs neither.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import FluencyProtectionNotice from '../../components/FluencyProtectionNotice';

export type TimerMode = 'off' | '5' | '10' | '15';

export interface BaseFlashcard {
  id: string;
  /** Caller-defined category id (string). Used for streak grouping +
   *  the optional visual-aid fade. */
  category: string;
  /** Human-readable category label shown in the header + summary. */
  categoryName: string;
  question: string;
  correctAnswer: string;
  decoys: string[];
  /** Optional post-answer explanation. Rendered through
   *  `renderExplanation` if supplied, otherwise plain text. */
  explanation?: string;
}

interface CardOutcome<TCard extends BaseFlashcard> {
  card: TCard;
  chosen: string | null;
  correct: boolean;
  timedOut: boolean;
}

export interface FlashcardSessionStats {
  total: number;
  correct: number;
  /** Per-category in-session correct streak at session end. */
  categoryStreaks: Record<string, number>;
}

export interface CardAnsweredArgs<TCard extends BaseFlashcard> {
  card: TCard;
  choice: string | null;
  correct: boolean;
  timedOut: boolean;
  timestamp: number;
  /** Per-card countdown in seconds when the user picked a non-'off'
   *  timerMode for this session (5 / 10 / 15). Undefined when the
   *  user chose 'off'. Module-side callers fold this onto the
   *  AttemptRecord so future rolling-average planning can reason
   *  about answer pace vs cap. */
  targetSeconds?: number;
}

interface VisualAidArgs<TCard extends BaseFlashcard> {
  card: TCard;
  mode: string;
  answered: boolean;
  chosen: string | null;
}

interface VisualModeOption {
  id: string;
  label: string;
}

interface Props<TCard extends BaseFlashcard> {
  queue: TCard[];
  timerMode: TimerMode;
  onExit: (stats: FlashcardSessionStats) => void;
  /** Persistence callback fired immediately after the user picks (or
   *  the timer fires). Caller is responsible for writing to
   *  db.attempts, recordEngagement, SR state, daily summaries, etc.
   *  The shell does not care about the return value. */
  onCardAnswered: (args: CardAnsweredArgs<TCard>) => Promise<void> | void;

  /** Currently flagged cards (set of ids). Driven by caller's live
   *  query against its own SR-state table. Optional — when absent the
   *  flag star + F shortcut are hidden. */
  flaggedIds?: Set<string>;
  onToggleFlag?: (cardId: string) => Promise<void> | void;

  /** Review-meta flag (separate from `flaggedIds`). Caller passes the
   *  set of card ids the user has flagged for review, plus an optional
   *  note map. When `onSetReviewFlag` is supplied a 🚩 button + inline
   *  note editor appears alongside the ★ button. Independent feature
   *  — callers can wire either, both, or neither. */
  reviewFlaggedIds?: Set<string>;
  reviewFlagNotes?: Map<string, string>;
  onSetReviewFlag?: (cardId: string, flagged: boolean, note?: string) => Promise<void> | void;

  /** Visual-aid mode toggle. When supplied, the header renders a tab
   *  group with these options and surfaces the change via
   *  onVisualModeChange. The current value drives `renderVisualAid`. */
  visualMode?: string;
  visualModes?: ReadonlyArray<VisualModeOption>;
  onVisualModeChange?: (mode: string) => void;
  /** Render-prop for the per-card visual aid. Returns null to skip. */
  renderVisualAid?: (args: VisualAidArgs<TCard>) => ReactNode;

  /** Optional explanation renderer (e.g. mode-name linkifier in HF).
   *  Defaults to plain text. */
  renderExplanation?: (text: string) => ReactNode;

  /** True when the queue has been narrowed too much for SR math to
   *  be honest. Renders the FluencyProtectionNotice at the top.
   *  Caller decides when to set this; the shell just surfaces it. */
  focusProtected?: boolean;

  /** Fade visual aids after this many in-session correct streaks per
   *  category. Defaults to 5. Pass 0 to disable. Only meaningful
   *  when `renderVisualAid` is supplied. */
  fadeStreakThreshold?: number;

  /** Footer slot rendered above the navigation row — used by callers
   *  that want to add module-specific affordances under the choices
   *  (e.g. "open in glossary"). The `answered` flag lets callers
   *  gate reveal-only affordances (e.g. a "Watch lesson ↗" link
   *  that should only surface after the user picks). */
  renderFooter?: (card: TCard, opts: { answered: boolean }) => ReactNode;
}

const DEFAULT_FADE_THRESHOLD = 5;

export default function FlashcardSession<TCard extends BaseFlashcard>({
  queue,
  timerMode,
  onExit,
  onCardAnswered,
  flaggedIds,
  onToggleFlag,
  reviewFlaggedIds,
  reviewFlagNotes,
  onSetReviewFlag,
  visualMode,
  visualModes,
  onVisualModeChange,
  renderVisualAid,
  renderExplanation,
  focusProtected = false,
  fadeStreakThreshold = DEFAULT_FADE_THRESHOLD,
  renderFooter,
}: Props<TCard>) {
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Array<CardOutcome<TCard> | undefined>>(
    () => queue.map(() => undefined),
  );
  const [streaks, setStreaks] = useState<Map<string, number>>(new Map());
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [flagEditorOpen, setFlagEditorOpen] = useState(false);
  const [flagNoteDraft, setFlagNoteDraft] = useState('');

  const timerRef = useRef<number | null>(null);
  const card = queue[index];
  const currentOutcome = outcomes[index];
  const hasAnswered = currentOutcome !== undefined;
  const chosen = currentOutcome?.chosen ?? null;
  const timerSecs = timerMode === 'off' ? null : parseInt(timerMode, 10);
  const isLast = index === queue.length - 1;
  const answeredCount = outcomes.filter(o => o !== undefined).length;
  const flagged = !!(card && flaggedIds && flaggedIds.has(card.id));
  const reviewFlagged = !!(card && reviewFlaggedIds && reviewFlaggedIds.has(card.id));
  const reviewFlagNote = card && reviewFlagNotes ? reviewFlagNotes.get(card.id) : undefined;

  // -----------------------------------------------------------------
  // Visual-aid fade after N consecutive correct in a category. Skip
  // entirely when threshold is 0 (caller opted out) or no visual aid
  // renderer is supplied.
  // -----------------------------------------------------------------
  const fadedCategories = useMemo(() => {
    const s = new Set<string>();
    if (fadeStreakThreshold > 0) {
      streaks.forEach((count, cat) => {
        if (count >= fadeStreakThreshold) s.add(cat);
      });
    }
    return s;
  }, [streaks, fadeStreakThreshold]);

  // -----------------------------------------------------------------
  // Deterministic per-card decoy shuffle so Previous shows the same
  // choice order. Uses the card id as the seed.
  // -----------------------------------------------------------------
  const choices = useMemo(() => {
    if (!card) return [];
    const opts = [card.correctAnswer, ...card.decoys];
    let h = 0;
    for (let i = 0; i < card.id.length; i++) h = (h * 31 + card.id.charCodeAt(i)) | 0;
    return [...opts].sort((a, b) => {
      const ah = ((a.charCodeAt(0) || 0) + h) % 97;
      const bh = ((b.charCodeAt(0) || 0) + h) % 97;
      return ah - bh;
    });
  }, [card]);

  // -----------------------------------------------------------------
  // Timer lifecycle: restart on fresh card; tick down per second;
  // fire timeout-as-incorrect at 0.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (timerSecs !== null && card && !hasAnswered) {
      setTimeLeft(timerSecs);
    } else {
      setTimeLeft(null);
    }
  }, [index, card, timerSecs, hasAnswered]);

  // Close the flag editor whenever the user moves to a different card,
  // so a half-typed note doesn't bleed over to the next item.
  useEffect(() => {
    setFlagEditorOpen(false);
    setFlagNoteDraft('');
  }, [index]);

  useEffect(() => {
    if (timeLeft === null || hasAnswered || !card) return;
    if (timeLeft <= 0) {
      void handleAnswer(null, true);
      return;
    }
    timerRef.current = window.setTimeout(
      () => setTimeLeft(t => (t === null ? null : t - 1)),
      1000,
    );
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, hasAnswered, card]);

  async function handleAnswer(choice: string | null, timedOut = false) {
    if (hasAnswered || !card) return;
    const isCorrect = !timedOut && choice === card.correctAnswer;
    const timestamp = Date.now();

    await onCardAnswered({
      card,
      choice,
      correct: isCorrect,
      timedOut,
      timestamp,
      // Forward the user's per-card countdown selection so module
      // callers can persist it on AttemptRecord. `timerSecs` is
      // already parsed from `timerMode` upstream and is null when
      // the user picked 'off'.
      ...(timerSecs !== null ? { targetSeconds: timerSecs } : {}),
    });

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
    if (!card || !onToggleFlag) return;
    await onToggleFlag(card.id);
  }

  function handleOpenFlagEditor() {
    if (!card || !onSetReviewFlag) return;
    setFlagNoteDraft(reviewFlagNote ?? '');
    setFlagEditorOpen(true);
  }

  async function handleSaveReviewFlag() {
    if (!card || !onSetReviewFlag) return;
    await onSetReviewFlag(card.id, true, flagNoteDraft);
    setFlagEditorOpen(false);
  }

  async function handleClearReviewFlag() {
    if (!card || !onSetReviewFlag) return;
    await onSetReviewFlag(card.id, false);
    setFlagEditorOpen(false);
    setFlagNoteDraft('');
  }

  function handleEnd() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    onExit({
      total: answeredCount,
      correct: outcomes.filter(o => o?.correct).length,
      categoryStreaks: Object.fromEntries(streaks),
    });
  }

  // -----------------------------------------------------------------
  // Keyboard shortcuts. Refs so the listener captures the latest
  // bindings without re-registering each render.
  // -----------------------------------------------------------------
  const shortcutRef = useRef({
    hasAnswered,
    canPrev: index > 0,
    choices,
    done,
    canFlag: !!onToggleFlag,
  });
  shortcutRef.current = {
    hasAnswered,
    canPrev: index > 0,
    choices,
    done,
    canFlag: !!onToggleFlag,
  };

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
          if (shortcutRef.current.canFlag) {
            e.preventDefault();
            void handleToggleFlag();
          }
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
              void handleAnswer(opt);
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
        outcomes={outcomes.filter((o): o is CardOutcome<TCard> => o !== undefined)}
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
  const showVisual =
    !!renderVisualAid && !isFaded && (visualMode ?? 'text') !== 'text';
  const visualAidNode = showVisual && visualMode
    ? renderVisualAid?.({ card, mode: visualMode, answered: hasAnswered, chosen })
    : null;

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-6 space-y-5">
      {focusProtected && <FluencyProtectionNotice />}

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
          {onToggleFlag && (
            <button
              onClick={() => void handleToggleFlag()}
              aria-label={flagged ? 'unflag card' : 'flag card for later'}
              title={flagged ? 'flagged — click to remove' : 'flag for later (F)'}
              className={`text-lg leading-none ${
                flagged ? 'text-developing' : 'text-neutral-300 hover:text-developing'
              }`}
            >
              {flagged ? '★' : '☆'}
            </button>
          )}
          {onSetReviewFlag && (
            <button
              onClick={handleOpenFlagEditor}
              aria-label={reviewFlagged ? 'edit review flag' : 'flag for review'}
              title={
                reviewFlagged
                  ? `review-flagged${reviewFlagNote ? ` — ${reviewFlagNote}` : ''}`
                  : 'flag for review (add note)'
              }
              className={`text-base leading-none ${
                reviewFlagged ? '' : 'opacity-40 hover:opacity-100'
              }`}
            >
              🚩
            </button>
          )}
          {visualModes && visualModes.length > 0 && onVisualModeChange && (
            <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-[10px]">
              {visualModes.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => onVisualModeChange(opt.id)}
                  className={`px-2 py-0.5 rounded-md transition ${
                    visualMode === opt.id
                      ? 'bg-fluent text-white'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <button onClick={handleEnd} className="text-neutral-500 hover:text-fluent">
            end session
          </button>
        </div>
      </div>

      {/* Review-flag editor — inline panel when the 🚩 button is opened.
          Note is optional; Save with empty note still flags the card. */}
      {flagEditorOpen && onSetReviewFlag && (
        <div className="rounded-lg border border-developing/40 bg-developing/5 p-3 space-y-2">
          <label className="block text-[11px] uppercase tracking-wide text-neutral-500">
            review flag — optional note
          </label>
          <textarea
            value={flagNoteDraft}
            onChange={e => setFlagNoteDraft(e.target.value)}
            placeholder="why are you flagging this? (optional)"
            rows={2}
            className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-900/60 px-2 py-1.5 text-sm focus:outline-none focus:border-developing"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2 text-xs">
            <button
              onClick={() => setFlagEditorOpen(false)}
              className="px-2 py-1 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              cancel
            </button>
            {reviewFlagged && (
              <button
                onClick={() => void handleClearReviewFlag()}
                className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:border-needswork hover:text-needswork"
              >
                remove flag
              </button>
            )}
            <button
              onClick={() => void handleSaveReviewFlag()}
              className="px-3 py-1 rounded-md bg-developing text-white hover:opacity-90"
            >
              {reviewFlagged ? 'save changes' : 'flag for review'}
            </button>
          </div>
        </div>
      )}

      {/* Question */}
      <div className="text-center">
        <p className="text-base sm:text-lg font-medium">{card.question}</p>
      </div>

      {visualAidNode}

      {/* Choices */}
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
              onClick={() => void handleAnswer(opt)}
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
              <div className="mt-1 text-xs text-neutral-500 italic">
                {renderExplanation
                  ? renderExplanation(card.explanation)
                  : card.explanation}
              </div>
            )}
          </div>
        </div>
      )}

      {isFaded && (visualMode ?? 'text') !== 'text' && (
        <p className="text-[11px] text-neutral-400 italic text-center">
          visuals faded — you're on a streak in this category. miss one and they'll return.
        </p>
      )}

      {renderFooter?.(card, { answered: hasAnswered })}

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
          <span className="font-mono ml-1">←</span> previous
          {onToggleFlag && (
            <>
              {' '}·<span className="font-mono ml-1">F</span> flag
            </>
          )}
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

// ---------------------------------------------------------------------
// Summary card — shared across modules. Aggregates per-category
// outcomes from the run.
// ---------------------------------------------------------------------

function SummaryCard<TCard extends BaseFlashcard>({
  outcomes,
  onExit,
}: {
  outcomes: CardOutcome<TCard>[];
  onExit: () => void;
}) {
  const total = outcomes.length;
  const correct = outcomes.filter(o => o.correct).length;
  const acc = total === 0 ? 0 : Math.round((correct / total) * 100);
  const byCategory = new Map<string, { total: number; correct: number; name: string }>();
  for (const o of outcomes) {
    const cat = byCategory.get(o.card.category) ?? {
      total: 0,
      correct: 0,
      name: o.card.categoryName,
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
