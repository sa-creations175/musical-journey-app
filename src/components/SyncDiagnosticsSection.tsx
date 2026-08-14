/**
 * Sync diagnostics + repair, as UI rather than console helpers.
 *
 * The console handles these wrap are unreachable inside the installed
 * PWA on iOS — the device whose sync state is hardest to reason about
 * is the one with no way to inspect it. `db` deliberately stays off
 * `window` in production (it would hand out unguarded deletes), so the
 * answer is a fixed, read-only surface instead of a general one.
 *
 * NOTHING IN HERE IS DESTRUCTIVE. Push, read, rebuild — no wipe, no
 * delete, no reset. Every action is safe to run twice.
 *
 * Results persist in component state until the same action is re-run,
 * so two devices' numbers can be compared side by side rather than
 * read off a toast that has already gone.
 */
import { useState } from 'react';
import { backfillUnsyncedRows } from '../lib/sync/backfill';
import { collectSyncStatus, type SyncStatusReport } from '../lib/sync/status';
import { backfillDailySummaries, type DailySummaryBackfillResult } from '../lib/dailySummariesBackfill';

type PushRow = Awaited<ReturnType<typeof backfillUnsyncedRows>>[number];

/** Push results, most interesting first: attempts, then anything that
 *  actually pushed or errored, then the rest. Mirrors orderStatusRows. */
function orderPushRows(rows: ReadonlyArray<PushRow>): PushRow[] {
  const rank = (r: PushRow) => {
    if (r.table === 'attempts') return 0;
    if (r.error) return 1;
    if (r.pushed > 0) return 2;
    return 3;
  };
  return [...rows].sort((a, b) => {
    const d = rank(a) - rank(b);
    return d !== 0 ? d : a.table.localeCompare(b.table);
  });
}

const CELL = 'px-2 py-1 font-mono tabular-nums text-right';
const HEAD = 'px-2 py-1 text-left text-[10px] uppercase tracking-wide text-neutral-500';

