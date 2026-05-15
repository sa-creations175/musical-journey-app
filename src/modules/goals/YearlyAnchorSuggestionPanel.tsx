/**
 * Phase B Step 9c Part D — yearly-anchor suggestion panel.
 *
 * Renders inline at the bottom of GoalCreationFlow's Step 2 (target
 * picker) when the user is creating or reviewing a MONTHLY coverage
 * goal. Shows yearly pace + current-scope target + time context +
 * consequence %, plus an actionable progression suggestion (or the
 * half-done two-option UX) when one is available.
 *
 * Hidden when:
 *   - draft.scope !== 'monthly' (yearly anchor only applies to
 *     monthly goals per the doc)
 *   - no yearly anchor exists for the module (the user has an
 *     existing "set yearly anchor" backstop in the by-module view)
 *   - the draft's encoded record set is empty / non-coverage
 *
 * One-tap "Accept" appends suggested itemRefs to
 * `draft.pendingRelatedItems` and bumps `draft.pendingTargetBump`;
 * the GoalCreationFlow save path consumes both into the encoded
 * coverage record's `relatedItems` + `targetValue` (same on-disk
 * shape carryover-Accept writes, per the doc's "uses the existing
 * relatedItems mechanism").
 *
 * Accept is enabled only when the draft encodes to a SINGLE coverage
 * record — multi-pick drafts (e.g., HF with 2 categories picked)
 * disable the Accept button because the bump has no unambiguous home
 * record. The panel still renders pace info in that case.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db, type Goal } from '../../lib/db';
import type { GoalFlowModuleId } from './goalVocabulary';
import {
  computeYearlyPaceContext,
  monthsRemainingInYear,
} from './yearlyPaceContext';
import { minutesPerAttemptForModule } from '../../lib/sessionAlgorithm/moduleWeeklyNeed';
import {
  computeNextProgressionSuggestion,
  type ProgressionSuggestion,
} from './progressionSuggestion';
import { progressionForGoal } from './progressionStages';
import { findAnchorGoalForModule } from './anchorLookup';
import {
  getCoverageCount,
  getEffectiveCoverageCount,
} from './progress';
import { effectiveScopeForGoal } from './scopeEnumeration';
import {
  isCoverageMetric,
  isCoverageSpecificMetric,
} from './coverageMetrics';

// =====================================================================
// Props
// =====================================================================

/**
 * Minimum-shape draft view — the panel only needs the bits it
 * computes pace context from. Passing the whole Draft would create
 * a circular import (Draft is exported from GoalCreationFlow which
 * is the only consumer of this panel).
 */
export interface PanelDraftView {
  moduleId: GoalFlowModuleId;
  /** What the encoder produced from the current draft. Empty when
   *  the draft isn't yet a valid coverage spec. */
  encodedRecords: ReadonlyArray<{
    description: string;
    targetMetric: string | null;
    targetValue: number | null;
    targetUnit: string | null;
  }>;
  pendingRelatedItems: ReadonlyArray<string>;
  pendingTargetBump: number;
}

export interface YearlyAnchorSuggestionPanelProps {
  draft: PanelDraftView;
  /** Called when the user one-taps Accept on a progression suggestion.
   *  The handler merges itemRefs into draft.pendingRelatedItems and
   *  adds addCount onto draft.pendingTargetBump. */
  onAcceptSuggestion: (itemRefs: ReadonlyArray<string>, addCount: number) => void;
  /** Optional "today" override for tests / time-pinning. Defaults to
   *  Date.now(). */
  today?: number;
}

// =====================================================================
// Component
// =====================================================================

const CONSISTENCY_METRIC = 'practice_days_per_cadence';

