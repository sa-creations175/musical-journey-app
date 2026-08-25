/**
 * A module's practice calendar page.
 *
 * =====================================================================
 * HARMONIC FLUENCY'S CALENDAR, MADE THE PATTERN RATHER THAN COPIED.
 *
 * HF's page was a back link, a title, a one-line explanation and
 * `PracticeCalendar`. Three more modules need exactly that, and the
 * fourth copy is where the wording starts to differ for no reason.
 *
 * THE TITLE IS DERIVED. `moduleMeta` already holds each module's label
 * and route, so the heading and the back link are built from them — no
 * module name is typed here, and a module renamed in one place is
 * renamed on its calendar too.
 * =====================================================================
 *
 * Shapes & patterns and song repertoire keep their own calendar pages:
 * they record durations and sessions rather than answered attempts, so
 * their grids read different tables and show different things. This is
 * the page for the modules whose days come from `dailySummaries`.
 */
import { Link } from 'react-router-dom';
import PracticeCalendar from './PracticeCalendar';
import { moduleMetaById } from '../lib/moduleMeta';

interface Props {
  /** The module whose calendar this is — its label, route and days. */
  moduleId: string;
  /** Sub-module ids to merge in. See `PracticeCalendar`. */
  alsoModuleIds?: readonly string[];
}

export default function ModuleCalendarPage({ moduleId, alsoModuleIds }: Props) {
  const meta = moduleMetaById(moduleId);
  const label = meta?.label ?? moduleId;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={meta?.route ?? '/'}
          className="text-xs text-neutral-500 hover:text-fluent"
        >
          ← {label}
        </Link>
        <h1 className="text-2xl font-medium tracking-tight mt-2">
          {label} practice calendar
        </h1>
        <p className="text-neutral-500 text-sm">
          each cell is one day. color tracks how close you came to your daily goal.
        </p>
      </div>

      <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5">
        <PracticeCalendar
          moduleId={moduleId}
          {...(alsoModuleIds !== undefined ? { alsoModuleIds } : {})}
        />
      </section>
    </div>
  );
}
