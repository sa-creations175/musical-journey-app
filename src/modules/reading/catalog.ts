/**
 * Reading catalog — notation decoding. Static data, no UI, no Dexie.
 *
 * Three skills under ONE moduleRef ('reading'), distinguished by an
 * itemRef prefix. The goal is skimming a chart and decoding it fast,
 * not fluent transposing sight-reading; wherever a dimension would add
 * items without adding a skill that serves that, it is not here.
 *
 * ---------------------------------------------------------------
 * THE ITEMREF SCHEMA CANNOT EXPRESS RENDER-TIME VARIATION
 *
 * This is the load-bearing property of the whole file. Four things
 * vary when a card is DRAWN and are not part of what the card asks:
 *
 *   · frame        — single staff or grand staff
 *   · stack height — which octave a chord is drawn at
 *   · key overlay  — whether a key signature is present, and which
 *   · accidental spelling under an overlay
 *
 * None of them has a segment in any itemRef below, and none can be
 * smuggled into one: every ref is built by a constructor here from a
 * closed set of enum-typed parts, and the parsers reject anything
 * with the wrong arity. If the schema could express these, something
 * eventually would, and the same card would fragment into a dozen
 * spacing rows that are all the same skill.
 *
 * The point of the variation is that it forces READING rather than
 * recognising a fixed picture. Encoding it would defeat itself.
 * ---------------------------------------------------------------
 */

// =====================================================================
// Skill 1 — Key signatures
// =====================================================================

/**
 * The thirteen signatures, six flats through six sharps.
 *
 * SEVEN of each is deliberately absent. C-sharp major (7♯) and C-flat
 * major (7♭) name music that is universally written as D-flat and B,
 * so drilling them trains a spelling nobody uses. G-flat and F-sharp
 * stay — both genuinely appear.
 *
 * `id` is the accidental count plus its type, which is the thing the
 * signature actually IS. Naming the id after a key ('gb') would have
 * silently picked one of the two modes that share it.
 */
export type SignatureId =
  | '6f' | '5f' | '4f' | '3f' | '2f' | '1f'
  | '0'
  | '1s' | '2s' | '3s' | '4s' | '5s' | '6s';

export type KeyMode = 'major' | 'minor';

/** Order of accidentals as they are written on the staff. */
export const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const;
export const FLAT_ORDER  = ['B', 'E', 'A', 'D', 'G', 'C', 'F'] as const;

export interface SignatureDef {
  id: SignatureId;
  /** How many accidentals are written. 0–6. */
  count: number;
  /** Which kind. `null` only for the empty signature. */
  accidental: 'sharp' | 'flat' | null;
  /** Tonic for each mode — the answer to "which key is this?". */
  major: string;
  minor: string;
}

export const SIGNATURES: ReadonlyArray<SignatureDef> = [
  { id: '6f', count: 6, accidental: 'flat',  major: 'Gb', minor: 'Eb' },
  { id: '5f', count: 5, accidental: 'flat',  major: 'Db', minor: 'Bb' },
  { id: '4f', count: 4, accidental: 'flat',  major: 'Ab', minor: 'F'  },
  { id: '3f', count: 3, accidental: 'flat',  major: 'Eb', minor: 'C'  },
  { id: '2f', count: 2, accidental: 'flat',  major: 'Bb', minor: 'G'  },
  { id: '1f', count: 1, accidental: 'flat',  major: 'F',  minor: 'D'  },
  { id: '0',  count: 0, accidental: null,    major: 'C',  minor: 'A'  },
  { id: '1s', count: 1, accidental: 'sharp', major: 'G',  minor: 'E'  },
  { id: '2s', count: 2, accidental: 'sharp', major: 'D',  minor: 'B'  },
  { id: '3s', count: 3, accidental: 'sharp', major: 'A',  minor: 'F#' },
  { id: '4s', count: 4, accidental: 'sharp', major: 'E',  minor: 'C#' },
  { id: '5s', count: 5, accidental: 'sharp', major: 'B',  minor: 'G#' },
  { id: '6s', count: 6, accidental: 'sharp', major: 'F#', minor: 'D#' },
];

