import {
  spellInterval, type Accidental, type Letter, type Pitch,
} from '../reading/pitch';
import {
  INTERVAL_NAMES, article, intervalNameAt, invertedSemitones,
} from './intervalInversion';
import { INTERVAL_QUALITIES, playableName } from './scaleDegreeQuality';
import type { Flashcard } from './catalog';
import { chooseDecoys, rankTarget, sortedRank } from './decoyGuard';
import { CHORD_SEPARATOR, joinRow, progressionRow } from '../../lib/progressionRow';
import {
  CANONICAL_SPELLING, type ProgressionSpelling,
} from '../../lib/progressionSpelling';
import { PRACTICAL_NAME as PRACTICAL_SPELLINGS } from '../../lib/theoreticalSpellings';
import { canonicaliseKey } from '../repertoire/circleOfFourths';
import {
  MINOR_ROOTS, majorPentatonic, minorPentatonic,
  noteLabel as pentNoteLabel, noteList, pentatonicDecoys,
  relativeMinorRoot, scaleName,
} from './pentatonics';

/**
 * The twelve keys, generated rather than hand-written.
 *
 * =====================================================================
 * ONE ROOT LIST FOR EVERY FAMILY, AND THE PRICE IS PAID IN NOTATION.
 *
 * Pentatonic scales needed TWO lists — minor spells badly on the flat
 * side, major on the sharp side — because a scale that needs a double
 * flat cannot be written at all. These families are different: every
 * degree they reach spells with at most one accidental, and the only
 * casualties are the four THEORETICAL spellings, C♭ F♭ B♯ E♯, which are
 * correct notes nobody says out loud.
 *
 * So the list stays flat and the awkward notes are spelled correctly
 * with their practical name beside them:
 *
 *     the ♭7 of D♭ is C♭ (B)
 *     the ♭7 of G♭ is F♭ (E)
 *     the 4  of G♭ is C♭ (B)
 *
 * THE PARENTHETICAL IS THE FEATURE, NOT A CONCESSION. Substituting C♯
 * for D♭ would spell cleanly and would never show the key actually
 * being thought in. If the question is about D♭, the answer is C♭ —
 * that IS the flat seventh of D♭ — and B sits beside it to say where
 * the hand goes. Please do not "simplify" this to the sharp side later.
 * =====================================================================
 */
export const FLAT_TWELVE: ReadonlyArray<string> = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
];

/**
 * The identity name for a root — what an ID may be built from.
 *
 * =====================================================================
 * THE LIST STAYS FLAT. ONLY THE ID CANONICALISES.
 *
 * `FLAT_TWELVE` says G♭, and that is deliberate: the header above it
 * argues the flat spelling as a TEACHING choice and asks, in terms,
 * that it not be simplified to the sharp side later. That comment was
 * read and is honoured here — every question, answer, decoy and
 * explanation still derives from the root as written, because
 * `degreeAscii` spells the degrees FROM the root and swapping the
 * constant would have turned G♭ – D♭ – E♭m – C♭ into the sharp-side
 * spelling silently.
 *
 * What was wrong was narrower: the display spelling was reaching card
 * ids and axis coordinates, where the app has exactly one vocabulary.
 * `lib/spelling.ts` states it — the identity never reaches a screen,
 * and it is the only thing an id may be built from. So ids, axis keys
 * and skill tags take this; nothing the reader sees does.
 * =====================================================================
 */
function identityRoot(root: string): string {
  return canonicaliseKey(root) ?? root;
}

/**
 * (diatonic steps, semitones) from the tonic, per scale degree.
 *
 * THE THREE FLATTENED ONES ARE FOR DECOYS, not for questions. A slash
 * chord's bass is asked about as a degree of the key, and on the sharp
 * side the diatonic degrees alone cannot give an answer any plain
 * company — the ♭3 of B is D and the ♭6 is G. They are unspellable
 * from some flat roots (the ♭3 of G♭ is B♭♭), which is why every
 * caller reaching for one goes through `degreeAsciiOrNull`.
 */
const DEGREE: Readonly<Record<string, readonly [number, number]>> = {
  '1': [0, 0], '2': [1, 2], '3': [2, 4], '4': [3, 5],
  '5': [4, 7], '6': [5, 9], '7': [6, 11], 'b7': [6, 10],
  'b2': [1, 1], 'b3': [2, 3], 'b6': [5, 8],
};

const GLYPH: Readonly<Record<string, string>> = {
  '#': '♯', b: '♭', '##': '𝄪', bb: '𝄫',
};

/**
 * The four theoretical spellings, and the name a player would say.
 *
 * ---------------------------------------------------------------
 * THIS IS THE LYDIAN RULE. IT IS NOT THE SCALE-NAME ALIAS RULE.
 *
 * `lydianChords.ts` marks a NOTE whose correct spelling nobody says
 * aloud — E♯ (F). The note genuinely IS E♯ in that chord; the
 * parenthesis says where the hand goes. This is that same rule.
 *
 * `pentatonics.ts` has a DIFFERENT rule that looks identical on
 * screen: "G♯ (A♭) minor pentatonic" marks a SCALE NAME where both
 * labels are equally real and equally used, and the parenthesis is
 * there because the app defaults to flats while the spelling must be
 * sharp.
 *
 * Same visual convention, two different rules. Do not collapse them:
 * one is about a note that is mis-said, the other about a scale that
 * is double-named. Each of the three files points at the other two.
 * ---------------------------------------------------------------
 *
 * THE TABLE ITSELF LIVES IN `lib/theoreticalSpellings.ts`, which is
 * also what glosses the rendered options. Two copies of four notes
 * would be cheap to keep; a rule applied to options from one copy and
 * to explanations from another would not be.
 */
const PRACTICAL_NAME = PRACTICAL_SPELLINGS;

function parse(name: string): Pitch {
  return {
    letter: name[0] as Letter,
    accidental: (name.slice(1) === '' ? null : name.slice(1)) as Accidental,
    octave: 4,
  };
}

/** ASCII form — "Eb", "F#", "Cb". Storage and comparison. */
export function degreeAscii(root: string, degree: string): string {
  const ascii = degreeAsciiOrNull(root, degree);
  if (ascii === null) throw new Error(`unspellable: ${degree} of ${root}`);
  return ascii;
}

/**
 * The same, declining rather than throwing.
 *
 * `null` means the name would need a double accidental — the ♭3 of G♭
 * is B♭♭, which is a correct note nobody writes. A QUESTION may not
 * reach one, and throwing is right there. A DECOY POOL may, because it
 * walks degrees looking for company, and a pool that threw would take
 * the build down over an option nobody was going to use.
 */
export function degreeAsciiOrNull(root: string, degree: string): string | null {
  const spec = DEGREE[degree];
  if (spec === undefined) return null;
  const p = spellInterval(parse(root), spec[0], spec[1]);
  return p === null ? null : `${p.letter}${p.accidental ?? ''}`;
}

/**
 * Display form with real glyphs and no gloss. What a card STORES for
 * an answer and a decoy.
 *
 * ---------------------------------------------------------------
 * THE STRING STAYS PLAIN; THE SCREEN DOES NOT.
 *
 * An option string is identity — the shell compares the tapped option
 * against `correctAnswer` and writes it into the attempt — so it can
 * carry no bracket. The gloss is applied on the way to the button by
 * `lib/theoreticalSpellings.ts`, and it is applied to every option
 * naming one of the four, decoys included.
 *
 * That last part is what makes it safe, and it is worth stating
 * because the earlier build of these cards got it wrong in the other
 * direction. Forcing a gloss onto every decoy yields "A♭ (G♯)", which
 * teaches something false: G♯ is an ordinary, commonly-written name
 * for that pitch, and C♭ is not. So the gloss keys on the SPELLING,
 * not on the option's role — a decoy spelt C♭ gets it, a decoy spelt
 * A♭ does not, and the bracket therefore says "this letter is not the
 * one you would say" rather than "this one is correct".
 * ---------------------------------------------------------------
 */
export function noteLabel(ascii: string): string {
  const letter = ascii[0];
  const acc = ascii.slice(1);
  return acc === '' ? letter : `${letter}${GLYPH[acc] ?? acc}`;
}

/**
 * Display form WITH the practical name, spaced for prose. Question
 * text and explanations; options are glossed at render instead, and
 * more tightly.
 *
 * =====================================================================
 * A DOUBLE ACCIDENTAL IS GLOSSED TOO, AND IN PLAIN BRACKETS.
 *
 * `PRACTICAL_NAME` holds the four single-accidental spellings that name
 * a white key — C♭, F♭, B♯, E♯ — and its header proves that is the
 * complete set AT SINGLE ACCIDENTALS. A double flat is the other case
 * and needs the same courtesy for a stronger reason: C♭ (B) is a note a
 * reader could find by reasoning, and E𝄫 (D) is one they cannot play
 * until they are told.
 *
 * `scaleDegreeQuality` makes exactly that argument and renders it
 * `B𝄫 (**A**)` — bold, because there the parenthetical IS the
 * instruction. Here the brackets are plain, for two reasons: this is
 * question text rather than a rendered row, so the asterisks would
 * print as asterisks; and the shape a reader already knows from
 * "E♯ (F)" is the shape ruling 1 asked for. The two conventions stay
 * distinct, which that file's header asks in terms.
 *
 * The playable name comes from `playableName` rather than a second
 * table — one letter across at the same pitch, which is the rule, and a
 * table of double flats would be that rule written down again.
 * =====================================================================
 */
export function noteLabelGlossed(ascii: string): string {
  const p = parse(ascii);
  if (p.accidental === 'bb' || p.accidental === '##') {
    return `${noteLabel(ascii)} (${playableName(p)})`;
  }
  const practical = PRACTICAL_NAME[ascii];
  return practical === undefined
    ? noteLabel(ascii)
    : `${noteLabel(ascii)} (${practical})`;
}

/** The degree, spelled and labelled — plain, for answers. */
export function degreeLabel(root: string, degree: string): string {
  return noteLabel(degreeAscii(root, degree));
}

/** The degree with its gloss, for questions and explanations. */
export function degreeLabelGlossed(root: string, degree: string): string {
  return noteLabelGlossed(degreeAscii(root, degree));
}

/**
 * A sentence naming any theoretical spelling used by this card, so the
 * teaching survives being taken out of the answer.
 *
 * Empty when none applies — an explanation that always ended with a
 * keyboard note would train the reader to skip the last sentence.
 */
export function keyboardNote(...asciiNotes: string[]): string {
  const glossed = [...new Set(asciiNotes)]
    .map(n => {
      // A DOUBLE ACCIDENTAL EARNS THE SENTENCE MORE THAN THE FOUR DO.
      // C♭ is a note a reader could find by reasoning; E𝄫 is one they
      // cannot play until they are told. Same sentence, same shape.
      const p = parse(n);
      if (p.accidental === 'bb' || p.accidental === '##') {
        return `${noteLabel(n)} is ${playableName(p)} on the keyboard`;
      }
      return n in PRACTICAL_NAME
        ? `${noteLabel(n)} is ${PRACTICAL_NAME[n]} on the keyboard`
        : null;
    })
    .filter((line): line is string => line !== null);
  return glossed.length === 0 ? '' : ` ${glossed.join('; ')}.`;
}

