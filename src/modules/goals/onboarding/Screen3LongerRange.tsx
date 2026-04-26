import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Goal, type GoalScope, type ProficiencyDefinition } from '../../../lib/db';
import { describeGoalTarget } from '../describeGoal';
import GoalFormModal from '../GoalFormModal';

/**
 * Onboarding Screen 3 — longer-range opt-in (yearly / 2-3 year /
 * lifetime).
 *
 * Fully optional: the user can finish without adding anything. For
 * each scope we show a button that opens the full GoalFormModal
 * pre-scoped, plus an accumulating list of any goals already saved
 * at that scope. The 2-3 year and lifetime scopes use the modal's
 * vision-mode form variant (text-only, no measurable fields).
 */

interface Props {
  /** Live list of the user's currently-active goals at any scope. */
  allGoals: Goal[];
}

const LONG_SCOPES: ReadonlyArray<{ scope: GoalScope; title: string; cta: string; hint: string }> = [
  {
    scope: 'yearly',
    title: 'A goal for this year',
    cta: '+ Add a yearly goal',
    hint: 'Measurable annual focus — items at a level, hours on modules, count completed.',
  },
  {
    scope: 'two_to_three_year',
    title: '2–3 year direction',
    cta: '+ Reflect on 2–3 years',
    hint: 'Where you want to be as a musician on a 2-3 year horizon. Open text — no numbers.',
  },
  {
    scope: 'lifetime',
    title: 'Lifetime vision',
    cta: '+ Reflect on a lifetime vision',
    hint: 'Your overall vision for music in your life. Open text — no numbers.',
  },
];

export default function Screen3LongerRange({ allGoals }: Props) {
  const [createScope, setCreateScope] = useState<GoalScope | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const proficiencyDefs = useLiveQuery(
    () => db.proficiencyDefinitions.toArray(),
    [],
    [] as ProficiencyDefinition[],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
          Want to capture longer-range thinking?
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">
          Optional. Skip this if you're not ready — you can always add longer
          horizons from the Goals home later.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {LONG_SCOPES.map(({ scope, title, cta, hint }) => {
          const goalsAtScope = allGoals.filter(g => g.scope === scope);
          return (
            <section
              key={scope}
              className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3"
            >
              <header className="mb-2">
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                  {title}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>
              </header>

              {goalsAtScope.length > 0 && (
                <ul className="flex flex-col gap-1 mb-2">
                  {goalsAtScope.map(g => {
                    const target = describeGoalTarget(g, proficiencyDefs);
                    return (
                      <li key={g.id}>
                        <button
                          type="button"
                          onClick={() => setEditingGoal(g)}
                          className="w-full text-left px-2 py-1.5 -mx-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition"
                        >
                          <div className="text-sm text-neutral-700 dark:text-neutral-200">
                            {g.description || <span className="italic text-neutral-500">(untitled goal)</span>}
                          </div>
                          {target && (
                            <div className="text-xs text-neutral-500 mt-0.5">{target}</div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <button
                type="button"
                onClick={() => setCreateScope(scope)}
                className="text-sm text-fluent hover:underline"
              >
                {cta}
              </button>
            </section>
          );
        })}
      </div>

      <GoalFormModal
        open={createScope !== null || editingGoal !== null}
        onClose={() => {
          setCreateScope(null);
          setEditingGoal(null);
        }}
        initialGoal={editingGoal}
        initialScope={editingGoal ? null : createScope}
      />
    </div>
  );
}
