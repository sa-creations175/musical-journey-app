import { describe, it, expect } from 'vitest';
import type {
  ChordFunction,
  ChordPlacement,
  Song,
  SongSection,
} from '../../../../lib/db';
import {
  CHORD_PROGRESSION_QUIZ_MODULE_REF,
  PRACTICE_KEYS,
  buildBarCountOptions,
  buildProgressionChoices,
  collapseProgression,
  concreteLine,
  degreeColor,
  hasChartData,
  mostCompleteArrangementId,
  parseQuizItemRef,
  pickDisplayKey,
  pickTransposeKey,
  progressionSignature,
  quizItemRef,
  ratingFromCorrectness,
  romanLine,
  sectionBarCount,
  sectionChords,
} from '../progressionQuiz';

// --- fixtures --------------------------------------------------------

function cf(fn: string, quality = ''): ChordFunction {
  return { function: fn, quality };
}

function makeSong(over: Partial<Song> = {}): Song {
  return {
    id: 'song-1',
    title: 'Test Song',
    artist: 'Tester',
    key: 'C',
    learningOrder: 1,
    audioLinks: [],
    addedDate: 0,
    ...over,
  };
}

/** Section with one chord per bar (full-bar placements, 4/4). */
function makeSection(chords: ChordFunction[], over: Partial<SongSection> = {}): SongSection {
  const chordPlacements: ChordPlacement[] = chords.map((chord, i) => ({
    id: `p${i}`,
    arrangementId: 'basic',
    barIndex: i,
    beatPos: 0,
    beats: 4,
    chord,
  }));
  return {
    id: 'sec-1',
    songId: 'song-1',
    name: 'Verse',
    order: 0,
    lyrics: '',
    chordPlacements,
    ...over,
  };
}

// I - vi - ii - V7  (functional 1, 6m, 2m, 5(7))
const IViiiV: ChordFunction[] = [cf('1'), cf('6', 'm'), cf('2', 'm'), cf('5', '7')];

// --- item identity ---------------------------------------------------

describe('quiz item identity', () => {
  it('builds and parses cpq:<songId>:<sectionId>:<type> (per-type rows)', () => {
    const ref = quizItemRef('song-1', 'sec-1', 'transpose-full');
    expect(ref).toBe('cpq:song-1:sec-1:transpose-full');
    expect(parseQuizItemRef(ref)).toEqual({
      songId: 'song-1',
      sectionId: 'sec-1',
      type: 'transpose-full',
    });
  });

  it('each type yields a distinct ref for the same section (no collision)', () => {
    const refs = ['recall', 'mc', 'barcount', 'transpose-scaffold', 'transpose-full'].map(t =>
      quizItemRef('s', 'sec', t as never),
    );
    expect(new Set(refs).size).toBe(5);
  });

  it('rejects non-matching refs', () => {
    expect(parseQuizItemRef('mv:triad:maj:root:C')).toBeNull();
    expect(parseQuizItemRef('cpq:song-1')).toBeNull();
    expect(parseQuizItemRef('cpq::sec:recall')).toBeNull();
    expect(parseQuizItemRef('cpq:song-1:sec-1')).toBeNull(); // legacy 3-part
    expect(parseQuizItemRef('cpq:song-1:sec-1:bogus')).toBeNull(); // unknown type
  });

  it('module ref is the reserved placeholder ref', () => {
    expect(CHORD_PROGRESSION_QUIZ_MODULE_REF).toBe('chord-progression-quiz');
  });
});

describe('most-complete arrangement selection', () => {
  it('picks the arrangement with the most charted chords', () => {
    const section: SongSection = {
      id: 'sec', songId: 'song-1', name: 'V', order: 0, lyrics: '',
      arrangements: [{ id: 'basic', name: 'Basic' }, { id: 'jazz', name: 'Jazz' }],
      chordPlacements: [
        { id: 'a', arrangementId: 'basic', barIndex: 0, beatPos: 0, beats: 4, chord: cf('1') },
        { id: 'b', arrangementId: 'jazz', barIndex: 0, beatPos: 0, beats: 4, chord: cf('1') },
        { id: 'c', arrangementId: 'jazz', barIndex: 1, beatPos: 0, beats: 4, chord: cf('4') },
        { id: 'd', arrangementId: 'jazz', barIndex: 2, beatPos: 0, beats: 4, chord: cf('5', '7') },
      ],
    };
    expect(mostCompleteArrangementId(section)).toBe('jazz');
  });

  it('breaks ties to the earliest-created arrangement', () => {
    const section: SongSection = {
      id: 'sec', songId: 'song-1', name: 'V', order: 0, lyrics: '',
      arrangements: [{ id: 'basic', name: 'Basic' }, { id: 'alt', name: 'Alt' }],
      chordPlacements: [
        { id: 'a', arrangementId: 'basic', barIndex: 0, beatPos: 0, beats: 4, chord: cf('1') },
        { id: 'b', arrangementId: 'alt', barIndex: 0, beatPos: 0, beats: 4, chord: cf('4') },
      ],
    };
    expect(mostCompleteArrangementId(section)).toBe('basic'); // earlier in arrangements
  });
});

