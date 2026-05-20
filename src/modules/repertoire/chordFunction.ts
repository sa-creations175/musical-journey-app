import type { ChordFunction } from '../../lib/db';

// Functional-chord parser, renderer, and conversion helpers.
//
// The user works in functional harmony, so chords live in storage as
// { function, quality, bass } with the concrete realisation derived on
// demand from the section's key. Input can arrive in three notations:
//   · number notation:   "4maj7", "2m7", "5(7)", "b6maj7", "7dim", "1/3"
//   · Roman notation:    "IVmaj7", "iim7", "V7", "bVImaj7", "I/iii"
//   · concrete-chord:    "Fmaj7", "Dm7", "Ab", "G/B"   (needs a key)
//
// Output rendering supports four modes, picked app-wide:
//   'numbers'   → "4maj7", "2m7"
//   'roman'     → "IVmaj7", "iim7"
//   'stacked'   → number primary + Roman subscript (JSX-level composition)
//   'concrete'  → "Fmaj7", "Dm7" — derived from the current key

export type NotationMode = 'numbers' | 'roman' | 'stacked' | 'concrete';

// --- Degree / note-name tables --------------------------------------

const DEGREE_BY_SEMI: Record<number, string> = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};
export const SEMI_BY_DEGREE: Record<string, number> = {
  '1': 0, 'b2': 1, '2': 2, 'b3': 3, '3': 4, '4': 5,
  '#4': 6, 'b5': 6, '5': 7, 'b6': 8, '6': 9, 'b7': 10, '7': 11,
};
// Keep two parallel tables so display honours the key's preferred
// accidentals. Flats dominate in the functional label convention, so
// we default to the flat note names at render time.
export const NOTE_NAMES_FLAT =  ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PITCH_CLASS: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9,
  'A#': 10, Bb: 10, B: 11,
};

const ROMAN_UPPER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const ROMAN_LOWER = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];

// --- Key helpers ----------------------------------------------------

/**
 * Pitch class (0..11) for a key name. `"C" | "Db" | "D"...` etc.;
 * enharmonic spellings normalised via PITCH_CLASS. Returns -1 when
 * the input isn't a recognised key.
 */
export function pitchClassOfKey(key: string): number {
  const trimmed = key.trim();
  const pc = PITCH_CLASS[trimmed];
  return pc === undefined ? -1 : pc;
}

export function keyPrefersFlats(key: string): boolean {
  // Tonal convention: keys with flat accidentals in their signature
  // prefer flat spellings; F major also prefers flats (has Bb).
  return /b$/.test(key) || key === 'F';
}

// --- Classifier ------------------------------------------------------

/** Decide which notation the user typed. Returns null for empty input. */
function detectNotation(input: string): 'number' | 'roman' | 'concrete' | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const first = trimmed[0];
  const second = trimmed[1];
  if (/[0-9]/.test(first)) return 'number';
  if ((first === 'b' || first === '#') && /[0-9]/.test(second ?? '')) return 'number';
  if (/[IVX]/.test(first) || /[ivx]/.test(first)) return 'roman';
  if ((first === 'b' || first === '#') && /[IVXivx]/.test(second ?? '')) return 'roman';
  if (/[A-G]/.test(first)) return 'concrete';
  return null;
}

// --- Parsers --------------------------------------------------------

function splitSlash(input: string): { chord: string; bass: string } {
  const idx = input.indexOf('/');
  if (idx < 0) return { chord: input, bass: '' };
  return { chord: input.slice(0, idx), bass: input.slice(idx + 1) };
}

