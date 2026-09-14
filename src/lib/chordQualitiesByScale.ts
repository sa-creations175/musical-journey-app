/**
 * Chord qualities by scale: the seventh chord every scale builds on
 * every degree, and the words the chart says about it.
 *
 * =====================================================================
 * COMPUTED FROM THE SCALE STEPS, NEVER TYPED IN.
 *
 * Silas's decision of 13 Sep 2026, from the walked prototype
 * `chord-qualities-by-scale.html` (v3). Each cell stacks thirds out of
 * the scale itself and names what it finds, so a wrong step shows up as
 * a wrong row rather than hiding in a hand-written grid. The words (row
 * names, the lines under them, the card sentence, the why-line) are the
 * prototype's, verbatim.
 *
 * Shared by the Diatonic Chord Qualities reveal and the Harmonic Diary,
 * which open the one chart.
 * =====================================================================
 */
import { NOTE_NAMES_FLAT, NOTE_NAMES_SHARP } from './spelling';

export type ScaleId =
  | 'major' | 'natural' | 'harmonic' | 'melodic'
  | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian';

/** Semitones above the root, degrees 1 to 7. */
export const SCALE_STEPS: Readonly<Record<ScaleId, ReadonlyArray<number>>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  melodic: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

export interface ScaleRow {
  id: ScaleId;
  /** The row's title. */
  name: string;
  /** The small line under the title. */
  note: string;
  /** How the card sentence names the scale: "In harmonic minor, …". */
  label: string;
}

/** Major and the three minors, in the prototype's order. */
export const MAIN_ROWS: ReadonlyArray<ScaleRow> = [
  { id: 'major', name: 'Major', note: 'Ionian', label: 'major' },
  { id: 'natural', name: 'Natural minor', note: "Aeolian · the relative major's chords, new home", label: 'natural minor' },
  { id: 'harmonic', name: 'Harmonic minor', note: 'raise the 7', label: 'harmonic minor' },
  { id: 'melodic', name: 'Melodic minor', note: 'raise the 6 and 7', label: 'melodic minor' },
];

/** The other modes of major, under the folding heading. */
export const MODE_ROWS: ReadonlyArray<ScaleRow> = [
  { id: 'dorian', name: 'Dorian', note: 'minor with a raised 6', label: 'Dorian' },
  { id: 'phrygian', name: 'Phrygian', note: 'minor with a flat 2', label: 'Phrygian' },
  { id: 'lydian', name: 'Lydian', note: 'major with a raised 4', label: 'Lydian' },
  { id: 'mixolydian', name: 'Mixolydian', note: 'major with a flat 7', label: 'Mixolydian' },
  { id: 'locrian', name: 'Locrian', note: 'minor with a flat 2 and flat 5', label: 'Locrian' },
];

const ROW_OF: Readonly<Record<ScaleId, ScaleRow>> = Object.fromEntries(
  [...MAIN_ROWS, ...MODE_ROWS].map(r => [r.id, r]),
) as Record<ScaleId, ScaleRow>;

export interface Seventh {
  /** The word the card sentence uses. */
  name: string;
  /** What the cell shows. */
  symbol: string;
}

/** Third, fifth and seventh above the chord's root → the quality. */
const QUALITY: Readonly<Record<string, Seventh>> = {
  '4,7,11': { name: 'major 7', symbol: 'maj7' },
  '4,7,10': { name: 'dominant 7', symbol: '7' },
  '3,7,10': { name: 'minor 7', symbol: 'm7' },
  '3,6,10': { name: 'half-diminished', symbol: 'ø' },
  '3,6,9': { name: 'diminished 7', symbol: '°7' },
  // ONE SET OF NAMES, the cards' and the chart's (Silas, 14 Sep 2026).
  '3,7,11': { name: 'minor-major 7', symbol: 'mMaj7' },
  '4,8,11': { name: 'augmented major 7', symbol: '+maj7' },
  '4,8,10': { name: 'augmented 7', symbol: '+7' },
};

/** The chord's third, fifth and seventh, in semitones above its root,
 *  taken from the scale by stacking every other degree. */
function stack(scale: ScaleId, degree: number): [number, number, number] {
  const s = SCALE_STEPS[scale];
  const d = degree - 1;
  const above = (i: number) => (s[(d + i) % 7] + (d + i >= 7 ? 12 : 0) - s[d] + 12) % 12;
  return [above(2), above(4), above(6)];
}

/** The seventh chord `scale` builds on `degree` (1 to 7). */
export function seventhOn(scale: ScaleId, degree: number): Seventh {
  const q = QUALITY[stack(scale, degree).join(',')];
  if (q === undefined) throw new Error(`no seventh-chord quality for ${scale} ${degree}`);
  return q;
}

/** The key a mark is stored under: "harmonic-7". */
export function cellKey(scale: ScaleId, degree: number): string {
  return `${scale}-${degree}`;
}

