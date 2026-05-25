import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type VacationPeriod } from '../../lib/db';
import { recordVacationReturn } from '../../lib/prompts';

/**
 * Vacation toggle (Q2 resolution): a user can declare a period off,
 * with start/end dates and an optional reason. Phase 1 ships the
 * data side and the active-vacation banner; the rich welcome-back
 * surface that helps a user navigate honest decay state ships in
 * Phase 7.
 *
 * Truth-honoring stance: there is no spacing-pause. Decay continues
 * during vacation. The only thing vacation affects (Phase 7) is
 * goal target dates.
 */

export default function VacationManager() {
  // refreshKey is bumped after every write we make to vacationPeriods
  // (planning a new vacation, ending one early). It's added to the
  // useLiveQuery deps below so each write tears down and re-creates
  // the live subscription, guaranteeing fresh data on the next render.
  //
  // Why this is necessary: useLiveQuery's auto-refresh-on-change works
  // for goals and practiceSessions in this codebase, but for reasons
  // we couldn't isolate from static analysis it doesn't fire reliably
  // for vacationPeriods writes — the row was confirmed persisted but
  // the parent's `periods` array stayed stale, so findActiveVacation
  // returned null even when the active-window math was satisfied.
  // Explicit refresh-on-write is a small, targeted workaround.
  const [refreshKey, setRefreshKey] = useState(0);
  // `now` is captured at mount via the lazy initializer (Date.now()
  // during render isn't pure), then explicitly re-read by
  // bumpRefresh after every write to vacationPeriods. We need fresh
  // `now` after writes because "End vacation today" sets endDate to
  // the current moment — if `now` is still stale from mount,
  // findActiveVacation's `endDate >= now` check passes against the
  // *just-written* endDate and the banner won't disappear.
  const [now, setNow] = useState(() => Date.now());
  const bumpRefresh = () => {
    setRefreshKey(k => k + 1);
    setNow(Date.now());
  };

  const periods = useLiveQuery(() => db.vacationPeriods.toArray(), [refreshKey]);
  const [planning, setPlanning] = useState(false);

  // Log a vacation_return event for any period that has naturally
  // ended (endDate < now) since the user last visited. Idempotent
  // per periodId — recordVacationReturn no-ops on repeats — so it's
  // safe to fire on every render where periods is fresh. Phase 7's
  // welcome-back surface picks these up; Phase 1 just logs them.
  useEffect(() => {
    if (!periods) return;
    const ended = periods.filter(p => p.endDate < now);
    for (const p of ended) {
      void recordVacationReturn(p.id, p.endDate).catch(err => {
        console.warn('[VacationManager] recordVacationReturn failed', err);
      });
    }
  }, [periods, now]);

  if (periods === undefined) return null;

  const active = findActiveVacation(periods, now);

  if (active) {
    return <ActiveVacationCard period={active} now={now} onChange={bumpRefresh} />;
  }

  return planning
    ? <PlanForm
        onCancel={() => setPlanning(false)}
        onSaved={() => { setPlanning(false); bumpRefresh(); }}
      />
    : (
      <button
        type="button"
        onClick={() => setPlanning(true)}
        className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 underline-offset-2 hover:underline"
      >
        + Plan a vacation
      </button>
    );
}

// -------------------------------------------------------------------

function ActiveVacationCard({
  period,
  now,
  onChange,
}: {
  period: VacationPeriod;
  now: number;
  onChange: () => void;
}) {
  const start = formatDate(period.startDate);
  const end = formatDate(period.endDate);
  const daysLeft = Math.max(0, Math.ceil((period.endDate - now) / (24 * 60 * 60 * 1000)));

  const handleEndToday = async () => {
    try {
      // Use .put() with the full record rather than .update():
      // .update() returns 0 silently when its internal lookup-and-
      // merge can't find/apply the change — no throw, no signal —
      // which masked the failure here. .put() is unambiguous upsert
      // by primary key, the same pattern PlanForm and ManualLogForm
      // already use successfully on this codebase's tables.
      const endedAt = Date.now();
      await db.vacationPeriods.put({
        ...period,
        endDate: endedAt,
      });
      // Log the vacation_return event for Phase 7's welcome-back UI
      // to pick up. Idempotent per periodId — safe even if the
      // mount-time effect later observes the same period as ended.
      await recordVacationReturn(period.id, endedAt);
      onChange();
    } catch (err) {
      console.warn('[practice] end vacation failed', err);
    }
  };

  return (
    <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-amber-900 dark:text-amber-100">
          You're on vacation — {start} to {end}
          {daysLeft > 0 && (
            <span className="text-xs text-amber-700 dark:text-amber-300 ml-2">
              ({daysLeft} day{daysLeft === 1 ? '' : 's'} left)
            </span>
          )}
        </div>
        {period.reason && (
          <div className="text-xs text-amber-800 dark:text-amber-200 mt-0.5 italic">
            {period.reason}
          </div>
        )}
        <div className="text-xs text-amber-800 dark:text-amber-200 mt-1">
          Practice still counts when it happens — and items keep their honest
          freshness state. Welcome-back help arrives in a later release.
        </div>
      </div>
      <button
        type="button"
        onClick={() => void handleEndToday()}
        className="shrink-0 px-3 py-1.5 text-xs rounded-md border border-amber-700 dark:border-amber-300 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40"
      >
        End vacation today
      </button>
    </div>
  );
}

