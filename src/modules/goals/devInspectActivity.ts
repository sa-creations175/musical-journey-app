import { db, type Goal } from '../../lib/db';
import { ET_MODULE_REFS } from './progress';
import {
  endOfWeekLocal,
  previousWeekStart,
  startOfWeekLocal,
} from './weeklyPlanData';
import { moduleForMetric } from './goalVocabulary';
import { isCoverageMetric } from './coverageMetrics';
import { deriveWeeklyGoals } from './weeklyDerivation';

/**
 * Manual inspection helpers for Phase 4 step 3 — surface the raw
 * rows that drive the WeeklyPlan "last week review" totals so the
 * operator can decide whether the data represents real practice or
 * residual development clicks.
 *
 * NOT wired to app boot — manual side-effect import only. Use from
 * the console:
 *
 *     await __inspectLastWeekActivity()
 *
 * Prints, per module, the count + per-row detail for the most recent
 * full week (Sunday → Saturday local). Repertoire rows include the
 * fields that distinguish considered practice (tempoBpm, notes,
 * wasClean) from quick-test clicks (null tempo + no notes).
 *
 * After confirming what's junk, you can selectively wipe via:
 *
 *     await __wipeRepertoireRunThroughsInRange(start, end)
 *
 * which deletes songCellRunThrough rows whose createdAt falls in
 * the inclusive [start, end] epoch-ms window. Works on any window
 * — pass the values printed by inspectLastWeekActivity to scope
 * the wipe to last week's rows, or your own dates for a different
 * span. Sync hooks propagate the deletes to Supabase.
 */

interface ModuleSnapshot {
  module: string;
  count: number;
  rows: ReadonlyArray<Record<string, unknown>>;
}

export async function inspectLastWeekActivity(): Promise<ModuleSnapshot[]> {
  const thisWeekStart = startOfWeekLocal();
  const lastWeekStart = previousWeekStart(thisWeekStart);
  const lastWeekEnd = endOfWeekLocal(lastWeekStart);

  // eslint-disable-next-line no-console
  console.log(
    '[inspectLastWeekActivity] window',
    new Date(lastWeekStart).toLocaleString(),
    '→',
    new Date(lastWeekEnd).toLocaleString(),
    `(${lastWeekStart}–${lastWeekEnd})`,
  );

  const hf = await db.attempts
    .where('moduleId').equals('harmonic-fluency')
    .filter(a => a.timestamp >= lastWeekStart && a.timestamp <= lastWeekEnd)
    .toArray();

  const et = await db.attempts
    .where('moduleId').anyOf(ET_MODULE_REFS as readonly string[] as string[])
    .filter(a => a.timestamp >= lastWeekStart && a.timestamp <= lastWeekEnd)
    .toArray();

  const drills = await db.drillSessions
    .where('timestamp').between(lastWeekStart, lastWeekEnd, true, true)
    .toArray();

  const cellRuns = await db.songCellRunThroughs
    .where('createdAt').between(lastWeekStart, lastWeekEnd, true, true)
    .toArray();

  const sessions = await db.practiceSessions
    .where('startedAt').between(lastWeekStart, lastWeekEnd, true, true)
    .toArray();

  // Production: walk performanceHistory.
  const prodRows = await db.spacingState
    .where('moduleRef').equals('production')
    .toArray();
  const prodEntries: Array<Record<string, unknown>> = [];
  for (const row of prodRows) {
    for (const entry of row.performanceHistory) {
      const t = (entry as { t?: unknown }).t;
      const kind = (entry as { kind?: unknown }).kind;
      if (typeof t !== 'number') continue;
      if (t < lastWeekStart || t > lastWeekEnd) continue;
      if (kind === 'recency') continue;
      prodEntries.push({
        itemRef: row.itemRef,
        t,
        when: new Date(t).toLocaleString(),
        ...entry,
      });
    }
  }

  const snapshots: ModuleSnapshot[] = [
    {
      module: 'harmonic-fluency (db.attempts)',
      count: hf.length,
      rows: hf.map(a => ({
        when: new Date(a.timestamp).toLocaleString(),
        itemId: a.itemId,
        correct: a.correct,
      })),
    },
    {
      module: 'ear-training (db.attempts, ET_MODULE_REFS)',
      count: et.length,
      rows: et.map(a => ({
        when: new Date(a.timestamp).toLocaleString(),
        moduleId: a.moduleId,
        itemId: a.itemId,
        correct: a.correct,
      })),
    },
    {
      module: 'shapes-and-patterns (db.drillSessions)',
      count: drills.length,
      rows: drills.map(d => ({
        when: new Date(d.timestamp).toLocaleString(),
        drillTypeId: d.drillTypeId,
        skillId: d.skillId,
        durationSeconds: d.durationSeconds,
        feelRating: d.feelRating,
      })),
    },
    {
      module: 'repertoire (db.songCellRunThroughs)',
      count: cellRuns.length,
      rows: cellRuns.map(r => ({
        when: new Date(r.createdAt).toLocaleString(),
        songId: r.songId,
        cellId: r.cellId,
        wasClean: r.wasClean,
        tempoBpm: r.tempoBpm,
        notes: r.notes,
      })),
    },
    {
      module: 'production (db.spacingState performanceHistory)',
      count: prodEntries.length,
      rows: prodEntries,
    },
    {
      module: 'practice-consistency (db.practiceSessions)',
      count: sessions.length,
      rows: sessions.map(s => ({
        when: new Date(s.startedAt).toLocaleString(),
        plannedDurationMin: s.plannedDurationMin,
        actualDurationMin: s.actualDurationMin,
        context: s.context,
      })),
    },
  ];

  for (const snap of snapshots) {
    // eslint-disable-next-line no-console
    console.log(`[inspectLastWeekActivity] ${snap.module} — ${snap.count} row${snap.count === 1 ? '' : 's'}`);
    if (snap.rows.length > 0) {
      // eslint-disable-next-line no-console
      console.table(snap.rows);
    }
  }

  return snapshots;
}

