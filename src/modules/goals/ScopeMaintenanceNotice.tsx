/**
 * Scope-level maintenance — the shared suggestion surface (step 3).
 *
 * ONE component, three mount points: the goal flow (when setting or
 * reviewing a goal for the scope), the weekly plan (beside the
 * scope's allocation), and the end-of-session summary (after practice
 * that touched it). Same suggestion, shown where it is relevant.
 *
 * All three read the same resolver and write the same pref record, so
 * dismissing anywhere quiets everywhere for 7 days. That is not
 * coordination between the surfaces — it falls out of there being one
 * record. Three components with three dismissal stores would drift
 * the moment one of them changed.
 *
 * SUGGEST AND CONFIRM, BOTH DIRECTIONS. Entering maintenance and
 * leaving it are the same interaction wearing different words: the
 * app proposes, the user decides, dismissal snoozes for a week. The
 * component is deliberately symmetric so the two never grow apart.
 *
 * "SCOPE-LEVEL MAINTENANCE" IS SPELLED OUT IN FULL, every time.
 * There is a separate per-item maintenance (SkillPriority in the
 * Skills module) and the two are genuinely different things — one
 * changes what gets practised inside a slice, the other how big the
 * slice is. Naked "maintenance" in the UI would collapse them.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  confirmScopeMaintenance,
  dismissScopeMaintenanceReleaseSuggestion,
  dismissScopeMaintenanceSuggestion,
  releaseScopeMaintenance,
} from '../../lib/sessionAlgorithm/scopeMaintenanceState';
import {
  loadScopeMaintenanceViews,
  type ScopeMaintenanceView,
} from '../../lib/sessionAlgorithm/scopeMaintenanceResolve';

/** Load the views once per mount. Each surface calls this rather than
 *  threading state down, because the three mount points sit in
 *  unrelated trees. */
export function useScopeMaintenanceViews(): {
  views: ScopeMaintenanceView[];
  refresh: () => void;
} {
  const [views, setViews] = useState<ScopeMaintenanceView[]>([]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    void loadScopeMaintenanceViews().then(v => {
      if (live) setViews(v);
    });
    return () => { live = false; };
  }, [nonce]);

  return { views, refresh: useCallback(() => setNonce(n => n + 1), []) };
}

interface Props {
  view: ScopeMaintenanceView;
  /** Called after any write so the host can re-read. */
  onChanged?: () => void;
}

export default function ScopeMaintenanceNotice({ view, onChanged }: Props) {
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  if (!view.suggestEnter && !view.suggestRelease) return null;

  const entering = view.suggestEnter;

  return (
    <div
      role="status"
      className="rounded-md border border-fluent/30 bg-fluent/5 px-3 py-2 text-[12px] text-neutral-700 dark:text-neutral-200"
    >
      <p className="mb-1.5">
        {entering ? (
          <>
            Everything in <strong>{view.label}</strong> is learned and
            holding steady. Move it to{' '}
            <strong>scope-level maintenance</strong>? It keeps a smaller
            slot in your sessions instead of dropping out of them.
          </>
        ) : (
          <>
            <strong>{view.label}</strong> has slipped below the
            maintenance bar. Take it out of{' '}
            <strong>scope-level maintenance</strong> so it gets full
            practice time again?
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() =>
            entering
              ? confirmScopeMaintenance(view.scopeKey)
              : releaseScopeMaintenance(view.scopeKey),
          )}
          className="rounded-full border border-fluent px-2 py-0.5 text-fluent hover:bg-fluent/10 disabled:opacity-50"
        >
          {entering ? 'Move to maintenance' : 'Resume full practice'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() =>
            entering
              ? dismissScopeMaintenanceSuggestion(view.scopeKey)
              : dismissScopeMaintenanceReleaseSuggestion(view.scopeKey),
          )}
          className="text-neutral-500 hover:text-fluent disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

/** Render whichever scopes currently have something to say. Surfaces
 *  that show several scopes at once (the weekly plan) use this;
 *  per-scope surfaces pick their own view. */
export function ScopeMaintenanceNotices({
  views,
  onChanged,
  filterScopeKeys,
}: {
  views: ReadonlyArray<ScopeMaintenanceView>;
  onChanged?: () => void;
  /** Restrict to these scopes — the post-session surface passes the
   *  scopes the session actually touched, so the notice appears where
   *  the practice just happened rather than for everything at once. */
  filterScopeKeys?: ReadonlySet<string>;
}) {
  const shown = views.filter(v =>
    (v.suggestEnter || v.suggestRelease)
    && (!filterScopeKeys || filterScopeKeys.has(v.scopeKey)),
  );
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {shown.map(v => (
        <ScopeMaintenanceNotice key={v.scopeKey} view={v} onChanged={onChanged} />
      ))}
    </div>
  );
}

/**
 * Per-goal mount for the goal flow. Self-contained — it loads its own
 * views rather than taking them as a prop, because `GoalRow` has five
 * call sites in three trees and threading state through all of them
 * to serve one notice would cost more than the read. Mounted only
 * inside the EXPANDED panel, so the read happens when a goal is
 * actually being reviewed rather than on every row of every list.
 */
export function ScopeMaintenanceNoticeForGoal({ goalId }: { goalId: string }) {
  const { views, refresh } = useScopeMaintenanceViews();
  const view = views.find(v => v.goalId === goalId);
  if (!view) return null;
  return <ScopeMaintenanceNotice view={view} onChanged={refresh} />;
}
