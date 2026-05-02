/**
 * Production Vocabulary — entry + session screen.
 *
 * Two phases on one route:
 *   1. Setup — pick a queue (all / by-cluster) and a timer mode.
 *   2. Run — render the generic FlashcardSession with the picked
 *      queue. On exit, summary lands inside the shell; "done"
 *      returns to the setup screen so the user can pick another
 *      queue without leaving Production.
 *
 * Persistence wires in via Step D (db.attempts + recordEngagement +
 * a vocab SR table). This step ships the UI + queue selection only;
 * the onCardAnswered callback is currently a no-op so the flow is
 * fully exercisable in the browser before the SR layer lands.
 */
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AttemptRecord } from '../../lib/db';
import { recordEngagement } from '../../lib/spacingState';
import { updateDailySummary } from '../../lib/dailySummaries';
import {
  recordAttempt as recordSrAttempt,
  toggleFlag,
} from '../../lib/flashcards/spacedRepetition';
import {
  PRODUCTION_VOCAB_FLASHCARDS,
  VOCAB_CLUSTER_LABELS,
  VOCAB_CLUSTER_ORDER,
  vocabCardsByCluster,
  type VocabClusterId,
  type VocabFlashcard,
} from './vocabularyFlashcards';
import FlashcardSession, {
  type CardAnsweredArgs,
  type TimerMode,
} from '../../lib/flashcards/FlashcardSession';

const MODULE_ID = 'production';

interface Props {
  onBack: () => void;
}

type SetupQueue =
  | { kind: 'all' }
  | { kind: 'cluster'; clusterId: VocabClusterId }
  | { kind: 'mixed'; size: number };

type Phase = 'setup' | 'running';

const MIXED_SIZE = 20;

function shuffle<T>(arr: ReadonlyArray<T>): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildQueue(setup: SetupQueue): VocabFlashcard[] {
  if (setup.kind === 'all') return shuffle(PRODUCTION_VOCAB_FLASHCARDS);
  if (setup.kind === 'cluster') return shuffle(vocabCardsByCluster(setup.clusterId));
  return shuffle(PRODUCTION_VOCAB_FLASHCARDS).slice(0, setup.size);
}

