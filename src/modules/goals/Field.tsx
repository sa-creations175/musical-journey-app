import type { ReactNode } from 'react';

/**
 * Form field wrapper — label above its child input. Shared across
 * the goal-form surfaces (GoalFormModal, GoalCreationFlow Step 2+).
 * Lives in its own file so callers can import it without dragging in
 * the heavy GoalFormModal module, and so the react-refresh rule
 * stays clean.
 */
export default function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
        {label}{required && <span className="text-needswork"> *</span>}
      </span>
      {children}
    </label>
  );
}
