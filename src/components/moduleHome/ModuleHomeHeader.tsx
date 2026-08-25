/**
 * What sits above the cards on a module home.
 *
 * =====================================================================
 * LIFTED FROM HARMONIC FLUENCY, NOT RE-WRITTEN FROM IT.
 *
 * HF's home is the reference: a streak row on the shell's otherwise
 * empty top line, then a collapsed intro. This is that markup moved,
 * so HF renders byte-identically through it and the second and third
 * module home cannot drift into a second version of the same row.
 *
 * WHAT IS *NOT* HERE, because it never was: the dark header band —
 * eyebrow, module name, one-line subtitle, "just play", settings.
 * `Layout` has rendered that for every routed page since long before
 * this component, driven by `pageTitle.ts`. Ear training and reading
 * already had it. Extracting it would have meant taking it OUT of the
 * shell and handing it to six pages to remember.
 * =====================================================================
 *
 * EVERY PART IS OMITTED WHERE ITS DATA DOES NOT EXIST, rather than
 * defaulted into something plausible:
 *
 *   · the day streak needs a daily GOAL to count days against, and
 *     only some modules have one (`MODULE_DEFAULT_GOALS`);
 *   · "view calendar →" needs a calendar ROUTE, and only some modules
 *     have one — a link that opens nothing is the defect this codebase
 *     already refuses elsewhere;
 *   · the intro needs COPY, which is authored, never generated.
 *
 * A module missing one renders the rest. See the report for which
 * modules are missing what.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ModuleHomeIntro from './ModuleHomeIntro';
import { db } from '../../lib/db';
import { computeHotStreak, localDayKey } from '../../lib/dailyGoal';
import {
  DEFAULT_MODULE_GOAL,
  moduleGoalKey,
  normaliseModuleGoal,
} from '../../lib/goalConfig';
import { dayStreakFrom, loadPracticeDays } from '../../lib/practiceDays';
import { getPref } from '../../lib/userPrefs';

export interface ModuleHomeHeaderProps {
  /**
   * The attempt `moduleId`s whose reps feed the flame.
   *
   * A LIST, because ear training's home sits above four sub-modules
   * that each write under their own id. One id for the modules that
   * are their own drill.
   */
  moduleIds: readonly string[];
  /**
   * The module this home belongs to — the id its goal, its practice
   * dates and its calendar are all keyed on.
   *
   * NO LONGER OPTIONAL. Every module has a goal now (all six ship on
   * "any practice"), and every module's dates are readable, so there is
   * no module that cannot show a day streak.
   */
  moduleId: string;
  /**
   * Whether this module records RIGHT AND WRONG.
   *
   * "N correct in a row" is only true of a module that grades answers.
   * Shapes & patterns records a duration and a self-rating and song
   * repertoire records a session and a feel, so neither has a correct
   * answer to have got in a row — those rows carry the day streak and
   * the calendar link alone.
   */
  gradesAnswers?: boolean;
  /** Where "view calendar →" goes. Omit where there is no such route. */
  calendarTo?: string;
  /**
   * Something to sit at the LEFT end of the streak row.
   *
   * An optional slot rather than a second row: the row is right-aligned
   * and was otherwise empty on its left, so a module with one more
   * place to go can put it there without buying a band of vertical
   * space. Omitted everywhere else, and the streak items are untouched
   * by its presence.
   */
  leading?: ReactNode;
  /**
   * The module's one line. Absent where the module has no copy.
   *
   * COLLAPSED SHOWS NONE OF IT — see `ModuleHomeIntro`. The row is
   * "About MODULE" and the control, and nothing else.
   */
  intro?: { description: string };
  /**
   * Whether to render the intro at all right now.
   *
   * HF hides it while a session is running, which is why this is a
   * prop rather than `intro !== undefined` — the copy still exists, the
   * moment is just wrong for it.
   */
  showIntro?: boolean;
}

export default function ModuleHomeHeader({
  moduleIds, moduleId, gradesAnswers = true, calendarTo, intro, showIntro = true,
  leading,
}: ModuleHomeHeaderProps) {
  // Its own read rather than a prop. The pages already query attempts
  // for their cards, so this is a second READ of one table — not a
  // second copy of the streak RULE, which is the thing that must not
  // fork. `useLiveQuery` dedupes the re-render, and the alternative is
  // every page computing the same two figures.
  const key = moduleIds.join(',');
  const attempts = useLiveQuery(
    () => db.attempts.where('moduleId').anyOf([...moduleIds]).toArray(),
    [key],
  ) ?? [];

  const storedGoal = useLiveQuery(
    async () => getPref<unknown>(moduleGoalKey(moduleId), null),
    [moduleId],
  );
  const goal = useMemo(
    () => (storedGoal === undefined ? DEFAULT_MODULE_GOAL : normaliseModuleGoal(storedGoal)),
    [storedGoal],
  );

  /**
   * The days this module was practised, from whichever table records
   * them — see `loadPracticeDays`. Re-read whenever the module's own
   * attempts change so an answer just given moves the streak; the
   * duration-based modules have no such signal here and settle on the
   * next visit, which is the same freshness their cards have.
   */
  const [days, setDays] = useState<Awaited<ReturnType<typeof loadPracticeDays>> | null>(null);
  useEffect(() => {
    let live = true;
    // CAUGHT, so a read that fails leaves the streak at zero instead of
    // rejecting into nothing. This is the one read here that is not a
    // `useLiveQuery` — it goes to Dexie directly, because which table
    // holds a module's dates depends on the module — so it is also the
    // one that can reject on its own.
    void loadPracticeDays(moduleId)
      .then(d => { if (live) setDays(d); })
      .catch(() => { if (live) setDays(new Map()); });
    return () => { live = false; };
  }, [moduleId, attempts.length]);

  const hotStreak = useMemo(() => computeHotStreak(attempts).current, [attempts]);
  const dayStreak = useMemo(
    () => (days === null ? 0 : dayStreakFrom(days, goal, localDayKey())),
    [days, goal],
  );

  return (
    <>
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
        {/* `mr-auto` pushes it to the far left of a row that is
            otherwise right-aligned — no extra height, nothing moved. */}
        {leading !== undefined && <span className="mr-auto">{leading}</span>}
        {/* "CORRECT IN A ROW" ONLY WHERE THERE IS A CORRECT ANSWER.
            A module that records a duration and a self-rating has no
            run of right answers to report, so it shows the day streak
            and the calendar and nothing it cannot mean. */}
        {gradesAnswers && (
          <>
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
          </>
        )}
        <span
          className="inline-flex items-baseline gap-1"
          title="consecutive days practised"
          data-testid="hf-streak"
          data-kind="day"
        >
          <span aria-hidden>📅</span>
          <span className="font-mono tabular-nums font-medium">{dayStreak}</span>
          <span>day streak</span>
        </span>
        {calendarTo !== undefined && (
          <>
            <span aria-hidden className="text-neutral-400">·</span>
            <Link to={calendarTo} className="hover:text-fluent">
              view calendar
            </Link>
          </>
        )}
      </div>

      {/* `-mt-4` against the page's `space-y-6`, so the block sits just
          under the streak row instead of a band below it. */}
      {intro !== undefined && showIntro && (
        <div className="-mt-4">
          <ModuleHomeIntro moduleId={moduleId} {...intro} />
        </div>
      )}
    </>
  );
}
