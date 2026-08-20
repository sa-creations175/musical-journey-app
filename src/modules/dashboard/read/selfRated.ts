/**
 * The three modules whose practice never touches `db.attempts`.
 *
 * Shapes & Patterns, mental visualisation and production lessons all
 * record what they do somewhere else entirely, and none of them has a
 * right-or-wrong answer. This file turns each of those sources into
 * engagements the shared primitive can read.
 *
 * Pure: loaded rows in, engagements out.
 */
import type {
  DrillSession,
  DrillSkill,
  ProductionLesson,
  ProductionLessonSession,
  SpacingState,
} from '../../../lib/db';
import { fluencyValue, normaliseFeel } from '../../../lib/fluencyScale';
import { MENTAL_VIZ_MODULE_REF } from '../../shapes-and-patterns/mentalVizLibrary';
import type { Engagement } from './itemStats';

// =====================================================================
// Shapes & Patterns
// =====================================================================

/**
 * `drillSessions` is the source, not `spacingState`.
 *
 * Spacing rows keep only the last 20 signals and store them in the
 * legacy three-value vocabulary; `DrillSession.feelRating` is the
 * four-step scale as given, one row per rep, kept forever. When two
 * sources disagree, read the one the player actually filled in.
 *
 * A session with no `feelRating` produces NOTHING rather than a
 * default. `logSession` records duration whether or not the player
 * rated the rep, and coercing an unrated rep to a number would invent a
 * fluency signal - the same rule `engagementFromRating` follows.
 *
 * Hand and style collapse. A cell drilled right-hand-solid and again
 * left-hand-arpeggiated is two reps of one shape, and the denominator
 * counts the shape once; see the denominator statement in
 * DASHBOARD_REDESIGN_DESIGN.md.
 */
export function shapesEngagements(
  sessions: ReadonlyArray<DrillSession>,
  skills: ReadonlyArray<DrillSkill>,
): Engagement[] {
  const refBySkillId = new Map<string, string>();
  for (const skill of skills) {
    const ref = shapesItemRefForSkill(skill);
    if (ref) refBySkillId.set(skill.id, ref);
  }
  const out: Engagement[] = [];
  for (const session of sessions) {
    // Scale and voice-leading sessions stand their own itemRef in for
    // `skillId` - they run off static catalogs and have no drillSkills
    // row - so an unmatched id that parses as a catalog ref is not an
    // orphan. Anything else is, and is dropped by catalog membership
    // downstream rather than guessed at here.
    const ref = refBySkillId.get(session.skillId) ?? session.skillId;
    const feel = normaliseFeel(session.feelRating);
    if (feel === null) continue;
    out.push({ itemRef: ref, timestamp: session.timestamp, score: fluencyValue(feel) });
  }
  return out;
}

/** Mirrors `drillModel.itemRefForSkill`, which is private to that file.
 *  Mental-viz skills return null - they are their own module here. */
function shapesItemRefForSkill(skill: DrillSkill): string | null {
  switch (skill.kind) {
    case 'chord-shape': {
      const base = `chord-shape:${skill.quality}:${skill.keyName}`;
      return skill.inversionState ? `${base}:${skill.inversionState}` : base;
    }
    case 'scale':         return `scale:${skill.scale}:${skill.keyName}`;
    case 'voice-leading': return `vl:${skill.patternId}:${skill.keyName}`;
    default:              return null;
  }
}

// =====================================================================
// Mental visualisation
// =====================================================================

/**
 * The three-value vocabulary this module still ships, projected onto
 * the four-step fluency scale.
 *
 * MENTAL VISUALISATION HAS NOT ADOPTED THE FOUR-STEP SCALE.
 * `MentalVizChordDrill` offers Flying / Cruising / Crawling - the
 * vocabulary the 20 Aug rating decision supersedes - and
 * `recordEngagement` stores exactly those three strings. Its only
 * per-item record is `spacingState.performanceHistory`, so there is no
 * richer source to read instead.
 *
 * `cruising` maps to `comfortable` rather than `working on it` because
 * its own hint reads "got there, took a beat", which is a description
 * of comfort rather than of effort. That is a judgement, and it is the
 * one thing here that is not read off stored data. It goes away the
 * moment mental viz adopts the four-step scale, and the projection is
 * named rather than inlined so the replacement is a single edit.
 */
