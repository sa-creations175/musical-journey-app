/**
 * A shared-list entry, placed on the keyboard.
 *
 * =====================================================================
 * THE SAME VOICING THE GRID DRILLS, NOT A NEW ONE.
 *
 * The card asks which progression you heard and from which position,
 * and the position is only a real question if what sounds is what
 * Chord Movements & Passes teaches: the root in the left hand, the
 * rootless shape in the right, the rest voice-led. So this reads the
 * SAME two sources the grid does — `lib/builtAnswers/voiceLeading` for
 * the nearest-voicing rule and `lib/extendedVoicings` (Silas's own
 * notes) for the A and B shapes — and adds nothing of its own.
 *
 * =====================================================================
 * WHAT "POSITION" MEANS AT EACH RUNG, AND IT IS ONE IDEA THROUGHOUT.
 *
 * Which note of the right hand's shape is at the bottom of the FIRST
 * chord. Every chord after it follows by nearest voicing, so the
 * position sets the hand and the progression carries it.
 *
 *   Guide tones     1/2 — the 3 under the 7, or the 7 under the 3
 *   Seventh chords  1/2/3 — the 3rd, the 5th or the 7th lowest
 *   Extended        1/2 — the ABA run or the BAB run, Silas's shapes
 *
 * At the extended rung the position is not a rotation at all: it is
 * which of Silas's two shapes each chord takes, and `shapeInRun` is the
 * one line that decides. That is why this asks the catalog for the run
 * rather than rotating anything.
 * =====================================================================
 */
import {
  bassLine, nearest, voicingsOf, allVoicings,
  type Move,
} from '../../../lib/builtAnswers/voiceLeading';
import { handTones, type QualityId } from '../../../lib/builtAnswers/chordShapes';
import type { PlayerChord } from '../../../lib/player/voices';
import { voiceLeadingExtendedRun, type VLChord } from '../../shapes-and-patterns/catalog';
import {
  EXTENDED_QUALITY_OF, extendedShape, isDominantExtended,
} from '../../../lib/extendedVoicings';
import { spellNote, type Spelling } from '../../../lib/spelling';
import {
  patternFor, type ListRung, type SharedProgression,
} from './sharedList';

/** Degrees of the key, as the catalog writes them. */
const DEGREE_SEMIS: Readonly<Record<string, number>> = {
  '1': 0, b2: 1, '2': 2, b3: 3, '3': 4, '4': 5, '#4': 6,
  '5': 7, b6: 8, '6': 9, b7: 10, '7': 11,
};

/** The window Silas's extended shapes are placed in. */
const EXT_FLOOR = 50;
const EXT_CEILING = 84;
const EXT_PREFERRED = 55;

/** A chord's root pitch class in a key. */
function rootPcOf(chord: VLChord, keyPc: number): number {
  return ((keyPc + (DEGREE_SEMIS[chord.degree] ?? 0)) % 12 + 12) % 12;
}

/** What a chip says, in the key's own spelling. */
function chordName(
  chord: VLChord, keyPc: number, spelling: Spelling, quality = chord.quality,
): string {
  return `${spellNote(rootPcOf(chord, keyPc), spelling)}${quality}`;
}

export interface VoiceEntryOptions {
  /** Which way the bass moves between each pair. `'auto'` takes the
   *  rule; the card sets the FIRST one by a coin flip. */
  bassMoves?: ReadonlyArray<Move>;
  /** Which way the right hand moves. `'auto'` takes the nearest. */
  handMoves?: ReadonlyArray<Move>;
  /** How many doors along the loop is entered. Reveal only. */
  rotation?: number;
  /** Play the pass's other landing instead of the one it asks. */
  otherLanding?: boolean;
  /** How the key spells its notes. */
  spelling?: Spelling;
}

/**
 * The chords of one entry, at one rung, from one position.
 *
 * Returns an empty list rather than a wrong sound where the catalog has
 * no shape for a chord — the rule `voiceLeadingExtendedRun` already
 * follows, for the reason it gives.
 */
