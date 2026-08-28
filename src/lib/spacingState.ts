import { db, type SpacingState, type AcquisitionStage, type MemoryType, type DrillHand } from './db';
import { putSpacingState } from './practiceWrites';
import { getMemoryType } from './memoryType';
import type { Feel } from './fluencyScale';
import { answer as engineAnswer, newCardState } from './spacing/engine';
import { bandForRow, cardStateFromRow, rowFieldsFromCardState } from './spacing/row';
import { loadSettingsForCard } from './spacing/store';
import type { SpacingSettings } from './spacing/settings';

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
  | {
      t: number;
      kind: 'rating';
      rating: 'flying' | 'cruising' | 'crawling';
      /**
       * The FOUR-level feel behind the three-level rating.
       *
       * `rating` collapses Struggled and Working on it into one value,
       * and "the lowest of the last three rated reps" has to tell them
       * apart. Absent on rows written before this existed; a reader
       * that needs four levels falls back to `feelForRating`.
       */
      feel?: Feel;
      /**
       * False when this engagement happened but must NOT move the
       * rating. Songs: only a test moves the rating, while a logged
       * practice session still counts for coverage and last-touched.
       */
      scores?: boolean;
      /**
       * Which mode produced this rep: a test, or practice.
       *
       * =================================================================
       * ABSENT MEANS LEGACY, AND LEGACY IS NEVER CAPPED.
       *
       * The band rule caps practice-only evidence at Developing. Every
       * rating entry written before this field existed has no value for
       * it, and there is no way to find out which mode produced them —
       * the modes did not exist yet. Reading absent as "practice" would
       * drop every self-rated card in the database from Fluent or
       * Mastered to Developing the moment this shipped, across shapes,
       * mental visualisation, the chord-progression quiz and repertoire,
       * with nothing on screen to explain it.
       *
       * So the rule applies only to entries that carry the flag. Absent
       * participates in the band exactly as it always has and is never
       * capped. See `selfRatedVerdict`, which is where the reading is
       * done rather than guessed at.
       * =================================================================
       */
      fromTest?: boolean;
    }
  | { t: number; kind: 'recency' };

/** Public input shape for `recordEngagement`. The `kind` must match the
 *  module's memory type (validated at runtime). */
export type EngagementSignal =
  | { kind: 'attempt'; correct: boolean }
  | {
      kind: 'rating';
      rating: 'flying' | 'cruising' | 'crawling';
      /** The four-level feel, where the caller has one. */
      feel?: Feel;
      /** False for an engagement that must not move the rating. */
      scores?: boolean;
      /** True for a rep given inside a test, false for one given in
       *  practice. Omitted by callers that have no such distinction —
       *  omitted reads as legacy and is never capped. */
      fromTest?: boolean;
    }
  | { kind: 'recency' };

