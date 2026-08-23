import { useCallback, useEffect, useState } from 'react';
import {
  clearSeededKeyRow,
  countBySong,
  findSeededKeyRows,
  type SeededRowFinding,
} from './seededKeyRows';

/**
 * What the old migration invented, reported before anything is
 * cleared.
 *
 * ---------------------------------------------------------------
 * REPORT FIRST, CLEAR SECOND, AND NEVER IN ONE TAP.
 *
 * This deletes stored state, and the state it deletes looks exactly
 * like practice history from the outside — a key with a level and a
 * date on it. The detection is careful (it requires no evidence of
 * practice ANYWHERE plus the migration's own timestamp fingerprint),
 * but "careful" is not something the user can verify from a button.
 * A per-song count they can check against what they remember is.
 * ---------------------------------------------------------------
 *
 * Same split as the key diagnostics beside it: scanning is read-only
 * and says nothing about what to do, and clearing is a separate
 * decision made after reading.
 */
export default function SeededKeyRowsPanel() {
  const [findings, setFindings] = useState<SeededRowFinding[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(0);

  const scan = useCallback(async () => {
    setBusy(true);
    try {
      setFindings(await findSeededKeyRows());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void scan(); }, [scan]);

  const clearAll = async () => {
    if (findings === null || findings.length === 0) return;
    setBusy(true);
    try {
      for (const f of findings) await clearSeededKeyRow(f.keyRowId);
      setCleared(findings.length);
      await scan();
    } finally {
      setBusy(false);
    }
  };

  if (findings === null) return null;

  const report = countBySong(findings);

  return (
    <section>
      <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
        phantom key rows
      </h4>

      {findings.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {cleared > 0
            ? `cleared ${cleared} row${cleared === 1 ? '' : 's'}. nothing else to clean.`
            : 'none found. no key row is claiming progress it has no evidence for.'}
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-2">
            these key rows claim a level, carry the song’s added date as their
            practice date, and have no run-throughs, no comfortable cells and no
            passed test behind them. the old matrix migration invented them;
            nothing you did produced one.
          </p>
          <ul className="space-y-1 mb-3">
            {report.map(r => (
              <li key={r.songId} className="text-sm flex items-baseline gap-2">
                <span className="font-medium tabular-nums shrink-0">{r.count}</span>
                <span className="text-neutral-700 dark:text-neutral-200">{r.songTitle}</span>
                <span className="text-neutral-500 font-mono text-xs">
                  {r.keyNames.join(' · ')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-neutral-500 mb-2">
            clearing resets them to “not started”. the rows stay — all twelve keys
            are always present — and the song’s original key is not moved.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void clearAll()}
            className="px-3 py-1.5 rounded-md border border-needswork text-needswork text-xs font-medium hover:bg-needswork/10 disabled:opacity-40"
          >
            clear {findings.length} row{findings.length === 1 ? '' : 's'}
          </button>
        </>
      )}
    </section>
  );
}
