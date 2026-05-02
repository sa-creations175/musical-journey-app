/**
 * Phase 3 Step 7b — Feasibility banner.
 *
 * Surfaces when any active goal is "behind pace" (status at_risk
 * or critical from getGoalFeasibility). Most-urgent goal leads;
 * the rest collapse under a "N more goals behind pace ↓" toggle.
 *
 * Same component lives on the Practice Sessions home (7a) and on
 * the proposal screen (4j slot). Step 7c wires the [Deep day] tap
 * to pre-select Deep in the input questionnaire; Step 7d hides
 * the banner when nothing's behind pace.
 *
 * Component is dumb — caller supplies the pre-computed banner
 * data via useFeasibilityBannerData() (lib helper). Keeps Dexie
 * reads + sort logic pure-testable, separates them from React.
 *
 * Step 7d's "disappear when nothing's behind pace" behavior is
 * implicit: pickBehindPaceEntries returns [] when no goals
 * qualify; this component returns null on empty entries; the
 * caller renders nothing. No conditional mounting needed by
 * consumers.
 */
import { useState } from 'react';
import { moduleMetaById } from '../../lib/moduleMeta';
import type { FeasibilityBannerEntry } from './feasibilityBannerData';

interface Props {
  /** Pre-sorted, behind-pace goals only. Component bails to null
   *  when empty — Step 7d. */
  entries: ReadonlyArray<FeasibilityBannerEntry>;
  /** Tap-to-Deep-day handler. Fires on banner-body tap (most-
   *  urgent surface) AND on the dedicated [Deep day] button. Step 7c. */
  onTapDeep?: () => void;
}

export default function FeasibilityBanner({ entries, onTapDeep }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  const [primary, ...rest] = entries;
  const restCount = rest.length;

  return (
    <section
      role="region"
      aria-label="goals behind pace"
      className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 space-y-2"
    >
      <PrimaryRow entry={primary} onTapDeep={onTapDeep} />

      {restCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="text-[11px] text-neutral-600 dark:text-neutral-400 hover:text-fluent inline-flex items-center gap-1"
        >
          <span>
            {restCount} more goal{restCount === 1 ? '' : 's'} behind pace
          </span>
          <span aria-hidden>{expanded ? '↑' : '↓'}</span>
        </button>
      )}

      {expanded && restCount > 0 && (
        <ul className="space-y-1 border-t border-amber-500/20 pt-2">
          {rest.map(e => (
            <SecondaryRow key={e.goalId} entry={e} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PrimaryRow({
  entry,
  onTapDeep,
}: {
  entry: FeasibilityBannerEntry;
  onTapDeep?: () => void;
}) {
  const meta = moduleMetaById(entry.moduleRef ?? '');
  const accent = meta?.accentHex ?? '#854F0B';

  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: accent }}
      />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm text-neutral-800 dark:text-neutral-100 leading-snug">
          {entry.message}
        </p>
        {onTapDeep && (
          <button
            type="button"
            onClick={onTapDeep}
            className="text-[11px] inline-flex items-center px-2 py-0.5 rounded-md bg-amber-500 text-white font-medium hover:opacity-90"
          >
            Deep day
          </button>
        )}
      </div>
    </div>
  );
}

function SecondaryRow({ entry }: { entry: FeasibilityBannerEntry }) {
  const meta = moduleMetaById(entry.moduleRef ?? '');
  const accent = meta?.accentHex ?? '#854F0B';
  return (
    <li className="flex items-start gap-2 text-[11px] text-neutral-600 dark:text-neutral-300">
      <span
        aria-hidden
        className="mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: accent }}
      />
      <span className="flex-1 leading-snug">{entry.message}</span>
    </li>
  );
}
