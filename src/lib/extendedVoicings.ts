/**
 * Silas's extended voicings, as data. One table, read by everything.
 *
 * =====================================================================
 * ONE ROW IS A RULE, NOT A TRANSCRIPTION: THE DIM7.
 *
 * Every other row below is transcribed from his notes. The dim7 is not
 * in them; it is here by his ruling of 10 Sep 2026
 * (`~/cc-scratch/NEXT_TAB1_TIDY.md`, item 8): "It's F♯ A C E♭. You
 * can't add anything to it." So at Full Voicing a dim7's right hand is
 * some combination of the chord's own four notes — any of them doubled,
 * or none — over the root in the bass, and never a 9th or any other
 * extension. The shape given is the four notes stacked from the ♭3 with
 * the root doubled on top, the prototype's own full dim7.
 * =====================================================================
 * =====================================================================
 * THE NOTES ARE THE SOURCE OF TRUTH, AND THIS FILE IS THEM.
 *
 * `~/cc-scratch/SILAS_NOTES_VOICINGS_AND_MODAL_INTERCHANGE.md`, recorded
 * 9 Sep 2026, gives every extended voicing this app plays, note by note,
 * in Silas's own hands. Ruled the same night: where the notes and the
 * app disagree, the notes win. So the notes are transcribed here once,
 * and the Shapes & Patterns Extended Voicings rows, the built-answer
 * player's full-voicing rung and the ear-training ladder's top rung all
 * read this table rather than each keeping their own idea of what a
 * "full voicing" is. They used to keep three, and the three disagreed:
 * the dominant's extended voicing has a 13 where two of them had a 5.
 *
 * =====================================================================
 * A AND B ARE TWO SHAPES, NOT TWO INVERSIONS.
 *
 * Every extended chord in the notes is the maj7♭5 shape or its quartal
 * inversion, built on a named chord tone. The A shape starts on the 3rd
 * (the ♭3 of a minor chord); the B shape starts on the ♭7 (the 7 of a
 * major chord, the 6 of a minor 6/9). WHICH of the two shapes lands on
 * that tone follows from the chord: on a dominant 9(13) the A is the
 * quartal inversion and the B is the standard maj7♭5, and on a dominant
 * 7♯9♯5 it is the other way round. That is not a slip in the notes —
 * the tones are written out both times and they are what is encoded
 * here. The shape names are a description of the result, never the
 * source of it.
 *
 * =====================================================================
 * SEMITONES ABOVE THE CHORD'S OWN ROOT, ASCENDING, AS PLAYED.
 *
 * Not textbook interval numbers. Silas's dominant 9(13) voices its 13
 * as the 6th under the ♭7 (nine semitones, G + [B, E, F, A]), and
 * writing it as 21 would put it an octave above where the hand goes.
 * Every number here is the distance from the chord root to the key that
 * is actually pressed, so a caller adds the root and plays.
 *
 * THE LEFT HAND IS ITS OWN LIST, and on the half-diminished it holds
 * TWO notes — Silas's `[1 + 11] + [♯4, ♭7, ♭3]`. A single bass note
 * cannot say that, which is why `left` is an array on every row rather
 * than only on the one that needs it.
 * =====================================================================
 */

/** Which of the two shapes a chord takes. */
export type ExtendedPosition = 'A' | 'B';

/**
 * The chord qualities the notes give an extended voicing for.
 *
 * Ids of this file's own, not the deck's quality strings and not the
 * catalog's: `dom9-13` is one chord in the notes and is spelled `7`,
 * `9` and `dominant` in three other places. `EXTENDED_QUALITY_OF`
 * below is the one translation.
 */
export type ExtendedQuality =
  | 'dom9-13'
  | 'dom7#9#5'
  | 'm9'
  | 'maj9'
  | 'm7b5-11'
  | 'dom7#5'
  | 'dom7b9#9b13'
  | 'm6-9'
  // A RULE, NOT A TRANSCRIPTION — see the header.
  | 'dim7';

