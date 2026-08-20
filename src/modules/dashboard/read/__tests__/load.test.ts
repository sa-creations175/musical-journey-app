/**
 * Assembly: which source feeds which catalog, and that every catalog
 * has one.
 *
 * The failure this is really guarding is the one that already happened
 * once — three modules with catalogs and no source wired, which renders
 * as an untouched module rather than as an error. `statsFor` throws on
 * an unwired catalog and these pin that every catalog is wired.
 */
import { describe, expect, it } from 'vitest';
import type {
  AttemptRecord, DrillSession, DrillSkill, ProductionLesson, SpacingState,
} from '../../../../lib/db';
import {
  assembleDashboard,
  dueRefsFrom,
  moduleItemTotals,
  type DashboardSource,
} from '../load';
import { STATIC_CATALOGS } from '../catalogs';
import { leavesOf } from '../tree';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function source(patch: Partial<DashboardSource> = {}): DashboardSource {
  return {
    attempts: [], drillSessions: [], drillSkills: [], spacingRows: [],
    lessons: [], lessonSessions: [],
    repertoire: {
      songs: [], sections: [], keys: [], cells: [], runThroughs: [], practiceLogs: [],
    },
    ...patch,
  };
}

describe('every catalog has a source wired', () => {
  it('assembles all eleven modules without throwing', () => {
    // statsFor throws by design on a catalog with no source. That is
    // the loud failure that replaces three modules quietly rendering
    // as untouched.
    const dashboard = assembleDashboard(source(), NOW);
    expect(dashboard.modules).toHaveLength(STATIC_CATALOGS.length + 1);
    expect(dashboard.modules.map(m => m.moduleId)).toContain('repertoire');
  });

  it('divides by the catalog, not by what is in the log', () => {
    // Empty source, full denominators.
    const totals = moduleItemTotals(assembleDashboard(source(), NOW));
    expect(totals).toMatchObject({
      'intervals': 26,
      'scales-modes': 18,
      'harmonic-fluency': 375,
      'reading': 188,
      'production': 199,
      'production-lessons': 56,
      'shapes-and-patterns': 1116,
      'mental-viz': 504,
      // 12 key-detection + 132 motion + 132 motion-first + 144
      // full-progression rows (69 chord + 69 pattern + 6 inversion,
      // inversion only on the slash progressions).
      'chord-progressions': 420,
    });
  });

  it('every module still divides by the catalog once data exists', () => {
    const withData = assembleDashboard(source({
      attempts: [{
        moduleId: 'scales-modes', itemId: 'ionian-tab1',
        correct: true, timestamp: NOW,
      } as AttemptRecord],
    }), NOW);
    const before = moduleItemTotals(assembleDashboard(source(), NOW));
    expect(moduleItemTotals(withData)).toEqual(before);
  });
});

describe('routing sources to catalogs', () => {
  it('sends attempts to the module whose id they carry, and nowhere else', () => {
    const dashboard = assembleDashboard(source({
      attempts: [{
        moduleId: 'reading', itemId: 'sig:0:major:name',
        correct: true, timestamp: NOW,
      } as AttemptRecord],
    }), NOW);
    const touched = dashboard.modules.filter(m => m.root.engagementCount > 0);
    expect(touched.map(m => m.moduleId)).toEqual(['reading']);
  });

  it('sends drill sessions to Shapes & Patterns, not mental viz', () => {
    // Both are self-rated and both live under shapes-and-patterns in
    // the app; only one reads drillSessions.
    const dashboard = assembleDashboard(source({
      drillSessions: [{
        id: 'd1', drillTypeId: 't', skillId: 's1', hand: 'both', style: 'solid',
        durationSeconds: 60, feelRating: 4, timestamp: NOW,
      } as DrillSession],
      drillSkills: [{
        id: 's1', kind: 'chord-shape', keyName: 'C', quality: 'maj',
        inversionState: 'root', createdAt: NOW,
      } as DrillSkill],
    }), NOW);
    const byId = new Map(dashboard.modules.map(m => [m.moduleId, m]));
    expect(byId.get('shapes-and-patterns')!.root.engagementCount).toBe(1);
    expect(byId.get('mental-viz')!.root.engagementCount).toBe(0);
  });

  it('sends mental-viz spacing rows to mental viz, not Shapes & Patterns', () => {
    const dashboard = assembleDashboard(source({
      spacingRows: [{
        id: 'x', itemRef: 'mv:triad:maj:root:C', moduleRef: 'mental-viz',
        hand: 'both', style: 'solid', memoryType: 'procedural',
        acquisitionStage: 'acquiring', currentIntervalDays: 0,
        lastEngagedAt: NOW, nextDueAt: null,
        performanceHistory: [{ t: NOW, kind: 'rating', rating: 'flying' }],
      } as unknown as SpacingState],
    }), NOW);
    const byId = new Map(dashboard.modules.map(m => [m.moduleId, m]));
    expect(byId.get('mental-viz')!.root.engagementCount).toBe(1);
    expect(byId.get('shapes-and-patterns')!.root.engagementCount).toBe(0);
  });

  it('sends lessons to production lessons, not production vocabulary', () => {
    // Two catalogs, two sourceIds, one module name. Getting this
    // backwards would put a lesson rating on a flashcard row.
    const dashboard = assembleDashboard(source({
      lessons: [{
        id: 'wf-01', pathId: 'workflow', order: 1, rating: 75,
        revisitCount: 1, lastOpenedAt: NOW, createdAt: NOW, updatedAt: NOW,
      } as ProductionLesson],
    }), NOW);
    const byId = new Map(dashboard.modules.map(m => [m.moduleId, m]));
    expect(byId.get('production-lessons')!.root.engagementCount).toBe(1);
    expect(byId.get('production')!.root.engagementCount).toBe(0);
  });

  it('builds the repertoire catalog from loaded rows', () => {
    const dashboard = assembleDashboard(source({
      repertoire: {
        songs: [{ id: 's1', title: 'A', artist: 'x', learningOrder: 1 }],
        sections: [
          { id: 'sec1', songId: 's1', name: 'Verse', displayOrder: 0, isArchived: false },
          { id: 'sec2', songId: 's1', name: 'Chorus', displayOrder: 1, isArchived: false },
        ],
        keys: [], cells: [], runThroughs: [], practiceLogs: [],
      } as unknown as DashboardSource['repertoire'],
    }), NOW);
    const rep = dashboard.modules.find(m => m.moduleId === 'repertoire')!;
    expect(rep.root.totalItems).toBe(2);
    expect(leavesOf(rep.root).map(n => n.label)).toEqual(['Verse', 'Chorus']);
  });
});

describe('dueRefsFrom', () => {
  it('is due when the review date has arrived', () => {
    const rows = [
      { itemRef: 'a', nextDueAt: NOW - DAY },
      { itemRef: 'b', nextDueAt: NOW },
      { itemRef: 'c', nextDueAt: NOW + DAY },
    ] as SpacingState[];
    expect([...dueRefsFrom(rows, NOW)].sort()).toEqual(['a', 'b']);
  });

  it('never-scheduled is not overdue', () => {
    // Treating a null nextDueAt as due would make the filter return
    // every untouched item in the catalog — the whole list.
    expect(dueRefsFrom([{ itemRef: 'a', nextDueAt: null }] as SpacingState[], NOW).size)
      .toBe(0);
  });

  it('feeds the filter from real refs, so unspaced modules contribute none', () => {
    const dashboard = assembleDashboard(source(), NOW);
    expect(dashboard.dueRefs.size).toBe(0);
  });
});
