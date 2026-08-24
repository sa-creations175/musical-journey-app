import { LETTERS, spellInterval, type Accidental, type Letter, type Pitch } from '../reading/pitch';

/**
 * Scale-degree arithmetic that carries the interval's QUALITY.
 *
 * =====================================================================
 * WHY THE OLD 84 CARDS COULD NOT TEACH TRANSCRIPTION.
 *
 * "In any major key, 2 up a 5th = ?" has answer 6, and every one of
 * the 84 answers a plain degree number. That set cannot produce a
 * chromatic answer at all, because it only ever asks about the
 * intervals the major scale already contains — so a reader who ignores
 * quality entirely and counts letters gets full marks.
 *
 * Transcription does not work like that. What you hear is "the 2, then
 * something a minor sixth below", and the answer is ♯4 — a note that
 * is not in the key. The old cards trained the exact habit that gets
 * that wrong.
 *
 * So the question carries the quality and the answer carries an
 * alteration. The 84 survive inside this set as the alteration-zero
 * subset, one for one, which is what makes replacing them a
 * replacement rather than a swap.
 * =====================================================================
 */

/** Semitones above the tonic, per scale degree. */
const MAJOR_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

export const DEGREE_COUNT = 7;

export type QualityId = 'perfect' | 'major' | 'minor' | 'augmented' | 'diminished';
export type Direction = 'up' | 'down';

export interface IntervalQuality {
  /** "m6" — the id a card is named by. */
  id: string;
  /** "minor 6th" — what the question says. */
  label: string;
  /** The ordinal the name carries: a 6th is 6. */
  intervalId: number;
  qualityId: QualityId;
  /** LETTER steps. A 6th moves five letters, whatever its quality. */
  letterSteps: number;
  semitones: number;
}

/**
 * The twelve qualities, ordered by size.
 *
 * =====================================================================
 * TWELVE, AND THE TWELFTH IS WHY "TT" IS NOT A NAME.
 *
 * The augmented 4th and the diminished 5th are one key on the piano
 * and two different questions. An A4 moves THREE letter-steps and
 * lands on a raised 4; a d5 moves FOUR and lands on a lowered 5. From
 * the 2 of a major key those are ♯5 and ♭6 — same sound, different
 * degree, different answer. Collapsing them into "TT" would make one
 * of the two answers unreachable.
 *
 * The enharmonic-equivalents category already teaches that they are
 * one key. This category teaches that they are not one degree, and the
 * two facts need each other.
 * =====================================================================
 */
export const INTERVAL_QUALITIES: ReadonlyArray<IntervalQuality> = [
  { id: 'm2', label: 'minor 2nd',      intervalId: 2, qualityId: 'minor',      letterSteps: 1, semitones: 1 },
  { id: 'M2', label: 'major 2nd',      intervalId: 2, qualityId: 'major',      letterSteps: 1, semitones: 2 },
  { id: 'm3', label: 'minor 3rd',      intervalId: 3, qualityId: 'minor',      letterSteps: 2, semitones: 3 },
  { id: 'M3', label: 'major 3rd',      intervalId: 3, qualityId: 'major',      letterSteps: 2, semitones: 4 },
  { id: 'P4', label: 'perfect 4th',    intervalId: 4, qualityId: 'perfect',    letterSteps: 3, semitones: 5 },
  { id: 'A4', label: 'augmented 4th',  intervalId: 4, qualityId: 'augmented',  letterSteps: 3, semitones: 6 },
  { id: 'd5', label: 'diminished 5th', intervalId: 5, qualityId: 'diminished', letterSteps: 4, semitones: 6 },
  { id: 'P5', label: 'perfect 5th',    intervalId: 5, qualityId: 'perfect',    letterSteps: 4, semitones: 7 },
  { id: 'm6', label: 'minor 6th',      intervalId: 6, qualityId: 'minor',      letterSteps: 5, semitones: 8 },
  { id: 'M6', label: 'major 6th',      intervalId: 6, qualityId: 'major',      letterSteps: 5, semitones: 9 },
  { id: 'm7', label: 'minor 7th',      intervalId: 7, qualityId: 'minor',      letterSteps: 6, semitones: 10 },
  { id: 'M7', label: 'major 7th',      intervalId: 7, qualityId: 'major',      letterSteps: 6, semitones: 11 },
];

