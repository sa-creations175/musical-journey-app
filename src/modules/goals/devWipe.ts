/**
 * Temporary dev helpers — DO NOT commit.
 *
 * Two browser-console resets for clearing user state during testing:
 *
 *   await __wipeLastWeekActivity()
 *     Wipes practice activity from the past 7 days so behind-pace
 *     signals start fresh. Touches the source tables that feed the
 *     activity view (drillSessions, practiceSessions, songPracticeLog,
 *     productionLessonSessions) plus dailySummaries (the aggregated
 *     pace-signal table). Does NOT touch spacingState, goals, or songs.
 *
 *     Note: there is no `dailyActivity` table — the DailyActivityPoint
 *     view in goals/activity/dailyActivity.ts is computed on the fly
 *     from the source tables above. Wiping the sources + dailySummaries
 *     is the closest equivalent to what the helper name implies.
 *
 *   await __wipeMayGoals()
 *     Deletes monthly + weekly goals from May 2026 so the user can
 *     start fresh. Uses Goal.startDate as the "created in" proxy
 *     (the schema has no createdAt; startDate is set at creation
 *     time and is the most accurate signal of when the user
 *     committed). Does NOT touch yearly anchors (any non-weekly /
 *     non-monthly scope), spacingState, songs, or activity tables.
 *
 * Registered on window for browser-console use. Pure deletions —
 * no undo. Logs a per-table summary so the caller can verify scope.
 */

import { db, type Goal } from '../../lib/db';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface ActivityWipeSummary {
  drillSessions: number;
  practiceSessions: number;
  songPracticeLog: number;
  productionLessonSessions: number;
  dailySummaries: number;
}

export async function wipeLastWeekActivity(): Promise<ActivityWipeSummary> {
  const cutoffMs = Date.now() - 7 * ONE_DAY_MS;
  const cutoffDateStr = isoDate(cutoffMs); // YYYY-MM-DD, for dailySummaries

  // drillSessions — `timestamp` is the canonical when-field (not
  // createdAt). Filter in-memory because the index is on timestamp
  // alone and we want every row regardless of compound-index shape.
  const drillRows = await db.drillSessions.toArray();
  const drillIds = drillRows.filter(r => r.timestamp >= cutoffMs).map(r => r.id);
  await db.drillSessions.bulkDelete(drillIds);

  // practiceSessions — keyed on startedAt.
  const practiceRows = await db.practiceSessions.toArray();
  const practiceIds = practiceRows.filter(r => r.startedAt >= cutoffMs).map(r => r.id);
  await db.practiceSessions.bulkDelete(practiceIds);

  // songPracticeLog — keyed on timestamp.
  const songLogRows = await db.songPracticeLog.toArray();
  const songLogIds = songLogRows.filter(r => r.timestamp >= cutoffMs).map(r => r.id);
  await db.songPracticeLog.bulkDelete(songLogIds);

  // productionLessonSessions — keyed on timestamp.
  const prodRows = await db.productionLessonSessions.toArray();
  const prodIds = prodRows.filter(r => r.timestamp >= cutoffMs).map(r => r.id);
  await db.productionLessonSessions.bulkDelete(prodIds);

  // dailySummaries — compound primary key [date+moduleId]. Filter by
  // YYYY-MM-DD string ≥ the cutoff date string (lexicographic
  // comparison works on YYYY-MM-DD).
  const summaryRows = await db.dailySummaries.toArray();
  const summaryKeys = summaryRows
    .filter(r => r.date >= cutoffDateStr)
    .map(r => [r.date, r.moduleId] as [string, string]);
  await db.dailySummaries.bulkDelete(summaryKeys);

  const summary: ActivityWipeSummary = {
    drillSessions: drillIds.length,
    practiceSessions: practiceIds.length,
    songPracticeLog: songLogIds.length,
    productionLessonSessions: prodIds.length,
    dailySummaries: summaryKeys.length,
  };

  // eslint-disable-next-line no-console
  console.group(`[wipeLastWeekActivity] cutoff: ${new Date(cutoffMs).toISOString()}`);
  // eslint-disable-next-line no-console
  console.log(summary);
  // eslint-disable-next-line no-console
  console.log(
    `Total: ${
      summary.drillSessions
      + summary.practiceSessions
      + summary.songPracticeLog
      + summary.productionLessonSessions
      + summary.dailySummaries
    } rows deleted across 5 activity tables. spacingState / goals / songs untouched.`,
  );
  // eslint-disable-next-line no-console
  console.groupEnd();

  return summary;
}

interface GoalWipeSummary {
  monthly: number;
  weekly: number;
  preserved: {
    yearly: number;
    quarterly: number;
    other: number;
  };
}

