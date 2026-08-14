/**
 * Per-table incremental-pull watermarks — DEVICE-LOCAL, never synced.
 *
 * ---------------------------------------------------------------
 * WHY NOT userPrefs
 *
 * `userPrefs` is itself a synced table (see SYNC_TABLES in tables.ts).
 * A watermark stored there would replicate: device A pulls up to
 * T, pushes the mark, device B pulls the mark, and then B skips
 * every row written before T — rows B has never seen. The failure is
 * silent and permanent, because a watermark that is too HIGH is never
 * self-correcting.
 *
 * So these live in localStorage, which is per-origin per-device and
 * has no path to the cloud.
 * ---------------------------------------------------------------
 *
 * THE SAFE DIRECTION IS BACKWARDS. A watermark that lags re-pulls rows
 * that are already local — wasted bytes, correct data. A watermark that
 * runs ahead skips rows forever. Every decision in this module resolves
 * toward the lagging side:
 *
 *   · unreadable storage, absent key, or unparseable value → `null`,
 *     which callers must treat as "pull everything"
 *   · reads subtract OVERLAP_MS before returning
 *   · writes only ever advance, and only to an `updated_at` the caller
 *     actually received and wrote to Dexie
 *
 * Keys are scoped by user id so a second account signing in on the
 * same browser cannot inherit the first account's marks. That is
 * belt-and-braces on top of clearing them at sign-out: the scoping
 * makes the bug structurally impossible, the clearing keeps the
 * storage tidy.
 *
 * Values are the raw `updated_at` strings Postgres returned, stored
 * verbatim so they can be handed straight back to `.gt('updated_at', …)`.
 * Comparison parses to epoch ms rather than comparing strings — PG
 * timestamptz renders with microsecond precision and an offset suffix
 * (`2026-08-13T10:23:45.123456+00:00`), which does not order correctly
 * under lexicographic comparison against a JS `toISOString()` value.
 * Sub-millisecond precision is lost in the parse; the overlap window is
 * five orders of magnitude larger, so it cannot matter.
 */

export const WATERMARK_KEY_PREFIX = 'syncWatermark:';

/** Separate prefix for orphan-sweep bookkeeping (see the sweep section
 *  at the foot of this file). Distinct rather than an infix on the
 *  watermark prefix so no user id could ever collide with it. */
export const SWEEP_KEY_PREFIX = 'syncSweep:';

/** Every prefix this module owns, for the sign-out sweep. */
const OWNED_PREFIXES = [WATERMARK_KEY_PREFIX, SWEEP_KEY_PREFIX];

/**
 * How far back a read rewinds the stored mark before handing it to the
 * query.
 *
 * Covers two races that would otherwise drop rows permanently:
 *
 *   1. Rows committed DURING a pull. Postgres stamps `updated_at` at
 *      commit; a row committed after the pull's snapshot but before it
 *      finished carries a timestamp inside the range we just claimed to
 *      have fully read.
 *   2. Clock skew between the Postgres clock (which stamps `updated_at`)
 *      and anything client-side that might later be compared against it.
 *
 * 60s matches PENDING_PUSH_PROTECTION_MS in engine.ts — same class of
 * problem, same order of magnitude, and keeping them equal means one
 * number to reason about rather than two.
 */
export const WATERMARK_OVERLAP_MS = 60_000;

/** Storage key for one (user, table) pair. Exported for tests and for
 *  the sign-out sweep. */
export function watermarkKey(userId: string, pgTable: string): string {
  return `${WATERMARK_KEY_PREFIX}${userId}:${pgTable}`;
}

/**
 * Epoch ms for a Postgres timestamp string, or null when it doesn't
 * parse. Pure — exported so the ordering rules can be tested without
 * touching storage.
 */
export function parseTimestamp(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || value === '') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The later of two Postgres timestamp strings, preferring whichever
 * parses when the other doesn't. Returns null only when neither does.
 *
 * Pure. This is the monotonicity rule: `advanceWatermark` runs every
 * write through it, so a stale or out-of-order candidate can never drag
 * a mark backwards to a point the caller has already read past.
 */
export function laterTimestamp(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  const ma = parseTimestamp(a);
  const mb = parseTimestamp(b);
  if (ma === null) return mb === null ? null : (b as string);
  if (mb === null) return a as string;
  return mb > ma ? (b as string) : (a as string);
}

/**
 * Rewind a timestamp by `overlapMs`, returned as a UTC ISO string that
 * Postgres accepts in a `.gt()` filter. Returns null for input that
 * doesn't parse, which callers read as "no watermark → pull everything".
 *
 * Pure.
 */
