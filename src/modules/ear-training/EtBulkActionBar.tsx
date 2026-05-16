/**
 * Fixed-bottom action bar for bulk curation operations. Renders
 * when a tracker is in selection mode (useEtSelection().active).
 *
 *   · Flag selected / Unflag — surface flips to "Unflag" when
 *     every selected item is already flagged.
 *   · Hide selected / Unhide — same flip when every selected item
 *     is already hidden.
 *   · Cancel — exits selection mode.
 *
 * All writes go through the shared `etCuration` helpers; the
 * useLiveQuery in useEtCurationsLive picks the changes up and
 * pushes the indicator updates through to every visible tracker.
 *
 * Positioned `fixed bottom` with `z-40` so it sits above page
 * content but below modal portals (z-50). Inner max-width centres
 * the bar on wide layouts.
 */
import { useState } from 'react';
import { useToast } from '../../components/Toaster';
import { setFlag, setHidden } from './etCuration';
import type { EtItemCuration } from '../../lib/db';

interface Props {
  selected: ReadonlySet<string>;
  curations: ReadonlyMap<string, EtItemCuration>;
  onClear: () => void;
  onExit: () => void;
}

export default function EtBulkActionBar({
  selected,
  curations,
  onClear,
  onExit,
}: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const count = selected.size;
  const allFlagged = count > 0 && [...selected].every(id => curations.get(id)?.flagged);
  const allHidden = count > 0 && [...selected].every(id => curations.get(id)?.hidden);

  const runBulk = async (
    op: (id: string) => Promise<void>,
    successMessage: string,
  ) => {
    if (count === 0 || busy) return;
    setBusy(true);
    try {
      // Serial — the helpers read-then-write per row, and there's no
      // benefit to parallelism at this scale (≤ catalog size).
      for (const id of selected) await op(id);
      toast({ message: successMessage, variant: 'success' });
      onClear();
    } finally {
      setBusy(false);
    }
  };

  const handleFlag = () => {
    const next = !allFlagged;
    void runBulk(
      id => setFlag(id, next),
      next ? `Flagged ${count} item${count === 1 ? '' : 's'}.` : `Cleared flag on ${count} item${count === 1 ? '' : 's'}.`,
    );
  };

  const handleHide = () => {
    const next = !allHidden;
    void runBulk(
      id => setHidden(id, next),
      next ? `Hid ${count} item${count === 1 ? '' : 's'}.` : `Restored ${count} item${count === 1 ? '' : 's'}.`,
    );
  };

  return (
    <div
      role="region"
      aria-label="bulk curation actions"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 dark:border-neutral-700 bg-white/95 dark:bg-neutral-900/95 backdrop-blur shadow-lg"
    >
      <div className="mx-auto max-w-5xl px-3 sm:px-5 py-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
          {count} selected
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={handleFlag}
          disabled={busy || count === 0}
          className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
            allFlagged
              ? 'border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10'
              : 'border-amber-500 bg-amber-500 text-white hover:opacity-90'
          } ${busy || count === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {allFlagged ? 'Unflag' : 'Flag'} selected
        </button>
        <button
          type="button"
          onClick={handleHide}
          disabled={busy || count === 0}
          className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
            allHidden
              ? 'border-fluent text-fluent hover:bg-fluent/10'
              : 'border-needswork bg-needswork text-white hover:opacity-90'
          } ${busy || count === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {allHidden ? 'Unhide' : 'Hide'} selected
        </button>
        <button
          type="button"
          onClick={onExit}
          disabled={busy}
          className="px-3 py-1.5 rounded-md text-xs border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
