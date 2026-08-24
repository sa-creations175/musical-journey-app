import type { Flashcard } from './catalog';
import {
  INTERVAL_NAMES, INTERVAL_PAIR_SUM, intervalNameAt, inversionPairs,
  invertedSemitones, ordinalOfName,
} from './intervalInversion';

/**
 * Interval inversion, drilled as intervals.
 *
 * =====================================================================
 * THESE TEST THE RULE SCALE DEGREE MATH TEACHES.
 *
 * Scale-degree-math shows the method — n − 1 steps, pairs add to 9,
 * invert when it saves a count. These are the facts that rule
 * produces, asked as interval facts, which is why they live in
 * Interval Identification rather than beside the method.
 *
 * EVERY CARD CARRIES A QUALITY, and that is the whole shape of the
 * set. Nobody hears "a sixth" — they hear a major sixth or a minor
 * sixth, and quality is not a layer on top of the number, it is part
 * of what the ear is doing. A bare-number card would ask about
 * something inaudible.
 *
 * That decision is also what fixes the count. On bare ordinals the
 * pairs are 1↔8, 2↔7, 3↔6, 4↔5 — four pairs, eight members. With
 * quality, a minor 2nd and a major 2nd are different intervals
 * inverting to different partners, so it is SIX pairs and twelve
 * members, plus the tritone, which has no partner because it is its
 * own. Thirteen. The list is derived from `inversionPairs()` rather
 * than written down, so the count follows the table.
 *
 * The number rule is not lost by dropping bare-ordinal cards: it sits
 * on `iv-inv-sum` once, where it belongs, instead of twelve times in a
 * framing that corresponds to nothing audible.
 * =====================================================================
 */

const INVERSION_CONTEXT =
  'Inversion is what happens when the lower note jumps an octave — the same '
  + 'two pitches, re-voiced. It is why a 6th and a 3rd feel related, and why '
  + 'a chord in first inversion still sounds like itself.';

/**
 * "a" or "an", by how the name is SAID rather than spelled.
 *
 * O takes "an" — an Octave. U does not, because "unison" begins with a
 * consonant sound: a unison, the way it is a university. Deriving this
 * from the first letter alone gets one of the thirteen wrong.
 */
function article(name: string): string {
  return /^[AEIO]/i.test(name) ? 'an' : 'a';
}

/** `iv-inv-of-minor-3rd`. Content-suffixed, never positional. */
function slug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Three decoys, in families rather than hand-picked.
 *
 *   SELF        the un-inverted interval — catches not doing the
 *               operation at all.
 *   QUALITY     the right number with the wrong quality — catches
 *               flipping the number but not the quality, which is the
 *               half most people drop.
 *   NEIGHBOUR   an interval a semitone or two off — catches an
 *               off-by-one in the sum.
 *
 * Taken in that order and filtered, so a perfect interval (which has
 * no major/minor counterpart) falls through to neighbours rather than
 * being given a quality that does not exist.
 */
function decoysFor(selfName: string, answerSemitones: number): string[] {
  const candidates: Array<string | undefined> = [selfName];

  // Same ordinal, opposite quality: minor sits one semitone below its
  // major. Undefined for perfect intervals and the tritone.
  if (/^minor/.test(intervalNameAt(answerSemitones) ?? '')) {
    candidates.push(intervalNameAt(answerSemitones + 1));
  } else if (/^Major/.test(intervalNameAt(answerSemitones) ?? '')) {
    candidates.push(intervalNameAt(answerSemitones - 1));
  }

  for (const d of [-1, 1, -2, 2, -3, 3]) {
    candidates.push(intervalNameAt(answerSemitones + d));
  }

  const answer = intervalNameAt(answerSemitones);
  const out: string[] = [];
  for (const c of candidates) {
    if (c === undefined || c === answer || out.includes(c)) continue;
    out.push(c);
    if (out.length === 3) break;
  }
  return out;
}