export async function wipeMayGoals(): Promise<GoalWipeSummary> {
  // May 2026 local-time window — startDate stored in epoch ms, so
  // compare against local-interpreted boundary timestamps.
  const mayStart = new Date(2026, 4, 1, 0, 0, 0, 0).getTime();
  const juneStart = new Date(2026, 5, 1, 0, 0, 0, 0).getTime();

  const all = await db.goals.toArray();
  const inMay = (g: Goal) => g.startDate >= mayStart && g.startDate < juneStart;
  const eligible = (g: Goal) =>
    inMay(g) && (g.scope === 'monthly' || g.scope === 'weekly');

  const toDelete = all.filter(eligible);
  const idsToDelete = toDelete.map(g => g.id);
  await db.goals.bulkDelete(idsToDelete);

  const summary: GoalWipeSummary = {
    monthly: toDelete.filter(g => g.scope === 'monthly').length,
    weekly: toDelete.filter(g => g.scope === 'weekly').length,
    preserved: {
      yearly: all.filter(g => inMay(g) && g.scope === 'yearly').length,
      quarterly: all.filter(g => inMay(g) && g.scope === 'quarterly').length,
      other: all.filter(g =>
        inMay(g)
        && g.scope !== 'monthly'
        && g.scope !== 'weekly'
        && g.scope !== 'yearly'
        && g.scope !== 'quarterly',
      ).length,
    },
  };

  // eslint-disable-next-line no-console
  console.group('[wipeMayGoals] May 2026 monthly + weekly goals');
  // eslint-disable-next-line no-console
  console.log(`Deleted: ${summary.monthly} monthly + ${summary.weekly} weekly = ${summary.monthly + summary.weekly} goals.`);
  // eslint-disable-next-line no-console
  console.log('Preserved in May (not touched):', summary.preserved);
  // eslint-disable-next-line no-console
  console.log('Yearly anchors, spacingState, songs, activity tables: untouched.');
  // eslint-disable-next-line no-console
  console.groupEnd();

  return summary;
}

// =====================================================================
// Fresh-start reset — Level 1 (clean tracking slate) + full SM-2 wipe.
//
//   await __freshStartPreview()
//     COUNT-ONLY. Deletes nothing. Logs, per table, how many rows the
//     real reset WOULD delete, plus an explicit "preserved: N" line for
//     each protected category (songs/repertoire, yearly anchors,
//     quarterly goals, June-or-later goals). Eyeball this first.
//
//   await __freshStart()
//     ONE destructive command. Wipes:
//       · ALL activity history (entire history, not a window) across
//         drillSessions, practiceSessions, songPracticeLog,
//         productionLessonSessions, dailySummaries
//       · ALL spacingState / SM-2 rows (every item, every module) →
//         every item reverts to "new"
//       · ALL monthly + weekly goals with startDate before June 1, 2026
//         (April, May, and earlier dev-noise)
//     PRESERVES (never touched): songs / repertoire, yearly anchors,
//     quarterly goals, and any monthly/weekly goal dated June or later.
//
// Propagation: every wiped table EXCEPT dailySummaries is in the sync
// set, and these use bulkDelete (NOT clear()), so the 'deleting' hook
// fires per row and the deletes are enqueued to Supabase. Run signed in
// + online and let the sync queue flush so the cloud is cleared and a
// later replace-pull can't restore the polluted state. dailySummaries
// is local-only (not synced) and is a recomputed aggregate — nothing to
// clear in the cloud, nothing to restore. Pure deletions — no undo.
// =====================================================================

interface FreshStartPlan {
  drillSessions: string[];
  practiceSessions: string[];
  songPracticeLog: string[];
  productionLessonSessions: string[];
  dailySummaries: Array<[string, string]>;
  spacingState: string[];
  // ALL monthly / weekly goals with startDate before June 1, 2026 —
  // April, May, and anything earlier.
  preJuneMonthlyGoalIds: string[];
  preJuneWeeklyGoalIds: string[];
  // Month breakdown of the pre-June delete set, for eyeballing the
  // April delta in the preview. earlier = before April 1.
  goalBreakdown: {
    monthly: { earlier: number; april: number; may: number };
    weekly: { earlier: number; april: number; may: number };
  };
  preserved: {
    songs: number;
    songSections: number;
    songMatrixSections: number;
    songKeys: number;
    referenceTracks: number;
    yearlyAnchors: number;
    quarterlyGoals: number;
    goalsJuneOrLater: number;
  };
}

