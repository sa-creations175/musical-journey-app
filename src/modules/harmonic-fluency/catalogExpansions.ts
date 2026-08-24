import {
  spellInterval, type Accidental, type Letter, type Pitch,
} from '../reading/pitch';
import type { Flashcard } from './catalog';
import { chooseDecoys } from './decoyGuard';

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

/** (diatonic steps, semitones) from the tonic, per scale degree. */
const DEGREE: Readonly<Record<string, readonly [number, number]>> = {
  '1': [0, 0], '2': [1, 2], '3': [2, 4], '4': [3, 5],
  '5': [4, 7], '6': [5, 9], '7': [6, 11], 'b7': [6, 10],
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
 */
const PRACTICAL_NAME: Readonly<Record<string, string>> = {
  'Cb': 'B', 'Fb': 'E', 'B#': 'C', 'E#': 'F',
};

function parse(name: string): Pitch {
  return {
    letter: name[0] as Letter,
    accidental: (name.slice(1) === '' ? null : name.slice(1)) as Accidental,
    octave: 4,
  };
}

/** ASCII form — "Eb", "F#", "Cb". Storage and comparison. */
export function degreeAscii(root: string, degree: string): string {
  const spec = DEGREE[degree];
  const p = spellInterval(parse(root), spec[0], spec[1]);
  if (p === null) throw new Error(`unspellable: ${degree} of ${root}`);
  return `${p.letter}${p.accidental ?? ''}`;
}

/**
 * Display form with real glyphs and NO gloss. What an answer option
 * and a decoy always use.
 *
 * ---------------------------------------------------------------
 * THE GLOSS NEVER TOUCHES AN ANSWER OPTION. THIS IS A LEAK GUARD.
 *
 * The first build of these cards put it everywhere, and produced:
 *
 *     A: B♭m/C♭ (B)
 *     D: B♭m/A♭   B♭m/F   B♭m/C
 *
 * The correct answer was the only option with brackets in it. You stop
 * reading the music and start picking the bracketed one — scoring well
 * while learning nothing, which is the same defect as a decoy that is
 * the only flat on screen.
 *
 * GLOSSING THE DECOYS DOES NOT FIX IT. A decoy earns a gloss only if
 * its own notes need one, and mostly they do not; forcing it yields
 * "A♭ (G♯)", which teaches something false. G♯ is a legitimate,
 * commonly-written spelling of that pitch. C♭ is not. The gloss means
 * "correct but never spoken", and it cannot be applied to notes where
 * that is untrue.
 *
 * So the gloss lives in QUESTION TEXT and EXPLANATIONS, where it can
 * teach without being a tell.
 * ---------------------------------------------------------------
 */
export function noteLabel(ascii: string): string {
  const letter = ascii[0];
  const acc = ascii.slice(1);
  return acc === '' ? letter : `${letter}${GLYPH[acc] ?? acc}`;
}

/** Display form WITH the practical name. Question text and
 *  explanations only — never an answer or a decoy. */
export function noteLabelGlossed(ascii: string): string {
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
    .filter(n => n in PRACTICAL_NAME)
    .map(n => `${noteLabel(n)} is ${PRACTICAL_NAME[n]} on the keyboard`);
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

const II_V_I_CONTEXT =
  'The ii-V-I is the backbone of jazz and neo-soul harmony. Know it in every '
  + 'key and you have half of standard vocabulary — Robert Glasper, D’Angelo '
  + 'and every gospel turnaround run through it.';

const SECONDARY_DOMINANT_CONTEXT =
  'A secondary dominant is the V-of-a-chord-that-is-not-the-tonic. Gospel '
  + 'bridges, Stevie Wonder verses and jazz tunes use them to tour through '
  + 'keys without ever leaving home.';

/**
 * ii-V-I in every key but C, which keeps its hand-written card.
 *
 * DECOYS ARE THE ORIGINAL CARD'S THREE FAMILIES, applied per key: the
 * V made a IV7, the ii made a dominant, and the ii replaced by iii7.
 * Each is a different plausible way to be wrong — a wrong dominant, a
 * wrong quality, a wrong degree — rather than three variations on one.
 */
export function generateIiViCards(): Flashcard[] {
  const out: Flashcard[] = [];
  for (const root of FLAT_TWELVE) {
    if (root === 'C') continue;
    const one = degreeLabel(root, '1');
    const two = degreeLabel(root, '2');
    const four = degreeLabel(root, '4');
    const five = degreeLabel(root, '5');
    const three = degreeLabel(root, '3');
    out.push({
      ...base('functional-harmony', 'Functional Harmony'),
      id: `fh-ii-v-i-${root}`,
      question: `The ii-V-I cadence in ${noteLabel(root)} major is _____`,
      correctAnswer: `${two}m7 - ${five}7 - ${one}maj7`,
      decoys: [
        `${two}m7 - ${four}7 - ${one}maj7`,
        `${two}7 - ${five}7 - ${one}maj7`,
        `${three}m7 - ${five}7 - ${one}maj7`,
      ],
      explanation: `In ${noteLabel(root)}: ${two}m7 → ${five}7 → `
        + `${one}maj7 — the 2, the 5 and the 1, each with the quality the `
        + `major scale gives it.`
        + keyboardNote(degreeAscii(root, '2'), degreeAscii(root, '5'), degreeAscii(root, '1'))
        + ` ${II_V_I_CONTEXT}`,
      skillTag: `ii-v-i-${root}`,
    });
  }
  return out;
}

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
      id: `fh-v-of-v-${root}`,
      question: `A secondary dominant V/V in ${noteLabel(root)} major is which chord?`,
      correctAnswer: `${two}7`,
      // The other three dominants a player might reach for: the real V,
      // the VI7 and the III7.
      decoys: [`${five}7`, `${six}7`, `${three}7`],
      explanation: `V/V points at the V. In ${noteLabel(root)} the V is `
        + `${five}, so its own dominant is ${two}7 — the 2 chord made major `
        + `and sevenths, resolving to ${five}7.`
        + keyboardNote(degreeAscii(root, '2'), degreeAscii(root, '5'))
        + ` ${SECONDARY_DOMINANT_CONTEXT}`,
      skillTag: `v-of-v-${root}`,
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
      id: `fh-v-of-vi-${root}`,
      question: `V/vi in ${noteLabel(root)} major resolves to _____`,
      correctAnswer: `${six}m`,
      decoys: [`${three}m`, `${two}m`, `${four}maj7`],
      explanation: `V/vi is the V chord pointing at the vi. In `
        + `${noteLabel(root)} the vi is ${six}m, so the move is `
        + `${degreeLabel(root, '3')}7 → ${six}m. You hear it whenever a song `
        + `pivots into its relative minor for a bridge before drifting home.`
        + keyboardNote(degreeAscii(root, '6'), degreeAscii(root, '3')),
      skillTag: `v-of-vi-${root}`,
    });
  }
  return out;
}

