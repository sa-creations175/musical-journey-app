/**
 * Production Vocabulary — module home + session screen.
 *
 * Mirrors the Harmonic Fluency pattern as a deliberate design call:
 * an SR-aware buildSession (due cards first, then new, padded to a
 * 20-card target), a same-page setup section (timer per card,
 * flagged-only, cluster multi-select with "mixed" default), the
 * DailyGoalBar at the top, focus-protected mode for narrowed pools
 * that fall under 4 cards, and the "last session" feedback line.
 *
 * Card ids are namespaced (`prod-vocab:`) so the shared
 * db.flashcardStates table holds vocab + HF rows side-by-side without
 * collision and no schema migration is needed.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AttemptRecord } from '../../lib/db';
import { getPref, setPref } from '../../lib/userPrefs';
import { updateDailySummary } from '../../lib/dailySummaries';
import {
  recordAttempt as recordSrAttempt,
  toggleFlag,
} from '../../lib/flashcards/spacedRepetition';
import DailyGoalBar from '../../components/DailyGoalBar';
import {
  PRODUCTION_VOCAB_FLASHCARDS,
  VOCAB_CLUSTER_LABELS,
  VOCAB_CLUSTER_ORDER,
  type VocabClusterId,
  type VocabFlashcard,
} from './vocabularyFlashcards';
import { glossaryById } from './content/glossary';
import { lessonById } from './content/lessons';
import FlashcardSession, {
  type CardAnsweredArgs,
  type FlashcardSessionStats,
  type TimerMode,
} from '../../lib/flashcards/FlashcardSession';

const MODULE_ID = 'production';
const PREF_TIMER = 'productionVocabTimerMode';
const PREF_CLUSTERS = 'productionVocabClusterFilter';
const SESSION_TARGET = 10;
const FOCUS_PROTECTION_THRESHOLD = 4;

interface BuiltSession {
  cards: VocabFlashcard[];
  dueCount: number;
  newCount: number;
  allCaughtUp: boolean;
}

interface Props {
  onBack: () => void;
}

/**
 * For a glossary term, return the first related lesson that has a
 * non-empty `youtubeLink`. Lets the flashcard reveal point at the
 * curated tutorial the lesson author already picked, instead of a
 * generic YouTube search.
 */
