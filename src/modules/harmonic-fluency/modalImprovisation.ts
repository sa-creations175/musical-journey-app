/**
 * Modal Improvisation — which notes fit over the chord the band is on.
 *
 * =====================================================================
 * THE CARD SILAS WANTED AND COULD NOT FIND (9 Sep 2026).
 *
 * "In C, the band is on D7 (5 of 5). Which notes fit?" — answer, the
 * notes of the G major scale. The skill is one sentence: over a chord
 * that is IN the key, stay in the key; over a chord that points OUT of
 * it, play the notes of the key it points to for that bar.
 *
 * THE MINOR TARGETS ARE MELODIC MINOR, AND HARMONIC MINOR WAS TRIED
 * AND REJECTED. A7 pointing at Dm in C is C major with exactly one
 * note raised — the A7 chord's third, C♯ — and that is D melodic
 * minor. Harmonic minor raises a second note the chord never asks for,
 * so it teaches a bigger change than the one the ear is hearing.
 *
 * =====================================================================
 * EVERY WORD HERE IS THE PROTOTYPE'S.
 *
 * `docs/modal-improvisation-prototype_1.html` is the signed-off
 * click-through, and its `model()` function is the spec for the
 * question, the answer and the explanation. Nothing below writes a
 * sentence the prototype does not; where a word was needed that it
 * does not supply, the report says so rather than this file inventing
 * one.
 *
 * =====================================================================
 * WITH ONE REPAIR, ON THE THIRTY BORROWED CHORDS IT MISNAMES.
 *
 * The prototype's `parse()` counts '#' and 'b' characters, and its
 * `spell()` hands it names already drawn with GLYPHS. So a target root
 * carrying an accidental parsed as a natural and the secondary
 * dominant came out a fifth above the wrong note: "In D, the band is
 * on C7 (5 of 3)", answered "Notes of the F♯ melodic minor scale" —
 * and C7 is not the 5 of F♯m.
 *
 * The chord root here is the degree of the KEY a fifth above the
 * target, taken from `degreeAscii`, which is the same thing the
 * prototype meant and gets right in the thirty-five cases where the
 * target root is natural. See `modalImprovisationPrototype.ts` for the
 * thirty rows it changes. Nothing else moved — the answers and the
 * sound never went through `parse`.
 *
 * SILAS RULED ON THIS, 9 SEP 2026: THE REPAIR STAYS. In the key of D
 * major the 5 of 3 is C♯7. So the prototype is no longer the source
 * of the chord NAMES — this file is, and the fixture holds the
 * prototype's output with the repair already applied. Everything else
 * about the words is still the prototype's and still checked against
 * it. Do not "restore" the thirty.
 *
 * =====================================================================
 * TEN CHORDS, AND WHY THOSE TEN.
 *
 * Five in the key — the 2, the 3, the 4, the 5 as a dominant and the
 * 6 — and the five secondary dominants that point at them. The 1 and
 * the 7 are not asked: over the 1 there is nothing to decide, and the
 * 7 is the diminished chord no card in this deck has ever put on
 * screen (`progressionDecoyPool` gives that argument in full).
 * =====================================================================
 */
import type { Flashcard } from './catalog';
import { chooseDecoys, chooseDecoysOrNull } from './decoyGuard';
import {
  THIRTEEN_KEYS, degreeAscii, degreeAsciiOrNull, noteLabel,
} from './catalogExpansions';
import {
  semitoneValue, type Accidental, type Letter,
} from '../reading/pitch';

/** The row a reader sees above the family. */
export const MODAL_IMPROV_CATEGORY_NAME = 'Modal Improvisation';

/**
 * What the family is, on the dashboard.
 *
 * SILAS'S SENTENCE, 9 SEP 2026, and it is in
 * `docs/HARMONIC_FLUENCY_COPY.md` where the test can read it.
 *
 * THE PROTOTYPE'S `<p class="sub">` WAS HERE and is gone. It was page
 * copy rather than a row description — it opened by telling the reader
 * to pick something, which no other row does — and it said "Hear It"
 * where the button says "Hear it". This says what the family IS, which
 * is what a row description is for.
 */
export const MODAL_IMPROV_DESCRIPTION =
  'Modal Improvisation: the band lands on a chord; name the scale that '
  + 'fits over it. In-key chords stay in the key; a borrowed chord uses '
  + "the key of the chord it's pulling toward.";

