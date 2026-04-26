import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Goal, type GoalStatus } from '../../../lib/db';
import { MODULE_ORDER, moduleMetaById } from '../../../lib/moduleMeta';
import { describeGoalTarget } from '../describeGoal';
import GoalFormModal from '../GoalFormModal';

/**
 * Onboarding Screen 1 — this-month focus.
 *
 * Two prompt cards plus the user's accumulating list of monthly
 * goals. Per the April 25 design review:
 *
 *  - Prompt cards expand inline mini-forms (not modals) where they
 *    can; complex flows fall back to the full GoalFormModal.
 *  - Each goal added persists immediately and is editable from the
 *    accumulating list.
 *
 * Phase 1 ships two prompt cards:
 *
 *  1. "Improve a specific area" — measurable variant, opens an
 *     inline mini-form: optional improvement text + required
 *     modules + required monthly hour target. Maps to a
 *     `hours_on_modules` monthly goal.
 *  2. "Set a custom goal" — opens the full GoalFormModal in monthly
 *     create mode for the rest of the targeting space (level
 *     targets, song goals, count completed, etc.).
 *
 * Adding more prompt cards in future phases is additive; the
 * accumulating list and persistence path remain unchanged.
 */

interface Props {
  /** Live list of the user's currently-active monthly goals. */
  monthlyGoals: Goal[];
}

type ExpandedCard = 'improve' | null;

export default function Screen1Goals({ monthlyGoals }: Props) {
  const [expanded, setExpanded] = useState<ExpandedCard>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
          What's on your mind for this month?
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">
          Pick a card to add a monthly focus. You can add as many as you
          want — and edit or remove them anytime.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <PromptCard
          title="Improve a specific area"
          description="Set a monthly hour target for one or more modules — e.g., 8 hours on ear training."
          expanded={expanded === 'improve'}
          onToggle={() => setExpanded(expanded === 'improve' ? null : 'improve')}
        >
          <ImproveAreaMiniForm onAdded={() => setExpanded(null)} />
        </PromptCard>

        <PromptCard
          title="Set a custom goal"
          description="Anything else — level targets, song goals, count completed, custom metrics."
          onToggle={() => setCustomOpen(true)}
        />
      </div>

      <GoalAccumulator
        goals={monthlyGoals}
        onEdit={g => setEditingGoal(g)}
      />

      {/* Full goal form for the "Set a custom goal" path and editing. */}
      <GoalFormModal
        open={customOpen || editingGoal !== null}
        onClose={() => {
          setCustomOpen(false);
          setEditingGoal(null);
        }}
        initialGoal={editingGoal}
        initialScope={editingGoal ? null : 'monthly'}
      />
    </div>
  );
}

// -------------------------------------------------------------------

function PromptCard({
  title,
  description,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  /** When undefined the card is single-action (click → onToggle).
   *  When defined the card has an expand-collapse state. */
  expanded?: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const expandable = expanded !== undefined;
  return (
    <div className={[
      'rounded-md border transition',
      expanded
        ? 'border-fluent bg-fluent/5'
        : 'border-neutral-200 dark:border-neutral-800',
    ].join(' ')}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 flex items-start gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 rounded-md"
      >
        <div className="flex-1">
          <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
            {title}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            {description}
          </div>
        </div>
        {expandable && (
          <span aria-hidden className="text-neutral-400 mt-0.5">
            {expanded ? '–' : '+'}
          </span>
        )}
      </button>
      {expanded && children && (
        <div className="px-3 pb-3 pt-1 border-t border-fluent/30">
          {children}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------

function ImproveAreaMiniForm({ onAdded }: { onAdded: () => void }) {
  const [text, setText] = useState('');
  const [modules, setModules] = useState<string[]>([]);
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);

  const numericHours = Number(hours);
  const validHours = hours.trim() !== '' && Number.isFinite(numericHours) && numericHours > 0;
  const canAdd = modules.length > 0 && validHours;

  const handleAdd = async () => {
    if (!canAdd || busy) return;
    setBusy(true);
    try {
      const now = Date.now();
      const description = text.trim() === ''
        ? `Spend ${numericHours} ${numericHours === 1 ? 'hour' : 'hours'} on ${modulesToText(modules)}`
        : text.trim();
      const goal: Goal = {
        id: `goal-improve-${Math.random().toString(36).slice(2, 8)}-${now.toString(36)}`,
        scope: 'monthly',
        description,
        targetMetric: 'hours_on_modules',
        targetValue: numericHours,
        targetUnit: 'hours',
        currentValue: 0,
        contextTag: null,
        relatedModules: [...modules],
        relatedItems: [],
        startDate: now,
        targetDate: endOfMonth(now),
        status: 'active' satisfies GoalStatus,
        parentGoalId: null,
        contributesNumericallyToParent: false,
        isUmbrella: false,
        lastEngagedAt: now,
      };
      await db.goals.put(goal);
      // Reset form for the next prompt-card add.
      setText('');
      setModules([]);
      setHours('');
      onAdded();
    } catch (err) {
      console.warn('[onboarding] improve-area add failed', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 mt-2">
      <Field label="What are you improving?" optional>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="e.g. tighten my chord recognition"
          className={inputClass()}
        />
      </Field>

      <Field label="Modules" required>
        <ModuleChips selected={modules} onChange={setModules} />
      </Field>

      <Field label="Monthly hour target" required>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={0.5}
          value={hours}
          onChange={e => setHours(e.target.value)}
          placeholder="e.g. 8"
          className={inputClass()}
        />
      </Field>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd || busy}
          className="px-3 py-1.5 text-sm rounded-md bg-fluent text-white hover:bg-fluent/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add monthly goal
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------

function GoalAccumulator({
  goals,
  onEdit,
}: {
  goals: Goal[];
  onEdit: (g: Goal) => void;
}) {
  const proficiencyDefs = useLiveQuery(
    () => db.proficiencyDefinitions.toArray(),
    [],
  );

  if (goals.length === 0) {
    return (
      <p className="text-xs text-neutral-500 italic">
        No monthly goals yet. Pick a card above to add one.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
        Monthly goals so far
      </span>
      <ul className="flex flex-col gap-1">
        {goals.map(g => {
          const target = describeGoalTarget(g, proficiencyDefs);
          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onEdit(g)}
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
    </div>
  );
}

// -------------------------------------------------------------------

function ModuleChips({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const set = new Set(selected);
  const toggle = (id: string) => {
    if (set.has(id)) onChange(selected.filter(v => v !== id));
    else onChange([...selected, id]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {MODULE_ORDER.map(m => {
        const meta = moduleMetaById(m.id);
        const accent = meta?.accentHex ?? '#9ca3af';
        const isSelected = set.has(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.id)}
            className="text-xs px-2 py-1 rounded-md border transition"
            style={{
              borderColor: isSelected ? accent : 'transparent',
              backgroundColor: isSelected ? `${accent}1a` : 'transparent',
              color: isSelected ? accent : '#6b7280',
            }}
          >
            {isSelected ? '✓ ' : '+ '}{m.label}
          </button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------

function modulesToText(ids: string[]): string {
  const labels = ids
    .map(id => moduleMetaById(id)?.label ?? id)
    .filter(Boolean);
  if (labels.length === 0) return 'selected modules';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function endOfMonth(now: number): number {
  const d = new Date(now);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
        {label}
        {required && <span className="text-needswork"> *</span>}
        {optional && <span className="text-neutral-400 font-normal"> (optional)</span>}
      </span>
      {children}
    </label>
  );
}

function inputClass(): string {
  return 'w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-fluent/40';
}