/**
 * The three question directions.
 *
 *   name  — notation → key name        ("this signature is … ?")
 *   count — key name → accidental count ("how many in D major?")
 *   which — notation → which accidentals ("name them, in order")
 *
 * MAJOR AND MINOR ARE SEPARATE ITEMS AND THIS IS NOT DOUBLE-COUNTING.
 * The question defines the item: "two sharps → which major?" (D) and
 * "two sharps → which minor?" (B minor) are two different recalls that
 * happen to share one image. Under `count` the two even share an
 * answer, and they are still two questions — the prompt is the key
 * name, and D major and B minor are different prompts.
 */
export type SignatureDirection = 'name' | 'count' | 'which';

export const SIGNATURE_DIRECTIONS: ReadonlyArray<SignatureDirection> =
  ['name', 'count', 'which'];

export const KEY_MODES: ReadonlyArray<KeyMode> = ['major', 'minor'];

/** `sig:{signature}:{mode}:{direction}` */
export function signatureItemRef(
  id: SignatureId,
  mode: KeyMode,
  direction: SignatureDirection,
): string {
  return `sig:${id}:${mode}:${direction}`;
}

// =====================================================================
// Skill 2 — Note recognition
// =====================================================================

export type Clef = 'treble' | 'bass';

export const CLEFS: ReadonlyArray<Clef> = ['treble', 'bass'];

/**
 * Staff positions, as diatonic steps from the bottom line.
 *
 *   0  = bottom line          8  = top line
 *   odd = space, even = line
 *
 * The staff itself is 0–8 (five lines, four spaces). The range extends
 * two ledger lines either side: below runs -1 (space under the staff),
 * -2 (first ledger line), -3, -4 (second ledger line), and above
 * mirrors it at 9–12. Seventeen positions per clef.
 *
 * TWO LEDGER LINES IS THE WHOLE RANGE, on purpose. Past that a note
 * gets counted rather than read, and it is vanishingly rare in the
 * charts this module exists to serve.
 *
 * Position is IDENTITY here, not pitch — the pitch follows from
 * (position, clef). That is also why there is no key signature on
 * these cards: the answer ignores it, so drawing one would imply it
 * matters. Accidentals belong to skill 3.
 */
export const NOTE_POSITION_MIN = -4;
export const NOTE_POSITION_MAX = 12;

export const NOTE_POSITIONS: ReadonlyArray<number> = Array.from(
  { length: NOTE_POSITION_MAX - NOTE_POSITION_MIN + 1 },
  (_, i) => NOTE_POSITION_MIN + i,
);

/** `note:{clef}:{position}` — position may be negative, e.g.
 *  `note:bass:-2`. */
export function noteItemRef(clef: Clef, position: number): string {
  return `note:${clef}:${position}`;
}

// =====================================================================
// Skill 3 — Chord identification
// =====================================================================

/**
 * The answer is the CHORD NAME — see a stack, say "E minor".
 *
 * KEY IS NOT PART OF IDENTITY. Reading E-G-B is the same act in every
 * key, so the key signature is a render-time overlay. This is the
 * decision that keeps the set in the dozens rather than the hundreds:
 * multiplying these qualities by twelve keys would produce a set that
 * sat at low single-digit coverage for years.
 *
 * SHAPE READING IS NOT A SEPARATE SKILL. Naming the chord subsumes it
 * — you cannot say "E minor" without having read the pattern.
 */
export type ChordFamily = 'triad' | 'seventh' | 'open';

export interface ChordQualityDef {
  id: string;
  label: string;
  family: ChordFamily;
  /** Semitones above the root, root position. Drives rendering and is
   *  the definition of the quality. */
  intervals: readonly number[];
}