/**
 * The everyday name for a theoretical spelling — "F" for E♯, "B" for
 * C♭. Undefined for every other note.
 *
 * Exported so a caller that writes in ASCII rather than glyphs can
 * apply the same rule without keeping a second copy of the table.
 * `noteLabelGlossed` above is the glyph-rendering caller; `catalog.ts`
 * is the ASCII one.
 */
export function practicalName(ascii: string): string | undefined {
  return PRACTICAL_NAME[ascii];
}

/** True when this spelling carries a practical name. Exported so a
 *  test can assert the parenthetical appears exactly where it is due
 *  and nowhere else. */
export function needsPracticalName(ascii: string): boolean {
  return practicalName(ascii) !== undefined;
}

const base = (category: Flashcard['category'], categoryName: string) =>
  ({ category, categoryName });

// =====================================================================
// Functional harmony — ii-V-I, V/V, V/vi
// =====================================================================

const SECONDARY_DOMINANT_CONTEXT =
  'A secondary dominant is the V-of-a-chord-that-is-not-the-tonic. Gospel '
  + 'bridges, Stevie Wonder verses and jazz tunes use them to tour through '
  + 'keys without ever leaving home.';

/** V/V — the dominant of the dominant, which is the 2 made major. */
export function generateVofVCards(): Flashcard[] {
  const out: Flashcard[] = [];
  for (const root of FLAT_TWELVE) {
    if (root === 'C') continue;
    const two = degreeLabel(root, '2');
    const five = degreeLabel(root, '5');
    const six = degreeLabel(root, '6');
    const three = degreeLabel(root, '3');
    out.push({
      ...base('functional-harmony', 'Functional Harmony'),
      id: `fh-v-of-v-${identityRoot(root)}`,
      axis: { key: identityRoot(root), shape: 'V/V' },
      question: 'A secondary dominant V/V in the key of '
        + `${noteLabel(root)} major is which chord?`,
      correctAnswer: `${two}7`,
      // The other three dominants a player might reach for: the real V,
      // the VI7 and the III7.
      decoys: [`${five}7`, `${six}7`, `${three}7`],
      explanation: 'V/V points at the V. In the key of '
        + `${noteLabel(root)} major the V is `
        + `${five}, so its own dominant is ${two}7 — the 2 chord made major `
        + `and sevenths, resolving to ${five}7.`
        + keyboardNote(degreeAscii(root, '2'), degreeAscii(root, '5'))
        + ` ${SECONDARY_DOMINANT_CONTEXT}`,
      skillTag: `v-of-v-${identityRoot(root)}`,
    });
  }
  return out;
}

/** V/vi — what it resolves TO, which is the 6 as a minor triad. */
export function generateVofViCards(): Flashcard[] {
  const out: Flashcard[] = [];
  for (const root of FLAT_TWELVE) {
    if (root === 'C') continue;
    const six = degreeLabel(root, '6');
    const three = degreeLabel(root, '3');
    const two = degreeLabel(root, '2');
    const four = degreeLabel(root, '4');
    out.push({
      ...base('functional-harmony', 'Functional Harmony'),
      id: `fh-v-of-vi-${identityRoot(root)}`,
      axis: { key: identityRoot(root), shape: 'V/vi' },
      question: `V/vi in the key of ${noteLabel(root)} major resolves to _____`,
      correctAnswer: `${six}m`,
      decoys: [`${three}m`, `${two}m`, `${four}maj7`],
      explanation: 'V/vi is the V chord pointing at the vi. In the key of '
        + `${noteLabel(root)} major the vi is ${six}m, so the move is `
        + `${degreeLabel(root, '3')}7 → ${six}m. You hear it whenever a song `
        + `pivots into its relative minor for a bridge before drifting home.`
        + keyboardNote(degreeAscii(root, '6'), degreeAscii(root, '3')),
      skillTag: `v-of-vi-${identityRoot(root)}`,
    });
  }
  return out;
}

// =====================================================================
// Modes — the mode of {key} major starting on {degree}
// =====================================================================

/**
 * The seven modes, by the degree of the major scale they start on.
 * Exported for the modes grid's row order.
 *
 * IT WAS THREE — the ones the hand-written C cards happened to drill,
 * and the only ones the generator produced. Ruling 42 makes it all
 * seven in every key, which is what the category has always claimed to
 * be about.
 */
export const MODE_BY_DEGREE: ReadonlyArray<{ degree: string; mode: string }> = [
  { degree: '1', mode: 'Ionian' },
  { degree: '2', mode: 'Dorian' },
  { degree: '3', mode: 'Phrygian' },
  { degree: '4', mode: 'Lydian' },
  { degree: '5', mode: 'Mixolydian' },
  { degree: '6', mode: 'Aeolian' },
  { degree: '7', mode: 'Locrian' },
];

/**
 * THE THIRTEEN KEYS (rulings 39 and 40).
 *
 * =====================================================================
 * F♯ MAJOR AND G♭ MAJOR ARE TWO KEYS, NOT ONE KEY SPELLED TWO WAYS.
 *
 * The mode of G♭ major starting on its 2 is A♭ Dorian. The mode of F♯
 * major starting on its 2 is G♯ Dorian. Same seven keys on a piano, two
 * different answers on the page — exactly the reason `nn-12` survived
 * the degree-note fold-in, where the 4 of F♯ is B and the 4 of G♭ is
 * C♭.
 *
 * THIS REVERSES A DECISION THE MODULE MADE DELIBERATELY, and the
 * reversal is ruling 40's, not this file's. `circleOfFourths` holds ONE
 * identity name per pitch class and `identityRoot` folds G♭ onto F♯;
 * a previous commit went through the deck making every id and axis
 * coordinate mint from that vocabulary, and the twelve-column key axis
 * in `progressGrids` is the visible result. A family that needs both
 * spellings cannot use that vocabulary for its coordinates, so this one
 * does not — see `modeCardId`.
 * =====================================================================
 */
export const THIRTEEN_KEYS: ReadonlyArray<string> = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
];

/**
 * The seven modes, in scale-degree order — the pool every mode card
 * draws its decoys from.
 *
 * =====================================================================
 * A FIXED THREE PER ANSWER WAS THE MOST RELIABLE TELL IN THE DECK.
 *
 * Each degree carried its own `others` list, so an Aeolian answer was
 * always shown against Dorian, Phrygian and Locrian; Mixolydian always
 * against Lydian, Dorian and Ionian. Which meant:
 *
 *     Locrian on screen    → the answer is Aeolian
 *     Ionian on screen     → the answer is Mixolydian
 *     Mixolydian on screen → the answer is Dorian
 *
 * In all twelve keys, with no key, note or degree read. Thirty-six
 * cards, and a raw string comparison could not see it because "A♭
 * Locrian" appears exactly once in the whole deck — the tell lives in
 * the mode word, not the option.
 *
 * So the pool is now all seven and the window rotates with the card's
 * identity. Locrian still turns up; it just turns up beside a Dorian
 * answer as often as an Aeolian one, which is the difference between a
 * decoy and a signpost.
 * =====================================================================
 */
const ALL_MODES = [
  'Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian',
];

const MODE_CONTEXT =
  'Same seven notes as the parent major scale, a different note treated as '
  + 'home. The key signature never changes; what changes is which chord the '
  + 'music keeps returning to.';

/**
 * A mode card's id.
 *
 * =====================================================================
 * THE KEY AS WRITTEN, NOT THE IDENTITY — AND THAT IS FORCED.
 *
 * Every other generated family mints its id from `identityRoot`, which
 * is the app-wide rule and the right one where a pitch class has one
 * name. Ruling 40 gives this family two, and an identity id cannot tell
 * `mo-mode-F#-2` (G♯ Dorian) from `mo-mode-Gb-2` (A♭ Dorian).
 *
 * THE PREFIX CHANGED FROM `mo-mode-of-` TO `mo-mode-`, and that is not
 * tidying. The old ids meant the G♭ cards while SPELLING F♯, so the
 * obvious move — give G♭ its own id and let F♯ take the one that
 * already reads F♯ — would mint `mo-mode-of-F#-2` for a different
 * question than it means today. A retired id minted again is the one
 * thing a flag-free, run-it-twice migration cannot survive: the second
 * run would move the new card's practice onto the old card's
 * destination. So the whole family takes a shape that has never
 * existed, every old id retires for good, and `modeFoldIn` carries the
 * history across. `foldInByIdentity`'s `reusedIds` asserts it.
 * =====================================================================
 */
export function modeCardId(root: string, degree: string): string {
  return `mo-mode-${root}-${degree}`;
}

/** Every mode of every key — 13 x 7 (ruling 42). */
export function generateModeOfCards(): Flashcard[] {
  return buildModeCards(THIRTEEN_KEYS, MODE_BY_DEGREE, {
    skipC: false,
    id: modeCardId,
  });
}

function buildModeCards(
  roots: ReadonlyArray<string>,
  degrees: ReadonlyArray<{ degree: string; mode: string }>,
  opts: { skipC: boolean; id: (root: string, degree: string) => string },
): Flashcard[] {
  const out: Flashcard[] = [];
  for (const root of roots) {
    if (opts.skipC && root === 'C') continue;
    for (const { degree, mode } of degrees) {
      const start = degreeLabel(root, degree);
      const startGlossed = degreeLabelGlossed(root, degree);
      out.push({
        ...base('modes', 'Modes'),
        id: opts.id(root, degree),
        // THE KEY AS WRITTEN. The coordinate has to separate F♯ major
        // from G♭ major for the same reason the id does — a filter that
        // merged them would gather fourteen cards under one chip and
        // answer two different questions with one.
        axis: { key: root, degree: Number(degree) },
        question: 'The mode of the key of '
          + `${noteLabel(root)} major starting on ${startGlossed} is _____`,
        correctAnswer: `${start} ${mode}`,
        // The same starting note under three other mode names — the
        // question is which mode, never which note. WHICH three comes
        // from the rotation, not from the answer.
        decoys: chooseDecoys(
          `${start} ${mode}`,
          ALL_MODES.map(m => `${start} ${m}`),
          {
            count: 3,
            seed: `mo-mode-of-${root}-${degree}`,
            label: `mo-mode-of-${root}-${degree}`,
            category: 'modes',
          },
        ),
        explanation: 'Starting the key of '
          + `${noteLabel(root)} major on its ${degree} gives `
          + `${start} ${mode}.`
          + keyboardNote(degreeAscii(root, degree))
          + ` ${MODE_CONTEXT}`,
        skillTag: `mode-of-${root}-${degree}`,
      });
    }
  }
  return out;
}

// =====================================================================
// Slash chords — Nashville degree notation
// =====================================================================