export function applyOverlap(
  value: string | null | undefined,
  overlapMs: number = WATERMARK_OVERLAP_MS,
): string | null {
  const ms = parseTimestamp(value);
  if (ms === null) return null;
  return new Date(ms - overlapMs).toISOString();
}

/** The raw stored mark, exactly as Postgres returned it. Null when
 *  absent or when storage is unavailable. */
export function readWatermark(userId: string, pgTable: string): string | null {
  try {
    return localStorage.getItem(watermarkKey(userId, pgTable));
  } catch {
    // Private-browsing / disabled storage. Fall back to a full pull
    // rather than guessing — see the header note on safe direction.
    return null;
  }
}

/**
 * The value to pass to `.gt('updated_at', …)`, or null to pull the
 * whole table. This is the read the pull path should use — never
 * `readWatermark` directly, or the overlap is skipped.
 */
export function pullSince(userId: string, pgTable: string): string | null {
  return applyOverlap(readWatermark(userId, pgTable));
}

/**
 * Advance the mark for a table, if `candidate` is later than what's
 * stored. Call this ONLY after the rows carrying `candidate` have been
 * written to Dexie — advancing on rows that were fetched but not
 * committed is exactly how a watermark runs ahead of the data.
 *
 * Returns the mark now in force (unchanged when the candidate was older
 * or unparseable), so callers can assert on it.
 */
export function advanceWatermark(
  userId: string,
  pgTable: string,
  candidate: string | null | undefined,
): string | null {
  const current = readWatermark(userId, pgTable);
  const next = laterTimestamp(current, candidate);
  if (next === null || next === current) return current;
  try {
    localStorage.setItem(watermarkKey(userId, pgTable), next);
  } catch {
    // Couldn't persist — the next pull re-reads from the older mark
    // (or from scratch) and re-fetches. Wasteful, never lossy.
    return current;
  }
  return next;
}

/**
 * Drop every watermark this module owns, for all users and tables.
 * Wired into sign-out teardown alongside clearLocalCache — a stale mark
 * outliving its local rows would make the next pull skip rows the
 * device no longer has.
 *
 * Enumerates and filters by prefix so it can't touch unrelated keys.
 */
export function clearAllWatermarks(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null) continue;
      if (OWNED_PREFIXES.some(prefix => key.startsWith(prefix))) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

// =====================================================================
// Orphan-sweep bookkeeping
// =====================================================================

/**
 * Deletes made on another device can only be detected by comparing the
 * FULL cloud id set against local — which a watermark-filtered pull
 * cannot supply. So orphan detection keeps its own id-only query, and
 * runs on this slower cadence rather than on every focus.
 *
 * The cost of the gap is bounded and small: a row deleted elsewhere
 * lingers locally for at most this long. The cost of NOT having the
 * gap is re-reading every id of every table on every tab focus, which
 * is most of what incremental pull exists to stop doing.
 */
export const SWEEP_INTERVAL_MS = 10 * 60_000;

/** Storage key for one (user, table) sweep marker. */
export function sweepKey(userId: string, pgTable: string): string {
  return `${SWEEP_KEY_PREFIX}${userId}:${pgTable}`;
}

/**
 * Whether a table is due an orphan sweep.
 *
 * A table that has NEVER swept is always due. That matters for rollout:
 * on the first pull after this ships there is no watermark and no sweep
 * marker, so the pull behaves exactly as it did before — full content,
 * full orphan check — and only subsequent pulls go incremental.
 */
export function isSweepDue(
  userId: string,
  pgTable: string,
  now: number = Date.now(),
): boolean {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(sweepKey(userId, pgTable));
  } catch {
    // Storage unavailable — sweep. Errs toward doing the work.
    return true;
  }
  if (raw === null) return true;
  const last = Number(raw);
  if (!Number.isFinite(last)) return true;
  return now - last >= SWEEP_INTERVAL_MS;
}

/**
 * Mark a table as swept. Call only after the sweep's deletes have
 * actually been applied — recording a sweep that didn't finish would
 * suppress the next one and let a remote delete linger for two full
 * intervals.
 */
export function recordSweepAt(
  userId: string,
  pgTable: string,
  now: number = Date.now(),
): void {
  try {
    localStorage.setItem(sweepKey(userId, pgTable), String(now));
  } catch {
    // Couldn't persist — the next pull sweeps again. Wasteful, correct.
  }
}
