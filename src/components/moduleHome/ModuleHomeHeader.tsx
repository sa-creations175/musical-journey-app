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
import { useMemo, type ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import ModuleIntro from '../ModuleIntro';
import { db } from '../../lib/db';
import {
  computeDayStreak,
  computeHotStreak,
  localDayKey,
} from '../../lib/dailyGoal';
import { dailyGoalKey, defaultDailyGoal } from '../../lib/goalConfig';
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
   * The module whose daily goal the day streak is measured against.
   *
   * OMIT WHERE THE MODULE HAS NO GOAL. `defaultDailyGoal` falls back to
   * 30 for any unknown id, so passing one anyway would count days
   * against a target the reader has never seen, cannot edit from this
   * page, and did not choose. The row then shows the flame alone.
   */
  goalModuleId?: string;
  /** Where "view calendar →" goes. Omit where there is no such route. */
  calendarTo?: string;
  /**
   * The collapsed intro, or absent where the module has no copy.
   *
   * Passed through to `ModuleIntro` whole. `compact` is set here — a
   * module home leads with its cards, and that is the difference
   * between this placement and the same card on a drill page.
   */
  intro?: Omit<ComponentProps<typeof ModuleIntro>, 'compact'>;
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
  moduleIds, goalModuleId, calendarTo, intro, showIntro = true,
}: ModuleHomeHeaderProps) {
  // Its own read rather than a prop. The pages already query attempts
  // for their cards, so this is a second READ of one table — not a
  // second copy of the streak RULE, which is the thing that must not
  // fork. `useLiveQuery` dedupes the re-render, and the alternative is
  // three pages each computing two figures the same way.
  const key = moduleIds.join(',');
  const attempts = useLiveQuery(
    () => db.attempts.where('moduleId').anyOf([...moduleIds]).toArray(),
    [key],
  ) ?? [];

  /**
   * The goal, and it must be a NUMBER before it counts anything.
   *
   * TYPE-CHECKED, NOT NULL-CHECKED, and that is not defensive noise.
   * `computeDayStreak` walks backwards while each day clears the goal —
   * so a goal of 0 walks back forever, because every day in history
   * cleared it. A `?? null` guard lets anything non-nullish through,
   * and `>= []` is true, which is how ear training's page test (it
   * mocks `useLiveQuery` wholesale, so this read returned an attempts
   * array) hung the suite instead of failing it.
   *
   * `isValidGoal` keeps a stored goal at 5 or above, so this cannot
   * happen from real data — which is exactly why it would have gone
   * unnoticed anywhere but here.
   */
  const storedGoal = useLiveQuery(
    async () => (goalModuleId === undefined
      ? null
      : getPref<number>(dailyGoalKey(goalModuleId), defaultDailyGoal(goalModuleId))),
    [goalModuleId],
  );
  const goal = typeof storedGoal === 'number' && storedGoal > 0 ? storedGoal : null;

  const hotStreak = useMemo(() => computeHotStreak(attempts).current, [attempts]);
  const dayStreak = useMemo(
    () => (goal === null ? null : computeDayStreak(attempts, goal, localDayKey())),
    [attempts, goal],
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
        {dayStreak !== null && (
          <>
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
          </>
        )}
        {calendarTo !== undefined && (
          <>
            <span aria-hidden className="text-neutral-400">·</span>
            <Link to={calendarTo} className="hover:text-fluent">
              view calendar →
            </Link>
          </>
        )}
      </div>

      {/* `-mt-4` against the page's `space-y-6`, so the card sits just
          under the streak row instead of a band below it. */}
      {intro !== undefined && showIntro && (
        <div className="-mt-4">
          <ModuleIntro compact {...intro} />
        </div>
      )}
    </>
  );
}
