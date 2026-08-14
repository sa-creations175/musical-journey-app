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
import { isCanonicalSongKey } from '../modules/repertoire/matrix/keys';
import {
  canApplyWithoutConfirm,
  deleteJunkKeyRow,
  normaliseSongKey,
  recomputeKeyStateFromCells,
  recomputeSafety,
  resolveKeyMismatch,
} from '../modules/repertoire/keyRepairs';
import {
  PROBLEM_LABEL,
  ROW_FLAG_LABEL,
  collectSongKeyDiagnostics,
  type SongKeyDiagnostic,
  type SongKeyRowInfo,
} from '../modules/repertoire/keyDiagnostics';

const BTN = 'px-2 py-0.5 rounded border text-[10px] font-medium';
const BTN_ACTION = `${BTN} border-fluent text-fluent hover:bg-fluent/10`;
const BTN_DANGER = `${BTN} border-needswork text-needswork hover:bg-needswork/10`;

/** The canonical key sharing a pitch class with a non-canonical one.
 *  Only the enharmonic spellings the app has actually produced. */
const ENHARMONIC: Record<string, string> = {
  Gb: 'F#', 'C#': 'Db', 'D#': 'Eb', 'G#': 'Ab', 'A#': 'Bb',
};

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
  /** Last repair outcome, shown inline so a press is never silent. */
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  /**
   * Row ids awaiting an explicit override confirmation.
   *
   * A SET, not a single slot. With one slot, opening a confirm on a
   * second protected row silently closed the first — so on a report
   * with several of them the user could never see more than one, and a
   * press appeared to do nothing. Each row's confirm is its own state.
   */
  const [confirming, setConfirming] = useState<ReadonlySet<string>>(new Set());

  const setRowConfirming = (rowId: string, on: boolean) => {
    setConfirming(prev => {
      const next = new Set(prev);
      if (on) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  };

  /**
   * Run one repair, then re-read. Refusals from the repair layer are
   * shown verbatim — they explain what would have been destroyed, and
   * paraphrasing them here would put a second, driftable copy of the
   * reasoning in the UI.
   */
  const repair = async (rowId: string | null, label: string, fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await fn();
      setNote({ ok: true, text: `${label} — done` });
      setRows(await collectSongKeyDiagnostics());
      setCheckedAt(Date.now());
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
      // Close only the confirm that was acted on. Leaving the others
      // open is the point — they are independent decisions.
      if (rowId) setRowConfirming(rowId, false);
    }
  };

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
      {note && (
        <p className={`text-xs mb-3 ${note.ok ? 'text-fluent' : 'text-needswork'}`}>
          {note.text}
        </p>
      )}

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
                      <SongActions
                        entry={r}
                        busy={busy}
                        repair={repair}
                      />
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
                              <RowActions
                                row={k}
                                busy={busy}
                                confirming={confirming}
                                setRowConfirming={setRowConfirming}
                                repair={repair}
                              />
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

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------

type Repair = (rowId: string | null, label: string, fn: () => Promise<unknown>) => Promise<void>;

/**
 * Song-level repairs: the two decisions the data cannot make.
 *
 * The mismatch case offers BOTH directions with no default and no
 * pre-selection. In the live data the matrix was right and the song
 * record was stale, so a UI that nudged toward either would have been
 * wrong half the time.
 */
function SongActions({
  entry, busy, repair,
}: {
  entry: SongKeyDiagnostic;
  busy: boolean;
  repair: Repair;
}) {
  const anchor = entry.rows.find(r => r.isOriginalKey);

  if (entry.problem === 'song-key-non-canonical' && entry.songKey) {
    const target = ENHARMONIC[entry.songKey];
    if (!target || !isCanonicalSongKey(target)) return null;
    return (
      <div className="mt-1">
        <button
          type="button"
          disabled={busy}
          className={BTN_ACTION}
          onClick={() => repair(
            null,
            `${entry.title}: ${entry.songKey} → ${target}`,
            () => normaliseSongKey(entry.songId, target),
          )}
        >
          change to {target}
        </button>
        <div className="text-[10px] opacity-70 mt-0.5">
          same pitch class · temporary until per-song spelling
        </div>
      </div>
    );
  }

  if (entry.problem === 'original-mismatch' && entry.songKey && anchor) {
    return (
      <div className="mt-1 space-y-0.5">
        <div className="text-[10px] opacity-80">which is right?</div>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={busy}
            className={BTN_ACTION}
            onClick={() => repair(
              null,
              `${entry.title}: anchor → ${entry.songKey}`,
              () => resolveKeyMismatch(entry.songId, 'use-song-key'),
            )}
          >
            {entry.songKey}
          </button>
          <button
            type="button"
            disabled={busy}
            className={BTN_ACTION}
            onClick={() => repair(
              null,
              `${entry.title}: song key → ${anchor.keyName}`,
              () => resolveKeyMismatch(entry.songId, 'use-matrix-anchor'),
            )}
          >
            {anchor.keyName} ★
          </button>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Row-level repairs: delete an unrenderable row, or bring a row's
 * stored state in line with its cells.
 *
 * An unevidenced demotion is SHOWN rather than hidden, with the reason
 * and an explicit confirm. Hiding it would conceal a real disagreement;
 * enabling it silently would destroy the only record that a song was
 * ever worked in that key. The app cannot tell those apart — the user
 * can, so the decision is theirs and it costs two presses.
 */
function RowActions({
  row, busy, confirming, setRowConfirming, repair,
}: {
  row: SongKeyRowInfo;
  busy: boolean;
  confirming: ReadonlySet<string>;
  setRowConfirming: (id: string, on: boolean) => void;
  repair: Repair;
}) {
  // The stored id, never a reconstruction from songId + keyName: a row
  // whose keyName changed after creation keeps its original id, and a
  // guess would address a row that does not exist.
  const rowId = row.id;
  const safety = recomputeSafety(row);
  const showRecompute = safety !== 'none';
  const needsConfirm = !canApplyWithoutConfirm(safety);
  const isConfirming = confirming.has(rowId);

  if (!row.deletable && !showRecompute) return null;

  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {row.deletable && (
        <button
          type="button"
          disabled={busy}
          className={BTN_DANGER}
          onClick={() => repair(
            rowId,
            `deleted ${row.keyName}`,
            () => deleteJunkKeyRow(rowId),
          )}
        >
          delete row
        </button>
      )}

      {showRecompute && !needsConfirm && (
        <button
          type="button"
          disabled={busy}
          className={BTN_ACTION}
          onClick={() => repair(
            rowId,
            `${row.keyName}: ${row.keyState} → ${row.derivedState}`,
            () => recomputeKeyStateFromCells(rowId),
          )}
        >
          set to {row.derivedState}
        </button>
      )}

      {showRecompute && needsConfirm && !isConfirming && (
        <button
          type="button"
          disabled={busy}
          className={BTN}
          title="nothing in this row's cells has been played, so they cannot confirm the stored state"
          onClick={() => setRowConfirming(rowId, true)}
        >
          set to {row.derivedState}?
        </button>
      )}

      {showRecompute && needsConfirm && isConfirming && (
        <span className="inline-flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-needswork">
            nothing here has been played — setting {row.keyState} → {row.derivedState}{' '}
            erases the only record you worked this key.
          </span>
          <button
            type="button"
            disabled={busy}
            className={BTN_DANGER}
            onClick={() => repair(
              rowId,
              `${row.keyName}: ${row.keyState} → ${row.derivedState} (overridden)`,
              () => recomputeKeyStateFromCells(rowId, { force: true }),
            )}
          >
            yes, {row.derivedState}
          </button>
          <button
            type="button"
            disabled={busy}
            className={BTN}
            onClick={() => setRowConfirming(rowId, false)}
          >
            keep {row.keyState}
          </button>
        </span>
      )}
    </span>
  );
}