function parseNumberFunction(token: string): string | null {
  const m = token.match(/^([b#]*)([1-7])/);
  if (!m) return null;
  const accidentals = m[1];
  const digit = m[2];
  if (accidentals === '' || accidentals === 'b' || accidentals === '#') {
    return accidentals + digit;
  }
  return null;
}

function parseNumberNotation(input: string): ChordFunction | null {
  const { chord, bass } = splitSlash(input);
  const m = chord.match(/^([b#]*[1-7])(.*)$/);
  if (!m) return null;
  const fn = m[1];
  const quality = m[2].trim();
  const result: ChordFunction = { function: fn, quality, raw: input };
  if (bass !== '') {
    const bassFn = parseNumberFunction(bass.trim());
    if (bassFn) result.bass = bassFn;
  }
  return result;
}

function parseRomanFunction(token: string): { degree: string; isLower: boolean } | null {
  const m = token.match(/^([b#]*)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)/);
  if (!m) return null;
  const accidentals = m[1];
  const roman = m[2];
  const isLower = roman === roman.toLowerCase();
  const upperList = isLower ? ROMAN_LOWER : ROMAN_UPPER;
  const idx = upperList.indexOf(roman);
  if (idx < 0) return null;
  return { degree: accidentals + String(idx + 1), isLower };
}

function parseRomanNotation(input: string): ChordFunction | null {
  const { chord, bass } = splitSlash(input);
  const parsed = parseRomanFunction(chord);
  if (!parsed) return null;
  // Strip the consumed Roman numeral from the start; what's left is
  // quality. For lowercase roman without explicit quality, infer "m";
  // uppercase with no explicit suffix stays bare (major-ish).
  const consumedLen = chord.search(/[^b#IVXivx]/) === -1 ? chord.length : chord.search(/[^b#IVXivx]/);
  let quality = chord.slice(consumedLen).trim();
  if (quality === '' && parsed.isLower) quality = 'm';
  const result: ChordFunction = { function: parsed.degree, quality, raw: input };
  if (bass !== '') {
    // Bass can be Roman numeral or number — try both.
    const bassRoman = parseRomanFunction(bass.trim());
    if (bassRoman) {
      result.bass = bassRoman.degree;
    } else {
      const bassNum = parseNumberFunction(bass.trim());
      if (bassNum) result.bass = bassNum;
    }
  }
  return result;
}

function parseConcreteNotation(input: string, sectionKey?: string): ChordFunction | null {
  const { chord, bass } = splitSlash(input);
  const rootMatch = chord.match(/^([A-G])([#b]?)(.*)$/);
  if (!rootMatch) return null;
  const [, letter, accidental, rest] = rootMatch;
  const rootName = letter + accidental;
  const rootPc = PITCH_CLASS[rootName];
  if (rootPc === undefined) return null;
  const quality = rest.trim();

  if (!sectionKey) {
    // Without a key we can't compute the function. Stash the input
    // and flag it for later re-parsing when the section's key is set.
    return { function: '', quality, raw: input, unparsed: true };
  }
  const keyPc = pitchClassOfKey(sectionKey);
  if (keyPc < 0) {
    return { function: '', quality, raw: input, unparsed: true };
  }
  const interval = ((rootPc - keyPc) % 12 + 12) % 12;
  const fn = DEGREE_BY_SEMI[interval];
  const result: ChordFunction = { function: fn, quality, raw: input };
  if (bass !== '') {
    const bm = bass.match(/^([A-G])([#b]?)/);
    if (bm) {
      const bassName = bm[1] + (bm[2] ?? '');
      const bassPc = PITCH_CLASS[bassName];
      if (bassPc !== undefined) {
        const bassInterval = ((bassPc - keyPc) % 12 + 12) % 12;
        result.bass = DEGREE_BY_SEMI[bassInterval];
      }
    }
  }
  return result;
}

/**
 * Parse any of the three supported notations into a ChordFunction.
 * Returns `null` on empty input; returns an `unparsed: true` record
 * when the input is non-empty but couldn't be mapped to a functional
 * position (so the caller can still render raw text with a warning).
 */
export function parseChordFunction(input: string, sectionKey?: string): ChordFunction | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const kind = detectNotation(trimmed);
  if (kind === null) {
    return { function: '', quality: '', raw: trimmed, unparsed: true };
  }
  let parsed: ChordFunction | null;
  switch (kind) {
    case 'number':   parsed = parseNumberNotation(trimmed); break;
    case 'roman':    parsed = parseRomanNotation(trimmed); break;
    case 'concrete': parsed = parseConcreteNotation(trimmed, sectionKey); break;
  }
  if (!parsed) {
    return { function: '', quality: '', raw: trimmed, unparsed: true };
  }
  return parsed;
}

// --- Renderers ------------------------------------------------------

/** Number-notation display. */
export function renderNumbers(cf: ChordFunction): string {
  if (cf.unparsed) return cf.raw ?? '';
  const base = cf.function + cf.quality;
  if (cf.bass) return `${base}/${cf.bass}`;
  return base;
}

/** Convert a function label ("b6") to its Roman numeral given a case
 *  determined by the quality (lowercase for minor, uppercase for
 *  major / dominant / diminished conventionally). */
function functionToRoman(fn: string, quality: string): string {
  const m = fn.match(/^([b#]*)([1-7])$/);
  if (!m) return fn;
  const accidentals = m[1];
  const degree = parseInt(m[2], 10) - 1;
  // Case rule: explicit "m" (not "maj") in quality → lowercase.
  // Otherwise uppercase.
  const qLower = quality.toLowerCase();
  const isMinorish =
    qLower.startsWith('m') && !qLower.startsWith('maj');
  const isDim = qLower.startsWith('dim') || qLower.startsWith('°');
  const useLower = isMinorish || isDim;
  const list = useLower ? ROMAN_LOWER : ROMAN_UPPER;
  return accidentals + list[degree];
}

/** Roman-numeral display. Minor qualities fold case into the numeral
 *  so the explicit "m" drops from the quality. */
export function renderRoman(cf: ChordFunction): string {
  if (cf.unparsed) return cf.raw ?? '';
  const roman = functionToRoman(cf.function, cf.quality);
  // When we lowercased the Roman because quality had "m", drop the
  // leading "m" from the quality string. Keep "maj", "m7b5", "m7"
  // → "m7" stays but it's already implied by lowercase so strip the
  // literal "m". Handle the common cases pragmatically.
  let quality = cf.quality;
  const qLower = quality.toLowerCase();
  if (qLower.startsWith('m') && !qLower.startsWith('maj')) {
    // Drop the leading "m" since the lowercase numeral implies minor.
    quality = quality.slice(1);
  }
  let out = roman + quality;
  if (cf.bass) out += '/' + functionToRoman(cf.bass, '');
  return out;
}

/** Concrete-chord-name display. Requires the section's key. */
export function renderConcrete(cf: ChordFunction, sectionKey?: string): string {
  if (cf.unparsed) return cf.raw ?? '';
  if (!sectionKey) return renderNumbers(cf);
  const keyPc = pitchClassOfKey(sectionKey);
  if (keyPc < 0) return renderNumbers(cf);
  const semi = SEMI_BY_DEGREE[cf.function];
  if (semi === undefined) return renderNumbers(cf);
  const names = keyPrefersFlats(sectionKey) ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const rootName = names[(keyPc + semi) % 12];
  let out = rootName + cf.quality;
  if (cf.bass) {
    const bassSemi = SEMI_BY_DEGREE[cf.bass];
    if (bassSemi !== undefined) out += '/' + names[(keyPc + bassSemi) % 12];
  }
  return out;
}

/** Plain-text render per mode. For 'stacked' this returns the number
 *  line; the Roman line is rendered separately by the JSX caller. */
export function renderChordFunction(
  cf: ChordFunction,
  mode: NotationMode,
  sectionKey?: string,
): string {
  switch (mode) {
    case 'numbers':  return renderNumbers(cf);
    case 'roman':    return renderRoman(cf);
    case 'concrete': return renderConcrete(cf, sectionKey);
    case 'stacked':  return renderNumbers(cf);
  }
}

/**
 * Display-safe render. Same as `renderChordFunction` but tolerates an
 * undefined / empty chord (returns "") and preserves the user's
 * original input verbatim when the chord couldn't be parsed
 * (`unparsed: true`). Used wherever the UI shows a chord glyph the
 * user is about to edit — they should see what they typed, not a
 * canonicalised re-render.
 */
export function chordToDisplay(
  chord: ChordFunction | undefined,
  mode: NotationMode,
  sectionKey?: string,
): string {
  if (!chord || isEmpty(chord)) return '';
  if (chord.unparsed) return chord.raw ?? '';
  return renderChordFunction(chord, mode, sectionKey);
}

// --- Interop with the existing progression detector -----------------

/**
 * Convert a ChordFunction to a plain-ASCII Roman numeral token suitable
 * for `detectProgressions`. Strips the extras the detector ignores
 * (extensions, bass) but keeps quality information embedded in case
 * (uppercase vs lowercase Roman).
 */
export function toRomanToken(cf: ChordFunction): string {
  if (cf.unparsed) return '';
  return functionToRoman(cf.function, cf.quality);
}

// --- Utility --------------------------------------------------------

/** True when a ChordFunction has nothing meaningful — an empty slot. */
export function isEmpty(cf: ChordFunction | undefined | null): boolean {
  if (!cf) return true;
  if (cf.unparsed) return (cf.raw ?? '').trim() === '';
  return cf.function === '' && cf.quality === '' && !cf.bass;
}