async function collectFreshStartPlan(): Promise<FreshStartPlan> {
  const aprStart = new Date(2026, 3, 1, 0, 0, 0, 0).getTime();
  const mayStart = new Date(2026, 4, 1, 0, 0, 0, 0).getTime();
  const juneStart = new Date(2026, 5, 1, 0, 0, 0, 0).getTime();
  // Delete ALL monthly/weekly goals committed before June 1 (April,
  // May, and earlier). June-or-later monthly/weekly goals are preserved.
  const isPreJune = (g: Goal) => g.startDate < juneStart;
  const monthBucket = (g: Goal): 'earlier' | 'april' | 'may' =>
    g.startDate >= mayStart ? 'may' : g.startDate >= aprStart ? 'april' : 'earlier';

  const [
    drillRows,
    practiceRows,
    songLogRows,
    prodRows,
    summaryRows,
    spacingRows,
    allGoals,
    songsCount,
    songSectionsCount,
    songMatrixCount,
    songKeysCount,
    referenceTracksCount,
  ] = await Promise.all([
    db.drillSessions.toArray(),
    db.practiceSessions.toArray(),
    db.songPracticeLog.toArray(),
    db.productionLessonSessions.toArray(),
    db.dailySummaries.toArray(),
    db.spacingState.toArray(),
    db.goals.toArray(),
    db.songs.count(),
    db.songSections.count(),
    db.songMatrixSections.count(),
    db.songKeys.count(),
    db.referenceTracks.count(),
  ]);

  const preJuneMonthly = allGoals.filter(g => g.scope === 'monthly' && isPreJune(g));
  const preJuneWeekly = allGoals.filter(g => g.scope === 'weekly' && isPreJune(g));
  const tally = (rows: Goal[]) => ({
    earlier: rows.filter(g => monthBucket(g) === 'earlier').length,
    april: rows.filter(g => monthBucket(g) === 'april').length,
    may: rows.filter(g => monthBucket(g) === 'may').length,
  });

  return {
    drillSessions: drillRows.map(r => r.id),
    practiceSessions: practiceRows.map(r => r.id),
    songPracticeLog: songLogRows.map(r => r.id),
    productionLessonSessions: prodRows.map(r => r.id),
    dailySummaries: summaryRows.map(r => [r.date, r.moduleId] as [string, string]),
    spacingState: spacingRows.map(r => r.id),
    preJuneMonthlyGoalIds: preJuneMonthly.map(g => g.id),
    preJuneWeeklyGoalIds: preJuneWeekly.map(g => g.id),
    goalBreakdown: {
      monthly: tally(preJuneMonthly),
      weekly: tally(preJuneWeekly),
    },
    preserved: {
      songs: songsCount,
      songSections: songSectionsCount,
      songMatrixSections: songMatrixCount,
      songKeys: songKeysCount,
      referenceTracks: referenceTracksCount,
      yearlyAnchors: allGoals.filter(g => g.scope === 'yearly').length,
      quarterlyGoals: allGoals.filter(g => g.scope === 'quarterly').length,
      goalsJuneOrLater: allGoals.filter(g => g.startDate >= juneStart).length,
    },
  };
}

export async function freshStartPreview(): Promise<FreshStartPlan> {
  const plan = await collectFreshStartPlan();
  const totalDelete =
    plan.drillSessions.length
    + plan.practiceSessions.length
    + plan.songPracticeLog.length
    + plan.productionLessonSessions.length
    + plan.dailySummaries.length
    + plan.spacingState.length
    + plan.preJuneMonthlyGoalIds.length
    + plan.preJuneWeeklyGoalIds.length;

  /* eslint-disable no-console */
  console.group('[freshStartPreview] COUNT-ONLY — nothing deleted');
  console.log('WOULD DELETE:');
  console.table({
    drillSessions: plan.drillSessions.length,
    practiceSessions: plan.practiceSessions.length,
    songPracticeLog: plan.songPracticeLog.length,
    productionLessonSessions: plan.productionLessonSessions.length,
    dailySummaries: plan.dailySummaries.length,
    spacingState: plan.spacingState.length,
    'goals (pre-June monthly)': plan.preJuneMonthlyGoalIds.length,
    'goals (pre-June weekly)': plan.preJuneWeeklyGoalIds.length,
  });
  console.log('Pre-June goal delete breakdown (by startDate month):');
  console.table({
    monthly: plan.goalBreakdown.monthly,
    weekly: plan.goalBreakdown.weekly,
  });
  console.log(`Total rows that WOULD be deleted: ${totalDelete}`);
  console.log('PRESERVED (will NOT be touched):');
  console.table({
    'songs preserved': plan.preserved.songs,
    'songSections preserved': plan.preserved.songSections,
    'songMatrixSections preserved': plan.preserved.songMatrixSections,
    'songKeys preserved': plan.preserved.songKeys,
    'referenceTracks preserved': plan.preserved.referenceTracks,
    'yearly anchors preserved': plan.preserved.yearlyAnchors,
    'quarterly goals preserved': plan.preserved.quarterlyGoals,
    'goals June-or-later preserved': plan.preserved.goalsJuneOrLater,
  });
  console.log('Run __freshStart() to execute. Be signed in + online and let sync flush.');
  console.groupEnd();
  /* eslint-enable no-console */

  return plan;
}

