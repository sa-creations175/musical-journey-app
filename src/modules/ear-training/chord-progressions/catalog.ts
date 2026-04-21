// Full Chord Progressions catalog — 8 tiers, ~60 named progressions.
// Data-only: quiz/playback/tracker code derives everything from here.

export type ChordQuality =
  | 'major'
  | 'minor'
  | 'dominant'
  | 'diminished'
  | 'half-dim'
  | 'augmented';

export interface SongExample {
  title: string;
  artist: string;
  year?: number;
}

export interface Progression {
  id: string;
  name: string;
  numerals: string[];
  scaleDegrees: number[];
  chordQualities: ChordQuality[];
  tier: number;
  tierName: string;
  isMustKnow: boolean;
  loopDefault: boolean;
  durationPattern: number[];
  theoryNote?: string;
  songExamples: SongExample[];
  /**
   * When true, dominant-function chords are voiced as at least dom7
   * regardless of the global complexity setting — some progressions
   * structurally depend on the tritone / dom7 sound (jazz blues, rhythm
   * changes, minor-key turnarounds, funk vamps, etc.).
   */
  requiresDominant?: boolean;
}

export const TIER_NAMES: Record<number, string> = {
  1: 'Foundational',
  2: 'Gospel & R&B',
  3: 'Modern Pop & R&B',
  4: 'Jazz Standards',
  5: 'Neo-Soul & Modern R&B',
  6: 'Blues & Funk',
  7: 'Latin, Bossa, World',
  8: 'Hip-Hop & Sampled Loops',
};

// Quick helper to keep catalog entries short. Defaults durationPattern to
// all-1s when not specified.
function mk(p: Omit<Progression, 'tierName' | 'durationPattern'> & { durationPattern?: number[] }): Progression {
  return {
    ...p,
    tierName: TIER_NAMES[p.tier],
    durationPattern: p.durationPattern ?? p.numerals.map(() => 1),
  };
}