export function voiceEntry(
  entry: SharedProgression,
  keyPc: number,
  rung: ListRung,
  position: number,
  opts: VoiceEntryOptions = {},
): PlayerChord[] {
  const spelling = opts.spelling ?? 'flat';
  // THE VERSION FIRST, THEN THE ROTATION — the order `ProgressionAnswer`
  // already argues for: the landing changes which chord is there before
  // anything asks where the loop starts.
  let chords = [...entry.chords];
  if (opts.otherLanding === true && entry.otherLanding !== null) {
    const { index, quality } = entry.otherLanding;
    chords = chords.map((c, i) => (i === index ? { ...c, quality } : c));
  }
  const turns = ((opts.rotation ?? 0) % chords.length + chords.length) % chords.length;
  if (turns > 0) chords = [...chords.slice(turns), ...chords.slice(0, turns)];

  const rootPcs = chords.map(c => rootPcOf(c, keyPc));
  const line = bassLine(rootPcs, opts.bassMoves ?? []) as number[];

  const shapes = shapesFor(entry, chords, rung, position);
  if (shapes !== null) {
    return placeShapes(shapes, chords, rootPcs, line, opts, keyPc, spelling);
  }

  // GUIDE TONES AND SEVENTH CHORDS: a rootless right hand, the first
  // chord's shape chosen by the position, the rest by nearest voicing.
  const out: PlayerChord[] = [];
  let previous: number[] | null = null;
  chords.forEach((chord, i) => {
    const rootPc = rootPcs[i];
    const tones = passTones(chord.quality, rung);
    const pcs = tones.map(t => (rootPc + t) % 12);
    const hand = previous === null
      ? voicingsOf(pcs, position - 1)[0] ?? allVoicings(pcs)[0] ?? []
      : nearest(pcs, previous, opts.handMoves?.[i - 1] ?? 'auto');
    if (hand.length > 0) previous = hand;
    out.push({
      hand, bass: line[i] ?? null, rootPc,
      name: chordName(chord, keyPc, spelling),
    });
  });
  return out;
}

/**
 * A rung's right-hand tones, above the chord root.
 *
 * `handTones` answers this for every quality the built answers use, and
 * it is used here rather than a second table. THE ONE ADDITION is the
 * diminished seventh at the seventh rung: its four notes are all the
 * same distance apart, so a rootless three-note reading has three
 * starting shapes where the row has always had four. The octave makes
 * the fourth, which is what the prototype plays.
 */
function passTones(quality: string, rung: ListRung): number[] {
  const tones = handTones(quality as QualityId, rung);
  if (quality === 'dim7' && rung === 'seventh') return [...tones, 12];
  return tones;
}

/**
 * Silas's own shape for each chord, or null where there is none.
 *
 * =====================================================================
 * THREE KINDS OF ROW, AND ONLY TWO OF THEM HAVE HIS SHAPES.
 *
 * · A 2 5 1 or a loop at the extended rung is an ABA or a BAB RUN, and
 *   `voiceLeadingExtendedRun` is the one place that decides which shape
 *   each chord takes.
 *
 * · The 7♯9♯5 pass is two chords, not a run. Its two positions came
 *   from Silas's stages 4 and 5 — "start with A position C7(♯9♯5)",
 *   "start with B position" — so Position 1 is the dominant's own A and
 *   Position 2 its B, with the minor ninth it lands on taking the other
 *   letter so the two hands still alternate. THAT LAST PART IS A
 *   DERIVATION and is in the report as a question.
 *
 * · The 7♭9 and the dim7 passes have no shape in the notes at all.
 *   They fall through to the rotation rule, which is what their four
 *   positions have always meant.
 * =====================================================================
 */
function shapesFor(
  entry: SharedProgression,
  chords: ReadonlyArray<VLChord>,
  rung: ListRung,
  position: number,
): Array<{ right: number[]; extras: number[]; name: string }> | null {
  if (rung !== 'full') return null;

  if (entry.patternId === 'minor-aba') {
    const dominant = position === 1 ? 'A' : 'B';
    const landing = position === 1 ? 'B' : 'A';
    return chords.map(chord => {
      const named = EXTENDED_QUALITY_OF[chord.quality];
      const shape = named === undefined
        ? null
        : extendedShape(named, isDominantExtended(named) ? dominant : landing);
      return shape === null
        ? { right: [], extras: [], name: chord.quality }
        : {
          right: lowestOctave(shape.right),
          extras: [...shape.left].slice(1),
          name: EXTENDED_SUFFIX[named!] ?? chord.quality,
        };
    });
  }

  const pattern = patternFor(entry);
  if (pattern.kind !== 'type-position') return null;
  const run = voiceLeadingExtendedRun(pattern, position === 1 ? 'A' : 'B');
  if (run === null) return null;
  const byDegree = new Map(run.map(c => [c.degree, c]));
  return chords.map(chord => {
    const shaped = byDegree.get(chord.degree);
    return shaped === undefined
      ? { right: [], extras: [], name: chord.quality }
      : {
        right: lowestOctave(shaped.shape.right),
        extras: [...shaped.shape.left].slice(1),
        name: EXTENDED_SUFFIX[shaped.quality] ?? chord.quality,
      };
  });
}

