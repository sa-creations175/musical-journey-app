// Scales & Modes catalog — 9 modes with scale intervals, vamps,
// descriptions, and song examples. Data-only: audio/quiz/tracker code
// derives everything from here.

export type ModeId =
  | 'ionian'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'aeolian'
  | 'harmonic-minor'
  | 'melodic-minor'
  | 'locrian';

/** ET tier-progression stage. Stage 1 = the seven church modes
 *  (always available once CR T1 clears); Stage 2 = harmonic + melodic
 *  minor (unlocked when every Stage 1 mode hits ≥10 attempts +
 *  ≥75% accuracy). Cross-submodule gate lives in
 *  scaleModeTierUnlock.ts. */
export type ScaleModeStage = 1 | 2;

export const MAX_SCALE_MODE_STAGE: ScaleModeStage = 2;

export interface SongExample {
  title: string;
  artist: string;
  year?: number;
}

export interface Mode {
  id: ModeId;
  name: string;
  /** ET tier-progression stage. Stage 1 = the seven church modes;
   *  Stage 2 = harmonic + melodic minor. Drives scaleModeTierUnlock.ts. */
  stage: ScaleModeStage;
  /** Major-scale position (1-7) for church modes. For harmonic/melodic
   *  minor we use 8/9 so they sort after the church modes in parent-scale
   *  view. */
  parentScalePosition: number;
  /** 1 = brightest, 9 = darkest. Used by brightness sort and fluency color. */
  brightnessRank: number;
  /** Semitones from tonic, including upper octave. 8 notes for diatonic
   *  modes (7 pitches + octave). */
  scaleIntervals: number[];
  /** e.g. "♯4", "♭2", "♭6 ♭7 raised back to 6 7 ascending". Short. */
  signatureAlteration: string;
  quickDefinition: string;
  characteristicChords: string[];
  /** Longer "emotional character" description used on cards and reveals. */
  starterDescription: string;
  /** Song examples drawn from the user's listening taste. */
  songExamples: SongExample[];
  /**
   * =====================================================================
   * `vamp` WAS HERE, AND IT RETIRED ON 10 SEP 2026.
   *
   * Every mode carried a built-in loop — chords, a bass line and a
   * melody, written by the app — and the Sit Inside drill played it.
   * Silas ruled them out: the point of sitting inside a mode is to sit
   * inside a sound you know from a song, and a Dorian loop nobody had
   * played is not that.
   *
   * A mode now plays only what he has RECORDED and TAGGED with it, in
   * Chord Movements & Passes. Until a mode has one, it plays nothing
   * and says so. See `movements/movementTag.ts`.
   *
   * NO HISTORY WAS TOUCHED. The modes themselves are still live items,
   * so nothing is orphaned; the ear-training sweep keys on the mode id
   * and finds every one of them exactly where it was.
   * =====================================================================
   */
}

// Standard reference: semitone offsets from tonic for a two-octave span.
// Kept here for clarity — mode.scaleIntervals re-encode these per mode.

