/**
 * Tailwind class string for inline form inputs (text, select, date)
 * across the goal-form surfaces. Returned from a function so call
 * sites read as `className={inputClass()}` matching existing usage
 * in GoalFormModal — easier mechanical extraction.
 */
export function inputClass(): string {
  return 'w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-fluent/40';
}
