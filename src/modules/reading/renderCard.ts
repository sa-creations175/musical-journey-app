/**
 * Reading card resolution — ONE function producing both what gets
 * drawn and what the caption says.
 *
 * ---------------------------------------------------------------
 * WHY BOTH COME FROM ONE PLACE
 *
 * The rule this serves is "the render and the caption can never
 * disagree". The literal version of that rule was "derive the caption
 * from the itemRef", and it cannot hold: `chord:maj:root:treble`
 * carries no ROOT, because key-agnosticism is what keeps chord
 * identification at 69 items instead of 828. `sig:3f:major:name`
 * carries no CLEF for the same kind of reason. Those genuinely have
 * to come from render options.
 *
 * So the root and the clef override are picked ONCE, here, and the
 * staff spec and the caption are both read off the same resolved
 * object. Nothing is hand-written and there is no second path for the
 * two to drift apart. If the caption is wrong, the render is wrong in
 * the same way — which is the property that makes this page usable
 * for checking notation you cannot yet read.
 * ---------------------------------------------------------------
 */

import {
  CHORD_QUALITIES,
  FLAT_ORDER,
  SHARP_ORDER,
  SIGNATURES,
  parseReadingItemRef,
  positionsForFamily,
  type ChordPosition,
  type Clef,
  type SignatureDef,
} from './catalog';
import {
  diatonicIndex,
  diatonicStepsForChordTone,
  fromDiatonicIndex,
  ledgerLinesFor,
  pitchAtStaffPosition,
  pitchName,
  scientificPitch,
  withAccidentalGlyphs,
  spellInterval,
  toVexKey,
  type Letter,
  type Pitch,
} from './pitch';

/** Options that vary at RENDER time and are deliberately absent from
 *  every itemRef. Picking them is the caller's job; using them
 *  consistently is this module's. */
export interface ReadingRenderOptions {
  /** Which clef to draw a key signature on. Signatures have no clef in
   *  their identity — the same signature is the same signature on
   *  either staff. Ignored for note and chord items, whose clef IS
   *  identity. */
  clef?: Clef;
  /** Root for a chord item, as a letter plus optional accidental
   *  ("C", "Eb", "F#") and an octave. Absent from the itemRef by
   *  design; reading E-G-B is the same act in every key. */
  root?: { letter: Letter; accidental?: 'b' | '#' | null; octave: number };
  /**
   * Single staff or a braced grand staff. RENDER-TIME, exactly like
   * clef and root — framing changes how a card is drawn, never which
   * card it is, so no itemRef gains a segment and no count moves.
   *
   * Honoured by KEY SIGNATURE cards only. A signature genuinely
   * appears on both staves of piano music, which is the thing worth
   * seeing. A note or chord item's clef IS its identity, so drawing a
   * second staff would either show the answer on the wrong clef or
   * imply the card asks about both. Defaults to single, so nothing
   * that renders today changes.
   */
  frame?: ReadingFrame;
}

export type ReadingFrame = 'single' | 'grand';

export interface ReadingStaffSpec {
  /** `grand` draws treble over bass, braced, with the signature on
   *  both. `clef` is then which staff the CARD is nominally about,
   *  and is what a single-staff render would have used. */
  frame: ReadingFrame;
  clef: Clef;
  /** VexFlow key strings for the notes to draw, low to high. Empty for
   *  a key-signature card, which draws a signature and no notes. */
  keys: string[];
  /** VexFlow key-signature spec ("C", "F#", "Bb"), or null for none. */
  keySignature: string | null;
}

export interface ResolvedReadingCard {
  itemRef: string;
  skill: 'sig' | 'note' | 'chord';
  staff: ReadingStaffSpec;
  /** The answer, and only the answer — nothing the picture already
   *  says. Derived, never authored. */
  caption: string;
}

// ---------------------------------------------------------------------
// Key signatures
// ---------------------------------------------------------------------

/** VexFlow names a signature by the MAJOR key that carries it, for
 *  both modes — the glyphs are identical, so a minor item draws its
 *  relative major's signature and captions the minor. */
function vexKeySignature(sig: SignatureDef): string {
  return sig.major;
}

function accidentalListFor(sig: SignatureDef): string[] {
  if (sig.accidental === null) return [];
  const order = sig.accidental === 'sharp' ? SHARP_ORDER : FLAT_ORDER;
  const mark = sig.accidental === 'sharp' ? '♯' : '♭';
  return order.slice(0, sig.count).map(l => `${l}${mark}`);
}

