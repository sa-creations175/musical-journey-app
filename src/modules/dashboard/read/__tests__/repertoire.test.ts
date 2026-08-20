/**
 * Repertoire is the one module whose three columns come from three
 * different places, and the one whose section ids arrive from two
 * tables. These pin both.
 */
import { describe, expect, it } from 'vitest';
import type {
  Song, SongCellRunThrough, SongMatrixSection, SongPracticeLog,
} from '../../../../lib/db';
import {
  buildSectionIdResolver,
  repertoireCatalog,
  repertoireStats,
  sectionItemRef,
  type RepertoireData,
} from '../repertoire';
import { catalogItemCount } from '../catalogs';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function song(id: string, patch: Partial<Song> = {}): Song {
  return {
    id, title: `Song ${id}`, artist: 'x', learningOrder: 1, ...patch,
  } as Song;
}

function section(
  id: string, songId: string, patch: Partial<SongMatrixSection> = {},
): SongMatrixSection {
  return {
    id, songId, name: id, displayOrder: 0, isArchived: false,
    splitFromSectionId: null, createdAt: NOW, updatedAt: NOW, ...patch,
  } as SongMatrixSection;
}

function practice(patch: Partial<SongPracticeLog>): SongPracticeLog {
  return {
    id: `p-${Math.random()}`, songId: 's1', timestamp: NOW,
    durationMin: 30, sectionIds: [], keys: [], ...patch,
  } as SongPracticeLog;
}

function runThrough(patch: Partial<SongCellRunThrough>): SongCellRunThrough {
  return {
    id: `r-${Math.random()}`, cellId: 'c', songId: 's1', sectionId: 'sec1',
    songKeyId: 'k1', wasClean: true, tempoBpm: null, notes: null,
    createdAt: NOW, ...patch,
  } as SongCellRunThrough;
}

function data(patch: Partial<RepertoireData> = {}): RepertoireData {
  return {
    songs: [song('s1')],
    sections: [section('sec1', 's1'), section('sec2', 's1', { displayOrder: 1 })],
    keys: [], cells: [], runThroughs: [], practiceLogs: [],
    ...patch,
  };
}

describe('repertoireCatalog', () => {
  it('is one row per live section, and keys are not in it', () => {
    // No intention to learn every song in every key, so counting keys
    // would make songs incomparable.
    const catalog = repertoireCatalog(data());
    expect(catalogItemCount(catalog)).toBe(2);
    expect(catalog.items.map(i => i.label)).toEqual(['sec1', 'sec2']);
  });

  it('excludes archived sections', () => {
    // The matrix hides them; counting them would put rows in the
    // denominator that no surface offers a way to practise.
    const catalog = repertoireCatalog(data({
      sections: [section('sec1', 's1'), section('sec2', 's1', { isArchived: true })],
    }));
    expect(catalogItemCount(catalog)).toBe(1);
  });

  it('drops sections whose song is gone', () => {
    const catalog = repertoireCatalog(data({ songs: [] }));
    expect(catalogItemCount(catalog)).toBe(0);
  });

  it('reads as measured — clean or not is an outcome, not a self-report', () => {
    expect(repertoireCatalog(data()).accuracyKind).toBe('measured');
  });
});

describe('section id resolution — two tables, one row', () => {
  it('accepts a matrix id and a lead-sheet id for the same row', () => {
    // The cell modal logs matrix ids; the song-level practice modal
    // logs lead-sheet ids. Both must land on the same tree row.
    const resolve = buildSectionIdResolver([
      section('m1', 's1', { songSectionId: 'lead-1' }),
    ]);
    expect(resolve('m1')).toBe('m1');
    expect(resolve('lead-1')).toBe('m1');
  });

  it('returns undefined for a legacy row the reconciler has not stamped', () => {
    // Better a section missing some practice than a number attached to
    // the wrong section.
    const resolve = buildSectionIdResolver([section('m1', 's1')]);
    expect(resolve('lead-1')).toBeUndefined();
  });

  it('credits practice logged against a lead-sheet id', () => {
    const { stats } = repertoireStats(data({
      sections: [section('sec1', 's1', { songSectionId: 'lead-1' })],
      practiceLogs: [practice({ sectionIds: ['lead-1'] })],
    }));
    expect(stats[0].engagementCount).toBe(1);
  });
});

