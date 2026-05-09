import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { db, type Goal, type GoalScope, type PracticeSessionContext } from '../../lib/db';
import { harmonicFluencyCounts } from '../../lib/moduleItemCounts';
import {
  CategoryPillButton,
  ConsistencyTargetCard,
  PillButton,
  ToggleCard,
} from './atoms';
import {
  defaultTargetDate,
  dateInputValue,
  SCOPE_LABEL,
} from './scopeMeta';
import { AccuracySlider } from './yearlyAnchorDimensions';
import {
  encodeRecordsForDraft,
  type EncodedRecord,
  type HarmonicFluencyTarget,
} from './GoalCreationFlow';
import { findAnchorGoalForModule } from './anchorLookup';
import { suggestHfMonthly } from './suggestions/hfMonthly';
import { CATEGORY_LABELS, type FlashcardCategory } from '../harmonic-fluency/catalog';
import { moduleMetaById, PRACTICE_SESSIONS_META, DASHBOARD_META } from '../../lib/moduleMeta';

/**
 * GoalSuggestionFlow — single-screen suggestion-driven creation flow
 * for weekly / monthly / quarterly goals. Replaces the 5-step
 * GoalCreationFlow wizard for short-horizon goals. Yearly /
 * 2-3 year / lifetime goals continue to use the wizard.
 *
 * v1 scope: monthly + Harmonic Fluency only. Other scope/module
 * combinations render a placeholder with a "coming soon" note —
 * the surrounding shell (header, anchor, target date, save plumbing)
 * is fully wired so subsequent modules just plug in their suggestion
 * + edit UI without touching framework code.
 *
 * Architectural anchors (per spec):
 *   · Scope, module, and anchor are KNOWN at flow open — caller
 *     pre-decides via the Goals.tsx entry-point UX.
 *   · Anchor is auto-connected (parent_goal_id = anchor.id) — no
 *     parent picker step.
 *   · No anchor for the module → block flow entry; route to
 *     YearlyAnchorFlow first.
 *   · Target date pre-fills to end of period (defaultTargetDate).
 *   · Save reuses the wizard's encoder (encodeRecordsForDraft),
 *     wraps each EncodedRecord into a Goal row with the
 *     auto-connected parent + flow-supplied scope/date/context.
 */

type SuggestionFlowModule =
  | 'harmonic-fluency'
  | 'ear-training'
  | 'shapes-and-patterns'
  | 'repertoire'
  | 'production'
  | 'practice-consistency';

type ShortScope = Extract<GoalScope, 'weekly' | 'monthly' | 'quarterly'>;

interface Props {
  open: boolean;
  onClose: () => void;
  scope: ShortScope;
  moduleId: SuggestionFlowModule;
  onSaved?: () => void;
}

const HF_COUNTS = harmonicFluencyCounts();

interface HfCoverageGroupOption {
  id: string;
  label: string;
  denominator: number;
  accentHex: string;
}

const HF_COVERAGE_GROUPS: ReadonlyArray<HfCoverageGroupOption> = [
  { id: 'foundational',       label: 'foundational / math',  denominator: HF_COUNTS.byGroup.foundational,      accentHex: DASHBOARD_META.accentHex },
  { id: 'chord-knowledge',    label: 'chord knowledge',      denominator: HF_COUNTS.byGroup.chordKnowledge,    accentHex: moduleMetaById('repertoire')?.accentHex ?? '#a8556b' },
  { id: 'functional-applied', label: 'functional / applied', denominator: HF_COUNTS.byGroup.functionalApplied, accentHex: PRACTICE_SESSIONS_META.accentHex },
  { id: 'ear-recognition',    label: 'ear & recognition',    denominator: HF_COUNTS.byGroup.earRecognition,    accentHex: moduleMetaById('ear-training')?.accentHex ?? '#5a8752' },
];

const MODULE_LABEL: Record<SuggestionFlowModule, string> = {
  'harmonic-fluency':    'Harmonic Fluency',
  'ear-training':        'Ear Training',
  'shapes-and-patterns': 'Shapes & Patterns',
  'repertoire':          'Song Repertoire',
  'production':          'Production',
  'practice-consistency':'Practice consistency',
};