function signatureCaption(
  sig: SignatureDef,
  mode: 'major' | 'minor',
  direction: 'name' | 'count' | 'which',
): string {
  // SIGNATURES stores tonics as ASCII ('Gb', 'F#') because they are
  // data, not display. The glyph swap happens here, at the caption,
  // so the staff and the label use the same notation vocabulary.
  const tonic = withAccidentalGlyphs(mode === 'major' ? sig.major : sig.minor);
  const key = `${tonic} ${mode}`;
  if (direction === 'which') {
    const list = accidentalListFor(sig);
    return list.length === 0 ? `${key}, no accidentals` : `${key}: ${list.join(' ')}`;
  }
  if (sig.count === 0) return `${key}, no accidentals`;
  const noun = sig.accidental === 'sharp' ? 'sharp' : 'flat';
  return `${key}, ${sig.count} ${noun}${sig.count === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------

const POSITION_LABEL: Readonly<Record<ChordPosition, string>> = {
  root: 'root position',
  inv1: 'first inversion',
  inv2: 'second inversion',
  inv3: 'third inversion',
};

const DEFAULT_ROOT_OCTAVE: Readonly<Record<Clef, number>> = {
  // Puts a root-position triad inside the staff on each clef.
  treble: 4,
  bass: 2,
};

/**
 * Spell every tone of a chord, then rotate for the inversion.
 *
 * INVERSION IS A ROTATION, not a re-spelling: the lowest tone moves to
 * the bottom and the ones below it go up an octave, so the letters and
 * accidentals are unchanged and only the octaves move. That is why a
 * first-inversion C major still reads "C major" — same notes, read
 * from a different bottom.
 *
 * NOTE FOR FUTURE-ME: augmented triads and diminished sevenths are
 * enharmonically symmetric. Their inversions sound identical to the
 * root position and differ only in spelling, so the renders will look
 * "the same chord, respelled". That is correct notation, not a bug.
 */
function chordPitches(
  qualityId: string,
  position: ChordPosition,
  root: Pitch,
): Pitch[] | null {
  const quality = CHORD_QUALITIES.find(q => q.id === qualityId);
  if (!quality) return null;

  const spelled: Pitch[] = [];
  for (let i = 0; i < quality.intervals.length; i++) {
    const semitones = quality.intervals[i];
    const steps = diatonicStepsForChordTone(quality.family, i, semitones);
    if (steps === null) return null;
    const p = spellInterval(root, steps, semitones);
    if (!p) return null;
    spelled.push(p);
  }

  const rotations = positionsForFamily(quality.family).indexOf(position);
  if (rotations < 0) return null;

  const out = spelled.slice();
  for (let r = 0; r < rotations; r++) {
    const lowest = out.shift();
    if (!lowest) return null;
    out.push({ ...lowest, octave: lowest.octave + 1 });
  }
  return out;
}

// ---------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------

/**
 * Resolve an itemRef plus render options into everything a card needs.
 * Returns null for a ref that is not a well-formed Reading item, or a
 * chord whose spelling would need more than a double accidental.
 */
export function resolveReadingCard(
  itemRef: string,
  options: ReadingRenderOptions = {},
): ResolvedReadingCard | null {
  const parsed = parseReadingItemRef(itemRef);
  if (!parsed) return null;

  if (parsed.skill === 'sig') {
    const sig = SIGNATURES.find(s => s.id === parsed.signature);
    if (!sig) return null;
    return {
      itemRef,
      skill: 'sig',
      staff: {
        frame: options.frame ?? 'single',
        clef: options.clef ?? 'treble',
        keys: [],
        keySignature: vexKeySignature(sig),
      },
      caption: signatureCaption(sig, parsed.mode, parsed.direction),
    };
  }

  if (parsed.skill === 'note') {
    const pitch = pitchAtStaffPosition(parsed.clef, parsed.position);
    return {
      itemRef,
      skill: 'note',
      staff: {
        // Neither clef NOR frame is consulted: clef IS identity for a
        // note item, and a grand staff would draw a second clef the
        // card is not asking about.
        frame: 'single',
        clef: parsed.clef,
        keys: [toVexKey(pitch)],
        // No signature, ever: the answer ignores it, so drawing one
        // would imply it matters.
        keySignature: null,
      },
      caption: scientificPitch(pitch),
    };
  }

  const quality = CHORD_QUALITIES.find(q => q.id === parsed.qualityId);
  if (!quality) return null;

  const rootSpec = options.root ?? {
    letter: 'C' as Letter,
    accidental: null,
    octave: DEFAULT_ROOT_OCTAVE[parsed.clef],
  };
  const root: Pitch = {
    letter: rootSpec.letter,
    octave: rootSpec.octave,
    accidental: rootSpec.accidental ?? null,
  };

  const pitches = chordPitches(parsed.qualityId, parsed.position, root);
  if (!pitches) return null;

  // Open shapes are voicings, so "root position" adds nothing — the
  // shape name already says how it is stacked.
  const positionPart =
    quality.family === 'open' ? '' : `, ${POSITION_LABEL[parsed.position]}`;

  return {
    itemRef,
    skill: 'chord',
    staff: {
      // Same reasoning as note items — the clef a chord is read on is
      // part of what the card asks.
      frame: 'single',
      clef: parsed.clef,
      keys: pitches.map(toVexKey),
      // No overlay in this step — all accidentals are written on the
      // notes, which is what makes the spelling visible.
      keySignature: null,
    },
    caption: `${pitchName(root)} ${quality.label}${positionPart}`,
  };
}

/** Exported for tests: what a note item's ledger lines should be. */
export function ledgerInfoForNoteItem(itemRef: string) {
  const parsed = parseReadingItemRef(itemRef);
  if (parsed?.skill !== 'note') return null;
  return ledgerLinesFor(parsed.position);
}

/** Exported for tests — the diatonic span of a resolved chord, used to
 *  assert that inversions really do rotate rather than re-spell. */
export function diatonicSpan(keys: string[]): number {
  if (keys.length === 0) return 0;
  const idx = keys.map(k => {
    const [name, oct] = k.split('/');
    const letter = name[0].toUpperCase() as Letter;
    return diatonicIndex(letter, Number(oct));
  });
  return Math.max(...idx) - Math.min(...idx);
}

export { fromDiatonicIndex };