/** One hand-shape: what the left holds and what the right plays. */
export interface ExtendedShape {
  /** Semitones above the chord root, left hand, ascending. */
  left: ReadonlyArray<number>;
  /** Semitones above the chord root, right hand, ascending. */
  right: ReadonlyArray<number>;
  /** Silas's own degree names for the left hand, in his order. */
  leftDegrees: ReadonlyArray<string>;
  /** Silas's own degree names for the right hand, in his order. */
  rightDegrees: ReadonlyArray<string>;
}

/**
 * The two shapes of one quality. A quality that the notes give in only
 * one position has only that one — the minor 2 5 1's two dominants are
 * each written for a single run and there is no second voicing of them
 * to invent.
 */
export type ExtendedVoicing = Partial<Record<ExtendedPosition, ExtendedShape>>;

/** Silas's notes, transcribed. Nothing here is derived. */
export const EXTENDED_VOICINGS:
Readonly<Record<ExtendedQuality, ExtendedVoicing>> = {
  // Stage 2. A: G + [B, E, F, A] · B: G + [F, A, B, E]
  'dom9-13': {
    A: { left: [0], leftDegrees: ['1'],
      right: [4, 9, 10, 14], rightDegrees: ['3', '13', 'b7', '9'] },
    B: { left: [0], leftDegrees: ['1'],
      right: [10, 14, 16, 21], rightDegrees: ['b7', '9', '3', '13'] },
  },
  // Stage 4. A: C + [E, Ab, Bb, Eb] · B: C + [Bb, Eb, E, Ab]
  'dom7#9#5': {
    A: { left: [0], leftDegrees: ['1'],
      right: [4, 8, 10, 15], rightDegrees: ['3', '#5', 'b7', '#9'] },
    B: { left: [0], leftDegrees: ['1'],
      right: [10, 15, 16, 20], rightDegrees: ['b7', '#9', '3', '#5'] },
  },
  // Stage 7. A: C + [Eb, G, Bb, D] · B: C + [Bb, D, Eb, G]
  //
  // THE LETTERS ARE THE SOURCE ON THE B, NOT THE DEGREE LIST BESIDE
  // THEM. Stage 7 writes the B as `[b7, b3, 9, 5]` and then spells it
  // `C + [Bb, D, Eb, G]`, which is ♭7, 9, ♭3, 5. Stage 10 writes the
  // same voicing a second time and agrees with the letters, so the
  // degree list in stage 7 is a slip and the notes say ♭7, 9, ♭3, 5.
  m9: {
    A: { left: [0], leftDegrees: ['1'],
      right: [3, 7, 10, 14], rightDegrees: ['b3', '5', 'b7', '9'] },
    B: { left: [0], leftDegrees: ['1'],
      right: [10, 14, 15, 19], rightDegrees: ['b7', '9', 'b3', '5'] },
  },
  // Stage 8. A: C + [E, G, B, D] · B: C + [B, D, E, G]
  maj9: {
    A: { left: [0], leftDegrees: ['1'],
      right: [4, 7, 11, 14], rightDegrees: ['3', '5', '7', '9'] },
    B: { left: [0], leftDegrees: ['1'],
      right: [11, 14, 16, 19], rightDegrees: ['7', '9', '3', '5'] },
  },
  // Stage 10. A: [D + G] + [Ab, C, F] · B: [D + Ab] + [C, F, G]
  //
  // THE ONLY ROW WHOSE LEFT HAND HOLDS TWO NOTES, and it holds a
  // different second note in each position: the 11 under the A and the
  // ♯11 under the B.
  'm7b5-11': {
    A: { left: [0, 5], leftDegrees: ['1', '11'],
      right: [6, 10, 15], rightDegrees: ['#4', 'b7', 'b3'] },
    B: { left: [0, 6], leftDegrees: ['1', '#11'],
      right: [10, 15, 17], rightDegrees: ['b7', 'b3', '11'] },
  },
  // Stage 10, the minor 2 5 1's ABA run. G + [F, B, Eb].
  // ONE POSITION ONLY: the notes give this chord as the B of that run
  // and nowhere else.
  'dom7#5': {
    B: { left: [0], leftDegrees: ['1'],
      right: [10, 16, 20], rightDegrees: ['b7', '3', 'b13'] },
  },
  // Stage 10, the minor 2 5 1's BAB run.
  // [G + D + Ab] + [B, Eb, F, Bb]. Three notes in the left hand.
  // ONE POSITION ONLY, for the reason `dom7#5` gives.
  'dom7b9#9b13': {
    A: { left: [0, 7, 13], leftDegrees: ['1', '5', 'b9'],
      right: [16, 20, 22, 27], rightDegrees: ['3', 'b13', 'b7', 'b3'] },
  },
  // Stage 6. A: C + [Eb, G, A, D] · B: C + [A, D, Eb, G]
  //
  // ENCODED, NOT DRILLED. Silas is not sure the minor 6/9 belongs —
  // "I wonder if a circle of 4ths exercise could be good. maybe?" — so
  // it is here for the player to voice where a chord asks for it, and
  // no row on Shapes & Patterns drills it.
  // The dim7: its four notes and nothing else (Silas, 10 Sep 2026 —
  // see the header). F♯ + [A, C, E♭, F♯]. ONE POSITION, like the two
  // single-run rows above: the rule allows any combination of the four
  // notes, and this is the one the prototype plays.
  dim7: {
    A: { left: [0], leftDegrees: ['1'],
      right: [3, 6, 9, 12], rightDegrees: ['b3', 'b5', 'bb7', '1'] },
  },
  'm6-9': {
    A: { left: [0], leftDegrees: ['1'],
      right: [3, 7, 9, 14], rightDegrees: ['b3', '5', '6', '9'] },
    B: { left: [0], leftDegrees: ['1'],
      right: [9, 14, 15, 19], rightDegrees: ['6', '9', 'b3', '5'] },
  },
};