export const PROGRESSIONS: Progression[] = [
  // ============================================================
  // Tier 1 — Foundational
  // ============================================================
  mk({
    id: '1-4-5', name: 'The 1-4-5',
    numerals: ['I', 'IV', 'V', 'I'], scaleDegrees: [0, 3, 4, 0],
    chordQualities: ['major', 'major', 'dominant', 'major'],
    tier: 1, isMustKnow: true, loopDefault: false,
    songExamples: [
      { title: 'Various 12-bar blues', artist: 'Standard' },
      { title: 'Classic gospel hymns', artist: 'Traditional' },
      { title: 'Stand By Me', artist: 'Ben E. King', year: 1961 },
    ],
  }),
  mk({
    id: '1-5-6-4', name: 'The 1-5-6-4',
    numerals: ['I', 'V', 'vi', 'IV'], scaleDegrees: [0, 4, 5, 3],
    chordQualities: ['major', 'dominant', 'minor', 'major'],
    tier: 1, isMustKnow: true, loopDefault: false,
    songExamples: [
      { title: 'No Woman No Cry', artist: 'Bob Marley', year: 1974 },
      { title: 'All of Me', artist: 'John Legend', year: 2013 },
      { title: 'Hero (chorus)', artist: 'Mariah Carey', year: 1993 },
    ],
  }),
  mk({
    id: '1-6-4-5', name: 'The 1-6-4-5',
    numerals: ['I', 'vi', 'IV', 'V'], scaleDegrees: [0, 5, 3, 4],
    chordQualities: ['major', 'minor', 'major', 'dominant'],
    tier: 1, isMustKnow: true, loopDefault: false,
    songExamples: [
      { title: 'Stand By Me', artist: 'Ben E. King', year: 1961 },
      { title: 'Endless Love', artist: 'Lionel Richie & Diana Ross', year: 1981 },
    ],
  }),
  mk({
    id: '6-4-1-5', name: 'The 6-4-1-5',
    numerals: ['vi', 'IV', 'I', 'V'], scaleDegrees: [5, 3, 0, 4],
    chordQualities: ['minor', 'major', 'major', 'dominant'],
    tier: 1, isMustKnow: true, loopDefault: false,
    songExamples: [
      { title: 'Apologize', artist: 'OneRepublic', year: 2006 },
      { title: 'Stay With Me', artist: 'Sam Smith', year: 2014 },
    ],
  }),
  mk({
    id: '1-6-2-5', name: 'The 1-6-2-5',
    numerals: ['I', 'vi', 'ii', 'V'], scaleDegrees: [0, 5, 1, 4],
    chordQualities: ['major', 'minor', 'minor', 'dominant'],
    tier: 1, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'Heart and Soul', artist: 'Standard', year: 1938 },
      { title: 'Gospel turnaround vamps', artist: 'Various' },
    ],
  }),
  mk({
    id: '2-5-1', name: 'The 2-5-1',
    numerals: ['ii', 'V', 'I'], scaleDegrees: [1, 4, 0],
    chordQualities: ['minor', 'dominant', 'major'],
    tier: 1, isMustKnow: true, loopDefault: false,
    requiresDominant: true,
    songExamples: [
      { title: 'Misty', artist: 'Erroll Garner', year: 1954 },
      { title: 'Autumn Leaves', artist: 'Joseph Kosma', year: 1945 },
    ],
  }),
  mk({
    id: '12-bar-blues', name: 'The 12-bar blues',
    numerals: ['I', 'I', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'],
    scaleDegrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4],
    chordQualities: ['dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant'],
    tier: 1, isMustKnow: true, loopDefault: true,
    durationPattern: [4, 4, 4, 4, 2, 2, 2, 2, 1, 1, 1, 1],
    songExamples: [
      { title: 'Foundational blues across all artists', artist: 'Various' },
    ],
  }),

  // ============================================================
  // Tier 2 — Gospel & R&B
  // ============================================================
  mk({
    id: '1-4-vamp', name: 'The 1-4 vamp',
    numerals: ['I', 'IV', 'I', 'IV'], scaleDegrees: [0, 3, 0, 3],
    chordQualities: ['major', 'major', 'major', 'major'],
    tier: 2, isMustKnow: false, loopDefault: true,
    songExamples: [
      { title: 'Take Me to the King', artist: 'Tamela Mann', year: 2012 },
      { title: 'Kirk Franklin vamps', artist: 'Kirk Franklin' },
      { title: 'Jesus', artist: 'Fred Hammond' },
    ],
  }),
  mk({
    id: 'gospel-walk-up', name: 'The gospel walk-up',
    numerals: ['I', 'II', 'iii', 'IV'], scaleDegrees: [0, 1, 2, 3],
    chordQualities: ['major', 'major', 'minor', 'major'],
    tier: 2, isMustKnow: true, loopDefault: false,
    songExamples: [
      { title: 'Oh Happy Day', artist: 'Edwin Hawkins', year: 1969 },
      { title: 'Now Behold the Lamb', artist: 'Kirk Franklin' },
    ],
  }),
  mk({
    id: 'gospel-walk-down', name: 'The gospel walk-down',
    numerals: ['I', 'VII', 'vi', 'V'], scaleDegrees: [0, 6, 5, 4],
    chordQualities: ['major', 'major', 'minor', 'dominant'],
    tier: 2, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'A Change Is Gonna Come', artist: 'Sam Cooke', year: 1964 },
      { title: 'John P. Kee ballad arrangements', artist: 'John P. Kee' },
    ],
  }),
  mk({
    id: 'backdoor', name: 'The backdoor',
    numerals: ['I', 'IV', 'bVII', 'I'], scaleDegrees: [0, 3, 6, 0],
    chordQualities: ['major', 'major', 'major', 'major'],
    tier: 2, isMustKnow: false, loopDefault: false,
    theoryNote: 'The bVII is borrowed from the parallel minor — specifically Mixolydian mode. This substitution creates a warm, gospel-infused lift that feels resolved but not predictable.',
    songExamples: [
      { title: 'I Wish', artist: 'Stevie Wonder', year: 1976 },
      { title: "Isn't She Lovely (bridge)", artist: 'Stevie Wonder', year: 1976 },
    ],
  }),
  mk({
    id: '6-2-5-1', name: 'The 6-2-5-1',
    numerals: ['vi', 'ii', 'V', 'I'], scaleDegrees: [5, 1, 4, 0],
    chordQualities: ['minor', 'minor', 'dominant', 'major'],
    tier: 2, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'A Song For You', artist: 'Donny Hathaway', year: 1971 },
      { title: 'Misty', artist: 'Erroll Garner', year: 1954 },
      { title: 'The Way', artist: 'Mariah Carey' },
    ],
  }),
  mk({
    id: '4-5-3-6', name: 'The 4-5-3-6',
    numerals: ['IV', 'V', 'iii', 'vi'], scaleDegrees: [3, 4, 2, 5],
    chordQualities: ['major', 'dominant', 'minor', 'minor'],
    tier: 2, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'Knocks Me Off My Feet', artist: 'Stevie Wonder', year: 1976 },
      { title: 'Jazmine Sullivan bridges', artist: 'Jazmine Sullivan' },
    ],
  }),
  mk({
    id: '1-3-4', name: 'The 1-3-4',
    numerals: ['I', 'iii', 'IV'], scaleDegrees: [0, 2, 3],
    chordQualities: ['major', 'minor', 'major'],
    tier: 2, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'Shackles', artist: 'Mary Mary', year: 2000 },
      { title: 'Ex-Factor (feel)', artist: 'Lauryn Hill', year: 1998 },
    ],
  }),
  mk({
    id: '1-5-4', name: 'The 1-5-4',
    numerals: ['I', 'V', 'IV'], scaleDegrees: [0, 4, 3],
    chordQualities: ['major', 'dominant', 'major'],
    tier: 2, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'Simple gospel resolution', artist: 'Various' },
      { title: 'Worship ballads & R&B intros', artist: 'Various' },
    ],
  }),
  mk({
    id: 'plagal-vamp', name: 'Plagal vamp',
    numerals: ['IV', 'I', 'IV', 'I'], scaleDegrees: [3, 0, 3, 0],
    chordQualities: ['major', 'major', 'major', 'major'],
    tier: 2, isMustKnow: false, loopDefault: true,
    songExamples: [
      { title: 'Amen cadence feel', artist: 'Traditional' },
      { title: 'Kirk Franklin endings', artist: 'Kirk Franklin' },
    ],
  }),
  mk({
    id: '6-4-5', name: 'The 6-4-5',
    numerals: ['vi', 'IV', 'V'], scaleDegrees: [5, 3, 4],
    chordQualities: ['minor', 'major', 'dominant'],
    tier: 2, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'Killing Me Softly', artist: 'Roberta Flack', year: 1973 },
    ],
  }),
  mk({
    id: 'gospel-1-b3-4', name: 'The gospel 1-b3-4',
    numerals: ['I', 'bIII', 'IV'], scaleDegrees: [0, 2, 3],
    chordQualities: ['major', 'major', 'major'],
    tier: 2, isMustKnow: false, loopDefault: false,
    theoryNote: 'The bIII is borrowed from parallel minor. Creates a bluesy, churchy color — you\'ll hear this in gospel modulations and soul bridges.',
    songExamples: [
      { title: 'Modern gospel arrangements', artist: 'Various' },
      { title: 'How Great Thou Art (contemporary versions)', artist: 'Various' },
    ],
  }),
  mk({
    id: 'gospel-walk-down-slash', name: 'The gospel walk-down with slash',
    numerals: ['I', 'V/7', 'vi', 'iii/5', 'IV', 'I/3', 'ii', 'V'],
    scaleDegrees: [0, 4, 5, 2, 3, 0, 1, 4],
    chordQualities: ['major', 'dominant', 'minor', 'minor', 'major', 'major', 'minor', 'dominant'],
    tier: 2, isMustKnow: false, loopDefault: false,
    theoryNote: "Each chord's bass note descends by step, creating a rich descending bassline typical of gospel ballads. The V/7 puts the leading tone in the bass, creating forward motion into vi.",
    songExamples: [
      { title: 'Gospel ballad arrangements', artist: 'Various' },
      { title: '"A Change Is Gonna Come" style walks', artist: 'Sam Cooke' },
    ],
  }),
  mk({
    id: 'mariah-rnb-turnaround', name: 'The Mariah R&B turnaround',
    numerals: ['I', 'vi/b7', 'IV'],
    scaleDegrees: [0, 5, 3],
    chordQualities: ['major', 'minor', 'major'],
    tier: 2, isMustKnow: false, loopDefault: true,
    theoryNote: 'The vi/b7 is the signature 90s R&B move — minor chord with the b7 of the key in the bass creates a smooth descending line from vi to IV.',
    songExamples: [
      { title: '90s Mariah Carey ballads', artist: 'Mariah Carey' },
      { title: 'Hero (feel)', artist: 'Mariah Carey', year: 1993 },
      { title: 'Smooth R&B turnarounds', artist: 'Various' },
    ],
  }),

  // ============================================================
  // Tier 3 — Modern Pop & R&B
  // ============================================================
  mk({
    id: '4-1-5-6', name: 'The 4-1-5-6',
    numerals: ['IV', 'I', 'V', 'vi'], scaleDegrees: [3, 0, 4, 5],
    chordQualities: ['major', 'major', 'dominant', 'minor'],
    tier: 3, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'Someone Like You', artist: 'Adele', year: 2011 },
      { title: 'Pink + White', artist: 'Frank Ocean', year: 2016 },
    ],
  }),
  mk({
    id: '1-b7-4', name: 'The 1-b7-4',
    numerals: ['I', 'bVII', 'IV'], scaleDegrees: [0, 6, 3],
    chordQualities: ['major', 'major', 'major'],
    tier: 3, isMustKnow: false, loopDefault: false,
    theoryNote: 'The bVII is borrowed from parallel minor (Mixolydian). Stevie Wonder uses this constantly for the warm, unexpected pivot.',
    songExamples: [
      { title: "Isn't She Lovely", artist: 'Stevie Wonder', year: 1976 },
      { title: 'Tom Misch modal moves', artist: 'Tom Misch' },
    ],
  }),
  mk({
    id: '4-5-6', name: 'The 4-5-6',
    numerals: ['IV', 'V', 'vi'], scaleDegrees: [3, 4, 5],
    chordQualities: ['major', 'dominant', 'minor'],
    tier: 3, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'Worship resolution', artist: 'Various' },
      { title: 'R&B lifts before choruses', artist: 'Various' },
    ],
  }),
  mk({
    id: '6-5-4-5', name: 'The 6-5-4-5',
    numerals: ['vi', 'V', 'IV', 'V'], scaleDegrees: [5, 4, 3, 4],
    chordQualities: ['minor', 'dominant', 'major', 'dominant'],
    tier: 3, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'Best Part (sections)', artist: 'H.E.R. & Daniel Caesar', year: 2016 },
      { title: 'Emotional R&B ballads', artist: 'Various' },
    ],
  }),
  mk({
    id: '1-3-6-4', name: 'The 1-3-6-4',
    numerals: ['I', 'iii', 'vi', 'IV'], scaleDegrees: [0, 2, 5, 3],
    chordQualities: ['major', 'minor', 'minor', 'major'],
    tier: 3, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'Love on Top', artist: 'Beyoncé', year: 2011 },
      { title: 'Olivia Dean warmth', artist: 'Olivia Dean' },
    ],
  }),
  mk({
    id: '2-5-1-6', name: 'The 2-5-1-6',
    numerals: ['ii', 'V', 'I', 'vi'], scaleDegrees: [1, 4, 0, 5],
    chordQualities: ['minor', 'dominant', 'major', 'minor'],
    tier: 3, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'Just the Two of Us', artist: 'Bill Withers / Grover Washington Jr.', year: 1981 },
      { title: 'Bruises', artist: 'Lewis Capaldi', year: 2017 },
    ],
  }),
  mk({
    id: 'descending-bass', name: 'The descending bass',
    numerals: ['I', 'V', 'vi', 'V', 'IV', 'iii', 'ii', 'V'],
    scaleDegrees: [0, 4, 5, 4, 3, 2, 1, 4],
    chordQualities: ['major', 'dominant', 'minor', 'dominant', 'major', 'minor', 'minor', 'dominant'],
    tier: 3, isMustKnow: false, loopDefault: false,
    theoryNote: "Each chord's bass note descends by step, creating a smooth, elegant line. Found in classical ('Whiter Shade of Pale'), gospel ballad bridges, and jazz.",
    songExamples: [
      { title: 'Let It Be (bridge)', artist: 'The Beatles', year: 1970 },
      { title: 'Many gospel ballad lifts', artist: 'Various' },
    ],
  }),
  mk({
    id: '1-5-b7-4', name: 'The 1-5-b7-4',
    numerals: ['I', 'V', 'bVII', 'IV'], scaleDegrees: [0, 4, 6, 3],
    chordQualities: ['major', 'dominant', 'major', 'major'],
    tier: 3, isMustKnow: false, loopDefault: false,
    theoryNote: 'The bVII adds gospel/soul color via modal interchange from Mixolydian.',
    songExamples: [
      { title: 'Gospel/soul hybrid turnarounds', artist: 'Various' },
    ],
  }),
  mk({
    id: 'pj-morton-turnaround', name: 'The PJ Morton turnaround',
    numerals: ['I', 'iii', 'IV', 'iv'], scaleDegrees: [0, 2, 3, 3],
    chordQualities: ['major', 'minor', 'major', 'minor'],
    tier: 3, isMustKnow: false, loopDefault: false,
    theoryNote: 'The iv min is borrowed from parallel minor — the classic gospel/soul emotional lift. PJ Morton and Madison Ryan Ward use this territory constantly.',
    songExamples: [
      { title: 'PJ Morton signature moves', artist: 'PJ Morton' },
      { title: 'Madison Ryan Ward territory', artist: 'Madison Ryan Ward' },
    ],
  }),
  mk({
    id: 'descending-bass-ballad', name: 'The descending bass ballad',
    numerals: ['I', 'V/7', 'vi', 'V', 'IV', 'iii', 'ii', 'V'],
    scaleDegrees: [0, 4, 5, 4, 3, 2, 1, 4],
    chordQualities: ['major', 'dominant', 'minor', 'dominant', 'major', 'minor', 'minor', 'dominant'],
    tier: 3, isMustKnow: false, loopDefault: false,
    theoryNote: "Classical descending bass line adapted for pop. Each bass note steps down creating elegant smooth motion. Found in classical ('Whiter Shade of Pale'), Beatles ('Let It Be' bridge), and countless gospel ballads.",
    songExamples: [
      { title: 'Let It Be (bridge)', artist: 'The Beatles', year: 1970 },
      { title: 'Gospel ballad bridges', artist: 'Various' },
    ],
  }),
  mk({
    id: 'pop-pedal', name: 'The pop pedal',
    numerals: ['I', 'V/5', 'IV/5', 'I/5'],
    scaleDegrees: [0, 4, 3, 0],
    chordQualities: ['major', 'dominant', 'major', 'major'],
    tier: 3, isMustKnow: false, loopDefault: true,
    theoryNote: 'The bass note stays on 5 (dominant pedal) while the harmony shifts above it. Creates a hypnotic, contemplative feel common in modern worship and CCM.',
    songExamples: [
      { title: 'One Thing Remains (feel)', artist: 'Jesus Culture' },
      { title: 'Contemporary worship', artist: 'Various' },
    ],
  }),
  mk({
    id: 'worship-lift', name: 'The worship lift',
    numerals: ['I', 'V', 'vi', 'I/3'],
    scaleDegrees: [0, 4, 5, 0],
    chordQualities: ['major', 'dominant', 'minor', 'major'],
    tier: 3, isMustKnow: false, loopDefault: false,
    theoryNote: 'The I/3 at the end puts the 3rd in the bass, creating a smooth step up from vi. Common modern worship pre-chorus lift.',
    songExamples: [
      { title: 'Hillsong', artist: 'Hillsong' },
      { title: 'Elevation', artist: 'Elevation Worship' },
      { title: 'Modern CCM', artist: 'Various' },
    ],
  }),
  mk({
    id: 'smooth-bass-line', name: 'The smooth bass line',
    numerals: ['I', 'iii/3', 'vi', 'ii/4', 'V'],
    scaleDegrees: [0, 2, 5, 1, 4],
    chordQualities: ['major', 'minor', 'minor', 'minor', 'dominant'],
    tier: 3, isMustKnow: false, loopDefault: false,
    theoryNote: 'Bass moves smoothly by step through chord inversions — a neo-soul elegance move. The iii/3 and ii/4 are inversions that keep the bass line flowing rather than jumping.',
    songExamples: [
      { title: 'Neo-soul elegance', artist: 'Various' },
      { title: 'Tom Misch territory', artist: 'Tom Misch' },
    ],
  }),

  // ============================================================
  // Tier 4 — Jazz Standards
  // ============================================================
  mk({
    id: 'rhythm-changes-a', name: 'Rhythm changes A section',
    numerals: ['I', 'vi', 'ii', 'V', 'I', 'vi', 'ii', 'V'],
    scaleDegrees: [0, 5, 1, 4, 0, 5, 1, 4],
    chordQualities: ['major', 'minor', 'minor', 'dominant', 'major', 'minor', 'minor', 'dominant'],
    tier: 4, isMustKnow: true, loopDefault: true,
    requiresDominant: true,
    theoryNote: 'The A section of countless jazz standards. Master this and you understand the bebop vocabulary.',
    songExamples: [
      { title: 'I Got Rhythm', artist: 'George Gershwin', year: 1930 },
      { title: 'Countless bebop heads', artist: 'Various' },
    ],
  }),
  mk({
    id: '2-5-1-cycle', name: 'The ii-V-I cycle',
    numerals: ['ii', 'V', 'I', 'ii', 'V', 'I'],
    scaleDegrees: [1, 4, 0, 1, 4, 0],
    chordQualities: ['minor', 'dominant', 'major', 'minor', 'dominant', 'major'],
    tier: 4, isMustKnow: false, loopDefault: false,
    requiresDominant: true,
    theoryNote: 'Move ii-V-I through multiple keys by descending a fifth each time. The jazz cycle exercise.',
    songExamples: [
      { title: 'All the Things You Are', artist: 'Jerome Kern', year: 1939 },
    ],
  }),
  mk({
    id: '3-6-2-5-1', name: 'The 3-6-2-5-1',
    numerals: ['iii', 'vi', 'ii', 'V', 'I'],
    scaleDegrees: [2, 5, 1, 4, 0],
    chordQualities: ['minor', 'minor', 'minor', 'dominant', 'major'],
    tier: 4, isMustKnow: false, loopDefault: false,
    requiresDominant: true,
    songExamples: [
      { title: 'Extended jazz turnaround', artist: 'Various' },
      { title: 'A Song For You (phrases)', artist: 'Donny Hathaway', year: 1971 },
    ],
  }),
  mk({
    id: 'autumn-leaves-opening', name: 'Autumn Leaves opening',
    numerals: ['ii', 'V', 'I', 'IV', 'viiø', 'III', 'vi'],
    scaleDegrees: [1, 4, 0, 3, 6, 2, 5],
    chordQualities: ['minor', 'dominant', 'major', 'major', 'half-dim', 'dominant', 'minor'],
    tier: 4, isMustKnow: false, loopDefault: false,
    requiresDominant: true,
    songExamples: [
      { title: 'Autumn Leaves', artist: 'Joseph Kosma', year: 1945 },
    ],
  }),
  mk({
    id: 'minor-jazz-turnaround', name: 'Minor jazz turnaround',
    numerals: ['i', 'VI', 'iiø', 'V', 'i'],
    scaleDegrees: [0, 5, 1, 4, 0],
    chordQualities: ['minor', 'dominant', 'half-dim', 'dominant', 'minor'],
    tier: 4, isMustKnow: false, loopDefault: false,
    requiresDominant: true,
    theoryNote: 'The V7b9 resolution to minor i is the signature sound of minor jazz standards. Contains the diminished tension that resolves downward to the tonic.',
    songExamples: [
      { title: 'Black Orpheus', artist: 'Luiz Bonfá', year: 1959 },
      { title: 'Minor jazz standards', artist: 'Various' },
    ],
  }),
  mk({
    id: 'modal-dorian-cycle', name: 'Modal Dorian cycle',
    numerals: ['i', 'IV'], scaleDegrees: [0, 3],
    chordQualities: ['minor', 'major'],
    tier: 4, isMustKnow: false, loopDefault: true,
    theoryNote: "Dorian mode's signature cycle. The raised 6th of Dorian gives the IV chord a major quality, making this sound bright within a minor tonality.",
    songExamples: [
      { title: 'So What', artist: 'Miles Davis', year: 1959 },
      { title: 'Impressions', artist: 'John Coltrane', year: 1963 },
    ],
  }),
  mk({
    id: 'coltrane-changes', name: 'Coltrane changes',
    numerals: ['I', 'bIII', 'bVI', 'bVII', 'bIII'],
    scaleDegrees: [0, 2, 5, 6, 2],
    chordQualities: ['major', 'dominant', 'major', 'minor', 'major'],
    tier: 4, isMustKnow: false, loopDefault: false,
    requiresDominant: true,
    theoryNote: 'Advanced. Based on the major 3rds axis — three key centers a major 3rd apart. Essential study for serious jazz harmony.',
    songExamples: [
      { title: 'Giant Steps', artist: 'John Coltrane', year: 1960 },
    ],
  }),

  // ============================================================
  // Tier 5 — Neo-Soul & Modern R&B
  // ============================================================
  mk({
    id: 'neo-soul-cycle', name: 'The neo-soul cycle',
    numerals: ['I', 'iii', 'vi', 'IV'],
    scaleDegrees: [0, 2, 5, 3],
    chordQualities: ['major', 'minor', 'minor', 'major'],
    tier: 5, isMustKnow: false, loopDefault: true,
    songExamples: [
      { title: 'Brown Sugar', artist: "D'Angelo", year: 1995 },
      { title: 'Erykah Badu territory', artist: 'Erykah Badu' },
      { title: 'Snoh Aalegra', artist: 'Snoh Aalegra' },
    ],
  }),
  mk({
    id: 'glasper-cycle', name: 'The Glasper cycle',
    numerals: ['vi', 'iii', 'I', 'IV'],
    scaleDegrees: [5, 2, 0, 3],
    chordQualities: ['minor', 'minor', 'major', 'major'],
    tier: 5, isMustKnow: false, loopDefault: true,
    songExamples: [
      { title: 'Robert Glasper', artist: 'Robert Glasper' },
      { title: 'Modern neo-soul instrumentals', artist: 'Various' },
    ],
  }),
  mk({
    id: '1-b7-modal', name: 'The 1-b7 modal interchange',
    numerals: ['I', 'bVII'],
    scaleDegrees: [0, 6],
    chordQualities: ['major', 'major'],
    tier: 5, isMustKnow: false, loopDefault: true,
    theoryNote: 'The bVII major 7 borrowed from Mixolydian. Creates a floating, contemplative feel — a defining neo-soul move.',
    songExamples: [
      { title: 'Pink + White', artist: 'Frank Ocean', year: 2016 },
      { title: 'Tom Misch vamps', artist: 'Tom Misch' },
    ],
  }),
  mk({
    id: 'dorian-rnb-vamp', name: 'The Dorian R&B vamp',
    numerals: ['i', 'IV'],
    scaleDegrees: [0, 3],
    chordQualities: ['minor', 'major'],
    tier: 5, isMustKnow: false, loopDefault: true,
    theoryNote: 'Dorian mode — the IV is major (not minor) which gives this minor vamp its characteristic bright-melancholy balance.',
    songExamples: [
      { title: 'Untitled (How Does It Feel)', artist: "D'Angelo", year: 2000 },
    ],
  }),
  mk({
    id: 'neo-soul-descent', name: 'The neo-soul descent',
    numerals: ['I', 'viiø', 'iii', 'vi'],
    scaleDegrees: [0, 6, 2, 5],
    chordQualities: ['major', 'half-dim', 'minor', 'minor'],
    tier: 5, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'A Long Walk', artist: 'Jill Scott', year: 2000 },
      { title: 'Smooth descending R&B', artist: 'Various' },
    ],
  }),
  mk({
    id: '2-1-slip', name: 'The 2-1 slip',
    numerals: ['ii', 'I'],
    scaleDegrees: [1, 0],
    chordQualities: ['minor', 'major'],
    tier: 5, isMustKnow: false, loopDefault: true,
    songExamples: [
      { title: 'Neo-soul resolution', artist: 'Various' },
      { title: 'Brown Sugar moments', artist: "D'Angelo", year: 1995 },
    ],
  }),
  mk({
    id: 'floating-lydian', name: 'The floating Lydian',
    numerals: ['I'],
    scaleDegrees: [0],
    chordQualities: ['major'],
    tier: 5, isMustKnow: false, loopDefault: true,
    theoryNote: 'Lydian mode — the raised 4th creates the dreamy, cinematic quality. No tension to resolve, pure atmosphere.',
    songExamples: [
      { title: 'Playa Playa', artist: "D'Angelo", year: 2000 },
      { title: 'Tom Misch atmospheric sections', artist: 'Tom Misch' },
    ],
  }),
  mk({
    id: 'frank-ocean-lift', name: 'The Frank Ocean lift',
    numerals: ['IV', 'iii', 'ii', 'I'],
    scaleDegrees: [3, 2, 1, 0],
    chordQualities: ['major', 'minor', 'minor', 'major'],
    tier: 5, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'Thinkin Bout You', artist: 'Frank Ocean', year: 2012 },
      { title: 'Contemplative descents', artist: 'Various' },
    ],
  }),
  mk({
    id: 'miguel-sensual', name: 'The Miguel sensual',
    numerals: ['I', 'iii', 'IV'],
    scaleDegrees: [0, 2, 3],
    chordQualities: ['major', 'minor', 'major'],
    tier: 5, isMustKnow: false, loopDefault: true,
    songExamples: [
      { title: 'Sure Thing', artist: 'Miguel', year: 2010 },
      { title: 'Daniel Caesar warmth', artist: 'Daniel Caesar' },
    ],
  }),
  mk({
    id: 'leon-thomas-groove', name: 'The Leon Thomas groove',
    numerals: ['i', 'bVII', 'iv'],
    scaleDegrees: [0, 6, 3],
    chordQualities: ['minor', 'major', 'minor'],
    tier: 5, isMustKnow: false, loopDefault: true,
    theoryNote: 'Combines modal interchange (bVII) and iv minor (borrowed from parallel minor) for sophisticated neo-soul color.',
    songExamples: [
      { title: 'Modern neo-soul with jazz voicings', artist: 'Various' },
    ],
  }),
  mk({
    id: 'her-ballad', name: 'The H.E.R. ballad',
    numerals: ['I', 'vi', 'ii', 'V'],
    scaleDegrees: [0, 5, 1, 4],
    chordQualities: ['major', 'minor', 'minor', 'dominant'],
    tier: 5, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'H.E.R. signature smooth R&B progression', artist: 'H.E.R.' },
    ],
  }),

  // ============================================================
  // Tier 6 — Blues & Funk
  // ============================================================
  mk({
    id: 'jazz-blues-12', name: 'Jazz blues 12-bar',
    numerals: ['I', 'IV', 'I', 'V', 'IV', 'I', 'V'],
    scaleDegrees: [0, 3, 0, 4, 3, 0, 4],
    chordQualities: ['dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant'],
    tier: 6, isMustKnow: false, loopDefault: true,
    requiresDominant: true,
    songExamples: [
      { title: 'Jazz blues heads', artist: 'Various' },
    ],
  }),
  mk({
    id: '8-bar-blues', name: '8-bar blues',
    numerals: ['I', 'V', 'IV', 'I', 'I', 'V', 'I', 'V'],
    scaleDegrees: [0, 4, 3, 0, 0, 4, 0, 4],
    chordQualities: ['dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant'],
    tier: 6, isMustKnow: false, loopDefault: true,
    songExamples: [
      { title: 'Key to the Highway', artist: 'Big Bill Broonzy', year: 1941 },
    ],
  }),
  mk({
    id: 'funk-1-chord', name: 'Funk 1-chord vamp',
    numerals: ['I'],
    scaleDegrees: [0],
    chordQualities: ['dominant'],
    tier: 6, isMustKnow: false, loopDefault: true,
    requiresDominant: true,
    theoryNote: "The #9 on a dominant 7 is the 'Hendrix chord' sound — major 3rd and minor 3rd colliding for bluesy funk tension.",
    songExamples: [
      { title: 'Cold Sweat', artist: 'James Brown', year: 1967 },
      { title: 'Prince funk', artist: 'Prince' },
    ],
  }),
  mk({
    id: 'funk-2-chord', name: 'Funk 2-chord vamp',
    numerals: ['I', 'IV'],
    scaleDegrees: [0, 3],
    chordQualities: ['dominant', 'dominant'],
    tier: 6, isMustKnow: false, loopDefault: true,
    requiresDominant: true,
    songExamples: [
      { title: 'James Brown', artist: 'James Brown' },
      { title: 'Funk grooves', artist: 'Various' },
    ],
  }),
  mk({
    id: 'slow-blues-turnaround', name: 'Slow blues turnaround',
    numerals: ['I', 'IV', 'I', 'V', 'IV', 'I', 'V'],
    scaleDegrees: [0, 3, 0, 4, 3, 0, 4],
    chordQualities: ['dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant', 'dominant'],
    tier: 6, isMustKnow: false, loopDefault: false,
    requiresDominant: true,
    songExamples: [
      { title: 'B.B. King feel', artist: 'B.B. King' },
      { title: 'Blues endings', artist: 'Various' },
    ],
  }),
  mk({
    id: 'soul-blues-6-5-1', name: 'The soul-blues 6-5-1',
    numerals: ['vi', 'V', 'I'],
    scaleDegrees: [5, 4, 0],
    chordQualities: ['minor', 'dominant', 'major'],
    tier: 6, isMustKnow: false, loopDefault: false,
    songExamples: [
      { title: 'Blues resolution with emotional weight', artist: 'Various' },
    ],
  }),

  // ============================================================
  // Tier 7 — Latin, Bossa, World
  // ============================================================
  mk({
    id: 'andalusian-cadence', name: 'The Andalusian cadence',
    numerals: ['i', 'bVII', 'bVI', 'V'],
    scaleDegrees: [0, 6, 5, 4],
    chordQualities: ['minor', 'major', 'major', 'dominant'],
    tier: 7, isMustKnow: false, loopDefault: true,
    theoryNote: 'The descending bass with a raised leading tone creates the flamenco/Spanish sound. Each step feels deliberate and emotional.',
    songExamples: [
      { title: 'Hit the Road Jack', artist: 'Ray Charles', year: 1961 },
      { title: 'Flamenco tradition', artist: 'Various' },
    ],
  }),
  mk({
    id: 'bossa-nova-standard', name: 'The bossa nova standard',
    numerals: ['I', 'VI', 'ii', 'V'],
    scaleDegrees: [0, 5, 1, 4],
    chordQualities: ['major', 'dominant', 'minor', 'dominant'],
    tier: 7, isMustKnow: false, loopDefault: true,
    requiresDominant: true,
    songExamples: [
      { title: 'The Girl from Ipanema', artist: 'Antônio Carlos Jobim', year: 1962 },
      { title: 'Brazilian jazz', artist: 'Various' },
    ],
  }),
  mk({
    id: 'samba-cycle', name: 'The samba cycle',
    numerals: ['i', 'V', 'i', 'IV'],
    scaleDegrees: [0, 4, 0, 3],
    chordQualities: ['minor', 'dominant', 'minor', 'dominant'],
    tier: 7, isMustKnow: false, loopDefault: true,
    requiresDominant: true,
    songExamples: [
      { title: 'Brazilian and Latin jazz', artist: 'Various' },
    ],
  }),
  mk({
    id: 'reggae-1-chord', name: 'Reggae 1-chord',
    numerals: ['I'],
    scaleDegrees: [0],
    chordQualities: ['major'],
    tier: 7, isMustKnow: false, loopDefault: true,
    theoryNote: 'Harmonic simplicity but rhythmic complexity. Ear training focuses on feeling the upbeat chord stab.',
    songExamples: [
      { title: 'Bob Marley', artist: 'Bob Marley' },
      { title: 'Roots reggae', artist: 'Various' },
    ],
  }),
  mk({
    id: 'afrobeat-1-chord', name: 'Afrobeat 1-chord',
    numerals: ['I'],
    scaleDegrees: [0],
    chordQualities: ['dominant'],
    tier: 7, isMustKnow: false, loopDefault: true,
    theoryNote: 'Similar to funk 1-chord but with polyrhythmic layers. The harmony sits still while rhythm does the work.',
    songExamples: [
      { title: 'Fela Kuti', artist: 'Fela Kuti' },
      { title: 'Modern Afrobeat', artist: 'Various' },
    ],
  }),

  // ============================================================
  // Tier 8 — Hip-Hop & Sampled Loops
  // ============================================================
  mk({
    id: 'minor-2-chord-loop', name: 'Minor 2-chord loop',
    numerals: ['i', 'iv'],
    scaleDegrees: [0, 3],
    chordQualities: ['minor', 'minor'],
    tier: 8, isMustKnow: false, loopDefault: true,
    songExamples: [
      { title: 'Common hip-hop sample loop', artist: 'Various' },
    ],
  }),
  mk({
    id: 'sampled-jazz-cycle', name: 'The sampled jazz cycle',
    numerals: ['I', 'iii', 'vi', 'ii'],
    scaleDegrees: [0, 2, 5, 1],
    chordQualities: ['major', 'minor', 'minor', 'minor'],
    tier: 8, isMustKnow: false, loopDefault: true,
    songExamples: [
      { title: 'J Dilla production', artist: 'J Dilla' },
      { title: 'A Tribe Called Quest', artist: 'A Tribe Called Quest' },
    ],
  }),
  mk({
    id: '6-4-5-minor-loop', name: 'The 6-4-5 minor loop',
    numerals: ['i', 'bVI', 'bVII'],
    scaleDegrees: [0, 5, 6],
    chordQualities: ['minor', 'major', 'major'],
    tier: 8, isMustKnow: false, loopDefault: true,
    theoryNote: 'All three chords are borrowed from parallel minor (natural minor). Creates the dark, atmospheric loop common in trap and modern hip-hop.',
    songExamples: [
      { title: 'Some J. Cole production', artist: 'J. Cole' },
      { title: 'Trap flavor', artist: 'Various' },
    ],
  }),
  mk({
    id: 'soul-sample-loop', name: 'The soul sample loop',
    numerals: ['I', 'vi'],
    scaleDegrees: [0, 5],
    chordQualities: ['major', 'minor'],
    tier: 8, isMustKnow: false, loopDefault: true,
    songExamples: [
      { title: 'Kanye West early-era samples', artist: 'Kanye West' },
    ],
  }),
  mk({
    id: 'j-cole-progression', name: 'The J. Cole progression',
    numerals: ['i', 'bVI', 'III', 'v'],
    scaleDegrees: [0, 5, 2, 4],
    chordQualities: ['minor', 'major', 'dominant', 'minor'],
    tier: 8, isMustKnow: false, loopDefault: true,
    theoryNote: 'The III7 is a secondary dominant pointing at vi — unresolved tension creates the brooding introspective quality.',
    songExamples: [
      { title: 'J. Cole signature introspective loops', artist: 'J. Cole' },
    ],
  }),
  mk({
    id: 'kendrick-modal', name: 'The Kendrick modal',
    numerals: ['i'],
    scaleDegrees: [0],
    chordQualities: ['minor'],
    tier: 8, isMustKnow: false, loopDefault: true,
    songExamples: [
      { title: 'Kendrick Lamar DAMN. era grooves', artist: 'Kendrick Lamar', year: 2017 },
    ],
  }),
  mk({
    id: 'drake-sad-loop', name: 'The Drake sad loop',
    numerals: ['i', 'bIII', 'bVII', 'IV'],
    scaleDegrees: [0, 2, 6, 3],
    chordQualities: ['minor', 'major', 'major', 'major'],
    tier: 8, isMustKnow: false, loopDefault: true,
    theoryNote: 'Mixes minor tonality with bright bIII and bVII — the aesthetic of late-night introspective hip-hop.',
    songExamples: [
      { title: 'Drake / OVO territory', artist: 'Drake' },
    ],
  }),
];

export const MUST_KNOW_IDS = PROGRESSIONS.filter(p => p.isMustKnow).map(p => p.id);

export function progressionById(id: string): Progression | undefined {
  return PROGRESSIONS.find(p => p.id === id);
}