// =====================================================================
// Modes — the mode of {key} major starting on {degree}
// =====================================================================

/** The three the hand-written C cards drilled, by degree. */
const MODE_BY_DEGREE: ReadonlyArray<{ degree: string; mode: string }> = [
  { degree: '2', mode: 'Dorian' },
  { degree: '5', mode: 'Mixolydian' },
  { degree: '6', mode: 'Aeolian' },
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

export function generateModeOfCards(): Flashcard[] {
  const out: Flashcard[] = [];
  for (const root of FLAT_TWELVE) {
    if (root === 'C') continue;
    for (const { degree, mode } of MODE_BY_DEGREE) {
      const start = degreeLabel(root, degree);
      const startGlossed = degreeLabelGlossed(root, degree);
      out.push({
        ...base('modes', 'Modes'),
        id: `mo-mode-of-${root}-${degree}`,
        question: `The mode of ${noteLabel(root)} major starting on ${startGlossed} is _____`,
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
        explanation: `Starting ${noteLabel(root)} major on its ${degree} gives `
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

/** The four shapes the hand-written C cards drilled. */
const SLASH_SHAPES: ReadonlyArray<{
  id: string; label: string; chord: string; bass: string; quality: string;
}> = [
  { id: '1-3', label: '1/3', chord: '1', bass: '3', quality: '' },
  { id: '5-7', label: '5/7', chord: '5', bass: '7', quality: '' },
  { id: '4-5', label: '4/5', chord: '4', bass: '5', quality: '' },
  { id: '6-b7', label: '6/b7', chord: '6', bass: 'b7', quality: 'm' },
];

/**
 * Bass degrees a decoy may use, in order of how plausible a misread is.
 *
 * The question is always which BASS, never which chord, so every decoy
 * keeps the chord and moves the bass. A decoy that changed the chord
 * would be answerable without reading the notation at all.
 */
const SLASH_BASS_CANDIDATES: ReadonlyArray<string> = ['5', '3', '7', 'b7', '1'];

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
export function generateSlashCards(): Flashcard[] {
  const out: Flashcard[] = [];
  for (const root of FLAT_TWELVE) {
    if (root === 'C') continue;
    for (const shape of SLASH_SHAPES) {
      const chord = `${degreeLabel(root, shape.chord)}${shape.quality}`;
      const bass = degreeLabel(root, shape.bass);
      // Three OTHER bass degrees, taken in a fixed order of
      // plausibility and skipping the right answer. A fixed candidate
      // list rather than arithmetic on the correct degree: the latter
      // collided with itself on 1/3, where two families both resolved
      // to the 5 and the card shipped with two decoys instead of three.
      const decoys = SLASH_BASS_CANDIDATES
        .filter(d => d !== shape.bass)
        .slice(0, 3)
        .map(d => `${chord}/${degreeLabel(root, d)}`);
      out.push({
        ...base('slash-chords', 'Slash Chords'),
        id: `sc-${shape.id}-${root}`,
        question: `What is ${shape.label} in ${noteLabel(root)} major?`,
        correctAnswer: `${chord}/${bass}`,
        decoys,
        explanation: `${shape.label} means the ${shape.chord} chord with the `
          + `${shape.bass} scale degree in the bass — in ${noteLabel(root)} `
          + `that is ${chord}/${bass}.`
          + keyboardNote(degreeAscii(root, shape.bass), degreeAscii(root, shape.chord))
          + ` ${SLASH_CONTEXT}`,
        skillTag: `slash-${shape.id}-${root}`,
      });
    }
  }
  return out;
}

// =====================================================================
// Coverage top-ups — the categories that were partial
// =====================================================================

const PIVOT_CONTEXT =
  'Reverse-pivoting is what an ear-trained player does when the melody arrives '
  + 'before the key does: hear a note, decide what degree it is, and the key '
  + 'falls out.';

/**
 * Reverse key pivots for the three answer keys that had none.
 *
 * The degree is chosen per key so the SUBJECT note is one worth
 * meeting: G♭'s 4 is C♭, which is the whole reason the parenthetical
 * rule exists.
 */
export function generatePivotTopUps(): Flashcard[] {
  const missing: ReadonlyArray<{ root: string; degree: string }> = [
    { root: 'Db', degree: '3' },
    { root: 'Gb', degree: '4' },
    { root: 'B', degree: '6' },
  ];
  return missing.map(({ root, degree }) => {
    // QUESTION-SIDE gloss, which cannot give anything away: the answer
    // is a key name, not a note.
    const note = degreeLabelGlossed(root, degree);
    const wrong = FLAT_TWELVE.filter(k => k !== root).slice(0, 3);
    return {
      ...base('reverse-key-pivots', 'Reverse Key Pivots'),
      id: `rkp-${root}-${degree}`,
      question: `${note} is the ${degree} of which major key?`,
      correctAnswer: `${noteLabel(root)} major`,
      decoys: wrong.map(k => `${noteLabel(k)} major`),
      explanation: `${note} sits on the ${degree} of ${noteLabel(root)} major. `
        + PIVOT_CONTEXT,
      skillTag: `pivot-${root}-${degree}`,
    };
  });
}

const PROGRESSION_CONTEXT =
  'The pop or axis progression — hundreds of songs across pop, gospel, R&B '
  + 'and worship, because it cycles through all four tonal functions and lands '
  + 'home.';

/** 1-5-6-4 in the six keys the category never reached. */
export function generateProgressionTopUps(): Flashcard[] {
  const missing = ['Db', 'Eb', 'E', 'Gb', 'Ab', 'B'];
  return missing.map(root => {
    const [one, five, six, four] = ['1', '5', '6', '4'].map(d => degreeLabel(root, d));
    return {
      ...base('progressions', 'Progressions'),
      id: `pr-1564-${root}`,
      question: `The 1-5-6-4 progression in ${noteLabel(root)} major is _____`,
      correctAnswer: `${one} - ${five} - ${six}m - ${four}`,
      decoys: [
        `${one} - ${degreeLabel(root, '3')}m - ${six}m - ${four}`,
        `${one} - ${five} - ${degreeLabel(root, '2')}m - ${four}`,
        `${one} - ${five} - ${six}m - ${degreeLabel(root, '2')}m`,
      ],
      explanation: `1-5-6-4 in ${noteLabel(root)} is ${one} → ${five} → `
        + `${six}m → ${four}.`
        + keyboardNote(...['1', '5', '6', '4'].map(d => degreeAscii(root, d)))
        + ` ${PROGRESSION_CONTEXT}`,
      skillTag: `prog-1564-${root}`,
    };
  });
}

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

export function generateRelativeMinorTopUps(): Flashcard[] {
  const have = new Set(['C', 'G', 'Ab']);
  return FLAT_TWELVE.filter(r => !have.has(r)).map(root => {
    const six = degreeLabel(root, '6');
    return {
      ...base('key-signatures', 'Key Signatures'),
      id: `ks-relative-${root}`,
      question: `The relative minor of ${noteLabel(root)} major is _____`,
      correctAnswer: `${six} minor`,
      decoys: chooseDecoys(
        `${six} minor`,
        MINOR_DECOY_DEGREES.map(d => `${degreeLabel(root, d)} minor`),
        {
          count: 3,
          seed: `ks-relative-${root}`,
          label: `ks-relative-${root}`,
          category: 'key-signatures',
        },
      ),
      explanation: `${six} minor is the relative minor of ${noteLabel(root)} `
        + `major.`
        + keyboardNote(degreeAscii(root, '6'))
        + ` ${RELATIVE_CONTEXT}`,
      skillTag: `relative-minor-${root}`,
    };
  });
}

export function generateParallelMinorTopUps(): Flashcard[] {
  const have = new Set(['Bb', 'D', 'F', 'G']);
  return FLAT_TWELVE.filter(r => !have.has(r)).map(root => ({
    ...base('key-signatures', 'Key Signatures'),
    id: `ks-parallel-${root}`,
    question: `The parallel minor of ${noteLabel(root)} major is _____`,
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
    explanation: `${noteLabel(root)} minor — same root, opposite quality. `
      + PARALLEL_CONTEXT,
    skillTag: `parallel-minor-${root}`,
  }));
}

// =====================================================================
// Intervals — the five start notes the category never used
// =====================================================================

const INTERVAL_CONTEXT =
  'Intervals are the raw material of melody and voicing: every lick and every '
  + 'chord shape is a specific sequence of these distances.';

const INTERVAL_NAME_BY_SEMITONES: Readonly<Record<number, string>> = {
  0: 'Unison', 1: 'Minor 2nd', 2: 'Major 2nd', 3: 'Minor 3rd',
  4: 'Major 3rd', 5: 'Perfect 4th', 6: 'Tritone', 7: 'Perfect 5th',
  8: 'Minor 6th', 9: 'Major 6th', 10: 'Minor 7th', 11: 'Major 7th',
  12: 'Octave',
};

/**
 * One card per previously-unused start note, each a different interval
 * so the five do not drill one distance five times.
 */
export function generateIntervalTopUps(): Flashcard[] {
  const missing: ReadonlyArray<{ from: string; degree: string }> = [
    { from: 'Db', degree: '5' },
    { from: 'Eb', degree: '3' },
    { from: 'Gb', degree: '4' },
    { from: 'Ab', degree: '6' },
    { from: 'B', degree: '7' },
  ];
  return missing.map(({ from, degree }) => {
    const to = degreeLabel(from, degree);
    const toGlossed = degreeLabelGlossed(from, degree);
    const semitones = DEGREE[degree][1];
    const correct = INTERVAL_NAME_BY_SEMITONES[semitones];
    // Nearest distances first — a semitone out is the mistake worth
    // making — then the rest of the table, so the chooser has room to
    // find company for a long answer name. `longest` is asserted in
    // this category: "Perfect 4th" beside three shorter names was the
    // answer without the question being read.
    const decoys = chooseDecoys(
      correct,
      Object.keys(INTERVAL_NAME_BY_SEMITONES)
        .map(Number)
        .sort((a, b) => Math.abs(a - semitones) - Math.abs(b - semitones) || a - b)
        .map(sem => INTERVAL_NAME_BY_SEMITONES[sem]),
      {
        count: 3,
        seed: `iv-${from}-${degree}`,
        label: `iv-${from}-${degree}`,
        category: 'intervals',
      },
    );
    return {
      ...base('intervals', 'Intervals'),
      id: `iv-${from}-${degree}`,
      question: `The interval from ${noteLabel(from)} to ${toGlossed} ascending = ?`,
      correctAnswer: correct,
      decoys,
      explanation: `${noteLabel(from)} up to ${to} spans ${semitones} `
        + `semitones — a ${correct}.`
        + keyboardNote(degreeAscii(from, degree))
        + ` ${INTERVAL_CONTEXT}`,
      skillTag: `interval-${from}-${degree}`,
    };
  });
}

/** Everything this module adds, in one list. */
export function expansionCards(): Flashcard[] {
  return [
    ...generateIiViCards(),
    ...generateVofVCards(),
    ...generateVofViCards(),
    ...generateModeOfCards(),
    ...generateSlashCards(),
    ...generatePivotTopUps(),
    ...generateProgressionTopUps(),
    ...generateRelativeMinorTopUps(),
    ...generateParallelMinorTopUps(),
    ...generateIntervalTopUps(),
  ];
}