export async function freshStart(): Promise<FreshStartPlan> {
  const plan = await collectFreshStartPlan();

  // bulkDelete (NOT clear) on every synced table so the 'deleting' hook
  // fires per row and the deletes propagate to Supabase. dailySummaries
  // is local-only; bulkDelete by its compound [date, moduleId] key.
  await db.drillSessions.bulkDelete(plan.drillSessions);
  await db.practiceSessions.bulkDelete(plan.practiceSessions);
  await db.songPracticeLog.bulkDelete(plan.songPracticeLog);
  await db.productionLessonSessions.bulkDelete(plan.productionLessonSessions);
  await db.dailySummaries.bulkDelete(plan.dailySummaries);
  await db.spacingState.bulkDelete(plan.spacingState);
  await db.goals.bulkDelete([...plan.preJuneMonthlyGoalIds, ...plan.preJuneWeeklyGoalIds]);

  const totalDeleted =
    plan.drillSessions.length
    + plan.practiceSessions.length
    + plan.songPracticeLog.length
    + plan.productionLessonSessions.length
    + plan.dailySummaries.length
    + plan.spacingState.length
    + plan.preJuneMonthlyGoalIds.length
    + plan.preJuneWeeklyGoalIds.length;

  /* eslint-disable no-console */
  console.group('[freshStart] DONE — destructive reset executed');
  console.table({
    drillSessions: plan.drillSessions.length,
    practiceSessions: plan.practiceSessions.length,
    songPracticeLog: plan.songPracticeLog.length,
    productionLessonSessions: plan.productionLessonSessions.length,
    dailySummaries: plan.dailySummaries.length,
    spacingState: plan.spacingState.length,
    'goals (pre-June monthly)': plan.preJuneMonthlyGoalIds.length,
    'goals (pre-June weekly)': plan.preJuneWeeklyGoalIds.length,
  });
  console.log(`Total rows deleted: ${totalDeleted}.`);
  console.log('PRESERVED (untouched):', plan.preserved);
  console.log(
    'Synced deletes (activity + spacingState + goals) are enqueued to Supabase. '
    + 'Stay signed in + online until the sync indicator settles so the cloud is '
    + 'cleared and a replace-pull cannot restore this data. dailySummaries is '
    + 'local-only (recomputed aggregate).',
  );
  console.groupEnd();
  /* eslint-enable no-console */

  return plan;
}

function isoDate(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Wipe every row from the 5 activity tables — no date cutoff.
 * Same tables as wipeLastWeekActivity but unconditional, for full
 * resets ahead of dogfooding new flows. Does NOT touch spacingState,
 * goals, songs, or yearly anchors.
 */
export async function wipeAllActivity(): Promise<ActivityWipeSummary> {
  const [
    drillCount,
    practiceCount,
    songLogCount,
    prodCount,
    summaryCount,
  ] = await Promise.all([
    db.drillSessions.count(),
    db.practiceSessions.count(),
    db.songPracticeLog.count(),
    db.productionLessonSessions.count(),
    db.dailySummaries.count(),
  ]);

  await Promise.all([
    db.drillSessions.clear(),
    db.practiceSessions.clear(),
    db.songPracticeLog.clear(),
    db.productionLessonSessions.clear(),
    db.dailySummaries.clear(),
  ]);

  const summary: ActivityWipeSummary = {
    drillSessions: drillCount,
    practiceSessions: practiceCount,
    songPracticeLog: songLogCount,
    productionLessonSessions: prodCount,
    dailySummaries: summaryCount,
  };

  // eslint-disable-next-line no-console
  console.group('[wipeAllActivity] no date cutoff');
  // eslint-disable-next-line no-console
  console.log(summary);
  // eslint-disable-next-line no-console
  console.log(
    `Total: ${
      summary.drillSessions
      + summary.practiceSessions
      + summary.songPracticeLog
      + summary.productionLessonSessions
      + summary.dailySummaries
    } rows wiped across 5 activity tables. spacingState / goals / songs / yearly anchors untouched.`,
  );
  // eslint-disable-next-line no-console
  console.groupEnd();

  return summary;
}

if (typeof window !== 'undefined') {
  const w = window as unknown as {
    __wipeLastWeekActivity?: typeof wipeLastWeekActivity;
    __wipeAllActivity?: typeof wipeAllActivity;
    __wipeMayGoals?: typeof wipeMayGoals;
    __freshStartPreview?: typeof freshStartPreview;
    __freshStart?: typeof freshStart;
  };
  w.__wipeLastWeekActivity = wipeLastWeekActivity;
  w.__wipeAllActivity = wipeAllActivity;
  w.__wipeMayGoals = wipeMayGoals;
  w.__freshStartPreview = freshStartPreview;
  w.__freshStart = freshStart;
}
