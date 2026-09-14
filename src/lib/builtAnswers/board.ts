/**
 * The board the shared player is drawn on.
 *
 * =====================================================================
 * F1 TO C6, 56 KEYS. Silas's spec of 12 Sep 2026, §2, everywhere.
 *
 * It was C2 to C6 from 10 Sep 2026, and three octaves before that. The
 * diary's player lights and taps keys a hand can reach below the bass
 * octave, so the board reaches down to F1.
 *
 * THE WIDER BOARD MOVES NO BASS. Silas's answer of 14 Sep 2026: it is
 * for lighting and tapping keys. Where a bass lands is the bass rule's
 * business, and its floor is its own (`voices.ts`), not this board's.
 *
 * ON A PHONE THE BOARD SCROLLS SIDEWAYS rather than shrinking its keys
 * past what a finger can hit, with the lit keys brought into view — see
 * `BOARD_MIN_WIDTH_PX` and `BuiltAnswerKeyboard`.
 *
 * =====================================================================
 * THE OLD HEADER, WHICH STILL SAYS WHY THE BASS OCTAVE IS THERE.
 *
 * A slash chord is a chord over a note and a progression has a bass
 * line, so the board has to hold a hand in the middle and a bass
 * underneath it at the same time. Two octaves cannot: the hand would
 * have to move to make room.
 *
 * IT ENDS ON C. The closing key means a scale can land on its own
 * octave, which is where a run up and back turns. Every C is labelled
 * by its number, so C4 is findable as middle C.
 *
 * =====================================================================
 * WHERE THE KEYS SIT IS `lib/answerKeyboard`'s, NOT A SECOND SET OF
 * PROPORTIONS. Two boards that disagreed about where F♯ is would be the
 * bug worth avoiding, and the geometry is the part that is shared.
 * =====================================================================
 */
import { BH, BW, WH, WHITE_PCS, WW } from '../answerKeyboard';

/** F1. */
export const KEYBOARD_LOW_MIDI = 29;
/** C6. */
export const KEYBOARD_HIGH_MIDI = 84;

/** How one key is marked. Absent fields are simply not drawn. */
export interface KeyMark {
  /** A fill, as a CSS colour. Used for interval colouring. */
  fill?: string;
  /** The plain highlight, for a scale drawn without interval colours. */
  plain?: boolean;
  /** The "you tapped this" mark, before anything is graded. */
  pressed?: boolean;
  /** A band along the foot of the key: this is the bass note. */
  bassBand?: boolean;
  /**
   * An outline around the key, as a CSS colour.
   *
   * =====================================================================
   * A SECOND FACT ABOUT ONE KEY, WHICH IS WHY IT IS NOT A FILL.
   *
   * The fill says what INTERVAL of the chord a note is; the ring says
   * what DEGREE OF THE KEY the chord itself is. Both are true of the
   * chord's root at once, and a reader needs both — "this is the root,
   * and this chord is the 4". Drawing the ring as a fill would make the
   * two palettes fight for the same pixel and the reader would have to
   * guess which question was being answered.
   *
   * Named in the Chord Color Legend, and only where a surface draws it.
   * =====================================================================
   */
  ring?: string;
}

export interface BoardKey {
  midi: number;
  /** Left edge, viewBox units. */
  x: number;
  width: number;
  height: number;
  isBlack: boolean;
}

const isWhite = (midi: number) => WHITE_PCS.includes(((midi % 12) + 12) % 12);

/** How many white keys the board has: 33. */
const WHITE_COUNT = (() => {
  let n = 0;
  for (let m = KEYBOARD_LOW_MIDI; m <= KEYBOARD_HIGH_MIDI; m += 1) if (isWhite(m)) n += 1;
  return n;
})();

export const BOARD_HEIGHT = WH;
export const BOARD_WIDTH = WHITE_COUNT * WW;

/**
 * The narrowest the board is drawn, in CSS pixels, before it scrolls.
 *
 * SIXTEEN PIXELS A WHITE KEY. On a 390px phone all 33 would be eleven,
 * a black key under seven: a tap lands on its neighbour as often as on
 * itself. Sixteen keeps a black key over nine, and the board scrolls to
 * make up the rest.
 */
export const BOARD_MIN_WIDTH_PX = WHITE_COUNT * 16;

/** Whether a note is drawn at all. */
export function onBoard(midi: number): boolean {
  return midi >= KEYBOARD_LOW_MIDI && midi <= KEYBOARD_HIGH_MIDI;
}

/**
 * The label a key carries, or null.
 *
 * ONLY THE Cs, AND EVERY ONE OF THEM. The prototype writes C2 through
 * C6 on the board and nothing else: a name on every key is noise, and
 * a board with no landmark at all leaves a reader counting up from the
 * left edge to find middle C.
 */
export function keyLabel(midi: number): string | null {
  return midi % 12 === 0 ? `C${Math.floor(midi / 12) - 1}` : null;
}

/**
 * Every key, white before black so the black ones draw over them.
 *
 * WALKED BY MIDI NUMBER, because the board no longer starts on a C: a
 * black key sits centred on the edge after the white key before it,
 * wherever in the octave that is.
 */
export function boardKeys(): { white: BoardKey[]; black: BoardKey[] } {
  const white: BoardKey[] = [];
  const black: BoardKey[] = [];
  let whiteIndex = 0;
  for (let midi = KEYBOARD_LOW_MIDI; midi <= KEYBOARD_HIGH_MIDI; midi += 1) {
    if (isWhite(midi)) {
      white.push({ midi, x: whiteIndex * WW, width: WW, height: WH, isBlack: false });
      whiteIndex += 1;
    } else {
      black.push({ midi, x: whiteIndex * WW - BW / 2, width: BW, height: BH, isBlack: true });
    }
  }
  return { white, black };
}
