/**
 * The line under a Chord Motion answer: which half was right.
 *
 * =====================================================================
 * TWO QUESTIONS, SO THE ANSWER SAYS WHICH ONE YOU GOT.
 *
 * The card asks where the move started and where it landed. A reader
 * who got the start and missed the landing heard something real, and a
 * bare "wrong" throws that away — the rating already gives half credit
 * (Working on it), and the line has to say what the credit was for.
 *
 *   both right          "Right."
 *   start right only    "Starting chord right (1). It landed on the 4, not the 5."
 *   landing right only  "Landing right (4). It started on the 1, not the 3m."
 *   neither             "Not quite. 1 → 4."
 *
 * The words are Silas's, from `reveal(right, half, d)` in the walked
 * prototype. Every degree is written as its CHIP says it — "the 3m",
 * never "the E" — see `chipText`.
 * =====================================================================
 */

/** Right, half right, or wrong — the three colours the line can wear. */
export type MotionResultTone = 'right' | 'half' | 'wrong';

export interface MotionResult {
  tone: MotionResultTone;
  text: string;
}

export function motionResult(answer: {
  startOk: boolean;
  destOk: boolean;
  /** The chip text of the chord the move started on, and landed on. */
  start: string;
  dest: string;
  /** What the reader answered, as chip text. Null for a start that was
   *  given rather than answered — which is always right. */
  yourStart: string | null;
  yourDest: string;
}): MotionResult {
  const { startOk, destOk, start, dest, yourStart, yourDest } = answer;
  if (startOk && destOk) return { tone: 'right', text: 'Right.' };
  if (startOk) {
    return {
      tone: 'half',
      text: `Starting chord right (${start}). It landed on the ${dest}, not the ${yourDest}.`,
    };
  }
  if (destOk) {
    return {
      tone: 'half',
      text: `Landing right (${dest}). It started on the ${start}, not the ${yourStart ?? start}.`,
    };
  }
  return { tone: 'wrong', text: `Not quite. ${start} → ${dest}.` };
}
