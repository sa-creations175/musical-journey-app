import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import CategoryCardGrid from '../../components/moduleHome/CategoryCardGrid';
import ProgressDetail from '../../components/moduleHome/ProgressDetail';
import { useAxisViews } from '../../components/moduleHome/useAxisViews';
import { moduleMetaById } from '../../lib/moduleMeta';
import { buildSkillRegistry, type SkillRecord } from '../skills/registry';
import { HARMONIC_FLUENCY_GRIDS } from './progressGrids';
import { useSpacingIntervals } from '../../lib/useSpacingIntervals';
import { harmonicFluencyCards } from './homeCards';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../lib/db';
import { getPref, setPref } from '../../lib/userPrefs';
import { useUrlMultiSelectSync } from '../../lib/useUrlTabSync';
import ModuleIntro from '../../components/ModuleIntro';
import DailyGoalBar from '../../components/DailyGoalBar';
import { computeDayStreak, computeHotStreak, localDayKey } from '../../lib/dailyGoal';
import { dailyGoalKey, defaultDailyGoal } from '../../lib/goalConfig';
import HarmonicFluencySession, {
  type DisplayMode,
  type SessionStats,
  type TimerMode,
} from './HarmonicFluencySession';
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
const PREF_INTRO_OPEN = 'harmonicFluencyIntroOpen';
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

  // --- The category cards -----------------------------------------
  const allAttempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(MODULE_ID).toArray(),
    [],
  ) ?? [];
  const spacingIntervals = useSpacingIntervals(MODULE_ID);
  const now = Date.now();

  /**
   * The two streak figures, computed from the same functions
   * `DailyGoalBar` uses rather than a second reading of the attempts.
   *
   *   hotStreak — consecutive CORRECT ANSWERS, all time, ending at the
   *               most recent attempt. Any wrong answer resets it. Not
   *               a day count, which is what the flame glyph implied.
   *   dayStreak — consecutive DAYS whose attempt count met the daily
   *               goal, ending today or yesterday.
   */
  const hfGoal = useLiveQuery(
    async () => getPref<number>(dailyGoalKey(MODULE_ID), defaultDailyGoal(MODULE_ID)),
    [],
  ) ?? defaultDailyGoal(MODULE_ID);
  const hotStreak = useMemo(() => computeHotStreak(allAttempts).current, [allAttempts]);
  const dayStreak = useMemo(
    () => computeDayStreak(allAttempts, hfGoal, localDayKey()),
    [allAttempts, hfGoal],
  );

  /** Which category's progress detail is open, if any. */
  const [detailCategory, setDetailCategory] = useState<FlashcardCategory | null>(null);
  const axisViews = useAxisViews();
  /**
   * The registry, built only while a detail panel is open. It walks
   * every module, so paying for it on arrival would slow the module
   * home for the visits that never open one.
   */
  const [records, setRecords] = useState<SkillRecord[] | null>(null);
  useEffect(() => {
    if (detailCategory === null) return;
    let live = true;
    void buildSkillRegistry().then(r => { if (live) setRecords(r); });
    return () => { live = false; };
  }, [detailCategory, allAttempts]);
  const cards = useMemo(
    () => harmonicFluencyCards(allAttempts, spacingIntervals, now),
    // `now` is deliberately not a dep — it changes every render and
    // would rebuild fifteen cards each time. Freshness moves in days.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allAttempts, spacingIntervals],
  );



  /**
   * Start a drill over an explicit category list.
   *
   * Takes the categories rather than reading `selectedCategories`,
   * because a card's "drill category" sets the filter and starts in the
   * same tap — and `setSelectedCategories` has not committed by the
   * time the session is built. Reading state here would drill the
   * PREVIOUS selection, which is the kind of bug that looks like a
   * race and is really a stale read.
   */
  const startWith = async (categories: FlashcardCategory[]) => {
    const session = await buildSession({
      categories,
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

  const handleStart = () => startWith([...selectedCategories]);

  /**
   * A card's "drill category": narrow to that one category and start.
   *
   * Writes `?category=` as well as setting state, so this goes through
   * the SAME path the sidebar sub-items and the skills catalogue
   * already use (`useUrlMultiSelectSync` above). One way in, so a
   * category drill started from a card and one arrived at by link
   * cannot diverge.
   */
  const drillCategory = (key: string) => {
    if (!isCategory(key)) return;
    setSelectedCategories(new Set([key]));
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.set('category', key);
        return next;
      },
      { replace: true },
    );
    void startWith([key]);
  };

  const handleExit = (stats: SessionStats) => {
    setSessionActive(false);
    setSessionQueue(null);
    setAutoStarted(false);
    setLastSummary(stats);
  };

  return (
    <div className="space-y-6">
      {/* The streaks share the calendar row rather than taking one of
          their own — the row was otherwise empty, and these two numbers
          did not earn a band of their own above the cards.

          EMOJI AND WORDS, NOT ONE OR THE OTHER. The glyphs alone said
          nothing about what they counted, and the flame is not a day
          count at all — see `computeHotStreak`. The words carry the
          meaning; the glyph is what the eye finds first. Both, on the
          same line, costing no extra height. */}
      {/* `-mt-2` eats half the shell's top padding. The shell's `py-4`
          is app-wide (`Layout`) and stays that way — one module wanting
          to start higher is not a reason to move every screen up. */}
      <div className="-mt-2 flex items-center justify-end gap-2 text-xs text-neutral-500">
        <span
          className="inline-flex items-baseline gap-1"
          title="consecutive correct answers, all time"
          data-testid="hf-streak"
          data-kind="hot"
        >
          <span aria-hidden>🔥</span>
          <span className="font-mono tabular-nums font-medium">{hotStreak}</span>
          <span>correct in a row</span>
        </span>
        <span aria-hidden className="text-neutral-400">·</span>
        <span
          className="inline-flex items-baseline gap-1"
          title="consecutive days the daily goal was met"
          data-testid="hf-streak"
          data-kind="day"
        >
          <span aria-hidden>📅</span>
          <span className="font-mono tabular-nums font-medium">{dayStreak}</span>
          {/* One day is a day. Derived from the number beside it rather
              than written as "day(s)". */}
          <span>{dayStreak === 1 ? 'day' : 'days'} at goal</span>
        </span>
        <span aria-hidden className="text-neutral-400">·</span>
        <Link
          to="/harmonic-fluency/calendar"
          className="hover:text-fluent"
        >
          view calendar →
        </Link>
      </div>

      {sessionActive && sessionQueue ? (
        <>
          <DailyGoalBar moduleId={MODULE_ID} />
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
        </>
      ) : (
        <>
          {/* Order (context before action): learn-more card (headline
              only) → the mixed drill → the category cards →
              session settings, collapsed. The settings moved below the
              cards because they configure the mixed run, which is now
              one of sixteen ways to start from this page. */}
          {/* And `-mt-4` against the page's `space-y-6`, so the card sits
              just under the streak row instead of a band below it. */}
          <div className="-mt-4">
          <ModuleIntro
            compact
            persistKey={PREF_INTRO_OPEN}
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
          </div>

          {/* NO "TODAY" ROW HERE. The N/10 counter and its bar told the
              reader a number they do not act on, and cost a band of
              vertical space directly above the cards. `DailyGoalBar`
              still renders INSIDE a running session, where the same
              numbers are a live progress readout rather than a landing
              statistic — and it is the only place the daily goal can be
              edited, so removing it from the page did not remove it
              from the module. */}

          {/* THE MIXED DRILL, ABOVE THE CARDS. It is the same button it
              always was; the label now says what it covers, because a
              grid of fifteen categories underneath makes "Start drill"
              ambiguous about which of them it means. */}
          <button
            onClick={handleStart}
            className="w-full py-3.5 rounded-xl bg-fluent text-white text-base font-semibold shadow-sm hover:opacity-90"
          >
            Start drill · all categories mixed
          </button>

          {/* The fifteen category cards, one per CATEGORY_ORDER entry —
              derived, never listed. Same component Ear Training and
              Reading use. */}
          <CategoryCardGrid
            cards={cards}
            moduleId={MODULE_ID}
            onDrill={drillCategory}
            onProgressDetail={key => { if (isCategory(key)) setDetailCategory(key); }}
            now={now}
          />

          {detailCategory !== null && axisViews.loaded && (
            <ProgressDetail
              categoryLabel={CATEGORY_LABELS[detailCategory]}
              items={(records ?? []).filter(
                r => r.moduleId === MODULE_ID
                  && r.category === CATEGORY_LABELS[detailCategory],
              )}
              grid={HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS[detailCategory]] ?? null}
              accentHex={moduleMetaById(MODULE_ID)?.accentHex ?? '#7a5aa8'}
              now={now}
              viewFor={axisViews.viewFor}
              onViewChange={axisViews.setView}
              onClose={() => setDetailCategory(null)}
            />
          )}

          {/* SESSION SETTINGS BELOW THE CARDS, AND COLLAPSED. They
              configure the mixed drill above, which is one of sixteen
              ways to start from this page now — so they stopped being
              the thing the page is about and became the thing you open
              when you want to change how the mixed run behaves. */}
          <details className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur">
            <summary className="cursor-pointer select-none px-4 sm:px-5 py-3 text-sm font-medium">
              session settings
            </summary>
            <div className="px-1 pb-1">
        <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-4 sm:p-5 space-y-5">
          <div>
            {/* The heading lives on the <summary> now — repeating it
                here would name the panel twice on one screen. */}
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

          <div>
            <button
              onClick={handleStart}
              className="px-5 py-2.5 rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90"
            >
              Start drill
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
            </div>
          </details>

        </>
      )}

      {!sessionActive && <FlaggedForReviewPanel />}
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
    <section className="rounded-2xl border border-developing/40 bg-developing/5 p-4 sm:p-5 space-y-3">
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
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] p-3 space-y-1.5"
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
