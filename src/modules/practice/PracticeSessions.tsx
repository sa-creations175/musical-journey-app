import { PRACTICE_SESSIONS_META } from '../../lib/moduleMeta';
import GoalsNudgeBanner from './GoalsNudgeBanner';
import ManualLogForm from './ManualLogForm';
import RecentSessionsList from './RecentSessionsList';
import VacationManager from './VacationManager';

/**
 * Practice Sessions page (sub-phase 4).
 *
 * Phase 1 ships this as a placeholder: the session generator + timer
 * + algorithm-driven plans don't exist yet (Phase 3+). What lives
 * here today is the data plumbing — manual session logging that
 * round-trips through `practiceSessions` + `practiceBlocks`, the
 * vacation toggle (Q2 truth-honoring stance, no spacing pause), an
 * inline goals nudge for users who haven't declared any (Q7), and a
 * peek at recent sessions.
 *
 * Layout order top-to-bottom:
 *
 *   header               — accent + title
 *   coming-soon strip    — sets expectations honestly
 *   goals nudge          — only if no active goals AND not recently dismissed
 *   active vacation      — only if today is inside any vacation period
 *   manual log form      — collapsed by default ("+ Log a session")
 *   recent sessions      — last five (empty-state friendly)
 *   plan a vacation      — only when no active vacation; collapsed by default
 *
 * Each piece is self-contained — they share no state, just live-query
 * Dexie independently, so the page composition is purely declarative.
 */

export default function PracticeSessions() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-base font-medium"
          style={{
            backgroundColor: `${PRACTICE_SESSIONS_META.accentHex}1a`,
            color: PRACTICE_SESSIONS_META.accentHex,
          }}
        >
          {PRACTICE_SESSIONS_META.icon}
        </span>
        <h1 className="text-2xl font-semibold text-neutral-800 dark:text-neutral-100 flex-1">
          Practice Sessions
        </h1>
      </header>

      <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 px-4 py-3 mb-5">
        <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          Coming soon — session generator and timer.
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
          The full Practice Sessions experience — recommendations shaped by your
          goals, energy, and freshness — arrives in a later release. For now you
          can log sessions manually and plan vacations.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <GoalsNudgeBanner />
        <VacationManager />
        <ManualLogForm />
        <RecentSessionsList />
      </div>
    </div>
  );
}