/**
 * Selective wipe of songCellRunThroughs in an inclusive [start, end]
 * window. Confirm before calling — sync propagates the deletes to
 * Supabase. Returns the deleted row count.
 */
export async function wipeRepertoireRunThroughsInRange(
  start: number,
  end: number,
): Promise<number> {
  const rows = await db.songCellRunThroughs
    .where('createdAt').between(start, end, true, true)
    .toArray();
  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[wipeRepertoireRunThroughsInRange] No rows in range.');
    return 0;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[wipeRepertoireRunThroughsInRange] About to delete ${rows.length} row${rows.length === 1 ? '' : 's'}`,
    rows.map(r => ({
      id: r.id,
      when: new Date(r.createdAt).toLocaleString(),
      songId: r.songId,
      tempoBpm: r.tempoBpm,
      wasClean: r.wasClean,
    })),
  );
  await db.transaction('rw', db.songCellRunThroughs, async () => {
    await db.songCellRunThroughs.bulkDelete(rows.map(r => r.id));
  });
  // eslint-disable-next-line no-console
  console.log(`[wipeRepertoireRunThroughsInRange] Done. Deleted ${rows.length}.`);
  return rows.length;
}

// ---------------------------------------------------------------------
// Per-module activity wipes (HF / ET / Shapes / Practice Consistency)
// ---------------------------------------------------------------------
//
// Each helper deletes within an inclusive [start, end] epoch-ms
// window, logs the rows it's about to remove, and returns the
// deleted count. Sync hooks propagate the deletes to Supabase the
// same as any other Dexie write. Production performanceHistory
// entries are NOT covered here — they live as array elements
// inside spacingState rows, which would require array-filtering
// rather than row deletion. Add a Production helper separately
// if/when needed.

/**
 * Delete db.attempts rows for moduleId='harmonic-fluency' within
 * the window. HF flashcard attempts only — does not touch ET.
 */
export async function wipeHFAttemptsInRange(
  start: number,
  end: number,
): Promise<number> {
  const rows = await db.attempts
    .where('moduleId').equals('harmonic-fluency')
    .filter(a => a.timestamp >= start && a.timestamp <= end)
    .toArray();
  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[wipeHFAttemptsInRange] No rows in range.');
    return 0;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[wipeHFAttemptsInRange] About to delete ${rows.length} row${rows.length === 1 ? '' : 's'}`,
    rows.map(r => ({
      id: r.id,
      when: new Date(r.timestamp).toLocaleString(),
      itemId: r.itemId,
      correct: r.correct,
    })),
  );
  await db.transaction('rw', db.attempts, async () => {
    await db.attempts.bulkDelete(rows.map(r => r.id!).filter((id): id is number => typeof id === 'number'));
  });
  // eslint-disable-next-line no-console
  console.log(`[wipeHFAttemptsInRange] Done. Deleted ${rows.length}.`);
  return rows.length;
}