describe('coverage reads practice', () => {
  it('needs three sessions touching the section', () => {
    const logs = [0, 1, 2].map(i =>
      practice({ sectionIds: ['sec1'], timestamp: NOW - i * DAY }));
    const { stats } = repertoireStats(data({ practiceLogs: logs.slice(0, 2) }));
    expect(stats.find(s => s.itemRef === sectionItemRef('sec1'))!.covered).toBe(false);

    const { stats: full } = repertoireStats(data({ practiceLogs: logs }));
    expect(full.find(s => s.itemRef === sectionItemRef('sec1'))!.covered).toBe(true);
  });

  it('credits every section when a session names none', () => {
    // "40 minutes, couldn't tell you which sections" is a complete
    // record, and the player did play the whole song.
    const logs = [0, 1, 2].map(i => practice({ timestamp: NOW - i * DAY }));
    const { stats } = repertoireStats(data({ practiceLogs: logs }));
    expect(stats.every(s => s.covered)).toBe(true);
    expect(stats).toHaveLength(2);
  });

  it('does not let practice touch another song s sections', () => {
    const { stats } = repertoireStats(data({
      songs: [song('s1'), song('s2', { learningOrder: 2 })],
      sections: [section('sec1', 's1'), section('sec2', 's2')],
      practiceLogs: [practice({ songId: 's1' })],
    }));
    expect(stats.find(s => s.itemRef === sectionItemRef('sec1'))!.engagementCount).toBe(1);
    expect(stats.find(s => s.itemRef === sectionItemRef('sec2'))!.engagementCount).toBe(0);
  });
});

describe('accuracy reads test, not practice', () => {
  it('scores clean run-throughs and ignores practice entirely', () => {
    const { stats } = repertoireStats(data({
      practiceLogs: [practice({ sectionIds: ['sec1'] })],
      runThroughs: [
        runThrough({ sectionId: 'sec1', wasClean: true }),
        runThrough({ sectionId: 'sec1', wasClean: false, createdAt: NOW + 1 }),
      ],
    }));
    const row = stats.find(s => s.itemRef === sectionItemRef('sec1'))!;
    // Two graded run-throughs, one clean.
    expect(row.windowTotal).toBe(2);
    expect(row.score).toBe(50);
    // Three engagements total: the practice session counts for
    // coverage and recency but carries no grade.
    expect(row.engagementCount).toBe(3);
    expect(row.excludedByReason['not-graded']).toBe(1);
  });

  it('shows a dash, not 0%, for a section practised but never tested', () => {
    // The failure this prevents: a section you have worked on for weeks
    // reading as 0% because nobody has run it at tempo yet.
    const { stats } = repertoireStats(data({
      practiceLogs: [0, 1, 2].map(i =>
        practice({ sectionIds: ['sec1'], timestamp: NOW - i * DAY })),
    }));
    const row = stats.find(s => s.itemRef === sectionItemRef('sec1'))!;
    expect(row.score).toBeNull();
    expect(row.covered).toBe(true);
  });

  it('aggregates run-throughs across every key into the one section row', () => {
    const { stats } = repertoireStats(data({
      runThroughs: [
        runThrough({ sectionId: 'sec1', songKeyId: 'k1', wasClean: true }),
        runThrough({ sectionId: 'sec1', songKeyId: 'k2', wasClean: true, createdAt: NOW + 1 }),
      ],
    }));
    expect(stats.find(s => s.itemRef === sectionItemRef('sec1'))!.windowTotal).toBe(2);
  });
});

describe('recency reads both', () => {
  it('takes the latest of practice and test', () => {
    const { stats } = repertoireStats(data({
      runThroughs: [runThrough({ sectionId: 'sec1', createdAt: NOW - 10 * DAY })],
      practiceLogs: [practice({ sectionIds: ['sec1'], timestamp: NOW - DAY })],
    }));
    // Practising without testing still means you touched it.
    expect(stats.find(s => s.itemRef === sectionItemRef('sec1'))!.lastAt).toBe(NOW - DAY);
  });
});

describe('stale data', () => {
  it('ignores run-throughs against archived sections', () => {
    const { stats } = repertoireStats(data({
      sections: [section('sec1', 's1'), section('sec2', 's1', { isArchived: true })],
      runThroughs: [runThrough({ sectionId: 'sec2' })],
    }));
    expect(stats).toHaveLength(1);
    expect(stats[0].engagementCount).toBe(0);
  });
});
