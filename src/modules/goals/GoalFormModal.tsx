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
  type Song,
  type SongCell,
  type SongKey,
  type SongMatrixSection,
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
import { computeSongLevelState } from '../repertoire/matrix/songLevelState';
import {
  CROSS_KEY_PERCENT_DEFAULT,
  buildKeyStateHints,
  decodeSongTarget,
  encodeSongTarget,
  isSongMetric,
  type KeyStateHint,
  type SongTargetSelection,
} from './songTarget';
import Field from './Field';
import { inputClass } from './formStyles';
import SongTargetSection, { SongPreview } from './SongTargetSection';
import {
  SCOPE_ORDER,
  SCOPE_LABEL,
  VISION_SCOPES,
  defaultTargetDate,
  dateInputValue,
  dateInputToMs,
} from './scopeMeta';

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

const CONTEXT_OPTIONS: PracticeSessionContext[] = ['keys', 'laptop', 'phone'];

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
  /**
   * Song-mode selection state (Phase 1 song-goal addendum). Only
   * meaningful when the form's related items resolve to a single
   * song; otherwise these fields are present-but-ignored. Persisted
   * back to the Goal record's targetMetric/targetValue/targetUnit
   * triple via songTarget.encodeSongTarget on save.
   */
  songTarget: SongTargetSelection;
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function defaultSongTarget(): SongTargetSelection {
  return {
    granularity: 'whole',
    wholeOption: null,
    crossKeyPercent: CROSS_KEY_PERCENT_DEFAULT,
    keyTarget: '',
    keyState: 'comfortable',
    sectionId: '',
  };
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
    songTarget: defaultSongTarget(),
  };
}