/**
 * The seven shapes the deck drills (ruling 30).
 *
 * =====================================================================
 * 6/♭7 IS GONE AND FOUR ARE NEW.
 *
 * The old four were the ones the hand-written C cards happened to
 * cover. 6/♭7 was the odd one out — a voice-leading trick rather than
 * a shape a chart puts in front of you — and four that a chart does
 * put in front of you were missing: the second inversion, the 5 over
 * the tonic, the 1 over its 4th, and the 2 minor over the tonic.
 *
 * =====================================================================
 * `reading` IS SILAS'S OWN SENTENCE, VERBATIM.
 *
 * Every card asks in scale degrees, because that is what a chart says.
 * The reveal then adds ONE line saying what the shape IS in chord
 * tones, which is the thing a reader has to build for themselves
 * otherwise — and it is different in kind per shape: three of these
 * are inversions and four are not, and calling the 4/5 an inversion
 * would be teaching something false.
 *
 * The words are approved copy — `docs/HARMONIC_FLUENCY_COPY.md` — and
 * a test reads them from there. NO SHAPE ADDED LATER GETS A LINE
 * INVENTED FOR IT; ruling 30 says so in terms, and the type makes it
 * required so the omission is a conversation rather than a silence.
 *
 * Exported so the slash-chord grid reads the same shape order the
 * generator emits, rather than a second list beside it.
 * =====================================================================
 */
export const SLASH_SHAPES: ReadonlyArray<{
  id: string; label: string; chord: string; bass: string; quality: string;
  reading: string;
}> = [
  { id: '1-3', label: '1/3', chord: '1', bass: '3', quality: '',
    reading: 'the 1 in first inversion' },
  { id: '5-7', label: '5/7', chord: '5', bass: '7', quality: '',
    reading: 'the 5 in first inversion' },
  { id: '1-5', label: '1/5', chord: '1', bass: '5', quality: '',
    reading: 'the 1 in second inversion' },
  { id: '4-5', label: '4/5', chord: '4', bass: '5', quality: '',
    reading: 'the dominant sus sound (9sus4)' },
  { id: '5-1', label: '5/1', chord: '5', bass: '1', quality: '',
    reading: 'the 5 over its 4th, a suspended sound' },
  { id: '1-4', label: '1/4', chord: '1', bass: '4', quality: '',
    reading: 'the 1 over its 4th' },
  { id: '2-1', label: '2m/1', chord: '2', bass: '1', quality: 'm',
    reading: "the 2 minor over the key's home note" },
];


/**
 * Bass degrees a decoy may use, in order of how plausible a misread is.
 *
 * The question is always which BASS, never which chord, so every decoy
 * keeps the chord and moves the bass. A decoy that changed the chord
 * would be answerable without reading the notation at all.
 *
 * =====================================================================
 * IT RUNS PAST THE FIVE THAT USED TO BE THE WHOLE LIST.
 *
 * Five was enough while the four shapes it was written for all sat on
 * the flat side of things. `1/4` in the key of B broke it: the 5, 3
 * and 7 of B are F♯, D♯ and A♯, so B/E was the only option on screen
 * without an accidental and the card could be answered without reading
 * it. The chromatic degrees are the company that fixes that — the ♭3
 * of B is D and the ♭6 is G, both plain.
 *
 * THE ORDER HERE IS MUSICAL RELEVANCE AND `chooseDecoys` DOES NOT KEEP
 * IT, which is worth knowing rather than assuming. The chooser rotates
 * a pool by the card's own id before it picks — deliberately, so two
 * cards drawing from one pool do not show the same three decoys — so a
 * widened pool means chromatic bass notes turn up as wrong answers on
 * most cards rather than only where the diatonic seven cannot give the
 * answer company. That is the module's own convention, followed here
 * rather than worked around; it is raised in the report as a question
 * rather than decided.
 * =====================================================================
 */
const SLASH_BASS_CANDIDATES: ReadonlyArray<string> = [
  '5', '3', '7', 'b7', '1', '2', '6', '4', 'b3', 'b6', 'b2',
];

/** Silas's phrase, as a line — his words with a capital and a stop. */
function asSentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

const SLASH_CONTEXT =
  'The number after the slash is the BASS scale degree (Nashville notation), '
  + 'not the Roman V/x, which means a secondary dominant. Two notations, one '
  + 'slash — context tells them apart.';

/**
 * DECOYS: the same chord over three other bass notes.
 *
 * The question is always which BASS, never which chord, so a decoy
 * that changed the chord would be answerable without reading the
 * notation. Three families: the chord over its own 5th, over its own
 * 3rd, and over the degree one step away from the right answer — the
 * near-miss that catches a misread digit.
 */
/**
 * A slash card's id.
 *
 * THE KEY AS WRITTEN, AND A PREFIX THAT HAS NEVER EXISTED — the mode
 * family's arrangement, for the mode family's reason. Ruling 40 makes
 * F♯ major and G♭ major two keys; `identityRoot` folds them into one,
 * so the old `sc-1-3-F#` MEANS the G♭ card while SPELLING F♯. Letting
 * F♯ take that id would mint a retired id again, which no flag-free,
 * run-it-twice migration can survive. `slashFoldIn` carries the
 * history across and `reusedIds` asserts nothing comes back.
 *
 * `sc-slash-` also cannot collide with the hand-written prose cards,
 * which are `sc-1` to `sc-16`.
 */
export function slashCardId(shapeId: string, root: string): string {
  return `sc-slash-${shapeId}-${root}`;
}

/** Every shape in every key — 13 x 7 (rulings 39 and 40). */
export function generateSlashCards(): Flashcard[] {
  return buildSlashCards(THIRTEEN_KEYS, slashCardId, root => root);
}

function buildSlashCards(
  roots: ReadonlyArray<string>,
  id: (shapeId: string, root: string) => string,
  axisKey: (root: string) => string,
): Flashcard[] {
  const out: Flashcard[] = [];
  /**
   * Which wrong answers a given right answer has already been offered
   * against.
   *
   * =====================================================================
   * TWO SHAPES CAN NAME THE SAME CHORD, AND RULING 30 MADE THAT TRUE.
   *
   * `G/C` is 1/4 in the key of G and 5/1 in the key of C — the same
   * two names, asked two different ways, which is a good pair of cards
   * and not a duplicate. But if both offer `G/A` as a wrong answer,
   * then `G/A` on screen means the answer is `G/C`, on every card that
   * shows it. `findTells` calls that a tell and it is right to: a
   * reader who has met the pair twice can answer the third sighting
   * without reading the question.
   *
   * So a decoy already spent on an answer is out of the pool for the
   * next card that shares it. The pool is eight or nine deep and three
   * are taken, so the second card always has enough left.
   * =====================================================================
   */
  const spentOn = new Map<string, Set<string>>();
  // EVERY KEY, EVERY SHAPE, NO EXCEPTIONS. Three shapes used to be
  // skipped in C because `catalog.ts` held a hand-written card for each
  // — a second implementation of this generator, asking the identical
  // question with the identical answer and carrying no `axis`, so the
  // filter row could not see it and it had no sound. The three are gone
  // and their practice moved here (ruling 37; see `slashCFoldIn.ts`).
  // Thirteen keys since ruling 40, F♯ major and G♭ major both.
  for (const root of roots) {
    for (const shape of SLASH_SHAPES) {
      const chordRoot = degreeLabel(root, shape.chord);
      const chord = `${chordRoot}${shape.quality}`;
      const bass = degreeLabel(root, shape.bass);
      // OTHER BASS DEGREES, ordered by how plausible a misread is,
      // and then handed to the deck's own chooser rather than sliced.
      //
      // IT USED TO TAKE THE FIRST THREE, and that could not adapt: in
      // the key of B the first three are all sharp, so `B/E` was the
      // only plain name on screen. Every other generator in the module
      // goes through `chooseDecoys`, which rejects a set a blind rule
      // can solve and keeps the caller's ordering where it can; this
      // was the last one hand-rolling it.
      //
      // THE CHORD'S OWN ROOT IS OUT OF THE POOL, which is a defect
      // this found rather than a precaution. On 5/7 the candidate
      // list's `5` resolves to the chord's own root, so every one of
      // those cards offered `G/G` as a wrong answer — a chord over
      // itself, which is not a slash chord at all and is answerable
      // without reading anything. The new 5/1 would have done the same.
      const pool = SLASH_BASS_CANDIDATES
        .filter(d => d !== shape.bass)
        .map(d => degreeAsciiOrNull(root, d))
        // A degree this root cannot spell AT ALL is dropped rather
        // than thrown over — see `degreeAsciiOrNull`.
        .filter((a): a is string => a !== null)
        // AND ONE IT CAN ONLY SPELL WITH A DOUBLE goes too. The ♭2 of
        // D♭ is E𝄫: a correct note, and not a name anybody would put
        // on a chart or recognise as a wrong answer. The rule the
        // whole file follows — see the header on `FLAT_TWELVE` — is
        // that nothing here reaches past one accidental.
        .filter(a => a.slice(1).length <= 1)
        .map(noteLabel)
        .filter(bassName => bassName !== chordRoot)
        .map(bassName => `${chord}/${bassName}`);
      const cardId = id(shape.id, root);
      const answer = `${chord}/${bass}`;
      const spent = spentOn.get(answer) ?? new Set<string>();
      const decoys = chooseDecoys(answer, pool.filter(o => !spent.has(o)), {
        // SEEDED ON THE OLD ID SHAPE, deliberately. The seed decides
        // which three of the pool a card shows; changing it would
        // reshuffle every existing card's wrong answers for no reason,
        // and a fold-in pairs on the QUESTION and the ANSWER, which the
        // decoys are not part of. F♯ and G♭ therefore share a rotation
        // offset, which is harmless: they draw from different pools and
        // answer differently, so the sets still differ.
        count: 3,
        seed: `sc-${shape.id}-${identityRoot(root)}`,
        label: cardId,
        category: 'slash-chords',
      });
      for (const d of decoys) spent.add(d);
      spentOn.set(answer, spent);
      out.push({
        ...base('slash-chords', 'Slash Chords'),
        id: cardId,
        // THE KEY AS WRITTEN (ruling 40) — a filter that merged F♯ and
        // G♭ would gather fourteen cards under one chip and answer two
        // different questions with one.
        axis: { key: axisKey(root), shape: shape.id },
        question: `What is ${shape.label} in the key of ${noteLabel(root)} major?`,
        correctAnswer: answer,
        decoys,
        // ONE LINE FOR THE CHORD-TONE READING, at the end, on its own
        // line (ruling 30). `whitespace-pre-wrap` on the reveal is
        // what makes a newline a newline — the same seam scale-degree
        // math's worked arithmetic uses.
        explanation: `${shape.label} means the ${shape.chord} chord with the `
          + `${shape.bass} scale degree in the bass — in the key of `
          + `${noteLabel(root)} major that is ${chord}/${bass}.`
          + keyboardNote(degreeAscii(root, shape.bass), degreeAscii(root, shape.chord))
          + ` ${SLASH_CONTEXT}`
          + `\n${asSentence(shape.reading)}`,
        skillTag: `slash-${shape.id}-${axisKey(root)}`,
      });
    }
  }
  return out;
}

// =====================================================================
// Coverage top-ups — the categories that were partial
// =====================================================================

const RELATIVE_CONTEXT =
  'The relative minor sits on the 6 of the major scale — same seven notes, '
  + 'different home. That pairing is why a song can flip between the two '
  + 'without a single accidental changing.';