/**
 * Delete db.attempts rows for any ET sub-module (intervals,
 * chord-recognition, chord-progressions, scales-modes) within the
 * window. Mirrors getWeeklyAttempts's ET dispatch (ET_MODULE_REFS).
 */
export async function wipeETAttemptsInRange(
  start: number,
  end: number,
): Promise<number> {
  const rows = await db.attempts
    .where('moduleId').anyOf(ET_MODULE_REFS as readonly string[] as string[])
    .filter(a => a.timestamp >= start && a.timestamp <= end)
    .toArray();
  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[wipeETAttemptsInRange] No rows in range.');
    return 0;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[wipeETAttemptsInRange] About to delete ${rows.length} row${rows.length === 1 ? '' : 's'}`,
    rows.map(r => ({
      id: r.id,
      when: new Date(r.timestamp).toLocaleString(),
      moduleId: r.moduleId,
      itemId: r.itemId,
      correct: r.correct,
    })),
  );
  await db.transaction('rw', db.attempts, async () => {
    await db.attempts.bulkDelete(rows.map(r => r.id!).filter((id): id is number => typeof id === 'number'));
  });
  // eslint-disable-next-line no-console
  console.log(`[wipeETAttemptsInRange] Done. Deleted ${rows.length}.`);
  return rows.length;
}

/**
 * Delete db.drillSessions rows in the window. Used by the Shapes
 * module — each row is one drill rep's worth of data.
 */
export async function wipeShapesDrillSessionsInRange(
  start: number,
  end: number,
): Promise<number> {
  const rows = await db.drillSessions
    .where('timestamp').between(start, end, true, true)
    .toArray();
  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[wipeShapesDrillSessionsInRange] No rows in range.');
    return 0;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[wipeShapesDrillSessionsInRange] About to delete ${rows.length} row${rows.length === 1 ? '' : 's'}`,
    rows.map(r => ({
      id: r.id,
      when: new Date(r.timestamp).toLocaleString(),
      drillTypeId: r.drillTypeId,
      skillId: r.skillId,
      durationSeconds: r.durationSeconds,
      feelRating: r.feelRating,
    })),
  );
  await db.transaction('rw', db.drillSessions, async () => {
    await db.drillSessions.bulkDelete(rows.map(r => r.id));
  });
  // eslint-disable-next-line no-console
  console.log(`[wipeShapesDrillSessionsInRange] Done. Deleted ${rows.length}.`);
  return rows.length;
}

/**
 * Delete db.practiceSessions rows whose startedAt falls in the
 * window. Practice Consistency module's source. Note: a session
 * that started inside the window but ran past `end` still gets
 * deleted (the index is on startedAt, matching how
 * getWeeklyAttempts counts them).
 */
