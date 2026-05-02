import { db, type SpacingState, type AcquisitionStage, type MemoryType } from './db';
import { getMemoryType } from './memoryType';

/**
 * Phase 2 substep 1a — foundational helpers for the unified spacing-state
 * layer the Practice Sessions algorithm reads in Phase 3.
 *
 * Scope of this module:
 *   - Idempotent upsert of a spacingState row on engagement.
 *   - Stage-transition logic for `(no row) → acquiring → acquired`.
 *   - Pure helpers exported for unit testing.
 *
 * Out of scope (deferred):
 *   - Module wiring (substeps 1b–1g call `recordEngagement` from each surface).
 *   - Backfill from existing history (substep 1h, gated by a one-time pref).
 *   - `acquired → consolidated` transition — depends on Phase 3 spacing-curve
 *     interval logic. Currently a no-op.
 *   - `consolidated → mastered` transition — depends on user-declared mastery
 *     thresholds (Phase 5+). Currently a no-op.
 *   - Demotion (e.g., `acquired → acquiring` on poor recent performance).
 *     Decay belongs to the spacing curve, not stage transitions; once
 *     advanced, items only advance further.
 *
 * Signal model: `performanceHistory` (the SpacingState JSONB column) is the
 * single source of truth for stage transitions. We do not query the wider
 * `attempts` table from here — callers continue writing their own attempts
 * rows for analytics / daily summaries / fluency, and additionally call
 * `recordEngagement` to update the spacing layer. Tiny duplication, big
 * decoupling win.
 */

/** Cap on entries kept in `performanceHistory`. Keeps the JSONB bounded; the
 *  declarative window only ever needs the last 10, rating-based the last 3. */
export const PERFORMANCE_HISTORY_MAX = 20;

/** Declarative `acquiring → acquired` rule: at least this many recent
 *  attempts are required before the threshold check fires. Avoids "got 1
 *  right, now acquired" false promotions. */
export const DECLARATIVE_ACQUIRED_MIN_ATTEMPTS = 5;

/** Declarative window — only the last N attempts on this item count. */
export const DECLARATIVE_ACQUIRED_WINDOW = 10;

/** Declarative threshold — fraction correct in the window required to
 *  promote `acquiring → acquired`. Per design doc §"Acquisition stage
 *  detection". */
export const DECLARATIVE_ACQUIRED_THRESHOLD = 0.8;

/** Rating-based (procedural / integration) `acquiring → acquired` rule:
 *  the last N ratings must all be in {flying, cruising}. */
export const RATING_ACQUIRED_MIN_RATINGS = 3;

/** A single entry in `performanceHistory`. Discriminated by `kind` so the
 *  same column can carry signals across all four memory types. */
export type PerformanceEntry =
  | { t: number; kind: 'attempt'; correct: boolean }
  | { t: number; kind: 'rating'; rating: 'flying' | 'cruising' | 'crawling' }
  | { t: number; kind: 'recency' };

/** Public input shape for `recordEngagement`. The `kind` must match the
 *  module's memory type (validated at runtime). */
export type EngagementSignal =
  | { kind: 'attempt'; correct: boolean }
  | { kind: 'rating'; rating: 'flying' | 'cruising' | 'crawling' }
  | { kind: 'recency' };

export interface RecordEngagementInput {
  itemRef: string;
  moduleRef: string;
  signal: EngagementSignal;
  /** Defaults to `Date.now()`. Exposed for deterministic tests and for
   *  the Phase 1h backfill pass which replays historical timestamps. */
  timestamp?: number;
}

// ===================================================================
// Pure stage-transition helpers (testable without Dexie)
// ===================================================================

/**
 * Declarative items advance `acquiring → acquired` when the user's rolling
 * accuracy clears the threshold. Items at any other stage are returned
 * unchanged — promotion past `acquired` is Phase 3+; demotion is never
 * (decay belongs to the spacing curve).
 */
