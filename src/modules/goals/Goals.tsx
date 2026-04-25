import { GOALS_META } from '../../lib/moduleMeta';

/**
 * Goals module — entry point.
 *
 * Phase 1 sub-phase 3 step 2: placeholder header only. The layered
 * Goals home (six scopes, action-up ordering, collapsibility,
 * customize panel) lands in step 3. Goal creation form lands in
 * step 4. Onboarding lands in steps 5–9.
 */
export default function Goals() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-base font-medium"
          style={{
            backgroundColor: `${GOALS_META.accentHex}1a`,
            color: GOALS_META.accentHex,
          }}
        >
          {GOALS_META.icon}
        </span>
        <h1 className="text-2xl font-semibold text-neutral-800 dark:text-neutral-100">
          Goals
        </h1>
      </header>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Coming soon — your goals across every horizon.
      </p>
    </div>
  );
}