/**
 * Every degree a relative/parallel-minor decoy may name, most
 * plausible first.
 *
 * =====================================================================
 * A FIXED THREE-DEGREE LIST COULD NOT ALWAYS PRODUCE A FAIR CARD.
 *
 * The parallel minor of B major is B minor, and the list asked for the
 * 6, 2 and 5 — G♯, C♯ and F♯. Every decoy carried an accidental and the
 * answer did not, so B minor was the only plain name on screen. In B
 * major only E and B are natural, so no THREE-degree list fixes it in
 * every key; the choice has to be made per key from a wider pool.
 *
 * The 6, the 2 and the 1 stay first because they are the mistakes
 * worth making: the 6 IS the relative minor and the 1 IS the parallel
 * one, and confusing those two is what both cards are about. The rest
 * are there so the chooser has somewhere to go when shape demands it.
 * A degree that happens to be the answer is filtered by the chooser,
 * so one list serves both cards.
 * =====================================================================
 */
const MINOR_DECOY_DEGREES = ['6', '2', '1', '5', '3', '4', '7'];

const PARALLEL_CONTEXT =
  'The parallel minor shares the ROOT and changes the quality. It is where a '
  + 'major-key song borrows from when it leans dark — iv minor, ♭VII and '
  + '♭VI all come from there.';

/**
 * How many sharps or flats each of the thirteen keys carries, and
 * which.
 *
 * =====================================================================
 * THE COUNT IS A FACT ABOUT THE KEY, NOT A DERIVATION WORTH HIDING.
 *
 * It is the key's place on the circle of fifths, and it could be
 * computed — but the ORDER of the accidentals cannot be computed from
 * the key at all: F♯ C♯ G♯ D♯ A♯ E♯ B♯ and B♭ E♭ A♭ D♭ G♭ C♭ F♭ are two
 * fixed sequences, and the deck already teaches them on `ks-21` and
 * `ks-22`. So the sequences are written once and every count reads the
 * first n of one, which is what makes "G major has 1 sharp: F♯" a
 * derivation rather than a second table of thirteen answers.
 *
 * C IS NEITHER, AND KEEPS THE DECK'S OWN WORDING for that: "C major has
 * _____ sharps/flats", which is what `ks-1` has always asked.
 * =====================================================================
 */
/**
 * How many sharps or flats a key carries — 0 through 7.
 *
 * Seven is real, not a safety margin: C♯ major has seven sharps and C♭
 * major seven flats. A decoy may name any count a key signature can
 * actually have, and none it cannot.
 */
export const ACCIDENTAL_COUNTS = [0, 1, 2, 3, 4, 5, 6, 7];

/** Three wrong answers per card, as everywhere else in the deck. */
const DECOY_COUNT = 3;

/**
 * Decoys for a "G major has _____ sharps" card.
 *
 * =====================================================================
 * TWELVE HAND-WRITTEN CARDS WITH THE SAME DEFECT AS SCALE-DEGREE MATH.
 *
 * Six of the twelve listed the answer flanked — 1 against 2, 0 and 3;
 * 3 against 2, 4 and 5 — so three options were consecutive and the
 * answer sat between them. You could score half the family by picking
 * the middle number.
 *
 * The other six were clean by luck, not by rule, so all twelve are
 * converted rather than the six that happened to fail. A rule applied
 * only to the cards that tripped it is not a rule.
 *
 * The questions, explanations and ids are untouched — this replaces
 * hand-counted decoys with the derivation scale-degree math already
 * uses, and nothing else.
 *
 * IT MOVED HERE with commit 8, because the generated count cards need
 * the same derivation and a second copy of "which three counts does
 * this card show" is how the pinned ranks would drift. The retired
 * hand-written twelve still call it from `catalog.ts`.
 * =====================================================================
 */
export function accidentalCountDecoys(id: string, count: number): string[] {
  const highest = ACCIDENTAL_COUNTS[ACCIDENTAL_COUNTS.length - 1];
  const wanted = rankTarget(
    id,
    Math.max(0, DECOY_COUNT - (highest - count)),
    Math.min(DECOY_COUNT, count),
  );
  return chooseDecoys(
    String(count),
    ACCIDENTAL_COUNTS
      .filter(n => n !== count)
      .sort((a, b) => Math.abs(a - count) - Math.abs(b - count) || a - b)
      .map(String),
    {
      count: DECOY_COUNT,
      seed: id,
      label: id,
      category: 'key-signatures',
      require: ds => sortedRank(String(count), ds) === wanted,
    },
  );
}

const SHARP_ORDER: ReadonlyArray<string> = ['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#'];
const FLAT_ORDER: ReadonlyArray<string> = ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb'];

interface KeySignature {
  /** The key, as written. */
  root: string;
  count: number;
  /** The word the question uses. C is neither, and says both. */
  kind: 'sharps' | 'flats' | 'sharps/flats';
}

export const KEY_SIGNATURES: ReadonlyArray<KeySignature> = [
  { root: 'C',  count: 0, kind: 'sharps/flats' },
  { root: 'G',  count: 1, kind: 'sharps' },
  { root: 'D',  count: 2, kind: 'sharps' },
  { root: 'A',  count: 3, kind: 'sharps' },
  { root: 'E',  count: 4, kind: 'sharps' },
  { root: 'B',  count: 5, kind: 'sharps' },
  { root: 'F#', count: 6, kind: 'sharps' },
  { root: 'F',  count: 1, kind: 'flats' },
  { root: 'Bb', count: 2, kind: 'flats' },
  { root: 'Eb', count: 3, kind: 'flats' },
  { root: 'Ab', count: 4, kind: 'flats' },
  { root: 'Db', count: 5, kind: 'flats' },
  { root: 'Gb', count: 6, kind: 'flats' },
];

/** The accidentals a key actually carries, in signature order. */
/**
 * The accidentals a key carries, as the card writes them.
 *
 * EXPORTED SO THE REVEAL CAN COLOUR THEM RATHER THAN FIND THEM IN THE
 * SENTENCE. The count card's explanation ends "…3 flats: B♭ E♭ A♭",
 * and colouring those three means knowing which three — which this
 * already knows, because it is what wrote them. Reading them back out
 * of the text would be the parsing `catalog.ts` refuses in terms.
 *
 * Returns display names with glyphs, the same strings the explanation
 * prints, so a caller can match them without re-spelling anything.
 */
export function signatureAccidentals(root: string): string[] {
  const sig = KEY_SIGNATURES.find(k => k.root === root);
  return sig === undefined ? [] : accidentalsOf(sig).map(noteLabel);
}

function accidentalsOf(sig: KeySignature): string[] {
  if (sig.kind === 'sharps/flats') return [];
  const order = sig.kind === 'sharps' ? SHARP_ORDER : FLAT_ORDER;
  return order.slice(0, sig.count);
}

/** The relative minor's root, as written — the 6 of the major scale. */
function relativeMinorAscii(root: string): string {
  return degreeAscii(root, '6');
}

/** "A minor", "D♯ minor", "E♭ minor". */
function minorKeyName(root: string): string {
  return `${noteLabel(relativeMinorAscii(root))} minor`;
}

/** "C major", "G♭ major". */
function majorKeyName(root: string): string {
  return `${noteLabel(root)} major`;
}

/**
 * "G major has _____ sharps" — thirteen keys (rulings 39 and 40).
 *
 * F♯ MAJOR AND G♭ MAJOR ARE TWO CARDS with two different answers, six
 * sharps and six flats, which is the clearest place in the deck that
 * ruling 40 is a musical claim rather than a spelling preference.
 */
export function generateKeyCountCards(): Flashcard[] {
  return KEY_SIGNATURES.map(sig => {
    const id = `ks-count-${sig.root}`;
    const named = accidentalsOf(sig);
    return {
      ...base('key-signatures', 'Key Signatures'),
      id,
      axis: { key: sig.root, ask: 'count' },
      question:
        `The key of ${noteLabel(sig.root)} major has _____ ${sig.kind}`,
      correctAnswer: String(sig.count),
      // THE SAME DERIVATION THE HAND-WRITTEN TWELVE USE. It targets a
      // rank so the answer is not always the middle of three
      // consecutive numbers — the defect that let half the old family
      // be scored by picking the middle one.
      decoys: accidentalCountDecoys(id, sig.count),
      // THE FACT, AND THE ACCIDENTALS IT COUNTS, AND NOTHING ELSE.
      //
      // `ks-2` opened "G major has one sharp: F#" and then said what
      // the key feels like to play in — a sentence per key, written by
      // hand, which a generator cannot produce and must not imitate.
      // So the generated explanation is the first half only, derived,
      // and the colour is Silas's to add back if he wants it.
      explanation: named.length === 0
        ? `The key of ${majorKeyName(sig.root)} has no sharps and no flats.`
        : `The key of ${majorKeyName(sig.root)} has ${sig.count} `
          + `${sig.count === 1 ? sig.kind.slice(0, -1) : sig.kind}: `
          + `${named.map(noteLabel).join(' ')}.`
          + keyboardNote(...named),
      skillTag: `key-sig-${sig.root}`,
    };
  });
}

/**
 * The relative pair, both directions, in every key (ruling: commit 8).
 *
 * BOTH DIRECTIONS BECAUSE THEY ARE TWO RETRIEVALS. Naming the relative
 * minor of A♭ and naming the relative major of F minor are the same
 * fact and different questions — the deck already had both, unevenly:
 * fifteen one way and twelve the other, in overlapping key sets.
 */
export function generateRelativeCards(): Flashcard[] {
  const out: Flashcard[] = [];
  const minorNames = KEY_SIGNATURES.map(k => minorKeyName(k.root));
  const majorNames = KEY_SIGNATURES.map(k => majorKeyName(k.root));
  for (const { root } of KEY_SIGNATURES) {
    const minor = minorKeyName(root);
    const major = majorKeyName(root);
    const six = relativeMinorAscii(root);

    const minorId = `ks-relminor-${root}`;
    out.push({
      ...base('key-signatures', 'Key Signatures'),
      id: minorId,
      axis: { key: root, ask: 'relative', relation: 'relative' },
      question: 'The relative minor of the key of '
        + `${noteLabel(root)} major is _____`,
      correctAnswer: minor,
      decoys: chooseDecoys(minor, minorNames, {
        count: 3, seed: minorId, label: minorId, category: 'key-signatures',
      }),
      explanation: `The key of ${minor} is the relative minor of `
        + `the key of ${major}.`
        + keyboardNote(six)
        + ` ${RELATIVE_CONTEXT}`,
      skillTag: `relative-minor-${root}`,
    });

    const majorId = `ks-relmajor-${root}`;
    out.push({
      ...base('key-signatures', 'Key Signatures'),
      id: majorId,
      axis: { key: root, ask: 'relative major' },
      question: 'The relative major of the key of '
        + `${noteLabel(six)} minor is _____`,
      correctAnswer: major,
      decoys: chooseDecoys(major, majorNames, {
        count: 3, seed: majorId, label: majorId, category: 'key-signatures',
      }),
      explanation: `The key of ${major} is the relative major of `
        + `the key of ${minor}.`
        + keyboardNote(six)
        + ` ${RELATIVE_CONTEXT}`,
      skillTag: `relative-major-${root}`,
    });
  }
  return out;
}