/**
 * One of the ten chords the band can be sitting on.
 *
 * `num` IS THE PROTOTYPE'S OWN WORD for the chord — "2", "5 of 5" —
 * and it is what the question says, what the grid row is labelled and
 * what the filter chip reads. One word, three surfaces.
 */
export interface ModalChord {
  /** The id slug the card id and the grid row are built from. The
   *  prototype writes `V/5`; a slash is not a thing to put in a URL. */
  id: string;
  /** What the card calls this chord. The prototype's `num`. */
  num: string;
  /**
   * The degree of the key the chord is BUILT ON.
   *
   * In-key, that is the chord's own number. Borrowed, it is a fifth
   * above what the chord points at — the 5 of the 2 in C is A, which
   * is the 6 — so the two are written separately and neither is
   * derived from the other at read time.
   */
  degree: string;
  /** In-key: the suffix the chord's name carries. */
  quality?: string;
  /** Borrowed: the degree of the key it resolves to. */
  target?: string;
  kind: 'in' | 'borrow';
  /**
   * The `progression` facet value a borrowed chord carries.
   *
   * `V/V` AND `V/vi` ALREADY EXIST — Functional Harmony's two secondary
   * dominants have carried them since the facet was written, and their
   * chips already read "5 of 5" and "5 of 6". So the other three are
   * spelled the same way rather than given a vocabulary of their own,
   * and the Progression row gathers both families under one chip.
   */
  facet?: string;
}

export const MODAL_CHORDS: ReadonlyArray<ModalChord> = [
  { id: '2m', num: '2', degree: '2', quality: 'm', kind: 'in' },
  { id: '3m', num: '3', degree: '3', quality: 'm', kind: 'in' },
  { id: '4', num: '4', degree: '4', quality: '', kind: 'in' },
  { id: '5', num: '5', degree: '5', quality: '7', kind: 'in' },
  { id: '6m', num: '6', degree: '6', quality: 'm', kind: 'in' },
  { id: '5of2', num: '5 of 2', degree: '6', target: '2', kind: 'borrow', facet: 'V/ii' },
  { id: '5of3', num: '5 of 3', degree: '7', target: '3', kind: 'borrow', facet: 'V/iii' },
  { id: '5of4', num: '5 of 4', degree: '1', target: '4', kind: 'borrow', facet: 'V/IV' },
  { id: '5of5', num: '5 of 5', degree: '2', target: '5', kind: 'borrow', facet: 'V/V' },
  { id: '5of6', num: '5 of 6', degree: '3', target: '6', kind: 'borrow', facet: 'V/vi' },
];

/** The degrees a major key harmonises minor. A secondary dominant
 *  pointing at one of them points at a MELODIC MINOR pool. */
export const MINOR_TARGETS: ReadonlySet<string> = new Set(['2', '3', '6']);

/** The card id for one key and one chord. A prefix that has never
 *  existed, so nothing stored is repointed by minting it. */
export function modalCardId(chordId: string, root: string): string {
  return `mi-modal-${chordId}-${root}`;
}

/**
 * What one card says — question, answer and explanation together,
 * because the three are one piece of writing and reading them apart is
 * how a chord comes to be named one thing in the question and another
 * in the reason.
 */
export interface ModalCardText {
  /** The chord as the card names it — "D7", "E♯7", "B♭m". */
  chordName: string;
  question: string;
  answer: string;
  explanation: string;
}

