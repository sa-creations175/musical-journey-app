import { describe, it, expect } from 'vitest';
import type { ChordFunction, ChordPlacement, Song, SongSection } from '../../../../lib/db';
import {
  distractorPoolFor,
  enumerateQuizItems,
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

const I_IV_V = [cf('1'), cf('4'), cf('5', '7')];
const ii_V_I = [cf('2', 'm'), cf('5', '7'), cf('1')];

describe('enumerateQuizItems', () => {
  it('builds one item per section that has chart data', () => {
    const songs = [song('a')];
    const sections = [
      section('a-verse', 'a', I_IV_V),
      section('a-empty', 'a', []), // no chords → excluded
    ];
    const items = enumerateQuizItems(songs, sections);
    expect(items).toHaveLength(1);
    expect(items[0].itemRef).toBe(quizItemRef('a', 'a-verse'));
    expect(items[0].prompt).toBe('A — Verse');
    expect(items[0].romanLine).toBe('I - IV - V7');
    expect(items[0].barCount).toBe(3);
  });

  it('skips sections whose song is missing', () => {
    const items = enumerateQuizItems([], [section('orphan', 'gone', I_IV_V)]);
    expect(items).toHaveLength(0);
  });
});

describe('orderQuizQueue', () => {
  const items = enumerateQuizItems(
    [song('a'), song('b', { learningOrder: 2 })],
    [section('a-v', 'a', I_IV_V), section('b-v', 'b', ii_V_I)],
  );

  it('puts unseen items first, then by due date ascending', () => {
    const aRef = quizItemRef('a', 'a-v');
    const bRef = quizItemRef('b', 'b-v');
    // a is seen + due far in the future; b is unseen → b should lead.
    const ordered = orderQuizQueue(items, [{ itemRef: aRef, nextDueAt: 9_999_999 }]);
    expect(ordered[0].itemRef).toBe(bRef); // unseen leads
    expect(ordered[1].itemRef).toBe(aRef);
  });

  it('orders two seen items most-overdue first', () => {
    const aRef = quizItemRef('a', 'a-v');
    const bRef = quizItemRef('b', 'b-v');
    const ordered = orderQuizQueue(items, [
      { itemRef: aRef, nextDueAt: 500 },
      { itemRef: bRef, nextDueAt: 100 },
    ]);
    expect(ordered.map(i => i.itemRef)).toEqual([bRef, aRef]);
  });
});

describe('distractorPoolFor', () => {
  it('draws only from other songs and excludes the target line', () => {
    const items: ProgressionQuizItem[] = enumerateQuizItems(
      [song('a'), song('b', { learningOrder: 2 }), song('c', { learningOrder: 3 })],
      [
        section('a-v', 'a', I_IV_V), // target
        section('a-c', 'a', ii_V_I), // same song → excluded
        section('b-v', 'b', ii_V_I), // other song
        section('c-v', 'c', I_IV_V), // other song but SAME line as target → excluded
      ],
    );
    const target = items.find(i => i.itemRef === quizItemRef('a', 'a-v'))!;
    const pool = distractorPoolFor(target, items);
    expect(pool).toEqual(['ii - V7 - I']); // only b's distinct other-song line
  });
});
