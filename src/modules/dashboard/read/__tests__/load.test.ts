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
import { leavesOf } from '../tree';
import { PRODUCTION_VOCAB_FLASHCARDS } from '../../../production/vocabularyFlashcards';

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
  it('assembles seven module rows, in nav-bar order', () => {
    // Ten catalogs, seven rows: ear training is four of them and
    // production is two. statsFor still throws on a catalog with no
    // source, which is the loud failure that replaces three modules
    // quietly rendering as untouched.
    //
    // The ORDER is the nav bar's, not the dashboard's to choose:
    // away-from-keyboard first, keyboard second.
    const dashboard = assembleDashboard(source(), NOW);
    expect(dashboard.modules.map(m => m.moduleId)).toEqual([
      'harmonic-fluency',
      'ear-training',
      'reading',
      'mental-viz',
      'shapes-and-patterns',
      'repertoire',
      'production',
    ]);
  });

  it('gives ear training its four submodules under one row', () => {
    const et = assembleDashboard(source(), NOW).modules
      .find(m => m.moduleId === 'ear-training')!;
    expect(et.root.children.map(c => c.label).sort()).toEqual([
      'chord progressions', 'chord recognition', 'intervals', 'scales & modes',
    ]);
  });

  it('gives production its two, and no redundant level', () => {
    // The lessons catalog used to render as its own module row with a
    // single "lessons" child under it.
    const prod = assembleDashboard(source(), NOW).modules
      .find(m => m.moduleId === 'production')!;
    expect(prod.root.children.map(c => c.label).sort())
      .toEqual(['lessons', 'vocabulary']);
  });

  it('reads as a dash where a module mixes measured and self-rated', () => {
    // Production holds a self-rated lessons branch beside a measured
    // vocabulary one. Averaging them produces a number that means
    // neither, so the module row shows a dash.
    //
    // BOTH BRANCHES NEED DATA. With an empty source neither is graded,
    // the row is null for lack of scores rather than for mixing them,
    // and the assertion would pass with the rule removed.
    const dashboard = assembleDashboard(source({
      lessons: [{
        id: 'wf-01', pathId: 'workflow', order: 1, rating: 100,
        revisitCount: 1, lastOpenedAt: NOW, createdAt: NOW, updatedAt: NOW,
      } as ProductionLesson],
      attempts: Array.from({ length: 5 }, (_, i) => ({
        moduleId: 'production',
        itemId: PRODUCTION_VOCAB_FLASHCARDS[0].id,
        correct: true,
        timestamp: NOW - i * 1000,
      } as AttemptRecord)),
    }), NOW);
    const prod = dashboard.modules.find(m => m.moduleId === 'production')!;

    // Each branch has a real, different score.
    const branch = (label: string) =>
      prod.root.children.find(c => c.label === label)!;
    expect(branch('lessons').score).toBe(100);
    expect(branch('vocabulary').score).toBe(100);
    expect(branch('lessons').accuracyKind).toBe('self-rated');
    expect(branch('vocabulary').accuracyKind).toBe('measured');

    // And the row above them still refuses to average across units.
    expect(prod.root.mixedKinds).toBe(true);
    expect(prod.root.score).toBeNull();
  });

  it('still rolls up a module whose branches agree about units', () => {
    // Guards the guard: ear training is four measured catalogs, so it
    // is NOT mixed and does produce a number.
    const dashboard = assembleDashboard(source({
      attempts: Array.from({ length: 6 }, (_, i) => ({
        moduleId: 'scales-modes', itemId: 'ionian-tab1',
        correct: true, timestamp: NOW - i * 1000,
      } as AttemptRecord)),
    }), NOW);
    const et = dashboard.modules.find(m => m.moduleId === 'ear-training')!;
    expect(et.root.mixedKinds).toBe(false);
    expect(et.root.score).toBe(100);
  });

  it('divides by the catalog, not by what is in the log', () => {
    // Empty source, full denominators.
    const totals = moduleItemTotals(assembleDashboard(source(), NOW));
    expect(totals).toMatchObject({
      'harmonic-fluency': 375,
      'reading': 188,
      'shapes-and-patterns': 1116,
      'mental-viz': 504,
      // 199 vocabulary cards + 56 lessons.
      'production': 255,
      // 26 intervals + 114 chord recognition + 18 scales & modes +
      // 420 chord progressions = 578.
      //   chord recognition: 30 chords, 6 triads x 3 inversions (18)
      //     plus 24 four-note chords x 4 inversions (96).
      //   chord progressions: 12 key-detection + 132 motion +
      //     132 motion-first + 144 full-progression rows (69 chord +
      //     69 pattern + 6 inversion, inversion only on the slash ones).
      'ear-training': 578,
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

  it('sends lessons to the lessons branch, not the vocabulary one', () => {
    // Two catalogs, two sourceIds, one module row. Getting this
    // backwards would put a lesson rating on a flashcard row.
    const dashboard = assembleDashboard(source({
      lessons: [{
        id: 'wf-01', pathId: 'workflow', order: 1, rating: 75,
        revisitCount: 1, lastOpenedAt: NOW, createdAt: NOW, updatedAt: NOW,
      } as ProductionLesson],
    }), NOW);
    const prod = dashboard.modules.find(m => m.moduleId === 'production')!;
    const branch = (label: string) =>
      prod.root.children.find(c => c.label === label)!;
    expect(branch('lessons').engagementCount).toBe(1);
    expect(branch('vocabulary').engagementCount).toBe(0);
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
