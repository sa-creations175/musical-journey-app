import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from '../../components/Modal';
import {
  db,
  type Goal,
  type GoalScope,
  type GoalStatus,
  type PracticeSessionContext,
  type ProficiencyDefinition,
} from '../../lib/db';
import { MODULE_ORDER, moduleMetaById } from '../../lib/moduleMeta';
import RelatedItemsPicker from './RelatedItemsPicker';
import {
  METRICS,
  METRIC_BY_ID,
  scopesPresentInRelatedItems,
  type MetricType,
} from './metricCatalog';
import { buildSkillRegistry, type SkillRecord } from '../skills/registry';

/**
 * Goal creation / edit modal.
 *
 * Open modes:
 *   - new goal, no scope pre-set    (top "+ Set a goal" button)
 *   - new goal, pre-filled scope    (per-layer "+ Add" / "+ Reflect")
 *   - edit existing goal            (tap on goal in Goals home)
 *
 * Scope determines field set:
 *   - Measurable (≤ 1 year: weekly / monthly / quarterly / yearly):
 *     show all fields including target metric/value/unit/context.
 *   - Vision (> 1 year: two_to_three_year / lifetime): show
 *     description + relatedModules + relatedItems + targetDate
 *     only. Measurable fields are hidden AND cleared when the
 *     goal is saved.
 *
 * Scope-change warning: when editing an existing goal whose scope
 * was measurable, switching the scope to a vision scope clears
 * the measurable fields. The user gets a confirm dialog before
 * the switch takes effect.
 *
 * Items-at-level metric: when targetMetric = 'items_at_level',
 * the level dropdown groups its options by the proficiency scopes
 * present in `relatedItems` (song / skill / production). When no
 * items are selected, all three scope groups appear so the user
 * can pick before they pick items.
 *
 * Phase 1 step 4 scope. Smart parent-goal auto-suggestion lives
 * in Phase 7 (this form just exposes the manual parent dropdown +
 * rollup toggle).
 */

const SCOPE_ORDER: GoalScope[] = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'two_to_three_year',
  'lifetime',
];

const SCOPE_LABEL: Record<GoalScope, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  two_to_three_year: '2 — 3 year',
  lifetime: 'Lifetime',
};

const VISION_SCOPES = new Set<GoalScope>(['two_to_three_year', 'lifetime']);

const CONTEXT_OPTIONS: PracticeSessionContext[] = ['keys', 'laptop', 'phone', 'mixed'];

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, modal opens in edit mode pre-filled from this goal. */
  initialGoal?: Goal | null;
  /** When set (and `initialGoal` is null), modal opens in new-goal
   *  mode with this scope pre-filled. */
  initialScope?: GoalScope | null;
}