export function nextStageDeclarative(
  current: AcquisitionStage,
  history: ReadonlyArray<PerformanceEntry>,
): AcquisitionStage {
  if (current !== 'acquiring') return current;
  const attempts = history
    .filter((e): e is Extract<PerformanceEntry, { kind: 'attempt' }> => e.kind === 'attempt')
    .slice(-DECLARATIVE_ACQUIRED_WINDOW);
  if (attempts.length < DECLARATIVE_ACQUIRED_MIN_ATTEMPTS) return current;
  const correct = attempts.filter(a => a.correct).length;
  const accuracy = correct / attempts.length;
  return accuracy >= DECLARATIVE_ACQUIRED_THRESHOLD ? 'acquired' : current;
}

/**
 * Procedural and integration items advance `acquiring → acquired` when the
 * last N subjective ratings are all in {flying, cruising}. A single
 * "crawling" in the window blocks promotion.
 */
export function nextStageRatingBased(
  current: AcquisitionStage,
  history: ReadonlyArray<PerformanceEntry>,
): AcquisitionStage {
  if (current !== 'acquiring') return current;
  const ratings = history
    .filter((e): e is Extract<PerformanceEntry, { kind: 'rating' }> => e.kind === 'rating')
    .slice(-RATING_ACQUIRED_MIN_RATINGS);
  if (ratings.length < RATING_ACQUIRED_MIN_RATINGS) return current;
  return ratings.every(r => r.rating === 'flying' || r.rating === 'cruising')
    ? 'acquired'
    : current;
}

/**
 * Expression items don't have a competency arc — Just Play / Diary /
 * Just Produce are recency-driven by design. The row exists so the
 * algorithm can surface stale items, but stage never advances past
 * `acquiring`.
 */
export function nextStageExpression(current: AcquisitionStage): AcquisitionStage {
  return current;
}

/**
 * Dispatch the next-stage computation by memory type. Exported because
 * tests cover the pure dispatch path and substep 1h (backfill) will
 * reuse it to derive starting stages from replayed history.
 */
export function computeNextStage(
  memoryType: MemoryType,
  current: AcquisitionStage,
  history: ReadonlyArray<PerformanceEntry>,
): AcquisitionStage {
  switch (memoryType) {
    case 'declarative': return nextStageDeclarative(current, history);
    case 'procedural':  return nextStageRatingBased(current, history);
    case 'integration': return nextStageRatingBased(current, history);
    case 'expression':  return nextStageExpression(current);
  }
}

// ===================================================================
// Phase 3 Step 6g — spacing curve (next_due_at recalculation)
// ===================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** First-engagement interval. Subsequent intervals scale from here. */
export const INITIAL_INTERVAL_DAYS = 1;
/** Multiplier applied on a positive signal (correct attempt; flying
 *  / cruising rating). Doubling-style SRS. */
export const INTERVAL_GROWTH_FACTOR = 2;
/** Multiplier applied on a negative signal (incorrect attempt;
 *  crawling rating). */
export const INTERVAL_REGRESSION_FACTOR = 0.5;
/** Floor — never schedule less than this far out. */
export const MIN_INTERVAL_DAYS = 1;

/** Per-memory-type ceilings. Declarative items can sit longer
 *  between reviews than expression items (which are recency-driven
 *  and surface stale within a short window). Calibrated from
 *  intuition; revisit from real use. */
export const MAX_INTERVAL_BY_MEMORY_TYPE: Record<MemoryType, number> = {
  declarative: 60,
  procedural: 30,
  integration: 30,
  expression: 14,
};

/**
 * Compute the new currentIntervalDays after this engagement. Pure;
 * tests pass the prior interval + signal directly. Behavior:
 *
 *   attempt(correct=true) | rating in {flying, cruising}
 *     → priorInterval × INTERVAL_GROWTH_FACTOR (capped)
 *
 *   attempt(correct=false) | rating='crawling'
 *     → priorInterval × INTERVAL_REGRESSION_FACTOR (floored)
 *
 *   recency
 *     → priorInterval unchanged (floored to INITIAL on first engagement)
 *
 * priorInterval = 0 (never engaged) starts at INITIAL_INTERVAL_DAYS
 * before scaling.
 */
