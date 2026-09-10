/**
 * The board the shared player is drawn on.
 *
 * =====================================================================
 * FOUR OCTAVES, C2 TO C6, AND THE BASS OCTAVE IS THE LEFT ONE.
 *
 * It was three until 10 Sep 2026. The shared player's brief asks for
 * four — C2 to C6, with every C labelled by its number so C4 is
 * findable as middle C — because the surfaces moving onto this board
 * put a bass line under a hand that can also be lifted an octave, and
 * three octaves cannot hold both ends of that at once.
 *
 * =====================================================================
 * THE OLD HEADER, WHICH STILL SAYS WHY THE BASS OCTAVE IS THERE.
 *
 * A slash chord is a chord over a note and a progression has a bass
 * line, so the board has to hold a hand in the middle and a bass
 * underneath it at the same time. Two octaves cannot: the hand would
 * have to move to make room.
 *
 * IT RUNS C TO C. The closing key means a scale can land on its own
 * octave, which is where a run up and back turns.
 *
 * =====================================================================
 * WHERE THE KEYS SIT IS `lib/answerKeyboard`'s, NOT A SECOND SET OF
 * PROPORTIONS. Two boards that disagreed about where F♯ is would be the
 * bug worth avoiding, and the geometry is the part that is shared.
 * =====================================================================
 */
import { BH, BLACK_KEYS, BW, WH, WHITE_PCS, WHITE_PER_OCTAVE, WW } from '../answerKeyboard';

export const KEYBOARD_LOW_MIDI = 36;
export const KEYBOARD_OCTAVES = 4;
export const KEYBOARD_HIGH_MIDI = KEYBOARD_LOW_MIDI + KEYBOARD_OCTAVES * 12;

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

export const BOARD_HEIGHT = WH;
export const BOARD_WIDTH = (KEYBOARD_OCTAVES * WHITE_PER_OCTAVE + 1) * WW;

/** Whether a note is drawn at all. */
export function onBoard(midi: number): boolean {
  return midi >= KEYBOARD_LOW_MIDI && midi <= KEYBOARD_HIGH_MIDI;
}

/**
 * The label a key carries, or null.
 *
 * ONLY THE Cs, AND EVERY ONE OF THEM. The prototype writes C2 through
 * C6 on the board and nothing else: a name on all 49 keys is noise, and
 * a board with no landmark at all leaves a reader counting up from the
 * left edge to find middle C.
 */
export function keyLabel(midi: number): string | null {
  return midi % 12 === 0 ? `C${Math.floor(midi / 12) - 1}` : null;
}

/** Every key, white before black so the black ones draw over them. */
export function boardKeys(): { white: BoardKey[]; black: BoardKey[] } {
  const white: BoardKey[] = [];
  const black: BoardKey[] = [];
  for (let o = 0; o < KEYBOARD_OCTAVES; o += 1) {
    for (let i = 0; i < WHITE_PER_OCTAVE; i += 1) {
      white.push({
        midi: KEYBOARD_LOW_MIDI + o * 12 + WHITE_PCS[i],
        x: (o * WHITE_PER_OCTAVE + i) * WW,
        width: WW, height: WH, isBlack: false,
      });
    }
    for (const b of BLACK_KEYS) {
      const centre = (o * WHITE_PER_OCTAVE + b.afterWhite + 1) * WW;
      black.push({
        midi: KEYBOARD_LOW_MIDI + o * 12 + b.pc,
        x: centre - BW / 2, width: BW, height: BH, isBlack: true,
      });
    }
  }
  white.push({
    midi: KEYBOARD_HIGH_MIDI,
    x: KEYBOARD_OCTAVES * WHITE_PER_OCTAVE * WW,
    width: WW, height: WH, isBlack: false,
  });
  return { white, black };
}
