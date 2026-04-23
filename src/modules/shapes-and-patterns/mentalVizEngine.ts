import {
  CHORD_QUALITIES,
  CHORD_QUALITY_BY_ID,
  KEYS,
  QUALITY_INTERVALS,
  keyPrefersFlats,
} from './catalog';

// Flashcard pool: only qualities whose root-position and inversion
// shapes are genuinely practisable on a single hand. Extensions with
// 5+ notes are valuable vocabulary but blow up the keyboard visual,
// so we hold the flashcard pool to triads, sevenths, and sixths.
const FLASHCARD_QUALITY_IDS = new Set([
  'maj', 'min', 'dim', 'aug', 'sus2', 'sus4',
  'maj7', 'min7', 'dom7', 'm7b5', 'dim7', 'mmaj7',
  'maj6', 'min6',
]);

export const FLASHCARD_QUALITIES = CHORD_QUALITIES.filter(
  q => FLASHCARD_QUALITY_IDS.has(q.id),
);

// Pitch-class → preferred spelling. Keys that live in the flat world
// get flat spellings for chord notes, sharp world gets sharps. Keeps
// note lists reading like they would on a chart ("Ab Cmaj7" would be
// weirder than "Ab Cm7b5").
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function pcOf(name: string): number {
  const map: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4,
    'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9,
    'A#': 10, 'Bb': 10, 'B': 11,
  };
  return map[name] ?? 0;
}

export function spellNote(pc: number, useFlats: boolean): string {
  const idx = ((pc % 12) + 12) % 12;
  return (useFlats ? FLAT_NAMES : SHARP_NAMES)[idx];
}

/**
 * Given a root key, a quality id, and an inversion number, return
 * absolute MIDI-ish note positions starting in a comfortable octave
 * for the keyboard visual (startOctave=4). Inversions are computed by
 * rotating the root-position stack and pushing the bottom `n` notes
 * up an octave — the usual definition.
 */
export function buildChordNotes(
  rootKey: string,
  qualityId: string,
  inversion: number,
): Array<{ note: string; octave: number; pc: number }> {
  const intervals = QUALITY_INTERVALS[qualityId] ?? [0, 4, 7];
  const rootPc = pcOf(rootKey);
  const useFlats = keyPrefersFlats(rootKey);
  const rooted = intervals.map(iv => rootPc + iv); // PCs above C=0, may exceed 11

  // Apply inversion: rotate the stack, and bump the moved notes up
  // an octave so they stay *above* the new bass.
  const rotated: number[] = [];
  const inv = ((inversion % rooted.length) + rooted.length) % rooted.length;
  for (let i = 0; i < rooted.length; i++) {
    const src = (i + inv) % rooted.length;
    const bump = i + inv >= rooted.length ? 12 : 0;
    rotated.push(rooted[src] + bump);
  }
  // Normalise so the bass lands inside [0, 11] of the starting octave.
  const minNote = Math.min(...rotated);
  const shiftDown = Math.floor(minNote / 12) * 12;
  const normalised = rotated.map(n => n - shiftDown);

  const startOct = 4;
  return normalised.map(n => {
    const pc = ((n % 12) + 12) % 12;
    const octave = startOct + Math.floor(n / 12);
    return {
      note: spellNote(pc, useFlats),
      octave,
      pc,
    };
  });
}

/** Inversion count for a quality (= number of notes in the stack). */
export function inversionsFor(qualityId: string): number {
  return (QUALITY_INTERVALS[qualityId] ?? [0, 4, 7]).length;
}

/** Human-facing label for an inversion index. */
export function inversionLabel(inv: number, totalNotes: number): string {
  if (inv === 0) return 'root position';
  if (inv === 1) return '1st inversion';
  if (inv === 2) return '2nd inversion';
  if (inv === 3) return '3rd inversion';
  // Anything beyond 3rd is unusual (extensions), label generically.
  return `${inv}${inv >= 4 ? 'th' : ''} inversion (${totalNotes}-note stack)`;
}

export interface ShapeVizCard {
  variant: 'shape-viz';
  rootKey: string;
  qualityId: string;
  qualityLabel: string;
  chordName: string;        // "Abmaj7"
  inversion: number;
  inversionLabel: string;   // "root position"
  notes: Array<{ note: string; octave: number; pc: number }>;
}

export interface TranspositionCard {
  variant: 'mental-transposition';
  rootKey: string;
  qualityId: string;
  chordName: string;
  fromInversion: number;
  fromInversionLabel: string;
  fromNotes: Array<{ note: string; octave: number; pc: number }>;
  toInversion: number;
  toInversionLabel: string;
  toNotes: Array<{ note: string; octave: number; pc: number }>;
}

export type FlashcardCard = ShapeVizCard | TranspositionCard;

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function chordName(rootKey: string, qualityId: string): string {
  const q = CHORD_QUALITY_BY_ID.get(qualityId);
  return `${rootKey}${q?.suffix ?? ''}`;
}

export function generateShapeVizCard(): ShapeVizCard {
  const rootKey = pickRandom(KEYS);
  const quality = pickRandom(FLASHCARD_QUALITIES);
  const nNotes = inversionsFor(quality.id);
  const inv = Math.floor(Math.random() * nNotes);
  return {
    variant: 'shape-viz',
    rootKey,
    qualityId: quality.id,
    qualityLabel: quality.label,
    chordName: chordName(rootKey, quality.id),
    inversion: inv,
    inversionLabel: inversionLabel(inv, nNotes),
    notes: buildChordNotes(rootKey, quality.id, inv),
  };
}

export function generateTranspositionCard(): TranspositionCard {
  const rootKey = pickRandom(KEYS);
  const quality = pickRandom(FLASHCARD_QUALITIES);
  const nNotes = inversionsFor(quality.id);
  const from = Math.floor(Math.random() * nNotes);
  // Pick a different "to" inversion so the card always requires
  // mental movement.
  let to = Math.floor(Math.random() * nNotes);
  if (nNotes > 1 && to === from) to = (to + 1) % nNotes;
  return {
    variant: 'mental-transposition',
    rootKey,
    qualityId: quality.id,
    chordName: chordName(rootKey, quality.id),
    fromInversion: from,
    fromInversionLabel: inversionLabel(from, nNotes),
    fromNotes: buildChordNotes(rootKey, quality.id, from),
    toInversion: to,
    toInversionLabel: inversionLabel(to, nNotes),
    toNotes: buildChordNotes(rootKey, quality.id, to),
  };
}

export function generateCardFor(variantId: string): FlashcardCard {
  if (variantId === 'mental-transposition') return generateTranspositionCard();
  return generateShapeVizCard();
}

/** Parse an integer prefix like "5" from "5-card set". */
export function parseCardCountFromName(name: string, fallback = 10): number {
  const m = name.trim().match(/^(\d+)/);
  if (!m) return fallback;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(100, n);
}