export const CHORD_QUALITIES: ReadonlyArray<ChordQualityDef> = [
  // Triads
  { id: 'maj',     label: 'major',            family: 'triad',   intervals: [0, 4, 7] },
  { id: 'min',     label: 'minor',            family: 'triad',   intervals: [0, 3, 7] },
  { id: 'dim',     label: 'diminished',       family: 'triad',   intervals: [0, 3, 6] },
  { id: 'aug',     label: 'augmented',        family: 'triad',   intervals: [0, 4, 8] },
  // Sevenths
  { id: 'dom7',    label: 'dominant 7th',     family: 'seventh', intervals: [0, 4, 7, 10] },
  { id: 'maj7',    label: 'major 7th',        family: 'seventh', intervals: [0, 4, 7, 11] },
  { id: 'min7',    label: 'minor 7th',        family: 'seventh', intervals: [0, 3, 7, 10] },
  { id: 'halfdim', label: 'half-diminished',  family: 'seventh', intervals: [0, 3, 6, 10] },
  { id: 'dim7',    label: 'diminished 7th',   family: 'seventh', intervals: [0, 3, 6, 9] },
  // Open left-hand shapes that show up in real charts. Single
  // position each — they ARE a voicing, so inverting one would make
  // it a different shape rather than the same shape re-stacked.
  { id: 'octave',  label: 'octave',           family: 'open',    intervals: [0, 12] },
  { id: 'r5',      label: 'root–fifth',       family: 'open',    intervals: [0, 7] },
  { id: 'r5oct',   label: 'root–fifth–octave', family: 'open',   intervals: [0, 7, 12] },
  { id: 'r7',      label: 'root–seventh',     family: 'open',    intervals: [0, 10] },
  { id: 'r10',     label: 'root–tenth',       family: 'open',    intervals: [0, 16] },
];

/**
 * Which chord tone is on the bottom.
 *
 * NOT the same thing as stack height, which is render-time. Inversion
 * changes the interval pattern you read off the staff; height only
 * moves the whole shape up or down the page. A first-inversion C major
 * and a root-position one are genuinely different decodes that reach
 * the same answer, which is exactly the shape of the key-signature
 * major/minor split.
 */
export type ChordPosition = 'root' | 'inv1' | 'inv2' | 'inv3';

export const TRIAD_POSITIONS: ReadonlyArray<ChordPosition> =
  ['root', 'inv1', 'inv2'];
export const SEVENTH_POSITIONS: ReadonlyArray<ChordPosition> =
  ['root', 'inv1', 'inv2', 'inv3'];
export const OPEN_POSITIONS: ReadonlyArray<ChordPosition> = ['root'];

export function positionsForFamily(
  family: ChordFamily,
): ReadonlyArray<ChordPosition> {
  if (family === 'triad')   return TRIAD_POSITIONS;
  if (family === 'seventh') return SEVENTH_POSITIONS;
  return OPEN_POSITIONS;
}

/**
 * Which clefs a quality is drilled in.
 *
 * The open shapes are LEFT-HAND shapes by definition — that is what
 * makes them the ones worth drilling — so they are bass only. Triads
 * and sevenths are read in both, because bass-clef stack reading is
 * its own weakness and rolling it into the treble item would hide it.
 */
export function clefsForFamily(family: ChordFamily): ReadonlyArray<Clef> {
  return family === 'open' ? ['bass'] : CLEFS;
}

/** `chord:{quality}:{position}:{clef}` */
export function chordItemRef(
  qualityId: string,
  position: ChordPosition,
  clef: Clef,
): string {
  return `chord:${qualityId}:${position}:${clef}`;
}

/**
 * Chord-selection mix under the key overlay. Not part of identity —
 * this weights which cards get DRAWN with a signature, and the buckets
 * are about what the signature implies, not about the chord.
 *
 * The unusual bucket exists so the answer cannot come from
 * expectation. If only plausible chords ever appeared under a
 * signature, the drill would teach the usual suspects for that key
 * instead of actually reading the accidentals.
 */
