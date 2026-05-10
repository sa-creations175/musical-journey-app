import { db, type AcquisitionStage, type ProductionLessonMastery } from './db';
import { getPref, setPref } from './userPrefs';
import { assertSpacingStage, getSpacingState } from './spacingState';

/**
 * Phase 2 substep 1h — one-time backfill that derives a starting
 * acquisition stage for every item the user has historical engagement
 * with, so day-1 coverage progress reflects real practice instead of
 * showing 0%.
 *
 * Behavior:
 *   - Gated by PREF_SPACING_STATE_BACKFILL_V1. Once set, the function
 *     short-circuits — it never runs twice. If a future bug requires
 *     re-deriving, ship a `_V2` pref.
 *   - Reuses `assertSpacingStage` for writes (matches Phase 2's
 *     deliberate-assertion path; backfill IS a deliberate assertion of
 *     a derived stage).
 *   - **Skips items that already have a spacingState row.** Live
 *     wiring may have written rows post-Phase-2 before backfill ran;
 *     those take precedence. Backfill fills gaps, not overwrites.
 *   - Writes empty `performanceHistory` (Option A from the design).
 *     Stage IS the truth; the rolling window resets and accumulates
 *     fresh post-Phase-2 history.
 *   - Module-level in-flight guard prevents two concurrent callers
 *     (e.g. two tabs) from racing the backfill.
 *
 * Returns counts so a caller / future Settings UI can verify it ran
 * honestly. The numbers are also useful for one-shot debug logging.
 */

export const PREF_SPACING_STATE_BACKFILL_V1 = 'spacingState.backfilledV1At';

/** Threshold mirrors `DECLARATIVE_ACQUIRED_*` in spacingState.ts: ≥5
 *  attempts on the trailing window, ≥80% correct → acquired. Kept as
 *  local consts so the backfill stays self-contained — if those
 *  numbers are tuned later, this file should follow. */
const DECL_MIN_ATTEMPTS = 5;
const DECL_WINDOW = 10;
const DECL_THRESHOLD = 0.8;
/** Mirrors `RATING_ACQUIRED_MIN_RATINGS` in spacingState.ts. */
const RATING_MIN = 3;

export interface BackfillCounts {
  created: number;
  modules: Record<string, number>;
}

let backfillInFlight: Promise<BackfillCounts> | null = null;

/**
 * Public entry point. Returns counts of rows written per module
 * (and a total). On second-and-later calls, returns zero counts —
 * the pref short-circuits the work.
 */
export async function backfillSpacingStateIfNeeded(): Promise<BackfillCounts> {
  if (backfillInFlight) return backfillInFlight;
  backfillInFlight = (async () => {
    try {
      return await runBackfill();
    } finally {
      backfillInFlight = null;
    }
  })();
  return backfillInFlight;
}

async function runBackfill(): Promise<BackfillCounts> {
  const empty: BackfillCounts = { created: 0, modules: {} };
  const already = await getPref<number>(PREF_SPACING_STATE_BACKFILL_V1, 0);
  if (already > 0) return empty;

  const counts: Record<string, number> = {};
  let total = 0;
  const bump = async (
    moduleRef: string,
    itemRef: string,
    stage: AcquisitionStage | null,
  ) => {
    if (stage === null) return;
    const existing = await getSpacingState(itemRef, moduleRef);
    if (existing) return; // live wiring wins — don't overwrite.
    await assertSpacingStage(itemRef, moduleRef, stage);
    counts[moduleRef] = (counts[moduleRef] ?? 0) + 1;
    total += 1;
  };

  await backfillDeclarativeFromAttempts('intervals',          bump);
  await backfillDeclarativeFromAttempts('chord-recognition',  bump);
  await backfillDeclarativeFromAttempts('chord-progressions', bump);
  await backfillDeclarativeFromAttempts('scales-modes',       bump);
  await backfillHarmonicFluency(bump);
  await backfillShapesAndPatterns(bump);
  await backfillRepertoire(bump);
  await backfillProduction(bump);

  await setPref(PREF_SPACING_STATE_BACKFILL_V1, Date.now());
  return { created: total, modules: counts };
}

// ===================================================================
// Declarative modules — read from db.attempts
// ===================================================================

/** Patterns that appear in db.attempts.itemId for `chord-progressions`
 *  but are sub-skill records (not catalog items). Mirrors the
 *  exclusion in 1c's live wiring — backfill must filter these out so
 *  spacingState rows match the catalog's coverage denominator. */
