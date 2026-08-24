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
import { MENTAL_VIZ_ITEMS } from '../../../shapes-and-patterns/mentalVizLibrary';

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
  it('assembles six module rows, in nav-bar order', () => {
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
      'shapes-and-patterns',
      'repertoire',
      'production',
    ]);
  });

  it('gives ear training its four submodules under one row', () => {
    const et = assembleDashboard(source(), NOW).modules
      .find(m => m.moduleId === 'ear-training')!;
    expect(et.root.children.map(c => c.label).sort()).toEqual([
      'Chord Progressions', 'Chord Recognition', 'Intervals', 'Scales & Modes',
    ]);
  });

  it('gives production its two, and no redundant level', () => {
    // The lessons catalog used to render as its own module row with a
    // single "lessons" child under it.
    const prod = assembleDashboard(source(), NOW).modules
      .find(m => m.moduleId === 'production')!;
    expect(prod.root.children.map(c => c.label).sort())
      .toEqual(['Lessons', 'Vocabulary']);
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
    expect(branch('Lessons').score).toBe(100);
    expect(branch('Vocabulary').score).toBe(100);
    expect(branch('Lessons').accuracyKind).toBe('self-rated');
    expect(branch('Vocabulary').accuracyKind).toBe('measured');

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
      'harmonic-fluency': 550,
      'reading': 188,
      // 720 chord shapes + 96 scales + 372 voice-leading. Mental
      // visualisation's 504 are a submodule of this row and are
      // deliberately NOT in the total — see the exclusion test below.
      'shapes-and-patterns': 1188,
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

  it('sends drill sessions to the S&P branches, not the mental-viz one', () => {
    // Both are self-rated and both live under shapes-and-patterns; only
    // one reads drillSessions.
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
    const sp = dashboard.modules.find(m => m.moduleId === 'shapes-and-patterns')!;
    const mv = sp.root.children.find(c => c.label === 'Mental Visualisation')!;
    expect(sp.root.engagementCount).toBe(1);
    expect(mv.engagementCount).toBe(0);
  });

  it('sends mental-viz spacing rows to the mental-viz branch', () => {
    const dashboard = assembleDashboard(source({
      spacingRows: [{
        id: 'x', itemRef: 'mv:triad:maj:root:C', moduleRef: 'mental-viz',
        hand: 'both', style: 'solid', memoryType: 'procedural',
        acquisitionStage: 'acquiring', currentIntervalDays: 0,
        lastEngagedAt: NOW, nextDueAt: null,
        performanceHistory: [{ t: NOW, kind: 'rating', rating: 'flying' }],
      } as unknown as SpacingState],
    }), NOW);
    const sp = dashboard.modules.find(m => m.moduleId === 'shapes-and-patterns')!;
    const mv = sp.root.children.find(c => c.label === 'Mental Visualisation')!;
    expect(mv.engagementCount).toBe(1);
    // Excluded from the module's totals, so the S&P row's own count
    // does not move.
    expect(sp.root.engagementCount).toBe(0);
  });

  it('keeps mental visualisation out of S&P coverage and score', () => {
    // THE APRIL 27 RULE. Mental viz is a submodule with real numbers,
    // and none of them feed the row above. Both branches need data or
    // the assertion passes for want of scores rather than for the rule.
    const dashboard = assembleDashboard(source({
      spacingRows: [{
        id: 'x', itemRef: MENTAL_VIZ_ITEMS[0].itemRef, moduleRef: 'mental-viz',
        hand: 'both', style: 'solid', memoryType: 'procedural',
        acquisitionStage: 'acquiring', currentIntervalDays: 0,
        lastEngagedAt: NOW, nextDueAt: null,
        performanceHistory: Array.from({ length: 4 }, (_, i) => ({
          t: NOW - i * 1000, kind: 'rating', rating: 'flying',
        })),
      } as unknown as SpacingState],
      // S&P's own branch practised 30 days ago; mental viz today. If
      // recency did not roll up from an excluded child, the module row
      // would read as 30 days stale while the player drilled it this
      // morning.
      drillSessions: Array.from({ length: 4 }, (_, i) => ({
        id: `d${i}`, drillTypeId: 't', skillId: 's1', hand: 'both', style: 'solid',
        durationSeconds: 60, feelRating: 1, timestamp: NOW - 30 * DAY - i * 1000,
      } as DrillSession)),
      drillSkills: [{
        id: 's1', kind: 'chord-shape', keyName: 'C', quality: 'maj',
        inversionState: 'root', createdAt: NOW,
      } as DrillSkill],
    }), NOW);
    const sp = dashboard.modules.find(m => m.moduleId === 'shapes-and-patterns')!;
    const mv = sp.root.children.find(c => c.label === 'Mental Visualisation')!;

    // The submodule has its own real numbers.
    expect(mv.score).toBe(100);
    expect(mv.coveredItems).toBe(1);
    expect(mv.totalItems).toBe(504);

    // And none of them reach the module row, whose own chord-shape
    // branch scored 25 and covered one of 1188.
    expect(sp.root.totalItems).toBe(1188);
    expect(sp.root.coveredItems).toBe(1);
    expect(sp.root.score).toBe(25);

    // Recency DOES roll up: practising mental viz is practising, so
    // the module row reads as touched today rather than 30 days stale.
    expect(mv.recency.mostRecentAt).toBe(NOW);
    expect(sp.root.recency.mostRecentAt).toBe(NOW);
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
    expect(branch('Lessons').engagementCount).toBe(1);
    expect(branch('Vocabulary').engagementCount).toBe(0);
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