/**
 * A count, and the key it names — one card per MODE (ruling: commit 8).
 *
 * =====================================================================
 * NEVER "E♭ MAJOR OR C MINOR".
 *
 * `ks-19` answered a count with both keys at once and then told the
 * reader to look at the final chord to tell which. That is two facts
 * and a disambiguation rule in one option string, and it cannot be
 * drilled: there is nothing to get right or wrong about "or".
 *
 * Two cards instead. "The major key with 3 flats is _____" and "The
 * minor key with 3 flats is _____" are two retrievals a player actually
 * makes, and each has one answer.
 *
 * THIRTEEN COUNTS, WHICH IS EXACTLY THE THIRTEEN KEYS: nothing for
 * seven sharps or seven flats, because C♯ major and C♭ major are not
 * keys in this deck.
 * =====================================================================
 */
export function generateKeyFromCountCards(): Flashcard[] {
  const out: Flashcard[] = [];
  const minorNames = KEY_SIGNATURES.map(k => minorKeyName(k.root));
  const majorNames = KEY_SIGNATURES.map(k => majorKeyName(k.root));
  for (const sig of KEY_SIGNATURES) {
    const asked = `${sig.count} ${sig.kind}`;
    const major = majorKeyName(sig.root);
    const minor = minorKeyName(sig.root);

    const majorId = `ks-sig-major-${sig.root}`;
    out.push({
      ...base('key-signatures', 'Key Signatures'),
      id: majorId,
      axis: { key: sig.root, ask: 'major key' },
      question: `The major key with ${asked} is _____`,
      correctAnswer: major,
      decoys: chooseDecoys(major, majorNames, {
        count: 3, seed: majorId, label: majorId, category: 'key-signatures',
      }),
      explanation: `${asked} is the key of ${major}.`
        + ` ${RELATIVE_CONTEXT}`,
      skillTag: `key-from-signature-major-${sig.root}`,
    });

    const minorId = `ks-sig-minor-${sig.root}`;
    out.push({
      ...base('key-signatures', 'Key Signatures'),
      id: minorId,
      axis: { key: sig.root, ask: 'minor key' },
      question: `The minor key with ${asked} is _____`,
      correctAnswer: minor,
      decoys: chooseDecoys(minor, minorNames, {
        count: 3, seed: minorId, label: minorId, category: 'key-signatures',
      }),
      explanation: `${asked} is the key of ${minor}.`
        + keyboardNote(relativeMinorAscii(sig.root))
        + ` ${RELATIVE_CONTEXT}`,
      skillTag: `key-from-signature-minor-${sig.root}`,
    });
  }
  return out;
}

export function generateParallelMinorTopUps(): Flashcard[] {
  const have = new Set(['Bb', 'D', 'F', 'G']);
  return FLAT_TWELVE.filter(r => !have.has(r)).map(root => ({
    ...base('key-signatures', 'Key Signatures'),
    id: `ks-parallel-${identityRoot(root)}`,
    // THE KEY AS WRITTEN AND AN `ask` ROW, both coordinate-only. The
    // card's words, id, answer and decoys are untouched — Silas has not
    // ruled on the parallel set — but the grid it draws on now holds
    // thirteen columns and six rows, and a card whose coordinate is not
    // on the axis lands in the tail with nothing on screen to say so.
    axis: { key: root, ask: 'parallel', relation: 'parallel' },
    question: 'The parallel minor of the key of '
      + `${noteLabel(root)} major is _____`,
    correctAnswer: `${noteLabel(root)} minor`,
    decoys: chooseDecoys(
      `${noteLabel(root)} minor`,
      MINOR_DECOY_DEGREES.map(d => `${degreeLabel(root, d)} minor`),
      {
        count: 3,
        seed: `ks-parallel-${root}`,
        label: `ks-parallel-${root}`,
        category: 'key-signatures',
      },
    ),
    explanation: `The key of ${noteLabel(root)} minor — same root, opposite `
      + `quality. ${PARALLEL_CONTEXT}`,
    skillTag: `parallel-minor-${identityRoot(root)}`,
  }));
}

// =====================================================================
// Intervals — the five start notes the category never used
// =====================================================================

const INTERVAL_CONTEXT =
  'Intervals are the raw material of melody and voicing: every lick and every '
  + 'chord shape is a specific sequence of these distances.';

/**
 * WHAT AN INTERVAL IS CALLED — read from `INTERVAL_NAMES`, which is the
 * one table.
 *
 * =====================================================================
 * IT WAS A SECOND COPY, AND THE COPIES DISAGREED.
 *
 * A local `INTERVAL_NAME_BY_SEMITONES` stood here saying "Minor 3rd"
 * while `INTERVAL_NAMES` — the table whose own header says "ONE TABLE,
 * NOT THREE" — says "minor 3rd". So the deck answered the same question
 * two ways depending on which generator wrote the card, which is
 * exactly the drift that header exists to prevent, arriving from the
 * direction it did not anticipate.
 *
 * The five top-up cards that used it all happened to answer Major or
 * Perfect names, where the two tables agree, which is why nothing ever
 * looked wrong.
 * =====================================================================
 */
function intervalName(semitones: number): string {
  const name = intervalNameAt(semitones);
  if (name === undefined) throw new Error(`no interval name at ${semitones}`);
  return name;
}

/**
 * An interval that the deck calls one thing and players call others.
 *
 * =====================================================================
 * ONE ENTRY, AND IT BELONGS IN THE REVEAL RATHER THAN THE OPTION.
 *
 * The option stays the single word the one interval-name table uses.
 * A longer answer was tried and cannot ship: `chooseDecoys` refuses any
 * set a blind rule can solve, and the other twelve names are short and
 * plain, so ANY second name on the tritone — bracketed, slashed, or
 * even the plain "Augmented 4th" — makes the answer the uniquely
 * longest option and throws at import. That is the guard working; the
 * fix is to say it where saying it costs nothing.
 *
 * A map rather than an `if`, so the next interval with two readings is
 * a line here and not a branch in the generator.
 * =====================================================================
 */
const OTHER_READINGS: Readonly<Record<string, string>> = {
  Tritone: ', also called the augmented 4th or ♭5',
};

/**
 * Every span an interval card asks about, in semitones — a minor 2nd up
 * to a major 7th.
 *
 * NEITHER END OF THE OCTAVE IS ASKED. The unison never was: "the
 * interval from D♭ to D♭" is not a distance anybody is asked to name.
 * The octave was, for a week, and it is the same card — "The interval
 * from D♭ to D♭ ascending = ?" answers itself off the two note names,
 * without reading the word "ascending" or knowing anything. Ruling 43
 * asked for every note by every distance; an interval from a note to
 * itself is not one.
 */
const INTERVAL_SPANS: ReadonlyArray<number> =
  Array.from({ length: 11 }, (_, i) => i + 1);

/**
 * How many LETTER steps an interval of this many semitones moves.
 *
 * =====================================================================
 * THE LETTER COUNT IS WHAT DECIDES THE SPELLING, and this table is the
 * one reading the deck already takes. Six semitones is written as an
 * augmented 4th — three letter steps — because that is what `iv-17`,
 * "the interval from F to B", has always been. The other reading, a
 * diminished 5th, is a different card the family does not ask.
 * =====================================================================
 */
const LETTER_STEPS_BY_SEMITONES: Readonly<Record<number, number>> = {
  1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6, 12: 7,
};

/**
 * The note this interval lands on.
 *
 * =====================================================================
 * A CARD IS NEVER SKIPPED OVER SPELLING.
 *
 * Six of the 156 need a double flat — the minor 2nd above D♭ is E𝄫 —
 * and for a while those six were left out. That was the wrong trade.
 * The minor 2nd above D♭ is a real interval and a reader meets it; the
 * only alternative name, "D♭ to D", is an augmented unison and would
 * teach the opposite of what the card asks.
 *
 * So the true spelling is written and the plain name follows it in
 * brackets, the way the deck already writes E♯ (F) and C♭ (B). The
 * no-double-accidentals rule is narrowed rather than dropped: a double
 * is allowed where it is the only honest spelling and it always carries
 * the bracket. Nothing outside this family reaches one, and the test
 * still fails if anything does.
 *
 * `null` is left for a spelling `spellInterval` cannot produce at all,
 * which nothing in this grid reaches.
 * =====================================================================
 */
export function intervalToAscii(from: string, semitones: number): string | null {
  const steps = LETTER_STEPS_BY_SEMITONES[semitones];
  if (steps === undefined) return null;
  const p = spellInterval(parse(from), steps, semitones);
  if (p === null) return null;
  return `${p.letter}${p.accidental ?? ''}`;
}

/**
 * The interval names a wrong answer may take, nearest distance first.
 *
 * A semitone out is the mistake worth making, so those come first; then
 * the rest of the table, so the chooser has room to find company for a
 * long answer name. `longest` is asserted in this category — "Perfect
 * 4th" beside three shorter names was the answer without the question
 * being read.
 */
function intervalDecoyPool(semitones: number): string[] {
  return INTERVAL_NAMES
    .map(i => i.semitones)
    .sort((a, b) => Math.abs(a - semitones) - Math.abs(b - semitones) || a - b)
    .map(intervalName);
}

/**
 * Every note, every distance, ascending (ruling 43).
 *
 * =====================================================================
 * THIRTEEN NOTES BECAUSE THIRTEEN KEYS.
 *
 * `THIRTEEN_KEYS` is a list of KEYS and this is a list of NOTES, and
 * they are the same list on purpose: ruling 43 defines the note
 * vocabulary as "the twelve pitch classes in the app's flat-default
 * spelling, plus the sharp twins where a key uses them", and F♯ is the
 * only sharp twin a key uses. Two lists of the same thirteen strings is
 * how one comes to hold a note the other does not.
 *
 * ASCENDING ONLY, and that is not an omission. Ruling 43 says to add a
 * descending shape only if the family already has one, and it does not
 * — every card in it has said "ascending" since it was written.
 *
 * 143 CARDS — thirteen notes by eleven distances. It was 150 for a
 * week, then 156: six spellings need a double accidental (the minor 2nd
 * above D♭ is E𝄫) and were skipped rather than written wrong, until the
 * follow-up ruling said a card is never skipped over spelling, so all
 * six are written and glossed. Then the thirteen octave cards went, for
 * asking nothing at all.
 * =====================================================================
 */