// -------------------------------------------------------------------

function PlanForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const today = todayDateInputValue();
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startMs = localStartOfDayMs(start);
  const endMs = localEndOfDayMs(end);
  const validRange = startMs !== null && endMs !== null && endMs >= startMs;
  // Distinct flag for the inline error message — true only when
  // both inputs parse successfully AND end falls before start.
  // Lets the picker constraint (`min={start}`) be the first line of
  // defense and the inline message + disabled Save button the
  // second; covers the case where a user types an invalid date by
  // hand or the browser ignores `min`.
  const endBeforeStart = startMs !== null && endMs !== null && endMs < startMs;

  const handleStartChange = (next: string) => {
    setStart(next);
    // Auto-clamp: if the new start makes the existing end invalid,
    // snap end up to match. Friendlier than leaving the form in an
    // error state the user has to manually fix.
    const nextStartMs = localStartOfDayMs(next);
    const currentEndMs = localEndOfDayMs(end);
    if (nextStartMs !== null && currentEndMs !== null && currentEndMs < nextStartMs) {
      setEnd(next);
    }
  };

  const handleSave = async () => {
    if (busy) return;
    // Explicit narrowing — independent of whatever TS does (or
    // doesn't) infer through the validRange const above. After
    // these checks startMs and endMs are unambiguously `number`
    // both at the type level and at runtime, so a null can never
    // reach the IndexedDB write.
    if (startMs === null || endMs === null || endMs < startMs) return;

    setBusy(true);
    setError(null);
    try {
      await db.vacationPeriods.put({
        id: `vac-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`,
        startDate: startMs,
        endDate: endMs,
        reason: reason.trim() === '' ? null : reason.trim(),
      });
      onSaved();
    } catch (err) {
      console.warn('[practice] vacation save failed', err);
      setError(
        err instanceof Error
          ? `Could not save: ${err.message}`
          : 'Could not save the vacation. Check the browser console for details.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-black/[0.07] px-4 py-3 flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          Plan a vacation
        </h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
          Practice still counts when it happens. Vacation only changes how the
          app helps you re-engage when you're back.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Start" required>
          <input
            type="date"
            value={start}
            onChange={e => handleStartChange(e.target.value)}
            className={inputClass()}
          />
        </Field>
        <Field label="End" required>
          <input
            type="date"
            value={end}
            onChange={e => setEnd(e.target.value)}
            min={start}
            className={inputClass()}
          />
        </Field>
      </div>
      {endBeforeStart && (
        <div
          role="alert"
          className="text-xs text-needswork bg-needswork/10 border border-needswork/30 rounded px-2 py-1.5"
        >
          The end date can't be before the start date.
        </div>
      )}
      <Field label="Reason" optional>
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. wedding in Atlanta, family week"
          className={inputClass()}
        />
      </Field>
      {error && (
        <div
          role="alert"
          className="text-xs text-needswork bg-needswork/10 border border-needswork/30 rounded px-2 py-1.5"
        >
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!validRange || busy}
          className="px-3 py-1.5 text-sm rounded-md bg-fluent text-white hover:bg-fluent/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save vacation
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Shared bits — kept colocated so this component stays self-contained.

function findActiveVacation(periods: VacationPeriod[], now: number): VacationPeriod | null {
  return periods.find(p => p.startDate <= now && p.endDate >= now) ?? null;
}

function todayDateInputValue(): string {
  const d = new Date();
  return [
    d.getFullYear().toString().padStart(4, '0'),
    (d.getMonth() + 1).toString().padStart(2, '0'),
    d.getDate().toString().padStart(2, '0'),
  ].join('-');
}

/**
 * Convert a YYYY-MM-DD calendar date (as emitted by
 * <input type="date">) into the epoch ms for that day's 00:00:00.000
 * **in the user's local timezone**. Uses the local-time Date
 * constructor `new Date(y, m, d, ...)` — the same YYYY-MM-DD input
 * produces a different epoch ms in different timezones, which is
 * the intended behavior: a "vacation starting Apr 26" means Apr 26
 * wherever the user happens to be.
 */
function localStartOfDayMs(value: string): number | null {
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** Same as `localStartOfDayMs` but for 23:59:59.999 local time on
 *  the given calendar date. */
function localEndOfDayMs(value: string): number | null {
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
        {label}
        {required && <span className="text-needswork"> *</span>}
        {optional && <span className="text-neutral-400 font-normal"> (optional)</span>}
      </span>
      {children}
    </label>
  );
}

function inputClass(): string {
  return 'w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-fluent/40';
}
