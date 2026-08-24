import type { Flashcard } from './catalog';
import { chooseDecoys } from './decoyGuard';
import { article } from './intervalInversion';
import {
  DIRECTIONS, DEGREE_COUNT, INTERVAL_QUALITIES, degreeAnswer,
  degreeMathExplanation, degreeResult, wrapDegree,
  type Direction, type IntervalQuality,
} from './scaleDegreeQuality';

/**
 * 168 cards: 7 start degrees × 12 interval qualities × 2 directions.
 *
 * =====================================================================
 * THE OLD 84 ARE THE ALTERATION-ZERO SUBSET, ONE FOR ONE.
 *
 * "2 up a 5th = 6" asks only about intervals the major scale already
 * contains, so counting letters and ignoring quality scores full
 * marks. Add the quality and the same start degree can land outside
 * the key: 2 down a MINOR 6th is ♯4, and a reader trained on the old
 * cards answers 4.
 *
 * Every one of the 84 survives here as a card whose alteration is
 * zero — 84 of the 168, asserted in the test. That is what makes
 * retiring them a replacement rather than a swap.
 * =====================================================================
 */

const CATEGORY = 'scale-degree-math';
const DECOY_COUNT = 3;

/** The structured facts a card carries, beside its question string. */
export interface DegreeMathFacts {
  startDegree: number;
  /** The ordinal the interval name carries: a 6th is 6. */
  intervalId: number;
  qualityId: string;
  direction: Direction;
  resultDegree: number;
  /** 0 diatonic, +1 raised, −1 lowered. */
  alteration: number;
}

export type DegreeMathCard = Flashcard & { facts: DegreeMathFacts };

/**
 * Decoy candidates, in three families.
 *
 * =====================================================================
 * THE FIRST FAMILY IS THE POINT OF THE CATEGORY.
 *
 * THE DIATONIC ANSWER — the degree with no alteration — is what you
 * get by counting letters and ignoring the quality, which is exactly
 * the habit the old 84 trained. On "2 down a minor 6th" it is 4
 * against a correct answer of ♯4. A reader who has not learned that
 * quality alters the landing degree will pick it every time, and that
 * is the card working.
 *
 * RIGHT DEGREE, WRONG ALTERATION catches reading the quality and
 * applying it backwards — ♭4 for ♯4.
 *
 * RIGHT ALTERATION, WRONG DEGREE catches counting the letters wrong
 * while handling the quality correctly — ♯5 for ♯4.
 *
 * On an unaltered card the first family IS the answer, so it drops out
 * and the other two carry the card. That is a real difference between
 * the two kinds of card, not an oversight: there is no
 * ignore-the-quality mistake to catch when the quality alters nothing.
 * =====================================================================
 */
function decoyPool(resultDegree: number, alteration: number): string[] {
  const label = (degree: number, alt: number) =>
    degreeAnswer({ resultDegree: degree, alteration: alt });
  const otherDegrees = Array.from(
    { length: DEGREE_COUNT - 1 },
    (_, i) => wrapDegree(resultDegree + i + 1),
  );
  return [
    // the diatonic answer — ignoring the quality entirely
    label(resultDegree, 0),
    // right degree, wrong alteration
    label(resultDegree, -alteration),
    label(resultDegree, alteration === 0 ? 1 : -alteration),
    label(resultDegree, alteration === 0 ? -1 : alteration),
    // right alteration, wrong degree — nearest first
    ...otherDegrees.flatMap(d => [label(d, alteration), label(d, 0)]),
  ];
}

/** The degree number a label carries, with its accidental stripped. */
function degreeNumberOf(label: string): number {
  return Number(label.replace(/[^0-9]/g, ''));
}

/**
 * At least one decoy must name the SAME DEGREE as the answer.
 *
 * =====================================================================
 * WITHOUT THIS THE CARD IS ANSWERABLE BY SIZE, AND IT MEASURED 41%.
 *
 * The first generated set had no constraint here, and the blind solver
 * found "pick the highest degree number" right on 41 of the 101 cards
 * where one option was uniquely highest — against 25% chance and over
 * the 40% line the guard runs on. Nobody designed that; it fell out of
 * a pool that mostly offered other degrees.
 *
 * A same-degree decoy removes it structurally rather than by tuning: ♯4
 * beside 4 means no option is uniquely highest OR uniquely lowest, so
 * both heuristics stop firing entirely instead of being pushed down to
 * something that looks acceptable.
 *
 * It is also the better card. "Is it the 4 or the ♯4" is the question
 * these 168 exist to ask; an option set where every degree number is
 * different lets a reader count letters and stop, which is the habit
 * the old 84 trained.
 * =====================================================================
 */
function sameNumberPresent(decoys: readonly string[], resultDegree: number): boolean {
  return decoys.some(d => degreeNumberOf(d) === resultDegree);
}

/**
 * On an altered card, the DIATONIC answer must be on screen.
 *
 * It is what you get by counting letters and ignoring the quality —
 * 4 when the answer is ♯4 — so it is the one decoy that catches the
 * exact habit this category exists to break. Left to its own cost
 * function the chooser dropped it from roughly half the cards, because
 * the rotation that gives two cards different decoys does not know one
 * candidate matters more than the others.
 *
 * Unaltered cards have no such decoy to require: the diatonic answer
 * IS the answer. `sameNumberPresent` still applies to them, so they
 * get ♯4 or ♭4 beside a correct 4 — the same question in reverse.
 */