function fromGoal(goal: Goal): FormState {
  // If the goal already encodes a song-mode target, prime the
  // song selection so re-opening for edit shows the same picks.
  // Otherwise leave the generic targetMetric/value/unit primed and
  // the song selection at defaults.
  const decoded = decodeSongTarget(goal);
  const songInMetric = isSongMetric(goal.targetMetric);
  return {
    scope: goal.scope,
    description: goal.description,
    targetMetric: songInMetric ? '' : ((goal.targetMetric as MetricType | null) ?? ''),
    targetValue: songInMetric || goal.targetValue === null || goal.targetValue === undefined
      ? ''
      : String(goal.targetValue),
    targetUnit: songInMetric ? '' : (goal.targetUnit ?? ''),
    startDate: goal.startDate,
    targetDate: goal.targetDate,
    contextTag: goal.contextTag ?? '',
    relatedModules: [...goal.relatedModules],
    relatedItems: [...goal.relatedItems],
    parentGoalId: goal.parentGoalId ?? '',
    contributesNumericallyToParent: goal.contributesNumericallyToParent,
    songTarget: decoded ?? defaultSongTarget(),
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

  // Song-mode detection: when relatedItems is exactly one item and
  // that item is a repertoire song, the form swaps the generic
  // target fields for the addendum's granularity-aware song UI.
  // Anything else (multi-item, non-song item, no items) → generic
  // flow.
  const songItemId = useMemo<string | null>(() => {
    if (form.relatedItems.length !== 1) return null;
    if (!registry) return null;
    const skillId = form.relatedItems[0];
    const rec = registry.find(r => r.skillId === skillId);
    if (!rec || rec.moduleId !== 'repertoire') return null;
    return rec.itemId;
  }, [form.relatedItems, registry]);

  const songRecord = useLiveQuery<Song | undefined>(
    async () => {
      if (!songItemId) return undefined;
      return await db.songs.get(songItemId);
    },
    [songItemId],
  );

  const isSongMode = !isVision && songItemId !== null;
  const songMissing = isSongMode && songItemId !== null && songRecord === undefined;

  // Matrix live queries — feeds the section picker, key-state hints,
  // and matrix-aware whole-song option tags. All scoped to the
  // resolved song; gated on songItemId so we don't fan out queries
  // for non-song goals. Generic dropped per the codebase pattern —
  // the default-value cast carries the type for the consumers.
  const matrixSongKeys = useLiveQuery(
    () => {
      if (!songItemId) return [] as SongKey[];
      return db.songKeys.where('songId').equals(songItemId).toArray();
    },
    [songItemId],
    [] as SongKey[],
  );
  const matrixSongCells = useLiveQuery(
    () => {
      if (!songItemId) return [] as SongCell[];
      return db.songCells.where('songId').equals(songItemId).toArray();
    },
    [songItemId],
    [] as SongCell[],
  );
  const matrixSections = useLiveQuery(
    () => {
      if (!songItemId) return [] as SongMatrixSection[];
      return db.songMatrixSections.where('songId').equals(songItemId).sortBy('displayOrder');
    },
    [songItemId],
    [] as SongMatrixSection[],
  );

  // Date.now() snapshot for live-derived decay. Lazy useState
  // initializer satisfies the purity rule. Stays at mount-time —
  // fine for daily-resolution decay; if the user keeps the form
  // open past a threshold, a re-mount will refresh.
  const [now] = useState(() => Date.now());

  // Section granularity is now lit up — available whenever the song
  // has at least one non-archived section. Per Phase 1 design, also
  // gated on weekly scope (granularity is too tactical for longer
  // horizons).
  const visibleMatrixSections = useMemo(
    () => matrixSections.filter(s => !s.isArchived),
    [matrixSections],
  );
  const sectionAvailable = visibleMatrixSections.length > 0;
  const sectionWeeklyEligible = form.scope === 'weekly';

  // Matrix-derived song level + per-key hints. Computed only when in
  // song mode so non-song goals don't pay the cost.
  const songLevelState = useMemo(
    () => isSongMode
      ? computeSongLevelState(matrixSongKeys, matrixSongCells, visibleMatrixSections.length, now)
      : null,
    [isSongMode, matrixSongKeys, matrixSongCells, visibleMatrixSections.length, now],
  );
  const originalMatrixKey = useMemo(
    () => matrixSongKeys.find(k => k.isOriginalKey) ?? null,
    [matrixSongKeys],
  );
  const keyStateHints = useMemo(
    () => isSongMode ? buildKeyStateHints(matrixSongKeys, now) : new Map<string, KeyStateHint>(),
    [isSongMode, matrixSongKeys, now],
  );
  const sectionNamesById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of visibleMatrixSections) m.set(s.id, s.name);
    return m;
  }, [visibleMatrixSections]);

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

  // Encode the song target (when applicable) once, so both Save and
  // the disabled-state of the Save button see the same answer.
  const songEncoded = useMemo(
    () => (isSongMode ? encodeSongTarget(form.songTarget) : null),
    [isSongMode, form.songTarget],
  );

  // Save handler — assembles the Goal record from form state and
  // upserts via Dexie. Sync hooks queue the cloud push.
  const handleSave = async () => {
    const trimmedDesc = form.description.trim();
    if (isSongMode && !songEncoded) {
      // Song mode active but the user hasn't fully picked a target.
      // The Save button should already be disabled; this guards
      // against keyboard-submit (Enter inside an input).
      return;
    }

    const now = Date.now();
    const visionMode = VISION_SCOPES.has(form.scope);

    let targetMetric: string | null;
    let targetValue: number | null;
    let targetUnit: string | null;
    let contextTag: PracticeSessionContext | null;

    if (visionMode) {
      targetMetric = null;
      targetValue = null;
      targetUnit = null;
      contextTag = null;
    } else if (isSongMode && songEncoded) {
      targetMetric = songEncoded.targetMetric;
      targetValue = songEncoded.targetValue;
      targetUnit = songEncoded.targetUnit;
      // Songs are always practiced at the keyboard. The generic
      // context picker is hidden in song mode; we record 'keys' so
      // downstream filtering by context still works.
      contextTag = 'keys';
    } else {
      const valueNumeric = form.targetValue.trim() === '' ? null : Number(form.targetValue);
      const validValue = valueNumeric !== null && Number.isFinite(valueNumeric);
      targetMetric = form.targetMetric === '' ? null : form.targetMetric;
      targetValue = validValue ? valueNumeric : null;

      const metricDef = targetMetric ? METRIC_BY_ID.get(targetMetric) ?? null : null;
      if (metricDef) {
        if (metricDef.needsLevel) {
          targetUnit = form.targetUnit.trim() === '' ? null : form.targetUnit.trim();
        } else if (metricDef.defaultUnit) {
          targetUnit = metricDef.defaultUnit;
        } else {
          targetUnit = form.targetUnit.trim() === '' ? null : form.targetUnit.trim();
        }
      } else {
        targetUnit = null;
      }
      contextTag = form.contextTag === '' ? null : form.contextTag;
    }

    const baseRecord: Goal = {
      id: initialGoal?.id ?? makeId('goal'),
      scope: form.scope,
      description: trimmedDesc,
      targetMetric,
      targetValue,
      targetUnit,
      currentValue: initialGoal?.currentValue ?? 0,
      contextTag,
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

  const saveDisabled = isSongMode && !songEncoded;

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
              disabled={saveDisabled}
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
        <Field label="Description">
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

        {/* Measurable fields — hidden in vision mode. In song mode
            the generic metric/value/unit/context block is replaced
            by the addendum's granularity-aware song target UI. */}
        {!isVision && !isSongMode && (
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

        {isSongMode && (
          <SongTargetSection
            song={songRecord}
            songMissing={songMissing}
            selection={form.songTarget}
            onChange={next => setForm(f => ({ ...f, songTarget: next }))}
            sectionAvailable={sectionAvailable}
            sectionWeeklyEligible={sectionWeeklyEligible}
            songLevelState={songLevelState}
            originalMatrixKey={originalMatrixKey}
            visibleMatrixSections={visibleMatrixSections}
            keyStateHints={keyStateHints}
            now={now}
          />
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

        {/* Song-mode preview — addendum requires a natural-language
            confirmation of what the goal will mean before Save. */}
        {isSongMode && songRecord && (
          <SongPreview
            selection={form.songTarget}
            song={songRecord}
            sectionNamesById={sectionNamesById}
          />
        )}

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