export interface RecordEngagementInput {
  /**
   * Pre-resolved settings, for callers that already have them and for
   * tests that need a deterministic schedule. Omitted by every drill:
   * the point of resolving per answer is that nobody has to remember to.
   */
  settings?: SpacingSettings;
  itemRef: string;
  moduleRef: string;
  signal: EngagementSignal;
  /** Which hand this engagement belongs to. Only scales & chord shapes
   *  vary it (left / right / both as separate skills); every other
   *  module omits it and rides the 'both' default. */
  hand?: DrillHand;
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
export interface IntervalBounds {
  /** Interval to grow from on a first engagement, in days. */
  initialDays: number;
  /** Ceiling, in days. */
  maxDays: number;
}

export function computeIntervalDays(input: {
  memoryType: MemoryType;
  priorInterval: number;
  signal: EngagementSignal;
  /**
   * Per-caller override for the two ends of the sequence.
   *
   * OPTIONAL, so every existing caller keeps the memory-type defaults
   * and nothing changes for them. Added for repertoire, where the
   * floor and the ceiling became user settings — a cap that decides
   * how often every key comes back, and that nobody has ever seen, is
   * exactly the class of hidden rule RULE_LEGIBILITY tracks.
   *
   * The GROWTH RULE is not overridable, only its ends: doubling on a
   * good signal and halving on a bad one is the algorithm, and a
   * caller that could change it would not be using the same engine as
   * everything else. Build-queue item 11 generalises the bounds to
   * every module; until then repertoire is the one caller that passes
   * them.
   */
  bounds?: IntervalBounds;
}): number {
  const { memoryType, priorInterval, signal, bounds } = input;
  const max = bounds?.maxDays ?? MAX_INTERVAL_BY_MEMORY_TYPE[memoryType];
  const initial = bounds?.initialDays ?? INITIAL_INTERVAL_DAYS;
  const base = priorInterval > 0 ? priorInterval : initial;

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

/**
 * Whether a signal counts as a pass for the scheduler.
 *
 * `recency` never reaches this — expression items carry no verdict and
 * are short-circuited before the scheduler runs. See `recordEngagement`.
 */
function signalIsPositive(signal: EngagementSignal): boolean {
  if (signal.kind === 'attempt') return signal.correct;
  if (signal.kind === 'rating') {
    return signal.rating === 'flying' || signal.rating === 'cruising';
  }
  return true;
}

function entryFromSignal(signal: EngagementSignal, t: number): PerformanceEntry {
  switch (signal.kind) {
    case 'attempt': return { t, kind: 'attempt', correct: signal.correct };
    case 'rating':  return {
      t, kind: 'rating', rating: signal.rating,
      ...(signal.feel !== undefined ? { feel: signal.feel } : {}),
      ...(signal.scores === false ? { scores: false } : {}),
      // WRITTEN ONLY WHEN THE CALLER SAID. An omitted flag stays
      // omitted rather than defaulting to false, because false means
      // "practice, cap it" and absent means "legacy, leave it alone".
      ...(signal.fromTest !== undefined ? { fromTest: signal.fromTest } : {}),
    };
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
  hand: DrillHand = 'both',
): Promise<SpacingState | undefined> {
  return db.spacingState
    .where('[moduleRef+itemRef+hand]')
    .equals([moduleRef, itemRef, hand])
    .first();
}

/**
 * The one place a brand-new spacing row is built.
 *
 * THREE CALLERS, ONE SHAPE. `recordEngagement`, `recordRecency` and
 * `recordEngagementOccurred` each need a first row and each used to
 * spell out the same eight fields. A field added to one and missed in
 * another is a row that is subtly a different kind of row, and the
 * only way to notice would be a bug months later in whatever reads it.
 *
 * The scheduling fields are the ARGUMENT rather than a default,
 * because they are the entire difference between the callers and
 * hiding that behind a default is how the difference gets lost.
 */
function newSpacingRow(args: {
  itemRef: string;
  moduleRef: string;
  hand: DrillHand;
  memoryType: MemoryType;
  history: PerformanceEntry[];
  t: number;
  currentIntervalDays: number;
  nextDueAt: number | null;
}): SpacingState {
  return {
    id: crypto.randomUUID(),
    itemRef: args.itemRef,
    moduleRef: args.moduleRef,
    hand: args.hand,
    memoryType: args.memoryType,
    acquisitionStage: computeNextStage(args.memoryType, 'acquiring', args.history),
    currentIntervalDays: args.currentIntervalDays,
    lastEngagedAt: args.t,
    nextDueAt: args.nextDueAt,
    performanceHistory: args.history as Array<Record<string, unknown>>,
  };
}

/**
 * Record that an item WAS ENGAGED WITH, and schedule nothing.
 *
 * =====================================================================
 * THE ABSENCE OF A DUE DATE IS THE POINT, NOT AN OMISSION.
 *
 * `recordEngagement` always ends with a schedule: an answer moves an
 * interval, and a `recency` signal moves a due date forward. Both are
 * right for a thing you DID — you sat at the keyboard, so the app has
 * an opinion about when you should do it again.
 *
 * Some things that count as engagement are not that. Charting a
 * section of a lead sheet is the input step the rest of the app
 * depends on: it says the work exists, not that it has been played.
 * Giving it an interval would turn writing a chart into practice debt,
 * and a chart that creates debt is a chart you put off writing.
 *
 * So this writes the history entry and leaves `currentIntervalDays` at
 * 0 and `nextDueAt` null. The card reads Started — `engagementVerdict`
 * needs only a non-empty history — and nothing comes round. The
 * schedule begins on the first RATED run, which is what the engine
 * already does with a row that has no interval yet.
 *
 * THAT ALSO MEANS THIS IS NOT A GATE. Nothing here declines to
 * schedule something that would otherwise be scheduled; there was no
 * schedule to write at charting time in the first place.
 *
 * NOT A SECOND WRITER. It shares `newSpacingRow` with
 * `recordEngagement`, and the memory-type/signal-kind guard is
 * deliberately NOT consulted: this records that something happened and
 * makes no claim the guard exists to police. A `recency` entry on an
 * `integration` module means "this happened, no verdict", which is
 * exactly true and is the reason the guard would have rejected it.
 *
 * IDEMPOTENT BY EXISTENCE. An item that already has a row has already
 * been engaged with; there is nothing to add and a second entry would
 * only move `lastEngagedAt` on evidence that is not new. Returns the
 * existing row untouched. That is what makes a backfill re-runnable.
 * =====================================================================
 */
export async function recordEngagementOccurred(input: {
  itemRef: string;
  moduleRef: string;
  hand?: DrillHand;
  timestamp?: number;
}): Promise<SpacingState> {
  const hand: DrillHand = input.hand ?? 'both';
  const t = input.timestamp ?? Date.now();
  const existing = await getSpacingState(input.itemRef, input.moduleRef, hand);
  if (existing) return existing;

  const row = newSpacingRow({
    itemRef: input.itemRef,
    moduleRef: input.moduleRef,
    hand,
    memoryType: getMemoryType(input.moduleRef),
    history: [{ t, kind: 'recency' }],
    t,
    currentIntervalDays: 0,
    nextDueAt: null,
  });
  await db.spacingState.add(row);
  return row;
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
  const hand: DrillHand = input.hand ?? 'both';
  const t = input.timestamp ?? Date.now();
  const memoryType = getMemoryType(moduleRef);
  assertSignalMatchesMemoryType(signal, memoryType, moduleRef);

  const entry = entryFromSignal(signal, t);
  const existing = await getSpacingState(itemRef, moduleRef, hand);

  // EXPRESSION ITEMS NEVER REACH THE SCHEDULER.
  //
  // Just Play, Just Produce and the Diary record that you turned up,
  // not whether you were right — there is no verdict to band and no
  // pass to grow an interval on. The two-stage engine would have to
  // invent one, so instead these keep the old behaviour exactly: the
  // interval stands and the due date moves forward from now.
  if (signal.kind === 'recency') {
    return await recordRecency(existing, {
      itemRef, moduleRef, hand, memoryType, entry, t,
    });
  }

  // THE SETTINGS ARE READ ON EVERY ANSWER, which is the whole of what
  // makes "changes apply from the next time you answer that card" true.
  // Nothing about the schedule is frozen onto the row when it is
  // created, so there is no stale copy to invalidate later.
  const settings = input.settings
    ?? await loadSettingsForCard(moduleRef, itemRef);

  if (!existing) {
    const initialHistory: PerformanceEntry[] = [entry];
    // First engagement: new → acquiring. A single signal can never
    // also clear the acquired threshold (min 5 attempts / min 3
    // ratings), but computeNextStage runs inside `newSpacingRow` for
    // uniformity in case future thresholds drop to 1.
    //
    // The interval and due date are filled in by `engineAnswer` just
    // below, which is why they start empty here rather than at
    // INITIAL_INTERVAL_DAYS.
    const row = newSpacingRow({
      itemRef, moduleRef, hand, memoryType,
      history: initialHistory,
      t,
      currentIntervalDays: 0,
      nextDueAt: null,
    });
    const scheduled = engineAnswer({
      state: newCardState(),
      settings,
      correct: signalIsPositive(signal),
      // No band on a first answer, and that is not "needs work": the
      // acquiring stage exists so nothing needs a band until it has
      // earned one.
      band: null,
      answeredAt: t,
    });
    Object.assign(row, rowFieldsFromCardState(scheduled));
    await db.spacingState.add(row);
    return row;
  }

  const history = [
    ...(existing.performanceHistory as PerformanceEntry[]),
    entry,
  ].slice(-PERFORMANCE_HISTORY_MAX);
  const scheduled = engineAnswer({
    state: cardStateFromRow(existing),
    settings,
    correct: signalIsPositive(signal),
    // The band is read from history INCLUDING this answer, so a card
    // that just dropped out of Fluent is scheduled by its new band
    // rather than by the one it has already lost.
    band: bandForRow({ performanceHistory: history as Array<Record<string, unknown>> }),
    answeredAt: t,
  });
  const updated: SpacingState = {
    ...existing,
    acquisitionStage: computeNextStage(memoryType, existing.acquisitionStage, history),
    performanceHistory: history as Array<Record<string, unknown>>,
    ...rowFieldsFromCardState(scheduled),
  };
  // Dev-Mode-gated: a practice engagement's spacing update is suppressed
  // when Dev Mode is on (assertSpacingStage's deliberate curation writes
  // below are NOT gated — they're not practice-session data).
  await putSpacingState(updated);
  return updated;
}

/**
 * The expression path: no band, no growth, no stage machine.
 *
 * Kept byte-for-byte equivalent to what the old engine did for a
 * recency signal — `computeIntervalDays` returned the prior interval
 * unchanged (floored to the initial on a first engagement) and the due
 * date was that far out from now.
 */
async function recordRecency(
  existing: SpacingState | undefined,
  ctx: {
    itemRef: string; moduleRef: string; hand: DrillHand;
    memoryType: MemoryType; entry: PerformanceEntry; t: number;
  },
): Promise<SpacingState> {
  const { itemRef, moduleRef, hand, memoryType, entry, t } = ctx;
  const max = MAX_INTERVAL_BY_MEMORY_TYPE[memoryType];
  const prior = existing?.currentIntervalDays ?? 0;
  const intervalDays = Math.min(
    max,
    Math.max(MIN_INTERVAL_DAYS, prior > 0 ? prior : INITIAL_INTERVAL_DAYS),
  );

  if (!existing) {
    const row = newSpacingRow({
      itemRef, moduleRef, hand, memoryType,
      history: [entry],
      t,
      currentIntervalDays: intervalDays,
      nextDueAt: computeNextDueAt(t, intervalDays),
    });
    await db.spacingState.add(row);
    return row;
  }

  const history = [
    ...(existing.performanceHistory as PerformanceEntry[]),
    entry,
  ].slice(-PERFORMANCE_HISTORY_MAX);
  const updated: SpacingState = {
    ...existing,
    acquisitionStage: computeNextStage(memoryType, existing.acquisitionStage, history),
    currentIntervalDays: intervalDays,
    lastEngagedAt: t,
    nextDueAt: computeNextDueAt(t, intervalDays),
    performanceHistory: history as Array<Record<string, unknown>>,
  };
  await putSpacingState(updated);
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
  hand: DrillHand = 'both',
): Promise<void> {
  const memoryType = getMemoryType(moduleRef);
  const existing = await getSpacingState(itemRef, moduleRef, hand);

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
      hand,
      memoryType,
      acquisitionStage: stage,
      currentIntervalDays: 0,
      lastEngagedAt: t,
      nextDueAt: null,
      performanceHistory: [],
      // A ROW CREATED NOW SAYS WHAT STAGE IT IS IN.
      //
      // `cardStateFromRow` reads a MISSING `spacingStage` as
      // maintaining, because rows written before the two-stage engine
      // have real intervals behind them and must not be dropped back
      // into a first-exposure tally. A row created this instant has no
      // such history, so leaving the field absent would hand a brand
      // new card to the wrong half of the scheduler — which is exactly
      // what happened to production lessons, where this function runs
      // before the engagement that follows it.
      spacingStage: 'acquiring',
      exposuresDone: 0,
      extraExposures: 0,
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