export function modalCardText(root: string, chord: ModalChord): ModalCardText {
  const key = noteLabel(root);
  const chordRoot = noteLabel(degreeAscii(root, chord.degree));
  /**
   * "In the key of C major", never "In C".
   *
   * SILAS'S STANDING RULE, 9 Sep 2026: a key is always written "the key
   * of C major" or "the key of C minor". A bare capital letter
   * mid-sentence reads as a stray word rather than as a key, which is
   * the confusion `CLAUDE.md` says has been caused more than once.
   *
   * THE QUESTION ONLY, in this family, because that is what was ruled.
   * The explanations still say "the 2 of C" and "not in C major"; both
   * are named in the report rather than swept up here.
   */
  const inKeyOf = `In the key of ${key} major`;

  if (chord.kind === 'in') {
    const chordName = `${chordRoot}${chord.quality ?? ''}`;
    return {
      chordName,
      question:
        `${inKeyOf}, the band is on ${chordName} (${chord.num}). Which notes fit?`,
      answer: `Notes of the ${key} major scale`,
      explanation: `${chordName} is the ${chord.num} of ${key}. Every note it `
        + `holds is already in ${key} major, so nothing changes: stay in the key.`,
    };
  }

  const chordName = `${chordRoot}7`;
  const targetRoot = noteLabel(degreeAscii(root, chord.target!));
  const minor = MINOR_TARGETS.has(chord.target!);
  const scaleName = `${targetRoot}${minor ? ' melodic minor' : ' major'}`;
  const targetChord = `${targetRoot}${minor ? 'm' : ''}`;
  return {
    chordName,
    question:
      `${inKeyOf}, the band is on ${chordName} (${chord.num}). Which notes fit?`,
    answer: `Notes of the ${scaleName} scale`,
    // WHICH DEGREE THE DOMINANT IS, ON EVERY BORROWED CARD.
    //
    // A minor-target card says it inside Silas's sentence — "Here E7
    // (the 3 as a dominant, the 5 of 6) lands on Am" — so this is the
    // major-target half of the same fact, in the same bracket form and
    // in the one place the card names the chord. Saying it twice on a
    // minor card would be saying it twice.
    //
    // The degree is the coordinate the generator already holds: the
    // 5 of 5 is built on the 2, the 5 of 4 on the 1.
    explanation: `${chordName}${minor ? '' : ` (the ${chord.degree} as a `
      + `dominant, the ${chord.num})`} is not in ${key} major; it is the 5 of `
      + `${targetChord}. Play the notes of the key it points to for that bar. `
      + (minor
        ? minorTargetSentence(root, chord, chordName, targetRoot, targetChord)
        : `The highlighted notes are the ones ${key} major does not have.`),
  };
}

/**
 * What to play over a secondary dominant of a MINOR chord.
 *
 * =====================================================================
 * SILAS'S WORDS, 9 SEP 2026, GENERATED PER CARD.
 *
 * It replaces "For a minor target that is just C major with one note
 * raised: the E7 chord's third", which was true on a 5 of 2 and on
 * nothing else. "The key with the chord's third raised" is the target's
 * HARMONIC minor on a 5 of 3 and a 5 of 6, and harmonic minor was tried
 * and rejected; the answer is the target's MELODIC minor, which sits
 * three notes and two notes from the key on those two.
 *
 * Nobody could see that until the reveal started drawing the scale —
 * the card said "one note raised" over a row with two marks.
 *
 * IT TAKES THE HIGHLIGHTED-NOTES SENTENCE WITH IT. Silas's text ends
 * "The marked notes are the ones the key of C major does not have",
 * which is the same clause said better, so the card carries one and not
 * two. The major-target cards keep the old wording, which is what the
 * brief ruled — and it is in the report as the difference it is.
 * =====================================================================
 */
function minorTargetSentence(
  root: string,
  chord: ModalChord,
  chordName: string,
  targetRoot: string,
  targetChord: string,
): string {
  const key = noteLabel(root);
  // The target's own 3 and ♭3, spelled in the target's key — the one
  // note that separates the two scales, named both ways round.
  const third = noteLabel(degreeAscii(degreeAscii(root, chord.target!), '3'));
  const flatThird = noteLabel(degreeAscii(degreeAscii(root, chord.target!), 'b3'));
  return 'When a secondary dominant takes you to a minor chord, improvise '
    + "over that dominant with the melodic minor of the chord you're landing "
    + "on, which is just that chord's major scale with a ♭3. "
    // THE DOMINANT'S OWN NUMBER IN THE KEY, which is the coordinate the
    // generator already holds: the 5 of 6 is built on the 3.
    + `Here ${chordName} (the ${chord.degree} as a dominant, the ${chord.num}) `
    + `lands on ${targetChord} (the ${chord.target}m), so while you're on the `
    + `${chordName} play ${targetRoot} melodic minor: ${targetRoot} major with `
    + `${an(flatThird)} (♭3) instead of ${an(third)} (3). Once you land, `
    + `you're back in the key. The marked notes are the ones the key of `
    + `${key} major does not have.`;
}

/**
 * "a C", but "an F".
 *
 * NOT IN SILAS'S SENTENCE, and not new copy either — his example is "a
 * C (♭3) instead of a C♯ (3)", which is right for C and wrong for the
 * three letters that are said with a vowel. A, E and F are "an A", "an
 * E" and "an F" however they are spelled after the letter, so the
 * LETTER decides and the accidental never does.
 *
 * The same rule `facetDisplay` already applies to the Distance chips —
 * "up an augmented fourth", "up a minor third".
 */
