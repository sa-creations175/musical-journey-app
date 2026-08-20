/**
 * Assembling every module tree from stored data.
 *
 * Split in two on purpose:
 *
 *   `assembleDashboard` is PURE - loaded rows in, trees out. Everything
 *   about which source feeds which catalog lives here and is testable
 *   without a database.
 *
 *   `loadDashboardSource` is the only part that touches Dexie, and it
 *   does nothing but read. One pass, no joins, no filtering; the
 *   filtering is the pure half's job.
 *
 * The split is what lets the interesting half be tested at all. It also
 * means a caller that already has the rows - a test, a future export,
 * the session generator - can assemble without a second read.
 */
import {
  db,
  type AttemptRecord,
  type DrillSession,
  type DrillSkill,
  type ProductionLesson,
  type ProductionLessonSession,
  type SpacingState,
} from '../../../lib/db';
import { statsForAttemptCatalog, statsForCatalog } from './adapters';
import {
  STATIC_CATALOGS,
  mentalVizCatalog,
  productionLessonsCatalog,
  shapesCatalog,
  type ModuleCatalog,
} from './catalogs';
import type { ItemStats } from './itemStats';
import type { ModuleTree } from './query';
import {
  mentalVizEngagements,
  productionLessonEngagements,
  shapesEngagements,
} from './selfRated';
import { repertoireCatalog, repertoireEngagements, type RepertoireData } from './repertoire';
import { buildModuleTree } from './tree';

/** Everything the dashboard reads, loaded once. */
export interface DashboardSource {
  attempts: ReadonlyArray<AttemptRecord>;
  drillSessions: ReadonlyArray<DrillSession>;
  drillSkills: ReadonlyArray<DrillSkill>;
  spacingRows: ReadonlyArray<SpacingState>;
  lessons: ReadonlyArray<ProductionLesson>;
  lessonSessions: ReadonlyArray<ProductionLessonSession>;
  repertoire: RepertoireData;
}

export interface Dashboard {
  modules: ModuleTree[];
  /**
   * Stored refs the spacing algorithm considers due, for the due
   * filter. Modules that write no spacing state contribute nothing,
   * which is why the filter simply returns nothing from them rather
   * than every row needing a dash.
   */
  dueRefs: Set<string>;
}

/**
 * Catalogs whose signal is `db.attempts`, keyed by the `moduleId` those
 * attempts carry.
 *
 * Every other static catalog reads somewhere else entirely and is
 * dispatched explicitly below. Listing them rather than inferring means
 * a new catalog with no source wired fails loudly in `assembleDashboard`
 * instead of quietly rendering as an untouched module - which is
 * exactly how Shapes & Patterns, mental visualisation and production
 * lessons went unnoticed until the UI was about to be built.
 */
const ATTEMPT_DRIVEN_SOURCE_IDS: ReadonlySet<string> = new Set([
  'intervals',
  'chord-recognition',
  'chord-progressions',
  'scales-modes',
  'harmonic-fluency',
  'reading',
  // Production VOCABULARY. Lessons carry sourceId 'production-lessons'
  // and are self-rated.
  'production',
]);

/**
 * NOTE on harmonic fluency, the one module whose per-card signal exists
 * in two places. `HarmonicFluencySession` writes a normal attempt row
 * AND a `flashcardStates` row carrying lifetime totals. The attempts are
 * the finer record - one row per answer, with timestamps - so they are
 * what this reads. `snapshotHarmonicFluency` in aggregation.ts reads the
 * state rows instead and reconstructs a FAKE 20-attempt window from
 * lifetime accuracy (RULE_LEGIBILITY 1.8): the badge reads "fluent"
 * identically to a real rolling-window tier and is not one. That is the
 * weaker source and it dies with the old dashboard.
 */