interface FormState {
  scope: GoalScope;
  description: string;
  targetMetric: MetricType | '';
  targetValue: string; // input string; parsed to number on save
  targetUnit: string;
  startDate: number;
  targetDate: number;
  contextTag: PracticeSessionContext | '';
  relatedModules: string[];
  relatedItems: string[];
  parentGoalId: string;
  contributesNumericallyToParent: boolean;
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function endOfWeek(now: number): number {
  const d = new Date(now);
  const dayOfWeek = d.getDay(); // 0 = Sunday
  const daysUntilSunday = (7 - dayOfWeek) % 7 || 7;
  d.setDate(d.getDate() + daysUntilSunday);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function endOfMonth(now: number): number {
  const d = new Date(now);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function endOfQuarter(now: number): number {
  const d = new Date(now);
  const q = Math.floor(d.getMonth() / 3);
  d.setMonth(q * 3 + 3, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function endOfYear(now: number): number {
  const d = new Date(now);
  d.setFullYear(d.getFullYear(), 11, 31);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function defaultTargetDate(scope: GoalScope, now: number = Date.now()): number {
  switch (scope) {
    case 'weekly':            return endOfWeek(now);
    case 'monthly':           return endOfMonth(now);
    case 'quarterly':         return endOfQuarter(now);
    case 'yearly':            return endOfYear(now);
    case 'two_to_three_year': return now + 2 * 365 * 24 * 60 * 60 * 1000;
    case 'lifetime':          return now + 30 * 365 * 24 * 60 * 60 * 1000;
  }
}

/** Render an epoch-ms timestamp into the YYYY-MM-DD shape an
 *  `<input type="date">` consumes / emits. */
function dateInputValue(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dateInputToMs(value: string): number | null {
  if (!value) return null;
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  // End-of-day so date comparisons read intuitively.
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function emptyFormState(scope: GoalScope, now: number = Date.now()): FormState {
  return {
    scope,
    description: '',
    targetMetric: '',
    targetValue: '',
    targetUnit: '',
    startDate: now,
    targetDate: defaultTargetDate(scope, now),
    contextTag: '',
    relatedModules: [],
    relatedItems: [],
    parentGoalId: '',
    contributesNumericallyToParent: false,
  };
}

function fromGoal(goal: Goal): FormState {
  return {
    scope: goal.scope,
    description: goal.description,
    targetMetric: (goal.targetMetric as MetricType | null) ?? '',
    targetValue: goal.targetValue !== null && goal.targetValue !== undefined ? String(goal.targetValue) : '',
    targetUnit: goal.targetUnit ?? '',
    startDate: goal.startDate,
    targetDate: goal.targetDate,
    contextTag: goal.contextTag ?? '',
    relatedModules: [...goal.relatedModules],
    relatedItems: [...goal.relatedItems],
    parentGoalId: goal.parentGoalId ?? '',
    contributesNumericallyToParent: goal.contributesNumericallyToParent,
  };
}

export default function GoalFormModal({
  open,
  onClose,
  initialGoal,
  initialScope,
}: Props) {
  const isEdit = Boolean(initialGoal);

  // Form state — initialised on mount/openings, reset on close.
  const [form, setForm] = useState<FormState>(
    () => (initialGoal ? fromGoal(initialGoal) : emptyFormState(initialScope ?? 'monthly')),
  );
  const [pendingScopeChange, setPendingScopeChange] = useState<GoalScope | null>(null);
  const [registry, setRegistry] = useState<SkillRecord[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset form whenever the modal opens with a different
  // initialGoal/initialScope combination.
  const lastGoalIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const newId = initialGoal?.id ?? null;
    // Re-seed when we transition between modes.
    if (newId !== lastGoalIdRef.current || (!initialGoal && !lastGoalIdRef.current)) {
      lastGoalIdRef.current = newId;
      setForm(initialGoal ? fromGoal(initialGoal) : emptyFormState(initialScope ?? 'monthly'));
      setPendingScopeChange(null);
      setConfirmDelete(false);
    }
  }, [open, initialGoal, initialScope]);

  // Load skill registry once for proficiency-aware level dropdown
  // grouping. Kept lightweight so the open is snappy.
  useEffect(() => {
    if (!open || registry !== null) return;
    let cancelled = false;
    void buildSkillRegistry().then(records => {
      if (!cancelled) setRegistry(records);
    }).catch(err => {
      console.warn('[goals] registry load failed in GoalFormModal', err);
    });
    return () => { cancelled = true; };
  }, [open, registry]);

  // Live-query existing goals for the parent dropdown. Filter
  // out the goal being edited (no self-parent) and any goal
  // whose scope isn't strictly above the current form's scope.
  const allGoals = useLiveQuery(
    () => db.goals.where('status').equals('active').toArray(),
    [],
    [] as Goal[],
  );
  const parentCandidates = useMemo(() => {
    if (!allGoals) return [];
    const formIdx = SCOPE_ORDER.indexOf(form.scope);
    return allGoals.filter(g => {
      if (initialGoal && g.id === initialGoal.id) return false;
      const gIdx = SCOPE_ORDER.indexOf(g.scope);
      return gIdx > formIdx;
    });
  }, [allGoals, form.scope, initialGoal]);

  // Live-query proficiency definitions so the level dropdown can
  // render short_labels (with raw level fallback if not yet seeded).
  const proficiencyDefs = useLiveQuery(
    () => db.proficiencyDefinitions.toArray(),
    [],
    [] as ProficiencyDefinition[],
  );

  // Derived: is the current scope a vision scope?
  const isVision = VISION_SCOPES.has(form.scope);

  // Helper: does the form currently hold any measurable data the
  // user would lose if the scope flipped to vision?
  const hasMeasurableData =
    form.targetMetric !== '' ||
    form.targetValue !== '' ||
    form.targetUnit !== '' ||
    form.contextTag !== '';

  const requestScopeChange = (next: GoalScope) => {
    if (next === form.scope) return;
    const goingToVision = VISION_SCOPES.has(next) && !isVision;
    if (goingToVision && hasMeasurableData) {
      // Hold the change pending a confirm dialog.
      setPendingScopeChange(next);
      return;
    }
    setForm(f => ({
      ...f,
      scope: next,
      // When the user explicitly changes scope on a fresh form,
      // refresh the targetDate default to match the new scope.
      // (Existing edits to targetDate are kept when editing an
      // existing goal — they typed a value on purpose.)
      targetDate: initialGoal ? f.targetDate : defaultTargetDate(next),
    }));
  };

  const confirmScopeChange = () => {
    if (!pendingScopeChange) return;
    setForm(f => ({
      ...f,
      scope: pendingScopeChange,
      targetMetric: '',
      targetValue: '',
      targetUnit: '',
      contextTag: '',
      targetDate: initialGoal ? f.targetDate : defaultTargetDate(pendingScopeChange),
    }));
    setPendingScopeChange(null);
  };

  const cancelScopeChange = () => setPendingScopeChange(null);

  // Save handler — assembles the Goal record from form state and
  // upserts via Dexie. Sync hooks queue the cloud push.
  const handleSave = async () => {
    const trimmedDesc = form.description.trim();
    if (trimmedDesc.length === 0) {
      // Required everywhere; no point assembling a ghost goal.
      return;
    }

    const now = Date.now();
    const valueNumeric = form.targetValue.trim() === ''
      ? null
      : Number(form.targetValue);
    const validValue = valueNumeric !== null && Number.isFinite(valueNumeric);

    const visionMode = VISION_SCOPES.has(form.scope);
    const targetMetric = visionMode ? null : (form.targetMetric === '' ? null : form.targetMetric);
    const metricDef = targetMetric ? METRIC_BY_ID.get(targetMetric) ?? null : null;

    let targetUnit: string | null = null;
    if (!visionMode && metricDef) {
      if (metricDef.needsLevel) {
        // For items_at_level, targetUnit holds the level identifier.
        targetUnit = form.targetUnit.trim() === '' ? null : form.targetUnit.trim();
      } else if (metricDef.defaultUnit) {
        targetUnit = metricDef.defaultUnit;
      } else {
        // custom — user-defined unit string
        targetUnit = form.targetUnit.trim() === '' ? null : form.targetUnit.trim();
      }
    }

    const baseRecord: Goal = {
      id: initialGoal?.id ?? makeId('goal'),
      scope: form.scope,
      description: trimmedDesc,
      targetMetric,
      targetValue: visionMode ? null : (validValue ? valueNumeric : null),
      targetUnit,
      currentValue: initialGoal?.currentValue ?? 0,
      contextTag: visionMode ? null : (form.contextTag === '' ? null : form.contextTag),
      relatedModules: [...form.relatedModules],
      relatedItems: [...form.relatedItems],
      startDate: initialGoal?.startDate ?? form.startDate,
      targetDate: form.targetDate,
      status: initialGoal?.status ?? 'active',
      parentGoalId: form.parentGoalId === '' ? null : form.parentGoalId,
      contributesNumericallyToParent: form.contributesNumericallyToParent && form.parentGoalId !== '',
      isUmbrella: initialGoal?.isUmbrella ?? false,
      lastEngagedAt: initialGoal?.lastEngagedAt ?? now,
    };

    try {
      await db.goals.put(baseRecord);
      onClose();
    } catch (err) {
      console.warn('[goals] save failed', err);
    }
  };

  // Soft-delete: status='abandoned' so history remains. Goals home
  // queries status='active' so the goal disappears from the layered
  // display.
  const handleDelete = async () => {
    if (!initialGoal) return;
    try {
      await db.goals.update(initialGoal.id, {
        status: 'abandoned' satisfies GoalStatus,
      });
      onClose();
    } catch (err) {
      console.warn('[goals] delete failed', err);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit goal' : 'Set a goal'}
      footer={
        <div className="flex items-center justify-between gap-2">
          {isEdit ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-needswork">Delete this goal?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-2 py-1 text-xs rounded-md bg-needswork text-white hover:bg-needswork/90"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 text-xs rounded-md text-neutral-500 hover:text-neutral-800"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-neutral-500 hover:text-needswork"
              >
                Delete
              </button>
            )
          ) : <span />}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={form.description.trim() === ''}
              className="px-3 py-1.5 text-sm rounded-md bg-fluent text-white hover:bg-fluent/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isEdit ? 'Save changes' : 'Create goal'}
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={e => { e.preventDefault(); void handleSave(); }} className="flex flex-col gap-4">
        {/* Scope */}
        <Field label="Scope">
          <select
            value={form.scope}
            onChange={e => requestScopeChange(e.target.value as GoalScope)}
            className={inputClass()}
          >
            {SCOPE_ORDER.map(s => (
              <option key={s} value={s}>{SCOPE_LABEL[s]}</option>
            ))}
          </select>
          {isVision && (
            <p className="text-xs text-neutral-500 mt-1 italic">
              Vision-scope goals are open-ended. Measurable targets are for ≤ 1-year horizons.
            </p>
          )}
        </Field>

        {/* Description */}
        <Field label="Description" required>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={isVision ? 4 : 2}
            placeholder={
              isVision
                ? form.scope === 'lifetime'
                  ? 'Your overall vision for musicianship in your life…'
                  : 'Who do you want to become as a musician over the next 2-3 years?'
                : 'What are you setting out to do?'
            }
            className={inputClass()}
            data-autofocus
          />
        </Field>

        {/* Measurable fields — hidden in vision mode */}
        {!isVision && (
          <>
            <Field label="Target metric">
              <select
                value={form.targetMetric}
                onChange={e => {
                  const next = e.target.value as MetricType | '';
                  const def = next === '' ? null : METRIC_BY_ID.get(next) ?? null;
                  setForm(f => ({
                    ...f,
                    targetMetric: next,
                    // Auto-set the unit when metric has a fixed default.
                    targetUnit: def?.defaultUnit ?? (def?.needsLevel ? '' : f.targetUnit),
                  }));
                }}
                className={inputClass()}
              >
                <option value="">Pick one…</option>
                {METRICS.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Target value">
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.targetValue}
                  onChange={e => setForm(f => ({ ...f, targetValue: e.target.value }))}
                  min={0}
                  className={inputClass()}
                />
              </Field>
              <Field label={form.targetMetric === 'items_at_level' ? 'Level' : 'Unit'}>
                {form.targetMetric === 'items_at_level' ? (
                  <LevelSelect
                    value={form.targetUnit}
                    onChange={v => setForm(f => ({ ...f, targetUnit: v }))}
                    relatedItems={form.relatedItems}
                    registry={registry}
                    proficiencyDefs={proficiencyDefs}
                  />
                ) : form.targetMetric === 'custom' ? (
                  <input
                    type="text"
                    value={form.targetUnit}
                    onChange={e => setForm(f => ({ ...f, targetUnit: e.target.value }))}
                    placeholder="e.g., reps, sessions…"
                    className={inputClass()}
                  />
                ) : (
                  <input
                    type="text"
                    value={form.targetUnit}
                    disabled
                    className={`${inputClass()} bg-neutral-50 dark:bg-neutral-900 text-neutral-500`}
                  />
                )}
              </Field>
            </div>

            <Field label="Context">
              <select
                value={form.contextTag}
                onChange={e => setForm(f => ({
                  ...f,
                  contextTag: e.target.value as PracticeSessionContext | '',
                }))}
                className={inputClass()}
              >
                <option value="">No specific context</option>
                {CONTEXT_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
          </>
        )}

        {/* Target date — visible in all modes */}
        <Field label="Target date">
          <input
            type="date"
            value={dateInputValue(form.targetDate)}
            onChange={e => {
              const ms = dateInputToMs(e.target.value);
              if (ms !== null) setForm(f => ({ ...f, targetDate: ms }));
            }}
            className={inputClass()}
          />
        </Field>

        {/* Related modules */}
        <Field label="Related modules">
          <ModuleMultiSelect
            value={form.relatedModules}
            onChange={v => setForm(f => ({ ...f, relatedModules: v }))}
          />
        </Field>

        {/* Related items */}
        <Field label="Related items">
          <RelatedItemsPicker
            selected={form.relatedItems}
            onChange={v => setForm(f => ({ ...f, relatedItems: v }))}
          />
        </Field>

        {/* Parent goal — only shown when at least one candidate exists */}
        {parentCandidates.length > 0 && (
          <Field label="Parent goal">
            <select
              value={form.parentGoalId}
              onChange={e => setForm(f => ({
                ...f,
                parentGoalId: e.target.value,
                // If parent cleared, also clear the rollup toggle.
                contributesNumericallyToParent: e.target.value === '' ? false : f.contributesNumericallyToParent,
              }))}
              className={inputClass()}
            >
              <option value="">No parent</option>
              {parentCandidates.map(g => (
                <option key={g.id} value={g.id}>
                  [{SCOPE_LABEL[g.scope]}] {g.description.slice(0, 60)}
                </option>
              ))}
            </select>
            {form.parentGoalId !== '' && (
              <label className="flex items-center gap-2 mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={form.contributesNumericallyToParent}
                  onChange={e => setForm(f => ({
                    ...f,
                    contributesNumericallyToParent: e.target.checked,
                  }))}
                />
                Roll up progress to parent (when you make progress here, the parent's progress also increments)
              </label>
            )}
          </Field>
        )}
      </form>

      {/* Scope-change-clears-fields confirmation */}
      {pendingScopeChange && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-neutral-900 rounded-card p-5 max-w-sm shadow-xl border border-neutral-200 dark:border-neutral-800">
            <h4 className="text-sm font-medium mb-2">Switch to a vision scope?</h4>
            <p className="text-xs text-neutral-600 dark:text-neutral-300 mb-4">
              Vision-scope goals (lifetime, 2-3 year) don't carry measurable targets.
              Changing to <strong>{SCOPE_LABEL[pendingScopeChange]}</strong> will clear
              the target metric, value, unit, and context. Continue?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelScopeChange}
                className="px-3 py-1.5 text-xs rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmScopeChange}
                className="px-3 py-1.5 text-xs rounded-md bg-needswork text-white hover:bg-needswork/90"
              >
                Switch and clear
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// -------------------------------------------------------------------

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
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

function inputClass(): string {
  return 'w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-fluent/40';
}

// -------------------------------------------------------------------

function LevelSelect({
  value,
  onChange,
  relatedItems,
  registry,
  proficiencyDefs,
}: {
  value: string;
  onChange: (v: string) => void;
  relatedItems: string[];
  registry: SkillRecord[] | null;
  proficiencyDefs: ProficiencyDefinition[];
}) {
  // Map selected items → their moduleIds → scopes-present.
  const itemsByModuleId = useMemo(() => {
    if (!registry) return [] as Array<{ moduleId: string }>;
    const set = new Set(relatedItems);
    return registry
      .filter(r => set.has(r.skillId))
      .map(r => ({ moduleId: r.moduleId }));
  }, [registry, relatedItems]);

  const scopesPresent = scopesPresentInRelatedItems(itemsByModuleId);

  const defsByScope = useMemo(() => {
    const m = new Map<string, ProficiencyDefinition[]>();
    for (const d of proficiencyDefs) {
      const arr = m.get(d.scope) ?? [];
      arr.push(d);
      m.set(d.scope, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.displayOrder - b.displayOrder);
    }
    return m;
  }, [proficiencyDefs]);

  const scopeLabel = (s: string) => s === 'song' ? 'Song levels'
    : s === 'skill' ? 'Skill levels'
    : s === 'production' ? 'Production levels'
    : s;

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={inputClass()}
    >
      <option value="">Pick a level…</option>
      {scopesPresent.map(scope => {
        const defs = defsByScope.get(scope) ?? [];
        if (defs.length === 0) return null;
        return (
          <optgroup key={scope} label={scopeLabel(scope)}>
            {defs.map(d => (
              <option key={d.id} value={d.level}>
                {d.shortLabel}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

// -------------------------------------------------------------------

function ModuleMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const set = new Set(value);
  const toggle = (id: string) => {
    if (set.has(id)) onChange(value.filter(v => v !== id));
    else onChange([...value, id]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {MODULE_ORDER.map(m => {
        const meta = moduleMetaById(m.id);
        const accent = meta?.accentHex ?? '#9ca3af';
        const selected = set.has(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.id)}
            className="text-xs px-2 py-1 rounded-md border transition"
            style={{
              borderColor: selected ? accent : 'transparent',
              backgroundColor: selected ? `${accent}1a` : 'transparent',
              color: selected ? accent : '#6b7280',
            }}
          >
            {selected ? '✓ ' : '+ '}
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