export const MODES: Mode[] = [
  // ------------------------------------------------------------------
  // IONIAN (major)
  // ------------------------------------------------------------------
  {
    id: 'ionian',
    name: 'Ionian',
    stage: 1,
    parentScalePosition: 1,
    brightnessRank: 2,
    scaleIntervals: [0, 2, 4, 5, 7, 9, 11, 12],
    signatureAlteration: 'none — the major scale',
    quickDefinition: '1st mode of major scale — the plain major scale.',
    characteristicChords: ['Imaj7', 'IVmaj7', 'V'],
    starterDescription:
      'Bright, resolved, open. The home of most pop songs, worship ballads, and traditional R&B. Your ear\'s "default" — what feels most familiar as "home."',
    songExamples: [
      { title: 'Isn\'t It a Pity', artist: 'George Harrison', year: 1970 },
      { title: 'Lovely Day', artist: 'Bill Withers', year: 1977 },
      { title: 'All of Me', artist: 'John Legend', year: 2013 },
      { title: 'Let It Be', artist: 'The Beatles', year: 1970 },
    ],
  },

  // ------------------------------------------------------------------
  // DORIAN
  // ------------------------------------------------------------------
  {
    id: 'dorian',
    name: 'Dorian',
    stage: 1,
    parentScalePosition: 2,
    brightnessRank: 5,
    scaleIntervals: [0, 2, 3, 5, 7, 9, 10, 12],
    signatureAlteration: 'raised 6 (♮6 against a minor key)',
    quickDefinition: '2nd mode of major scale — minor with a raised 6.',
    characteristicChords: ['i7', 'IV7', 'im6'],
    starterDescription:
      'Melancholic but hopeful. Minor with a brightness — that raised 6 gives it a warm quality underneath the sadness. Hear it in "So What" (Miles Davis), D\'Angelo\'s "Untitled (How Does It Feel)," and a lot of neo-soul atmospheres.',
    songExamples: [
      { title: 'So What', artist: 'Miles Davis', year: 1959 },
      { title: 'Untitled (How Does It Feel)', artist: 'D\'Angelo', year: 2000 },
      { title: 'Impressions', artist: 'John Coltrane', year: 1963 },
      { title: 'Mas Que Nada', artist: 'Sérgio Mendes', year: 1966 },
    ],
  },

  // ------------------------------------------------------------------
  // PHRYGIAN
  // ------------------------------------------------------------------
  {
    id: 'phrygian',
    name: 'Phrygian',
    stage: 1,
    parentScalePosition: 3,
    brightnessRank: 8,
    scaleIntervals: [0, 1, 3, 5, 7, 8, 10, 12],
    signatureAlteration: 'flat 2 (♭2)',
    quickDefinition: '3rd mode of major scale — minor with a ♭2 right above the tonic.',
    characteristicChords: ['im', '♭II'],
    starterDescription:
      'Dark, exotic, Spanish. The flat 2 gives it that immediate tension right above the tonic — you hear it in flamenco, some hip-hop beats with eastern flavor, and dramatic minor passages.',
    songExamples: [
      { title: 'Hit the Road Jack', artist: 'Ray Charles', year: 1961 },
      { title: 'Wherever I May Roam', artist: 'Metallica', year: 1991 },
      { title: 'Flamenco guitar traditions', artist: 'Various' },
      { title: 'Pyramid Song', artist: 'Radiohead', year: 2001 },
    ],
  },

  // ------------------------------------------------------------------
  // LYDIAN
  // ------------------------------------------------------------------
  {
    id: 'lydian',
    name: 'Lydian',
    stage: 1,
    parentScalePosition: 4,
    brightnessRank: 1,
    scaleIntervals: [0, 2, 4, 6, 7, 9, 11, 12],
    signatureAlteration: 'sharp 4 (♯4)',
    quickDefinition: '4th mode of major scale — major with a raised 4.',
    characteristicChords: ['Imaj7', 'Imaj7♯11', 'II/I'],
    starterDescription:
      'Dreamy, floating, cinematic. The raised 4 creates that magical "lift" — no tension to resolve, just atmosphere. Hear it in D\'Angelo\'s "Playa Playa," Tom Misch\'s atmospheric sections, and film score moments that feel otherworldly.',
    songExamples: [
      { title: 'Playa Playa', artist: 'D\'Angelo', year: 2000 },
      { title: 'Dreams', artist: 'Fleetwood Mac', year: 1977 },
      { title: 'The Simpsons theme', artist: 'Danny Elfman', year: 1989 },
      { title: 'Flying in a Blue Dream', artist: 'Joe Satriani', year: 1989 },
    ],
  },

  // ------------------------------------------------------------------
  // MIXOLYDIAN
  // ------------------------------------------------------------------
  {
    id: 'mixolydian',
    name: 'Mixolydian',
    stage: 1,
    parentScalePosition: 5,
    brightnessRank: 3,
    scaleIntervals: [0, 2, 4, 5, 7, 9, 10, 12],
    signatureAlteration: 'flat 7 (♭7)',
    quickDefinition: '5th mode of major scale — major with a ♭7.',
    characteristicChords: ['I7', '♭VII', 'IV'],
    starterDescription:
      'Bluesy, gospel, funky. Major scale with a flat 7 — that ♭7 is what gives gospel and blues their signature feel. Hear it in Stevie Wonder\'s "Isn\'t She Lovely," gospel backdoor cadences, and most funk tonic chords.',
    songExamples: [
      { title: 'Isn\'t She Lovely', artist: 'Stevie Wonder', year: 1976 },
      { title: 'Sweet Child O\' Mine', artist: 'Guns N\' Roses', year: 1987 },
      { title: 'Norwegian Wood', artist: 'The Beatles', year: 1965 },
      { title: 'Cissy Strut', artist: 'The Meters', year: 1969 },
    ],
  },

  // ------------------------------------------------------------------
  // AEOLIAN
  // ------------------------------------------------------------------
  {
    id: 'aeolian',
    name: 'Aeolian',
    stage: 1,
    parentScalePosition: 6,
    brightnessRank: 6,
    scaleIntervals: [0, 2, 3, 5, 7, 8, 10, 12],
    signatureAlteration: 'flat 3, flat 6, flat 7 — natural minor',
    quickDefinition: '6th mode of major scale — the natural minor scale.',
    characteristicChords: ['im', '♭VI', '♭VII'],
    starterDescription:
      'Sad, introspective, classic minor. The natural minor scale. Traditional minor-key ballads live here — think classic soul ballads, darker hip-hop, some Snoh Aalegra tracks.',
    songExamples: [
      { title: 'Losing You', artist: 'Solange', year: 2012 },
      { title: 'I Want You', artist: 'Snoh Aalegra', year: 2019 },
      { title: 'Stairway to Heaven (intro)', artist: 'Led Zeppelin', year: 1971 },
      { title: 'Billie Jean', artist: 'Michael Jackson', year: 1982 },
    ],
  },

  // ------------------------------------------------------------------
  // HARMONIC MINOR
  // ------------------------------------------------------------------
  {
    id: 'harmonic-minor',
    name: 'Harmonic minor',
    stage: 2,
    parentScalePosition: 8,
    brightnessRank: 7,
    scaleIntervals: [0, 2, 3, 5, 7, 8, 11, 12],
    signatureAlteration: 'raised 7 (♮7) over a natural minor',
    quickDefinition: 'Natural minor with a raised 7 — the leading tone pulls back to the tonic.',
    characteristicChords: ['im(maj7)', 'V7', '♭VI'],
    starterDescription:
      'Dark, dramatic, with Middle Eastern flavor. Natural minor with a raised 7 — that raised 7 creates a sharp pull back to the tonic, giving harmonic minor its signature tension. Essential for jazz minor and some dramatic gospel resolutions.',
    songExamples: [
      { title: 'Misirlou', artist: 'Dick Dale', year: 1962 },
      { title: 'Smooth Criminal', artist: 'Michael Jackson', year: 1987 },
      { title: 'Black Orpheus', artist: 'Luiz Bonfá', year: 1959 },
      { title: 'Purple Rain (solo)', artist: 'Prince', year: 1984 },
    ],
  },

  // ------------------------------------------------------------------
  // MELODIC MINOR
  // ------------------------------------------------------------------
  {
    id: 'melodic-minor',
    name: 'Melodic minor',
    stage: 2,
    parentScalePosition: 9,
    brightnessRank: 4,
    scaleIntervals: [0, 2, 3, 5, 7, 9, 11, 12],
    signatureAlteration: 'raised 6 and raised 7 (ascending form)',
    quickDefinition: 'Minor scale with raised 6 and raised 7 ascending — a sophisticated jazz-minor sound.',
    characteristicChords: ['im(maj7)', 'IV7', 'V7'],
    starterDescription:
      'Sophisticated minor, jazz-flavored. Raised 6 and 7 ascending — brings brightness to a minor tonality without losing the minor character. Lives in jazz standards and sophisticated minor ballads.',
    songExamples: [
      { title: 'Yesterday', artist: 'The Beatles', year: 1965 },
      { title: 'In a Sentimental Mood', artist: 'Duke Ellington', year: 1935 },
      { title: 'My Funny Valentine', artist: 'Chet Baker', year: 1952 },
      { title: 'Blue in Green', artist: 'Miles Davis', year: 1959 },
    ],
  },

  // ------------------------------------------------------------------
  // LOCRIAN
  // ------------------------------------------------------------------
  {
    id: 'locrian',
    name: 'Locrian',
    stage: 1,
    parentScalePosition: 7,
    brightnessRank: 9,
    scaleIntervals: [0, 1, 3, 5, 6, 8, 10, 12],
    signatureAlteration: 'flat 2 and flat 5',
    quickDefinition: '7th mode of major scale — minor with ♭2 and ♭5 (diminished tonic).',
    characteristicChords: ['im7♭5', 'ø7'],
    starterDescription:
      'Unresolved, unstable, rare. Minor with a flat 2 and flat 5 — the diminished tonic makes it hard to use as a true tonal center. More interesting theoretically than practically; you\'ll rarely encounter this as a song\'s home mode.',
    songExamples: [
      { title: 'YYZ (passages)', artist: 'Rush', year: 1981 },
      { title: 'Army of Me', artist: 'Björk', year: 1995 },
      { title: 'Juicy Fruit (passages)', artist: 'Mtume', year: 1983 },
      { title: 'Symbolic', artist: 'Death', year: 1995 },
    ],
  },
];