export async function wipePracticeSessionsInRange(
  start: number,
  end: number,
): Promise<number> {
  const rows = await db.practiceSessions
    .where('startedAt').between(start, end, true, true)
    .toArray();
  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[wipePracticeSessionsInRange] No rows in range.');
    return 0;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[wipePracticeSessionsInRange] About to delete ${rows.length} row${rows.length === 1 ? '' : 's'}`,
    rows.map(r => ({
      id: r.id,
      startedAt: new Date(r.startedAt).toLocaleString(),
      plannedDurationMin: r.plannedDurationMin,
      actualDurationMin: r.actualDurationMin,
      context: r.context,
    })),
  );
  await db.transaction('rw', db.practiceSessions, async () => {
    await db.practiceSessions.bulkDelete(rows.map(r => r.id));
  });
  // eslint-disable-next-line no-console
  console.log(`[wipePracticeSessionsInRange] Done. Deleted ${rows.length}.`);
  return rows.length;
}

/**
 * One-shot: wipe every chord-shape drillSkill + its drillTypes +
 * drillSessions + shapes-and-patterns spacingState rows whose
 * itemRef starts with 'chord-shape:'. Used as a pre-step before
 * the Shapes inversion-tracking redesign rolls in — the new model
 * materialises one drillSkill row per (quality × key × inversion
 * state) where the old model had one row per (quality × key), so
 * the cleanest path is wipe-and-reseed rather than in-place
 * migration. Scale + voice-leading skills are untouched.
 *
 * Logs counts per table before deleting. Sync hooks propagate the
 * deletes to Supabase. Returns the per-table count summary.
 */
export async function wipeChordShapeCatalog(): Promise<{
  drillSkills: number;
  drillTypes: number;
  drillSessions: number;
  spacingState: number;
}> {
  // 1. drillSkills (chord-shape kind)
  const skills = await db.drillSkills.where('kind').equals('chord-shape').toArray();
  const skillIds = new Set(skills.map(s => s.id));

  // 2. drillTypes referencing those skills
  const types = skillIds.size === 0
    ? []
    : await db.drillTypes.where('skillId').anyOf([...skillIds]).toArray();

  // 3. drillSessions referencing those skills
  const sessions = skillIds.size === 0
    ? []
    : await db.drillSessions.where('skillId').anyOf([...skillIds]).toArray();

  // 4. spacingState chord-shape rows
  const allShapesSpacing = await db.spacingState
    .where('moduleRef').equals('shapes-and-patterns')
    .toArray();
  const chordSpacing = allShapesSpacing.filter(r => r.itemRef.startsWith('chord-shape:'));

  // eslint-disable-next-line no-console
  console.log('[wipeChordShapeCatalog] About to delete:', {
    drillSkills:   skills.length,
    drillTypes:    types.length,
    drillSessions: sessions.length,
    spacingState:  chordSpacing.length,
  });
  if (skills.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      '[wipeChordShapeCatalog] drillSkills sample:',
      skills.slice(0, 10).map(s => ({ id: s.id, label: s.label, quality: s.quality, keyName: s.keyName })),
    );
  }

  if (skills.length === 0 && chordSpacing.length === 0) {
    return { drillSkills: 0, drillTypes: 0, drillSessions: 0, spacingState: 0 };
  }

  await db.transaction(
    'rw',
    [db.drillSkills, db.drillTypes, db.drillSessions, db.spacingState],
    async () => {
      if (skills.length > 0)   await db.drillSkills.bulkDelete(skills.map(s => s.id));
      if (types.length > 0)    await db.drillTypes.bulkDelete(types.map(t => t.id));
      if (sessions.length > 0) await db.drillSessions.bulkDelete(sessions.map(s => s.id));
      if (chordSpacing.length > 0) {
        await db.spacingState.bulkDelete(chordSpacing.map(r => r.id));
      }
    },
  );

  // eslint-disable-next-line no-console
  console.log('[wipeChordShapeCatalog] Done. Cells will re-materialise on next tap.');
  return {
    drillSkills:   skills.length,
    drillTypes:    types.length,
    drillSessions: sessions.length,
    spacingState:  chordSpacing.length,
  };
}

/**
 * One-shot: clear every activity source in the window. Calls each
 * per-module helper sequentially so each one's pre-delete log is
 * visible in the console for audit. Returns a per-module count
 * summary.
 *
 * Out of scope: Production performanceHistory entries (live as
 * array elements inside spacingState rows; row-level deletion
 * doesn't fit). Add separately if needed.
 */
export async function wipeAllActivityInRange(
  start: number,
  end: number,
): Promise<{
  hf: number;
  et: number;
  shapes: number;
  repertoire: number;
  practiceSessions: number;
  total: number;
}> {
  // eslint-disable-next-line no-console
  console.log(
    '[wipeAllActivityInRange] window',
    new Date(start).toLocaleString(),
    '→',
    new Date(end).toLocaleString(),
    `(${start}–${end})`,
  );

  const hf = await wipeHFAttemptsInRange(start, end);
  const et = await wipeETAttemptsInRange(start, end);
  const shapes = await wipeShapesDrillSessionsInRange(start, end);
  const repertoire = await wipeRepertoireRunThroughsInRange(start, end);
  const practiceSessions = await wipePracticeSessionsInRange(start, end);

  const total = hf + et + shapes + repertoire + practiceSessions;
  // eslint-disable-next-line no-console
  console.log('[wipeAllActivityInRange] Summary:', {
    hf,
    et,
    shapes,
    repertoire,
    practiceSessions,
    total,
  });
  return { hf, et, shapes, repertoire, practiceSessions, total };
}

// ---------------------------------------------------------------------
// Weekly plan diagnostics
// ---------------------------------------------------------------------

/**
 * Mirror of `loadActiveMonthlyGoals` + `deriveWeeklyGoals` filter
 * chains, but emits a verdict for EVERY monthly goal in the db.
 * Use this when WeeklyPlan Part 2 shows empty despite the user
 * having monthly goals on the Goals page — the verdict log will
 * show the exact filter step that's dropping each one.
 *
 * Console:
 *
 *     await __diagnoseWeeklyPlan()
 *
 * Reports the active week-start, every monthly goal's filter
 * verdict, then the final derived weekly records (if any).
 */
function isConsistencyMetricLike(metric: string): boolean {
  return (
    metric.includes('_sessions_per_') ||
    metric.includes('_minutes_per_') ||
    metric.includes('_hours_per_') ||
    metric.includes('_days_per_') ||
    metric.startsWith('practice_')
  );
}

function classifyForDiagnosis(metric: string): string {
  if (isCoverageMetric(metric)) return 'coverage';
  if (metric === 'production_path_completion' || metric === 'production_lessons_count') {
    return 'completion';
  }
  if (metric === 'song_whole_at_level') return 'song';
  if (isConsistencyMetricLike(metric)) return 'consistency';
  return 'NULL (unrecognized — accuracy / mastery / proficiency / other)';
}

interface MonthlyVerdict {
  id: string;
  description: string;
  status: string;
  scope: string;
  isUmbrella: boolean;
  targetMetric: string | null;
  targetValue: number | null;
  startDateHuman: string;
  targetDateHuman: string;
  startDate: number;
  targetDate: number;
  /** Why the goal was kept or dropped — first failing filter wins. */
  verdict: string;
  /** True when the goal would become a weekly record. */
  willDerive: boolean;
}

export async function diagnoseWeeklyPlan(): Promise<{
  weekStart: number;
  weekEnd: number;
  verdicts: MonthlyVerdict[];
  derivedCount: number;
}> {
  const weekStart = startOfWeekLocal();
  const weekEnd = endOfWeekLocal(weekStart);

  // eslint-disable-next-line no-console
  console.log(
    '[diagnoseWeeklyPlan] this week',
    new Date(weekStart).toLocaleString(),
    '→',
    new Date(weekEnd).toLocaleString(),
  );

  const allGoals = await db.goals.toArray();
  const monthlies = allGoals.filter(g => g.scope === 'monthly');

  // eslint-disable-next-line no-console
  console.log(
    `[diagnoseWeeklyPlan] total goals in db: ${allGoals.length}, monthly: ${monthlies.length}`,
  );

  const verdicts: MonthlyVerdict[] = monthlies.map((g): MonthlyVerdict => {
    const base = {
      id: g.id,
      description: g.description,
      status: g.status,
      scope: g.scope,
      isUmbrella: g.isUmbrella,
      targetMetric: g.targetMetric,
      targetValue: g.targetValue,
      startDate: g.startDate,
      targetDate: g.targetDate,
      startDateHuman: new Date(g.startDate).toLocaleString(),
      targetDateHuman: new Date(g.targetDate).toLocaleString(),
    };
    // Mirror the filter chain in order. First failing step wins.
    if (g.status !== 'active') {
      return { ...base, verdict: `DROP: status=${g.status} (need 'active')`, willDerive: false };
    }
    if (g.isUmbrella) {
      return { ...base, verdict: 'DROP: umbrella (children handled directly)', willDerive: false };
    }
    if (!g.targetMetric) {
      return { ...base, verdict: 'DROP: targetMetric is null', willDerive: false };
    }
    if (g.startDate > weekEnd) {
      return {
        ...base,
        verdict: `DROP: startDate (${base.startDateHuman}) is after weekEnd (${new Date(weekEnd).toLocaleString()})`,
        willDerive: false,
      };
    }
    if (g.targetDate < weekStart) {
      return {
        ...base,
        verdict: `DROP: targetDate (${base.targetDateHuman}) already past weekStart (${new Date(weekStart).toLocaleString()})`,
        willDerive: false,
      };
    }
    const moduleId = moduleForMetric(g.targetMetric);
    if (!moduleId) {
      return { ...base, verdict: `DROP: moduleForMetric(${g.targetMetric}) returned null`, willDerive: false };
    }
    const kind = classifyForDiagnosis(g.targetMetric);
    if (kind.startsWith('NULL')) {
      return { ...base, verdict: `DROP: classifyMetric → ${kind}`, willDerive: false };
    }
    if ((g.targetValue ?? 0) <= 0 && kind !== 'song') {
      return {
        ...base,
        verdict: `DROP: targetValue=${g.targetValue} (≤0; only song goals tolerate this)`,
        willDerive: false,
      };
    }
    return {
      ...base,
      verdict: `KEEP: module=${moduleId}, kind=${kind}`,
      willDerive: true,
    };
  });

  // Print verdicts as a table for fast scanning.
  // eslint-disable-next-line no-console
  console.table(
    verdicts.map(v => ({
      description: v.description,
      status: v.status,
      isUmbrella: v.isUmbrella,
      targetMetric: v.targetMetric,
      targetValue: v.targetValue,
      startDate: v.startDateHuman,
      targetDate: v.targetDateHuman,
      verdict: v.verdict,
    })),
  );

  // Run the actual derivation and report what came back. Mirrors
  // loadActiveMonthlyGoals's overlap filter — startDate <= weekEnd
  // (not weekStart) so mid-week-created goals make it through to
  // deriveWeeklyGoals's mid-week proration branch.
  const candidates: Goal[] = monthlies.filter(g =>
    g.status === 'active' &&
    !g.isUmbrella &&
    g.targetMetric != null &&
    g.startDate <= weekEnd &&
    g.targetDate >= weekStart,
  );
  const derived = await deriveWeeklyGoals(candidates, weekStart);

  // eslint-disable-next-line no-console
  console.log(
    `[diagnoseWeeklyPlan] candidates (passed structural filter): ${candidates.length}`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `[diagnoseWeeklyPlan] deriveWeeklyGoals returned: ${derived.length} weekly record${derived.length === 1 ? '' : 's'}`,
  );
  if (derived.length > 0) {
    // eslint-disable-next-line no-console
    console.table(
      derived.map(g => ({
        description: g.description,
        targetValue: g.targetValue,
        targetUnit: g.targetUnit,
        parentGoalId: g.parentGoalId,
      })),
    );
  }

  return { weekStart, weekEnd, verdicts, derivedCount: derived.length };
}

if (typeof window !== 'undefined') {
  type W = {
    __inspectLastWeekActivity?: typeof inspectLastWeekActivity;
    __wipeRepertoireRunThroughsInRange?: typeof wipeRepertoireRunThroughsInRange;
    __wipeHFAttemptsInRange?: typeof wipeHFAttemptsInRange;
    __wipeETAttemptsInRange?: typeof wipeETAttemptsInRange;
    __wipeShapesDrillSessionsInRange?: typeof wipeShapesDrillSessionsInRange;
    __wipePracticeSessionsInRange?: typeof wipePracticeSessionsInRange;
    __wipeAllActivityInRange?: typeof wipeAllActivityInRange;
    __wipeChordShapeCatalog?: typeof wipeChordShapeCatalog;
    __diagnoseWeeklyPlan?: typeof diagnoseWeeklyPlan;
  };
  const w = window as unknown as W;
  w.__inspectLastWeekActivity = inspectLastWeekActivity;
  w.__wipeRepertoireRunThroughsInRange = wipeRepertoireRunThroughsInRange;
  w.__wipeHFAttemptsInRange = wipeHFAttemptsInRange;
  w.__wipeETAttemptsInRange = wipeETAttemptsInRange;
  w.__wipeShapesDrillSessionsInRange = wipeShapesDrillSessionsInRange;
  w.__wipePracticeSessionsInRange = wipePracticeSessionsInRange;
  w.__wipeAllActivityInRange = wipeAllActivityInRange;
  w.__wipeChordShapeCatalog = wipeChordShapeCatalog;
  w.__diagnoseWeeklyPlan = diagnoseWeeklyPlan;
}