export function pickTermTutorial(
  termId: string,
): { url: string; title: string } | null {
  const term = glossaryById(termId);
  if (!term) return null;
  for (const lessonId of term.relatedLessons) {
    const lesson = lessonById(lessonId);
    if (lesson && lesson.youtubeLink.trim() !== '') {
      return { url: lesson.youtubeLink, title: lesson.title };
    }
  }
  return null;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// SR-aware queue builder. Mirrors harmonic-fluency's buildSession:
// due cards first (nextReviewDate <= now), then untouched cards to
// pad up to target. Flagged-only short-circuits both pools and just
// returns flagged-and-eligible.
async function buildVocabSession(opts: {
  clusters: VocabClusterId[];
  target: number;
  flaggedOnly?: boolean;
  now?: number;
}): Promise<BuiltSession> {
  const now = opts.now ?? Date.now();
  const target = Math.max(1, opts.target);
  const clusterSet = new Set(opts.clusters);
  const inCluster = (c: VocabFlashcard) =>
    clusterSet.size === 0 || clusterSet.has(c.clusterId);

  const eligible = PRODUCTION_VOCAB_FLASHCARDS.filter(inCluster);
  const states = await db.flashcardStates.bulkGet(eligible.map(c => c.id));

  if (opts.flaggedOnly) {
    const flagged: VocabFlashcard[] = [];
    eligible.forEach((card, i) => {
      if (states[i]?.isFlagged) flagged.push(card);
    });
    const cards = shuffle(flagged).slice(0, target);
    return { cards, dueCount: 0, newCount: 0, allCaughtUp: cards.length === 0 };
  }

  const due: VocabFlashcard[] = [];
  const untouched: VocabFlashcard[] = [];
  eligible.forEach((card, i) => {
    const state = states[i];
    if (!state) untouched.push(card);
    else if (state.nextReviewDate <= now) due.push(card);
  });

  const dueShuffled = shuffle(due);
  const untouchedShuffled = shuffle(untouched);
  const dueSlice = dueShuffled.slice(0, target);
  const remaining = Math.max(0, target - dueSlice.length);
  const newSlice = untouchedShuffled.slice(0, remaining);
  const cards = [...dueSlice, ...newSlice];

  return {
    cards,
    dueCount: due.length,
    newCount: untouched.length,
    allCaughtUp: cards.length === 0,
  };
}

export default function VocabularySession({ onBack }: Props) {
  const [timerMode, setTimerMode] = useState<TimerMode>('off');
  const [selectedClusters, setSelectedClusters] = useState<Set<VocabClusterId>>(
    new Set(),
  );
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sessionQueue, setSessionQueue] = useState<BuiltSession | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [lastSummary, setLastSummary] = useState<FlashcardSessionStats | null>(null);
  const [caughtUp, setCaughtUp] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Live count of flagged vocab cards across the user's per-card SR
  // state. Same shared db.flashcardStates table HF reads from, but
  // filtered to the prod-vocab namespace.
  const flaggedCount = useLiveQuery(async () => {
    const ids = PRODUCTION_VOCAB_FLASHCARDS.map(c => c.id);
    const rows = await db.flashcardStates.where('cardId').anyOf(ids).toArray();
    return rows.filter(r => r.isFlagged === true).length;
  }, []) ?? 0;

  // Hydrate prefs on mount.
  useEffect(() => {
    (async () => {
      const timer = await getPref<TimerMode>(PREF_TIMER, 'off');
      const clusters = await getPref<VocabClusterId[]>(PREF_CLUSTERS, []);
      setTimerMode(timer);
      setSelectedClusters(new Set(clusters));
      setPrefsLoaded(true);
    })();
  }, []);

  // Persist after hydration.
  useEffect(() => {
    if (!prefsLoaded) return;
    setPref(PREF_TIMER, timerMode);
  }, [timerMode, prefsLoaded]);
  useEffect(() => {
    if (!prefsLoaded) return;
    setPref(PREF_CLUSTERS, [...selectedClusters]);
  }, [selectedClusters, prefsLoaded]);

  const totalCards = PRODUCTION_VOCAB_FLASHCARDS.length;

  const activeClusterCount = useMemo(() => {
    if (selectedClusters.size === 0) return totalCards;
    return PRODUCTION_VOCAB_FLASHCARDS.filter(c =>
      selectedClusters.has(c.clusterId),
    ).length;
  }, [selectedClusters, totalCards]);

  const toggleCluster = (cluster: VocabClusterId) => {
    setSelectedClusters(prev => {
      const next = new Set(prev);
      if (next.has(cluster)) next.delete(cluster);
      else next.add(cluster);
      return next;
    });
  };

  // Live flag set for the active session's queue, so the shell's
  // star/F shortcut reflects current state.
  const flaggedIds = useLiveQuery(async () => {
    if (!sessionQueue) return new Set<string>();
    const ids = sessionQueue.cards.map(c => c.id);
    const rows = await db.flashcardStates.where('cardId').anyOf(ids).toArray();
    const set = new Set<string>();
    for (const r of rows) if (r.isFlagged) set.add(r.cardId);
    return set;
  }, [sessionQueue]) ?? new Set<string>();

  const handleStart = async () => {
    const session = await buildVocabSession({
      clusters: [...selectedClusters],
      target: SESSION_TARGET,
      flaggedOnly,
    });
    if (session.allCaughtUp) {
      setCaughtUp(true);
      setTimeout(() => setCaughtUp(false), 4000);
      return;
    }
    setSessionQueue(session);
    setSessionActive(true);
    setLastSummary(null);
  };

  const handleExit = (stats: FlashcardSessionStats) => {
    setSessionActive(false);
    setSessionQueue(null);
    setLastSummary(stats);
  };

  async function handleCardAnswered({
    card,
    correct,
    timestamp,
  }: CardAnsweredArgs<VocabFlashcard>) {
    const record: AttemptRecord = {
      moduleId: MODULE_ID,
      itemId: card.id,
      correct,
      timestamp,
    };
    await db.attempts.add(record);
    await recordSrAttempt(card.id, correct, timestamp);
    await updateDailySummary(MODULE_ID);

    // Phase 3 spacingState (recordEngagement) is intentionally
    // skipped. 'production' is registered as `integration` memory
    // type, which only accepts rating-shaped signals — feeding it
    // an 'attempt' throws. Vocab cards aren't currently goal-tracked,
    // so the spacing layer doesn't need a row per card. If vocab
    // ever becomes a candidate for the session generator, register
    // a declarative-typed module ref ('production-vocabulary') in
    // MODULE_MEMORY_TYPES and re-introduce the recordEngagement call.
  }

  // Focus-protected mode: user has narrowed the pool (flagged-only
  // or hand-picked clusters) AND the resulting queue is small enough
  // that they're cued into what's coming. Attempts still log so daily
  // goals / streaks / calendar all behave normally — only the
  // per-card SR schedule sits out so a tight drill can't push easy
  // cards further out.
  const focusProtected = !!(
    (flaggedOnly || selectedClusters.size > 0) &&
    sessionQueue &&
    sessionQueue.cards.length < FOCUS_PROTECTION_THRESHOLD
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <button
          onClick={onBack}
          className="text-xs text-neutral-500 hover:text-production"
        >
          ← back to Production
        </button>
        <h1 className="text-2xl font-medium tracking-tight mt-2">Vocabulary</h1>
        <p className="text-neutral-500 text-sm">
          {totalCards} terms drawn from every Production lesson — same SM-2
          schedule as Harmonic Fluency. Decoys come from the same family so
          wrong answers force a real discrimination, not a vocab whiff.
        </p>
      </header>

      <DailyGoalBar moduleId={MODULE_ID} />

      {sessionActive && sessionQueue ? (
        <FlashcardSession<VocabFlashcard>
          queue={sessionQueue.cards}
          timerMode={timerMode}
          onExit={handleExit}
          onCardAnswered={handleCardAnswered}
          flaggedIds={flaggedIds}
          onToggleFlag={async cardId => {
            await toggleFlag(cardId);
          }}
          focusProtected={focusProtected}
          fadeStreakThreshold={0}
          renderFooter={(card, { answered }) => {
            if (!answered) return null;
            const tutorial = pickTermTutorial(card.termId);
            const linkClass =
              'inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-fluent';
            if (tutorial) {
              return (
                <a
                  href={tutorial.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  <span>Watch: {tutorial.title}</span>
                  <span aria-hidden>↗</span>
                </a>
              );
            }
            const fallbackUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(card.termName)}`;
            return (
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                <span>Search YouTube: {card.termName}</span>
                <span aria-hidden>↗</span>
              </a>
            );
          }}
        />
      ) : (
        <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-5 space-y-5">
          <div>
            <h2 className="text-base sm:text-lg font-medium tracking-tight">
              start a session
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {SESSION_TARGET} cards per session · spaced repetition picks
              what's due
            </p>
          </div>

          {/* Timer */}
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1.5">
              timer per card
            </div>
            <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
              {(['off', '5', '10', '15'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => setTimerMode(opt)}
                  className={`px-3 py-1.5 rounded-md transition ${
                    timerMode === opt
                      ? 'bg-production text-white'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  {opt === 'off' ? 'off' : `${opt}s`}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              timer forces answering speed — feedback still stays visible after
              you answer.
            </p>
          </div>

          {/* Flagged-only */}
          <div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={flaggedOnly}
                onChange={e => setFlaggedOnly(e.target.checked)}
                disabled={flaggedCount === 0}
                className="h-4 w-4 rounded border-neutral-300 text-production focus:ring-production"
              />
              <span className={flaggedCount === 0 ? 'text-neutral-400' : ''}>
                flagged cards only
              </span>
              <span className="text-[11px] text-neutral-400">
                {flaggedCount === 0
                  ? '(flag a card during a session with ★ to enable)'
                  : `· ${flaggedCount} flagged`}
              </span>
            </label>
          </div>

          {/* Cluster filter */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                clusters
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={() => setSelectedClusters(new Set(VOCAB_CLUSTER_ORDER))}
                  className="text-neutral-500 hover:text-production"
                >
                  all
                </button>
                <button
                  onClick={() => setSelectedClusters(new Set())}
                  className="text-neutral-500 hover:text-production"
                >
                  mixed (default)
                </button>
              </div>
            </div>
            <p className="text-[11px] text-neutral-400 mb-2">
              no selection = all clusters mixed · {activeClusterCount} /{' '}
              {totalCards} cards in current pool
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VOCAB_CLUSTER_ORDER.map(cluster => {
                const active = selectedClusters.has(cluster);
                return (
                  <button
                    key={cluster}
                    onClick={() => toggleCluster(cluster)}
                    className={`px-2.5 py-1 rounded-md border text-xs transition ${
                      active
                        ? 'border-production bg-production/10 text-production'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-production hover:text-production'
                    }`}
                  >
                    {VOCAB_CLUSTER_LABELS[cluster]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <button
              onClick={handleStart}
              className="px-5 py-2.5 rounded-lg bg-production text-white text-sm font-medium hover:opacity-90"
            >
              start session
            </button>
            {caughtUp && (
              <p className="mt-3 text-xs text-neutral-500 italic">
                you're all caught up in that selection! everything you've seen
                is scheduled further out — come back tomorrow for more
                reviews, or widen the clusters to pick up new material.
              </p>
            )}
            {lastSummary && (
              <p className="mt-3 text-xs text-neutral-500">
                last session:{' '}
                <span className="font-mono text-production">
                  {lastSummary.correct}/{lastSummary.total}
                </span>{' '}
                correct
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
