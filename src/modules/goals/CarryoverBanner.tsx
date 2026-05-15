/**
 * Phase B Step 9b — cross-month carry-over banner + review modal.
 *
 * Banner visibility (per the design doc):
 *   · Detect uncovered items in last month's monthly target per
 *     module via getUncoveredItemsFromLastMonth.
 *   · Surface a banner on Goals home with per-module counts.
 *   · Persist until the user:
 *       1. Opens the review modal AND records an Accept/Decline for
 *          every module with uncovered items, OR
 *       2. X-dismisses ("skip this month") — banner hides for the
 *          rest of the calendar month, but the carryover backlog
 *          (Commit 1) still surfaces the items in the candidate
 *          pool.
 *   · No auto-dismiss; no time-based hiding.
 *
 * Review modal:
 *   · Per-module row with leftover count + Accept / Decline buttons.
 *   · Save commits the decisions; the banner re-evaluates and hides
 *     iff every detected module now has a decision.
 *
 * Accept's "scope extension into this month's monthly goal" — the
 * design's full mechanism for adding leftover itemRefs into the
 * existing coverage goal — is deferred. Coverage goals are
 * metric-driven (subArea predicates), not item-list-driven, so the
 * scope-extension mechanic needs a GoalCreationFlow integration
 * round (route Accept through the create/edit flow, pre-populated
 * with leftover items as the starting scope). Today, Accept records
 * the explicit commitment; the candidate pool already surfaces the
 * items via the carryover-backlog factor (Commit 1) regardless of
 * Accept vs. Decline. The on-disk decision marker is the hook a
 * later commit can read to lift accepted items further.
 */

import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { moduleMetaById } from '../../lib/moduleMeta';
import {
  getUncoveredItemsFromLastMonth,
  type ModuleUncoveredEntry,
} from './carryover';
import {
  dismissBannerForMonth,
  isBannerDismissedForMonth,
  loadCarryoverDecisions,
  pendingModulesForBanner,
  saveCarryoverDecisions,
  type CarryoverDecision,
  type DecisionsByModule,
} from './carryoverBannerState';
import type { GoalFlowModuleId } from './goalVocabulary';

interface BannerProps {
  /** Re-render hook — when the parent's data view changes (e.g. a
   *  goal was added that turned a previously-pending module into a
   *  fully-decided one), bumping this re-runs detection. Optional;
   *  the banner re-detects on its own when decisions change too. */
  reloadKey?: unknown;
}

// =====================================================================
// Banner
// =====================================================================

export default function CarryoverBanner({ reloadKey }: BannerProps) {
  const [detection, setDetection] = useState<ModuleUncoveredEntry[] | null>(null);
  const [decisions, setDecisions] = useState<DecisionsByModule>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  // Initial + reloadKey-driven detection.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const out = await getUncoveredItemsFromLastMonth();
      if (cancelled) return;
      setDetection(out);
      setDecisions(loadCarryoverDecisions());
      setDismissed(isBannerDismissedForMonth());
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const pendingModules = useMemo(() => {
    if (!detection) return [];
    return pendingModulesForBanner(
      detection.map(e => e.moduleId),
      decisions,
    );
  }, [detection, decisions]);

  // The banner is visible when:
  //   · Detection has run AND found uncovered items
  //   · User hasn't X-dismissed this calendar month
  //   · At least one detected module is still pending a decision
  const visible =
    detection !== null
    && detection.length > 0
    && !dismissed
    && pendingModules.length > 0;

  if (!visible || !detection) return null;

  function handleDismiss() {
    dismissBannerForMonth();
    setDismissed(true);
  }

  function handleReviewSubmit(next: DecisionsByModule) {
    saveCarryoverDecisions(next);
    setDecisions(next);
    setReviewOpen(false);
  }

  const summary = formatPerModuleSummary(detection.filter(
    e => decisions[e.moduleId] === undefined,
  ));

  return (
    <>
      <div
        data-testid="carryover-banner"
        className="rounded-md border border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 px-4 py-3 flex items-start gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-violet-900 dark:text-violet-200">
            Last month — items still uncovered
          </div>
          <div className="text-xs text-violet-800/80 dark:text-violet-300/80 mt-0.5">
            {summary}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="px-3 py-1.5 text-sm rounded-md bg-violet-600 text-white hover:bg-violet-700"
          >
            Review →
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="dismiss"
            className="text-violet-700/70 dark:text-violet-300/70 hover:text-violet-900 dark:hover:text-violet-100 text-xl leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {reviewOpen && (
        <CarryoverReviewModal
          entries={detection}
          initialDecisions={decisions}
          onClose={() => setReviewOpen(false)}
          onSubmit={handleReviewSubmit}
        />
      )}
    </>
  );
}

