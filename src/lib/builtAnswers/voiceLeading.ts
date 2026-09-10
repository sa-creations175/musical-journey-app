/**
 * Chords that move as little as possible, and a bass that walks.
 *
 * =====================================================================
 * THE RULE IS PORTED FROM THE PROTOTYPE, NOT THE CODE.
 *
 * `docs/built-answers-prototype_1.html` decides a voicing by listing
 * every layout of a chord that fits the window and picking the one
 * closest to the chord before it. That is the rule; what follows is
 * that rule written for this codebase, with the window and the
 * distance stated as constants rather than inlined three times.
 *
 * =====================================================================
 * WHY LIST AND MEASURE RATHER THAN TRANSPOSE.
 *
 * The obvious way to voice-lead is to keep the previous inversion and
 * move it by the smallest interval. It is wrong on the case this build
 * exists for: a 2 5 1 in the key of B♭ major goes Cm7 to F7, and the
 * nearest F7 is not the F7 in the same inversion as the Cm7 — it is the
 * one whose four notes happen to sit closest to those four, which is a
 * different inversion. Measuring is the only thing that finds it.
 *
 * The distance is measured BOTH WAYS: for each note of the candidate,
 * how far to the nearest note of the previous chord, and for each note
 * of the previous chord, how far to the nearest note of the candidate.
 * One direction alone lets a three-note chord hide inside a five-note
 * one and score zero.
 *
 * =====================================================================
 * THE HAND STAYS IN THE MIDDLE OF THE KEYBOARD.
 *
 * A voicing is only offered if its bottom note is at or above `FLOOR`
 * and its top note at or below `CEILING`. Without a floor the nearest
 * voicing walks downward chord by chord until the hand is in the bass
 * clef; without a ceiling it climbs off the top of the three octaves
 * the board draws. Where nothing fits between them the search widens
 * down to `BOTTOM` rather than returning nothing, because a chord that
 * cannot be voiced is a card that cannot be played.
 * =====================================================================
 */

/** The window the hand plays in. Three octaves are drawn from MIDI 36;
 *  the hand lives in the top two. */
export const FLOOR = 55;
export const CEILING = 72;
/** How far down the search may reach when nothing fits above `FLOOR` —
 *  a wide five-note voicing of a low chord. */
export const BOTTOM = 48;

/** The register the bass line walks in. */
export const BASS_FLOOR = 36;
export const BASS_CEILING = 59;

/** A chord to be voiced: a root pitch class and the notes of the hand
 *  as semitones above it. */
export interface ChordSpec {
  rootPc: number;
  /** Semitones above the root. May exceed 12 — a ninth is 14. */
  tones: ReadonlyArray<number>;
}

/** One chord, placed on the keyboard. */
export interface VoicedChord {
  /** The hand, as absolute MIDI, ascending. */
  hand: number[];
  /** The bass note, or null where this layout has none. */
  bass: number | null;
  /** The chord's root pitch class, for colouring by interval. */
  rootPc: number;
}

/**
 * Stack a set of pitch classes upward from a bottom note.
 *
 * EACH NOTE IS THE NEXT ONE ABOVE THE LAST, never the same pitch again:
 * a chord whose second note shares the bottom note's pitch class is
 * pushed a full octave rather than doubled in place.
 */
export function stack(order: ReadonlyArray<number>, bottom: number): number[] {
  const out = [bottom];
  let last = bottom;
  for (let i = 1; i < order.length; i += 1) {
    const step = (((order[i] - (last % 12)) % 12) + 12) % 12;
    last += step === 0 ? 12 : step;
    out.push(last);
  }
  return out;
}

/**
 * Every placement of one inversion that fits the window.
 *
 * `inversion` rotates which pitch class is at the bottom. It is clamped
 * rather than rejected: a triad has no 3rd inversion, and asking for
 * one is a control that has not caught up with a quality change, not a
 * reason to draw nothing.
 */
export function voicingsOf(
  pcs: ReadonlyArray<number>,
  inversion: number,
): number[][] {
  if (pcs.length === 0) return [];
  const i = Math.min(Math.max(inversion, 0), pcs.length - 1);
  const order = [...pcs.slice(i), ...pcs.slice(0, i)];
  const fitting = (from: number): number[][] => {
    const out: number[][] = [];
    for (let bottom = from; bottom <= CEILING; bottom += 1) {
      if (bottom % 12 !== ((order[0] % 12) + 12) % 12) continue;
      const v = stack(order, bottom);
      if (v[v.length - 1] <= CEILING) out.push(v);
    }
    return out;
  };
  const inWindow = fitting(FLOOR);
  return inWindow.length > 0 ? inWindow : fitting(BOTTOM);
}

/** Every placement of every inversion. */
export function allVoicings(pcs: ReadonlyArray<number>): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < pcs.length; i += 1) out.push(...voicingsOf(pcs, i));
  return out;
}

/** How far one set of notes is from another, measured both ways. */
export function voicingDistance(
  candidate: ReadonlyArray<number>,
  previous: ReadonlyArray<number>,
): number {
  let d = 0;
  for (const m of candidate) d += Math.min(...previous.map(p => Math.abs(p - m)));
  for (const p of previous) d += Math.min(...candidate.map(m => Math.abs(p - m)));
  return d;
}

/** The placement closest to the chord before it. */
export function nearest(
  pcs: ReadonlyArray<number>,
  previous: ReadonlyArray<number>,
): number[] {
  const all = allVoicings(pcs);
  let best: number[] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const v of all) {
    const d = voicingDistance(v, previous);
    if (d < bestDistance) { bestDistance = d; best = v; }
  }
  return best ?? all[0] ?? [];
}

