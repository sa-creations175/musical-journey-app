import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../lib/db';
import {
  PROMPT_TYPE,
  ensureGoalsNudge,
  markEngaged,
  markShown,
} from '../../lib/prompts';

/**
 * Inline goals nudge for Practice Sessions home (Q7 resolution).
 *
 * Behavior (sub-phase 5, simplified design):
 *   - Banner shows on every Practice Sessions visit when the user
 *     has zero active goals.
 *   - "Maybe later" dismisses it for the current component mount
 *     only — local React state, not persisted. Navigating away
 *     and back resets the dismissal.
 *   - When at least one active goal exists, the banner is
 *     permanently gone (ensureGoalsNudge expires the live prompt
 *     row when goals.length > 0).
 *
 * The prompts table still logs:
 *   - one queued row per "no-goals state" (created by ensureGoalsNudge),
 *   - flipped to 'shown' the first time this component renders it
 *     (markShown — drives the orchestrator's daily-cap counting
 *     and Phase 7 analytics),
 *   - flipped to 'engaged' if the user clicks "Set up goals →".
 *
 * No 'dismissed' status is ever written for this prompt type —
 * dismissal is session-local state, not a persisted signal.
 */

export default function GoalsNudgeBanner() {
  const goals = useLiveQuery(
    () => db.goals.where('status').equals('active').toArray(),
    [],
  );
  const nudgePrompts = useLiveQuery(
    () => db.prompts.where('promptType').equals(PROMPT_TYPE.SET_GOALS_NUDGE).toArray(),
    [],
  );
  // Session-local dismiss flag. Resets when the component remounts
  // (route change away and back), so the banner re-surfaces on the
  // next visit if the user still has zero goals.
  const [dismissed, setDismissed] = useState(false);

  // Reconcile the prompt row whenever the goals count transitions.
  // ensureGoalsNudge is idempotent: it expires live nudges when
  // goals exist and enqueues a new one (or returns the existing
  // live one) when none do. Dep is the count, not the array — the
  // live query returns a new array reference on every refire but we
  // only care about zero/non-zero transitions.
  const goalsLength = goals?.length;
  useEffect(() => {
    if (goalsLength === undefined) return;
    void ensureGoalsNudge().catch(err => {
      console.warn('[GoalsNudgeBanner] ensureGoalsNudge failed', err);
    });
  }, [goalsLength]);

  // Pick the live prompt to render: queued or shown.
  const live = nudgePrompts?.find(p => p.status === 'queued' || p.status === 'shown') ?? null;

  // Mark the prompt shown the first time the banner actually
  // renders it. The mark is guarded inside markShown to only
  // transition queued → shown, so re-renders within a session
  // (where status is already 'shown') no-op.
  const liveId = live?.id;
  const liveStatus = live?.status;
  useEffect(() => {
    if (liveId && liveStatus === 'queued') {
      void markShown(liveId).catch(err => {
        console.warn('[GoalsNudgeBanner] markShown failed', err);
      });
    }
  }, [liveId, liveStatus]);

  // Wait for both queries to land before deciding — avoids the
  // banner flashing in for one render before the prompts query
  // resolves and ensure has had a chance to expire stale rows.
  if (goals === undefined || nudgePrompts === undefined) return null;
  if (!live) return null;
  if (dismissed) return null;

  const handleDismiss = () => setDismissed(true);

  const handleEngage = () => {
    // Fire-and-forget: the user is navigating away, no need to
    // await. Marks the prompt 'engaged' for analytics — distinct
    // from a dismissal because the user took the suggested action.
    void markEngaged(live.id).catch(err => {
      console.warn('[GoalsNudgeBanner] markEngaged failed', err);
    });
  };

  return (
    <div className="rounded-md border border-fluent/30 bg-fluent/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          You haven't set any goals yet.
        </div>
        <div className="text-xs text-neutral-600 dark:text-neutral-300 mt-0.5">
          Goals shape what Practice Sessions recommends — a few minutes to set
          them up makes everything else more useful.
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleDismiss}
          className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          Maybe later
        </button>
        <Link
          to="/goals"
          onClick={handleEngage}
          className="px-3 py-1.5 text-sm rounded-md bg-fluent text-white hover:bg-fluent/90"
        >
          Set up goals →
        </Link>
      </div>
    </div>
  );
}
