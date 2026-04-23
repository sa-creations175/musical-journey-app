import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { getPref, setPref } from '../../lib/userPrefs';
import { useUrlMultiSelectSync } from '../../lib/useUrlTabSync';
import ModuleIntro from '../../components/ModuleIntro';
import DailyGoalBar from '../../components/DailyGoalBar';
import HarmonicFluencySession, {
  type DisplayMode,
  type SessionStats,
  type TimerMode,
} from './HarmonicFluencySession';
import HarmonicFluencyTracker from './HarmonicFluencyTracker';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  FLASHCARDS,
  type FlashcardCategory,
} from './catalog';
import { buildSession } from './spacedRepetition';

function isCategory(v: string): v is FlashcardCategory {
  return (CATEGORY_ORDER as readonly string[]).includes(v);
}

const MODULE_ID = 'harmonic-fluency';
const PREF_DISPLAY_MODE = 'harmonicFluencyDisplayMode';
const PREF_TIMER = 'harmonicFluencyTimerMode';
const PREF_CATEGORIES = 'harmonicFluencyCategoryFilter';
const SESSION_TARGET = 20;

export default function HarmonicFluency() {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('number-grid');
  const [timerMode, setTimerMode] = useState<TimerMode>('off');
  const [selectedCategories, setSelectedCategories] = useState<Set<FlashcardCategory>>(new Set());
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sessionQueue, setSessionQueue] = useState<ReturnType<typeof buildSession> extends Promise<infer R> ? R | null : null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [lastSummary, setLastSummary] = useState<SessionStats | null>(null);
  const [caughtUp, setCaughtUp] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Live count of flagged cards across the user's per-card state.
  const flaggedCount = useLiveQuery(
    () => db.flashcardStates.filter(s => s.isFlagged === true).count(),
    [],
  ) ?? 0;

  // Total attempts across the module — drives the initial default for
  // users who haven't picked a display mode yet (<100 → number-grid,
  // 100+ → text).
  const totalAttempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(MODULE_ID).count(),
    [],
  ) ?? 0;

  // Hydrate prefs on mount.
  useEffect(() => {
    (async () => {
      const stored = await getPref<DisplayMode | null>(PREF_DISPLAY_MODE, null);
      const timer = await getPref<TimerMode>(PREF_TIMER, 'off');
      const cats = await getPref<FlashcardCategory[]>(PREF_CATEGORIES, []);
      if (stored) {
        setDisplayMode(stored);
      } else {
        // Auto-default based on attempt count.
        setDisplayMode(totalAttempts < 100 ? 'number-grid' : 'text');
      }
      setTimerMode(timer);
      setSelectedCategories(new Set(cats));
      setPrefsLoaded(true);
    })();
    // totalAttempts intentionally not a dep — we only use it on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sidebar sub-items land here as /harmonic-fluency?category=<id>.
  // Mirrors the multi-select filter UI — click a sub-item, land with
  // that category checked. Replaces (not merges) so the sub-item
  // navigation always produces a predictable single-category view.
  useUrlMultiSelectSync<FlashcardCategory>(
    'category',
    isCategory,
    cats => setSelectedCategories(new Set(cats)),
  );

  // Persist when user changes anything (after hydration so we don't
  // overwrite the saved value with our transient defaults).
  useEffect(() => {
    if (!prefsLoaded) return;
    setPref(PREF_DISPLAY_MODE, displayMode);
  }, [displayMode, prefsLoaded]);
  useEffect(() => {
    if (!prefsLoaded) return;
    setPref(PREF_TIMER, timerMode);
  }, [timerMode, prefsLoaded]);
  useEffect(() => {
    if (!prefsLoaded) return;
    setPref(PREF_CATEGORIES, [...selectedCategories]);
  }, [selectedCategories, prefsLoaded]);

  const totalCards = FLASHCARDS.length;

  const activeCategoryCount = useMemo(() => {
    if (selectedCategories.size === 0) return totalCards;
    return FLASHCARDS.filter(c => selectedCategories.has(c.category)).length;
  }, [selectedCategories, totalCards]);

  const toggleCategory = (cat: FlashcardCategory) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const handleStart = async () => {
    const session = await buildSession({
      categories: [...selectedCategories],
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

  const handleExit = (stats: SessionStats) => {
    setSessionActive(false);
    setSessionQueue(null);
    setLastSummary(stats);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to="/" className="text-xs text-neutral-500 hover:text-fluent">← home</Link>
          <h1 className="text-2xl font-medium tracking-tight mt-2">harmonic fluency</h1>
          <p className="text-neutral-500 text-sm">
            flashcard practice for scale degrees, keys, functional harmony, and chord construction.
          </p>
        </div>
        <Link
          to="/harmonic-fluency/calendar"
          className="text-xs text-neutral-500 hover:text-fluent mt-2"
        >
          view calendar →
        </Link>
      </div>

      <ModuleIntro
        accent="blue"
        headline="The mental map that makes music make sense."
        description="Build instant fluency in scale degrees, key relationships, and chord construction. When your theory is automatic, your ear is free to listen."
        bullets={[
          'Scale degree math in all 12 keys',
          'Functional harmony and cadence recognition',
          'Chord construction and quality relationships',
          'Fast flashcard practice with **spaced repetition**',
        ]}
      />

      <DailyGoalBar moduleId={MODULE_ID} />

      {sessionActive && sessionQueue ? (
        <HarmonicFluencySession
          queue={sessionQueue.cards}
          displayMode={displayMode}
          timerMode={timerMode}
          onExit={handleExit}
          onDisplayModeChange={setDisplayMode}
          focusProtected={
            // User has explicitly narrowed the pool (flagged-only drill
            // or a hand-picked category set) AND the resulting queue is
            // small enough that they're cued into what's coming next —
            // so correct answers shouldn't count toward fluency tiers.
            (flaggedOnly || selectedCategories.size > 0) &&
            sessionQueue.cards.length < 4
          }
        />
      ) : (
        <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-4 sm:p-5 space-y-5">
          <div>
            <h2 className="text-base sm:text-lg font-medium tracking-tight">start a session</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {SESSION_TARGET} cards per session · spaced repetition picks what's due
            </p>
          </div>

          {/* Display mode */}
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1.5">display mode</div>
            <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
              {([
                { id: 'text', label: 'text only' },
                { id: 'number-grid', label: 'number grid' },
                { id: 'keyboard', label: 'keyboard' },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setDisplayMode(opt.id)}
                  className={`px-3 py-1.5 rounded-md transition ${
                    displayMode === opt.id
                      ? 'bg-fluent text-white'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timer */}
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1.5">timer per card</div>
            <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs">
              {(['off', '5', '10', '15'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => setTimerMode(opt)}
                  className={`px-3 py-1.5 rounded-md transition ${
                    timerMode === opt
                      ? 'bg-fluent text-white'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  {opt === 'off' ? 'off' : `${opt}s`}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              timer forces answering speed — feedback still stays visible after you answer.
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
                className="h-4 w-4 rounded border-neutral-300 text-fluent focus:ring-fluent"
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

          {/* Category filter */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="text-xs uppercase tracking-wide text-neutral-500">categories</div>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={() => setSelectedCategories(new Set(CATEGORY_ORDER))}
                  className="text-neutral-500 hover:text-fluent"
                >
                  all
                </button>
                <button
                  onClick={() => setSelectedCategories(new Set())}
                  className="text-neutral-500 hover:text-fluent"
                >
                  mixed (default)
                </button>
              </div>
            </div>
            <p className="text-[11px] text-neutral-400 mb-2">
              no selection = all categories mixed · {activeCategoryCount} / {totalCards} cards in current pool
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_ORDER.map(cat => {
                const active = selectedCategories.has(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`px-2.5 py-1 rounded-md border text-xs transition ${
                      active
                        ? 'border-fluent bg-fluent/10 text-fluent'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <button
              onClick={handleStart}
              className="px-5 py-2.5 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
            >
              start session
            </button>
            {caughtUp && (
              <p className="mt-3 text-xs text-neutral-500 italic">
                you're all caught up in that selection! everything you've seen is scheduled further out — come back tomorrow for more reviews, or widen the categories to pick up new material.
              </p>
            )}
            {lastSummary && (
              <p className="mt-3 text-xs text-neutral-500">
                last session: <span className="font-mono text-fluent">{lastSummary.correct}/{lastSummary.total}</span> correct
              </p>
            )}
          </div>
        </section>
      )}

      {!sessionActive && <HarmonicFluencyTracker />}
    </div>
  );
}