export const MODE_IDS: ModeId[] = MODES.map(m => m.id);

export function modeById(id: string): Mode | undefined {
  return MODES.find(m => m.id === id);
}

export type ModeSortOrder = 'brightness' | 'parentScale';

export function sortModes(sort: ModeSortOrder): Mode[] {
  const arr = [...MODES];
  if (sort === 'brightness') {
    arr.sort((a, b) => a.brightnessRank - b.brightnessRank);
  } else {
    arr.sort((a, b) => a.parentScalePosition - b.parentScalePosition);
  }
  return arr;
}

/**
 * Given a mode and a desired number of plausible decoys, returns decoy
 * modes that are musically confusable with the target. For quiz MCQs.
 * Uses a simple "near in brightness" heuristic plus parallel-relationship
 * neighbors (Ionian ↔ Mixolydian; Aeolian ↔ Dorian ↔ Phrygian, etc.).
 */
export function pickDecoys(target: Mode, count: number, rng: () => number = Math.random): Mode[] {
  const others = MODES.filter(m => m.id !== target.id);
  // Weight each decoy by how close its brightness rank is to the target,
  // so neighboring moods come up more often than distant ones.
  const weighted = others.map(m => ({
    mode: m,
    weight: 1 / (1 + Math.abs(m.brightnessRank - target.brightnessRank)),
  }));
  const picked: Mode[] = [];
  const pool = [...weighted];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const total = pool.reduce((s, w) => s + w.weight, 0);
    let r = rng() * total;
    let idx = 0;
    for (let j = 0; j < pool.length; j++) {
      r -= pool[j].weight;
      if (r <= 0) { idx = j; break; }
    }
    picked.push(pool[idx].mode);
    pool.splice(idx, 1);
  }
  return picked;
}
