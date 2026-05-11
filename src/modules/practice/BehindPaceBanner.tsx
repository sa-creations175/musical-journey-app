/**
 * Phase 4 Step 4 — Behind-pace nudges on the proposal screen.
 *
 * When the user has weekly attempt targets and is meaningfully
 * behind on a module (< 50% of target with > 2 days remaining),
 * surface one row per affected module above the proposal cards
 * with a yes/no action: "You're behind on {Module} this week — add
 * it to this session?"
 *
 * The notice is intentionally context-blind — a keys session can
 * surface "behind on HF" because the user might want to override
 * the default arc to catch up. The yes-action wires to
 * onAddModule(moduleId), which the proposal generator uses to
 * inject the named module past the hard filter.
 *
 * Separate from FeasibilityBanner: that one is about long-horizon
 * goal trajectories; this one is about this-week cadence. They can
 * appear together — different signals, different time scales.
 */

import { moduleMetaById } from '../../lib/moduleMeta';
import type { BehindPaceNotice } from '../../lib/sessionAlgorithm/weeklyPace';
import type { GoalFlowModuleId } from '../goals/goalVocabulary';

interface Props {
  notices: ReadonlyArray<BehindPaceNotice>;
  /** Invoked when the user picks Yes on a notice — inject this
   *  module's top item into the proposal, even if the context hard
   *  filter would normally exclude it. The proposal generator
   *  decides which item to add. */
  onAddModule: (moduleId: GoalFlowModuleId) => void;
  /** Per-notice dismissal — hides the row for this session (not
   *  persisted; resets on next proposal generation). The notice
   *  data itself isn't deleted, just visually skipped. */
  onDismiss: (moduleId: string) => void;
  /** Set of moduleIds dismissed this session. Caller owns the
   *  state — banner is stateless w.r.t. dismissal so it survives
   *  re-renders without losing the per-notice memo. */
  dismissed: ReadonlySet<string>;
}

const MODULE_LABELS: Record<GoalFlowModuleId, string> = {
  'harmonic-fluency':     'Harmonic Fluency',
  'ear-training':         'Ear Training',
  'shapes-and-patterns':  'Shapes & Patterns',
  'repertoire':           'Repertoire',
  'production':           'Production',
  'practice-consistency': 'Practice Consistency',
};

function moduleLabel(moduleId: string): string {
  if (moduleId in MODULE_LABELS) {
    return MODULE_LABELS[moduleId as GoalFlowModuleId];
  }
  return moduleMetaById(moduleId)?.label ?? moduleId;
}

export default function BehindPaceBanner({
  notices,
  onAddModule,
  onDismiss,
  dismissed,
}: Props) {
  const visible = notices.filter(n => !dismissed.has(n.moduleId));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map(notice => {
        const label = moduleLabel(notice.moduleId);
        const dayWord = notice.daysRemaining === 1 ? 'day' : 'days';
        return (
          <div
            key={notice.moduleId}
            className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex items-start gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-amber-900 dark:text-amber-200">
                You're behind on {label} this week
              </div>
              <div className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                {notice.actual} of {notice.target} {notice.target === 1 ? 'attempt' : 'attempts'} so
                far — {notice.daysRemaining} {dayWord} left. Add it to this session?
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onAddModule(notice.moduleId as GoalFlowModuleId)}
                className="px-3 py-1.5 text-sm rounded-md bg-amber-600 text-white hover:bg-amber-700"
              >
                Add
              </button>
              <button
                onClick={() => onDismiss(notice.moduleId)}
                aria-label="dismiss"
                className="text-amber-700/70 dark:text-amber-300/70 hover:text-amber-900 dark:hover:text-amber-100 text-xl leading-none"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
