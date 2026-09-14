/**
 * What a chord slot in the loop builder says.
 *
 * =====================================================================
 * A NAME OR A DEGREE (spec §7). "Cmaj7", "G7", "F♯m7♭5" name a chord;
 * "1", "5", "6m", "4", "b7" are degrees of the key. A degree with no
 * quality of its own takes the one its place in the major scale gives
 * (1 major, 2 minor, 3 minor, 4 major, 5 major, 6 minor, 7 diminished),
 * which is the walked prototype's rule. A raised or lowered degree has
 * no place in the major scale, so a bare one is major: ♭7 is the ♭VII.
 *
 * THE QUALITIES ARE THE READER'S. A suffix is matched against the same
 * table the reader names chords with (`READER_QUALITIES`, written by
 * `qualitySymbol`), so a slot resolves to exactly the chord the board
 * would call it. The other ways people type the same chords — maj, min,
 * -, M7, Δ, ø, dim, °, b and # for ♭ and ♯ — are listed below by quality.
 * Anything else does not parse, and the slot turns red.
 * =====================================================================
 */
import { DEFAULT_PROGRESSION_SPELLING } from '../progressionSpellingShape';
import { pitchClassOf } from '../spelling';
import { READER_QUALITIES, qualitySymbol } from './reader';

export interface SlotChord {
  rootPc: number;
  /** The reader's quality id. */
  qualityId: string;
  /** Semitones above the root. */
  intervals: ReadonlyArray<number>;
}

/** The major scale's offsets, by degree. */
const DEGREE_SEMIS = [0, 2, 4, 5, 7, 9, 11] as const;

/** The quality a bare degree takes. */
const DIATONIC = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'] as const;

/** Other spellings, by the reader's quality id. */
const ALIASES: Readonly<Record<string, string>> = {
  maj: 'maj', M: 'maj', min: 'min', '-': 'min',
  M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', min7: 'min7', '-7': 'min7',
  'ø': 'm7b5', 'ø7': 'm7b5', m7b5: 'm7b5', 'm7♭5': 'm7b5',
  dim: 'dim', '°': 'dim', o: 'dim', dim7: 'dim7', '°7': 'dim7', o7: 'dim7',
  mM7: 'minMaj7', mMaj7: 'minMaj7', 'm(maj7)': 'minMaj7',
  '6/9': 'maj6_9', '69': 'maj6_9', 'm6/9': 'min6_9', m69: 'min6_9',
  sus: 'dom7sus4', '7sus': 'dom7sus4', '7sus4': 'dom7sus4',
};

/** Every quality by the suffix the reader writes, then the aliases. */
const BY_SUFFIX: ReadonlyMap<string, string> = (() => {
  const known = new Set(READER_QUALITIES.map(q => q.id));
  const map = new Map<string, string>();
  for (const q of READER_QUALITIES) {
    const symbol = qualitySymbol(q.id, DEFAULT_PROGRESSION_SPELLING);
    if (!map.has(symbol)) map.set(symbol, q.id);
  }
  for (const [alias, id] of Object.entries(ALIASES)) {
    if (known.has(id) && !map.has(alias)) map.set(alias, id);
  }
  return map;
})();

const flatsAndSharps = (text: string) => text.replace(/♭/g, 'b').replace(/♯/g, '#');

function quality(suffix: string): string | null {
  const plain = suffix.replace(/\s+/g, '');
  return BY_SUFFIX.get(plain)
    ?? BY_SUFFIX.get(plain.replace(/b/g, '♭').replace(/#/g, '♯'))
    ?? BY_SUFFIX.get(flatsAndSharps(plain))
    ?? null;
}

const intervalsOf = (id: string) => READER_QUALITIES.find(q => q.id === id)?.intervals ?? null;

/** A slot's text in a key, or null where it does not parse. */
export function parseSlot(text: string, keyPc: number): SlotChord | null {
  const t = text.trim();
  if (t === '') return null;

  const degree = t.match(/^([b#♭♯]?)([1-7])(.*)$/);
  if (degree !== null) {
    const n = Number(degree[2]);
    const shift = degree[1] === 'b' || degree[1] === '♭' ? -1 : degree[1] === '' ? 0 : 1;
    const rootPc = (((keyPc + DEGREE_SEMIS[n - 1] + shift) % 12) + 12) % 12;
    const bare = shift === 0 ? DIATONIC[n - 1] : 'maj';
    const qualityId = degree[3].trim() === '' ? bare : quality(degree[3]);
    const intervals = qualityId === null ? null : intervalsOf(qualityId);
    return qualityId === null || intervals === null ? null : { rootPc, qualityId, intervals };
  }

  const named = t.match(/^([A-Ga-g])([b#♭♯]?)(.*)$/);
  if (named === null) return null;
  const rootPc = pitchClassOf(`${named[1].toUpperCase()}${flatsAndSharps(named[2])}`);
  const qualityId = quality(named[3]);
  const intervals = qualityId === null ? null : intervalsOf(qualityId);
  if (rootPc === null || rootPc === undefined || qualityId === null || intervals === null) return null;
  return { rootPc, qualityId, intervals };
}
