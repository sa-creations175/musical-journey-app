/**
 * A progression written as a row of chords.
 *
 * =====================================================================
 * ONE FORMATTER, BECAUSE FIVE SURFACES WERE SPELLING IT FIVE WAYS.
 *
 * "1-5-6-4" on a card's question, "1 5 6 4" on its chip and on the
 * grid's row, "C - G - Am - F" on its answer, "1 5 6 4" again on the
 * rotate button. Four separators for one idea, and none of them said
 * that the 6 is minor — which is the whole reason a 1 5 6 4 sounds like
 * a 1 5 6 4.
 *
 * Silas's ruling of 10 Sep 2026, replacing "numbers lead, names follow"
 * wherever that was written as numbers ALONE.
 *
 * =====================================================================
 * AND SINCE THE SAME AFTERNOON, THE SPELLING IS A SETTING.
 *
 * Being spelled ONE way and being spelled THE RIGHT way are different
 * problems, and only the first of them was solved. The middle dot reads
 * cleanly on a screen and the hyphen is what a chart says. Every chord
 * showing its quality is honest on a bare loop and noise on a row whose
 * name already carries it. A half-diminished has two right names and
 * which one is right depends on how thick you are playing it.
 *
 * So the choices live in `lib/progressionSpelling.ts` and this reads
 * them. A caller that has no settings to hand gets the defaults, which
 * is what makes this safe to call from a module-level constant.
 *
 * =====================================================================
 * THE RUNG DECIDES WHICH NAME A HALF-DIMINISHED TAKES.
 *
 * The 2 of a minor 2 5 1 is a diminished triad on the Triads rung and
 * a m7♭5 on Seventh Chords — one degree, two chords under the hand, two
 * true names. So `RowOptions.rung` picks between the setting's two
 * halves, and a surface with no rung (a Harmonic Fluency card, whose
 * answers are triads; a grid's row label, which names the row rather
 * than a rung of it) gets the triad name.
 *
 * The diatonic cycle's 7 is the same chord and follows the same rule.
 *
 * =====================================================================
 * A SEVENTH IS NOT SPELLED OUT. The 5 of a 2 5 1 is a dominant seventh
 * in the data and reads "5", because what a reader needs from the row
 * is which chords the progression is made of, not how thick to play
 * them. Where a seventh IS part of the name, the name already carries
 * it and this does not add one. The one exception is the half-
 * diminished, whose seventh-rung name is the seventh chord's name.
 *
 * The family comes from `FAMILY_OF`, which is where this app already
 * says what kind of chord a quality is. A second table here would be a
 * second answer to that question.
 *
 * =====================================================================
 * THE PASSES ARE NOT ROWS AND DO NOT COME THROUGH HERE. An arrow means
 * RESOLUTION, which is why "5(7♯9♯5) → 1m" keeps it and takes no
 * separator whatever the setting says.
 * =====================================================================
 */
import { FAMILY_OF, type QualityId } from './builtAnswers/chordShapes';
import type { Thickness } from './builtAnswers/chordShapes';
// THE SHAPE, NOT THE HOOKS — so a read layer can spell a row without
// pulling React in. See `progressionSpellingShape`.
import {
  DEFAULT_PROGRESSION_SPELLING, SEPARATOR_TEXT, type ProgressionSpelling,
} from './progressionSpellingShape';

/**
 * The separator the app opened with before the setting existed, and
 * the one a row is stored and compared in.
 *
 * KEPT EXPORTED AND KEPT MEANING THE MIDDLE DOT. The Harmonic Fluency
 * deck is built once at module load and its answer strings are the
 * answer KEY — graded by string equality and written to attempt rows.
 * Those stay canonical whatever the reader is looking at, and the
 * spelling is applied on the way to the eye. See `respellRow`.
 */
export const CHORD_SEPARATOR = ' · ';

/** What goes between two chords, under these settings. */
export function separatorFor(settings?: ProgressionSpelling): string {
  return SEPARATOR_TEXT[(settings ?? DEFAULT_PROGRESSION_SPELLING).separator];
}

