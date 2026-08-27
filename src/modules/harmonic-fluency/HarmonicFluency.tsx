/**
 * Harmonic fluency — module home.
 *
 * THE CARDS AND THE MIXED DRILL. A category's own page is where a
 * narrowed drill is started now; this page starts the whole deck and
 * links to the fifteen.
 */
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CategoryCardGrid from '../../components/moduleHome/CategoryCardGrid';
import { useSpacingIntervals } from '../../lib/useSpacingIntervals';
import { harmonicFluencyCards } from './homeCards';
import { db } from '../../lib/db';
import {
  countStudyLater, listReviewFlagged, setReviewFlag,
} from '../../lib/flashcards/cardSpacing';
import ModuleHomeHeader from '../../components/moduleHome/ModuleHomeHeader';
import FluencyDrill, { MODULE_ID, SESSION_TARGET } from './FluencyDrill';
import FluencySessionSettings, { SESSION_SETTINGS_LABEL } from './FluencySessionSettings';
import { mixedDrillLabel } from '../../components/moduleHome/mixedDrillLabel';
import { useFluencyPrefs } from './useFluencyPrefs';
import { useEndOnModuleHome } from '../../lib/useEndOnModuleHome';
import { categoryPath, isCategory } from './categoryRoutes';
import { detailHref } from '../../lib/detailLanding';
import type { SessionStats } from './HarmonicFluencySession';
import {
  CATEGORY_ORDER,
  FLASHCARDS,
  type FlashcardCategory,
} from './catalog';

/** What a running drill was started with. Null when none is running. */
interface RunningDrill {
  categories: FlashcardCategory[];
  autoStarted: boolean;
}

