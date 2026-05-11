import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from '../../components/Modal';
import {
  db,
  type Goal,
  type GoalScope,
  type PracticeSessionContext,
  type Song,
  type WantToLearnEntry,
} from '../../lib/db';
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
import { coverageWeeklyMinutes } from './weeklyTimeEstimate';
import { REPERTOIRE_SESSION_DEFAULT_MINUTES } from '../../lib/weeklyAttempts';
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
import {
  SHAPES_COVERAGE_GROUP_DEFS,
  type ShapesCoverageGroupId,
} from './shapesCoverageGroups';
import { suggestHfMonthly } from './suggestions/hfMonthly';
import { suggestEtMonthly } from './suggestions/etMonthly';
import { suggestShapesMonthly } from './suggestions/shapesMonthly';
import { suggestProductionMonthly } from './suggestions/productionMonthly';
import {
  suggestPracticeConsistencyMonthly,
  type PracticeConsistencyMonthlyTarget,
} from './suggestions/practiceConsistencyMonthly';
import { suggestRepertoireMonthly } from './suggestions/repertoireMonthly';
import {
  MAX_SLOTS,
  SONG_OF_MONTH_METRIC,
  type SlotPayloadKind,
} from '../repertoire/songOfMonth';
import { promoteWantToLearnEntry } from './GoalCreationFlow';
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
    if (moduleId === 'repertoire') {
      return <RepertoireMonthlyBody {...sharedProps} moduleId="repertoire" />;
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

/**
 * Format an integer minute count as a compact "1h 48m" / "32m"
 * string. Used by the inline weekly-time footer beneath each
 * FocusSection. Mirrors the formatting that
 * `formatWeeklyTimeEstimate` produces for point estimates but
 * skips the broader display contract — the focus footer only ever
 * shows a single number derived from `coverageWeeklyMinutes`.
 */
function formatMinutesShort(minutes: number): string {
  if (minutes < 1) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Inline "Weekly time commitment ~1h 48m/week" footer rendered at
 * the bottom of each Focus card. Updates live as the user toggles
 * coverage selections — the parent body passes the same
 * `coverageWeeklyMinutes` value the ConsistencyTargetCard
 * consumes for its per-day estimate, so the two cards stay in
 * lockstep.
 *
 * Hidden entirely when minutes is null or ≤ 0 (e.g. before the
 * user picks any coverage items). The collapsed ConsistencyTarget-
 * Card on its own already prompts the user to add coverage; a
 * second placeholder here would be redundant.
 */
function CoverageTimeFooter({
  coverageWeeklyMinutes,
}: {
  coverageWeeklyMinutes: number | null;
}) {
  if (coverageWeeklyMinutes == null || coverageWeeklyMinutes <= 0) return null;
  return (
    <div className="text-xs text-neutral-500 dark:text-neutral-400 pt-2 border-t border-neutral-200/60 dark:border-neutral-700/60">
      Weekly time commitment{' '}
      <span className="font-medium text-neutral-700 dark:text-neutral-200 tabular-nums">
        ~{formatMinutesShort(coverageWeeklyMinutes)}/week
      </span>
    </div>
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
  const coverageMinutes = useMemo(
    () => coverageWeeklyMinutes({
      records,
      moduleId: 'harmonic-fluency',
      targetDate,
    }),
    [records, targetDate],
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
      <HfFocusSection
        target={target}
        onChange={setTarget}
        coverageWeeklyMinutes={coverageMinutes}
      />
      <ConsistencyTargetCard
        target={target}
        onChange={setTarget}
        coverageWeeklyMinutes={coverageMinutes}
      />
      <HfAccuracySection target={target} onChange={setTarget} />
    </BodyShell>
  );
}

// ---------------------------------------------------------------------
// Focus section — pre-populated suggestion, editable
// ---------------------------------------------------------------------

function HfFocusSection({
  target,
  onChange,
  coverageWeeklyMinutes: minutes,
}: {
  target: HarmonicFluencyTarget;
  onChange: (next: HarmonicFluencyTarget) => void;
  coverageWeeklyMinutes: number | null;
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
      <CoverageTimeFooter coverageWeeklyMinutes={minutes} />
    </section>
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
  // Toggle flips between enabled and disabled — disabling also
  // clears the picked category so the next re-enable starts clean.
  // Always-visible affordance: card renders even when off; collapsed
  // state shows just the title row + checkbox.
  const toggle = () => {
    if (target.accuracyEnabled) {
      onChange({ ...target, accuracyEnabled: false, categoryId: null });
    } else {
      onChange({ ...target, accuracyEnabled: true });
    }
  };
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
      enabled={target.accuracyEnabled}
      onToggle={toggle}
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
  const coverageMinutes = useMemo(
    () => coverageWeeklyMinutes({
      records,
      moduleId: 'ear-training',
      targetDate,
    }),
    [records, targetDate],
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
      <EtFocusSection
        target={target}
        onChange={setTarget}
        coverageWeeklyMinutes={coverageMinutes}
      />
      <ConsistencyTargetCard
        target={target}
        onChange={setTarget}
        coverageWeeklyMinutes={coverageMinutes}
      />
      <EtAccuracySection target={target} onChange={setTarget} />
    </BodyShell>
  );
}

function EtFocusSection({
  target,
  onChange,
  coverageWeeklyMinutes: minutes,
}: {
  target: EarTrainingTarget;
  onChange: (next: EarTrainingTarget) => void;
  coverageWeeklyMinutes: number | null;
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
      <CoverageTimeFooter coverageWeeklyMinutes={minutes} />
    </section>
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
  // Toggle flips between enabled and disabled — disabling also
  // clears the drill picks so the next re-enable starts clean.
  // Always-visible affordance: card renders even when off; collapsed
  // state shows just the title row + checkbox.
  const toggle = () => {
    if (target.accuracyEnabled) {
      onChange({
        ...target,
        accuracyEnabled: false,
        drillTypeId: null,
        drillSubtypeId: null,
      });
    } else {
      onChange({ ...target, accuracyEnabled: true });
    }
  };
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
      enabled={target.accuracyEnabled}
      onToggle={toggle}
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
  id: ShapesCoverageGroupId;
  label: string;
  denominator: number;
}

const SHAPES_COVERAGE_GROUP_OPTIONS: ReadonlyArray<ShapesCoverageGroupOption> =
  SHAPES_COVERAGE_GROUP_DEFS.map(g => ({
    id: g.id,
    label: g.label,
    denominator: g.denominator,
  }));

/** Layer 1 picker — broad areas. The `chord_shape_triads` id stays
 *  here as a "select all triad inversions" shortcut; its visual
 *  state mirrors whether all 6 quality sub-ids are selected. The
 *  6 quality ids are rendered separately by SHAPES_TRIAD_QUALITY_OPTIONS. */
const TRIAD_QUALITY_GROUP_IDS: ReadonlyArray<ShapesCoverageGroupId> = [
  'chord_shape_triads_maj',
  'chord_shape_triads_min',
  'chord_shape_triads_dim',
  'chord_shape_triads_aug',
  'chord_shape_triads_sus2',
  'chord_shape_triads_sus4',
];
const TRIAD_QUALITY_GROUP_ID_SET: ReadonlySet<ShapesCoverageGroupId> = new Set(
  TRIAD_QUALITY_GROUP_IDS,
);

const SHAPES_LAYER1_OPTIONS: ReadonlyArray<ShapesCoverageGroupOption> =
  SHAPES_COVERAGE_GROUP_OPTIONS.filter(g => !TRIAD_QUALITY_GROUP_ID_SET.has(g.id));
const SHAPES_TRIAD_QUALITY_OPTIONS: ReadonlyArray<ShapesCoverageGroupOption> =
  SHAPES_COVERAGE_GROUP_OPTIONS.filter(g => TRIAD_QUALITY_GROUP_ID_SET.has(g.id));

function ShapesPatternsMonthlyBody({
  anchor,
  scope,
  moduleId,
  onClose,
  onSaved,
}: ModuleBodyProps<'shapes-and-patterns'>) {
  const initialSuggestion = useMemo(() => suggestShapesMonthly(), []);
  const [target, setTarget] = useState<ShapesPatternsTarget>(initialSuggestion.target);
  const [targetDate, setTargetDate] = useState<number>(
    initialSuggestion.defaultTargetDate ?? defaultTargetDate(scope),
  );
  const records = useMemo(() => encodeShim('shapes-and-patterns', target), [target]);
  const coverageMinutes = useMemo(
    () => coverageWeeklyMinutes({
      records,
      moduleId: 'shapes-and-patterns',
      targetDate,
    }),
    [records, targetDate],
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
      <ShapesFocusSection
        target={target}
        onChange={setTarget}
        coverageWeeklyMinutes={coverageMinutes}
      />
      <ConsistencyTargetCard
        target={target}
        onChange={setTarget}
        unitMode="days"
        coverageWeeklyMinutes={coverageMinutes}
      />
    </BodyShell>
  );
}

function ShapesFocusSection({
  target,
  onChange,
  coverageWeeklyMinutes: minutes,
}: {
  target: ShapesPatternsTarget;
  onChange: (next: ShapesPatternsTarget) => void;
  coverageWeeklyMinutes: number | null;
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

  /**
   * "Triad inversions" pill — Layer 2 shortcut. Clicking toggles
   * the 6 quality sub-ids on/off as a batch. Its active state
   * mirrors whether all 6 are currently selected (partial states
   * read as inactive so the user has a clear "select all" affordance
   * available regardless of where they started). Picking the
   * shortcut REPLACES the legacy `chord_shape_triads` id with the 6
   * quality sub-ids — older single-id selections get migrated
   * silently when the user touches the picker.
   */
  const allTriadQualitiesSelected = TRIAD_QUALITY_GROUP_IDS.every(id =>
    target.coverageGroupIds.includes(id),
  );
  const anyTriadQualitySelected = target.coverageGroupIds.some(
    id =>
      TRIAD_QUALITY_GROUP_ID_SET.has(id) || id === 'chord_shape_triads',
  );
  const toggleAllTriadQualities = () => {
    const withoutTriads = target.coverageGroupIds.filter(
      id => !TRIAD_QUALITY_GROUP_ID_SET.has(id) && id !== 'chord_shape_triads',
    );
    const next = allTriadQualitiesSelected
      ? withoutTriads
      : [...withoutTriads, ...TRIAD_QUALITY_GROUP_IDS];
    onChange({ ...target, coverageGroupIds: next });
  };

  const shapesAccent = moduleMetaById('shapes-and-patterns')?.accentHex ?? '#d4885a';
  const triadInversionsDef = SHAPES_COVERAGE_GROUP_OPTIONS.find(
    g => g.id === 'chord_shape_triads',
  );
  const triadInversionsLabel = triadInversionsDef
    ? `${triadInversionsDef.label} (${triadInversionsDef.denominator})`
    : 'triad inversions (288)';

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
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {/* Triad inversions select-all shortcut. Behaves as a
                tri-state pill: "active" only when all 6 qualities
                are selected. Clicking flips the whole batch. */}
            <CategoryPillButton
              key="chord_shape_triads"
              label={triadInversionsLabel}
              accentHex={shapesAccent}
              active={allTriadQualitiesSelected}
              onClick={toggleAllTriadQualities}
              selectedStyle="accent"
            />
            {SHAPES_LAYER1_OPTIONS.filter(g => g.id !== 'chord_shape_triads').map(group => (
              <CategoryPillButton
                key={group.id}
                label={`${group.label} (${group.denominator})`}
                accentHex={shapesAccent}
                active={target.coverageGroupIds.includes(group.id)}
                onClick={() => toggleGroup(group.id)}
                selectedStyle="accent"
              />
            ))}
          </div>
          {/* Layer 2 — individual triad-quality sub-pills, revealed
              when any triad selection is active. The "Triad
              inversions" shortcut + the 6 quality pills are
              functionally equivalent at the data layer (selecting
              all 6 = same coverage as the shortcut). The shortcut
              just lets the user batch-select; the sub-pills let
              them narrow scope. */}
          {anyTriadQualitySelected && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                Triad qualities
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {SHAPES_TRIAD_QUALITY_OPTIONS.map(group => (
                  <CategoryPillButton
                    key={group.id}
                    label={`${group.label} (${group.denominator})`}
                    accentHex={shapesAccent}
                    active={target.coverageGroupIds.includes(group.id)}
                    onClick={() => toggleGroup(group.id)}
                    selectedStyle="accent"
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <CoverageTimeFooter coverageWeeklyMinutes={minutes} />
    </section>
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
      unitMode="lessons"
      cardTitle="Lesson target"
      hint="Lessons completed per week. Depth varies; no per-lesson estimate."
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

// =====================================================================
// Repertoire body
// =====================================================================

/**
 * Repertoire monthly goal body. Two-section composition:
 *
 *   Section 1 — Maintaining & advancing
 *     Display only. Numbered list of every song in the repertoire so
 *     the user sees the full month's commitment. Target reads as
 *     "comfortable" — keep them where they are. No goal records are
 *     written for these.
 *
 *   Section 2 — New this month
 *     Adds-only list. Each slot is one of:
 *       · catalog pick — an existing db.songs row
 *       · typed — a free-text title; on save we insert a new
 *         db.songs row first, then encode the goal pointing at it.
 *       · TBD — placeholder; encodes a goal with empty relatedItems
 *         and a "TBD this month" description.
 *
 * Save shape: 1 umbrella + N children, where N = section 2 entries.
 * parentGoalId on the umbrella points at the yearly Repertoire
 * anchor; children point at the umbrella. The maintaining section
 * is context-only and never writes records.
 */

/**
 * UI-side draft for one queue slot. Mirrors the persisted shape in
 * songOfMonth.ts (kind: 'song' | 'wtl' | 'tbd' + refId) but adds a
 * stable React key so the picker can swap entries without
 * triggering re-renders on the wrong row.
 */
interface DraftSlot {
  /** Stable row key — independent of refId so a TBD → song swap
   *  doesn't unmount + remount the row. */
  key: string;
  data:
    | { kind: 'song';        songId: string }    // already in db.songs
    | { kind: 'wtl';         entryId: string }   // in db.wantToLearn
    | { kind: 'tbd' };
}

function newSlotKey(): string {
  return `slot-${Math.random().toString(36).slice(2, 8)}`;
}

function RepertoireMonthlyBody({
  anchor,
  scope,
  moduleId,
  onClose,
  onSaved,
}: ModuleBodyProps<'repertoire'>) {
  const initialSuggestion = useMemo(() => suggestRepertoireMonthly(), []);

  // Live-fetch songs + want-to-learn at mount. Songs back the
  // "pick from your repertoire" path; WTL backs the "pick a queued
  // song to bring into the spotlight" path. Both lists feed the
  // queue picker.
  //
  // Songs are pre-sorted by learningOrder ASC so the Maintain
  // section + the queue picker read in the user's authored study
  // order. Matches the source-side sort in Repertoire.tsx — the
  // in-component sort that used to live inside RepertoireMaintainSection
  // doesn't catch legacy synced rows whose learningOrder is
  // undefined (the comparator collapses to a no-op and the
  // unsorted insert order leaks through).
  const allSongs = useLiveQuery(
    () => db.songs
      .toArray()
      .then(rows => rows.sort(
        (a, b) =>
          (a.learningOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.learningOrder ?? Number.MAX_SAFE_INTEGER),
      )),
    [],
  );
  const wantToLearn = useLiveQuery(() => db.wantToLearn.toArray(), []);

  const [queue, setQueue] = useState<DraftSlot[]>([]);
  const [daysTarget, setDaysTarget] = useState({
    consistencyEnabled: initialSuggestion.target.consistencyEnabled,
    consistencyCount: initialSuggestion.target.consistencyCount,
    consistencyCadence: initialSuggestion.target.consistencyCadence,
  });
  const [targetDate, setTargetDate] = useState<number>(defaultTargetDate(scope));

  // Save gate: at least one queue slot (specific OR TBD — TBD now
  // creates a slot-1 placeholder goal so the spotlight position
  // exists even without a chosen song) OR an enabled days target.
  // A pure days-only save still works for users who only want the
  // consistency floor.
  const hasQueueSlots = queue.length > 0;
  const hasDaysTarget =
    daysTarget.consistencyEnabled && daysTarget.consistencyCount > 0;
  const hasSelection = hasQueueSlots || hasDaysTarget;
  // Stub records array — saveOverride owns the actual write so the
  // contents don't matter, but BodyShell uses records.length || saveOverride
  // to gate canSave. Passing one element keeps canSave honest.
  const stubRecords: EncodedRecord[] = hasSelection
    ? [{ description: 'placeholder', targetMetric: 'song_whole_at_level', targetValue: null, targetUnit: 'comfortable' }]
    : [];

  const saveOverride = async () => {
    if (!hasSelection) return;
    await persistRepertoireMonthlyGoal({
      queue,
      daysTarget,
      anchorGoalId: anchor.id,
      scope,
      targetDate,
      allSongs: allSongs ?? [],
      wantToLearn: wantToLearn ?? [],
    });
  };

  // Until songs + want-to-learn load, render an empty body so the
  // modal still opens promptly. Without this the picker would
  // render against undefined collections.
  if (!allSongs || !wantToLearn) {
    return (
      <Modal open onClose={onClose} title={`New ${SCOPE_LABEL[scope].toLowerCase()} Song Repertoire goal`}>
        <div className="text-sm text-neutral-500 italic">Loading songs…</div>
      </Modal>
    );
  }

  const excluded = excludedQueueRefs(queue);

  return (
    <BodyShell
      anchor={anchor}
      scope={scope}
      moduleId={moduleId}
      contextLines={initialSuggestion.contextLines}
      records={stubRecords}
      targetDate={targetDate}
      setTargetDate={setTargetDate}
      onClose={onClose}
      onSaved={onSaved}
      saveOverride={saveOverride}
    >
      <RepertoireMaintainSection songs={allSongs} />
      <ConsistencyTargetCard
        target={daysTarget}
        onChange={setDaysTarget}
        unitMode="days"
        cardTitle="Practice days"
        hint="Spread repertoire work across the week — days matter more than total hours."
        perDayMinutesOverride={REPERTOIRE_SESSION_DEFAULT_MINUTES}
      />
      <RepertoireSpotlightQueueSection
        queue={queue}
        onChange={setQueue}
        songs={allSongs}
        wantToLearn={wantToLearn}
        excludedSongIds={excluded.songIds}
        excludedWtlIds={excluded.wtlIds}
      />
    </BodyShell>
  );
}

/** Refs already in the queue — drives the picker's "don't show
 *  things already queued" filter. */
function excludedQueueRefs(queue: DraftSlot[]): {
  songIds: Set<string>;
  wtlIds: Set<string>;
} {
  const songIds = new Set<string>();
  const wtlIds = new Set<string>();
  for (const slot of queue) {
    const d = slot.data;
    if (d.kind === 'song') songIds.add(d.songId);
    else if (d.kind === 'wtl') wtlIds.add(d.entryId);
  }
  return { songIds, wtlIds };
}

// ---------------------------------------------------------------------
// Section 1 — Maintain & advancing (display only)
// ---------------------------------------------------------------------

function RepertoireMaintainSection({ songs }: { songs: ReadonlyArray<Song> }) {
  // `songs` arrives pre-sorted by learningOrder from the parent
  // body — the numbered list reads identically to the Repertoire
  // home's study sequence.
  return (
    <section className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
      <header>
        <div className="text-[10px] uppercase tracking-wide text-neutral-500">
          Maintaining &amp; advancing
        </div>
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          Keep these comfortable through the month
        </div>
      </header>
      {songs.length === 0 ? (
        <p className="text-xs text-neutral-500 italic">
          No songs in your repertoire yet — add one in the New section below.
        </p>
      ) : (
        <ol className="list-decimal list-inside text-sm text-neutral-700 dark:text-neutral-200 space-y-1 marker:text-neutral-400">
          {songs.map(s => (
            <li key={s.id}>
              <span>{s.title}</span>
              {s.artist && (
                <span className="text-xs text-neutral-500 ml-1">— {s.artist}</span>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="text-[11px] text-neutral-500 leading-snug">
        Display only — context for your month's commitment. No separate goal records are created for these.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------
// Section 3 — New this month (catalog pick / typed / TBD)
// ---------------------------------------------------------------------

/**
 * Song-of-the-Month queue picker. Up to MAX_SLOTS slots; first is
 * the spotlight (the currently active song-of-the-month), the rest
 * are commitments-in-waiting that surface when the spotlight is
 * complete.
 *
 *   · Pick from want-to-learn  — references a WTL entry. Slot 1
 *     promotes the entry to db.songs at goal-save time; slots 2/3
 *     leave it in WTL until they advance.
 *   · Pick from active songs   — references an existing db.songs id.
 *   · Mark TBD                 — placeholder slot.
 */
function RepertoireSpotlightQueueSection({
  queue,
  onChange,
  songs,
  wantToLearn,
  excludedSongIds,
  excludedWtlIds,
}: {
  queue: DraftSlot[];
  onChange: (next: DraftSlot[]) => void;
  songs: ReadonlyArray<Song>;
  wantToLearn: ReadonlyArray<WantToLearnEntry>;
  excludedSongIds: Set<string>;
  excludedWtlIds: Set<string>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const removeSlot = (key: string) =>
    onChange(queue.filter(s => s.key !== key));
  const canAddMore = queue.length < MAX_SLOTS;

  const addFromWtl = (entryId: string) => {
    if (!canAddMore) return;
    onChange([...queue, { key: newSlotKey(), data: { kind: 'wtl', entryId } }]);
    setPickerOpen(false);
  };
  const addFromSongs = (songId: string) => {
    if (!canAddMore) return;
    onChange([...queue, { key: newSlotKey(), data: { kind: 'song', songId } }]);
    setPickerOpen(false);
  };
  const addTbd = () => {
    if (!canAddMore) return;
    onChange([...queue, { key: newSlotKey(), data: { kind: 'tbd' } }]);
    setPickerOpen(false);
  };

  const slotLabel = (slot: DraftSlot): string => {
    const d = slot.data;
    if (d.kind === 'song') {
      const s = songs.find(x => x.id === d.songId);
      return s?.title ?? '(missing song)';
    }
    if (d.kind === 'wtl') {
      const e = wantToLearn.find(x => x.id === d.entryId);
      return e?.title ?? '(missing want-to-learn entry)';
    }
    return 'TBD';
  };
  const slotSub = (slot: DraftSlot, isSpotlight: boolean): string | null => {
    const d = slot.data;
    if (d.kind === 'song') {
      const s = songs.find(x => x.id === d.songId);
      return s?.artist || (isSpotlight ? 'from your repertoire' : null);
    }
    if (d.kind === 'wtl') {
      const e = wantToLearn.find(x => x.id === d.entryId);
      const artist = e?.artist || null;
      if (isSpotlight) {
        return artist
          ? `${artist} · moves to active songs on save`
          : 'moves to active songs on save';
      }
      return artist
        ? `${artist} · stays in want-to-learn until its turn`
        : 'stays in want-to-learn until its turn';
    }
    return isSpotlight
      ? 'placeholder — pick a song to start the month'
      : 'placeholder — pick a song when you decide';
  };

  const availableSongs = songs.filter(s => !excludedSongIds.has(s.id));
  const availableWtl = wantToLearn.filter(w => !excludedWtlIds.has(w.id));

  return (
    <section className="rounded-md border border-fluent/30 bg-fluent/5 p-3 space-y-2">
      <header>
        <div className="text-[10px] uppercase tracking-wide text-fluent">
          Song of the month
        </div>
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          Up to {MAX_SLOTS} slots — slot 1 is the spotlight
        </div>
      </header>

      {queue.length > 0 && (
        <ol className="space-y-1">
          {queue.map((slot, idx) => {
            const isSpotlight = idx === 0;
            const sub = slotSub(slot, isSpotlight);
            return (
              <li
                key={slot.key}
                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded border ${
                  isSpotlight
                    ? 'border-fluent/40 bg-white dark:bg-neutral-900/60'
                    : 'border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/40'
                }`}
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold ${
                      isSpotlight
                        ? 'bg-fluent text-white'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200'
                    }`}
                    title={isSpotlight ? 'Spotlight slot' : `Slot ${idx + 1}`}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm text-neutral-700 dark:text-neutral-200 truncate flex items-center gap-1.5">
                      {slotLabel(slot)}
                      {isSpotlight && (
                        <span className="text-[10px] uppercase tracking-wide text-fluent">
                          spotlight
                        </span>
                      )}
                    </div>
                    {sub && (
                      <div className="text-[11px] text-neutral-500 truncate">
                        {sub}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeSlot(slot.key)}
                  aria-label={`Remove slot ${idx + 1}`}
                  className="text-neutral-400 hover:text-needswork text-sm shrink-0"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {!canAddMore ? (
        <p className="text-[11px] text-neutral-500 italic">
          Queue full ({MAX_SLOTS} slots).
        </p>
      ) : !pickerOpen ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="text-xs text-neutral-600 dark:text-neutral-300 hover:text-fluent"
        >
          + Add slot
        </button>
      ) : (
        <div className="space-y-2 border-t border-neutral-200 dark:border-neutral-800 pt-2">
          {availableWtl.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                Pick from want-to-learn
              </div>
              <ul className="max-h-32 overflow-y-auto space-y-0.5 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 p-1">
                {availableWtl.map(e => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => addFromWtl(e.id)}
                      className="w-full text-left px-2 py-1 rounded text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      {e.title}
                      {e.artist && (
                        <span className="text-xs text-neutral-500 ml-1">
                          — {e.artist}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {availableSongs.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                Or pick from active songs
              </div>
              <ul className="max-h-32 overflow-y-auto space-y-0.5 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 p-1">
                {availableSongs.map(s => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => addFromSongs(s.id)}
                      className="w-full text-left px-2 py-1 rounded text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      {s.title}
                      {s.artist && (
                        <span className="text-xs text-neutral-500 ml-1">
                          — {s.artist}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={addTbd}
              className="text-xs text-neutral-600 dark:text-neutral-300 hover:text-fluent"
            >
              Add TBD slot →
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Repertoire save plumbing
// ---------------------------------------------------------------------

interface PersistRepertoireArgs {
  queue: DraftSlot[];
  /** Days-per-week practice target from the body's
   *  ConsistencyTargetCard. When enabled with a positive count, the
   *  persist path adds a `repertoire_days_per_cadence` child to the
   *  umbrella alongside the queue children. Coexists rather than
   *  replaces — a goal can have days-only, queue-only, or both. */
  daysTarget: {
    consistencyEnabled: boolean;
    consistencyCount: number;
    consistencyCadence: 'week' | 'month';
  };
  anchorGoalId: string;
  scope: ShortScope;
  targetDate: number;
  allSongs: ReadonlyArray<Song>;
  wantToLearn: ReadonlyArray<WantToLearnEntry>;
}

/**
 * Persist a Song-of-the-Month queue + optional days target as an
 * umbrella goal with N children.
 *
 * Slot 1 (the spotlight):
 *   · kind='song' — emit `song_whole_at_level` + relatedItems=[songId]
 *     (the existing shape the algorithm already surfaces).
 *   · kind='wtl'  — promote the WTL entry to db.songs FIRST, then emit
 *     the same `song_whole_at_level` shape pointing at the new id.
 *     The entry is removed from db.wantToLearn as part of promotion.
 *   · kind='tbd'  — emit `song_of_month` + targetValue=1 +
 *     targetUnit='tbd' + relatedItems=[]. Algorithm classifies this
 *     as unsupported; UI surfaces an "Add a song" prompt when this
 *     slot reaches the spotlight.
 *
 * Slots 2 and 3:
 *   · Emit `song_of_month` + targetValue=N + targetUnit='song'|'wtl'|'tbd' +
 *     relatedItems carrying the songId or wtl entryId (empty for TBD).
 *   · Want-to-learn entries are NOT promoted at this stage — they stay
 *     in db.wantToLearn until the slot advances to spotlight via
 *     advanceSpotlightQueue.
 *
 * Plus the optional days-per-cadence child (unchanged from before).
 */
async function persistRepertoireMonthlyGoal(
  args: PersistRepertoireArgs,
): Promise<void> {
  const {
    queue,
    daysTarget,
    anchorGoalId,
    scope,
    targetDate,
    allSongs,
    wantToLearn,
  } = args;
  const hasQueueSlots = queue.length > 0;
  const hasDaysTarget =
    daysTarget.consistencyEnabled && daysTarget.consistencyCount > 0;
  if (!hasQueueSlots && !hasDaysTarget) return;

  // ── Spotlight promotion ────────────────────────────────────────
  // If slot 1 is a want-to-learn pick, promote it BEFORE the goal
  // transaction so the resulting songId is known when we encode the
  // slot-1 child. Other slots stay in want-to-learn until their turn.
  // If the entry vanished between picker render and save (concurrent
  // delete), spotlight degrades to a TBD placeholder.
  let spotlightPromotedSongId: string | null = null;
  if (queue.length > 0 && queue[0].data.kind === 'wtl') {
    const entryId = queue[0].data.entryId;
    const entry = wantToLearn.find(e => e.id === entryId);
    if (entry) {
      spotlightPromotedSongId = await promoteWantToLearnEntry(entry);
    }
  }

  // ── Build child goal records ──────────────────────────────────
  const now = Date.now();
  const baseFields = {
    scope,
    contextTag: 'mixed' as const,
    relatedModules: ['repertoire'],
    startDate: now,
    targetDate,
    status: 'active' as const,
    contributesNumericallyToParent: false,
    lastEngagedAt: null as number | null,
    currentValue: 0,
  };

  const umbrellaId = crypto.randomUUID();
  const children: Goal[] = [];

  for (let i = 0; i < queue.length; i++) {
    const slot = queue[i];
    const slotIndex = i + 1;
    const d = slot.data;
    const isSpotlight = slotIndex === 1;

    if (isSpotlight) {
      // Slot 1: either song_whole_at_level (specific) or
      // song_of_month TBD.
      let songId: string | null = null;
      if (d.kind === 'song') {
        songId = d.songId;
      } else if (d.kind === 'wtl') {
        songId = spotlightPromotedSongId;
      }
      if (songId) {
        const s = allSongs.find(x => x.id === songId);
        const title = s?.title ?? (d.kind === 'wtl'
          ? (wantToLearn.find(e => e.id === d.entryId)?.title ?? 'new song')
          : '(missing)');
        children.push({
          id: crypto.randomUUID(),
          ...baseFields,
          description: `Song of the month: ${title}`,
          targetMetric: 'song_whole_at_level',
          targetValue: null,
          targetUnit: 'comfortable',
          relatedItems: [songId],
          parentGoalId: umbrellaId,
          isUmbrella: false,
        });
      } else {
        // TBD spotlight (or a wtl ref that vanished).
        children.push({
          id: crypto.randomUUID(),
          ...baseFields,
          description: 'Song of the month: TBD',
          targetMetric: SONG_OF_MONTH_METRIC,
          targetValue: 1,
          targetUnit: 'tbd',
          relatedItems: [],
          parentGoalId: umbrellaId,
          isUmbrella: false,
        });
      }
      continue;
    }

    // Slot 2/3: song_of_month metric with the slot index + payload.
    const kind: SlotPayloadKind = d.kind;
    let refId: string | null = null;
    let title = 'TBD';
    if (d.kind === 'song') {
      refId = d.songId;
      title = allSongs.find(x => x.id === d.songId)?.title ?? '(missing)';
    } else if (d.kind === 'wtl') {
      refId = d.entryId;
      title = wantToLearn.find(e => e.id === d.entryId)?.title ?? '(missing)';
    }
    children.push({
      id: crypto.randomUUID(),
      ...baseFields,
      description: `Queue ${slotIndex}: ${title}`,
      targetMetric: SONG_OF_MONTH_METRIC,
      targetValue: slotIndex,
      targetUnit: kind,
      relatedItems: refId ? [refId] : [],
      parentGoalId: umbrellaId,
      isUmbrella: false,
    });
  }

  // Days-per-week consistency child, when the body's
  // ConsistencyTargetCard is enabled. WeeklyPlan reads this single
  // record and derives the per-day time block using
  // REPERTOIRE_SESSION_DEFAULT_MINUTES — total weekly time =
  // days × ~45 min.
  if (hasDaysTarget) {
    children.push({
      id: crypto.randomUUID(),
      ...baseFields,
      description: `${daysTarget.consistencyCount} days per week on repertoire`,
      targetMetric: 'repertoire_days_per_cadence',
      targetValue: daysTarget.consistencyCount,
      // Days metric is always weekly — the card no longer exposes a
      // monthly toggle.
      targetUnit: 'week',
      relatedItems: [],
      parentGoalId: umbrellaId,
      isUmbrella: false,
    });
  }

  // ── Umbrella row ──────────────────────────────────────────────
  const queueCount = queue.length;
  const queuePhrase =
    queueCount > 0
      ? `${queueCount} song-of-the-month slot${queueCount === 1 ? '' : 's'}`
      : '';
  const daysPhrase = hasDaysTarget
    ? `${daysTarget.consistencyCount} days/week`
    : '';
  const phrases = [queuePhrase, daysPhrase].filter(p => p.length > 0).join(' + ');
  const umbrellaDescription = `Repertoire month: ${phrases}`;
  const umbrella: Goal = {
    id: umbrellaId,
    ...baseFields,
    description: umbrellaDescription,
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    relatedItems: [],
    parentGoalId: anchorGoalId,
    isUmbrella: true,
  };

  // Note: the spotlight WTL promotion (if any) already ran outside
  // this transaction — promoteWantToLearnEntry has its own. We only
  // need the goals table here.
  await db.transaction('rw', db.goals, async () => {
    await db.goals.add(umbrella);
    await db.goals.bulkAdd(children);
  });
}