/**
 * The quality a chord takes when it is voiced extended.
 *
 * Keyed by the DECK's quality strings, which is the vocabulary the
 * Shapes & Patterns catalog and the Harmonic Fluency cards already
 * share. A quality with no entry has no extended voicing in the notes
 * and its caller keeps whatever it did before.
 */
export const EXTENDED_QUALITY_OF: Readonly<Record<string, ExtendedQuality>> = {
  maj7: 'maj9', maj9: 'maj9',
  m7: 'm9', m9: 'm9',
  '7': 'dom9-13', '9': 'dom9-13',
  '7#9#5': 'dom7#9#5',
  '7#5': 'dom7#5',
  '7b9#9b13': 'dom7b9#9b13',
  m7b5: 'm7b5-11',
  dim7: 'dim7',
  'm6/9': 'm6-9',
};

/**
 * =====================================================================
 * `shapeInRun` WAS HERE, AND IT WAS A DERIVATION THAT DID NOT HOLD.
 *
 * It read the two 2 5 1 runs — stage 9's A-B-A and stage 10's B-A-B —
 * and concluded that the DOMINANT takes the opposite letter to the
 * chords either side of it. True of both of those, and wrong on a pass
 * that STARTS on the dominant: it made the plain 5 → 1 play its
 * dominant in B under Position 1, which is Position 2's shape.
 *
 * Silas ruled on 10 Sep 2026 that the position names the row's FIRST
 * chord — Position 1 is that chord in its A shape, Position 2 in its B
 * — and everything after it follows, alternating on a cadence and by
 * nearest move on a loop. That rule lives in
 * `shapes-and-patterns/catalog.ts`, where the row is, because it needs
 * to know which chord comes first.
 * =====================================================================
 */

/** Whether a quality behaves as a dominant. */
export function isDominantExtended(q: ExtendedQuality): boolean {
  return q === 'dom9-13' || q === 'dom7#9#5'
    || q === 'dom7#5' || q === 'dom7b9#9b13';
}

/**
 * One quality's shape, or null.
 *
 * NULL RATHER THAN A FALLBACK. A quality the notes do not cover, or a
 * position they give only one of, has no answer here — and a caller
 * that quietly voiced something else would be sounding a chord Silas
 * never wrote, which is the whole thing this table exists to stop.
 */
export function extendedShape(
  quality: ExtendedQuality,
  position: ExtendedPosition,
): ExtendedShape | null {
  return EXTENDED_VOICINGS[quality][position] ?? null;
}

/** Every note of a shape, left hand then right, as one ascending list
 *  of semitones above the chord root. */
export function extendedTones(shape: ExtendedShape): number[] {
  return [...shape.left, ...shape.right];
}