export default function SyncDiagnosticsSection() {
  const [busy, setBusy] = useState<null | 'push' | 'status' | 'rebuild'>(null);
  const [pushResult, setPushResult] = useState<PushRow[] | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatusReport | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [rebuild, setRebuild] = useState<DailySummaryBackfillResult | null>(null);
  const [rebuildError, setRebuildError] = useState<string | null>(null);

  const run = async (
    kind: 'push' | 'status' | 'rebuild',
    action: () => Promise<void>,
  ) => {
    if (busy) return;
    setBusy(kind);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  const onPush = () => run('push', async () => {
    setPushError(null);
    setPushResult(null);
    try {
      setPushResult(orderPushRows(await backfillUnsyncedRows()));
    } catch (err) {
      setPushError(err instanceof Error ? err.message : String(err));
    }
  });

  const onStatus = () => run('status', async () => {
    setStatusError(null);
    setStatus(null);
    try {
      setStatus(await collectSyncStatus());
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    }
  });

  const onRebuild = () => run('rebuild', async () => {
    setRebuildError(null);
    setRebuild(null);
    try {
      setRebuild(await backfillDailySummaries());
    } catch (err) {
      setRebuildError(err instanceof Error ? err.message : String(err));
    }
  });

  const attemptsPush = pushResult?.find(r => r.table === 'attempts');
  const attemptsStatus = status?.tables.find(t => t.table === 'attempts');

  return (
    <section>
      <h4 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
        sync diagnostics
      </h4>
      <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
        push anything this device hasn&rsquo;t uploaded, check what&rsquo;s here
        against what&rsquo;s in the cloud, and rebuild the practice calendar.
        nothing here deletes anything.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          onClick={onPush}
          disabled={busy !== null}
          className="px-4 min-h-[40px] rounded-lg bg-fluent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy === 'push' ? 'pushing…' : 'push unsynced data'}
        </button>
        <button
          type="button"
          onClick={onStatus}
          disabled={busy !== null}
          className="px-4 min-h-[40px] rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm hover:border-fluent hover:text-fluent disabled:opacity-50"
        >
          {busy === 'status' ? 'checking…' : 'check sync status'}
        </button>
        <button
          type="button"
          onClick={onRebuild}
          disabled={busy !== null}
          className="px-4 min-h-[40px] rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm hover:border-fluent hover:text-fluent disabled:opacity-50"
        >
          {busy === 'rebuild' ? 'rebuilding…' : 'rebuild calendar'}
        </button>
      </div>

      {/* ---------------- push result ---------------- */}
      {pushError && (
        <p className="text-sm text-needswork mb-3">push failed: {pushError}</p>
      )}
      {pushResult && (
        <div className="mb-4">
          {attemptsPush && (
            <p className="text-sm mb-2">
              <span className="font-medium">attempts</span>{' '}
              — <span className="font-mono tabular-nums">{attemptsPush.localCount}</span> here,{' '}
              <span className="font-mono tabular-nums">{attemptsPush.cloudCount}</span> in cloud,{' '}
              <span className="font-mono tabular-nums">{attemptsPush.pushed}</span> pushed
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-700">
                  <th className={HEAD}>table</th>
                  <th className={`${HEAD} text-right`}>here</th>
                  <th className={`${HEAD} text-right`}>cloud</th>
                  <th className={`${HEAD} text-right`}>pushed</th>
                </tr>
              </thead>
              <tbody>
                {pushResult.map(r => (
                  <tr
                    key={r.table}
                    className={r.table === 'attempts' ? 'bg-fluent/10 font-medium' : undefined}
                  >
                    <td className="px-2 py-1 truncate">{r.table}</td>
                    <td className={CELL}>{r.localCount}</td>
                    <td className={CELL}>{r.cloudCount}</td>
                    <td className={CELL}>{r.error ? '—' : r.pushed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-neutral-500 mt-1.5">
            re-run until <span className="font-mono">pushed</span> is 0 everywhere.
            safe to run as many times as you like.
          </p>
        </div>
      )}

      {/* ---------------- status readout ---------------- */}
      {statusError && (
        <p className="text-sm text-needswork mb-3">status check failed: {statusError}</p>
      )}
      {status && (
        <div className="mb-4">
          <div className="text-xs text-neutral-600 dark:text-neutral-300 mb-2 space-y-0.5">
            <p>
              queue depth <span className="font-mono tabular-nums">{status.queueDepth}</span>
              {status.queueDepth === 0 ? ' — everything uploaded' : ' — waiting to upload'}
              {status.maxAttempts > 0 && (
                <> · <span className="font-mono tabular-nums">{status.maxAttempts}</span> retries</>
              )}
            </p>
            {!status.signedIn && <p className="text-needswork">not signed in — cloud counts unavailable</p>}
            {status.offline && <p className="text-needswork">offline — cloud counts unavailable</p>}
            {status.lastError && (
              <p className="text-needswork break-words">
                last error ({status.lastErrorTable}): {status.lastError}
              </p>
            )}
            {attemptsStatus && (
              <p>
                <span className="font-medium">attempts</span>{' '}
                — <span className="font-mono tabular-nums">{attemptsStatus.local}</span> here,{' '}
                <span className="font-mono tabular-nums">
                  {attemptsStatus.cloud ?? '?'}
                </span>{' '}
                in cloud
              </p>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-700">
                  <th className={HEAD}>table</th>
                  <th className={`${HEAD} text-right`}>here</th>
                  <th className={`${HEAD} text-right`}>cloud</th>
                </tr>
              </thead>
              <tbody>
                {status.tables.map(t => {
                  const mismatch = t.cloud !== null && t.cloud !== t.local;
                  return (
                    <tr
                      key={t.table}
                      className={
                        t.table === 'attempts'
                          ? 'bg-fluent/10 font-medium'
                          : mismatch || t.cloud === null
                            ? 'text-needswork'
                            : undefined
                      }
                    >
                      <td className="px-2 py-1 truncate">{t.table}</td>
                      <td className={CELL}>{t.local}</td>
                      <td className={CELL}>{t.cloud ?? '?'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-neutral-500 mt-1.5">
            rows where the two numbers disagree are listed first. after a
            merge they should match on both devices.
          </p>
        </div>
      )}

      {/* ---------------- calendar rebuild ---------------- */}
      {rebuildError && (
        <p className="text-sm text-needswork mb-2">rebuild failed: {rebuildError}</p>
      )}
      {rebuild && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          calendar rebuilt from{' '}
          <span className="font-mono tabular-nums">{rebuild.attemptsScanned}</span> attempts —{' '}
          <span className="font-mono tabular-nums">{rebuild.created}</span> days added,{' '}
          <span className="font-mono tabular-nums">{rebuild.updated}</span> corrected,{' '}
          <span className="font-mono tabular-nums">{rebuild.unchanged}</span> already right.
        </p>
      )}
    </section>
  );
}
