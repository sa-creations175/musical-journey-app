import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { db, type Goal, type GoalScope, type PracticeSessionContext } from '../../lib/db';
// harmonicFluencyCounts now imported alongside the other module counts below.
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
  EAR_TRAINING_DRILL_TYPES,
  encodeRecordsForDraft,
  type EarTrainingTarget,
  type EncodedRecord,
  type HarmonicFluencyTarget,
  type PracticeConsistencyTarget,
  type ProductionTarget,
  type ShapesPatternsTarget,
} from './GoalCreationFlow';
import { findAnchorGoalForModule } from './anchorLookup';
import { suggestHfMonthly } from './suggestions/hfMonthly';
import { suggestEtMonthly } from './suggestions/etMonthly';
import { suggestShapesMonthly } from './suggestions/shapesMonthly';
import { suggestProductionMonthly } from './suggestions/productionMonthly';
import {
  suggestPracticeConsistencyMonthly,
  type PracticeConsistencyMonthlyTarget,
} from './suggestions/practiceConsistencyMonthly';
import { CATEGORY_LABELS, type FlashcardCategory } from '../harmonic-fluency/catalog';
import {
  earTrainingCounts,
  harmonicFluencyCounts,
  productionCounts,
  shapesCounts,
} from '../../lib/moduleItemCounts';
import { PRODUCTION_PATHS } from '../production/content/paths';
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

  // Anchor is ready. Route to the per-module body. Repertoire is the
  // only module without a body yet — its suggestion shape requires an
  // active-songs Dexie fetch and a multi-song save path that hasn't
  // been built; falls through to the placeholder for now.
  if (scope === 'monthly') {
    const sharedProps = {
      anchor: anchorState.goal,
      scope,
      moduleId,
      onClose,
      onSaved,
    };
    if (moduleId === 'harmonic-fluency') {
      return <HarmonicFluencyMonthlyBody {...sharedProps} moduleId="harmonic-fluency" />;
    }
    if (moduleId === 'ear-training') {
      return <EarTrainingMonthlyBody {...sharedProps} moduleId="ear-training" />;
    }
    if (moduleId === 'shapes-and-patterns') {
      return <ShapesPatternsMonthlyBody {...sharedProps} moduleId="shapes-and-patterns" />;
    }
    if (moduleId === 'production') {
      return <ProductionMonthlyBody {...sharedProps} moduleId="production" />;
    }
    if (moduleId === 'practice-consistency') {
      return <PracticeConsistencyMonthlyBody {...sharedProps} moduleId="practice-consistency" />;
    }
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

// ---------------------------------------------------------------------
// Shared shell — wraps the per-module body with the consistent
// chrome (modal, context lines, anchor panel, target date, save).
// Each body provides its own focus + add-on UI as children, plus the
// state needed for save (records + a save handler).
// ---------------------------------------------------------------------

interface BodyShellProps {
  anchor: Goal;
  scope: ShortScope;
  moduleId: SuggestionFlowModule;
  contextLines: string[];
  records: EncodedRecord[];
  targetDate: number;
  setTargetDate: (next: number) => void;
  onClose: () => void;
  onSaved?: () => void;
  /** Module-specific focus + add-on UI rendered between the context
   *  lines and the anchor panel. */
  children: React.ReactNode;
  /** Override the default save flow (records → persistSuggestionGoal).
   *  Practice Consistency and other custom-shape modules use this to
   *  emit goal records that don't go through the wizard's encoder. */
  saveOverride?: () => Promise<void>;
}

function BodyShell({
  anchor,
  scope,
  moduleId,
  contextLines,
  records,
  targetDate,
  setTargetDate,
  onClose,
  onSaved,
  children,
  saveOverride,
}: BodyShellProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canSave = (saveOverride !== undefined || records.length > 0) && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (saveOverride) {
        await saveOverride();
      } else {
        await persistSuggestionGoal({
          records,
          scope,
          moduleId,
          targetDate,
          anchorGoalId: anchor.id,
        });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[GoalSuggestionFlow] save failed', err);
      setSaveError('Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const title = `New ${SCOPE_LABEL[scope].toLowerCase()} ${MODULE_LABEL[moduleId]} goal`;

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-4">
        {contextLines.length > 0 && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1">
            {contextLines.map((line, idx) => (
              <p key={idx}>{line}</p>
            ))}
          </div>
        )}
        {children}
        <AnchorPanel anchor={anchor} />
        <TargetDateField value={targetDate} onChange={setTargetDate} />
        {saveError && <p className="text-xs text-needswork">{saveError}</p>}
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
// Harmonic Fluency body
// ---------------------------------------------------------------------

interface ModuleBodyProps<TModuleId extends SuggestionFlowModule> {
  anchor: Goal;
  scope: ShortScope;
  moduleId: TModuleId;
  onClose: () => void;
  onSaved?: () => void;
}

function HarmonicFluencyMonthlyBody({
  anchor,
  scope,
  moduleId,
  onClose,
  onSaved,
}: ModuleBodyProps<'harmonic-fluency'>) {
  const initialSuggestion = useMemo(() => suggestHfMonthly(), []);
  const [target, setTarget] = useState<HarmonicFluencyTarget>(initialSuggestion.target);
  const [targetDate, setTargetDate] = useState<number>(defaultTargetDate(scope));

  const records = useMemo(
    () => encodeShim('harmonic-fluency', target),
    [target],
  );

  return (
    <BodyShell
      anchor={anchor}
      scope={scope}
      moduleId={moduleId}
      contextLines={initialSuggestion.contextLines}
      records={records}
      targetDate={targetDate}
      setTargetDate={setTargetDate}
      onClose={onClose}
      onSaved={onSaved}
    >
      <HfFocusSection target={target} onChange={setTarget} />
      <HfAlsoAddRow target={target} onChange={setTarget} />
      {target.accuracyEnabled && (
        <HfAccuracySection target={target} onChange={setTarget} />
      )}
      {target.consistencyEnabled && (
        <ConsistencyTargetCard target={target} onChange={setTarget} />
      )}
    </BodyShell>
  );
}

// ---------------------------------------------------------------------
// Focus section — pre-populated suggestion, editable
// ---------------------------------------------------------------------

function HfFocusSection({
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

function HfAlsoAddRow({
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

function HfAccuracySection({
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
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
        Acquired = per-card mastery (last 10 attempts). Accuracy target = overall sharpness across the group (last 200 attempts).
      </p>
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
 * Encode a per-module target slice via the wizard's encoder, bypassing
 * the wizard's full Draft envelope. The suggestion flow's draft model
 * carries one module slice at a time; this shim wraps the slice in a
 * minimal Draft shape the encoder will accept (it switches on
 * `moduleId` and only reads the matching slice). Other module slices
 * are never read in the matched-moduleId branch, so leaving them off
 * the shim is safe.
 */
type EncodableSlice =
  | { moduleId: 'harmonic-fluency'; target: HarmonicFluencyTarget }
  | { moduleId: 'ear-training'; target: EarTrainingTarget }
  | { moduleId: 'shapes-and-patterns'; target: ShapesPatternsTarget }
  | { moduleId: 'production'; target: ProductionTarget }
  | { moduleId: 'practice-consistency'; target: PracticeConsistencyTarget };

function encodeShim(
  moduleId: EncodableSlice['moduleId'],
  target: EncodableSlice['target'],
): EncodedRecord[] {
  const draftShim: Record<string, unknown> = { moduleId };
  switch (moduleId) {
    case 'harmonic-fluency':     draftShim.harmonicFluency = target; break;
    case 'ear-training':         draftShim.earTraining = target; break;
    case 'shapes-and-patterns':  draftShim.shapesPatterns = target; break;
    case 'production':           draftShim.production = target; break;
    case 'practice-consistency': draftShim.practiceConsistency = target; break;
  }
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

// =====================================================================
// Ear Training body
// =====================================================================

const ET_COUNTS = earTrainingCounts();

interface EtCoverageGroupOption {
  id: string;
  label: string;
  denominator: number;
}

const ET_COVERAGE_GROUPS: ReadonlyArray<EtCoverageGroupOption> = [
  { id: 'intervals',          label: 'intervals',          denominator: ET_COUNTS.intervals },
  { id: 'chord-recognition',  label: 'chord recognition',  denominator: ET_COUNTS.chordRecognition },
  { id: 'chord-progressions', label: 'chord progressions', denominator: ET_COUNTS.chordProgressions },
  { id: 'scales-modes',       label: 'scales & modes',     denominator: ET_COUNTS.scalesModes },
];

function EarTrainingMonthlyBody({
  anchor,
  scope,
  moduleId,
  onClose,
  onSaved,
}: ModuleBodyProps<'ear-training'>) {
  const initialSuggestion = useMemo(() => suggestEtMonthly(), []);
  const [target, setTarget] = useState<EarTrainingTarget>(initialSuggestion.target);
  const [targetDate, setTargetDate] = useState<number>(defaultTargetDate(scope));
  const records = useMemo(() => encodeShim('ear-training', target), [target]);

  return (
    <BodyShell
      anchor={anchor}
      scope={scope}
      moduleId={moduleId}
      contextLines={initialSuggestion.contextLines}
      records={records}
      targetDate={targetDate}
      setTargetDate={setTargetDate}
      onClose={onClose}
      onSaved={onSaved}
    >
      <EtFocusSection target={target} onChange={setTarget} />
      <EtAlsoAddRow target={target} onChange={setTarget} />
      {target.accuracyEnabled && (
        <EtAccuracySection target={target} onChange={setTarget} />
      )}
      {target.consistencyEnabled && (
        <ConsistencyTargetCard target={target} onChange={setTarget} />
      )}
    </BodyShell>
  );
}

function EtFocusSection({
  target,
  onChange,
}: {
  target: EarTrainingTarget;
  onChange: (next: EarTrainingTarget) => void;
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
        <div className="text-[10px] uppercase tracking-wide text-fluent">Focus</div>
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          Reach acquired stage on items
        </div>
      </header>
      <div className="flex gap-1.5 flex-wrap">
        <PillButton
          label={`All of ear training (${ET_COUNTS.total} items)`}
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
          {ET_COVERAGE_GROUPS.map(group => (
            <CategoryPillButton
              key={group.id}
              label={`${group.label} (${group.denominator})`}
              accentHex={moduleMetaById('ear-training')?.accentHex ?? '#5a8752'}
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

function EtAlsoAddRow({
  target,
  onChange,
}: {
  target: EarTrainingTarget;
  onChange: (next: EarTrainingTarget) => void;
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

function EtAccuracySection({
  target,
  onChange,
}: {
  target: EarTrainingTarget;
  onChange: (next: EarTrainingTarget) => void;
}) {
  const drill = EAR_TRAINING_DRILL_TYPES.find(d => d.id === target.drillTypeId) ?? null;
  const remove = () =>
    onChange({
      ...target,
      accuracyEnabled: false,
      drillTypeId: null,
      drillSubtypeId: null,
    });
  const setScope = (s: 'overall' | 'specific') => {
    if (s === target.accuracyScope) return;
    onChange({
      ...target,
      accuracyScope: s,
      drillTypeId: s === 'overall' ? null : target.drillTypeId,
      drillSubtypeId: s === 'overall' ? null : target.drillSubtypeId,
    });
  };
  const setDrillType = (id: string) => {
    // Resetting subtype on type change — the previous subtype belongs
    // to a different drill and would encode a nonsense combination.
    onChange({ ...target, drillTypeId: id || null, drillSubtypeId: null });
  };
  const setDrillSubtype = (id: string) => {
    onChange({ ...target, drillSubtypeId: id || null });
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
          label="Specific drill type"
          active={target.accuracyScope === 'specific'}
          onClick={() => setScope('specific')}
        />
      </div>
      {target.accuracyScope === 'specific' && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
              Drill type
            </span>
            <select
              value={target.drillTypeId ?? ''}
              onChange={e => setDrillType(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-fluent/40"
            >
              <option value="">Pick a drill type…</option>
              {EAR_TRAINING_DRILL_TYPES.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </label>
          {drill && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
                Subtype
              </span>
              <select
                value={target.drillSubtypeId ?? ''}
                onChange={e => setDrillSubtype(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-fluent/40"
              >
                <option value="">Pick a subtype…</option>
                {drill.subtypes.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      <AccuracySlider
        value={target.accuracyPercent}
        onChange={p => onChange({ ...target, accuracyPercent: p })}
        min={ACCURACY_PCT_MIN}
        max={ACCURACY_PCT_MAX}
        step={ACCURACY_PCT_STEP}
        label={`Target accuracy (${target.accuracyPercent}%)`}
      />
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
        Acquired = per-card mastery (last 10 attempts). Accuracy target = overall sharpness across the group (last 200 attempts).
      </p>
    </ToggleCard>
  );
}

// =====================================================================
// Shapes & Patterns body
// =====================================================================

const SP_COUNTS = shapesCounts();

interface ShapesCoverageGroupOption {
  id: 'chord_shape_drills' | 'scale_drills' | 'voice_leading';
  label: string;
  denominator: number;
}

const SHAPES_COVERAGE_GROUP_OPTIONS: ReadonlyArray<ShapesCoverageGroupOption> = [
  { id: 'chord_shape_drills', label: 'chord shape drills', denominator: SP_COUNTS.chordShapeDrills },
  { id: 'scale_drills',       label: 'scale drills',       denominator: SP_COUNTS.scaleDrills      },
  { id: 'voice_leading',      label: 'voice-leading',      denominator: SP_COUNTS.voiceLeading     },
];

function ShapesPatternsMonthlyBody({
  anchor,
  scope,
  moduleId,
  onClose,
  onSaved,
}: ModuleBodyProps<'shapes-and-patterns'>) {
  const initialSuggestion = useMemo(() => suggestShapesMonthly(), []);
  const [target, setTarget] = useState<ShapesPatternsTarget>(initialSuggestion.target);
  const [targetDate, setTargetDate] = useState<number>(defaultTargetDate(scope));
  const records = useMemo(() => encodeShim('shapes-and-patterns', target), [target]);

  return (
    <BodyShell
      anchor={anchor}
      scope={scope}
      moduleId={moduleId}
      contextLines={initialSuggestion.contextLines}
      records={records}
      targetDate={targetDate}
      setTargetDate={setTargetDate}
      onClose={onClose}
      onSaved={onSaved}
    >
      <ShapesFocusSection target={target} onChange={setTarget} />
      <ShapesAlsoAddRow target={target} onChange={setTarget} />
      {target.consistencyEnabled && (
        <ConsistencyTargetCard
          target={target}
          onChange={setTarget}
          unitLabel="Minutes"
          hint="Minutes per week or month."
        />
      )}
    </BodyShell>
  );
}

function ShapesFocusSection({
  target,
  onChange,
}: {
  target: ShapesPatternsTarget;
  onChange: (next: ShapesPatternsTarget) => void;
}) {
  const setScope = (s: 'overall' | 'specific') => {
    if (s === target.coverageScope) return;
    onChange({
      ...target,
      coverageScope: s,
      coverageGroupIds: s === 'overall' ? [] : target.coverageGroupIds,
    });
  };
  const toggleGroup = (id: ShapesCoverageGroupOption['id']) => {
    const next = target.coverageGroupIds.includes(id)
      ? target.coverageGroupIds.filter(x => x !== id)
      : [...target.coverageGroupIds, id];
    onChange({ ...target, coverageGroupIds: next });
  };

  return (
    <section className="rounded-md border border-fluent/30 bg-fluent/5 p-3 space-y-3">
      <header>
        <div className="text-[10px] uppercase tracking-wide text-fluent">Focus</div>
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          Reach acquired stage on shapes
        </div>
      </header>
      <div className="flex gap-1.5 flex-wrap">
        <PillButton
          label={`All of shapes (${SP_COUNTS.total} items)`}
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
          {SHAPES_COVERAGE_GROUP_OPTIONS.map(group => (
            <CategoryPillButton
              key={group.id}
              label={`${group.label} (${group.denominator})`}
              accentHex={moduleMetaById('shapes-and-patterns')?.accentHex ?? '#d4885a'}
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

function ShapesAlsoAddRow({
  target,
  onChange,
}: {
  target: ShapesPatternsTarget;
  onChange: (next: ShapesPatternsTarget) => void;
}) {
  const showConsistency = !target.consistencyEnabled;
  if (!showConsistency) return null;
  return (
    <div className="flex gap-1.5 flex-wrap">
      <PillButton
        label="+ Also add minutes-per-week target"
        active={false}
        onClick={() => onChange({ ...target, consistencyEnabled: true })}
      />
    </div>
  );
}

// =====================================================================
// Production body
// =====================================================================

const PROD_COUNTS = productionCounts();

function ProductionMonthlyBody({
  anchor,
  scope,
  moduleId,
  onClose,
  onSaved,
}: ModuleBodyProps<'production'>) {
  const initialSuggestion = useMemo(() => suggestProductionMonthly(), []);
  const [target, setTarget] = useState<ProductionTarget>(initialSuggestion.target);
  const [targetDate, setTargetDate] = useState<number>(defaultTargetDate(scope));
  const records = useMemo(() => encodeShim('production', target), [target]);

  return (
    <BodyShell
      anchor={anchor}
      scope={scope}
      moduleId={moduleId}
      contextLines={initialSuggestion.contextLines}
      records={records}
      targetDate={targetDate}
      setTargetDate={setTargetDate}
      onClose={onClose}
      onSaved={onSaved}
    >
      <ProductionCompletionFocus target={target} onChange={setTarget} />
      <ProductionConsistencyFocus target={target} onChange={setTarget} />
    </BodyShell>
  );
}

function ProductionCompletionFocus({
  target,
  onChange,
}: {
  target: ProductionTarget;
  onChange: (next: ProductionTarget) => void;
}) {
  const setScope = (s: 'path' | 'count') => {
    if (s === target.completionScope) return;
    onChange({ ...target, completionScope: s, pathId: s === 'count' ? null : target.pathId });
  };
  return (
    <section className="rounded-md border border-fluent/30 bg-fluent/5 p-3 space-y-3">
      <header>
        <div className="text-[10px] uppercase tracking-wide text-fluent">Focus</div>
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          Complete production lessons
        </div>
      </header>
      <div className="flex gap-1.5 flex-wrap">
        <PillButton
          label="A specific path"
          active={target.completionScope === 'path'}
          onClick={() => setScope('path')}
        />
        <PillButton
          label="A lesson count"
          active={target.completionScope === 'count'}
          onClick={() => setScope('count')}
        />
      </div>
      {target.completionScope === 'path' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {PRODUCTION_PATHS.map(path => (
            <CategoryPillButton
              key={path.id}
              label={`${path.title} (${PROD_COUNTS.byPath[path.id] ?? 0})`}
              accentHex={moduleMetaById('production')?.accentHex ?? '#3a4875'}
              active={target.pathId === path.id}
              onClick={() => onChange({ ...target, pathId: path.id })}
              selectedStyle="accent"
            />
          ))}
        </div>
      )}
      {target.completionScope === 'count' && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-700 dark:text-neutral-200">Lessons:</span>
          <input
            type="number"
            min={1}
            value={target.lessonCount === 0 ? '' : target.lessonCount}
            onChange={e =>
              onChange({ ...target, lessonCount: Number(e.target.value) || 0 })
            }
            className="w-20 px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
          />
        </label>
      )}
    </section>
  );
}

function ProductionConsistencyFocus({
  target,
  onChange,
}: {
  target: ProductionTarget;
  onChange: (next: ProductionTarget) => void;
}) {
  // Production's consistency is hours-per-cadence and on by default
  // (per the spec baseline: "1 hour/week"). Always-rendered as a
  // second focus section rather than gated behind an "Also add" pill.
  return (
    <ConsistencyTargetCard
      target={target}
      onChange={onChange}
      unitLabel="Hours"
      hint="Hours of production work per week or month."
      cardTitle="Time target"
    />
  );
}

// =====================================================================
// Practice Consistency body
// =====================================================================

function PracticeConsistencyMonthlyBody({
  anchor,
  scope,
  moduleId,
  onClose,
  onSaved,
}: ModuleBodyProps<'practice-consistency'>) {
  const initialSuggestion = useMemo(() => suggestPracticeConsistencyMonthly(), []);
  const [target, setTarget] = useState<PracticeConsistencyMonthlyTarget>(initialSuggestion.target);
  const [targetDate, setTargetDate] = useState<number>(defaultTargetDate(scope));

  // Practice Consistency uses a custom 3-field target shape that the
  // wizard's encoder doesn't know about. v1 maps the daysPerWeek
  // field onto the existing PracticeConsistencyTarget shape (single
  // {days, cadence} encoder) and saves only that. The keyboard
  // session quality fields are aspirational — they read as goal
  // intent in the UI but don't yet persist as their own goal record.
  // Future: emit a second linked record (sibling under an umbrella)
  // for the keyboard-session quality target once the data model
  // supports it.
  const reducedRecords = useMemo<EncodedRecord[]>(
    () => encodeShim('practice-consistency', {
      days: target.daysPerWeek,
      cadence: 'week',
    }),
    [target.daysPerWeek],
  );

  return (
    <BodyShell
      anchor={anchor}
      scope={scope}
      moduleId={moduleId}
      contextLines={initialSuggestion.contextLines}
      records={reducedRecords}
      targetDate={targetDate}
      setTargetDate={setTargetDate}
      onClose={onClose}
      onSaved={onSaved}
    >
      <PracticeConsistencyFocus target={target} onChange={setTarget} />
    </BodyShell>
  );
}

function PracticeConsistencyFocus({
  target,
  onChange,
}: {
  target: PracticeConsistencyMonthlyTarget;
  onChange: (next: PracticeConsistencyMonthlyTarget) => void;
}) {
  const numInput = (
    value: number,
    onSet: (n: number) => void,
    min: number,
    max: number,
    ariaLabel: string,
  ) => (
    <input
      type="number"
      min={min}
      max={max}
      value={value === 0 ? '' : value}
      onChange={e => onSet(Number(e.target.value) || 0)}
      aria-label={ariaLabel}
      className="w-16 px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
    />
  );

  return (
    <section className="rounded-md border border-fluent/30 bg-fluent/5 p-3 space-y-3">
      <header>
        <div className="text-[10px] uppercase tracking-wide text-fluent">Focus</div>
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          Show up consistently
        </div>
      </header>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-neutral-700 dark:text-neutral-200">Practice</span>
          {numInput(
            target.daysPerWeek,
            n => onChange({ ...target, daysPerWeek: n }),
            1, 7,
            'Days per week',
          )}
          <span className="text-neutral-700 dark:text-neutral-200">days a week</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-neutral-700 dark:text-neutral-200">Plus at least</span>
          {numInput(
            target.keyboardSessionsPerWeek,
            n => onChange({ ...target, keyboardSessionsPerWeek: n }),
            0, 7,
            'Keyboard sessions per week',
          )}
          <span className="text-neutral-700 dark:text-neutral-200">keyboard sessions a week,</span>
          {numInput(
            target.keyboardSessionMinMinutes,
            n => onChange({ ...target, keyboardSessionMinMinutes: n }),
            5, 240,
            'Minimum minutes per keyboard session',
          )}
          <span className="text-neutral-700 dark:text-neutral-200">+ minutes each.</span>
        </div>
      </div>
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
        v1: the days-per-week target persists as the Practice Consistency goal. Keyboard-session quality is captured as
        intent but not yet tracked as its own metric.
      </p>
    </section>
  );
}