export default function VocabularySession({ onBack }: Props) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [setup, setSetup] = useState<SetupQueue>({ kind: 'mixed', size: MIXED_SIZE });
  const [timerMode, setTimerMode] = useState<TimerMode>('off');
  const [queue, setQueue] = useState<VocabFlashcard[]>([]);

  const clusterCounts = useMemo(() => {
    const counts: Partial<Record<VocabClusterId, number>> = {};
    for (const cluster of VOCAB_CLUSTER_ORDER) {
      counts[cluster] = vocabCardsByCluster(cluster).length;
    }
    return counts;
  }, []);

  const totalCount = PRODUCTION_VOCAB_FLASHCARDS.length;

  const startSession = () => {
    const built = buildQueue(setup);
    if (built.length === 0) return;
    setQueue(built);
    setPhase('running');
  };

  if (phase === 'running') {
    return <RunningPhase queue={queue} timerMode={timerMode} onChangeQueue={() => setPhase('setup')} />;
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-medium tracking-tight">Vocabulary</h1>
          <button
            onClick={onBack}
            className="text-xs text-neutral-500 hover:text-production"
          >
            ← back to Production
          </button>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-2xl">
          {totalCount} terms drawn from every Production lesson. Each card asks
          you to pick the definition that matches the term. Decoys come from
          the same family (compression terms decoy other compression terms,
          reverb terms decoy other reverb terms) so wrong answers force a real
          discrimination, not a vocab whiff.
        </p>
      </header>

      {/* Queue picker */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          pick a queue
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QueueOption
            active={setup.kind === 'mixed'}
            label={`Mixed sample (${MIXED_SIZE})`}
            sublabel="Random draw across every cluster — a quick warm-up."
            onClick={() => setSetup({ kind: 'mixed', size: MIXED_SIZE })}
          />
          <QueueOption
            active={setup.kind === 'all'}
            label={`Everything (${totalCount})`}
            sublabel="Every term across every cluster, shuffled."
            onClick={() => setSetup({ kind: 'all' })}
          />
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          or focus a cluster
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {VOCAB_CLUSTER_ORDER.map(cluster => {
            const count = clusterCounts[cluster] ?? 0;
            const active =
              setup.kind === 'cluster' && setup.clusterId === cluster;
            return (
              <button
                key={cluster}
                type="button"
                onClick={() => setSetup({ kind: 'cluster', clusterId: cluster })}
                className={`text-left rounded-md border px-3 py-2 transition-colors ${
                  active
                    ? 'border-production bg-production/5'
                    : 'border-neutral-200 dark:border-neutral-700 hover:border-production/40'
                }`}
              >
                <div className="text-xs font-medium">
                  {VOCAB_CLUSTER_LABELS[cluster]}
                </div>
                <div className="text-[10px] text-neutral-500 font-mono tabular-nums">
                  {count} terms
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Timer */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          timer
        </h2>
        <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
          {(['off', '5', '10', '15'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setTimerMode(mode)}
              className={`px-3 py-1 rounded-md transition ${
                timerMode === mode
                  ? 'bg-production text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              {mode === 'off' ? 'off' : `${mode}s`}
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={startSession}
        className="w-full sm:w-auto px-5 py-2.5 rounded-md bg-production text-white text-sm font-medium hover:opacity-90"
      >
        Start session
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Running phase — owns the live flag-state query + the persistence
// pipeline. Split into its own component so the useLiveQuery only
// fires while a session is actually running (not on the setup screen).
// ---------------------------------------------------------------------
function RunningPhase({
  queue,
  timerMode,
  onChangeQueue,
}: {
  queue: VocabFlashcard[];
  timerMode: TimerMode;
  onChangeQueue: () => void;
}) {
  const flaggedIds = useLiveQuery(async () => {
    const ids = queue.map(c => c.id);
    const states = await db.flashcardStates.where('cardId').anyOf(ids).toArray();
    const set = new Set<string>();
    for (const s of states) if (s.isFlagged) set.add(s.cardId);
    return set;
  }, [queue]) ?? new Set<string>();

  async function handleCardAnswered({
    card,
    correct,
    timestamp,
  }: CardAnsweredArgs<VocabFlashcard>) {
    // 1. Append to the global attempts log so dashboards / streaks
    //    pick it up the same way every other module's attempts do.
    const record: AttemptRecord = {
      moduleId: MODULE_ID,
      itemId: card.id,
      correct,
      timestamp,
    };
    await db.attempts.add(record);

    // 2. Phase 3 spacing layer — drives the practice-session
    //    candidate algorithm (next_due_at, acquisition stage).
    //    Vocab cards are declarative items: graded attempts only.
    await recordEngagement({
      itemRef: card.id,
      moduleRef: MODULE_ID,
      signal: { kind: 'attempt', correct },
      timestamp,
    });

    // 3. Per-card SM-2 schedule. Same shared db.flashcardStates
    //    table HF uses; card ids are namespaced (`prod-vocab:`)
    //    so there's no collision.
    await recordSrAttempt(card.id, correct, timestamp);

    // 4. Daily-summary roll-up.
    await updateDailySummary(MODULE_ID);
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-medium tracking-tight">Vocabulary practice</h1>
        <button
          onClick={onChangeQueue}
          className="text-xs text-neutral-500 hover:text-production"
        >
          ← change queue
        </button>
      </header>
      <FlashcardSession<VocabFlashcard>
        queue={queue}
        timerMode={timerMode}
        onExit={onChangeQueue}
        onCardAnswered={handleCardAnswered}
        flaggedIds={flaggedIds}
        onToggleFlag={async cardId => {
          await toggleFlag(cardId);
        }}
        fadeStreakThreshold={0}
      />
    </div>
  );
}

function QueueOption({
  active,
  label,
  sublabel,
  onClick,
}: {
  active: boolean;
  label: string;
  sublabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-card border p-3 transition-colors ${
        active
          ? 'border-production bg-production/5'
          : 'border-neutral-200 dark:border-neutral-700 hover:border-production/40'
      }`}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-neutral-500 mt-0.5">{sublabel}</div>
    </button>
  );
}
