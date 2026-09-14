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
  bassLine, nearest, voicingsOf, allVoicings, voicingDistance,
  type Move,
} from '../../../lib/builtAnswers/voiceLeading';
import { handTones, type QualityId } from '../../../lib/builtAnswers/chordShapes';
import type { PlayerChord } from '../../../lib/player/voices';
import {
  voiceLeadingExtendedRule, voiceLeadingExtendedRun, type VLChord,
} from '../../shapes-and-patterns/catalog';
import { EXTENDED_QUALITY_OF, extendedShape } from '../../../lib/extendedVoicings';
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
    return namedMoves(placeShapes(shapes, chords, rootPcs, line, opts, keyPc, spelling), opts.bassMoves);
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
  return namedMoves(out, opts.bassMoves);
}

/**
 * The chords whose bass move the card set, marked.
 *
 * A SET MOVE IS A NAMED DIRECTION (Silas, 14 Sep 2026): the card's coin
 * flip, or an arrow the reader tapped. The register then moves the whole
 * line as a block, so that move is never flipped — see `placeBass`.
 */
function namedMoves(chords: PlayerChord[], moves: ReadonlyArray<Move> | undefined): PlayerChord[] {
  return chords.map((c, i) => (i > 0 && (moves?.[i - 1] ?? 'auto') !== 'auto'
    ? { ...c, namesMove: true } : c));
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
/** One chord's placeable shape: the right hand, the left hand's extra
 *  notes, and what the chip calls it. */
interface ShapeOption {
  right: number[];
  extras: number[];
  name: string;
}

/**
 * What each chord of an Extended Voicings row may play.
 *
 * =====================================================================
 * THE POSITION NAMES THE FIRST CHORD, AND THE REST FOLLOWS.
 *
 * Silas's ruling of 10 Sep 2026. Position 1 is the row's first chord in
 * its A shape — the one that starts on the 3rd — and Position 2 the
 * same chord in its B. After that a CADENCE alternates, because trading
 * the two shapes off is what the ABA and BAB runs in his notes are; a
 * LOOP takes whichever shape is the smaller move from the chord before,
 * because that is what a hand does going round.
 *
 * `voiceLeadingExtendedRule` says which a row is, and the catalog hands
 * back both shapes of every chord so the loop's choice can be made
 * where the chords are actually placed — the distance is between
 * placed hands, and nothing above `placeShapes` knows where they are.
 * =====================================================================
 */
function shapesFor(
  entry: SharedProgression,
  chords: ReadonlyArray<VLChord>,
  rung: ListRung,
  position: number,
): Array<{ fixed: ShapeOption | null; options: ShapeOption[] }> | null {
  if (rung !== 'full') return null;

  const asOption = (
    shape: { right: ReadonlyArray<number>; left: ReadonlyArray<number> },
    name: string,
  ): ShapeOption => ({
    right: lowestOctave(shape.right),
    extras: [...shape.left].slice(1),
    name,
  });

  if (entry.patternId === 'minor-aba') {
    // TWO CHORDS, AND THE FIRST IS THE ONE THE POSITION NAMES. The
    // dominant starts the row, so Position 1 plays it in A and the
    // minor ninth it lands on takes B; Position 2 is the reverse.
    const first = position === 1 ? 'A' : 'B';
    const second = position === 1 ? 'B' : 'A';
    return chords.map((chord, i) => {
      const named = EXTENDED_QUALITY_OF[chord.quality];
      const shape = named === undefined
        ? null
        : extendedShape(named, i === 0 ? first : second);
      const option = shape === null
        ? { right: [], extras: [], name: chord.quality }
        : asOption(shape, EXTENDED_SUFFIX[named!] ?? chord.quality);
      return { fixed: option, options: [option] };
    });
  }

  const pattern = patternFor(entry);
  if (pattern.kind !== 'type-position') return null;
  // THE CHORDS IN THE ORDER THIS ENTRY PLAYS THEM. A rotated loop is
  // the row entered by a different door, and the position names its
  // first chord rather than the row's.
  const run = voiceLeadingExtendedRun(pattern, position === 1 ? 'A' : 'B', chords);
  if (run === null) return null;
  const nearest = voiceLeadingExtendedRule(pattern.id) === 'nearest';
  return chords.map((chord, i) => {
    const shaped = run[i];
    if (shaped === undefined) {
      const blank = { right: [], extras: [], name: chord.quality };
      return { fixed: blank, options: [blank] };
    }
    const name = EXTENDED_SUFFIX[shaped.quality] ?? chord.quality;
    const alternating = asOption(shaped.shape, name);
    // FIXED WHERE THERE IS NOTHING TO CHOOSE: the chord the position
    // names, a chord the notes give one shape, and every chord of a
    // cadence — a cadence alternates, and that is the answer already.
    if (!nearest || shaped.fixed) {
      return { fixed: alternating, options: [alternating] };
    }
    const options = (['A', 'B'] as const)
      .map(letter => shaped.alternatives[letter])
      .filter((x): x is NonNullable<typeof x> => x !== undefined)
      .map(shape => asOption(shape, name));
    return { fixed: null, options: options.length > 0 ? options : [alternating] };
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
  shapes: ReadonlyArray<{ fixed: ShapeOption | null; options: ShapeOption[] }>,
  chords: ReadonlyArray<VLChord>,
  rootPcs: ReadonlyArray<number>,
  line: ReadonlyArray<number>,
  opts: VoiceEntryOptions,
  keyPc: number,
  spelling: Spelling,
): PlayerChord[] {
  const out: PlayerChord[] = [];
  let previous: number[] | null = null;
  shapes.forEach((slot, i) => {
    const rootPc = rootPcs[i];
    const bass = line[i] ?? null;
    /** Every placement of one shape that fits the window. */
    const placementsOf = (shape: ShapeOption): number[][] => {
      const out2: number[][] = [];
      for (let root = rootPc; root + (shape.right[0] ?? 0) <= EXT_CEILING; root += 12) {
        const placed = shape.right.map(t => root + t);
        if (placed.length > 0 && placed[0] >= EXT_FLOOR
          && placed[placed.length - 1] <= EXT_CEILING) out2.push(placed);
      }
      return out2;
    };
    const want = opts.handMoves?.[i - 1] ?? 'auto';
    let best: { shape: ShapeOption; hand: number[] } | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const shape of slot.fixed === null ? slot.options : [slot.fixed]) {
      const candidates = placementsOf(shape);
      if (candidates.length === 0) continue;
      if (previous === null) {
        // THE FIRST CHORD HAS NOTHING TO BE NEAR. It takes the lowest
        // placement that sits in the hand's preferred register.
        const hand = candidates.find(v => v[0] >= EXT_PREFERRED) ?? candidates[0];
        best = { shape, hand };
        break;
      }
      const floor = Math.min(...previous);
      const pool = want === 'auto'
        ? candidates
        : candidates.filter(v => (want === 'up' ? v[0] > floor : v[0] < floor));
      for (const hand of (pool.length > 0 ? pool : candidates)) {
        // THE SAME MEASURE `nearest` USES, so "nearest" means one thing
        // in this app: every note's distance to the closest note of the
        // chord before, counted both ways.
        const d = voicingDistance(hand, previous);
        if (d < bestDistance) { bestDistance = d; best = { shape, hand }; }
      }
    }
    const shape = best?.shape ?? slot.fixed ?? slot.options[0]
      ?? { right: [], extras: [], name: '' };
    const hand = best?.hand ?? [];
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