export const MENTAL_VIZ_RATING_PROJECTION: Readonly<Record<string, number>> = {
  crawling: 25,
  cruising: 75,
  flying: 100,
};

interface RatingHistoryEntry {
  t: number;
  kind: string;
  rating?: string;
}

/**
 * Mental viz engagements from its spacing rows.
 *
 * `performanceHistory` is capped at 20 entries, which is the same width
 * as the accuracy window, so nothing is lost to the cap that the window
 * would have used. The COUNT is lost: an item drilled fifty times
 * reports twenty engagements, so its coverage is understated. Coverage
 * needs three and the cap is twenty, so the threshold is unaffected -
 * but the raw count on an item row is a floor, not a total, and the
 * affordance should say so.
 */
export function mentalVizEngagements(
  rows: ReadonlyArray<SpacingState>,
): Engagement[] {
  const out: Engagement[] = [];
  for (const row of rows) {
    if (row.moduleRef !== MENTAL_VIZ_MODULE_REF) continue;
    for (const raw of row.performanceHistory as unknown as RatingHistoryEntry[]) {
      if (raw?.kind !== 'rating' || typeof raw.rating !== 'string') continue;
      const score = MENTAL_VIZ_RATING_PROJECTION[raw.rating];
      if (score === undefined) continue;
      out.push({ itemRef: row.itemRef, timestamp: raw.t, score });
    }
  }
  return out;
}

// =====================================================================
// Production lessons
// =====================================================================

/**
 * A lesson has a RATING, not attempts.
 *
 * The five-step lesson scale is a cumulative ladder - not started, read
 * it, deep dive, tried it, mastered - and `ProductionLesson.rating` is
 * the single source of truth for where the player stands. It is a
 * state, not an event, so a rolling window over it would be
 * meaningless: averaging "read it" and "mastered" would report "deep
 * dive", which is not somewhere the player has ever been.
 *
 * So each lesson emits exactly ONE graded engagement carrying its
 * current rating. `LESSON_COVERAGE_RULE` then does the work: coverage
 * is "tried it" (75), because reading a lesson and taking it in are
 * worth recording but neither is practice.
 *
 * A lesson at 0 emits nothing at all. Not started is not a rating of
 * zero - it is the absence of one, and the row should read as a dash
 * rather than as a failure.
 *
 * CONSEQUENCE FOR THE UI: an item row's "N attempts" readout is
 * meaningless here and will always say 1. A lesson row should show its
 * rating by name instead.
 */
export function productionLessonEngagements(
  lessons: ReadonlyArray<ProductionLesson>,
  sessions: ReadonlyArray<ProductionLessonSession> = [],
): Engagement[] {
  const latestSessionAt = new Map<string, number>();
  for (const session of sessions) {
    const seen = latestSessionAt.get(session.lessonId);
    if (seen === undefined || session.timestamp > seen) {
      latestSessionAt.set(session.lessonId, session.timestamp);
    }
  }
  const out: Engagement[] = [];
  for (const lesson of lessons) {
    // `rating <= 0` alone was not enough: it is FALSE for undefined, so
    // a row whose rating never got written let an engagement through
    // carrying `score: undefined`. One of those in a window turns the
    // mean into NaN, and the rolled-up parent rendered "NaN%" in red -
    // a number that is not a number, painted as a failing one.
    //
    // An unreadable rating is not a rating. The row reads as a dash.
    if (!Number.isFinite(lesson.rating) || lesson.rating <= 0) continue;
    // Recency prefers a real session over `updatedAt`, which any write
    // to the row moves.
    const timestamp = latestSessionAt.get(lesson.id)
      ?? lesson.lastOpenedAt
      ?? lesson.updatedAt;
    out.push({ itemRef: lesson.id, timestamp, score: lesson.rating });
  }
  return out;
}