export function YearlyAnchorSuggestionPanel({
  draft,
  onAcceptSuggestion,
  today,
}: YearlyAnchorSuggestionPanelProps) {
  const now = today ?? Date.now();

  // Yearly anchor + consistency target — live queries so the panel
  // refreshes if the user creates an anchor in another tab.
  const yearlyAnchor = useLiveQuery(
    () => findAnchorGoalForModule(draft.moduleId),
    [draft.moduleId],
    null as Goal | null,
  );
  const consistencyTargetDays = useLiveQuery(
    async () => {
      const goals = await db.goals.toArray();
      const g = goals.find(
        x =>
          x.status === 'active'
          && x.targetMetric === CONSISTENCY_METRIC
          && x.startDate <= now
          && x.targetDate >= now,
      );
      return g?.targetValue ?? 0;
    },
    [now],
    0,
  );

  // Synthesize a Goal-like from the draft's encoded records for the
  // covered-count + effective-scope reads. We use only the FIRST
  // coverage record's metric + targetUnit + targetValue; multi-record
  // drafts (HF with 2 picked groups) still show pace numbers but
  // disable Accept. relatedItems on the synthesized goal includes
  // pendingRelatedItems so the user sees post-Accept numbers
  // update live.
  const coverageRecord = useMemo(
    () => draft.encodedRecords.find(
      r => r.targetMetric !== null && isCoverageMetric(r.targetMetric),
    ),
    [draft.encodedRecords],
  );

  const coverageRecordCount = useMemo(
    () => draft.encodedRecords.filter(
      r => r.targetMetric !== null && isCoverageMetric(r.targetMetric),
    ).length,
    [draft.encodedRecords],
  );

  // Build a synthetic Goal so we can reuse the existing
  // getEffectiveCoverageCount + effectiveScopeForGoal helpers.
  // `id`-style fields are stubs the helpers don't touch.
  const draftAsGoal: Goal | null = useMemo(() => {
    if (!coverageRecord) return null;
    return {
      id: 'draft-preview',
      scope: 'monthly',
      description: coverageRecord.description,
      targetMetric: coverageRecord.targetMetric,
      targetValue:
        (coverageRecord.targetValue ?? 0) + draft.pendingTargetBump,
      targetUnit: coverageRecord.targetUnit,
      currentValue: 0,
      contextTag: null,
      relatedModules: [draft.moduleId],
      relatedItems: [...draft.pendingRelatedItems],
      startDate: now,
      targetDate: now,
      status: 'active',
      parentGoalId: null,
      contributesNumericallyToParent: false,
      isUmbrella: false,
      lastEngagedAt: null,
    };
  }, [coverageRecord, draft.moduleId, draft.pendingRelatedItems, draft.pendingTargetBump, now]);

  // Coverage numerators — anchor-overall + current-scope.
  const coveredSoFar = useLiveQuery(
    async () => {
      if (!yearlyAnchor) return 0;
      const metric = yearlyAnchor.targetMetric;
      if (!metric || !isCoverageMetric(metric)) return 0;
      return getCoverageCount(
        metric,
        isCoverageSpecificMetric(metric) ? yearlyAnchor.targetUnit : null,
      );
    },
    [yearlyAnchor],
    0,
  );

  const currentMonthlyCovered = useLiveQuery(
    async () => {
      if (!draftAsGoal) return 0;
      return getEffectiveCoverageCount(draftAsGoal);
    },
    [draftAsGoal],
    0,
  );

  // Pure-compute the panel context from the gathered inputs.
  const context = useMemo(() => {
    return computeYearlyPaceContext({
      moduleId: draft.moduleId,
      yearlyAnchor: yearlyAnchor ?? null,
      coveredSoFar: coveredSoFar ?? 0,
      currentMonthlyGoal: draftAsGoal,
      currentMonthlyCovered: currentMonthlyCovered ?? 0,
      consistencyTargetDays: consistencyTargetDays ?? 0,
      today: now,
    });
  }, [
    draft.moduleId,
    yearlyAnchor,
    coveredSoFar,
    draftAsGoal,
    currentMonthlyCovered,
    consistencyTargetDays,
    now,
  ]);

  // Progression suggestion — pure, derived from the draft's
  // effective scope (which includes pendingRelatedItems via
  // draftAsGoal).
  const suggestion: ProgressionSuggestion | null = useMemo(() => {
    if (!draftAsGoal) return null;
    if (context.kind !== 'visible') return null;
    if (context.affirmative) return null; // affirmative state hides the suggestion
    const stages = progressionForGoal(draft.moduleId, draftAsGoal.targetUnit);
    if (stages.length === 0) return null;
    const scope = effectiveScopeForGoal(draftAsGoal);
    return computeNextProgressionSuggestion(stages, scope);
  }, [draft.moduleId, draftAsGoal, context]);

  // Hide branch — no anchor, panel is suppressed entirely.
  if (context.kind === 'hidden') return null;
  // Hide branch — module has no progression-bearing data AND no
  // anchor matching. Defensive — already covered by 'hidden'.

  // ---------------- Render ----------------
  const acceptEnabled = coverageRecordCount === 1;

  return (
    <div className="rounded-md border border-fluent/30 bg-fluent/5 px-3 py-3 mt-3 flex flex-col gap-2 text-sm">
      <div className="text-[10px] uppercase tracking-wide text-fluent">
        Yearly anchor pace
      </div>

      {/* Pace + current scope target lines */}
      <div className="text-neutral-800 dark:text-neutral-100">
        <div>
          Yearly pace: <strong>~{Math.round(context.yearlyPaceMonthly)}</strong>{' '}
          items / month{' '}
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            ({context.coveredSoFar} / {context.yearlyTotal} covered ·{' '}
            {context.monthsRemainingInYear} mo left)
          </span>
        </div>
        <div>
          Current scope target: <strong>{context.currentScopeTarget}</strong>{' '}
          {context.currentScopeCovered > 0 && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              ({context.currentScopeCovered} already covered)
            </span>
          )}
        </div>
        {context.timePerDayMinutes !== null && (
          <div className="text-xs text-neutral-600 dark:text-neutral-300">
            ~{context.timePerDayMinutes} min/day across{' '}
            {context.consistencyTargetDays} practice days
          </div>
        )}
        <div className="text-xs text-neutral-600 dark:text-neutral-300">
          At this pace you'll cover <strong>{context.consequencePct}%</strong>{' '}
          of the yearly anchor by Dec 31.
        </div>
      </div>

      {/* Affirmative state OR suggestion */}
      {context.affirmative ? (
        <div className="rounded bg-green-100/60 dark:bg-green-900/30 text-green-900 dark:text-green-200 px-2 py-1 text-xs">
          On track for yearly pace this month — no extra scope needed.
        </div>
      ) : (
        <SuggestionRow
          suggestion={suggestion}
          acceptEnabled={acceptEnabled}
          onAccept={onAcceptSuggestion}
        />
      )}

      {/* Pending preview — surfaced after a one-tap Accept */}
      {draft.pendingTargetBump > 0 && (
        <div className="text-[11px] text-fluent">
          Pending: +{draft.pendingTargetBump} items will be added on save.
        </div>
      )}
    </div>
  );
}