function an(note: string): string {
  return /^[AEF]/.test(note) ? `an ${note}` : `a ${note}`;
}

/**
 * The seven notes of the answer scale, from its own root, with the ones
 * the home key does not hold marked.
 *
 * =====================================================================
 * THE SENTENCE ALREADY SAID THIS AND NOTHING DREW IT.
 *
 * Every borrowed card's explanation ends "The highlighted notes are the
 * ones C major does not have" — the prototype's words, and on the
 * prototype there were notes to highlight. On a flashcard there were
 * not, so the sentence pointed at nothing. Ruled 9 Sep 2026: draw them.
 *
 * A DEGREE OF THE SCALE'S OWN ROOT, not a transposition table. Major is
 * 1 2 3 4 5 6 7 of the root and melodic minor is 1 2 ♭3 4 5 6 7 — both
 * already in `degreeAscii`'s table — so G♯ melodic minor spells its
 * seventh F𝄪 rather than G, which is the letter that makes it a
 * seventh at all.
 *
 * MARKED BY PITCH, NAMED BY LETTER. "Does the key of C major have this
 * note" is a question about sound, and D melodic minor's C♯ is outside
 * C major whatever it is called. The prototype compares pitch classes
 * for the same reason.
 *
 * AN IN-KEY CARD MARKS NOTHING, because the answer scale IS the key and
 * a row where every note is unmarked is the fact that card teaches.
 * =====================================================================
 */
export interface ModalScaleNote {
  /** The note as the card draws it — glyphs, including doubles. */
  note: string;
  /** Whether the home key does not hold this pitch. */
  outside: boolean;
}

/** Major and melodic minor, as degrees of their own root. */
const MAJOR_DEGREES: ReadonlyArray<string> = ['1', '2', '3', '4', '5', '6', '7'];
const MELODIC_MINOR_DEGREES: ReadonlyArray<string> =
  ['1', '2', 'b3', '4', '5', '6', '7'];

/** Pitch class of a spelling, doubles included — which is why this
 *  goes through `reading/pitch` rather than `spelling.pitchClassOf`,
 *  whose table stops at one accidental. */
function pitchClassOfAscii(ascii: string): number {
  const semis = semitoneValue({
    letter: ascii[0] as Letter,
    accidental: (ascii.slice(1) === '' ? null : ascii.slice(1)) as Accidental,
    octave: 4,
  });
  return ((semis % 12) + 12) % 12;
}

export function modalAnswerScale(
  root: string, chord: ModalChord,
): ModalScaleNote[] {
  const home = new Set(
    MAJOR_DEGREES.map(d => pitchClassOfAscii(degreeAscii(root, d))));
  const borrowed = chord.kind === 'borrow';
  const scaleRoot = borrowed ? degreeAscii(root, chord.target!) : root;
  const degrees = borrowed && MINOR_TARGETS.has(chord.target!)
    ? MELODIC_MINOR_DEGREES
    : MAJOR_DEGREES;
  return degrees.map(d => {
    const ascii = degreeAscii(scaleRoot, d);
    return {
      note: noteLabel(ascii),
      outside: borrowed && !home.has(pitchClassOfAscii(ascii)),
    };
  });
}

/**
 * =====================================================================
 * FOUR CARDS WHOSE POOL REACHES ONE KEY NEXT DOOR.
 *
 * Every wrong answer this family offers is another "Notes of the …
 * scale" — a real scale, correctly named, wrong for this chord. The
 * key's own ten answers are the pool, and on four cards they cannot
 * make a fair question:
 *
 *   In the key of D major, only F♯ melodic minor carries an accidental;
 *   in F major, only B♭ major does. So on those two the answer is the
 *   only option with a sharp or a flat in it, whichever three decoys
 *   are picked.
 *
 *   In D♭ major, only F melodic minor carries none. In F♯ major, only
 *   B major does. The same tell, the other way up.
 *
 * `only-accidental` and `only-natural` are two of the guard's blind
 * rules, and it refused all four rather than ship a card they could
 * answer. Ruled 9 Sep 2026: widen the pool by one neighbouring key.
 *
 * THE 5 FIRST, THEN THE 4, AND THE GUARD PICKS. One neighbour is a
 * step toward more accidentals and the other a step toward fewer, and
 * what a stuck card is short of is always one or the other — so trying
 * both in a fixed order needs no rule about which, and no list of keys
 * written down beside the cards. The key next door is named FROM THE
 * CARD'S OWN KEY (`degreeAscii(root, '5')`), so a sharp key gets a
 * sharp neighbour; where that names something outside the thirteen —
 * the 5 of F♯ major is C♯ major — it is skipped.
 *
 * THE OTHER 126 ARE UNTOUCHED, and that is why the widening is tried
 * SECOND rather than folded into one big pool. `chooseDecoys` rotates
 * the whole pool by the card's seed, so a longer pool would have given
 * every card in the family different wrong answers to make four of
 * them work.
 *
 * PINNED AS A LIST, AND THE TEST PROVES IT EXACT — every card named
 * here really does need the second pool, and no card not named here
 * does. So a fifth cannot join them unnoticed.
 * =====================================================================
 */
