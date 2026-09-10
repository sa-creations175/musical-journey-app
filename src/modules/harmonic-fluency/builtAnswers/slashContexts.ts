/**
 * Where a slash chord lives, per shape.
 *
 * =====================================================================
 * EACH SHAPE CARRIES ITS OWN PHRASES, WRITTEN ONCE FOR THE SHAPE.
 *
 * A slash chord is a thing that happens on the way somewhere. The
 * inversions walk — 1/3 steps up from the 1 to the 4, 5/7 steps down
 * from the 1 to the 6 — the sus resolves, the cadential 6-4 leads to
 * the 5, the pedals sit over a held 1, and 1/4 settles home. Playing
 * the chord on its own says none of that.
 *
 * The phrases are the prototype's; what is ported is the RULE and not
 * the code. It writes each bass as an absolute MIDI note in the key of
 * C major, which cannot be transposed; these are DEGREES of the key
 * plus, where the phrase needs it, an octave. Every one of the
 * prototype's numbers comes back out of this in the key of C major, and
 * the same phrase is then playable in all thirteen.
 *
 * =====================================================================
 * THE BASS IS PLACED AND NOT WALKED.
 *
 * The progression card's bass follows the walking rule — nearest root
 * in the chosen direction. These cannot: the cadential phrase holds the
 * same bass note under two different chords (1/5 then the 5), and a
 * walking rule that must always move would push the second one an
 * octave. So a phrase says where its bass goes, which is what makes it
 * a phrase rather than a progression.
 * =====================================================================
 */

/** Semitones above the tonic, per degree of the major scale. */
const DEGREE_SEMIS: Readonly<Record<string, number>> = {
  '1': 0, '2': 2, '3': 4, '4': 5, '5': 7, '6': 9, '7': 11,
};

/** A chord of the key, as the phrases name them. */
type ContextChord = '1' | '2m' | '4' | '5' | '6m';

const CONTEXT_TONES: Readonly<Record<ContextChord, ReadonlyArray<number>>> = {
  '1': [0, 4, 7],
  '2m': [2, 5, 9],
  '4': [5, 9, 0],
  '5': [7, 11, 2],
  '6m': [9, 0, 4],
};

/** One step of a phrase: a chord of the key, or the slash chord itself. */
export type ContextStep =
  | { slash: true; bassDegree: string; octave?: number }
  | { chord: ContextChord; bassDegree: string; octave?: number };

export interface SlashContext {
  id: string;
  label: string;
  steps: ReadonlyArray<ContextStep>;
}

/** The slash chord alone, which every shape offers. */
const ALONE = (bassDegree: string): SlashContext => ({
  id: 'alone', label: 'Just the chord', steps: [{ slash: true, bassDegree }],
});

/**
 * The phrases, per shape id.
 *
 * Keyed by `SLASH_SHAPES`' own ids, so a shape added or removed by a
 * ruling shows up here as a missing entry rather than as a phrase
 * played for the wrong chord.
 */
export function contextsFor(shapeId: string, bassDegree: string): SlashContext[] {
  const alone = ALONE(bassDegree);
  const S = (octave?: number): ContextStep =>
    (octave === undefined
      ? { slash: true, bassDegree }
      : { slash: true, bassDegree, octave });
  const C = (chord: ContextChord, bd: string, octave?: number): ContextStep =>
    (octave === undefined ? { chord, bassDegree: bd } : { chord, bassDegree: bd, octave });

  switch (shapeId) {
    case '1-3':
      return [alone,
        { id: 'up', label: 'Walking up (1 · 1/3 · 4)', steps: [C('1', '1'), S(), C('4', '4')] },
        { id: 'down', label: 'Walking down (4 · 1/3 · 2m)', steps: [C('4', '4'), S(), C('2m', '2')] }];
    case '5-7':
      return [alone,
        { id: 'down', label: 'Walking down (1 · 5/7 · 6m)', steps: [C('1', '1', 12), S(), C('6m', '6')] },
        { id: 'up', label: 'Walking up (6m · 5/7 · 1)', steps: [C('6m', '6'), S(), C('1', '1', 12)] }];
    case '4-5':
      return [alone,
        { id: 'resolve', label: 'Resolving (4/5 · 1)', steps: [S(), C('1', '1')] },
        { id: 'inout', label: 'Out and back (1 · 4/5 · 1)', steps: [C('1', '1'), S(), C('1', '1')] }];
    case '1-5':
      return [alone,
        { id: 'cad', label: 'Cadence (1/5 · 5 · 1)', steps: [S(), C('5', '5'), C('1', '1')] },
        { id: 'full', label: 'Full cadence (4 · 1/5 · 5 · 1)', steps: [C('4', '4'), S(), C('5', '5'), C('1', '1')] }];
    case '5-1':
      return [alone,
        { id: 'pedal', label: 'Pedal (1 · 5/1 · 1)', steps: [C('1', '1'), S(), C('1', '1')] }];
    case '2-1':
      return [alone,
        { id: 'pedal', label: 'Pedal (1 · 2m/1 · 1)', steps: [C('1', '1'), S(), C('1', '1')] }];
    case '1-4':
      return [alone,
        { id: 'settle', label: 'Settling (4 · 1/4 · 1)', steps: [C('4', '4'), S(), C('1', '1')] }];
    default:
      return [alone];
  }
}

/** Where a step's bass note sits, as absolute MIDI. */
export function stepBass(step: ContextStep, keyPc: number): number {
  return 36 + keyPc + (DEGREE_SEMIS[step.bassDegree] ?? 0) + (step.octave ?? 0);
}

/** The pitch classes a context chord holds. Null for the slash chord
 *  itself, whose notes are the reader's own hand. */
export function stepTones(
  step: ContextStep,
  keyPc: number,
): { rootPc: number; pcs: number[] } | null {
  if ('slash' in step) return null;
  const tones = CONTEXT_TONES[step.chord];
  return {
    rootPc: (keyPc + tones[0]) % 12,
    pcs: tones.map(t => (keyPc + t) % 12),
  };
}