export const OVERLAY_MIX = {
  diatonic: 0.70,
  borrowed: 0.20,
  unusual:  0.10,
} as const;

// =====================================================================
// Enumeration — the single source every count derives from
// =====================================================================

export function enumerateSignatureItems(): string[] {
  const out: string[] = [];
  for (const sig of SIGNATURES) {
    for (const mode of KEY_MODES) {
      for (const dir of SIGNATURE_DIRECTIONS) {
        out.push(signatureItemRef(sig.id, mode, dir));
      }
    }
  }
  return out;
}

export function enumerateNoteItems(): string[] {
  const out: string[] = [];
  for (const clef of CLEFS) {
    for (const pos of NOTE_POSITIONS) out.push(noteItemRef(clef, pos));
  }
  return out;
}

export function enumerateChordItems(): string[] {
  const out: string[] = [];
  for (const q of CHORD_QUALITIES) {
    for (const clef of clefsForFamily(q.family)) {
      for (const pos of positionsForFamily(q.family)) {
        out.push(chordItemRef(q.id, pos, clef));
      }
    }
  }
  return out;
}

/** Every Reading itemRef. Counts derive from this, never by hand. */
export function enumerateAllReadingItems(): string[] {
  return [
    ...enumerateSignatureItems(),
    ...enumerateNoteItems(),
    ...enumerateChordItems(),
  ];
}

// =====================================================================
// Parsing — the guard that keeps render-time variation out
// =====================================================================

export type ReadingSkill = 'sig' | 'note' | 'chord';

export type ParsedReadingItemRef =
  | { skill: 'sig'; signature: SignatureId; mode: KeyMode; direction: SignatureDirection }
  | { skill: 'note'; clef: Clef; position: number }
  | { skill: 'chord'; qualityId: string; position: ChordPosition; clef: Clef };

const SIGNATURE_IDS = new Set<string>(SIGNATURES.map(s => s.id));
const QUALITY_IDS = new Set<string>(CHORD_QUALITIES.map(q => q.id));

/**
 * Parse an itemRef, or null when it is not a well-formed Reading ref.
 *
 * STRICT ON ARITY on purpose. A ref carrying an extra segment — a key,
 * a frame, an octave — is rejected rather than tolerated, so the
 * schema's promise is enforced at runtime and not only by convention.
 */
export function parseReadingItemRef(ref: string): ParsedReadingItemRef | null {
  const parts = ref.split(':');

  if (parts[0] === 'sig') {
    if (parts.length !== 4) return null;
    const [, sig, mode, dir] = parts;
    if (!SIGNATURE_IDS.has(sig)) return null;
    if (mode !== 'major' && mode !== 'minor') return null;
    if (dir !== 'name' && dir !== 'count' && dir !== 'which') return null;
    return { skill: 'sig', signature: sig as SignatureId, mode, direction: dir };
  }

  if (parts[0] === 'note') {
    if (parts.length !== 3) return null;
    const [, clef, pos] = parts;
    if (clef !== 'treble' && clef !== 'bass') return null;
    if (!/^-?\d+$/.test(pos)) return null;
    const position = Number(pos);
    if (position < NOTE_POSITION_MIN || position > NOTE_POSITION_MAX) return null;
    return { skill: 'note', clef, position };
  }

  if (parts[0] === 'chord') {
    if (parts.length !== 4) return null;
    const [, quality, position, clef] = parts;
    if (!QUALITY_IDS.has(quality)) return null;
    if (position !== 'root' && position !== 'inv1'
        && position !== 'inv2' && position !== 'inv3') return null;
    if (clef !== 'treble' && clef !== 'bass') return null;
    return { skill: 'chord', qualityId: quality, position, clef };
  }

  return null;
}

/** Which skill an itemRef belongs to, or null if it is not one of ours. */
export function readingSkillForItemRef(ref: string): ReadingSkill | null {
  return parseReadingItemRef(ref)?.skill ?? null;
}