export const MODAL_IMPROV_WIDENED: ReadonlyArray<{
  key: string; chord: string; rule: string; from: string;
}> = [
  { key: 'Db', chord: '5of3', rule: 'only-natural', from: 'Ab' },
  { key: 'D', chord: '5of3', rule: 'only-accidental', from: 'A' },
  { key: 'F', chord: '5of4', rule: 'only-accidental', from: 'Bb' },
  { key: 'F#', chord: '5of4', rule: 'only-natural', from: 'B' },
];

/**
 * The answers of one key, in the family's own chord order.
 *
 * DEDUPED, because the five in-key chords all answer with the key's
 * own scale — which is the fact the family is teaching, not an
 * oversight. So a key offers six distinct answers.
 */
function answersOf(root: string): string[] {
  const out: string[] = [];
  for (const chord of MODAL_CHORDS) {
    const { answer } = modalCardText(root, chord);
    if (!out.includes(answer)) out.push(answer);
  }
  return out;
}

/**
 * The pools one card may draw on, narrowest first: its own key, then
 * its own key plus the key on its 5, then plus the key on its 4.
 *
 * EXPORTED SO THE TEST CAN ASK THE SAME QUESTION THE GENERATOR DOES.
 * A test that rebuilt the pools itself would be checking its own
 * arithmetic.
 */
export function modalDecoyPools(root: string, correct: string): string[][] {
  const own = answersOf(root).filter(a => a !== correct);
  const pools = [own];
  for (const degree of ['5', '4']) {
    const neighbour = degreeAsciiOrNull(root, degree);
    if (neighbour === null || !THIRTEEN_KEYS.includes(neighbour)) continue;
    pools.push([
      ...own,
      ...answersOf(neighbour).filter(a => a !== correct && !own.includes(a)),
    ]);
  }
  return pools;
}

/**
 * Three wrong answers, from the narrowest pool that can give them.
 *
 * The last pool goes through `chooseDecoys` rather than the nullable
 * one, so a card that cannot be built even next door takes the build
 * down with the guard's own message instead of shipping.
 */
function chooseModalDecoys(root: string, id: string, correct: string): string[] {
  const opts = {
    count: 3, seed: id, label: id, category: 'modal-improvisation',
  };
  const pools = modalDecoyPools(root, correct);
  for (const pool of pools.slice(0, -1)) {
    const found = chooseDecoysOrNull(correct, pool, opts);
    if (found !== null) return found;
  }
  return chooseDecoys(correct, pools[pools.length - 1], opts);
}

/** Ten chords in thirteen keys. */
export function modalImprovisationCards(): Flashcard[] {
  const out: Flashcard[] = [];
  for (const root of THIRTEEN_KEYS) {
    for (const chord of MODAL_CHORDS) {
      const id = modalCardId(chord.id, root);
      const text = modalCardText(root, chord);
      out.push({
        id,
        category: 'modal-improvisation',
        categoryName: MODAL_IMPROV_CATEGORY_NAME,
        question: text.question,
        correctAnswer: text.answer,
        decoys: chooseModalDecoys(root, id, text.answer),
        explanation: text.explanation,
        // THE KEY AS WRITTEN. F♯ and G♭ are two keys with two sets of
        // answers, exactly as they are for the modes and the slash
        // chords — see `thirteenKeyAxis`.
        axis: { key: root, chord: chord.id },
        skillTag: `modal-improvisation-${chord.id}-in-${root}`,
      });
    }
  }
  return out;
}
