/**
 * The Chord Progressions catalog: eight progressions, three tiers.
 *
 * =====================================================================
 * IT WAS 69, AND IT IS EIGHT BY RULING.
 *
 * Silas ruled the cut on 3 Sep 2026 and named the survivors on 9 Sep.
 * The catalog had grown to sixty-nine named progressions across eight
 * genre tiers, which is a reference book rather than an ear-training
 * drill: an ear that has never been asked the same passage twice is
 * not being trained, and a pool that wide meant exactly that.
 *
 * THE TWO ROTATIONS ARE HERE ON PURPOSE. 1-5-6-4, 6-4-1-5 and 4-1-5-6
 * are one loop entered by three doors, and a reader who can name the
 * loop from a 1 start often cannot from a 6 start. They are different
 * listening experiences, most of all for key detection, so they are
 * three entries and not one.
 *
 * THE OTHER SIXTY-ONE ARE GONE FROM THE CODE, NOT FROM THE DATABASE.
 * Every attempt and every spacing row they earned is still on disk and
 * is not touched by anything here. A row with no live item behind it
 * is something the orphan sweep reports; it is never something a
 * migration deletes.
 * =====================================================================
 *
 * Data-only: quiz/playback/tracker code derives everything from here.
 */

/**
 * The chord qualities a progression's chords can be.
 *
 * THE TWO ALTERED DOMINANTS ARE SPELLED THE WAY CHORD RECOGNITION
 * SPELLS THEM — `dom7b9` and `dom7#9#5` are ids in `CHORD_SEEDS`, and
 * an ear-training module naming the same chord two ways is how the
 * same sound comes to be drilled as two skills. Their intervals are
 * read off that library rather than retyped here; see
 * `progressionTheory`.
 *
 * Nothing in the catalog uses them yet. They arrive ahead of the cards
 * and entries that will (Silas's alignment decisions, 9 Sep 2026), so
 * the surfaces that voice and name a chord already know how.
 */
export type ChordQuality =
  | 'major'
  | 'minor'
  | 'dominant'
  | 'dom7b9'
  | 'dom7#9#5'
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

/**
 * The tiers the catalog still populates.
 *
 * FIVE NAMES WENT WITH THE CUT. Tiers 4 to 8 (Jazz Standards, Neo-Soul
 * & Modern R&B, Blues & Funk, Latin/Bossa/World, Hip-Hop & Sampled
 * Loops) have no progressions left in them, and the quiz's focus panel
 * and the tracker's grouped view both walk these keys — so a name kept
 * here would draw a heading over an empty list.
 */
export const TIER_NAMES: Record<number, string> = {
  1: 'Foundational',
  2: 'Gospel & R&B',
  3: 'Modern Pop & R&B',
};

// Quick helper to keep catalog entries short. Defaults durationPattern to
// all-1s when not specified.
//
// THE `stage` FIELD IS GONE. It stamped each entry with its rung on the
// progressions unlock ladder, and that ladder was retired on 10 Sep
// 2026 — see `fullProgressionPool.ts` for what a generated session
// draws instead. The `tier` field below is unrelated: a curriculum
// bucket (1–8, genre-grouped) the trackers group by.
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

  // ============================================================
  // Tier 2 — Gospel & R&B
  // ============================================================
  // THE BACKDOOR IS 4 MINOR → ♭7(7) → 1. Verified with Silas on
  // 9 Sep 2026, replacing the I-IV-bVII-I this entry shipped with:
  // "4m and ♭7(7) are both part of the parallel minor chords", so the
  // progression is the two borrowed chords resolving home.
  //
  // THE THEORY NOTE IS SILAS'S OWN SENTENCES, from his modal-interchange
  // notes of the same night, joined and not reworded.
  //
  // THE SONG EXAMPLES ARE THE OLD PROGRESSION'S and are left as they
  // were: they were chosen for the I-IV-bVII-I and choosing new ones
  // is Silas's to do, not this file's to guess. Raised in the report.
  mk({
    id: 'backdoor', name: 'The backdoor',
    numerals: ['iv', 'bVII', 'I'], scaleDegrees: [3, 6, 0],
    chordQualities: ['minor', 'dominant', 'major'],
    tier: 2, isMustKnow: false, loopDefault: false,
    // THE GLYPHS ARE THE APP'S, THE WORDS ARE SILAS'S. His notes type
    // the flat as a plain letter b; every other flat on screen is ♭, and
    // "b7(7)" beside "♭7" elsewhere reads as two different chords. Not
    // one word changed.
    theoryNote: '♭7(7) — typically wants to resolve to the 1. Also can be a part of a larger backdoor 251 (4minor → ♭7(7) → 1). 4m and ♭7(7) are both part of the parallel minor chords.',
    // =================================================================
    // NO SONG EXAMPLES, AND EMPTY IS THE HONEST STATE.
    //
    // "I Wish" and "Isn't She Lovely (bridge)" were here. They were
    // chosen for the I-IV-♭VII-I this entry used to be; the backdoor is
    // 4 minor → ♭7(7) → 1 since 9 Sep 2026, and a song that demonstrates
    // one does not demonstrate the other. Silas will add one when he has
    // one he vouches for — picking a replacement is a claim about music
    // and not this file's to make.
    // =================================================================
    songExamples: [],
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
];

export const MUST_KNOW_IDS = PROGRESSIONS.filter(p => p.isMustKnow).map(p => p.id);

export function progressionById(id: string): Progression | undefined {
  return PROGRESSIONS.find(p => p.id === id);
}
