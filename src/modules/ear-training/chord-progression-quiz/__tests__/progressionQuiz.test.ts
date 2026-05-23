import { describe, it, expect } from 'vitest';
import type {
  ChordFunction,
  ChordPlacement,
  Song,
  SongSection,
} from '../../../../lib/db';
import {
  CHORD_PROGRESSION_QUIZ_MODULE_REF,
  buildBarCountOptions,
  buildProgressionChoices,
  collapseProgression,
  concreteLine,
  hasChartData,
  parseQuizItemRef,
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
  it('builds and parses cpq:<songId>:<sectionId>', () => {
    const ref = quizItemRef('song-1', 'sec-1');
    expect(ref).toBe('cpq:song-1:sec-1');
    expect(parseQuizItemRef(ref)).toEqual({ songId: 'song-1', sectionId: 'sec-1' });
  });

  it('rejects non-matching refs', () => {
    expect(parseQuizItemRef('mv:triad:maj:root:C')).toBeNull();
    expect(parseQuizItemRef('cpq:song-1')).toBeNull();
    expect(parseQuizItemRef('cpq::sec')).toBeNull();
  });

  it('module ref is the reserved placeholder ref', () => {
    expect(CHORD_PROGRESSION_QUIZ_MODULE_REF).toBe('chord-progression-quiz');
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
