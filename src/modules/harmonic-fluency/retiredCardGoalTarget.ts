/**
 * The one number `ksc-3` left behind.
 *
 * =====================================================================
 * A COVERAGE GOAL'S TARGET IS A SNAPSHOT. ITS SCOPE IS NOT.
 *
 * `targetValue` is written once, when the goal is created — "cover all
 * 649 of them" — and nothing recomputes it. The scope is enumerated
 * live from the catalog, so when `ksc-3` was retired the scope dropped
 * to 648 on its own. The target did not. A goal written before that
 * tops out at 648 / 649 and can never read complete.
 *
 * =====================================================================
 * THIS DOES NOT CHANGE THE RULE `scopeShrink` STATES. READ THAT FIRST.
 *
 * `scopeShrink` deliberately reports rather than migrates: "quietly
 * rewriting a target the user set is the same class of problem as a
 * denominator that moves with a settings toggle — the number stops
 * meaning what they think it means, and they were never told.
 * Rescoping a goal is their call."
 *
 * That rule stands, and this is what it hands back. Silas was told,
 * and Silas decided — once, for one goal, for a card that was a
 * duplicate of another card he had already drilled. Nothing here makes
 * a target rewrite automatic, and no future catalog cut goes through
 * this file: it is pinned to two numbers and dies when it has used
 * them.
 *
 * =====================================================================
 * IT VERIFIES BEFORE IT WRITES, AND REFUSES RATHER THAN ADAPTS.
 *
 * The rule `identityIdMigration` and the `ksc-3` cleanup both state,
 * followed rather than restated: a one-shot that adjusted itself to
 * whatever it found would be a different one-shot than the one that
 * was agreed to. The authorised shape is ONE overall Harmonic Fluency
 * coverage goal, open, standing at 649, against a deck that is now
 * 648. Anything else logs and leaves the pref unset, so it is a state
 * to come back to.
 *
 * SILENCE IS THE COMMON OUTCOME AND THE CORRECT ONE. Nobody has looked
 * in the database — it lives in a browser. No such goal is the likely
 * answer, and it logs nothing at all, because a console line about a
 * goal that does not exist is noise that reads like a finding.
 *
 * =====================================================================
 * WHICH GOALS ARE EVEN LOOKED AT.
 *
 * `harmonic_fluency_coverage_at_acquired` only — the OVERALL metric,
 * whose target is by definition the whole deck. The `_specific`
 * variant targets one sub-area and was never 649, so a goal of that
 * kind standing at some other number is not evidence of anything.
 * Umbrella goals and goals with no target are skipped for the same
 * reason: their progress is a rollup, and there is no snapshot in them
 * to be stale.
 *
 * 648 IS ALSO THE CHORD-SHAPE COUNT, which is why the filter is the
 * metric id and never the number.
 *
 * =====================================================================
 * IT SYNCS, BECAUSE IT GOES THROUGH DEXIE.
 *
 * `db.goals.update` fires the `updating` hook, which enqueues for
 * Supabase when signed in. `targetValue` rides inside the row's data
 * blob and `idField` is the row's own id, so the server sees an upsert
 * on the same primary key with a changed field. A raw IndexedDB write
 * would not enqueue, and the next pull would bring 649 back.
 * =====================================================================
 */
import { db, type Goal, type GoalStatus } from '../../lib/db';
import { getPref, setPref } from '../../lib/userPrefs';
import { harmonicFluencyCounts } from '../../lib/moduleItemCounts';
import { COVERAGE_OVERALL_METRIC } from '../goals/coverageMetrics';

export const PREF_HF_COVERAGE_TARGET_RETUNED = 'hfCoverageTargetRetunedAfterKsc3';

/** The metric whose target is the whole deck. */
const HF_OVERALL_METRIC = COVERAGE_OVERALL_METRIC.HARMONIC_FLUENCY;

/** What such a goal was written with, before `ksc-3` was retired. */
export const STALE_TARGET = 649;

/** What the deck holds now, and the only value this may write. */
export const AUTHORISED_TARGET = 648;

/**
 * Open, in the sense that matters here: a goal still being worked
 * toward. A paused goal is open — it is being come back to, and its
 * target has to be reachable when it is. A completed or abandoned one
 * is a record of what happened, and editing it would rewrite history
 * rather than fix a target.
 */
const OPEN_STATUSES: ReadonlySet<GoalStatus> = new Set<GoalStatus>(['active', 'paused']);