export default function HarmonicFluency() {
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [running, setRunning] = useState<RunningDrill | null>(null);
  const [lastSummary, setLastSummary] = useState<SessionStats | null>(null);
  const [caughtUp, setCaughtUp] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const autoStartRef = useRef(false);

  // PRESSING THE MODULE NAME LANDS ON THE MODULE HOME, MID-DRILL OR
  // NOT. The drill is component state rather than a route, so arriving
  // here from the nav while one is running would otherwise change
  // nothing at all — the URL was already this one. See the hook.
  useEndOnModuleHome(() => setRunning(null));

  const totalAttempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(MODULE_ID).count(),
    [],
  ) ?? 0;
  const prefs = useFluencyPrefs(totalAttempts);

  // Live count of flagged cards across the user's per-card state.
  const flaggedCount = useLiveQuery(
    () => countStudyLater(MODULE_ID),
    [],
  ) ?? 0;

  /**
   * Level 3 auto-start: a practice session lands here as
   * `/harmonic-fluency?session=1`. Whole deck, session defaults, no
   * setup screen. Consumed once — the ref guards re-runs within this
   * mount and the param is stripped so a refresh will not relaunch.
   */
  useEffect(() => {
    if (autoStartRef.current) return;
    if (searchParams.get('session') !== '1') return;
    autoStartRef.current = true;
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('session');
        return next;
      },
      { replace: true },
    );
    setRunning({ categories: [...CATEGORY_ORDER], autoStarted: true });
    setLastSummary(null);
  }, [searchParams, setSearchParams]);

  // --- The category cards -----------------------------------------
  const allAttempts = useLiveQuery(
    () => db.attempts.where('moduleId').equals(MODULE_ID).toArray(),
    [],
  ) ?? [];
  const spacingIntervals = useSpacingIntervals(MODULE_ID);
  const now = Date.now();

  const cards = harmonicFluencyCards(allAttempts, spacingIntervals, now);

  /**
   * THE MIXED DRILL IS THE CATEGORY PAGES' MACHINE WITH EVERYTHING
   * LIT, and it says so by passing every category rather than the empty
   * list that also means "all".
   *
   * Not a second code path, and the difference is not cosmetic. It used
   * to start with a persisted landing filter that a card's "drill
   * category" wrote, so drilling one category once quietly narrowed
   * every mixed run afterwards — in that visit and in every later one —
   * with nothing on screen saying so. A pool that is stated is a pool
   * that can be checked.
   */
  const handleStart = () => {
    setCaughtUp(false);
    setLastSummary(null);
    setRunning({ categories: [...CATEGORY_ORDER], autoStarted: false });
  };

  return (
    <div className="space-y-6">
      {/* THE ROW AND THE INTRO ARE `ModuleHomeHeader` NOW. Identical
          markup, moved — this page is the reference the component was
          lifted from, so routing it through changes nothing here and
          gives ear training and reading the same row without a second
          copy of it. `showIntro` keeps the mid-session behaviour: the
          copy still exists, the moment is just wrong for it. */}
      <ModuleHomeHeader
        {...(running === null
          ? {
            /* SESSION SETTINGS AS A LINK, at the left end of the streak
               row — the same place, the same word and the same panel
               the category page reaches it by. Absent mid-session,
               where the settings themselves are absent: a link to
               something not on the page is the defect this row already
               refuses for "view calendar". */
            leading: (
              <button
                type="button"
                data-testid="session-settings-link"
                onClick={() => setSettingsOpen(true)}
                className="hover:text-fluent"
              >
                {SESSION_SETTINGS_LABEL}
              </button>
            ),
          }
          : {})}
        moduleIds={[MODULE_ID]}
        moduleId={MODULE_ID}
        calendarTo="/harmonic-fluency/calendar"
        showIntro={running === null}
        intro={{
          description: "Know your way around every key — degrees up, down and around, diatonic and chromatic, chord building, tritones and modes.",
        }}
      />

      {running !== null ? (
        <FluencyDrill
          categories={running.categories}
          flaggedOnly={flaggedOnly}
          autoStarted={running.autoStarted}
          onCaughtUp={() => { setRunning(null); setCaughtUp(true); }}
          onExit={stats => { setRunning(null); setLastSummary(stats); }}
        />
      ) : (
        <>
          {/* Order (context before action): the learn-more card, which
              `ModuleHomeHeader` renders above → the mixed drill → the
              category cards → session settings, collapsed. The settings
              moved below the cards because they configure the mixed
              run, which is now one of sixteen ways to start here. */}

          {/* NO "TODAY" ROW HERE. The N/10 counter and its bar told the
              reader a number they do not act on, and cost a band of
              vertical space directly above the cards. `DailyGoalBar`
              still renders INSIDE a running session, where the same
              numbers are a live progress readout rather than a landing
              statistic — and it is the only place the daily goal can be
              edited, so removing it from the page did not remove it
              from the module. */}

          {/* THE MIXED DRILL, ABOVE THE CARDS. It is the same button it
              always was; the label says what it covers, because a grid
              of category cards underneath makes a bare "Start Drill"
              ambiguous about which of them it means.

              THE COUNT COMES OFF THE POOL THE BUTTON STARTS. Same
              array, so the number cannot describe a different set from
              the one the run draws. */}
          <button
            onClick={handleStart}
            data-testid="mixed-drill-start"
            className="w-full py-3.5 rounded-xl bg-fluent text-white text-base font-semibold shadow-sm hover:opacity-90"
          >
            {mixedDrillLabel(CATEGORY_ORDER.length)}
          </button>

          {/* The fifteen category cards, one per CATEGORY_ORDER entry —
              derived, never listed. Same component Ear Training and
              Reading use.

              DRILL CATEGORY IS A LINK NOW. It used to narrow the pool
              and start a run on this page; a category has its own page,
              and that is where its drills are started. */}
          {/* PROGRESS DETAIL GOES TO THE CATEGORY'S PAGE, landing on
              its chart. It used to open a second copy of that chart
              below every card here — a full screen down from the button
              that opened it, which read as doing nothing, and a second
              render of a block that already exists on the category
              page. Open and Progress Detail now go to the same page and
              differ only in where they land. */}
          <CategoryCardGrid
            cards={cards}
            moduleId={MODULE_ID}
            onDrill={key => { if (isCategory(key)) navigate(categoryPath(key)); }}
            onProgressDetail={key => {
              if (isCategory(key)) navigate(detailHref(categoryPath(key)));
            }}
            now={now}
          />

          {/* SESSION SETTINGS, REACHED FROM THE STREAK ROW. They
              configure the mixed drill above, which is one of sixteen
              ways to start from this page now — so they stopped being
              the thing the page is about and became the thing you open
              when you want to change how the mixed run behaves. The
              card they used to sit in is gone; this renders a modal
              and nothing until it is opened. */}
          <FluencySessionSettings
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            prefs={prefs}
            flaggedOnly={flaggedOnly}
            onFlaggedOnlyChange={setFlaggedOnly}
            flaggedCount={flaggedCount}
            onStart={handleStart}
            caughtUp={caughtUp}
            lastSummary={lastSummary}
            sessionTarget={SESSION_TARGET}
          />
        </>
      )}

      {running === null && <FlaggedForReviewPanel />}
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
      // Already sorted most-recently-engaged first, and already
      // narrowed to this module — a vocabulary card carries the same
      // flag on the same field and does not belong in this panel.
      const rows = await listReviewFlagged(MODULE_ID);
      return rows
        .map(r => ({
          cardId: r.itemRef,
          note: r.reviewFlagNote,
          lastReviewed: r.lastEngagedAt ?? 0,
          card: CARDS_BY_ID.get(r.itemRef),
        }))
        .filter((x): x is typeof x & { card: NonNullable<typeof x.card> } =>
          x.card !== undefined,
        );
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
            🚩 Flagged for Review
          </h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            {flagged.length} card{flagged.length === 1 ? '' : 's'} parked for later thought
          </p>
        </div>
        <span className="text-xs text-neutral-500">{expanded ? 'Hide' : 'Show'}</span>
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
                  title="Remove Review Flag"
                >
                  Unflag
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
