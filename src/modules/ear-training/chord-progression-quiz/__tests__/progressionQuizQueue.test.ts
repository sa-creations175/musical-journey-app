import { describe, it, expect } from 'vitest';
import type { ChordFunction, ChordPlacement, Song, SongSection } from '../../../../lib/db';
import {
  distractorPoolFor,
  enumerateQuizItems,
  filterItemsBySong,
  orderQuizQueue,
  type ProgressionQuizItem,
} from '../progressionQuizQueue';
import { quizItemRef } from '../progressionQuiz';

function cf(fn: string, quality = ''): ChordFunction {
  return { function: fn, quality };
}

function song(id: string, over: Partial<Song> = {}): Song {
  return {
    id,
    title: id.toUpperCase(),
    artist: 'A',
    key: 'C',
    learningOrder: 1,
    audioLinks: [],
    addedDate: 0,
    ...over,
  };
}

function section(
  id: string,
  songId: string,
  chords: ChordFunction[],
  over: Partial<SongSection> = {},
): SongSection {
  const chordPlacements: ChordPlacement[] = chords.map((chord, i) => ({
    id: `${id}-p${i}`,
    arrangementId: 'basic',
    barIndex: i,
    beatPos: 0,
    beats: 4,
    chord,
  }));
  return { id, songId, name: 'Verse', order: 0, lyrics: '', chordPlacements, ...over };
}

/** Minimal item for testing the pure queue ordering in isolation. */
function mkItem(itemRef: string): ProgressionQuizItem {
  return {
    itemRef,
    type: 'recall',
    song: song('x'),
    section: section('x-v', 'x', [cf('1')]),
    prompt: '',
    chords: [],
    romanLine: '',
    signature: '',
    barCount: 0,
  };
}

const I_IV_V = [cf('1'), cf('4'), cf('5', '7')];
const ii_V_I = [cf('2', 'm'), cf('5', '7'), cf('1')];

// Non-mc types always apply to a charted section.
const NON_MC_TYPES = ['recall', 'barcount', 'transpose-scaffold', 'transpose-full'];

describe('enumerateQuizItems', () => {
  it('fans each charted section out to one item per applicable type', () => {
    const songs = [song('a')];
    const sections = [
      section('a-verse', 'a', I_IV_V),
      section('a-empty', 'a', []), // no chords → excluded
    ];
    const items = enumerateQuizItems(songs, sections);
    // Single song → no cross-song distractors → mc excluded → 4 types.
    expect(items).toHaveLength(4);
    expect(items.map(i => i.type).sort()).toEqual([...NON_MC_TYPES].sort());
    expect(new Set(items.map(i => i.section.id))).toEqual(new Set(['a-verse']));
    const recall = items.find(i => i.type === 'recall')!;
    expect(recall.itemRef).toBe(quizItemRef('a', 'a-verse', 'recall'));
    expect(recall.prompt).toBe('A — Verse');
    expect(recall.romanLine).toBe('I - IV - V7');
    expect(recall.barCount).toBe(3);
  });

  it('includes the mc type only when ≥3 distinct other-song progressions exist', () => {
    const songs = [
      song('a'),
      song('b', { learningOrder: 2 }),
      song('c', { learningOrder: 3 }),
      song('d', { learningOrder: 4 }),
    ];
    const sections = [
      section('a-v', 'a', [cf('1'), cf('4')]), // I - IV
      section('b-v', 'b', [cf('2', 'm'), cf('5', '7')]), // ii - V7
      section('c-v', 'c', [cf('1'), cf('5', '7')]), // I - V7
      section('d-v', 'd', [cf('6', 'm'), cf('4')]), // vi - IV
    ];
    const items = enumerateQuizItems(songs, sections);
    const aTypes = items.filter(i => i.section.id === 'a-v').map(i => i.type);
    expect(aTypes).toContain('mc'); // 3 distinct other-song lines
    expect(aTypes).toHaveLength(5);
  });

  it('skips sections whose song is missing', () => {
    const items = enumerateQuizItems([], [section('orphan', 'gone', I_IV_V)]);
    expect(items).toHaveLength(0);
  });
});

describe('orderQuizQueue', () => {
  it('puts unseen items first, then by due date ascending', () => {
    const a = mkItem('cpq:a:v:recall');
    const b = mkItem('cpq:b:v:recall');
    // a seen + due far future; b unseen → b leads.
    const ordered = orderQuizQueue([a, b], [{ itemRef: a.itemRef, nextDueAt: 9_999_999 }]);
    expect(ordered.map(i => i.itemRef)).toEqual([b.itemRef, a.itemRef]);
  });

  it('orders two seen items most-overdue first', () => {
    const a = mkItem('cpq:a:v:recall');
    const b = mkItem('cpq:b:v:recall');
    const ordered = orderQuizQueue([a, b], [
      { itemRef: a.itemRef, nextDueAt: 500 },
      { itemRef: b.itemRef, nextDueAt: 100 },
    ]);
    expect(ordered.map(i => i.itemRef)).toEqual([b.itemRef, a.itemRef]);
  });

  it('schedules each (section, type) row independently', () => {
    const items = enumerateQuizItems([song('a')], [section('a-v', 'a', I_IV_V)]);
    const recallRef = quizItemRef('a', 'a-v', 'recall');
    // Recall reviewed (due far out); the other types unseen → they lead.
    const ordered = orderQuizQueue(items, [{ itemRef: recallRef, nextDueAt: 9_999_999 }]);
    expect(ordered[ordered.length - 1].itemRef).toBe(recallRef);
    expect(ordered[0].itemRef).not.toBe(recallRef);
  });
});

describe('filterItemsBySong (song-filtered drill mode)', () => {
  const items = enumerateQuizItems(
    [song('a'), song('b', { learningOrder: 2 })],
    [
      section('a-v', 'a', I_IV_V),
      section('a-c', 'a', ii_V_I, { id: 'a-c', name: 'Chorus', order: 1 }),
      section('b-v', 'b', ii_V_I),
    ],
  );

  it('keeps only the target song’s sections (all their types), order preserved', () => {
    const walked = filterItemsBySong(items, 'a');
    expect(walked.every(i => i.song.id === 'a')).toBe(true);
    // Distinct section ids in encounter order.
    const distinctSections = [...new Set(walked.map(i => i.section.id))];
    expect(distinctSections).toEqual(['a-v', 'a-c']);
  });

  it('the full list still feeds cross-song distractors for the filtered queue', () => {
    const walked = filterItemsBySong(items, 'a');
    const pool = distractorPoolFor(walked[0], items);
    expect(pool).toEqual(['ii - V7 - I']); // song B's distinct line
  });

  it('returns empty when the song has no charted sections', () => {
    expect(filterItemsBySong(items, 'missing')).toEqual([]);
  });
});

describe('distractorPoolFor', () => {
  it('draws only from other songs and excludes the target line (deduped across types)', () => {
    const items = enumerateQuizItems(
      [song('a'), song('b', { learningOrder: 2 }), song('c', { learningOrder: 3 })],
      [
        section('a-v', 'a', I_IV_V), // target
        section('a-c', 'a', ii_V_I), // same song → excluded
        section('b-v', 'b', ii_V_I), // other song
        section('c-v', 'c', I_IV_V), // other song but SAME line as target → excluded
      ],
    );
    const target = items.find(i => i.itemRef === quizItemRef('a', 'a-v', 'recall'))!;
    const pool = distractorPoolFor(target, items);
    expect(pool).toEqual(['ii - V7 - I']); // only b's distinct other-song line
  });
});
