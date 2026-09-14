import { progressionById, type ChordQuality } from './catalog';
import { keyToRootMidi, numeralOffset } from './progressionTheory';
import { progressionChords } from './progressionChords';
import { qualitySymbol } from '../../../lib/player/reader';
import { DEFAULT_PROGRESSION_SPELLING } from '../../../lib/progressionSpellingShape';
import type { PlayerChord } from '../../../lib/player/voices';

// What a Harmonic Diary progression or motion card sounds, at the
// diary's defaults: key C, seventh complexity so the chord colour
// matches how the quizzes sound.
//
// =====================================================================
// THE DIARY PLAYS NOTHING HERE ANY MORE. Silas's spec of 12 Sep 2026.
//
// These two functions used to sound their passage through the shared
// player, struck or run as the card's two buttons said. The card has one
// ▶ now, and it opens the diary's player panel, which is the shared
// player: its transport, its Play as, its loop. So this file only builds
// the chords the panel is handed.
// =====================================================================
const DEFAULT_KEY = 'C';
const DEFAULT_COMPLEXITY = 'seventh' as const;

/** A passage, voiced, in its key, with each chord's name. */
export interface DiaryPassage {
  chords: PlayerChord[];
  keyPc: number;
  /** Each chord's name with its quality — "Am", "G7" — for the panel's
   *  title, which is the chords. `progressionChords` names the root and
   *  any slash bass only. */
  names: string[];
  /**
   * The passage as the loop builder's slots: a degree and the seventh
   * chord the card sounds on it — "2m7", "57", "1maj7" (spec §7).
   *
   * SEVENTH CHORDS BECAUSE THAT IS WHAT THE CARD PLAYS: this file builds
   * every passage at seventh complexity, and a slot naming a triad would
   * sound thinner than the card did.
   */
  slots: string[];
  /** The direction a motion card names, where it names one. */
  bassDirection?: 'up' | 'down';
}

/** The seventh chord each catalog quality sounds as, as a slot writes it. */
const SLOT_SUFFIX: Readonly<Record<ChordQuality, string>> = {
  major: 'maj7',
  minor: 'm7',
  dominant: '7',
  dom7b9: '7♭9',
  'dom7#9#5': '7♯9♯5',
  diminished: '°7',
  'half-dim': 'ø7',
  augmented: '+',
};

const ROMAN_DEGREE: Readonly<Record<string, number>> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7,
};