/**
 * A shape folded down to its lowest octave.
 *
 * =====================================================================
 * THE NOTES WRITE A SHAPE FROM WHERE THE HAND SITS; THIS IS THE SHAPE.
 *
 * Silas's 7(♭9♯9♭13) is `[G + D + A♭] + [B, E♭, F, B♭]` — the right
 * hand more than an octave above the root, because that is where it
 * lands when the left hand is holding three notes under it. As a SET OF
 * DISTANCES it is the same chord an octave lower, and the placement
 * below then puts it where it belongs against the hand before it.
 *
 * Folding is what makes the left hand's extra notes fit underneath. Left
 * unfolded, the right hand starts higher than the notes meant to sit
 * below it, and they get dropped.
 * =====================================================================
 */
function lowestOctave(tones: ReadonlyArray<number>): number[] {
  if (tones.length === 0) return [];
  const drop = Math.floor(tones[0] / 12) * 12;
  return tones.map(t => t - drop);
}

/**
 * Silas's shapes, placed: the right hand near the hand before it, the
 * left hand's extras on the bass note.
 *
 * THE SHAPE IS NOT RE-VOICED, ONLY PLACED. Its notes are fixed
 * distances above the chord's root — that is what makes it his shape —
 * so the only choice is which octave to build it in.
 */
function placeShapes(
  shapes: ReadonlyArray<{ right: number[]; extras: number[]; name: string }>,
  chords: ReadonlyArray<VLChord>,
  rootPcs: ReadonlyArray<number>,
  line: ReadonlyArray<number>,
  opts: VoiceEntryOptions,
  keyPc: number,
  spelling: Spelling,
): PlayerChord[] {
  const out: PlayerChord[] = [];
  let previous: number[] | null = null;
  shapes.forEach((shape, i) => {
    const rootPc = rootPcs[i];
    const bass = line[i] ?? null;
    const candidates: number[][] = [];
    for (let root = rootPc; root + (shape.right[0] ?? 0) <= EXT_CEILING; root += 12) {
      const placed = shape.right.map(t => root + t);
      if (placed.length > 0 && placed[0] >= EXT_FLOOR
        && placed[placed.length - 1] <= EXT_CEILING) candidates.push(placed);
    }
    let hand = candidates.find(v => v[0] >= EXT_PREFERRED) ?? candidates[0] ?? [];
    if (previous !== null && candidates.length > 0) {
      const want = opts.handMoves?.[i - 1] ?? 'auto';
      const floor = Math.min(...previous);
      const pool = want === 'auto'
        ? candidates
        : candidates.filter(v => (want === 'up' ? v[0] > floor : v[0] < floor));
      const usable = pool.length > 0 ? pool : candidates;
      hand = usable.reduce((a, b) => (
        Math.abs(b[0] - floor) < Math.abs(a[0] - floor) ? b : a));
    }
    if (hand.length > 0) previous = hand;
    // THE LEFT HAND'S EXTRA NOTES SIT ON THE BASS, where Silas writes
    // them. Only the half-diminished and the 7(♭9♯9♭13) have any.
    const extras = shape.extras
      .map(t => (bass ?? 36) + t)
      .filter(m => hand.length === 0 || m < hand[0]);
    out.push({
      hand: [...extras, ...hand],
      bass,
      rootPc,
      name: chordName(chords[i], keyPc, spelling, shape.name),
    });
  });
  return out;
}

/** What an extended chord is called on a chip. Silas's own names. */
const EXTENDED_SUFFIX: Readonly<Record<string, string>> = {
  'dom9-13': '9(13)',
  'dom7#9#5': '7♯9♯5',
  m9: 'm9',
  maj9: 'maj9',
  'm7b5-11': 'm7♭5(11)',
  'dom7#5': '7♯5',
  'dom7b9#9b13': '7(♭9♯9♭13)',
  'm6-9': 'm6/9',
};