export function computeIntervalDays(input: {
  memoryType: MemoryType;
  priorInterval: number;
  signal: EngagementSignal;
}): number {
  const { memoryType, priorInterval, signal } = input;
  const max = MAX_INTERVAL_BY_MEMORY_TYPE[memoryType];
  const base = priorInterval > 0 ? priorInterval : INITIAL_INTERVAL_DAYS;

  let next: number;
  if (signal.kind === 'attempt') {
    next = signal.correct
      ? base * INTERVAL_GROWTH_FACTOR
      : base * INTERVAL_REGRESSION_FACTOR;
  } else if (signal.kind === 'rating') {
    next =
      signal.rating === 'flying' || signal.rating === 'cruising'
        ? base * INTERVAL_GROWTH_FACTOR
        : base * INTERVAL_REGRESSION_FACTOR;
  } else {
    // recency: don't grow or shrink — expression items are recency-
    // driven; the algorithm decides surfacing from lastEngagedAt
    // rather than a stored due date. We still set a reasonable
    // nextDueAt so the field is consistent.
    next = base;
  }

  return Math.min(max, Math.max(MIN_INTERVAL_DAYS, Math.round(next)));
}

/** Convert days from `now` into a wall-clock timestamp. Pure. */
export function computeNextDueAt(now: number, intervalDays: number): number {
  return now + intervalDays * MS_PER_DAY;
}

// ===================================================================
// Internal helpers
// ===================================================================

function assertSignalMatchesMemoryType(
  signal: EngagementSignal,
  memoryType: MemoryType,
  moduleRef: string,
): void {
  const ok =
    (memoryType === 'declarative' && signal.kind === 'attempt') ||
    ((memoryType === 'procedural' || memoryType === 'integration') && signal.kind === 'rating') ||
    (memoryType === 'expression' && signal.kind === 'recency');
  if (!ok) {
    throw new Error(
      `[spacingState] signal kind "${signal.kind}" doesn't match memory type ` +
      `"${memoryType}" for module "${moduleRef}". Expected: ` +
      `declarative→attempt, procedural/integration→rating, expression→recency.`,
    );
  }
}

function entryFromSignal(signal: EngagementSignal, t: number): PerformanceEntry {
  switch (signal.kind) {
    case 'attempt': return { t, kind: 'attempt', correct: signal.correct };
    case 'rating':  return { t, kind: 'rating', rating: signal.rating };
    case 'recency': return { t, kind: 'recency' };
  }
}

// ===================================================================
// Public API
// ===================================================================

/**
 * Read the spacingState row for a given (moduleRef, itemRef). Returns
 * `undefined` when the user has not engaged with the item yet — absence
 * of a row is the canonical representation of the `new` stage.
 */
export async function getSpacingState(
  itemRef: string,
  moduleRef: string,
): Promise<SpacingState | undefined> {
  return db.spacingState
    .where('[moduleRef+itemRef]')
    .equals([moduleRef, itemRef])
    .first();
}

/**
 * Record an engagement against a spacing-state item. Idempotent in the
 * sense that calling with the same input twice produces a deterministic
 * follow-up state (a second history entry, possibly a stage advance).
 *
 * On first call for an unseen item, creates the row at stage `acquiring`
 * (the design doc's `new → acquiring` transition: "first meaningful
 * engagement").
 *
 * Throws when `signal.kind` doesn't match the module's memory type, or
 * when `moduleRef` isn't registered in `MODULE_MEMORY_TYPES`.
 */
