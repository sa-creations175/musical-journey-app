/**
 * Geometry and hit-testing for the tappable answer keyboard.
 *
 * =====================================================================
 * THIS FILE KNOWS ABOUT KEYS. IT KNOWS NOTHING ABOUT MUSIC.
 *
 * It can tell you which key a finger landed on. It cannot tell you
 * whether that was the right key, and it must never learn: a tritone is
 * the same interval up or down, so a tritone card accepts its answer in
 * either octave, while an ASCENDING major 7th accepts only the key
 * above the subject. Put the first rule in here and it leaks into every
 * card type that adopts this later.
 *
 * So the contract is: a subject to mark, a set of accepted positions to
 * reveal AFTER the answer, and an emitted press. The card judges.
 * =====================================================================
 *
 * AND NOTHING HERE MAY NARROW THE ANSWER. Four multiple-choice buttons
 * let you answer "tritone of C" by eliminating three wrong options
 * without ever locating the note; the keyboard exists to turn that
 * recognition back into recall. Highlighting candidates, dimming
 * non-candidates, hover hints, or a range trimmed to sit near the
 * answer would each hand back what the keyboard was built to take away.
 * Before submission the subject marker is the only mark on the board.
 */

/** A key on the board: pitch class 0–11, and which rendered octave. */
export interface KeyPosition {
  /** 0 = C … 11 = B. */
  pc: number;
  /** 0 = the lower rendered octave, 1 = the upper one. NOT scientific
   *  pitch — this is a position on the board, and the board's window is
   *  what it is. */
  octave: number;
}

/** Pitch classes of the seven white keys, in order. */
export const WHITE_PCS: ReadonlyArray<number> = [0, 2, 4, 5, 7, 9, 11];

/**
 * Where each black key sits: after which white key of its octave, and
 * its pitch class. Five per octave, in the two-then-three grouping.
 */
export const BLACK_KEYS: ReadonlyArray<{ afterWhite: number; pc: number }> = [
  { afterWhite: 0, pc: 1 },
  { afterWhite: 1, pc: 3 },
  { afterWhite: 3, pc: 6 },
  { afterWhite: 4, pc: 8 },
  { afterWhite: 5, pc: 10 },
];

export const WHITE_PER_OCTAVE = WHITE_PCS.length;

// viewBox units. The SVG scales to the measured width; these only fix
// the PROPORTIONS, which are the standard ones.
export const WW = 24;   // white-key width
export const WH = 104;  // white-key height
export const BW = 14;   // black-key width — 58% of a white key
export const BH = 62;   // black-key height — 60% of a white key

/**
 * The narrowest a black key may be rendered, in CSS pixels, before the
 * board drops to one octave.
 *
 * ---------------------------------------------------------------
 * WHY 28 AND NOT THE 44 THE GUIDELINES SAY.
 *
 * iOS asks for 44pt minimum touch targets and Android for 48dp. Those
 * numbers describe an ISOLATED target with slack around it. A black key
 * is the opposite: a narrow strip with a white key hard against each
 * side, so a fingertip's contact patch always spans three targets and
 * the question is which one wins, not whether the finger lands.
 *
 * BLACK KEYS ARE THE BINDING CONSTRAINT. They are 58% of a white key,
 * so whichever width makes them comfortable makes the white keys
 * generous. Sizing off white keys hides the problem entirely.
 *
 * A literal 44 is unreachable on a phone at ANY octave count — 44 / 0.58
 * is a 76px white key, and seven of those is 532px, wider than a 390px
 * viewport. Holding out for 44 would mean no keyboard on phones at all.
 *
 * 28 is where a black key stops being a strip. Below it the three
 * targets under one fingertip are close enough in size that the wrong
 * one wins often; above it the raised, visually distinct black key is
 * the one the eye aims at and the finger follows. At 390px: two octaves
 * gives 16px and fails, one octave gives 32px and passes.
 * ---------------------------------------------------------------
 */