export function generateIntervalGrid(): Flashcard[] {
  const out: Flashcard[] = [];
  for (const from of THIRTEEN_KEYS) {
    for (const semitones of INTERVAL_SPANS) {
      const toAscii = intervalToAscii(from, semitones);
      if (toAscii === null) continue;
      const correct = intervalName(semitones);
      const id = `iv-${from}-up-${semitones}`;
      out.push({
        ...base('intervals', 'Intervals'),
        id,
        // `from` IS NOT CANONICALISED, and that is the point. It is a
        // NOTE in an interval, not a key being related to another —
        // and under ruling 40 the row axis holds both spellings of the
        // sixth pitch, so folding G♭ onto F♯ would drop half of them
        // into one row.
        //
        // `movement` is carried rather than derived (ruling 43), so the
        // Distance chip gathers these beside the movement cards without
        // re-reading two note names to work out what it already knew.
        axis: {
          from,
          to: toAscii,
          semitones,
          ...(movementForSpan(semitones) === null
            ? {}
            : { movement: movementForSpan(semitones)! }),
        },
        question: `The interval from ${noteLabel(from)} to `
          + `${noteLabelGlossed(toAscii)} ascending = ?`,
        correctAnswer: correct,
        decoys: chooseDecoys(correct, intervalDecoyPool(semitones), {
          count: 3, seed: id, label: id, category: 'intervals',
        }),
        // THE INTERVAL, THEN THE SAME TWO NOTES THE OTHER WAY UP.
        //
        // "SPANS N SEMITONES" IS GONE (8 Sep ruling): distance reads in
        // words, never in half-step counts. It was the only place in
        // the deck still counting them out loud.
        //
        // The flip is what the fifteen inversion fact cards used to
        // drill. It belongs here — on the two notes the reader is
        // looking at, in the reveal — rather than as a rule asked in
        // the abstract, and both names come from the one interval-name
        // table so the sentence cannot disagree with the card.
        explanation: `${noteLabel(from)} up to ${noteLabel(toAscii)} is `
          + `${article(correct)} ${correct}${OTHER_READINGS[correct] ?? ''}.`
          + flipSentence(from, toAscii, semitones)
          + keyboardNote(toAscii)
          + ` ${INTERVAL_CONTEXT}`,
        skillTag: `interval-${from}-up-${semitones}`,
      });
    }
  }
  return out;
}

/**
 * The same two notes the other way up, said in the reveal.
 *
 * =====================================================================
 * THIS IS WHAT THE FIFTEEN FACT CARDS USED TO DRILL.
 *
 * A minor 3rd flips to a Major 6th; a Perfect 4th to a Perfect 5th; the
 * tritone to itself. Silas's ruling: the skill is the relationship
 * between two notes on the keyboard, both ways, and the grid asks both
 * directions of every pair. So the rule reads on the two notes in front
 * of the reader rather than being asked in the abstract, and both names
 * come from the one interval-name table.
 *
 * NO SPECIAL CASE ANY MORE. The octave used to need one — its two notes
 * have the same name, so "D♭ up to D♭ is an Octave. Flipped, D♭ up to
 * D♭ is a Unison." read as a contradiction — and the answer turned out
 * to be that the octave is not a card. Every span left has two
 * different note names, so every card says its flip.
 * =====================================================================
 */
function flipSentence(from: string, toAscii: string, semitones: number): string {
  const flipped = intervalName(invertedSemitones(semitones));
  return ` Flipped, ${noteLabel(toAscii)} up to ${noteLabel(from)} is `
    + `${article(flipped)} ${flipped}.`;
}

/**
 * The movement id for a span, or null where the deck has no name for
 * it.
 *
 * NOTHING IN THE GRID REACHES ONE ANY MORE. `INTERVAL_QUALITIES` runs
 * from the minor 2nd to the major 7th, because a movement card asks
 * where a degree lands and a degree cannot move an octave and land
 * somewhere else — and the octave cards, the only spans without a
 * movement, left the deck. The null branch stays because the null is
 * still the honest answer for a span the deck has no word for; it is
 * simply unreachable from here today.
 */
function movementForSpan(semitones: number): string | null {
  const steps = LETTER_STEPS_BY_SEMITONES[semitones];
  const quality = INTERVAL_QUALITIES.find(
    q => q.letterSteps === steps && q.semitones === semitones,
  );
  return quality === undefined ? null : `up:${quality.id}`;
}

// =====================================================================
// Pentatonic scales — the notes, per key, and the lick scale
// =====================================================================

export const MINOR_PENT_CONTEXT =
  "The bluesy-soul backbone — every B.B. King line, every gospel and R&B "
  + "vocal lick, the whole rock-guitar vocabulary lives in this five-note "
  + "shape. Sit on these over any minor groove in the key and you can't "
  + "really miss. Add the ♭5 between the 4 and the 5 and you have the blues scale.";

export const MAJOR_PENT_CONTEXT =
  "The safest melodic set inside a major key — no 4, no 7, so none of the "
  + "half-step tensions that fight the major triad. It is the bedrock of "
  + "gospel licks, country bends and the Stevie Wonder vocal-line vocabulary.";

export const RELATIVE_PENT_CONTEXT =
  "Same five pitches, different home base — the relative-major / "
  + "relative-minor relationship applied to the pentatonic subset. Which one "
  + "you are playing is decided by the chord underneath, not by the notes.";

// =====================================================================

/**
 * The pentatonic roots, per shape.
 *
 * =====================================================================
 * TWO LISTS, AND THE HEADER ON `pentatonics.ts` ARGUES WHY AT LENGTH.
 *
 * Minor spells badly on the flat side and major on the sharp side, so
 * the twelve keys that spell cleanly for one are not the twelve for the
 * other. Ruling 39 asks for every actual key, and for MAJOR that is now
 * thirteen: F♯ major pentatonic is F♯ G♯ A♯ C♯ D♯, clean, and it was
 * missing only because the list stopped at twelve.
 *
 * FOR MINOR IT IS STILL TWELVE, AND THAT IS A STOP RATHER THAN A
 * CHOICE. G♭ minor pentatonic is G♭ B𝄫 C♭ D♭ F♭ — a double flat and two
 * theoretical spellings in five notes. The follow-up ruling that let
 * doubles into the deck said in terms not to widen it beyond intervals,
 * so the thirteenth minor root is reported rather than written.
 * =====================================================================
 */
const MAJOR_PENT_ROOTS: ReadonlyArray<string> = THIRTEEN_KEYS;

/** "In E♭ major pentatonic, the notes are _____" — the notes, per key
 *  (commit 8's ruling: pick the notes, per key, no formulas). */
export function generatePentatonicNotesCards(): Flashcard[] {
  const out: Flashcard[] = [];
  for (const root of MINOR_ROOTS) {
    const notes = minorPentatonic(root);
    if (notes === null) continue;
    out.push({
      ...base('pentatonic-scales', 'Pentatonic Scales'),
      id: `pent-notes-minor-${root}`,
      // THE IDENTITY ROOT FOR MINOR, THE ROOT AS WRITTEN FOR MAJOR,
      // and the asymmetry is the honest one. C♯ minor pentatonic and
      // D♭ major pentatonic are one pitch spelled to suit each shape —
      // the same root, two conventions — so they belong in one column,
      // which is what the card's own "C♯ (D♭)" name already says. F♯
      // major and G♭ major pentatonic are two different sets of notes
      // and two different cards, so they need two.
      axis: { root: identityRoot(root), shape: 'minor' },
      question: `In ${scaleName(root, 'minor')} minor pentatonic, the notes are _____`,
      correctAnswer: noteList(notes),
      decoys: pentatonicDecoys(root, 'minor'),
      explanation: `${scaleName(root, 'minor')} minor pentatonic: ${noteList(notes)} — `
        + `the intervals 1, ♭3, 4, 5, ♭7 applied to ${pentNoteLabel(root)} as root. `
        + MINOR_PENT_CONTEXT,
      skillTag: `pent-minor-${root}`,
    });
  }
  for (const root of MAJOR_PENT_ROOTS) {
    const notes = majorPentatonic(root);
    if (notes === null) continue;
    out.push({
      ...base('pentatonic-scales', 'Pentatonic Scales'),
      id: `pent-notes-major-${root}`,
      axis: { root, shape: 'major' },
      question: `In ${scaleName(root, 'major')} major pentatonic, the notes are _____`,
      correctAnswer: noteList(notes),
      decoys: pentatonicDecoys(root, 'major'),
      explanation: `${scaleName(root, 'major')} major pentatonic: ${noteList(notes)} — `
        + `the intervals 1, 2, 3, 5, 6 applied to ${pentNoteLabel(root)} as root. `
        + MAJOR_PENT_CONTEXT,
      skillTag: `pent-major-${root}`,
    });
  }
  return out;
}

/**
 * "You're in the key of A♭. Which minor pentatonic fits for riffs and
 * licks?" — one direction only, per major key (commit 8's ruling).
 *
 * =====================================================================
 * IT REPLACES A CARD THAT ASKED WHAT TWO SCALES SHARE.
 *
 * "A♭ major pentatonic and F minor pentatonic share the same _____"
 * answered "5 notes (identical pitch set)", which is a fact about a
 * definition rather than a thing a player reaches for. The question a
 * player actually asks is which minor pentatonic to play over a major
 * key, and this is that question with that answer.
 *
 * NO REVERSE CARD, and that is the ruling rather than an omission: in a
 * minor key the lick scale is that key's own minor pentatonic, so the
 * question would answer itself.
 * =====================================================================
 */
export function generatePentatonicLickCards(): Flashcard[] {
  // THE PLAIN NAME, NOT THE GLOSSED ONE, and that is the deck's rule
  // rather than a preference. `scaleName` writes "G♯ (A♭) minor
  // pentatonic" because the scale is genuinely double-named — good in
  // a question, and a tell in an option: three of the twelve would
  // carry a bracket and nine would not. The gloss never reaches an
  // answer option, and a test says so across the whole catalog.
  const answers = MAJOR_PENT_ROOTS
    .map(r => relativeMinorRoot(r))
    .filter((r): r is string => r !== null)
    .map(r => `${pentNoteLabel(r)} minor pentatonic`);
  return MAJOR_PENT_ROOTS.flatMap(root => {
    const rel = relativeMinorRoot(root);
    const majorNotes = majorPentatonic(root);
    if (rel === null || majorNotes === null) return [];
    const id = `pent-lick-${root}`;
    const answer = `${pentNoteLabel(rel)} minor pentatonic`;
    return [{
      ...base('pentatonic-scales', 'Pentatonic Scales'),
      id,
      axis: { root, shape: 'lick' },
      question: `You're in the key of ${scaleName(root, 'major')} major. `
        + 'Which minor pentatonic fits for riffs and licks?',
      correctAnswer: answer,
      decoys: chooseDecoys(answer, answers, {
        count: 3, seed: id, label: id, category: 'pentatonic-scales',
      }),
      explanation: `${scaleName(root, 'major')} major pentatonic is `
        + `${noteList(majorNotes)}. Start on the 6th and you are in `
        + `${scaleName(rel, 'minor')} minor pentatonic — the same five notes. `
        + RELATIVE_PENT_CONTEXT,
      skillTag: `pent-lick-${root}`,
    }];
  });
}

// =====================================================================
// Progression vocabulary — every named progression, in every key
// =====================================================================

