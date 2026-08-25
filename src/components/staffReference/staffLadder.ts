/**
 * The grand staff as ONE CONTINUOUS PITCH LADDER.
 *
 * =====================================================================
 * NOTHING IS SKIPPED BETWEEN THE STAVES.
 *
 * The two staves are usually drawn as two separate five-line grids with
 * a gap, which is exactly where the reader loses the thread: bass top
 * line A3, then B3, then middle C, then D4, then treble bottom line E4
 * are five consecutive notes, and the gap makes them look like two
 * unrelated neighbourhoods.
 *
 * So this generates one ladder of diatonic steps from the bottom ledger
 * to the top, and every position on it — line, space, staff, ledger —
 * comes out of the same walk. Middle C is not a special case bolted on;
 * it is the ledger line that happens to fall between the two staves,
 * one below treble and one above bass, which is what makes it shared.
 * =====================================================================
 *
 * GENERATED FROM THE ANCHORS AND A COUNT, never listed. Extending the
 * range is `LEDGER_LINES` — a number — and the ladder, the lines, the
 * spaces and the regions all follow. A hand-written table of positions
 * would have to be re-derived by a person each time, which is where
 * the off-by-one lives.
 *
 * LINE OR SPACE IS PARITY, not a lookup. On a continuous diatonic
 * ladder, lines and spaces strictly alternate — so a position is a line
 * exactly when it is an even number of steps from a known line. One
 * fact (E4 is a line) decides all thirty-three.
 */

/** Diatonic letters, in the order an octave numbers them. */
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

export type Letter = typeof LETTERS[number];

/** How many ledger lines are drawn beyond each staff. THE range knob. */
export const LEDGER_LINES = 3;

/** The five treble lines, bottom to top. */
export const TREBLE_LINES = ['E4', 'G4', 'B4', 'D5', 'F5'] as const;

/** The five bass lines, bottom to top. */
export const BASS_LINES = ['G2', 'B2', 'D3', 'F3', 'A3'] as const;

/** The note both staves share, on its own ledger line between them. */
export const MIDDLE_C = 'C4';

/** A position's place in the drawing. */
export type StaffRegion =
  | 'ledger-below'   // under the bass staff
  | 'bass'           // between the bass staff's own lines, inclusive
  | 'middle'         // between the staves — B3, middle C, D4
  | 'treble'         // between the treble staff's own lines, inclusive
  | 'ledger-above';  // over the treble staff

export interface StaffPosition {
  /** "C4" — the note name and octave, and the mnemonic's key. */
  id: string;
  letter: Letter;
  octave: number;
  /** Diatonic steps from the bottom of the ladder. 0 at the lowest. */
  index: number;
  kind: 'line' | 'space';
  region: StaffRegion;
  /** A line that is NOT one of the ten staff lines — including middle C. */
  isLedgerLine: boolean;
  isMiddleC: boolean;
}

/** Absolute diatonic step number, so positions can be compared. */
function stepOf(id: string): number {
  const letter = id.slice(0, -1) as Letter;
  const octave = Number(id.slice(-1));
  const letterIndex = LETTERS.indexOf(letter);
  if (letterIndex < 0 || Number.isNaN(octave)) {
    throw new Error(`not a note name: ${id}`);
  }
  return octave * LETTERS.length + letterIndex;
}

function idOfStep(step: number): { id: string; letter: Letter; octave: number } {
  const octave = Math.floor(step / LETTERS.length);
  const letter = LETTERS[step - octave * LETTERS.length];
  return { id: `${letter}${octave}`, letter, octave };
}

/**
 * Every position from the lowest ledger to the highest, bottom first.
 *
 * A ledger line sits two steps beyond the last one (line, space, line),
 * so `LEDGER_LINES` ledgers reach `2 × LEDGER_LINES` steps past the
 * staff — three of them landing on E6 above and A1 below.
 */
export function buildLadder(): StaffPosition[] {
  const trebleBottom = stepOf(TREBLE_LINES[0]);
  const trebleTop = stepOf(TREBLE_LINES[TREBLE_LINES.length - 1]);
  const bassBottom = stepOf(BASS_LINES[0]);
  const bassTop = stepOf(BASS_LINES[BASS_LINES.length - 1]);

  const lowest = bassBottom - 2 * LEDGER_LINES;
  const highest = trebleTop + 2 * LEDGER_LINES;
  const middleC = stepOf(MIDDLE_C);

  const out: StaffPosition[] = [];
  for (let step = lowest; step <= highest; step++) {
    const { id, letter, octave } = idOfStep(step);
    // Parity against one known line — see the header.
    const kind = (step - trebleBottom) % 2 === 0 ? 'line' : 'space';
    const region: StaffRegion =
      step < bassBottom ? 'ledger-below'
        : step <= bassTop ? 'bass'
          : step < trebleBottom ? 'middle'
            : step <= trebleTop ? 'treble'
              : 'ledger-above';
    out.push({
      id,
      letter,
      octave,
      index: step - lowest,
      kind,
      region,
      isLedgerLine: kind === 'line' && region !== 'treble' && region !== 'bass',
      isMiddleC: step === middleC,
    });
  }
  return out;
}

/**
 * The mnemonics that ship, keyed by position id.
 *
 * DERIVED FROM THE ANCHORS, so the words stay attached to the right
 * lines if the range ever moves. Only the four standard sets are here:
 *
 *   treble lines   Every Good Boy Does Fine
 *   bass lines     Good Boys Deserve Fudge Always
 *   bass spaces    All Cows Eat Grass
 *
 * TREBLE SPACES SPELL F-A-C-E AND GET NO WORDS, and every ledger
 * position starts empty — there is no standard mnemonic for a ledger
 * note, and one invented here would be a made-up fact in the place the
 * reader goes to check facts.
 */
const TREBLE_LINE_WORDS = ['Every', 'Good', 'Boy', 'Does', 'Fine'];
const BASS_LINE_WORDS = ['Good', 'Boys', 'Deserve', 'Fudge', 'Always'];
const BASS_SPACE_WORDS = ['All', 'Cows', 'Eat', 'Grass'];

export function defaultMnemonics(): Record<string, string> {
  const ladder = buildLadder();
  const out: Record<string, string> = {};

  TREBLE_LINES.forEach((id, i) => { out[id] = TREBLE_LINE_WORDS[i]; });
  BASS_LINES.forEach((id, i) => { out[id] = BASS_LINE_WORDS[i]; });

  // The four spaces inside the bass staff, bottom to top — taken from
  // the ladder rather than named, so they cannot drift from the lines
  // they sit between.
  ladder
    .filter(p => p.region === 'bass' && p.kind === 'space')
    .forEach((p, i) => {
      if (i < BASS_SPACE_WORDS.length) out[p.id] = BASS_SPACE_WORDS[i];
    });

  return out;
}