export const DIRECTIONS: ReadonlyArray<Direction> = ['up', 'down'];

/** Wrap a degree into 1..7. */
export function wrapDegree(n: number): number {
  return ((n - 1) % DEGREE_COUNT + DEGREE_COUNT) % DEGREE_COUNT + 1;
}

/**
 * Fold a semitone difference into the smallest signed alteration.
 *
 * −11 and +1 are the same accidental one octave apart; the answer is a
 * degree, which has no octave, so both mean "raised by one".
 */
function foldAlteration(raw: number): number {
  const wrapped = ((raw % 12) + 12) % 12;
  return wrapped > 6 ? wrapped - 12 : wrapped;
}

export interface DegreeResult {
  resultDegree: number;
  /** 0 diatonic, +1 raised, −1 lowered, ±2 doubled. */
  alteration: number;
}

/**
 * Where a start degree lands, and by how much the landing degree is
 * altered.
 *
 * THE LETTER COUNT AND THE SEMITONE COUNT DO DIFFERENT JOBS, which is
 * the whole lesson of the card. `letterSteps` decides WHICH degree —
 * a 6th is five letters whatever its quality. `semitones` decides
 * whether that degree is the one the key contains. Derive the degree
 * from the semitones and an augmented 4th becomes a diminished 5th.
 */
export function degreeResult(
  startDegree: number,
  quality: IntervalQuality,
  direction: Direction,
): DegreeResult {
  const sign = direction === 'up' ? 1 : -1;
  const resultDegree = wrapDegree(startDegree + sign * quality.letterSteps);
  const landed = MAJOR_SEMITONES[startDegree - 1] + sign * quality.semitones;
  return {
    resultDegree,
    alteration: foldAlteration(landed - MAJOR_SEMITONES[resultDegree - 1]),
  };
}

/** The accidental glyphs a degree label can carry. */
const ALTERATION_GLYPH: Readonly<Record<number, string>> = {
  '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪',
};

/** "♯4", "♭3", "4". Derived from the alteration, never typed. */
export function degreeAnswer(result: DegreeResult): string {
  const glyph = ALTERATION_GLYPH[result.alteration];
  if (glyph === undefined) {
    throw new Error(`[scaleDegreeQuality] alteration ${result.alteration} has no glyph`);
  }
  return `${glyph}${result.resultDegree}`;
}

// --- The grounded line: real notes, in a real key ---------------------

const GLYPH: Readonly<Record<string, string>> = {
  '#': '♯', b: '♭', '##': '𝄪', bb: '𝄫',
};

/** The four theoretical spellings, and the key a player presses. */
const PRACTICAL_NAME: Readonly<Record<string, string>> = {
  'E#': 'F', 'B#': 'C', 'Cb': 'B', 'Fb': 'E',
};

export function parseNote(name: string): Pitch {
  const letter = name[0]?.toUpperCase() as Letter;
  if (!LETTERS.includes(letter)) throw new Error(`[scaleDegreeQuality] bad note ${name}`);
  const rest = name.slice(1);
  return {
    letter,
    accidental: (rest === '' ? null : rest) as Accidental,
    octave: 4,
  };
}

function ascii(p: Pitch): string {
  return `${p.letter}${p.accidental ?? ''}`;
}

/**
 * A note as it is written, with a parenthetical where one is due.
 *
 * =====================================================================
 * THE FOURTH PARENTHETICAL RULE. FOUR NOW, AND THEY DO NOT MERGE.
 *
 *   `lydianChords.ts`      E♯ (F)
 *       A NOTE THAT IS CORRECT BUT NEVER SPOKEN. B maj7♯11 genuinely
 *       contains E♯; F is where the hand goes. Plain parentheses,
 *       because the parenthesis is a footnote to a name you can read.
 *
 *   `catalogExpansions.ts` C♭ (B)
 *       The same rule, plus a leak guard: it appears in question text
 *       and explanations and NEVER on an answer option, because the
 *       only bracketed option is the answer.
 *
 *   `pentatonics.ts`       G♯ (A♭) minor pentatonic
 *       A SCALE NAME that is genuinely double-named. Both labels are
 *       real and both are used; the parenthesis is there because the
 *       app defaults to flats while the spelling must be sharp.
 *
 *   HERE                   B𝄫 (**A**)
 *       A NOTE WHOSE CORRECT SPELLING CANNOT BE PLAYED AS WRITTEN.
 *       BOLD, and the bold is the whole difference. In E♭ the ♭♭7 is
 *       B𝄫 — no keyboard has a B-double-flat, and the reader cannot
 *       act on the name at all. So the parenthetical is not a
 *       footnote here, it IS the instruction: A is the key you press.
 *       C♭ (B) is a note you could find by reasoning; B𝄫 (A) is one
 *       you cannot play until you are told.
 *
 * Four conventions, one visual shape. Do not collapse them: a footnote,
 * a footnote-plus-guard, an alias, and an instruction are four
 * different claims, and merging them would make three of the four say
 * something they do not mean.
 * =====================================================================
 */