/**
 * The progressions the family already names, each keeping its own
 * wording.
 *
 * =====================================================================
 * NOTHING HERE IS NEW.
 *
 * Every shape, every question sentence and every explanation is lifted
 * from the hand-written card that taught it in one key. What the
 * generator adds is the other twelve keys, not a tenth progression.
 *
 * THE WORDING IS NOT REGULARISED. One card says "in C major is", one
 * says "in C is", one says "starts with"; one explanation opens with
 * the chords and one opens with the name. Those are Silas's sentences.
 * Smoothing them would be rewriting copy nobody asked to have
 * rewritten, and the fold-in would then find nothing to pair with.
 *
 * =====================================================================
 * TWO OF THE FAMILY'S TEN ARE NOT HERE, AND BOTH ARE STOPS.
 *
 * THE PLAGAL VAMP has no in-key card to take a wording from. `pr-8`
 * asks "A plagal vamp is which two chords alternating?" and answers
 * "IV - I" — a question in no key, whose answer is degrees rather than
 * chords. Generating "The plagal vamp in E♭ is _____" would be
 * inventing a question shape the family has never asked.
 *
 * THE DESCENDING MINOR is in a MINOR key — `pr-11` is i-♭VII-♭VI-V in A
 * minor — and the thirteen keys are a MAJOR-key vocabulary. Read as
 * minor tonics they would name D♭ minor and G♭ minor, which are not
 * keys anyone writes in.
 *
 * Both are in the report rather than approximated.
 * =====================================================================
 */
interface ProgressionShape {
  /** What the card id and the skill tag are built from. */
  id: string;
  /**
   * The value the grid row and the Progression chip carry.
   *
   * 2-5-1 REUSES FUNCTIONAL HARMONY'S `ii-V-I` rather than minting a
   * second name for it. Ruling 26's whole point was that a 5 1 is a
   * little progression however it is spelled, and two chips both
   * reading "2 5 1" would be exactly the row a reader has to know is
   * the same row.
   */
  facet: string;
  /**
   * The card's own question, with the key spelled in.
   *
   * `row` is the progression written as a row of chords — "1 · 5 · 6m ·
   * 4" — built by the one formatter every surface calls. The question
   * takes it rather than spelling the numbers itself, so a card cannot
   * name a progression differently from the grid that drills it.
   */
  ask: (key: string, row: string) => string;
  /** Degree and quality, in order. */
  chords: ReadonlyArray<readonly [string, string]>;
  /** The card's own explanation, given the chords as written and the
   *  progression as a row of degrees — the same row the question uses,
   *  so a card cannot name a progression two ways in two sentences. */
  /** `chords` are the chord NAMES in the key; `row` is the degree row.
   *  `settings` reaches `joinRow` so the chord names in an explanation
   *  take the same separator as the row beside them. */
  explain: (
    key: string, chords: string[], row: string,
    settings?: ProgressionSpelling,
  ) => string;
  /** The one near-miss this progression's hand-written card made that
   *  a plain degree swap cannot produce. */
  extra?: (root: string) => string[];
  /**
   * The version of this progression a player also hears in the wild.
   *
   * =====================================================================
   * DATA ON THE PROGRESSION, NOT A CASE IN A COMPONENT.
   *
   * The 1 6 2 5 is played two ways: the 6 as the minor chord the key
   * gives, and the 6 as a dominant pulling to the 2. Both are the same
   * progression and only one of them is the card's answer, so this is
   * not a second card and not a second decoy — it is something the
   * reveal can play so a reader can hear the difference.
   *
   * Written HERE so the next one is a line of data. `1 4 5` has a
   * version with the 4 as a dominant, `1 5 6 4` one with the 5 as a
   * sus; neither is written down yet, and when either is, nothing in
   * the player has to learn about it.
   *
   * THE LABEL CARRIES NO KEY. "6 as a dominant" is true in all
   * thirteen; naming the chord ("A7") would be true in one.
   * =====================================================================
   */
  variation?: {
    /** Which chord of the progression changes, by position. */
    index: number;
    /** What it becomes. */
    quality: string;
    /** What the button says. */
    label: string;
  };
}

/**
 * =====================================================================
 * SIX, NOT TEN, AND THE FOUR THAT WENT ARE IN `catalog.ts`'s own note.
 *
 * A progression Silas has no reference for yet does not earn thirteen
 * cards. The gospel walk-up, rhythm changes and the neo-soul cycle went
 * on that rule; `6-4-1-5` went on a different one — it is the 1-5-6-4
 * loop started in a different place (1-5-6-4, 5-6-4-1, 6-4-1-5, 4-1-5-6
 * are one loop, four entry points), and `pr-9` teaches that rotation as
 * a fact. `1-6-4-5` is a DIFFERENT loop, with the 6 straight after the
 * 1, so it stays.
 * =====================================================================
 */
const PROGRESSION_SHAPES: ReadonlyArray<ProgressionShape> = [
  {
    id: '1-5-6-4',
    facet: '1-5-6-4',
    ask: (k, row) => `The ${row} progression in the key of ${k} major is _____`,
    chords: [['1', ''], ['5', ''], ['6', 'm'], ['4', '']],
    explain: (k, c, row, sp) => `${row} in the key of ${k} major is `
      + `${joinRow(c, sp)} — the `
      + "'pop progression' (or 'axis' chords). You've heard this in hundreds "
      + 'of songs across pop, gospel, R&B, and worship; it works because it '
      + 'cycles through all four tonal functions in a tight loop.',
  },
  {
    id: '2-5-1',
    facet: 'ii-V-I',
    ask: (k, row) => `The ${row} in the key of ${k} major is _____`,
    chords: [['2', 'm7'], ['5', '7'], ['1', 'maj7']],
    // THE B♭-ONLY CLAUSE IS GONE, not rewritten for twelve more keys.
    // "so many horn charts default here" is true of B♭ and of nowhere
    // else, and inventing a reason to care about each of the others is
    // exactly the copy this generator has no business writing.
    explain: (k, c, row, sp) => `The ${row} in the key of ${k} major is `
      + `${joinRow(c, sp)}. Memorize this `
      + "in every key and you've got half of jazz standard vocabulary.",
  },
  {
    id: '1-6-4-5',
    facet: '1-6-4-5',
    ask: (k, row) => `The ${row} in the key of ${k} major is _____`,
    chords: [['1', ''], ['6', 'm'], ['4', ''], ['5', '']],
    explain: (k, c, row, sp) => `${row} in the key of ${k} major is `
      + `${joinRow(c, sp)} — the 50s doo-wop `
      + 'progression that became the bedrock of countless soul, gospel, and '
      + 'pop ballads. Same chord set as 1 · 5 · 6m · 4, just rotated.',
  },
  {
    id: '1-6-2-5',
    facet: '1-6-2-5',
    ask: (k, row) => `The ${row} in the key of ${k} major is _____`,
    chords: [['1', ''], ['6', 'm'], ['2', 'm'], ['5', '']],
    /**
     * SILAS'S WORDS, 9 SEP 2026 (evening), replacing the placeholder.
     *
     * The turnaround had no hand-written card to lift an explanation
     * from, so this generator wrote one and it was flagged as new copy.
     * This is the sentence Silas wrote for it.
     *
     * THE RHYTHM-CHANGES CLAUSE IS GONE. "Rhythm changes is the same
     * four numbers played as sevenths" was true and was also a second
     * fact about a different progression, on a card about this one.
     */
    explain: (k, c, row, sp) => `${row} in the key of ${k} major is `
      + `${joinRow(c, sp)}, the turnaround. It's sometimes used to walk `
      + 'back to the 1 and go round again.',
    // The 6 played as a dominant, pulling to the 2 rather than sitting
    // as the minor chord the key gives. The reveal can play both; the
    // card still grades the one it asks for.
    variation: { index: 1, quality: '7', label: '6 as a dominant' },
  },
  {
    id: '1-4-5',
    facet: '1-4-5',
    ask: (k, row) => `The ${row} in the key of ${k} major is _____`,
    chords: [['1', ''], ['4', ''], ['5', '']],
    explain: (k, c, row, sp) => `${joinRow(c, sp)} is ${row} in the key of ${k} major `
      + '— the most '
      + 'fundamental progression in Western popular music. Every blues, '
      + 'country tune, and early rock and R&B song cycles I-IV-V; modern '
      + 'soul, gospel, and hip-hop still use it as the underlying '
      + 'scaffolding.',
  },
  /**
   * =================================================================
   * THE BACKDOOR IS 4 MINOR → ♭7(7) → 1, AND THESE ARE NEW CARDS.
   *
   * Verified with Silas on 9 Sep 2026: "4m and ♭7(7) are both part of
   * the parallel minor chords", so the progression is the two borrowed
   * chords resolving home. The 1 4 ♭7 1 these cards used to ask is a
   * different progression, which makes this a different QUESTION under
   * the same name — not a rewording.
   *
   * SO THE SHAPE ID MOVED AND THE OLD IDS ARE RETIRED. `backdoor`
   * minted `pr-prog-backdoor-<key>`; `backdoor-4m` mints
   * `pr-prog-backdoor-4m-<key>`, a prefix that has never existed. No
   * mover and no migration: history on a card that asked a different
   * question is history of a different card, and the orphan reporter
   * names the thirteen old rows on the next boot. Thirteen out,
   * thirteen in, so the deck stays at 1,611.
   *
   * THE FACET DID NOT MOVE. The stored value is still `backdoor` — it
   * is the same progression by name, and every link that named it
   * resolves.
   *
   * NUMBERS LEAD, NAMES FOLLOW, as before: the numbers first and the
   * name in brackets after the thing it names.
   * =================================================================
   */
  {
    id: 'backdoor-4m',
    facet: 'backdoor',
    ask: (k, row) => `The ${row} (backdoor) in the key of ${k} major is _____`,
    chords: [['4', 'm'], ['b7', '7'], ['1', '']],
    // SILAS'S OWN SENTENCES, from his modal-interchange notes of
    // 9 Sep 2026 and from the ruling that changed this card. Nothing
    // here is written for him.
    explain: (k, c, _row, sp) => `The backdoor in the key of ${k} major is `
      + `${joinRow(c, sp)} — 4m and ♭7(7) are both part of the parallel `
      + 'minor chords, and the ♭7(7) typically wants to resolve to the 1.',
    extra: root => [
      // THE ♭7 PLAYED AS THE NATURAL 7 — the wrong answer that tests
      // which seventh the progression means, kept from the card this
      // replaces.
      joinRow([`${degreeLabel(root, '4')}m`,
        `${degreeLabel(root, '7')}7`, degreeLabel(root, '1')],
      CANONICAL_SPELLING),
      // AND THE 4 PLAYED MAJOR, which the swap loop cannot reach: it
      // leaves the first chord and the landing alone, and on a
      // three-chord progression that is everything but the middle.
      // A borrowed 4 minor against the 4 the key gives is the whole
      // question this card now asks.
      joinRow([degreeLabel(root, '4'),
        `${degreeLabel(root, 'b7')}7`, degreeLabel(root, '1')],
      CANONICAL_SPELLING),
    ],
  },
];

/**
 * The chords one named progression is made of, or null.
 *
 * EXPORTED SO `cardAudio` PLAYS WHAT THE CARD SAYS. The degrees and
 * qualities are written once, here, and both the text and the sound
 * read them — a second copy in the audio file is a second copy that
 * would one day disagree with the card it is playing.
 */
export function progressionVoicing(
  facet: string | undefined,
): ReadonlyArray<readonly [string, string]> | null {
  return PROGRESSION_SHAPES.find(s => s.facet === facet)?.chords ?? null;
}

/**
 * The other version of one named progression, or null.
 *
 * READ FROM THE SAME LIST THE CHORDS COME FROM, for the reason
 * `progressionVoicing` gives: a second copy of "the 6 of a 1 6 2 5 is
 * sometimes a dominant" is a second copy that would one day disagree
 * with the progression it is a version of.
 */