export function parseCellKey(key: string): { scale: ScaleId; degree: number } | null {
  const m = key.match(/^([a-z]+)-([1-7])$/);
  if (m === null || !(m[1] in SCALE_STEPS)) return null;
  return { scale: m[1] as ScaleId, degree: Number(m[2]) };
}

/**
 * The flat side of the chart spells with flats, the sharp side with
 * sharps: the three minors, Dorian, Phrygian, Mixolydian and Locrian on
 * flats, major and Lydian on sharps, as the prototype does.
 */
const FLAT_SIDE: ReadonlySet<ScaleId> = new Set<ScaleId>(
  ['natural', 'harmonic', 'melodic', 'phrygian', 'locrian', 'dorian', 'mixolydian'],
);

/** The chord in C, and its notes: `{ chord: 'B°7', notes: ['B','D','F','A♭'] }`. */
export function inC(scale: ScaleId, degree: number): { chord: string; notes: string[] } {
  const names = FLAT_SIDE.has(scale) ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const root = SCALE_STEPS[scale][degree - 1];
  const notes = [0, ...stack(scale, degree)].map(i => names[(root + i) % 12]);
  return { chord: `${notes[0]}${seventhOn(scale, degree).symbol}`, notes };
}

/** "In harmonic minor, the 7 chord is diminished 7" */
export function cardTitle(scale: ScaleId, degree: number): string {
  return `In ${ROW_OF[scale].label}, the ${degree} chord is ${seventhOn(scale, degree).name}`;
}

/** "In C harmonic minor:" */
export function inCLabel(scale: ScaleId): string {
  return `In C ${ROW_OF[scale].label}:`;
}

/** "B°7 · B D F A♭" */
export function exampleLine(scale: ScaleId, degree: number): string {
  const { chord, notes } = inC(scale, degree);
  return `${chord} · ${notes.join(' ')}`;
}

const MODE_SHIFT: Readonly<Partial<Record<ScaleId, number>>> = {
  dorian: 1, phrygian: 2, lydian: 3, mixolydian: 4, locrian: 6,
};

/** What the scale did to make this chord. Empty for major, which is
 *  where the others are measured from. */
export function whyLine(scale: ScaleId, degree: number): string {
  if (scale === 'harmonic' || scale === 'melodic') {
    const before = seventhOn('natural', degree).name;
    const after = seventhOn(scale, degree).name;
    if (before !== after) {
      return `Natural minor has ${before} here; raising the ${scale === 'harmonic' ? '7' : '6 and 7'} turns it into ${after}.`;
    }
    return 'Same as natural minor: the raised note is not in this chord.';
  }
  const shift = MODE_SHIFT[scale];
  if (shift !== undefined) {
    return `${ROW_OF[scale].label} is the major scale started on its ${shift + 1}, so this is major's ${((degree - 1 + shift) % 7) + 1} chord.`;
  }
  if (scale === 'natural') {
    return `Natural minor is the relative major started on its 6, so this is major's ${((degree - 1 + 5) % 7) + 1} chord.`;
  }
  return '';
}

/** The row names and short name for a cell, as the dotted list writes
 *  it: "harmonic minor · 7 · °7". */
export function cellLabel(scale: ScaleId, degree: number): string {
  return `${ROW_OF[scale].label} · ${degree} · ${seventhOn(scale, degree).symbol}`;
}

/**
 * The ones Silas reaches for, in his words where he gave them.
 *
 * WHAT A NEW READER'S CHART STARTS WITH, AND NOTHING MORE. The marks are
 * seeded from this once and are the reader's from then on — see
 * `chordQualityMarks.ts`. Verbatim from the prototype's SEED table, the
 * major entries included.
 */
export const SEED_MARKS: Readonly<Record<string, string>> = {
  'natural-1': 'the minor home',
  'natural-2': 'the 2 half-diminished, borrowed into a major key; I Believe I Can Fly',
  'natural-3': 'the ♭3, borrowed into a major key',
  'natural-4': 'the 4 minor, borrowed into a major key: the sad 4',
  'natural-5': 'the minor 5: the soft minor vamp (Am to Em7), no dominant pull',
  'natural-6': 'the ♭6, borrowed into a major key',
  'natural-7': 'the ♭7, borrowed into a major key: the gospel push',
  'harmonic-5': 'the major or dominant 5 in a minor key: minor with a real dominant',
  'harmonic-7': 'the diminished 7 a half step under the root: the pass into the 1',
  'melodic-4': 'the major 4 in a minor key: the bright 4',
  'dorian-4': 'the same bright 4, by its mode name',
  'phrygian-2': 'the ♭2 in minor: the flamenco and gospel slide',
  'lydian-1': 'maj7♯11: the Lydian colour on a major chord',
  'mixolydian-1': 'the dominant 1: blues and gospel home',
  'mixolydian-7': 'the ♭7 chord in a major key, by its mode name',
  'major-1': 'home',
  'major-2': 'the 2 of every 2-5-1',
  'major-4': 'the 4',
  'major-5': 'the 5',
  'major-6': 'the 6 minor',
};
