import type { RepertoireStage, Song, SongStageDemotion, SongStageEarned } from '../../lib/db';
import { STAGES, type StageCriterion } from './stage';

/**
 * Noticing that a derived stage moved, and recording it when it fell.
 *
 * ---------------------------------------------------------------
 * A DERIVED VALUE CANNOT NOTICE ITSELF CHANGING.
 *
 * Stage is computed now — play it, prove it, three times — so nothing
 * writes it and nothing is notified when it moves. Left there, a song
 * could drop a rung between two page loads with nothing on screen
 * having said so, which is precisely the class of silent movement the
 * whole redesign exists to remove.
 *
 * So `songs.stage` is kept as a WATERMARK of the last observed
 * derivation, and every evaluation compares against it. That is the
 * only reason the field survives.
 * ---------------------------------------------------------------
 *
 * DEMOTION IS NEVER SILENT, AND NEVER A TOAST. A toast is gone before
 * you look up from the keyboard, and the thing it announced happened
 * while you were not there. The notice is stored and shown until
 * something changes it.
 */

export type StageMovement = 'none' | 'promotion' | 'demotion';

/** Rank on the ladder. -1 for a value not on it, so an unrecognised
 *  stored stage cannot be compared into a false promotion. */
function rankOf(stage: RepertoireStage): number {
  return STAGES.indexOf(stage);
}

export function movementBetween(
  previous: RepertoireStage,
  derived: RepertoireStage,
): StageMovement {
  const before = rankOf(previous);
  const after = rankOf(derived);
  if (before < 0 || after < 0 || before === after) return 'none';
  return after > before ? 'promotion' : 'demotion';
}

/**
 * Build the record for a drop.
 *
 * `criteriaAtLanding` is `stageCriteria` evaluated for the stage the
 * song LANDED on — which is exactly the set that just stopped being
 * satisfied, since satisfying them is what had lifted it above.
 *
 * The first unmet criterion is named rather than all of them. A notice
 * listing three things is a notice nobody finishes reading, and the
 * first is the one to act on; the panel lists the rest in full.
 * Preconditions are skipped when anything else is unmet — "a
 * performance tempo is set" is true of the song, not something that
 * lapsed, and naming it would send the user to the wrong place.
 */
export function buildDemotion(input: {
  from: RepertoireStage;
  to: RepertoireStage;
  criteriaAtLanding: StageCriterion[];
  now: number;
  /** Snapshot of which key held each quadrant, and which had lapsed,
   *  at the moment the drop was computed. Omitted for a drop that has
   *  nothing to do with quadrants. */
  holdings?: { heldByQuadrant: Array<string | null>; lapsedKeys: string[] };
}): SongStageDemotion {
  const unmet = input.criteriaAtLanding.filter(c => !c.met);
  const substantive = unmet.filter(c => !c.precondition);
  const named = substantive[0] ?? unmet[0] ?? null;
  return {
    at: input.now,
    from: input.from,
    to: input.to,
    criterionLabel: named?.label ?? 'criteria for this rung are no longer met',
    ...(named?.detail ? { detail: named.detail } : {}),
    ...(input.holdings
      ? {
          heldByQuadrant: input.holdings.heldByQuadrant,
          lapsedKeys: input.holdings.lapsedKeys,
        }
      : {}),
  };
}

/**
 * What to write after an evaluation, or null when nothing moved.
 *
 * Returns a patch rather than writing, so the decision stays pure and
 * the caller owns when a database write is acceptable — this runs on a
 * read path, and a write during render is a re-render loop rather than
 * a record.
 */
/**
 * The positive counterpart of `buildDemotion`.
 *
 * ---------------------------------------------------------------
 * IT NAMES THE CRITERION THAT COMPLETED, NOT THE NEXT ONE.
 *
 * The criteria at the DERIVED rung are the ones for the next climb —
 * all unmet by definition, or the song would have kept going. The
 * ones worth naming are the criteria that EARNED the rung just
 * reached, which are all met at this instant. They have to be passed
 * in, because by the time anything reads them again they belong to a
 * rung the song has left.
 *
 * Of those, the last substantive one: preconditions ("a performance
 * tempo is set for this song") are things you configured, not things
 * you played, and being told you reached Internalized because a
 * tempo is set would be true and worthless.
 * ---------------------------------------------------------------
 */
export function buildEarned(input: {
  from: RepertoireStage;
  to: RepertoireStage;
  criteriaEarningTo: StageCriterion[];
  now: number;
}): SongStageEarned {
  const met = input.criteriaEarningTo.filter(c => c.met);
  const substantive = met.filter(c => !c.precondition);
  const named = substantive[substantive.length - 1] ?? met[met.length - 1] ?? null;
  return {
    at: input.now,
    from: input.from,
    to: input.to,
    criterionLabel: named?.label ?? 'the criteria for this rung are met',
  };
}

export function stageReconciliation(input: {
  song: Song;
  previous: RepertoireStage;
  derived: RepertoireStage;
  criteriaAtDerived: StageCriterion[];
  /** The criteria that earn `derived` — met at the moment of a
   *  promotion, and the only ones that can name what just happened.
   *  Unused for a demotion, which reads `criteriaAtDerived`. */
  criteriaEarningDerived?: StageCriterion[];
  now: number;
  holdings?: { heldByQuadrant: Array<string | null>; lapsedKeys: string[] };
}): Partial<Song> | null {
  const movement = movementBetween(input.previous, input.derived);
  if (movement === 'none') return null;

  if (movement === 'demotion') {
    return {
      stage: input.derived,
      // A drop supersedes any standing "earned just now" — the two
      // share one slot precisely so they can never contradict each
      // other on screen.
      stageEarned: undefined,
      stageDemotion: buildDemotion({
        from: input.previous,
        to: input.derived,
        criteriaAtLanding: input.criteriaAtDerived,
        now: input.now,
        ...(input.holdings ? { holdings: input.holdings } : {}),
      }),
      updatedAt: input.now,
    };
  }

  // A promotion clears the notice ONLY when the song has climbed back
  // to or above the rung it fell from. Clearing on any promotion would
  // erase the record of a two-rung fall the moment one rung came back,
  // and the user would be reading a page that said nothing had
  // happened while still a rung short of where they were.
  const fell = input.song.stageDemotion;
  const recovered = fell !== undefined
    && rankOf(input.derived) >= rankOf(fell.from);
  return {
    stage: input.derived,
    ...(recovered ? { stageDemotion: undefined } : {}),
    stageEarned: buildEarned({
      from: input.previous,
      to: input.derived,
      criteriaEarningTo: input.criteriaEarningDerived ?? [],
      now: input.now,
    }),
    updatedAt: input.now,
  };
}