export function progressionVariation(
  facet: string | undefined,
): ProgressionShape['variation'] | null {
  return PROGRESSION_SHAPES.find(s => s.facet === facet)?.variation ?? null;
}

/**
 * The quality the major scale puts on each degree.
 *
 * SIX DEGREES, NOT SEVEN. The 7 is diminished, and no card in this
 * family has ever put a dim or a m7♭5 chord on screen — offering one as
 * a wrong answer would mark it out by sight rather than by knowledge,
 * which is the leak `decoyGuard` exists to refuse. The 7 still appears
 * where a progression's own near-miss needs it, as a plain triad.
 */
const DIATONIC_TRIAD: Readonly<Record<string, string>> = {
  '1': '', '2': 'm', '3': 'm', '4': '', '5': '', '6': 'm',
};
const DIATONIC_SEVENTH: Readonly<Record<string, string>> = {
  '1': 'maj7', '2': 'm7', '3': 'm7', '4': 'maj7', '5': '7', '6': 'm7',
};

/**
 * Wrong answers that differ by ONE chord.
 *
 * =====================================================================
 * REAL CHORDS, CORRECTLY WRITTEN, WRONG FOR THIS QUESTION — the repair
 * the enharmonic groups needed, applied here.
 *
 * Every candidate is the progression with a single chord swapped for
 * another chord the key actually contains, AT THE SAME WEIGHT: a triad
 * for a triad, a seventh for a seventh. So the four options are the
 * same length, in the same key, spelled the same way, and a reader
 * cannot pick by shape — only by knowing the progression. That is what
 * the hand-written decoys did card by card; this does it by rule.
 *
 * A SWAP THAT REPEATS A CHORD IS REJECTED. "E♭ - B♭ - E♭ - A♭" is a
 * progression with a chord in it twice while the answer has four
 * different ones, and a reader who noticed would never need to know
 * anything else. The exception is a progression that already repeats —
 * the backdoor returns to its I — where the count has to match rather
 * than be zero.
 * =====================================================================
 */
function progressionDecoyPool(
  root: string, shape: ProgressionShape, answer: string,
): string[] {
  const degrees = shape.chords.map(([d]) => d);
  const repeatsAllowed = degrees.length - new Set(degrees).size;
  const out: string[] = [...(shape.extra?.(root) ?? [])];
  const write = (i: number, chord: string) => {
    const text = shape.chords
      .map(([d, q], j) => (j === i ? chord : `${degreeLabel(root, d)}${q}`))
      .join(CHORD_SEPARATOR);
    if (text !== answer) out.push(text);
  };

  // =====================================================================
  // THE FIRST CHORD AND THE LANDING ARE GIVEN; WHAT IS WRONG IS ON THE
  // WAY. Both ends are fixed, and `findTells` is what fixed them.
  //
  // THE LANDING, because a wrong one is the weakest decoy on the card —
  // the question names the key, so the 1 of a 2-5-1 is already on
  // screen — and because swapping it produced five cross-card tells
  // ("an option ending C♯m means the answer ends E").
  //
  // THE FIRST CHORD, because five of the six generated progressions
  // start on the 1. Any swap there makes a decoy that starts somewhere
  // else, on every card of every one of those five, so "an option
  // starting A♭m means the answer starts G♭" holds across the key. Six
  // cards were given away that way the moment the list shrank from ten
  // shapes to six.
  //
  // A rule-written decoy set repeats itself in a way a hand-written one
  // does not, which is what makes both of these visible at all.
  // =====================================================================
  for (let i = 1; i < shape.chords.length - 1; i += 1) {
    const [own, quality] = shape.chords[i];
    const seventh = quality.includes('7');

    // A DIFFERENT CHORD OF THE KEY, at the same weight — a triad for a
    // triad, a seventh for a seventh — so the options are the same
    // length and spelled the same way and only knowing the progression
    // separates them.
    for (const degree of ['2', '3', '6', '4', '5', '1']) {
      if (degree === own) continue;
      const swapped = degrees.map((d, j) => (j === i ? degree : d));
      if (swapped.length - new Set(swapped).size !== repeatsAllowed) continue;
      write(i, `${degreeLabel(root, degree)}${
        seventh ? DIATONIC_SEVENTH[degree] : DIATONIC_TRIAD[degree]}`);
    }

    // THE RIGHT CHORD WITH THE WRONG QUALITY — a major played minor, a
    // dominant played minor. The sharpest near-miss the family's own
    // hand-written decoys made: "A - Dm - E" on `pr-18`, "F - Bbm - Eb
    // - F" on `pr-7`, and the whole question of whether the 5 of a
    // 2-5-1 is a dominant or not.
    //
    // IT IS ALSO WHAT MAKES A 1-4-5 CARD POSSIBLE AT ALL. Every chord
    // in a 1-4-5 is major, so every DEGREE swap has to reach outside
    // the 1, the 4 and the 5 — and in the key of E those are the only
    // three chords with no sharp in them, which left the answer as the
    // only plain name on screen and `chooseDecoys` refusing the card.
    // Changing a quality keeps the letter, so it keeps the accidental.
    for (const other of seventh ? ['maj7', 'm7', '7'] : ['', 'm']) {
      if (other === quality) continue;
      write(i, `${degreeLabel(root, own)}${other}`);
    }

    // AND A TRIAD WITH A SEVENTH ON IT — `pr-3` offered
    // "G - Em - C - D7sus4" and `pr-18` "A - D - E7 only", so a
    // wrong-flavour chord is a miss this family already made.
    if (!seventh) write(i, `${degreeLabel(root, own)}${quality}7`);
  }
  return [...new Set(out)];
}

/**
 * A progression card's question and explanation, re-spelled.
 *
 * =====================================================================
 * THE DECK IS BAKED AND STAYS BAKED; THIS IS HOW IT REACHES THE EYE.
 *
 * A card's `question`, `correctAnswer`, `decoys` and `explanation` are
 * built once at module load, and the answer strings are the card's
 * ANSWER KEY: the session grades by comparing the tapped option to
 * `correctAnswer` and writes the tapped string to the attempt row.
 * Rebuilding the deck per reader would make a display setting decide
 * what is stored and what counts as right, which is the one thing
 * "display only" has to rule out.
 *
 * So the deck holds the canonical spelling and this re-spells on the
 * way to the screen — the question and the explanation from the
 * shape's own chords, the options by re-joining (see `respellRow`).
 *
 * Returns null for any card that is not a generated progression, which
 * is every card in the deck but seventy-eight.
 * =====================================================================
 */
export function respellProgressionCard(
  card: Pick<Flashcard, 'id' | 'axis' | 'question' | 'explanation'>,
  settings?: ProgressionSpelling,
): { question: string; explanation: string } | null {
  const facet = card.axis?.shape;
  const key = card.axis?.key;
  if (typeof facet !== 'string' || typeof key !== 'string') return null;
  if (!card.id.startsWith('pr-prog-')) return null;
  const shape = PROGRESSION_SHAPES.find(sh => sh.facet === facet);
  if (shape === undefined) return null;

  const opts = {
    ...(settings ? { settings } : {}),
    // NO RUNG. A card's built answer is triads — see the shell's own
    // ladder — so a half-diminished takes its triad name here.
    named: false,
  };
  const row = progressionRow(
    shape.chords.map(([degree, quality]) => ({ degree, quality })), opts,
  );
  const written = shape.chords.map(([d, q]) => `${degreeLabel(key, d)}${q}`);
  return {
    question: shape.ask(noteLabel(key), row),
    explanation: shape.explain(noteLabel(key), written, row, settings)
      + keyboardNote(...shape.chords.map(([d]) => degreeAscii(key, d))),
  };
}

/** Every named progression, in every key (rulings 39 and 40). */
export function generateProgressionCards(): Flashcard[] {
  const out: Flashcard[] = [];
  for (const root of THIRTEEN_KEYS) {
    for (const shape of PROGRESSION_SHAPES) {
      // A PREFIX THAT HAS NEVER EXISTED. `pr-1564-Db` is a live id
      // today and will be a retired one tomorrow; minting it again
      // would break a fold-in that is allowed to run twice.
      const id = `pr-prog-${shape.id}-${root}`;
      const written = shape.chords
        .map(([d, q]) => `${degreeLabel(root, d)}${q}`);
      // CANONICAL, NOT THE READER'S. This string is the answer key —
      // graded by equality and written to the attempt row — and is
      // re-joined for the eye by `respellRow`. See CANONICAL_SPELLING.
      const answer = joinRow(written, CANONICAL_SPELLING);
      // THE PROGRESSION, IN DEGREES, AS THE APP WRITES A ROW. One
      // formatter — see `lib/progressionRow` — so the question, the
      // grid's row, the card's chip and the rotate button cannot come
      // to spell the same progression four ways.
      const row = progressionRow(
        shape.chords.map(([degree, quality]) => ({ degree, quality })),
      );
      out.push({
        ...base('progressions', 'Progressions'),
        id,
        // THE KEY AS WRITTEN (ruling 40). The 1-5-6-4 of G♭ ends on C♭
        // and the 1-5-6-4 of F♯ ends on B: two keys, two cards.
        axis: { key: root, shape: shape.facet },
        question: shape.ask(noteLabel(root), row),
        correctAnswer: answer,
        decoys: chooseDecoys(answer, progressionDecoyPool(root, shape, answer), {
          count: 3, seed: id, label: id, category: 'progressions',
        }),
        explanation: shape.explain(noteLabel(root), written, row)
          + keyboardNote(...shape.chords.map(([d]) => degreeAscii(root, d))),
        skillTag: `progression-${shape.id}-in-${root}`,
      });
    }
  }
  return out;
}

/** Everything this module adds, in one list. */
export function expansionCards(): Flashcard[] {
  return [
    // `generateIiViCards()` WAS HERE. The 2-5-1 lives once, in
    // Progression Vocabulary, where it is asked in thirteen keys rather
    // than eleven; the generator stays exported so `progressionFoldIn`
    // can prove what each of the eleven became.
    ...generateVofVCards(),
    ...generateVofViCards(),
    ...generateModeOfCards(),
    ...generateSlashCards(),
    // `generatePivotTopUps()` WAS HERE. Reverse Key Pivots retired into
    // `degree-notes` on 3 Sep 2026 and its three top-ups went with the
    // twenty-four. The generator stays exported because
    // `retiredCategoryMigration` reads it to prove which new card each
    // one became; it goes in commit 9 with the migration.
    ...generateKeyCountCards(),
    ...generateRelativeCards(),
    ...generateKeyFromCountCards(),
    ...generateParallelMinorTopUps(),
    ...generateIntervalGrid(),
    ...generatePentatonicNotesCards(),
    ...generatePentatonicLickCards(),
    // `generateProgressionTopUps()` WAS HERE. Its six 1-5-6-4 cards are
    // eight progressions across thirteen keys now, under a prefix that
    // has never existed; the generator stays exported so
    // `progressionFoldIn` can prove what each of the six became.
    ...generateProgressionCards(),
  ];
}