/** "30 HF, 12 ET, 45 S&P items uncovered" — banner sub-label. */
function formatPerModuleSummary(entries: ReadonlyArray<ModuleUncoveredEntry>): string {
  if (entries.length === 0) return '';
  const parts = entries.map(e => {
    const label = moduleMetaById(e.moduleId)?.label ?? e.moduleId;
    const n = e.uncoveredItemRefs.length;
    return `${n} ${label}`;
  });
  return `Last month: ${parts.join(', ')} item${
    entries.reduce((s, e) => s + e.uncoveredItemRefs.length, 0) === 1 ? '' : 's'
  } uncovered.`;
}

// =====================================================================
// Review modal
// =====================================================================

function CarryoverReviewModal({
  entries,
  initialDecisions,
  onClose,
  onSubmit,
}: {
  entries: ReadonlyArray<ModuleUncoveredEntry>;
  initialDecisions: DecisionsByModule;
  onClose: () => void;
  onSubmit: (next: DecisionsByModule) => void;
}) {
  const [draft, setDraft] = useState<DecisionsByModule>(initialDecisions);

  function toggle(moduleId: GoalFlowModuleId, decision: CarryoverDecision | undefined) {
    setDraft(prev => {
      const next = { ...prev };
      if (decision === undefined) {
        delete next[moduleId];
      } else {
        next[moduleId] = decision;
      }
      return next;
    });
  }

  const allDecided = entries.every(e => draft[e.moduleId] !== undefined);

  return (
    <Modal
      open
      onClose={onClose}
      title="Carry over from last month"
      description="Decide per module — items you Decline stay surfaced via the spacing system but don't get added to this month's goal."
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(draft)}
            disabled={!allDecided}
            data-testid="carryover-save"
            className={`px-4 py-1.5 rounded-md text-sm font-medium text-white ${
              allDecided
                ? 'bg-violet-600 hover:bg-violet-700'
                : 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
            }`}
          >
            Save
          </button>
        </div>
      )}
    >
      <ul className="flex flex-col gap-2" data-testid="carryover-review-list">
        {entries.map(entry => {
          const label = moduleMetaById(entry.moduleId)?.label ?? entry.moduleId;
          const accent = moduleMetaById(entry.moduleId)?.accentHex ?? '#7c3aed';
          const current = draft[entry.moduleId];
          return (
            <li
              key={entry.moduleId}
              data-testid={`carryover-row-${entry.moduleId}`}
              className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-700 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200 min-w-0">
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: accent }}
                />
                <span className="truncate">
                  <span className="font-medium">{label}</span>
                  <span className="ml-2 text-neutral-500">
                    {entry.uncoveredItemRefs.length} item
                    {entry.uncoveredItemRefs.length === 1 ? '' : 's'} uncovered
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <DecisionButton
                  active={current === 'accepted'}
                  onClick={() => toggle(
                    entry.moduleId,
                    current === 'accepted' ? undefined : 'accepted',
                  )}
                  testId={`accept-${entry.moduleId}`}
                  label="Accept"
                  activeClass="bg-emerald-600 text-white border-emerald-600"
                  inactiveClass="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                />
                <DecisionButton
                  active={current === 'declined'}
                  onClick={() => toggle(
                    entry.moduleId,
                    current === 'declined' ? undefined : 'declined',
                  )}
                  testId={`decline-${entry.moduleId}`}
                  label="Decline"
                  activeClass="bg-neutral-600 text-white border-neutral-600"
                  inactiveClass="border-neutral-300 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-neutral-500">
        Accept = explicit commitment to keep practising these items
        this month. Decline = items still in the spacing-system
        backlog (they surface naturally), just not pinned to this
        month's plan. Either way, items only leave the backlog when
        they reach acquired status.
      </p>
    </Modal>
  );
}

function DecisionButton({
  active,
  onClick,
  label,
  activeClass,
  inactiveClass,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  activeClass: string;
  inactiveClass: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
        active ? activeClass : inactiveClass
      }`}
    >
      {label}
    </button>
  );
}