function inversionCard(name: string, semitones: number): Flashcard {
  const answerSem = invertedSemitones(semitones);
  const answer = intervalNameAt(answerSem)!;
  const ownOrdinal = ordinalOfName(name);
  const answerOrdinal = ordinalOfName(answer);
  // The ordinal sentence is omitted for the tritone, which has no
  // single ordinal — it is an augmented 4th or a diminished 5th
  // depending on how it is spelled, and asserting one would be wrong.
  const sumLine = ownOrdinal !== undefined && answerOrdinal !== undefined
    ? ` ${ownOrdinal} + ${answerOrdinal} = ${INTERVAL_PAIR_SUM} — inverted pairs always do.`
    : '';
  const qualityLine = semitones === answerSem
    ? ' The tritone is the only interval that inverts to itself, which is what '
      + 'splitting the octave in half means.'
    : / ^/.test(name) ? '' : qualityNote(name, answer);
  return {
    id: `iv-inv-of-${slug(name)}`,
    category: 'intervals',
    categoryName: 'Intervals',
    question: `${article(name) === 'an' ? 'An' : 'A'} ${name} inverted is a _____`,
    correctAnswer: answer,
    decoys: decoysFor(name, answerSem),
    explanation: `Turn ${article(name)} ${name} upside down and you get `
      + `${article(answer)} ${answer}.${sumLine}`
      + `${qualityLine} ${INVERSION_CONTEXT}`,
    skillTag: `interval-inversion-${slug(name)}`,
  };
}

/** Which half of the quality rule this pair demonstrates. */
function qualityNote(name: string, answer: string): string {
  if (/^Perfect|^Unison|^Octave/.test(name)) {
    return ' Perfect stays perfect: only major and minor swap.';
  }
  const from = /^minor/.test(name) ? 'Minor' : 'Major';
  const to = /^minor/.test(answer) ? 'minor' : 'major';
  return ` ${from} inverts to ${to} — the number and the quality flip together.`;
}

export function intervalInversionCards(): Flashcard[] {
  const { pairs, selfInverse } = inversionPairs();
  const cards: Flashcard[] = [];

  // Both members of every pair. Asking about the 4th and asking about
  // the 5th are different retrievals, not one card seen twice.
  for (const [a, b] of pairs) {
    cards.push(inversionCard(a.name, a.semitones));
    cards.push(inversionCard(b.name, b.semitones));
  }
  for (const iv of selfInverse) {
    cards.push(inversionCard(iv.name, iv.semitones));
  }

  cards.push({
    id: 'iv-inv-sum',
    category: 'intervals',
    categoryName: 'Intervals',
    question: 'An interval and its inversion always add up to _____',
    correctAnswer: String(INTERVAL_PAIR_SUM),
    // 8 is the off-by-one this rule is most often got wrong as; 12 is
    // the semitone count, which is the same fact counted differently.
    decoys: [
      String(INTERVAL_PAIR_SUM - 1),
      String(INTERVAL_PAIR_SUM - 2),
      '12',
    ],
    explanation: `2↔7, 3↔6, 4↔5 — every pair sums to ${INTERVAL_PAIR_SUM}, not `
      + `${INTERVAL_PAIR_SUM - 1}, because both ends count the degree they sit `
      + `on. It is the same off-by-one that makes an interval move n − 1 steps. `
      + `Counted in semitones the pairs sum to 12 instead; same relationship, `
      + `different unit.`,
    skillTag: 'interval-inversion-sum',
  });

  cards.push({
    id: 'iv-inv-quality-rule',
    category: 'intervals',
    categoryName: 'Intervals',
    question: 'When an interval inverts, its quality _____',
    correctAnswer: 'flips major↔minor; perfect stays perfect',
    decoys: [
      'always stays the same',
      'always flips',
      'flips only on 4ths and 5ths',
    ],
    explanation: 'A major 3rd inverts to a minor 6th; a minor 7th to a major '
      + '2nd. Perfect intervals have no opposite quality to flip to, so a '
      + 'perfect 4th inverts to a perfect 5th and stays perfect. The tritone '
      + 'is its own inversion and keeps its name either way.',
    skillTag: 'interval-inversion-quality',
  });

  return cards;
}

/** Exported for the count assertion — the set this generator covers. */
export const INVERSION_CARD_SOURCE = INTERVAL_NAMES;
