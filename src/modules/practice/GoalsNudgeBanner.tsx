import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../lib/db';
import { getPref, setPref } from '../../lib/userPrefs';

/**
 * Inline goals nudge for Practice Sessions home (Q7 resolution).
 * Surfaces only when the user has zero active goals AND hasn't
 * dismissed the nudge in the last three days. Non-blocking — the
 * rest of the page (manual logging, vacation toggle) works fine
 * without goals; this is a nudge, not a gate.
 *
 * Phase 1 implements the cadence locally via a userPref. Sub-phase
 * 5 wires this through the centralized prompts table (tier-aware
 * queueing, 3/day cap) — at which point this component becomes a
 * thin renderer over a queued prompt row instead of owning the
 * cadence logic itself.
 */

const PREF_DISMISSED_AT = 'practice.goalsNudgeDismissedAt';
const RE_PROMPT_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export default function GoalsNudgeBanner() {
  const goals = useLiveQuery(
    () => db.goals.where('status').equals('active').toArray(),
    [],
  );
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Mount-time timestamp for the cadence check. Date.now() during
  // render isn't pure; useState's lazy initializer runs once.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    void getPref<number | null>(PREF_DISMISSED_AT, null).then(v => {
      setDismissedAt(typeof v === 'number' ? v : null);
      setHydrated(true);
    });
  }, []);

  const handleDismiss = () => {
    const dismissTs = Date.now();
    setDismissedAt(dismissTs);
    void setPref(PREF_DISMISSED_AT, dismissTs);
  };

  // Wait for both the live query and the pref to land before
  // deciding — prevents a flash of the banner during initial load.
  if (!hydrated) return null;
  if (goals === undefined) return null;
  if (goals.length > 0) return null;

  const recentlyDismissed = dismissedAt !== null && (now - dismissedAt) < RE_PROMPT_AFTER_MS;
  if (recentlyDismissed) return null;

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
          className="px-3 py-1.5 text-sm rounded-md bg-fluent text-white hover:bg-fluent/90"
        >
          Set up goals →
        </Link>
      </div>
    </div>
  );
}

