import type { SongChord } from '../../lib/db';

// Map note names (sharp + flat spellings) to pitch class 0..11.
const PITCH_CLASS: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4,
  'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9,
  'A#': 10, 'Bb': 10, 'B': 11,
};

/** True when `raw` starts with a recognisable root note. */
export function hasRoot(raw: string): boolean {
  return /^[A-G][#b]?/.test(raw.trim());
}

export interface ParsedChord {
  root: string;
  quality: SongChord['quality'];
  /** Extension tokens in the order they appeared ("7", "b9", "#11"). */
  extensions: string[];
  bass?: string;
  rawText: string;
  parsed: boolean;
}

/**
 * Parse a chord symbol like "Am7", "Cmaj9", "G/B", "F#dim7", "Ab(add9)".
 * Pragmatic rather than exhaustive — handles the tokens users type in
 * lead sheets. When parsing fails (unrecognised structure), the caller
 * gets `parsed: false` and should render the raw text with a warning
 * icon instead of pretending to understand it.
 */
export function parseChord(raw: string): ParsedChord {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { root: '', quality: 'unknown', extensions: [], rawText: raw, parsed: false };
  }

  // Split off slash bass first.
  const slashIdx = trimmed.indexOf('/');
  const chordPart = slashIdx >= 0 ? trimmed.slice(0, slashIdx).trim() : trimmed;
  const bassPart = slashIdx >= 0 ? trimmed.slice(slashIdx + 1).trim() : '';

  const rootMatch = chordPart.match(/^([A-G])([#b]?)(.*)$/);
  if (!rootMatch) {
    return { root: '', quality: 'unknown', extensions: [], rawText: raw, parsed: false };
  }
  const [, letter, accidental, rest] = rootMatch;
  const root = letter + accidental;
  if (!(root in PITCH_CLASS)) {
    return { root, quality: 'unknown', extensions: [], rawText: raw, parsed: false };
  }

  // Bass note parses separately — optional but only valid if it's a
  // recognisable pitch. Unrecognised slash text still parses the main
  // chord; the bass is just dropped.
  let bass: string | undefined;
  if (bassPart !== '') {
    const bm = bassPart.match(/^([A-G][#b]?)/);
    if (bm && bm[1] in PITCH_CLASS) bass = bm[1];
  }

  // Normalise: strip enclosing parentheses so "(add9)" reads as "add9";
  // also drop spaces so users can type "maj 7" if they want.
  const body = rest.replace(/\s+/g, '').replace(/\(/g, '').replace(/\)/g, '');

  // Tight-bound tokens in roughly the order chord symbols use them.
  // Everything this doesn't recognise stays under `extensions` as-is so
  // the parser fails soft. `parsed` stays true as long as we got a
  // valid root; cross-module features check quality/extensions
  // separately.
  let quality: SongChord['quality'] = 'major';
  const extensions: string[] = [];

  // Walk the body left-to-right collecting recognised tokens.
  let i = 0;
  const lower = body.toLowerCase();

  const consume = (token: string): boolean => {
    if (lower.startsWith(token, i)) { i += token.length; return true; }
    return false;
  };

  // Quality cluster (order matters: "maj7" before "m", "min" before "m").
  if (consume('maj7') || consume('maj9') || consume('maj11') || consume('maj13') || consume('maj')) {
    quality = 'major';
    // The "7" / "9" / "11" / "13" is part of the same token; re-extract.
    const matched = body.slice(0, i);
    const ext = matched.replace(/^maj/i, '');
    if (ext !== '') extensions.push('maj' + ext);
  } else if (consume('min7') || consume('min9') || consume('min11') || consume('min13') || consume('min')) {
    quality = 'minor';
    const matched = body.slice(0, i);
    const ext = matched.replace(/^min/i, '');
    if (ext !== '') extensions.push('m' + ext);
  } else if (consume('m7b5') || consume('ø7') || consume('ø') || consume('halfdim')) {
    quality = 'half-dim';
    extensions.push('7b5');
  } else if (consume('dim7') || consume('dim') || consume('°7') || consume('°') || consume('o')) {
    quality = 'diminished';
    if (body.slice(0, i).endsWith('7')) extensions.push('7');
  } else if (consume('aug7') || consume('aug') || consume('+7') || consume('+')) {
    quality = 'augmented';
    if (body.slice(0, i).endsWith('7')) extensions.push('7');
  } else if (body[0] === 'm' && body[1] !== 'a') {
    // "m" alone (not "maj") → minor.
    quality = 'minor';
    i = 1;
  }

  // Simple 6/7/9/11/13 without a quality prefix → dominant unless major
  // is implied by the opening. Walk the remainder for extension tokens.
  // Allow: 5, 6, 7, 9, 11, 13, sus, sus2, sus4, add9, b5, #5, b9, #9,
  // #11, b13, 6/9 (rare — we just store as "6/9").
  const tail = body.slice(i);
  if (tail !== '') {
    const tokens = tail.match(/(sus2|sus4|sus|add9|add11|add13|b5|#5|b9|#9|#11|b13|6\/9|6|7|9|11|13)/g) ?? [];
    for (const tok of tokens) extensions.push(tok);
    // Numeric extension without quality prefix (e.g. "C7") → dominant.
    if (quality === 'major' && tokens.some(t => ['7', '9', '11', '13'].includes(t)) && !extensions.some(e => e.startsWith('maj'))) {
      quality = 'dominant';
    }
  }

  return {
    root,
    quality,
    extensions,
    bass,
    rawText: raw,
    parsed: true,
  };
}

/** Pitch class 0..11 for a root note name, or -1 if unrecognised. */
export function pitchClassOf(noteName: string): number {
  return PITCH_CLASS[noteName] ?? -1;
}

/**
 * Convert a parsed chord to a Roman-numeral label relative to a given
 * major key. Returns null when the chord or key is unrecognisable.
 *
 * Mapping is diatonic-biased but handles common chromatic cases:
 *   tonic major   → I
 *   tonic minor   → i
 *   supertonic    → ii / II / bII
 *   …etc.
 *
 * Minor-quality chords use lowercase numerals; major-quality use
 * uppercase. Diminished appends "°"; half-dim appends "ø7"; augmented
 * appends "+". Dominant sevenths appear as "V7" / "I7" unless the
 * caller wants something different — keeping it simple here.
 *
 * Flat degrees (b2, b3, b5, b6, b7) get a leading "b" when the chord
 * root sits on that chromatic slot.
 */
export function chordToNumeral(chord: ParsedChord, key: string): string | null {
  if (!chord.parsed || chord.root === '') return null;
  const chordPc = pitchClassOf(chord.root);
  const keyPc = pitchClassOf(key);
  if (chordPc < 0 || keyPc < 0) return null;
  const interval = ((chordPc - keyPc) % 12 + 12) % 12;

  // Map each chromatic interval to a scale-degree string. Diatonic
  // slots get plain 1..7; chromatic slots get flat-biased labels
  // (matches progression catalogue's convention of bII, bIII, etc.).
  const DEGREE: Record<number, { major: string; minor: string; extra: string }> = {
    0:  { major: 'I',   minor: 'i',   extra: ''  },
    1:  { major: 'bII', minor: 'bii', extra: ''  },
    2:  { major: 'II',  minor: 'ii',  extra: ''  },
    3:  { major: 'bIII',minor: 'biii',extra: ''  },
    4:  { major: 'III', minor: 'iii', extra: ''  },
    5:  { major: 'IV',  minor: 'iv',  extra: ''  },
    6:  { major: '#IV', minor: '#iv', extra: ''  },
    7:  { major: 'V',   minor: 'v',   extra: ''  },
    8:  { major: 'bVI', minor: 'bvi', extra: ''  },
    9:  { major: 'VI',  minor: 'vi',  extra: ''  },
    10: { major: 'bVII',minor: 'bvii',extra: ''  },
    11: { major: 'VII', minor: 'vii', extra: '' },
  };

  const slot = DEGREE[interval];
  let numeral: string;
  let suffix = '';
  switch (chord.quality) {
    case 'major':
      numeral = slot.major;
      break;
    case 'dominant':
      numeral = slot.major;
      suffix = '7';
      break;
    case 'minor':
      numeral = slot.minor;
      break;
    case 'diminished':
      numeral = slot.minor + '°';
      break;
    case 'half-dim':
      numeral = slot.minor + 'ø7';
      break;
    case 'augmented':
      numeral = slot.major + '+';
      break;
    default:
      numeral = slot.major;
  }
  return numeral + suffix;
}

/**
 * Parse every chord token in a chord chart (one or more lines, tokens
 * separated by whitespace). Empty tokens are skipped. Returned in
 * flat order so positions align with song-chord table rows.
 */
export function parseChordChart(chart: string): ParsedChord[] {
  const out: ParsedChord[] = [];
  const tokens = chart.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    out.push(parseChord(t));
  }
  return out;
}

/** Convert a chord chart string to Roman numerals in a given key. */
export function chartToNumerals(chart: string, key: string): string[] {
  return parseChordChart(chart)
    .map(c => chordToNumeral(c, key))
    .filter((n): n is string => n !== null);
}