describe('pickTransposeKey', () => {
  it('never returns the song’s own key, and stays in the practice set', () => {
    for (let i = 0; i < 20; i++) {
      const k = pickTransposeKey('C', () => i / 20);
      expect(k).not.toBe('C');
      expect(PRACTICE_KEYS).toContain(k);
    }
  });
});

describe('pickDisplayKey (Type 1 rotating reveal key)', () => {
  it('stays within PRACTICE_KEYS plus the song’s own key', () => {
    const allowed = new Set([...PRACTICE_KEYS, 'B']);
    for (let i = 0; i < 20; i++) {
      expect(allowed.has(pickDisplayKey('B', () => i / 20))).toBe(true);
    }
  });

  it('CAN return the song’s own key (unlike transpose)', () => {
    // 'B' isn't in PRACTICE_KEYS, so it's appended last; rng→1 lands on it.
    expect(pickDisplayKey('B', () => 0.999)).toBe('B');
  });
});

describe('degreeColor', () => {
  it('colors by scale degree (root vs others differ)', () => {
    const root = degreeColor(cf('1'));
    const fourth = degreeColor(cf('4'));
    expect(root).toMatch(/^#/);
    expect(root).not.toBe(fourth);
  });
});

// --- extraction ------------------------------------------------------

describe('progression extraction', () => {
  it('reads the section chords in bar order', () => {
    const chords = sectionChords(makeSong(), makeSection(IViiiV));
    expect(chords.map(c => c.function)).toEqual(['1', '6', '2', '5']);
  });

  it('counts bars from the derived grid', () => {
    expect(sectionBarCount(makeSong(), makeSection(IViiiV))).toBe(4);
  });

  it('hasChartData is false for an empty section, true once chords exist', () => {
    expect(hasChartData(makeSong(), makeSection([]))).toBe(false);
    expect(hasChartData(makeSong(), makeSection(IViiiV))).toBe(true);
  });
});

// --- display lines ---------------------------------------------------

describe('display lines', () => {
  it('renders Roman numerals (case from quality)', () => {
    expect(romanLine(IViiiV)).toBe('I - vi - ii - V7');
  });

  it('renders concrete chords for the song key', () => {
    expect(concreteLine(IViiiV, 'C')).toBe('C - Am - Dm - G7');
    // Same functional progression, different key.
    expect(concreteLine(IViiiV, 'F')).toBe('F - Dm - Gm - C7');
  });

  it('collapses consecutive repeats into one harmonic step', () => {
    const withRepeats = [cf('1'), cf('1'), cf('4'), cf('4'), cf('5', '7')];
    expect(collapseProgression(withRepeats).map(c => c.function)).toEqual(['1', '4', '5']);
    expect(romanLine(withRepeats)).toBe('I - IV - V7');
  });

  it('progressionSignature is key-independent and ignores repeats', () => {
    expect(progressionSignature(IViiiV)).toBe(progressionSignature([...IViiiV, cf('5', '7')]));
  });
});

// --- Type 2: multiple choice -----------------------------------------

describe('buildProgressionChoices', () => {
  const rng: () => number = () => 0; // deterministic

  it('returns the correct line plus 3 distinct distractors', () => {
    const { options, correctIndex } = buildProgressionChoices(
      'I - vi - ii - V7',
      ['ii - V - I', 'I - IV - V', 'I - V - vi - IV', 'vi - IV - I - V'],
      rng,
    );
    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4); // all distinct
    expect(options[correctIndex]).toBe('I - vi - ii - V7');
  });

  it('drops distractors equal to the answer (no same-progression options)', () => {
    const { options } = buildProgressionChoices(
      'I - IV - V',
      ['I - IV - V', 'I - IV - V', 'ii - V - I', 'vi - IV - I - V'],
      rng,
    );
    expect(options.filter(o => o === 'I - IV - V')).toHaveLength(1);
  });

  it('comes back short when the pool has fewer than 3 distinct distractors', () => {
    const { options } = buildProgressionChoices('I - IV - V', ['ii - V - I'], rng);
    expect(options.length).toBeLessThan(4);
  });
});

// --- Type 4: bar count -----------------------------------------------

describe('buildBarCountOptions', () => {
  const rng: () => number = () => 0;

  it('returns 4 distinct positive options including the correct count', () => {
    const { options, correctIndex } = buildBarCountOptions(8, rng);
    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4);
    expect(options.every(n => n > 0)).toBe(true);
    expect(options[correctIndex]).toBe(8);
  });

  it('still yields 3 distractors for a tiny correct count', () => {
    const { options, correctIndex } = buildBarCountOptions(2, rng);
    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4);
    expect(options[correctIndex]).toBe(2);
  });
});

// --- rating pre-fill -------------------------------------------------

describe('ratingFromCorrectness', () => {
  it('correct → flying, incorrect → crawling', () => {
    expect(ratingFromCorrectness(true)).toBe('flying');
    expect(ratingFromCorrectness(false)).toBe('crawling');
  });
});