/** A numeral and its quality as a slot: "bVII" major is "b7maj7". */
export function slotOf(numeral: string, quality: ChordQuality): string {
  const [chord] = numeral.split('/');
  const m = chord.match(/^([b#]*)([IVXivx]+)/);
  const degree = m === null ? 1 : ROMAN_DEGREE[m[2].toUpperCase()] ?? 1;
  return `${m?.[1] ?? ''}${degree}${SLOT_SUFFIX[quality]}`;
}

export interface DiaryPassageOpts {
  key?: string;
}

/** The catalog quality, as the reader's table spells it. */
const READER_ID: Readonly<Record<ChordQuality, string>> = {
  major: 'maj',
  minor: 'min',
  dominant: 'dom7',
  dom7b9: 'dom7b9',
  'dom7#9#5': 'dom7#9#5',
  diminished: 'dim',
  'half-dim': 'm7b5',
  augmented: 'aug',
};

function namesOf(
  chords: ReadonlyArray<PlayerChord>, qualities: ReadonlyArray<ChordQuality>,
): string[] {
  return chords.map((chord, i) => {
    const [root, over] = chord.name.split('/');
    const suffix = qualitySymbol(READER_ID[qualities[i] ?? 'major'], DEFAULT_PROGRESSION_SPELLING);
    return `${root}${suffix}${over === undefined ? '' : `/${over}`}`;
  });
}

/**
 * A progression from the shared catalog, as the diary's panel plays it.
 *
 * `progressionChords` is the same builder Key Detection uses, so an
 * entry sounds here exactly as it does there. Null for an id the catalog
 * does not have.
 */
export function progressionChordsById(
  id: string,
  opts: DiaryPassageOpts = {},
): DiaryPassage | null {
  const prog = progressionById(id);
  if (!prog) return null;
  const rootMidi = keyToRootMidi(opts.key ?? DEFAULT_KEY);
  const qualities = prog.numerals.map((_, i) => prog.chordQualities[i] ?? 'major');
  const chords = progressionChords(
    prog.numerals.map((numeral, i) => ({
      numeral,
      quality: qualities[i],
      beats: prog.durationPattern[i] ?? 1,
    })),
    rootMidi,
    {
      complexity: DEFAULT_COMPLEXITY,
      requiresDominant: prog.requiresDominant ?? false,
    },
  );
  return {
    chords,
    keyPc: ((rootMidi % 12) + 12) % 12,
    names: namesOf(chords, qualities),
    slots: prog.numerals.map((numeral, i) => slotOf(numeral, qualities[i])),
  };
}

// --- Chord motion starters -----------------------------------------
//
// The Harmonic Diary seeds 12 two-chord motion entries (`starters.ts`
// MOTIONS[]). Each id here maps to the concrete numerals + qualities
// the preview should play. Direction ('asc' / 'desc' / 'deceptive')
// nudges the target chord's octave so the motion sounds in the
// direction its name promises — e.g. 1 → vi with direction 'desc'
// drops vi an octave so the motion actually descends rather than
// rising to the vi above the tonic.

interface MotionDef {
  numerals: [string, string];
  qualities: [ChordQuality, ChordQuality];
  direction: 'asc' | 'desc' | 'deceptive';
}

const MOTION_DEFS: Record<string, MotionDef> = {
  '1-to-5-asc':        { numerals: ['I', 'V'],      qualities: ['major', 'dominant'], direction: 'asc' },
  '5-to-1-desc':       { numerals: ['V', 'I'],      qualities: ['dominant', 'major'], direction: 'desc' },
  '1-to-4-asc':        { numerals: ['I', 'IV'],     qualities: ['major', 'major'],    direction: 'asc' },
  '4-to-1-desc':       { numerals: ['IV', 'I'],     qualities: ['major', 'major'],    direction: 'desc' },
  '1-to-6m-desc':      { numerals: ['I', 'vi'],     qualities: ['major', 'minor'],    direction: 'desc' },
  '6m-to-1-asc':       { numerals: ['vi', 'I'],     qualities: ['minor', 'major'],    direction: 'asc' },
  '2-to-5-asc':        { numerals: ['ii', 'V'],     qualities: ['minor', 'dominant'], direction: 'asc' },
  '5-to-6m-deceptive': { numerals: ['V', 'vi'],     qualities: ['dominant', 'minor'], direction: 'deceptive' },
  '4-to-5-asc':        { numerals: ['IV', 'V'],     qualities: ['major', 'dominant'], direction: 'asc' },
  '6m-to-4-desc':      { numerals: ['vi', 'IV'],    qualities: ['minor', 'major'],    direction: 'desc' },
  'b7-to-1-asc':       { numerals: ['bVII', 'I'],   qualities: ['major', 'major'],    direction: 'asc' },
  'b6-to-b7-asc':      { numerals: ['bVI', 'bVII'], qualities: ['major', 'major'],    direction: 'asc' },
};

/**
 * A two-chord motion starter at diary defaults. Respects the named
 * direction (asc / desc / deceptive) by octave-shifting the target chord
 * when the natural voicing would go the wrong way.
 *
 * The motion's named direction (e.g. '5-to-1-desc') is independent of
 * how the panel plays it: a desc motion played Up still has chord 2
 * sitting below chord 1, but each of those chords is run low→high
 * internally. Null for an id not in `MOTION_DEFS`.
 */
export function motionChordsById(
  id: string,
  opts: DiaryPassageOpts = {},
): DiaryPassage | null {
  const def = MOTION_DEFS[id];
  if (!def) return null;
  const rootMidi = keyToRootMidi(opts.key ?? DEFAULT_KEY);

  const chord1RootSemis = numeralOffset(def.numerals[0]);
  let chord2RootSemis = numeralOffset(def.numerals[1]);

  // Honour the named-direction hint by octave-shifting the second chord
  // when the natural voicing would go the wrong way. 'deceptive'
  // deliberately doesn't nudge — the surprise is in the chord quality
  // (V → vi minor), not the register.
  if (def.direction === 'desc' && chord2RootSemis > chord1RootSemis) chord2RootSemis -= 12;
  else if (def.direction === 'asc' && chord2RootSemis < chord1RootSemis) chord2RootSemis += 12;

  // THE SAME BUILDER AS EVERY OTHER PASSAGE. A motion is two chords.
  const chords = progressionChords(
    [
      { numeral: def.numerals[0], quality: def.qualities[0], beats: 2 },
      { numeral: def.numerals[1], quality: def.qualities[1], beats: 2 },
    ],
    rootMidi,
    { complexity: DEFAULT_COMPLEXITY, requiresDominant: def.qualities.includes('dominant') },
  );
  // THE NUDGE, APPLIED TO WHAT WAS BUILT. `progressionChords` places a
  // chord from its own numeral; the direction hint moves the second
  // chord's whole voicing an octave.
  const shift = chord2RootSemis - numeralOffset(def.numerals[1]);
  // AN ASCENDING OR DESCENDING CARD NAMES ITS MOVE, so the Bass register
  // moves the pair as a block (Silas, 14 Sep 2026). A deceptive card
  // names a surprise, not a direction.
  const named = def.direction === 'deceptive' ? {} : { namesMove: true };
  const shifted = [
    chords[0],
    {
      ...chords[1],
      hand: chords[1].hand.map(m => m + shift),
      bass: chords[1].bass === null ? null : chords[1].bass + shift,
      ...named,
    },
  ];
  return {
    chords: shifted,
    keyPc: ((rootMidi % 12) + 12) % 12,
    names: namesOf(shifted, def.qualities),
    slots: def.numerals.map((numeral, i) => slotOf(numeral, def.qualities[i])),
    ...(def.direction === 'asc' ? { bassDirection: 'up' as const }
      : def.direction === 'desc' ? { bassDirection: 'down' as const } : {}),
  };
}