// =====================================================================
// SuggestionRow
// =====================================================================

interface SuggestionRowProps {
  suggestion: ProgressionSuggestion | null;
  acceptEnabled: boolean;
  onAccept: (itemRefs: ReadonlyArray<string>, addCount: number) => void;
}

function SuggestionRow({
  suggestion,
  acceptEnabled,
  onAccept,
}: SuggestionRowProps) {
  if (suggestion === null) {
    return (
      <div className="text-xs text-neutral-500 dark:text-neutral-400 italic">
        No single next step jumps out — pick a target manually to keep
        moving.
      </div>
    );
  }

  if (suggestion.kind === 'next') {
    return (
      <div className="flex flex-col gap-1">
        <div className="text-neutral-800 dark:text-neutral-100">
          Next: <strong>{suggestion.stage.name}</strong>{' '}
          (+{suggestion.addCount} toward yearly pace)
        </div>
        {suggestion.stage.description && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {suggestion.stage.description}
          </div>
        )}
        <AcceptButton
          label={`Add ${suggestion.stage.name} (+${suggestion.addCount})`}
          enabled={acceptEnabled}
          onClick={() => onAccept(suggestion.addItemRefs, suggestion.addCount)}
        />
      </div>
    );
  }

  // half-done
  return (
    <div className="flex flex-col gap-2">
      <div className="text-neutral-800 dark:text-neutral-100">
        You have <strong>
          {suggestion.currentStage.itemRefs.length - suggestion.currentStageAddCount}
          {' '}of{' '}
          {suggestion.currentStage.itemRefs.length}
        </strong>{' '}
        items in <strong>{suggestion.currentStage.name}</strong>. Options:
      </div>
      <AcceptButton
        label={`Finish ${suggestion.currentStage.name} (+${suggestion.currentStageAddCount})`}
        enabled={acceptEnabled && suggestion.currentStageAddCount > 0}
        onClick={() =>
          onAccept(
            suggestion.currentStageRemainingItemRefs,
            suggestion.currentStageAddCount,
          )
        }
      />
      {suggestion.nextStage && suggestion.nextStageAddCount > 0 && (
        <AcceptButton
          label={`Move to ${suggestion.nextStage.name} (+${suggestion.nextStageAddCount})`}
          enabled={acceptEnabled}
          onClick={() =>
            onAccept(
              suggestion.nextStageAddItemRefs,
              suggestion.nextStageAddCount,
            )
          }
        />
      )}
    </div>
  );
}

function AcceptButton({
  label,
  enabled,
  onClick,
}: {
  label: string;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className={[
        'self-start text-xs px-2 py-1 rounded border transition',
        enabled
          ? 'border-fluent bg-fluent text-white hover:bg-fluent/90'
          : 'border-neutral-300 dark:border-neutral-700 text-neutral-400 cursor-not-allowed',
      ].join(' ')}
      title={
        enabled
          ? undefined
          : 'One-tap accept is only available when the goal scopes to a single sub-area.'
      }
    >
      {label}
    </button>
  );
}

// minutesPerAttemptForModule is re-exported so the panel's tests can
// derive expected timePerDay values without re-importing from the
// algorithm package.
export { minutesPerAttemptForModule, monthsRemainingInYear };