function statsFor(catalog: ModuleCatalog, source: DashboardSource): ItemStats[] {
  if (ATTEMPT_DRIVEN_SOURCE_IDS.has(catalog.sourceId)) {
    return statsForAttemptCatalog(
      catalog,
      source.attempts.filter(a => a.moduleId === catalog.sourceId),
    );
  }
  if (catalog.sourceId === shapesCatalog.sourceId) {
    return statsForCatalog(
      catalog,
      shapesEngagements(source.drillSessions, source.drillSkills),
    );
  }
  if (catalog.sourceId === mentalVizCatalog.sourceId) {
    return statsForCatalog(catalog, mentalVizEngagements(source.spacingRows));
  }
  if (catalog.sourceId === productionLessonsCatalog.sourceId) {
    return statsForCatalog(
      catalog,
      productionLessonEngagements(source.lessons, source.lessonSessions),
    );
  }
  throw new Error(
    `dashboard: catalog "${catalog.sourceId}" has no source wired. `
    + 'Add it to ATTEMPT_DRIVEN_SOURCE_IDS or dispatch it in statsFor.',
  );
}

/**
 * Every module tree, in display order.
 *
 * `now` is passed rather than read so the result is deterministic; it
 * only feeds the due set.
 */
export function assembleDashboard(
  source: DashboardSource,
  now: number,
): Dashboard {
  const modules: ModuleTree[] = STATIC_CATALOGS.map(catalog => ({
    moduleId: catalog.sourceId,
    moduleLabel: catalog.label,
    root: buildModuleTree(catalog, statsFor(catalog, source)),
  }));

  // Repertoire's catalog is Dexie rows rather than a constant, so it is
  // built from the loaded data instead of imported.
  const repCatalog = repertoireCatalog(source.repertoire);
  modules.push({
    moduleId: repCatalog.sourceId,
    moduleLabel: repCatalog.label,
    root: buildModuleTree(
      repCatalog,
      statsForCatalog(repCatalog, repertoireEngagements(source.repertoire)),
    ),
  });

  return { modules, dueRefs: dueRefsFrom(source.spacingRows, now) };
}

/**
 * Refs whose next review has arrived.
 *
 * A row with a null `nextDueAt` is NOT due. Never-scheduled is not
 * overdue - it means the spacing layer has nothing to say about this
 * item yet, and treating that as due would make the filter return
 * every untouched item in the catalog, which is the whole list.
 */
export function dueRefsFrom(
  rows: ReadonlyArray<SpacingState>,
  now: number,
): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (row.nextDueAt !== null && row.nextDueAt <= now) out.add(row.itemRef);
  }
  return out;
}

/** Sanity check for the whole assembly: how many items each module
 *  divides by. Exported so a caller can log or assert it without
 *  re-walking every tree. */
export function moduleItemTotals(dashboard: Dashboard): Record<string, number> {
  const out: Record<string, number> = {};
  for (const module of dashboard.modules) out[module.moduleId] = module.root.totalItems;
  return out;
}

// =====================================================================
// The only part that touches Dexie
// =====================================================================

/**
 * One read pass. Deliberately unfiltered: narrowing here would mean
 * duplicating each adapter's idea of what it needs, and the tables are
 * small - 46 attempts total at the time of writing, and the largest
 * catalog is 1116 items.
 *
 * If this ever gets slow the fix is per-table `where` clauses, not
 * caching - a cached dashboard that disagrees with the drill you just
 * finished is worse than a slow one.
 */
export async function loadDashboardSource(): Promise<DashboardSource> {
  const [
    attempts, drillSessions, drillSkills, spacingRows,
    lessons, lessonSessions,
    songs, sections, keys, cells, runThroughs, practiceLogs,
  ] = await Promise.all([
    db.attempts.toArray(),
    db.drillSessions.toArray(),
    db.drillSkills.toArray(),
    db.spacingState.toArray(),
    db.productionLessons.toArray(),
    db.productionLessonSessions.toArray(),
    db.songs.toArray(),
    db.songMatrixSections.toArray(),
    db.songKeys.toArray(),
    db.songCells.toArray(),
    db.songCellRunThroughs.toArray(),
    db.songPracticeLog.toArray(),
  ]);
  return {
    attempts,
    drillSessions,
    drillSkills,
    spacingRows,
    lessons,
    lessonSessions,
    repertoire: { songs, sections, keys, cells, runThroughs, practiceLogs },
  };
}

/** Load and assemble in one call. */
export async function loadDashboard(now: number = Date.now()): Promise<Dashboard> {
  return assembleDashboard(await loadDashboardSource(), now);
}
