import type { GoalScope } from '../../lib/db';

/**
 * Small colored pill that surfaces a goal's timeframe in modal
 * headers (GoalSuggestionFlow, GoalCreationFlow). The color hint
 * gives the user an at-a-glance read of which horizon they're
 * editing without having to parse the title text:
 *
 *   weekly      → sky blue
 *   monthly     → emerald (teal-green)
 *   quarterly   → amber
 *   yearly      → purple
 *   2–3 year /  → neutral grey (aspirational, no time pressure)
 *   lifetime
 *
 * Styling matches the existing pill/chip language in atoms.tsx
 * (light bg + saturated text, with subtler dark-mode variants).
 */
const SCOPE_LABEL: Record<GoalScope, string> = {
  weekly:            'Weekly',
  monthly:           'Monthly',
  quarterly:         'Quarterly',
  yearly:            'Yearly',
  two_to_three_year: '2–3 years',
  lifetime:          'Lifetime',
};

const SCOPE_CLASS: Record<GoalScope, string> = {
  weekly:            'bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300',
  monthly:           'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300',
  quarterly:         'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  yearly:            'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  two_to_three_year: 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300',
  lifetime:          'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300',
};

export function ScopePill({ scope }: { scope: GoalScope }) {
  const label = SCOPE_LABEL[scope];
  const colorClass = SCOPE_CLASS[scope];
  return (
    <span
      className={`inline-flex items-center text-[10px] uppercase tracking-wide font-medium rounded-full px-2 py-0.5 ${colorClass}`}
    >
      {label}
    </span>
  );
}