function contextForSuggestionModule(id: SuggestionFlowModule): PracticeSessionContext | null {
  switch (id) {
    case 'harmonic-fluency':     return 'mixed';
    case 'ear-training':         return 'mixed';
    case 'shapes-and-patterns':  return 'keys';
    case 'repertoire':           return 'mixed';
    case 'production':           return 'laptop';
    case 'practice-consistency': return null;
  }
}

function relatedModulesForSuggestion(id: SuggestionFlowModule): string[] {
  if (id === 'practice-consistency') return [];
  return [id];
}

export default function GoalSuggestionFlow({
  open,
  onClose,
  scope,
  moduleId,
  onSaved,
}: Props) {
  const [anchorState, setAnchorState] = useState<
    { kind: 'loading' } | { kind: 'missing' } | { kind: 'ready'; goal: Goal }
  >({ kind: 'loading' });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAnchorState({ kind: 'loading' });
    findAnchorGoalForModule(moduleId).then(g => {
      if (cancelled) return;
      setAnchorState(g ? { kind: 'ready', goal: g } : { kind: 'missing' });
    });
    return () => { cancelled = true; };
  }, [open, moduleId]);

  if (!open) return null;

  const title = `New ${SCOPE_LABEL[scope].toLowerCase()} ${MODULE_LABEL[moduleId]} goal`;

  if (anchorState.kind === 'loading') {
    return (
      <Modal open onClose={onClose} title={title}>
        <div className="text-sm text-neutral-500 italic">Loading…</div>
      </Modal>
    );
  }

  if (anchorState.kind === 'missing') {
    return (
      <Modal open onClose={onClose} title={title}>
        <MissingAnchorBlocker
          moduleLabel={MODULE_LABEL[moduleId]}
          scope={scope}
          onClose={onClose}
        />
      </Modal>
    );
  }

  // Anchor is ready. Route to the per-module body. v1 only handles
  // monthly + harmonic-fluency end-to-end; other combos show a
  // placeholder until their suggestion logic + edit UI is built.
  if (moduleId === 'harmonic-fluency' && scope === 'monthly') {
    return (
      <HarmonicFluencyMonthlyBody
        anchor={anchorState.goal}
        scope={scope}
        moduleId={moduleId}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <ComingSoonPlaceholder
        moduleLabel={MODULE_LABEL[moduleId]}
        scope={scope}
        anchor={anchorState.goal}
      />
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Blockers + placeholders
// ---------------------------------------------------------------------

function MissingAnchorBlocker({
  moduleLabel,
  scope,
  onClose,
}: {
  moduleLabel: string;
  scope: ShortScope;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-700 dark:text-neutral-200">
        {SCOPE_LABEL[scope]} {moduleLabel} goals auto-connect to your yearly
        {' '}{moduleLabel} anchor — but you don't have one yet.
      </p>
      <p className="text-sm text-neutral-700 dark:text-neutral-200">
        Set the yearly anchor first, then come back here.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function ComingSoonPlaceholder({
  moduleLabel,
  scope,
  anchor,
}: {
  moduleLabel: string;
  scope: ShortScope;
  anchor: Goal;
}) {
  return (
    <div className="space-y-3 text-sm text-neutral-700 dark:text-neutral-200">
      <p>
        {SCOPE_LABEL[scope]} {moduleLabel} suggestion flow is not yet wired up.
      </p>
      <p className="text-xs text-neutral-500">
        Anchor would auto-connect to: <span className="font-medium">{anchor.description}</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------
// Harmonic Fluency — monthly body
// ---------------------------------------------------------------------

function HarmonicFluencyMonthlyBody({
  anchor,
  scope,
  moduleId,
  onClose,
  onSaved,
}: {
  anchor: Goal;
  scope: ShortScope;
  moduleId: SuggestionFlowModule;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const initialSuggestion = useMemo(() => suggestHfMonthly(), []);
  const [target, setTarget] = useState<HarmonicFluencyTarget>(initialSuggestion.target);
  const [targetDate, setTargetDate] = useState<number>(defaultTargetDate(scope));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const records = useMemo(
    () => encodeHfTargetForRecords(target),
    [target],
  );
  const canSave = records.length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await persistSuggestionGoal({
        records,
        scope,
        moduleId,
        targetDate,
        anchorGoalId: anchor.id,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[GoalSuggestionFlow] save failed', err);
      setSaveError('Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const title = `New ${SCOPE_LABEL[scope].toLowerCase()} Harmonic Fluency goal`;

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-4">
        {initialSuggestion.contextLines.length > 0 && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1">
            {initialSuggestion.contextLines.map((line, idx) => (
              <p key={idx}>{line}</p>
            ))}
          </div>
        )}

        <FocusSection target={target} onChange={setTarget} />

        <AlsoAddRow
          target={target}
          onChange={setTarget}
        />

        {target.accuracyEnabled && (
          <AccuracySection target={target} onChange={setTarget} />
        )}

        {target.consistencyEnabled && (
          <ConsistencyTargetCard target={target} onChange={setTarget} />
        )}

        <AnchorPanel anchor={anchor} />

        <TargetDateField
          value={targetDate}
          onChange={setTargetDate}
        />

        {saveError && (
          <p className="text-xs text-needswork">{saveError}</p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className={`px-4 py-1.5 rounded-md text-sm font-medium text-white ${
              canSave ? 'bg-fluent hover:opacity-90' : 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving…' : 'Save goal'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Focus section — pre-populated suggestion, editable
// ---------------------------------------------------------------------

function FocusSection({
  target,
  onChange,
}: {
  target: HarmonicFluencyTarget;
  onChange: (next: HarmonicFluencyTarget) => void;
}) {
  const setScope = (s: 'overall' | 'specific') => {
    if (s === target.coverageScope) return;
    onChange({
      ...target,
      coverageScope: s,
      coverageGroupIds: s === 'overall' ? [] : target.coverageGroupIds,
    });
  };
  const toggleGroup = (id: string) => {
    const next = target.coverageGroupIds.includes(id)
      ? target.coverageGroupIds.filter(x => x !== id)
      : [...target.coverageGroupIds, id];
    onChange({ ...target, coverageGroupIds: next });
  };

  return (
    <section className="rounded-md border border-fluent/30 bg-fluent/5 p-3 space-y-3">
      <header>
        <div className="text-[10px] uppercase tracking-wide text-fluent">
          Focus
        </div>
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          Cover cards to acquired stage
        </div>
      </header>

      <div className="flex gap-1.5 flex-wrap">
        <PillButton
          label={`All of harmonic fluency (${HF_COUNTS.total} items)`}
          active={target.coverageScope === 'overall'}
          onClick={() => setScope('overall')}
        />
        <PillButton
          label="One or more groups"
          active={target.coverageScope === 'specific'}
          onClick={() => setScope('specific')}
        />
      </div>

      {target.coverageScope === 'specific' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {HF_COVERAGE_GROUPS.map(group => (
            <CategoryPillButton
              key={group.id}
              label={`${group.label} (${group.denominator} items)`}
              accentHex={group.accentHex}
              active={target.coverageGroupIds.includes(group.id)}
              onClick={() => toggleGroup(group.id)}
              selectedStyle="accent"
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// "Also add" pills
// ---------------------------------------------------------------------

function AlsoAddRow({
  target,
  onChange,
}: {
  target: HarmonicFluencyTarget;
  onChange: (next: HarmonicFluencyTarget) => void;
}) {
  const showAccuracy = !target.accuracyEnabled;
  const showConsistency = !target.consistencyEnabled;
  if (!showAccuracy && !showConsistency) return null;

  return (
    <div className="flex gap-1.5 flex-wrap">
      {showAccuracy && (
        <PillButton
          label="+ Also add accuracy target"
          active={false}
          onClick={() => onChange({ ...target, accuracyEnabled: true })}
        />
      )}
      {showConsistency && (
        <PillButton
          label="+ Also add consistency target"
          active={false}
          onClick={() => onChange({ ...target, consistencyEnabled: true })}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Accuracy section (only shown when accuracyEnabled)
// ---------------------------------------------------------------------

const ACCURACY_PCT_MIN = 50;
const ACCURACY_PCT_MAX = 100;
const ACCURACY_PCT_STEP = 5;

interface HarmonicFluencyGroup {
  id: string;
  title: string;
  accentHex: string;
  categories: ReadonlyArray<FlashcardCategory>;
}

const HARMONIC_FLUENCY_GROUPS: ReadonlyArray<HarmonicFluencyGroup> = [
  {
    id: 'foundational',
    title: 'Foundational / Math',
    accentHex: DASHBOARD_META.accentHex,
    categories: ['scale-degree-math', 'named-notes', 'key-signatures'],
  },
  {
    id: 'chord-knowledge',
    title: 'Chord Knowledge',
    accentHex: moduleMetaById('repertoire')?.accentHex ?? '#a8556b',
    categories: ['diatonic-qualities', 'chord-construction', 'slash-chords'],
  },
  {
    id: 'functional-applied',
    title: 'Functional / Applied',
    accentHex: PRACTICE_SESSIONS_META.accentHex,
    categories: ['functional-harmony', 'reverse-key-pivots', 'progressions'],
  },
  {
    id: 'ear-recognition',
    title: 'Ear & Recognition',
    accentHex: moduleMetaById('ear-training')?.accentHex ?? '#5a8752',
    categories: ['modes', 'intervals', 'ear-theory'],
  },
];

function AccuracySection({
  target,
  onChange,
}: {
  target: HarmonicFluencyTarget;
  onChange: (next: HarmonicFluencyTarget) => void;
}) {
  const remove = () => onChange({ ...target, accuracyEnabled: false, categoryId: null });
  const setScope = (s: 'overall' | 'specific') => {
    if (s === target.accuracyScope) return;
    onChange({
      ...target,
      accuracyScope: s,
      categoryId: s === 'overall' ? null : target.categoryId,
    });
  };

  return (
    <ToggleCard
      title="Accuracy target"
      hint="Reach a target accuracy percentage."
      enabled={true}
      onToggle={remove}
    >
      <div className="flex gap-1.5">
        <PillButton
          label="Overall accuracy"
          active={target.accuracyScope === 'overall'}
          onClick={() => setScope('overall')}
        />
        <PillButton
          label="Specific category"
          active={target.accuracyScope === 'specific'}
          onClick={() => setScope('specific')}
        />
      </div>
      {target.accuracyScope === 'specific' && (
        <div className="flex flex-col gap-3">
          {HARMONIC_FLUENCY_GROUPS.map(group => (
            <div key={group.id}>
              <div
                className="text-[10px] uppercase tracking-wide mb-1.5"
                style={{ color: group.accentHex }}
              >
                {group.title}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {group.categories.map(catId => (
                  <CategoryPillButton
                    key={catId}
                    label={CATEGORY_LABELS[catId]}
                    accentHex={group.accentHex}
                    active={target.categoryId === catId}
                    onClick={() => onChange({ ...target, categoryId: catId })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <AccuracySlider
        value={target.accuracyPercent}
        onChange={p => onChange({ ...target, accuracyPercent: p })}
        min={ACCURACY_PCT_MIN}
        max={ACCURACY_PCT_MAX}
        step={ACCURACY_PCT_STEP}
        label={`Target accuracy (${target.accuracyPercent}%)`}
      />
    </ToggleCard>
  );
}

// ---------------------------------------------------------------------
// Anchor panel — auto-connected, not editable
// ---------------------------------------------------------------------

function AnchorPanel({ anchor }: { anchor: Goal }) {
  return (
    <section className="rounded-md border border-neutral-200 dark:border-neutral-800 px-3 py-2 space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">
        Auto-connected to
      </div>
      <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
        {anchor.description}
      </div>
      <div className="text-[11px] text-neutral-500">
        Yearly anchor — progress on this goal counts toward it.
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Target date field
// ---------------------------------------------------------------------

function TargetDateField({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
        Target date
      </span>
      <input
        type="date"
        value={dateInputValue(value)}
        onChange={e => {
          const ms = dateStringToMs(e.target.value);
          if (ms !== null) onChange(ms);
        }}
        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-fluent/40"
      />
    </label>
  );
}

function dateStringToMs(value: string): number | null {
  if (!value) return null;
  const [yyyy, mm, dd] = value.split('-').map(Number);
  if (!yyyy || !mm || !dd) return null;
  return new Date(yyyy, mm - 1, dd, 23, 59, 59, 999).getTime();
}

// ---------------------------------------------------------------------
// Save plumbing
// ---------------------------------------------------------------------

/**
 * Encode an HF target slice via the wizard's encoder, bypassing the
 * Draft envelope (the suggestion flow's draft model is per-module
 * and doesn't carry the wizard's full Draft shape).
 */
function encodeHfTargetForRecords(
  target: HarmonicFluencyTarget,
): EncodedRecord[] {
  // Build a minimal draft-shaped object the wizard's encoder accepts.
  // encodeRecordsForDraft inspects only `moduleId` and the matching
  // module slice; other fields are unused for HF.
  const draftShim = {
    moduleId: 'harmonic-fluency' as const,
    harmonicFluency: target,
    // Other slices left at non-touched defaults — encoder switch
    // never reads them for moduleId === 'harmonic-fluency'.
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return encodeRecordsForDraft(draftShim as any, undefined, new Map());
}

interface PersistArgs {
  records: EncodedRecord[];
  scope: ShortScope;
  moduleId: SuggestionFlowModule;
  targetDate: number;
  anchorGoalId: string;
}

/**
 * Persist a suggestion-flow goal. Mirrors the wizard's new-create
 * save semantics for multi-record goals: 1 umbrella + N children
 * when records.length > 1, single row otherwise. Always sets
 * parent_goal_id to the auto-connected anchor (or to the umbrella
 * for child rows).
 *
 * Future: extract this into the shared encoder module once the
 * wizard's handleSave is also factored out, so both flows share
 * identical write semantics.
 */
async function persistSuggestionGoal(args: PersistArgs): Promise<void> {
  const { records, scope, moduleId, targetDate, anchorGoalId } = args;
  if (records.length === 0) return;

  const now = Date.now();
  const context = contextForSuggestionModule(moduleId);
  const relatedModules = relatedModulesForSuggestion(moduleId);

  const baseFields = {
    scope,
    contextTag: context,
    relatedModules,
    relatedItems: [] as string[],
    startDate: now,
    targetDate,
    status: 'active' as const,
    contributesNumericallyToParent: false,
    lastEngagedAt: null as number | null,
    currentValue: 0,
  };

  if (records.length === 1) {
    const r = records[0];
    const goal: Goal = {
      id: crypto.randomUUID(),
      ...baseFields,
      description: r.description,
      targetMetric: r.targetMetric,
      targetValue: r.targetValue,
      targetUnit: r.targetUnit,
      parentGoalId: anchorGoalId,
      isUmbrella: false,
    };
    await db.goals.add(goal);
    return;
  }

  // Multi-record → umbrella + children.
  const umbrella: Goal = {
    id: crypto.randomUUID(),
    ...baseFields,
    description: records.map(r => r.description).join(' and '),
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    parentGoalId: anchorGoalId,
    isUmbrella: true,
  };
  const children: Goal[] = records.map(r => ({
    id: crypto.randomUUID(),
    ...baseFields,
    description: r.description,
    targetMetric: r.targetMetric,
    targetValue: r.targetValue,
    targetUnit: r.targetUnit,
    parentGoalId: umbrella.id,
    isUmbrella: false,
  }));

  await db.transaction('rw', db.goals, async () => {
    await db.goals.add(umbrella);
    await db.goals.bulkAdd(children);
  });
}
