import { db, type ChordData } from '../../../lib/db';

export type ChordSeed = Omit<ChordData, 'correct' | 'total'>;

export const CHORD_SEEDS: ChordSeed[] = [
  // Foundational Triads
  { id: 'maj',      name: 'Major',       tier: 'foundational', family: 'major', intervals: [0, 4, 7],              formula: '1, 3, 5',                  soundDefault: 'Bright, stable, open. Home base of all music.' },
  { id: 'min',      name: 'Minor',       tier: 'foundational', family: 'minor', intervals: [0, 3, 7],              formula: '1, b3, 5',                 soundDefault: 'Darker, emotional, inward. The shadow of major.' },
  { id: 'sus2',     name: 'Sus2',        tier: 'foundational', family: 'sus',   intervals: [0, 2, 7],              formula: '1, 2, 5',                  soundDefault: 'Open, floating, ambiguous. Common in modern pop and contemporary gospel.' },
  { id: 'sus4',     name: 'Sus4',        tier: 'foundational', family: 'sus',   intervals: [0, 5, 7],              formula: '1, 4, 5',                  soundDefault: 'Suspended tension, wants to fall. Gospel & hymn staple. Resolves down to major triad.' },
  { id: 'dim',      name: 'Diminished',  tier: 'foundational', family: 'dim',   intervals: [0, 3, 6],              formula: '1, b3, b5',                soundDefault: 'Tense, symmetrical, unsettling. The 7 chord of the major scale.' },
  { id: 'aug',      name: 'Augmented',   tier: 'foundational', family: 'aug',   intervals: [0, 4, 8],              formula: '1, 3, #5',                 soundDefault: 'Mysterious, whole-tone, dreamy. Unresolved tension.' },

  // Seventh Chords
  { id: 'maj7',     name: 'Major 7',     tier: 'seventh',      family: 'major', intervals: [0, 4, 7, 11],          formula: '1, 3, 5, 7',               soundDefault: 'Lush, dreamy, sophisticated. Neo-soul & jazz I & IV chord.' },
  { id: 'min7',     name: 'Minor 7',     tier: 'seventh',      family: 'minor', intervals: [0, 3, 7, 10],          formula: '1, b3, 5, b7',             soundDefault: 'Smooth, mellow, melancholic. R&B and soul foundation. The ii, iii, and vi chord.' },
  { id: 'dom7',     name: 'Dominant 7',  tier: 'seventh',      family: 'dom',   intervals: [0, 4, 7, 10],          formula: '1, 3, 5, b7',              soundDefault: 'Tense, bluesy, wants to resolve down a 5th. The V7 workhorse of gospel & blues.' },
  { id: 'dim7',     name: 'Diminished 7',tier: 'seventh',      family: 'dim',   intervals: [0, 3, 6, 9],           formula: '1, b3, b5, bb7',           soundDefault: 'Fully diminished — 4 stacked minor 3rds. Only 3 distinct dim7s exist; all 4 inversions are harmonically the same.' },
  { id: 'm7b5',     name: 'Half-dim 7',  tier: 'seventh',      family: 'dim',   intervals: [0, 3, 6, 10],          formula: '1, b3, b5, b7',            soundDefault: 'Minor 7 flat 5. The ii chord of minor 251s. Darker than regular minor 7.' },
  { id: 'minMaj7',  name: 'Minor(Maj7)', tier: 'seventh',      family: 'minor', intervals: [0, 3, 7, 11],          formula: '1, b3, 5, 7',              soundDefault: 'The "James Bond" chord. Minor triad with a major 7th. Mysterious, cinematic, jazz noir.' },

  // Dominant Variations
  { id: 'dom7sus4', name: 'Dom7sus4',    tier: 'dominant',     family: 'dom',   intervals: [0, 5, 7, 10],          formula: '1, 4, 5, b7',              soundDefault: 'The sus chord resolution. Very common in gospel before V-I. Play the major chord 1 whole step below the root.' },
  { id: 'dom7b9',   name: 'Dom7b9',      tier: 'dominant',     family: 'dom',   intervals: [0, 4, 7, 10, 13],      formula: '1, 3, 5, b7, b9',          soundDefault: 'Dark tension dominant. Contains a dim7 built from the 3rd. Extremely important in gospel resolutions.' },
  { id: 'dom7#9',   name: 'Dom7#9',      tier: 'dominant',     family: 'dom',   intervals: [0, 4, 7, 10, 15],      formula: '1, 3, 5, b7, #9',          soundDefault: 'The "Hendrix chord." Essential for funk, blues, and gritty R&B. Major 3rd and minor 3rd colliding.' },
  { id: 'dom7#9#5', name: 'Dom7#9#5',    tier: 'dominant',     family: 'dom',   intervals: [0, 4, 8, 10, 15],      formula: '1, 3, #5, b7, #9',         soundDefault: 'Dark altered dominant. Resolves beautifully to minor 9 chords. Polychord: b6 major over the guide tones.' },
  { id: 'dom9_13',  name: 'Dom9(13)',    tier: 'dominant',     family: 'dom',   intervals: [0, 4, 7, 10, 14, 21],  formula: '1, 3, 5, b7, 9, 13',       soundDefault: 'Bright tension dominant. The AB voicing sound. Stevie Wonder and gospel signature.' },
  { id: 'dom13',    name: 'Dom13',       tier: 'dominant',     family: 'dom',   intervals: [0, 4, 7, 10, 14, 17, 21], formula: '1, 3, 5, b7, 9, 11, 13', soundDefault: "The full funk voicing. Rich, warm, soulful. Every D'Angelo tune has this." },

  // Extensions & Colors
  { id: 'maj9',     name: 'Major 9',     tier: 'extensions',   family: 'major', intervals: [0, 4, 7, 11, 14],      formula: '1, 3, 5, 7, 9',            soundDefault: 'Expansive, lush. Neo-soul and jazz ballad color.' },
  { id: 'maj13',    name: 'Major 13',    tier: 'extensions',   family: 'major', intervals: [0, 4, 7, 11, 14, 21],  formula: '1, 3, 5, 7, 9, 13',        soundDefault: 'The full neo-soul chord. Every Robert Glasper tune has this. Warm, complete, expansive.' },
  { id: 'maj9_13',  name: 'Major 9(13)', tier: 'extensions',   family: 'major', intervals: [0, 4, 11, 14, 21],     formula: '1, 3, 7, 9, 13',           soundDefault: 'The AB voicing major chord. Often voiced as a Major 7b5 shape. Very jazzy I chord.' },
  { id: 'maj6',     name: 'Major 6',     tier: 'extensions',   family: 'major', intervals: [0, 4, 7, 9],           formula: '1, 3, 5, 6',               soundDefault: 'Warm and complete. Gospel & bossa nova color. Softer than Maj7, no leading tone tension.' },
  { id: 'maj6_9',   name: 'Major 6/9',   tier: 'extensions',   family: 'major', intervals: [0, 4, 7, 9, 14],       formula: '1, 3, 5, 6, 9',            soundDefault: 'The fullest major color. Both the 6 and 9 together. Essential gospel & jazz voicing.' },
  { id: 'add9',     name: 'Maj(add9)',   tier: 'extensions',   family: 'major', intervals: [0, 4, 7, 14],          formula: '1, 3, 5, 9',               soundDefault: 'Major triad with a 9th added, no 7th. Bright, airy, modern pop.' },
  { id: 'add2',     name: 'Maj(add2)',   tier: 'extensions',   family: 'major', intervals: [0, 2, 4, 7],           formula: '1, 2, 3, 5',               soundDefault: 'Major with a 2 added inside the chord. Cluster-like, rich.' },
  { id: 'min9',     name: 'Minor 9',     tier: 'extensions',   family: 'minor', intervals: [0, 3, 7, 10, 14],      formula: '1, b3, 5, b7, 9',          soundDefault: 'Deep, soulful, aching. R&B slow-jam foundation.' },
  { id: 'min11',    name: 'Minor 11',    tier: 'extensions',   family: 'minor', intervals: [0, 3, 7, 10, 14, 17],  formula: '1, b3, 5, b7, 9, 11',      soundDefault: "The floating neo-soul chord. Erykah Badu, D'Angelo territory. Extremely common in R&B." },
  { id: 'min9_11',  name: 'Minor 9(11)', tier: 'extensions',   family: 'minor', intervals: [0, 3, 7, 10, 14, 17],  formula: '1, b3, 5, b7, 9, 11',      soundDefault: 'Polychord: b7 major triad over a minor triad. Works on 2min, 6min, or any non-3min minor chord.' },
  { id: 'min6',     name: 'Minor 6',     tier: 'extensions',   family: 'minor', intervals: [0, 3, 7, 9],           formula: '1, b3, 5, 6',              soundDefault: 'Bittersweet, cinematic. Latin and jazz flavor.' },
  { id: 'min6_9',   name: 'Minor 6/9',   tier: 'extensions',   family: 'minor', intervals: [0, 3, 7, 9, 14],       formula: '1, b3, 5, 6, 9',           soundDefault: 'AB voicing minor color. Rich minor sound often used for tonic minor chords.' },
];

export async function seedChordQualities(): Promise<void> {
  await db.transaction('rw', db.chordQualities, async () => {
    for (const seed of CHORD_SEEDS) {
      const existing = await db.chordQualities.get(seed.id);
      if (!existing) {
        await db.chordQualities.put({ ...seed, correct: 0, total: 0 });
      } else {
        // Refresh anything we control from the seed, but preserve the
        // user's custom sound description + any historical counts.
        await db.chordQualities.update(seed.id, {
          name: seed.name,
          tier: seed.tier,
          family: seed.family,
          intervals: seed.intervals,
          formula: seed.formula,
          soundDefault: seed.soundDefault,
        });
      }
    }
  });
}