function isExcludedChordProgressionsItemId(id: string): boolean {
  return (
    id.includes('-pattern') ||
    id.includes('-inversion') ||
    id.startsWith('key-detection:') ||
    id.startsWith('motion:') ||
    id.startsWith('motion-mode:') ||
    id.startsWith('motion-first:')
  );
}

async function backfillDeclarativeFromAttempts(
  moduleId: 'intervals' | 'chord-recognition' | 'chord-progressions' | 'scales-modes',
  bump: (moduleRef: string, itemRef: string, stage: AcquisitionStage | null) => Promise<void>,
): Promise<void> {
  const rows = await db.attempts
    .where('moduleId').equals(moduleId)
    .toArray();
  // Group by itemRef. For intervals, itemRef encodes direction
  // (M3:asc / M3:desc) — match the live wiring in 1b.
  const buckets = new Map<string, Array<{ correct: boolean; ts: number }>>();
  for (const r of rows) {
    if (moduleId === 'chord-progressions' && isExcludedChordProgressionsItemId(r.itemId)) {
      continue;
    }
    const itemRef = moduleId === 'intervals' && r.direction
      ? `${r.itemId}:${r.direction}`
      : r.itemId;
    const list = buckets.get(itemRef) ?? [];
    list.push({ correct: r.correct, ts: r.timestamp });
    buckets.set(itemRef, list);
  }
  for (const [itemRef, attempts] of buckets) {
    const stage = deriveDeclarativeStage(attempts);
    await bump(moduleId, itemRef, stage);
  }
}

/** ≥5 attempts on the last 10, ≥80% correct → acquired. ≥1 attempt
 *  → acquiring. Mirrors live wiring's transition rule exactly. */
export function deriveDeclarativeStage(
  attempts: Array<{ correct: boolean; ts: number }>,
): AcquisitionStage | null {
  if (attempts.length === 0) return null;
  const sorted = [...attempts].sort((a, b) => a.ts - b.ts);
  const window = sorted.slice(-DECL_WINDOW);
  if (window.length >= DECL_MIN_ATTEMPTS) {
    const correct = window.filter(a => a.correct).length;
    if (correct / window.length >= DECL_THRESHOLD) return 'acquired';
  }
  return 'acquiring';
}

// ===================================================================
// Harmonic Fluency — read from db.flashcardStates (SM-2 aggregates)
// ===================================================================

async function backfillHarmonicFluency(
  bump: (moduleRef: string, itemRef: string, stage: AcquisitionStage | null) => Promise<void>,
): Promise<void> {
  const rows = await db.flashcardStates.toArray();
  for (const row of rows) {
    const stage = deriveFlashcardStage(row.totalAttempts, row.totalCorrect);
    await bump('harmonic-fluency', row.cardId, stage);
  }
}

/** Uses SM-2's aggregate counters (totalAttempts / totalCorrect) as
 *  the authoritative source for HF — flashcardStates is richer than
 *  the rolling-window accuracy from db.attempts and matches what the
 *  HF UI itself trusts. Threshold semantics match the declarative
 *  rule: ≥5 total attempts at ≥80% accuracy → acquired. */
export function deriveFlashcardStage(
  totalAttempts: number,
  totalCorrect: number,
): AcquisitionStage | null {
  if (totalAttempts === 0) return null;
  if (totalAttempts >= DECL_MIN_ATTEMPTS && totalCorrect / totalAttempts >= DECL_THRESHOLD) {
    return 'acquired';
  }
  return 'acquiring';
}

// ===================================================================
// Shapes & Patterns — drillSessions joined to drillSkills
// ===================================================================

/** Mirrors `feelToRating` in shapes-and-patterns/drillModel.ts.
 *  Duplicated here on purpose: backfill is a separate concern from
 *  the live write path, and the live mapping shouldn't bind backfill
 *  via a cross-layer import. If the live mapping ever changes, this
 *  must be updated to match. */
function feelToRatingProcedural(feel: 1 | 2 | 3 | 4): 'flying' | 'cruising' | 'crawling' {
  if (feel >= 4) return 'flying';
  if (feel >= 3) return 'cruising';
  return 'crawling';
}

/** Mirrors `itemRefForSkill` in shapes-and-patterns/drillModel.ts.
 *  Mental-viz returns null — excluded from spacingState, same as the
 *  live wiring in 1e. */