export function noteWithPlayable(p: Pitch): string {
  const written = `${p.letter}${p.accidental === null ? '' : GLYPH[p.accidental] ?? p.accidental}`;
  if (p.accidental === '##' || p.accidental === 'bb') {
    return `${written} (**${playableName(p)}**)`;
  }
  const practical = PRACTICAL_NAME[ascii(p)];
  return practical === undefined ? written : `${written} (${practical})`;
}

/**
 * The name of the key you actually press, for a double accidental.
 *
 * ONE LETTER ACROSS AT THE SAME PITCH — zero semitones, one diatonic
 * step. B𝄫 sounds where A sounds, so the playable name is A: same
 * sound, next letter down. Asking for a note two semitones away
 * instead returns A𝄫, which is the original problem restated.
 *
 * Direction follows the accidental: a double flat has been pushed down
 * past the letter below it, a double sharp up past the letter above.
 */
function playableName(p: Pitch): string {
  const target = spellInterval(p, p.accidental === '##' ? 1 : -1, 0);
  if (target === null) throw new Error(`[scaleDegreeQuality] no playable name for ${ascii(p)}`);
  return `${target.letter}${target.accidental === null ? '' : GLYPH[target.accidental] ?? target.accidental}`;
}

export interface GroundedLine {
  key: string;
  startNote: string;
  endNote: string;
  /** True when either note needed a double accidental. */
  hasDouble: boolean;
}

/**
 * "In C that's D down to F♯" — the same question, in one real key.
 *
 * SPELLED BY `spellInterval`, NEVER BY A PITCH TABLE. "D down a minor
 * 6th" is F♯: five letters down from D is F, and the semitone count
 * makes it sharp. A twelve-slot table asked for that pitch returns G♭,
 * which is a lowered 5th of the key and a different answer to the
 * question the card asked.
 */
export function groundedLine(
  key: string,
  startDegree: number,
  quality: IntervalQuality,
  direction: Direction,
): GroundedLine | null {
  const tonic = parseNote(key);
  const start = spellInterval(
    tonic, startDegree - 1, MAJOR_SEMITONES[startDegree - 1],
  );
  if (start === null) return null;
  const sign = direction === 'up' ? 1 : -1;
  const end = spellInterval(
    start, sign * quality.letterSteps, sign * quality.semitones,
  );
  if (end === null) return null;
  return {
    key,
    startNote: noteWithPlayable(start),
    endNote: noteWithPlayable(end),
    hasDouble: [start, end].some(p => p.accidental === '##' || p.accidental === 'bb'),
  };
}

// --- The worked method ------------------------------------------------

/**
 * The diatonic interval between two degrees, in the direction asked.
 *
 * What the key ALREADY puts between them, before the question's
 * quality is applied. "2 down to 4" is nine semitones in any major
 * key, which is a major 6th — so a MINOR 6th is one short, and the
 * landing degree has to move to absorb the difference.
 *
 * Derived from the same table the answer is derived from. A second
 * list of "the interval between degree x and degree y" would be a
 * hand-written copy of a rule, and the copy is the one that goes wrong.
 */
