/**
 * Song key vs matrix original key, for every song at once.
 *
 * Exists because the console equivalent (`__inspectSongKeys`) needs a
 * song id, obtaining one needs `db` (dev-gated), and `openSong` never
 * puts the id in the URL — so it only ran where the bug wasn't.
 *
 * Read-only: reports what is stored, repairs nothing. Every song is
 * listed rather than one looked up by title, because ten songs failing
 * identically is a stronger signal than any single row, and ten
 * failing differently rules out a shared cause immediately.
 */
import { useState } from 'react';
import {
  PROBLEM_LABEL,
  ROW_FLAG_LABEL,
  collectSongKeyDiagnostics,
  type SongKeyDiagnostic,
} from '../modules/repertoire/keyDiagnostics';

function ago(ts: number, now: number): string {
  const ms = now - ts;
  if (ms < 0) return 'in the future';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function RepertoireKeyDiagnostics() {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<SongKeyDiagnostic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number>(0);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setRows(null);
    try {
      setRows(await collectSongKeyDiagnostics());
      setCheckedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const problems = rows?.filter(r => r.problem !== null) ?? [];
  const distinctProblems = [...new Set(problems.map(p => p.problem))];

  return (
    <section>
      <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
        song keys
      </h4>
      <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
        compares each song&rsquo;s key against the original-key row its matrix
        is anchored to. read-only — this changes nothing.
      </p>

      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="px-4 min-h-[40px] rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm hover:border-fluent hover:text-fluent disabled:opacity-50 mb-3"
      >
        {busy ? 'checking…' : 'check song keys'}
      </button>

      {error && <p className="text-sm text-needswork mb-3">check failed: {error}</p>}

      {rows && (
        <div className="space-y-3">
          <p className="text-xs text-neutral-600 dark:text-neutral-300">
            <span className="font-mono tabular-nums">{rows.length}</span> song
            {rows.length === 1 ? '' : 's'} ·{' '}
            <span className={problems.length > 0 ? 'text-needswork font-medium' : ''}>
              <span className="font-mono tabular-nums">{problems.length}</span> with a
              mismatch
            </span>
            {distinctProblems.length === 1 && problems.length > 1 && (
              <> — all the same kind, so one cause</>
            )}
            {distinctProblems.length > 1 && (
              <> — <span className="font-mono tabular-nums">{distinctProblems.length}</span> different kinds</>
            )}
          </p>

          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-700">
                  <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wide text-neutral-500">song</th>
                  <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wide text-neutral-500">song.key</th>
                  <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wide text-neutral-500">matrix rows (orig first)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr
                    key={r.songId}
                    className={r.problem ? 'text-needswork align-top' : 'align-top'}
                  >
                    <td className="px-2 py-1.5">
                      <div className="truncate max-w-[10rem]">{r.title}</div>
                      {r.problem && (
                        <div className="text-[10px] opacity-80">{PROBLEM_LABEL[r.problem]}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{r.songKey ?? '—'}</td>
                    <td className="px-2 py-1.5">
                      {r.rows.length === 0 ? (
                        <span className="font-mono">none</span>
                      ) : (
                        <div className="space-y-0.5">
                          {r.rows.map(k => (
                            <div key={k.keyName} className="whitespace-nowrap">
                              <span className="font-mono">
                                {k.isOriginalKey ? '★ ' : '  '}
                                {k.keyName}
                                <span className="opacity-70"> · {k.keyState}</span>
                                {k.derivedState !== null && k.derivedState !== k.keyState && (
                                  <span className="text-needswork"> (cells say {k.derivedState})</span>
                                )}
                                <span className="opacity-70">
                                  {' · '}
                                  {k.cellCount === 0 && k.runThroughCount === 0
                                    ? 'no cells'
                                    : `${k.cellCount} cells, ${k.engagedCellCount} played, ${k.runThroughCount} runs`}
                                </span>
                                <span className="opacity-70"> · {ago(k.updatedAt, checkedAt)}</span>
                              </span>
                              {k.flags.length > 0 && (
                                <span className="ml-1 text-[10px]">
                                  {k.flags.map(f => (
                                    <span
                                      key={f}
                                      className={
                                        f === 'state-from-migration'
                                          ? 'ml-1 opacity-70'
                                          : 'ml-1 text-needswork'
                                      }
                                    >
                                      [{ROW_FLAG_LABEL[f]}]
                                    </span>
                                  ))}
                                  {k.deletable && (
                                    <span className="ml-1 opacity-70">[safe to delete]</span>
                                  )}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-neutral-500">
            &ldquo;state from migration&rdquo; is expected on old rows — their state
            came from the song&rsquo;s legacy stage before cells existed, so it is
            history rather than damage. The other flags are real
            disagreements. ★ marks the row the matrix anchors to. if song.key and the ★ row
            disagree, the key edit reached the song record but not the matrix —
            the timestamps say whether the matrix row was never written or was
            written and then overwritten.
          </p>
        </div>
      )}
    </section>
  );
}