function diatonicPresent(
  decoys: readonly string[],
  result: { resultDegree: number; alteration: number },
): boolean {
  if (result.alteration === 0) return true;
  return decoys.includes(
    degreeAnswer({ resultDegree: result.resultDegree, alteration: 0 }),
  );
}

/** Whether a label carries an accidental — "♯4" does, "4" does not. */
const isAltered = (label: string) => !/^\d+$/.test(label);

/**
 * Both kinds must be on screen: at least one altered option and at
 * least one plain one.
 *
 * =====================================================================
 * AN ELIMINATION TELL IS STILL A TELL, AND THE GUARD CANNOT SEE IT.
 *
 * `chooseDecoys` rejects a set where a rule PICKS the answer. It has
 * nothing to say about a rule that reliably picks a WRONG one — and
 * the first fixed version of these cards had two. "The only altered
 * option" fired on 62 cards and was never right; "the uniquely
 * longest" the same. Both read as clean at 0%, and both hand you a
 * free elimination: cross one off and a four-way guess becomes a
 * three-way, 25% to 33%, without knowing any theory.
 *
 * A rule at 0% over 62 cards is not the absence of a tell. It is a
 * tell with the sign flipped, and it is more reliable than most of the
 * ones the guard does catch.
 *
 * TWO OF EACH, NOT MERELY ONE OF EACH. Requiring only that both kinds
 * appear still permits a 1-and-3 split, and a lone altered option is
 * exactly what those 62 cards had — it was crossable off precisely
 * because it stood alone. An even split leaves nothing standing alone
 * to cross off, and it takes "the uniquely longest option" with it,
 * since two options then share the longer shape.
 * =====================================================================
 */
function evenlySplit(answer: string, decoys: readonly string[]): boolean {
  const altered = [answer, ...decoys].filter(isAltered).length;
  return altered === 2;
}

export function scaleDegreeQualityCards(): DegreeMathCard[] {
  const cards: DegreeMathCard[] = [];
  for (let startDegree = 1; startDegree <= DEGREE_COUNT; startDegree++) {
    for (const quality of INTERVAL_QUALITIES) {
      for (const direction of DIRECTIONS) {
        cards.push(buildCard(startDegree, quality, direction));
      }
    }
  }
  return cards;
}

function buildCard(
  startDegree: number,
  quality: IntervalQuality,
  direction: Direction,
): DegreeMathCard {
  const result = degreeResult(startDegree, quality, direction);
  const answer = degreeAnswer(result);
  // CONTENT-SUFFIXED, never positional. `sdm-2-down-m6` says what the
  // card is; `sdm-27` renumbers the moment anything is inserted, and
  // takes every reader's spacing history with it.
  const id = `sdm-${startDegree}-${direction}-${quality.id}`;
  return {
    id,
    category: CATEGORY,
    categoryName: 'Scale Degree Math',
    question:
      `In any major key, ${startDegree} ${direction} `
      + `${article(quality.label)} ${quality.label} = ?`,
    correctAnswer: answer,
    decoys: chooseDecoys(answer, decoyPool(result.resultDegree, result.alteration), {
      count: DECOY_COUNT,
      seed: id,
      label: id,
      category: CATEGORY,
      require: ds => sameNumberPresent(ds, result.resultDegree)
        && diatonicPresent(ds, result)
        && evenlySplit(answer, ds),
    }),
    explanation: degreeMathExplanation(startDegree, quality, direction),
    skillTag: `scale-degree-quality-${direction}-${quality.id}`,
    // STRUCTURED, not only inside the question string. The category
    // detail grid is 7 degrees × 24 (twelve qualities each way) and has
    // to be buildable from data — parsing a question string back into
    // its parts is how a ♭ went missing once already.
    facts: {
      startDegree,
      intervalId: quality.intervalId,
      qualityId: quality.qualityId,
      direction,
      resultDegree: result.resultDegree,
      alteration: result.alteration,
    },
  };
}

/**
 * Read a card id back into the facts a footer needs.
 *
 * Returns null for anything that is not one of the 168 — including the
 * original 84, whose ids look similar (`sdm-2-down-6th`) and which do
 * not carry a quality to ground.
 *
 * PARSING AN ID, NOT A QUESTION STRING. The id is a key the generator
 * built from these exact fields, so the round trip is exact; a question
 * string is prose, and prose is what lost a ♭ last time. The parse is
 * checked against `INTERVAL_QUALITIES` rather than trusted, so a
 * renamed quality returns null instead of a wrong chord.
 */
export function qualityOfCardId(id: string): {
  startDegree: number;
  quality: IntervalQuality;
  direction: Direction;
} | null {
  const m = /^sdm-(\d)-(up|down)-([mMPAd]\d)$/.exec(id);
  if (m === null) return null;
  const quality = INTERVAL_QUALITIES.find(q => q.id === m[3]);
  if (quality === undefined) return null;
  const startDegree = Number(m[1]);
  if (startDegree < 1 || startDegree > DEGREE_COUNT) return null;
  return { startDegree, quality, direction: m[2] as Direction };
}