export function diatonicBetween(
  startDegree: number,
  resultDegree: number,
  letterSteps: number,
  direction: Direction,
): { semitones: number; quality: IntervalQuality | undefined } {
  const sign = direction === 'up' ? 1 : -1;
  const raw = sign
    * (MAJOR_SEMITONES[resultDegree - 1] - MAJOR_SEMITONES[startDegree - 1]);
  const semitones = ((raw % 12) + 12) % 12;
  return {
    semitones,
    quality: INTERVAL_QUALITIES.find(
      q => q.letterSteps === letterSteps && q.semitones === semitones,
    ),
  };
}

/** A negative number printed with the MINUS SIGN the operators use, so
 *  one line does not carry two different characters for one idea. */
function num(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

/**
 * The two-step method, worked on this card's own numbers.
 *
 * =====================================================================
 * THE NUMBER AND THE QUALITY ANSWER DIFFERENT QUESTIONS.
 *
 * A reader who has done the old 84 knows the first half already: the
 * number gives the degree, n − 1 steps, wrap outside 1–7. That half is
 * unchanged and is shown the same way, because it is the same skill.
 *
 * The second half is what these cards add. Once you know WHICH degree,
 * the quality decides whether it is the one the key contains. Comparing
 * the interval you were asked for against the interval the key already
 * puts between those two degrees gives the alteration directly — and
 * gives it as a reason rather than a rule to remember.
 *
 * ONE OPERATION PER LINE, and the container renders `whitespace-pre-wrap`
 * so the line breaks survive. A worked method folded into a paragraph
 * is a paragraph.
 * =====================================================================
 */
export function degreeMathExplanation(
  startDegree: number,
  quality: IntervalQuality,
  direction: Direction,
): string {
  const result = degreeResult(startDegree, quality, direction);
  const answer = degreeAnswer(result);
  const sign = direction === 'up' ? 1 : -1;
  const steps = quality.letterSteps;
  const raw = startDegree + sign * steps;
  const stepWord = steps === 1 ? 'step' : 'steps';

  const lines: string[] = [
    `${startDegree} ${direction} ${articleFor(quality.label)} ${quality.label} = ${answer}`,
    '',
    'THE NUMBER GIVES THE DEGREE',
    `a ${quality.intervalId}${ordinalSuffix(quality.intervalId)} = ${steps} ${stepWord} (${quality.intervalId} − 1)`,
    direction === 'up'
      ? `${startDegree} + ${steps} = ${num(raw)}`
      : `${startDegree} − ${steps} = ${num(raw)}`,
  ];
  if (raw > 7) lines.push(`${raw} − 7 = ${result.resultDegree}`);
  if (raw < 1) lines.push(`${num(raw)} + 7 = ${result.resultDegree}`);

  const diatonic = diatonicBetween(
    startDegree, result.resultDegree, steps, direction,
  );
  lines.push('', `THE QUALITY SAYS WHICH ${result.resultDegree}`);
  lines.push(
    `in the key, ${startDegree} ${direction} to ${result.resultDegree} is `
    + `${diatonic.semitones} semitones${
      diatonic.quality === undefined ? '' : ` — ${articleFor(diatonic.quality.label)} ${diatonic.quality.label}`
    }`,
  );
  if (result.alteration === 0) {
    lines.push(
      `${articleFor(quality.label)} ${quality.label} is what was asked, so the `
      + `${result.resultDegree} is the one the key already contains: ${answer}`,
    );
  } else {
    const gap = quality.semitones - diatonic.semitones;
    const bigger = gap > 0;
    // Spelled as a word, because the next line says "one less lands one
    // higher" and "1 semitone less … one less" reads as two different
    // quantities on two consecutive lines.
    const size = Math.abs(gap) === 1 ? 'one' : String(Math.abs(gap));
    lines.push(
      `${articleFor(quality.label)} ${quality.label} is ${quality.semitones}, `
      + `${size} ${Math.abs(gap) === 1 ? 'semitone' : 'semitones'} `
      + `${bigger ? 'more' : 'less'}`,
    );
    lines.push(
      `going ${direction}, ${size} ${bigger ? 'more' : 'less'} lands `
      + `${size} ${result.alteration > 0 ? 'higher' : 'lower'}: ${answer}`,
    );
  }
  return lines.join('\n');
}

function ordinalSuffix(n: number): string {
  return n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
}

function articleFor(name: string): string {
  return /^[AEIO]/i.test(name) ? 'an' : 'a';
}