function itemRefForSkillRow(skill: {
  kind: string;
  keyName?: string;
  quality?: string;
  scale?: string;
  patternId?: string;
  inversionState?: string | null;
}): string | null {
  switch (skill.kind) {
    case 'chord-shape': {
      const base = `chord-shape:${skill.quality}:${skill.keyName}`;
      return skill.inversionState ? `${base}:${skill.inversionState}` : base;
    }
    case 'scale':         return `scale:${skill.scale}:${skill.keyName}`;
    case 'voice-leading': return `vl:${skill.patternId}:${skill.keyName}`;
    case 'mental-viz':    return null;
    default:              return null;
  }
}

async function backfillShapesAndPatterns(
  bump: (moduleRef: string, itemRef: string, stage: AcquisitionStage | null) => Promise<void>,
): Promise<void> {
  const [skills, sessions] = await Promise.all([
    db.drillSkills.toArray(),
    db.drillSessions.toArray(),
  ]);
  const skillById = new Map(skills.map(s => [s.id, s]));
  // Group sessions by skillId.
  const sessionsBySkill = new Map<string, Array<{ feel: 1 | 2 | 3 | 4; ts: number }>>();
  for (const s of sessions) {
    const list = sessionsBySkill.get(s.skillId) ?? [];
    list.push({ feel: s.feelRating, ts: s.timestamp });
    sessionsBySkill.set(s.skillId, list);
  }
  for (const [skillId, list] of sessionsBySkill) {
    const skill = skillById.get(skillId);
    if (!skill) continue; // orphaned session, skip
    const itemRef = itemRefForSkillRow(skill);
    if (itemRef === null) continue; // mental-viz excluded
    const stage = deriveRatingStage(list.map(s => feelToRatingProcedural(s.feel)), list.map(s => s.ts));
    await bump('shapes-and-patterns', itemRef, stage);
  }
}

/** Last 3 ratings all in {flying, cruising} → acquired. ≥1 rating →
 *  acquiring. Mirrors live wiring's rating-based rule. */
export function deriveRatingStage(
  ratings: Array<'flying' | 'cruising' | 'crawling'>,
  timestamps: number[],
): AcquisitionStage | null {
  if (ratings.length === 0) return null;
  // Sort by timestamp ascending so the trailing slice is "last N".
  const indexed = ratings.map((r, i) => ({ r, ts: timestamps[i] }));
  indexed.sort((a, b) => a.ts - b.ts);
  const lastN = indexed.slice(-RATING_MIN);
  if (lastN.length >= RATING_MIN && lastN.every(x => x.r === 'flying' || x.r === 'cruising')) {
    return 'acquired';
  }
  return 'acquiring';
}

// ===================================================================
// Song Repertoire — db.songPracticeLog
// ===================================================================

/** Mirrors `feelToRating` in repertoire/PracticeLogModal.tsx (the
 *  5-point version, more lenient than the procedural 4-point). Same
 *  duplication rationale as the procedural variant above. */
function feelToRatingIntegration(
  feel: 1 | 2 | 3 | 4 | 5,
): 'flying' | 'cruising' | 'crawling' {
  if (feel >= 5) return 'flying';
  if (feel >= 3) return 'cruising';
  return 'crawling';
}

async function backfillRepertoire(
  bump: (moduleRef: string, itemRef: string, stage: AcquisitionStage | null) => Promise<void>,
): Promise<void> {
  const logs = await db.songPracticeLog.toArray();
  const bySong = new Map<string, Array<{ rating: 'flying' | 'cruising' | 'crawling'; ts: number }>>();
  for (const log of logs) {
    const list = bySong.get(log.songId) ?? [];
    list.push({ rating: feelToRatingIntegration(log.feelRating), ts: log.timestamp });
    bySong.set(log.songId, list);
  }
  for (const [songId, ratings] of bySong) {
    const stage = deriveRatingStage(
      ratings.map(r => r.rating),
      ratings.map(r => r.ts),
    );
    await bump('repertoire', songId, stage);
  }
}

// ===================================================================
// Production — direct mirror from productionLessons.mastery
// ===================================================================

const STAGE_FOR_MASTERY: Record<ProductionLessonMastery, AcquisitionStage | null> = {
  'not-started': null,
  'in-progress': 'acquiring',
  'completed':   'acquired',
  'mastered':    'mastered',
};

async function backfillProduction(
  bump: (moduleRef: string, itemRef: string, stage: AcquisitionStage | null) => Promise<void>,
): Promise<void> {
  const lessons = await db.productionLessons.toArray();
  for (const lesson of lessons) {
    await bump('production', lesson.id, STAGE_FOR_MASTERY[lesson.mastery]);
  }
}