/** Which way the bass moves between two chords. */
export type BassMove = 'up' | 'down';

/**
 * The root under each chord, walking.
 *
 * =====================================================================
 * BY STEP OR BY OCTAVE, NEVER BY A FIFTH TO "FIT".
 *
 * Each move goes to the nearest instance of the next root in the chosen
 * direction — up means the next one above, down the next one below. A
 * root already in the bass moves a whole octave rather than staying
 * put, so tapping a move always does something audible.
 *
 * THE WHOLE LINE IS THEN SHIFTED BY OCTAVES, not stretched. Once the
 * moves are chosen the line may sit too low or too high; it is moved as
 * a block, twelve semitones at a time, until it is inside the bass
 * register. Adjusting one note to fit would silently turn a step into a
 * seventh.
 * =====================================================================
 */
export function bassLine(
  roots: ReadonlyArray<number | null>,
  moves: ReadonlyArray<BassMove>,
): Array<number | null> {
  const first = roots[0];
  if (first === null || first === undefined) return roots.map(() => null);
  const line: Array<number | null> = [BASS_FLOOR + first];
  for (let i = 1; i < roots.length; i += 1) {
    const root = roots[i];
    if (root === null) { line.push(null); continue; }
    // The last note actually placed, so a gap does not restart the walk.
    const prev = [...line].reverse().find(m => m !== null) ?? BASS_FLOOR + first;
    const up = (((root - (prev % 12)) % 12) + 12) % 12;
    const down = ((((prev % 12) - root) % 12) + 12) % 12;
    line.push((moves[i - 1] ?? 'up') === 'up'
      ? prev + (up === 0 ? 12 : up)
      : prev - (down === 0 ? 12 : down));
  }
  const placed = line.filter((m): m is number => m !== null);
  if (placed.length === 0) return line;
  let shift = 0;
  while (Math.min(...placed) + shift < BASS_FLOOR) shift += 12;
  while (Math.max(...placed) + shift > BASS_CEILING
    && Math.min(...placed) + shift - 12 >= BASS_FLOOR) shift -= 12;
  return line.map(m => (m === null ? null : m + shift));
}

/**
 * A whole progression, voiced.
 *
 * The first chord takes the layout the reader chose; every one after it
 * is placed nearest to the chord before. `null` for a chord not yet
 * built, so a half-finished answer still draws what there is.
 */
export function voiceAll(
  chords: ReadonlyArray<ChordSpec | null>,
  opts: {
    /** Whether the root goes in the bass rather than the hand. */
    bass: boolean;
    /** The inversion the FIRST chord takes. */
    inversion?: number;
    /** Which way the bass walks between chords. */
    moves?: ReadonlyArray<BassMove>;
  },
): Array<VoicedChord | null> {
  const line = bassLine(chords.map(c => (c ? c.rootPc : null)), opts.moves ?? []);
  const out: Array<VoicedChord | null> = [];
  let previous: number[] | null = null;
  chords.forEach((chord, i) => {
    if (chord === null) { out.push(null); return; }
    const pcs = chord.tones.map(t => (chord.rootPc + t) % 12);
    const hand = pcs.length === 0
      ? []
      : previous !== null
        ? nearest(pcs, previous)
        : voicingsOf(pcs, opts.inversion ?? 0)[0] ?? allVoicings(pcs)[0] ?? [];
    out.push({ hand, bass: opts.bass ? line[i] : null, rootPc: chord.rootPc });
    if (hand.length > 0) previous = hand;
  });
  return out;
}

/**
 * A phrase voice-led outward from one chord that is already placed.
 *
 * =====================================================================
 * THE READER'S HAND IS THE ANCHOR, AND THE PHRASE MOVES TO MEET IT.
 *
 * A slash chord's context is the chords around it, and the shape the
 * reader chose for the slash chord is the one thing in the phrase that
 * is not this engine's to decide. So the anchor is placed first and the
 * phrase is voiced OUTWARD from it — backwards to the chord before,
 * forwards to the chord after — rather than left to right from
 * whichever end happens to come first.
 *
 * Left to right would voice the chord before the slash chord against
 * nothing and then make the reader's own hand jump to it, which is the
 * one movement the phrase must not have.
 * =====================================================================
 */
export function voiceAround(
  steps: ReadonlyArray<{ pcs: ReadonlyArray<number> } | null>,
  anchor: ReadonlyArray<number>,
): Array<number[]> {
  const hands: Array<number[]> = steps.map(() => []);
  const at = steps.findIndex(s => s === null);
  if (at < 0) {
    // No anchor in the phrase: voice it left to right, which is the
    // progression rule.
    let previous: number[] | null = null;
    steps.forEach((s, i) => {
      if (s === null) return;
      hands[i] = previous === null
        ? voicingsOf(s.pcs, 0)[0] ?? allVoicings(s.pcs)[0] ?? []
        : nearest(s.pcs, previous);
      previous = hands[i];
    });
    return hands;
  }
  hands[at] = [...anchor];
  for (let i = at - 1; i >= 0; i -= 1) {
    const step = steps[i];
    hands[i] = step === null ? [...anchor] : nearest(step.pcs, hands[i + 1]);
  }
  for (let i = at + 1; i < steps.length; i += 1) {
    const step = steps[i];
    hands[i] = step === null ? [...anchor] : nearest(step.pcs, hands[i - 1]);
  }
  return hands;
}
