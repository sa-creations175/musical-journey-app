import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { setReviewFlag } from '../../lib/flashcards/spacedRepetition';

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
  // True while the active session was auto-started from a practice
  // session (Level 3). Forces session defaults (timer off, full pool)
  // for that run only, without touching the user's saved prefs.
  const [autoStarted, setAutoStarted] = useState(false);
  const autoStartRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();

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

  // Level 3 auto-start: a practice session lands here as
  // /harmonic-fluency?session=1. Build with session defaults (all
  // categories, not flagged-only, timer off via `autoStarted`) and skip
  // the setup screen — saved prefs are left untouched. Consumed once: the
  // ref guards re-runs within this mount (finishing → returning to setup
  // won't relaunch) and the param is stripped so a refresh won't either.
  useEffect(() => {
    if (!prefsLoaded || autoStartRef.current) return;
    if (searchParams.get('session') !== '1') return;
    autoStartRef.current = true;
    void (async () => {
      const session = await buildSession({
        categories: [],
        target: SESSION_TARGET,
        flaggedOnly: false,
      });
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.delete('session');
          return next;
        },
        { replace: true },
      );
      if (session.allCaughtUp) {
        setCaughtUp(true);
        setTimeout(() => setCaughtUp(false), 4000);
        return;
      }
      setSessionQueue(session);
      setSessionActive(true);
      setAutoStarted(true);
      setLastSummary(null);
    })();
  }, [prefsLoaded, searchParams, setSearchParams]);

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
    setAutoStarted(false);
    setLastSummary(null);
  };

  const handleExit = (stats: SessionStats) => {
    setSessionActive(false);
    setSessionQueue(null);
    setAutoStarted(false);
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
          // Auto-started sessions force timer off (session default) without
          // overwriting the user's saved timer pref.
          timerMode={autoStarted ? 'off' : timerMode}
          onExit={handleExit}
          onDisplayModeChange={setDisplayMode}
          focusProtected={
            // User has explicitly narrowed the pool (flagged-only drill
            // or a hand-picked category set) AND the resulting queue is
            // small enough that they're cued into what's coming next —
            // so correct answers shouldn't count toward fluency tiers.
            // Auto-started runs use the full pool, so never focus-protect.
            !autoStarted &&
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

      {!sessionActive && <FlaggedForReviewPanel />}
      {!sessionActive && <HarmonicFluencyTracker />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Flagged-for-review panel — a parking pile separate from the ★
// "study later" filter. Surfaces cards the user 🚩-flagged with their
// optional notes, with a button to clear each one.
// ---------------------------------------------------------------------

// Module-level lookup — stable reference, no need for useMemo or a
// dep on every component re-render. Building this inside the live
// query callback (a) makes the deps array empty so the live query
// subscribes to the table once, and (b) avoids the prior bug where
// the panel never appeared because the dep-array reference cycle
// blocked the observable from emitting.
const CARDS_BY_ID = new Map(FLASHCARDS.map(c => [c.id, c]));

function FlaggedForReviewPanel() {
  const [expanded, setExpanded] = useState(false);

  const flagged = useLiveQuery(
    async () => {
      const rows = await db.flashcardStates
        .filter(s => s.flagged === true)
        .toArray();
      return rows
        .map(r => ({
          cardId: r.cardId,
          note: r.flagNote,
          lastReviewed: r.lastReviewed,
          card: CARDS_BY_ID.get(r.cardId),
        }))
        .filter((x): x is typeof x & { card: NonNullable<typeof x.card> } =>
          x.card !== undefined,
        )
        .sort((a, b) => b.lastReviewed - a.lastReviewed);
    },
    [],
  );

  // Loading vs empty: useLiveQuery returns undefined until its first
  // emission. We only collapse to null AFTER the query has resolved
  // and found no flagged cards — otherwise the panel would flash
  // empty during the brief subscribe window even when rows exist.
  if (flagged === undefined) return null;
  if (flagged.length === 0) return null;

  return (
    <section className="rounded-card border border-developing/40 bg-developing/5 p-4 sm:p-5 space-y-3">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-sm sm:text-base font-medium tracking-tight text-developing">
            🚩 flagged for review
          </h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            {flagged.length} card{flagged.length === 1 ? '' : 's'} parked for later thought
          </p>
        </div>
        <span className="text-xs text-neutral-500">{expanded ? 'hide' : 'show'}</span>
      </button>

      {expanded && (
        <ul className="space-y-2.5 pt-1">
          {flagged.map(({ cardId, note, card }) => card && (
            <li
              key={cardId}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/60 p-3 space-y-1.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm">{card.question}</p>
                  <p className="text-[10px] uppercase tracking-wide text-neutral-400">
                    {card.categoryName} · answer: {card.correctAnswer}
                  </p>
                </div>
                <button
                  onClick={() => void setReviewFlag(cardId, false)}
                  className="text-[11px] text-neutral-500 hover:text-needswork shrink-0"
                  title="remove review flag"
                >
                  unflag
                </button>
              </div>
              {note && (
                <p className="text-xs text-neutral-600 dark:text-neutral-400 italic border-l-2 border-developing/40 pl-2">
                  {note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