/** How a row is being played, where a surface knows. */
export interface RowOptions {
  settings?: ProgressionSpelling;
  /**
   * The thickness rung on screen. Only `'triads'` reads as triads —
   * guide tones are the 3rd and the 7th, so they are a seventh-chord
   * reading like the two rungs above them.
   */
  rung?: Thickness;
  /**
   * Whether the row has a name of its own — a Major 2 5 1, the
   * backdoor, the Diatonic Cycle. Read by "only on spelled loops",
   * which writes a named row in bare numbers because its name is
   * already saying what the chords are.
   */
  named?: boolean;
  /**
   * Chord indices whose quality survives "only on spelled loops".
   *
   * ONE ENTRY IN THE APP AND IT IS THE BACKDOOR'S 4m. The chord is
   * BORROWED — a minor 4 in a major key is the whole of what a backdoor
   * is — so dropping its m would leave a row that no longer describes
   * the progression it names. Written down per row rather than
   * inferred: "which chord of this row cannot lose its quality" is a
   * musical judgement, and a rule that guessed it would one day guess
   * a different row wrong.
   */
  keepQualityAt?: ReadonlyArray<number>;
}

/** Whether a rung is being played as seventh chords. */
function isSeventhRung(rung?: Thickness): boolean {
  return rung !== undefined && rung !== 'triads' && rung !== 'bass';
}

/**
 * The suffix a quality shows.
 *
 * An unknown quality shows itself rather than disappearing: a chord the
 * app cannot classify is better read as odd than as a bare number that
 * says something false.
 */
export function qualitySuffix(
  quality: string, opts: RowOptions = {},
): string {
  const settings = opts.settings ?? DEFAULT_PROGRESSION_SPELLING;
  const family = FAMILY_OF[quality as QualityId];
  if (family === undefined) return quality;
  if (family === 'min') return 'm';
  if (family === 'dim' || family === 'half-dim') {
    return isSeventhRung(opts.rung)
      ? settings.halfDimSeventh
      : settings.halfDimTriad;
  }
  return '';
}

/** A degree as it is written: `b7` is ♭7, `#4` is ♯4. */
export function degreeGlyphs(degree: string): string {
  return degree.replace(/b/g, '♭').replace(/#/g, '♯');
}

/** One chord of a row — its degree and its quality. */
export interface RowChord {
  degree: string;
  quality: string;
}

/** One chord, written. */
export function chordInRow(chord: RowChord, opts: RowOptions = {}): string {
  return `${degreeGlyphs(chord.degree)}${qualitySuffix(chord.quality, opts)}`;
}

/** Whether this row's chords show their qualities at all. */
function showsQualities(opts: RowOptions): boolean {
  const { qualities } = opts.settings ?? DEFAULT_PROGRESSION_SPELLING;
  if (qualities === 'off') return false;
  if (qualities === 'all') return true;
  return opts.named !== true;
}

/**
 * A whole progression, written.
 *
 * Takes the progression's OWN chord data — degrees and qualities — so
 * a surface never builds the string itself and two surfaces cannot come
 * to disagree about what a progression is called.
 */
export function progressionRow(
  chords: ReadonlyArray<RowChord>, opts: RowOptions = {},
): string {
  const settings = opts.settings ?? DEFAULT_PROGRESSION_SPELLING;
  const show = showsQualities(opts);
  const keep = new Set(opts.keepQualityAt ?? []);
  return chords
    .map((chord, i) => {
      // A KEPT QUALITY IS STILL DROPPED BY "OFF". Off means numbers,
      // and the reader who asked for numbers asked for all of them.
      const withQuality = show
        || (keep.has(i) && settings.qualities !== 'off');
      return withQuality
        ? chordInRow(chord, opts)
        : degreeGlyphs(chord.degree);
    })
    .join(separatorFor(settings));
}

/** Anything else that is a row of chords — note names, for one. */
export function joinRow(
  parts: ReadonlyArray<string>, settings?: ProgressionSpelling,
): string {
  return parts.join(separatorFor(settings));
}

/**
 * A row already written in the canonical separator, re-joined in the
 * reader's.
 *
 * =====================================================================
 * FOR THE ANSWER KEY, WHICH IS BAKED AND MUST STAY BAKED.
 *
 * A Harmonic Fluency card's answer and its three decoys are built once,
 * at module load, and are then the card's identity: the session grades
 * by comparing the tapped string to `correctAnswer`, and writes the
 * tapped string to the attempt row. Re-generating them per reader would
 * make a display setting change what is stored and what counts as
 * right.
 *
 * So they stay in `CHORD_SEPARATOR` and this re-joins them on the way
 * to the eye. Safe because the canonical separator is a middle dot
 * with a space either side, which no chord name contains.
 * =====================================================================
 */
export function respellRow(
  canonical: string, settings?: ProgressionSpelling,
): string {
  return canonical.split(CHORD_SEPARATOR).join(separatorFor(settings));
}