export const MIN_BLACK_KEY_PX = 28;

/** viewBox width for a given octave count. */
export function viewBoxWidth(octaves: number): number {
  return WHITE_PER_OCTAVE * octaves * WW;
}

/** How wide a black key renders, in CSS pixels, if `available` pixels
 *  are used to show `octaves` octaves. */
export function blackKeyPx(available: number, octaves: number): number {
  if (available <= 0) return 0;
  return BW * (available / viewBoxWidth(octaves));
}

/**
 * Two octaves when they fit comfortably, otherwise one.
 *
 * The decision READS `MIN_BLACK_KEY_PX` rather than restating a width
 * — a device breakpoint here would be a second statement of the same
 * threshold, and the two would drift the first time the constant moved.
 */
export function octavesForWidth(available: number): 1 | 2 {
  return blackKeyPx(available, 2) >= MIN_BLACK_KEY_PX ? 2 : 1;
}

export interface RenderedKey extends KeyPosition {
  /** Left edge, viewBox units. */
  x: number;
  width: number;
  height: number;
  isBlack: boolean;
}

/** Every white key, left to right. */
export function whiteKeys(octaves: number): RenderedKey[] {
  const out: RenderedKey[] = [];
  for (let o = 0; o < octaves; o++) {
    for (let i = 0; i < WHITE_PER_OCTAVE; i++) {
      out.push({
        pc: WHITE_PCS[i],
        octave: o,
        x: (o * WHITE_PER_OCTAVE + i) * WW,
        width: WW,
        height: WH,
        isBlack: false,
      });
    }
  }
  return out;
}

/** Every black key, left to right. Centred on the boundary between the
 *  white key it follows and the next. */
export function blackKeys(octaves: number): RenderedKey[] {
  const out: RenderedKey[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const b of BLACK_KEYS) {
      const centre = (o * WHITE_PER_OCTAVE + b.afterWhite + 1) * WW;
      out.push({
        pc: b.pc,
        octave: o,
        x: centre - BW / 2,
        width: BW,
        height: BH,
        isBlack: true,
      });
    }
  }
  return out;
}

/**
 * Which key a point lands on, in viewBox units. Null outside the board.
 *
 * BLACK KEYS ARE TESTED FIRST, and only within their own height. That
 * is the whole of the overlap rule: the top 60% of the gap between two
 * white keys belongs to the black key drawn over it, and the bottom 40%
 * belongs to the white key underneath. Testing white first — or testing
 * black over the full height — would make the black keys unreachable or
 * the white keys' upper halves dead, and either reads as "the keyboard
 * ignored my tap".
 */
export function keyAt(x: number, y: number, octaves: number): KeyPosition | null {
  if (x < 0 || y < 0 || x > viewBoxWidth(octaves) || y > WH) return null;
  for (const k of blackKeys(octaves)) {
    if (y <= k.height && x >= k.x && x <= k.x + k.width) {
      return { pc: k.pc, octave: k.octave };
    }
  }
  const index = Math.floor(x / WW);
  const white = whiteKeys(octaves)[index];
  return white ? { pc: white.pc, octave: white.octave } : null;
}

export function samePosition(a: KeyPosition, b: KeyPosition): boolean {
  return a.pc === b.pc && a.octave === b.octave;
}

/**
 * Both names for a pitch class — "F♯" and "G♭" are one key.
 *
 * A natural has one name and returns it once; the caller shows a single
 * label rather than "C / C". The five black keys are the only pitches
 * with two names in ordinary use, which is why B♯/C♭ and E♯/F♭ are
 * absent: they are real spellings but they are not what this key is
 * CALLED, and the reveal is naming a key, not spelling a chord.
 */
export function spellingsOf(pc: number): string[] {
  const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  const n = ((pc % 12) + 12) % 12;
  return SHARP[n] === FLAT[n] ? [SHARP[n]] : [SHARP[n], FLAT[n]];
}