export async function recordEngagement(
  input: RecordEngagementInput,
): Promise<SpacingState> {
  const { itemRef, moduleRef, signal } = input;
  const t = input.timestamp ?? Date.now();
  const memoryType = getMemoryType(moduleRef);
  assertSignalMatchesMemoryType(signal, memoryType, moduleRef);

  const entry = entryFromSignal(signal, t);
  const existing = await getSpacingState(itemRef, moduleRef);

  if (!existing) {
    const initialHistory: PerformanceEntry[] = [entry];
    const intervalDays = computeIntervalDays({
      memoryType,
      priorInterval: 0,
      signal,
    });
    const row: SpacingState = {
      id: crypto.randomUUID(),
      itemRef,
      moduleRef,
      memoryType,
      // First engagement: new → acquiring. A single signal can never
      // also clear the acquired threshold (min 5 attempts / min 3
      // ratings), but we run computeNextStage for uniformity in case
      // future thresholds drop to 1.
      acquisitionStage: computeNextStage(memoryType, 'acquiring', initialHistory),
      currentIntervalDays: intervalDays,
      lastEngagedAt: t,
      nextDueAt: computeNextDueAt(t, intervalDays),
      performanceHistory: initialHistory as Array<Record<string, unknown>>,
    };
    await db.spacingState.add(row);
    return row;
  }

  const history = [
    ...(existing.performanceHistory as PerformanceEntry[]),
    entry,
  ].slice(-PERFORMANCE_HISTORY_MAX);
  const intervalDays = computeIntervalDays({
    memoryType,
    priorInterval: existing.currentIntervalDays,
    signal,
  });
  const updated: SpacingState = {
    ...existing,
    acquisitionStage: computeNextStage(memoryType, existing.acquisitionStage, history),
    currentIntervalDays: intervalDays,
    lastEngagedAt: t,
    nextDueAt: computeNextDueAt(t, intervalDays),
    performanceHistory: history as Array<Record<string, unknown>>,
  };
  await db.spacingState.put(updated);
  return updated;
}

/**
 * Direct stage assertion — bypasses the signal/transition system used
 * by `recordEngagement`. Exists because some modules (notably
 * Production) express the user's progress as discrete state
 * declarations (e.g. a mastery enum) rather than per-rep signals; the
 * honest mirror is to write the corresponding acquisitionStage
 * directly. Glossary "got it" buttons would use the same path if
 * they ever ride to spacingState.
 *
 * Semantics:
 *   stage = null      → delete the row if it exists; no-op if not.
 *                       Matches the canonical "absence = new" rule.
 *   stage = non-null  → upsert the row at the given stage. Bumps
 *                       lastEngagedAt. Does NOT append to
 *                       performanceHistory — this is a deliberate
 *                       assertion, not a per-rep signal event.
 *
 * Can promote AND demote. The signal-driven `recordEngagement` only
 * advances upward by design (decay belongs to the spacing curve);
 * `assertSpacingStage` honors deliberate downward transitions because
 * the user is the source of truth for explicit state declarations
 * (e.g. resetting a lesson back to "not started").
 *
 * Throws when `moduleRef` is not in `MODULE_MEMORY_TYPES`. Same
 * fail-fast contract as `recordEngagement` — an unknown ref is a
 * programming error.
 */
export async function assertSpacingStage(
  itemRef: string,
  moduleRef: string,
  stage: AcquisitionStage | null,
): Promise<void> {
  const memoryType = getMemoryType(moduleRef);
  const existing = await getSpacingState(itemRef, moduleRef);

  if (stage === null) {
    if (existing) await db.spacingState.delete(existing.id);
    return;
  }

  const t = Date.now();
  if (!existing) {
    const row: SpacingState = {
      id: crypto.randomUUID(),
      itemRef,
      moduleRef,
      memoryType,
      acquisitionStage: stage,
      currentIntervalDays: 0,
      lastEngagedAt: t,
      nextDueAt: null,
      performanceHistory: [],
    };
    await db.spacingState.add(row);
    return;
  }

  await db.spacingState.put({
    ...existing,
    acquisitionStage: stage,
    lastEngagedAt: t,
  });
}