/** The goals this is allowed to have an opinion about. */
export function candidateGoals(goals: readonly Goal[]): Goal[] {
  return goals.filter(g =>
    g.targetMetric === HF_OVERALL_METRIC
    && !g.isUmbrella
    && typeof g.targetValue === 'number');
}

export type RetuneDecision =
  | { kind: 'none' }
  | { kind: 'refused'; reason: string }
  | { kind: 'retune'; goalId: string; description: string; from: number; to: number };

/**
 * What to do, given the candidates and the deck as it stands.
 *
 * Pure, so the ruling can be read and tested without a database — the
 * same split `refusalFor` makes in the `ksc-3` cleanup.
 */
export function decideRetune(
  goals: readonly Goal[],
  liveTotal: number,
): RetuneDecision {
  const candidates = candidateGoals(goals);
  if (candidates.length === 0) return { kind: 'none' };

  // A target that is neither the stale number nor the live one is a
  // goal this was not authorised against. It is not adapted to.
  const unexpected = candidates.filter(
    g => g.targetValue !== STALE_TARGET && g.targetValue !== AUTHORISED_TARGET,
  );
  if (unexpected.length > 0) {
    const listed = unexpected
      .map(g => `"${g.description}" at ${String(g.targetValue)}`)
      .join('; ');
    return {
      kind: 'refused',
      reason: `an overall Harmonic Fluency coverage goal stands at a target `
        + `this was not authorised against — ${listed}. Authorised: `
        + `${STALE_TARGET} → ${AUTHORISED_TARGET}, and nothing else`,
    };
  }

  const stale = candidates.filter(g => g.targetValue === STALE_TARGET);
  // Every one already at 648. Nothing to do, and nothing to say.
  if (stale.length === 0) return { kind: 'none' };

  if (stale.length > 1) {
    return {
      kind: 'refused',
      reason: `${stale.length} overall Harmonic Fluency coverage goals stand at `
        + `${STALE_TARGET} — ${stale.map(g => `"${g.description}"`).join('; ')}. `
        + 'One goal was authorised, so which of these was meant is a question '
        + 'rather than an assumption',
    };
  }

  const goal = stale[0];
  if (!OPEN_STATUSES.has(goal.status)) {
    return {
      kind: 'refused',
      reason: `"${goal.description}" is ${goal.status}, not open. Its target is a `
        + 'record of what was aimed at, and moving it would rewrite that rather '
        + 'than make anything reachable',
    };
  }

  if (liveTotal !== AUTHORISED_TARGET) {
    return {
      kind: 'refused',
      reason: `the deck holds ${liveTotal} cards, not the ${AUTHORISED_TARGET} this `
        + 'was authorised against. The catalog moved again, which is a different '
        + 'ruling than the one that was made',
    };
  }

  return {
    kind: 'retune',
    goalId: goal.id,
    description: goal.description,
    from: STALE_TARGET,
    to: AUTHORISED_TARGET,
  };
}

export interface RetuneReport {
  /** Already run — nothing was touched. */
  skipped: boolean;
  decision: RetuneDecision;
}

export async function retuneRetiredCardGoalTarget(): Promise<RetuneReport> {
  if (await getPref<boolean>(PREF_HF_COVERAGE_TARGET_RETUNED, false)) {
    return { skipped: true, decision: { kind: 'none' } };
  }

  const goals = await db.goals.toArray();
  const decision = decideRetune(goals, harmonicFluencyCounts().total);

  if (decision.kind === 'retune') {
    await db.goals.update(decision.goalId, { targetValue: decision.to });
    await setPref(PREF_HF_COVERAGE_TARGET_RETUNED, true);
  }
  // A refusal, and "no such goal", both leave the pref unset. Neither
  // is a step that has been taken.
  return { skipped: false, decision };
}

/**
 * The console line, or null where there should not be one.
 *
 * NULL IS A REAL ANSWER. No such goal is the expected outcome and it
 * says nothing — see the header.
 */
export function describeRetune(report: RetuneReport): string | null {
  if (report.skipped) return null;
  const { decision } = report;
  if (decision.kind === 'none') return null;
  if (decision.kind === 'refused') {
    return `[hf] coverage-goal target: REFUSED — ${decision.reason}`;
  }
  return `[hf] coverage-goal target: "${decision.description}" (${decision.goalId}) `
    + `moved from ${decision.from} to ${decision.to} — the deck lost a card when `
    + '`ksc-3` was retired and the stored target had not followed';
}
