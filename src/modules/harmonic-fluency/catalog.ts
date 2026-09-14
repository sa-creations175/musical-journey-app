import { degreeAscii, expansionCards, practicalName } from './catalogExpansions';
import { chooseDecoys } from './decoyGuard';
import { scaleDegreeQualityCards } from './scaleDegreeQualityCards';
import { DEGREE_NOTE_CATEGORY_NAME, degreeNoteCards } from './degreeNoteCards';
import { DEGREE_MATH_CATEGORY_NAME } from './scaleDegreeQualityCards';
import { SCALES_AND_MODES_CATEGORY_NAME } from './cardKind';
import { withFacets } from './facets';
import { generateSpellChordCards } from './spellChordCards';
import {
  MODAL_IMPROV_CATEGORY_NAME, modalImprovisationCards,
} from './modalImprovisation';
// Harmonic Fluency flashcard catalog.
// Static data — no audio, no keys in the DB beyond per-user SM-2 state.
// Programmatic generators fill systematic categories (scale-degree math,
// reverse key pivots, intervals); hand-written cards cover nuanced
// categories (functional harmony, slash chords, chord construction).

export type FlashcardCategory =
  | 'scale-degree-math'
  | 'named-notes'
  | 'diatonic-qualities'
  | 'functional-harmony'
  | 'key-signatures'
  | 'reverse-key-pivots'
  | 'modes'
  | 'pentatonic-scales'
  | 'intervals'
  | 'chord-construction'
  | 'progressions'
  | 'slash-chords'
  | 'tritone-pairs'
  | 'enharmonic-equivalents'
  | 'degree-notes'
  | 'modal-improvisation';

export const CATEGORY_LABELS: Record<FlashcardCategory, string> = {
  'scale-degree-math': DEGREE_MATH_CATEGORY_NAME,
  'named-notes': 'Named Notes Across Keys',
  'diatonic-qualities': 'Diatonic Chord Qualities',
  'functional-harmony': 'Functional Harmony',
  'key-signatures': 'Key Signatures & Relationships',
  'reverse-key-pivots': 'Reverse Key Pivots',
  'modes': SCALES_AND_MODES_CATEGORY_NAME,
  // FOLDED INTO `modes` ON 14 SEP 2026, and kept for what stored it: a
  // goal or a link that named it resolves to Scales & Modes, and the
  // family's page still labels the pentatonic grid by it. See `cardKind`.
  'pentatonic-scales': 'Pentatonic Scales',
  'intervals': 'Interval Identification',
  'chord-construction': 'Chord Construction',
  'progressions': 'Progression Vocabulary',
  'slash-chords': 'Slash Chords & Inversions',
  'tritone-pairs': 'Tritone Pairs',
  'enharmonic-equivalents': 'Enharmonic Equivalents',
  // PLACEHOLDER NAME. The most literal description of what the family
  // relates, standing in until Silas rules — see `degreeNoteCards`.
  'degree-notes': DEGREE_NOTE_CATEGORY_NAME,
  'modal-improvisation': MODAL_IMPROV_CATEGORY_NAME,
};

/**
 * The categories a reader can reach, in the order they are offered.
 *
 * `named-notes`, `tritone-pairs` AND `reverse-key-pivots` ARE GONE FROM
 * HERE, and their cards are gone from the deck below. All three asked
 * what `degree-notes` now asks generally: "in F major, 4 of the scale"
 * is the 4 of F, "tritone of C" is the ♯4 of C, and "G is the 5 of
 * which major key" is the third leg of the same triangle — a key, a
 * degree and a note, with a different one unknown. Their cards are the
 * identical question with the identical answer under a new id, so their
 * history moves rather than being orphaned — see
 * `retiredCategoryMigration.ts`, which asserts that identity per card
 * rather than trusting a table.
 *
 * They keep their labels and their place in `FlashcardCategory` because
 * the retired generators still describe them, and the migration needs
 * both sides of the mapping to be describable. Nothing renders them.
 *
 * `ear-theory` WENT FURTHER, on 14 Sep 2026: its label and its place in
 * `FlashcardCategory` went with its cards, because nothing needs to
 * describe them. Its fold names card ids, never a category — see
 * `lib/migrations/hfDeckCleanup.ts`.
 *
 * `pentatonic-scales` WENT THE OTHER WAY, on 14 Sep 2026: its cards did
 * not move, their family did. They are filed under `modes`, Scales &
 * Modes, with their ids, answers, sounds and history as they were. See
 * `cardKind.ts`.
 */
export const CATEGORY_ORDER: FlashcardCategory[] = [
  'scale-degree-math', 'degree-notes', 'enharmonic-equivalents',
  'diatonic-qualities', 'functional-harmony',
  'key-signatures', 'modes', 'intervals',
  'chord-construction', 'progressions', 'modal-improvisation',
  'slash-chords',
];

export interface VisualHint {
  startingDegree?: number;
  destinationDegree?: number;
  direction?: 'up' | 'down';
  distance?: number;
  startingNote?: string;
  destinationNote?: string;
  key?: string;
}

export interface Flashcard {
  id: string;
  category: FlashcardCategory;
  categoryName: string;
  question: string;
  correctAnswer: string;
  decoys: string[];
  explanation?: string;
  skillTag: string;
  visualHint?: VisualHint;
  /**
   * What this card is ABOUT, in words that mean the same on every card
   * in the deck — see `facets.ts`.
   *
   * NOT `axis`, which is directly below and is a coordinate in this
   * category's own grid. A facet is comparable across categories; an
   * axis is not, and its field names are load-bearing for the grid.
   *
   * COMPUTED WHEN THE CATALOG IS BUILT, never stored and never written
   * to a row. Attached in one place by `withFacets` rather than by
   * sixteen generators each remembering.
   */
  facets?: import('./facets').CardFacets;
  /**
   * Where this card sits on its category's axes.
   *
   * =====================================================================
   * SUPPLIED BY THE GENERATOR, NEVER PARSED BACK OUT OF THE ID.
   *
   * Ids here are POSITIONAL — `nn-7`, `tt-3`, `iv-12`. They are that way
   * on purpose: an id is a stable handle for stored SM-2 state and user
   * annotations, and three of these categories carry no recoverable
   * structure in the id at all. Parsing one for a UI coordinate would
   * make the id a schema, and then renumbering a generator would move a
   * reader's progress.
   *
   * The generator already holds the values a moment before it writes the
   * id. Taking them from there costs one line and cannot drift.
   *
   * OPTIONAL, AND ABSENT MEANS FLAT LIST. Every card without one still
   * compiles and still renders — the progress-detail surface puts it in
   * the tail rather than the grid. That is why the twenty hand-written
   * progression cards need no invented coordinates.
   * =====================================================================
   */
  axis?: Readonly<Record<string, string | number>>;
}


// --- Shared music theory tables ------------------------------------

const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11]; // semitones above tonic for degrees 1..7

/** Which spelling each key's signature actually uses. Twelve entries,
 *  matching MAJOR_KEY_TONICS — see the exemption note below. */
const KEY_USES_FLATS: Record<string, boolean> = {
  C: false, G: false, D: false, A: false, E: false, B: false, 'F#': false,
  F: true, Bb: true, Eb: true, Ab: true, Db: true,
};

/**
 * TWELVE KEYS, NOT THIRTEEN. This table carried F# and Gb as separate
 * entries mapping to the same pitch class, differing only in which
 * note-name table they picked. That is a spelling wearing a key's
 * clothes — the same confusion step 2 retired from the rest of the app
 * when it made Gb a spelling of F# rather than a key in its own right.
 *
 * Keeping both would now be a live defect rather than an untidiness.
 * These entries feed the reverse-key-pivot DECOY POOL, so a card could
 * offer "F# major" and "Gb major" as two separate wrong answers for one
 * key; and once card text follows the spelling setting, the two would
 * render identically.
 *
 * The identity spelling is F#, matching songKeys, drillSkills and every
 * itemRef. What the reader sees is the setting's business — see
 * lib/spelling.ts.
 */
const MAJOR_KEY_TONICS: Record<string, number> = {
  C: 0, G: 7, D: 2, A: 9, E: 4, B: 11, 'F#': 6,
  F: 5, Bb: 10, Eb: 3, Ab: 8, Db: 1,
};

/**
 * The twelve major keys the harmonic-fluency generators work in, in the
 * order they are declared.
 *
 * EXPORTED SO A GRID CAN READ IT RATHER THAN COLLECT IT. A grid never
 * sorts its own axis, and deriving the key order from the cards present
 * gives first-appearance order — an accident of the catalog walk.
 *
 * Not `FLAT_TWELVE`: these spell the sixth key F♯ where that list says
 * G♭, and an axis whose values do not match the coordinates on the
 * cards would silently drop a column into the tail.
 */
export const HF_MAJOR_KEYS: ReadonlyArray<string> = Object.keys(MAJOR_KEY_TONICS);

/** 1–7. The list every degree axis reads, so no grid writes its own. */
export const SCALE_DEGREES: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7];

/** Semitone distances an interval card can span, 0–12. */
export const INTERVAL_SEMITONES: ReadonlyArray<number> =
  Array.from({ length: 13 }, (_, i) => i);

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT =  ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * =====================================================================
 * THESE CARDS ARE EXEMPT FROM THE SPELLING SETTING, AND THE REASON IS
 * NOT PREFERENCE — IT IS CORRECTNESS.
 *
 * `KEY_USES_FLATS` looks like the per-key derivations retired
 * everywhere else in the spelling work, and it is not the same thing.
 * Those chose how to READ a pitch the user had already identified. This
 * one answers "what is the 3 of A major", and that question has exactly
 * one right answer: C#. A major's signature contains C#; it contains no
 * Db. Rendering it as Db under a flats preference would not be a
 * differently-spelled truth, it would be a wrong answer to a theory
 * question — and this module exists to drill exactly that.
 *
 * Same shape as reading/pitch.ts's exemption: a staff and a key
 * signature are governed by notation rules, not by what the reader
 * finds comfortable. `lib/spelling.ts` is a pitch-class tool and the
 * right one for keyboards, grids and chord symbols; it is the wrong one
 * here.
 *
 * The pitch tables stay local for the same reason — they are consumed
 * by key-signature logic, not by display preference.
 * =====================================================================
 */
function noteAt(semitone: number, useFlats: boolean): string {
  const n = ((semitone % 12) + 12) % 12;
  return (useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[n];
}

export function degreeNote(key: string, degree: number): string {
  const tonic = MAJOR_KEY_TONICS[key] ?? 0;
  const semitone = tonic + MAJOR_SCALE_STEPS[degree - 1];
  return noteAt(semitone, KEY_USES_FLATS[key] ?? false);
}

/**
 * One degree of a major scale, spelled by LETTER, written in ASCII,
 * with its everyday name beside it when the letter-correct spelling is
 * one nobody says out loud.
 *
 * =====================================================================
 * WHY NOT `degreeNote`, DIRECTLY ABOVE.
 *
 * `degreeNote` answers a PITCH question — which key does the hand land
 * on — and rounds through a semitone number to do it. That is right for
 * an answer button, where the reader is naming a sound, and wrong for a
 * scale written out in full.
 *
 * F♯ major is F# G# A# B C# D# E#. Seven letters, each used exactly
 * once. A table with twelve slots and no letters in it can only say F
 * for the seventh, which gives the scale two F-letters and no E — a
 * different scale that happens to sound the same. It is the same defect
 * `lydianChords.ts` documents for the ♯11, and it is unreachable by any
 * flat/sharp preference: the flat spelling of F is F.
 *
 * So the letters come from `degreeAscii`, which carries the diatonic
 * step count alongside the semitone count, and the parenthetical is the
 * C♭ (B) rule — one table, read here through `practicalName`.
 *
 * IN ASCII RATHER THAN GLYPHS, unlike every other caller of that rule.
 * This category writes its question, its answer and its decoys in ASCII
 * — the buttons say "F#", not "F♯" — and a lone glyph in the
 * explanation would be the only one on the card.
 * =====================================================================
 */
export function scaleDegreeSpelled(key: string, degree: number): string {
  const ascii = degreeAscii(key, String(degree));
  const practical = practicalName(ascii);
  return practical === undefined ? ascii : `${ascii} (${practical})`;
}

/** Strip "major"/"minor" suffix so "G major" → "G". */
export function parseKeyRoot(key: string): string {
  return key.replace(/\s*(major|minor)\s*$/i, '').trim();
}

// Pad a decoy list to 3 unique values excluding the correct answer.
function makeDecoys(candidates: string[], correct: string, count = 3): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    if (c !== correct && !out.includes(c)) out.push(c);
    if (out.length >= count) break;
  }
  return out;
}

// --- Category 1: Scale degree math (systematic) ---------------------

/** Three decoys, four options. Normalised across the catalog. */
const DECOY_COUNT = 3;


// --- Category 2: Named notes across keys ----------------------------

// --- Category 6: Reverse key pivots ---------------------------------

// --- Category 8: Intervals (systematic) -----------------------------

// INTERVAL_NAMES moved to `intervalInversion.ts`, beside the inversion
// rule that reads it. It was private here while `seed.ts` held the same
// thirteen again, and a third copy was one caller away.

// `ACCIDENTAL_COUNTS` AND `accidentalCountDecoys` MOVED to
// `catalogExpansions`, beside the generator that mints the count cards
// now. The retired hand-written ones below still call it, which is why
// it is imported rather than copied: two derivations of "which three
// counts does this card show" is how the pinned ranks would drift.

// --- Hand-written categories ---------------------------------------

/**
 * Diatonic Chord Qualities: major and all three minors, degrees 1 to 7.
 *
 * =====================================================================
 * EVERY SCALE ON EVERY DEGREE, AND NO QUESTION NAMES ITS ANSWER.
 *
 * Silas's decision of 13 Sep 2026. The deck had major and natural minor
 * whole and four degrees of harmonic minor; it gains the other three
 * harmonic degrees and all seven of melodic minor. And the questions
 * stop asking "what quality is iiø", which is the answer written in
 * Roman numerals: every one asks by plain degree number and scale.
 *
 * THE IDS DID NOT MOVE, so every rating and every attempt stays where
 * it was. `dq-hm-2` is still harmonic minor's 5 and `dq-hm-3` its 7 —
 * the ids were never positional — and the three new harmonic cards
 * continue the count after `dq-hm-5`.
 *
 * EVERY OPTION CARRIES ITS SYMBOL, the answer and the three decoys
 * alike. A bracket on the answer alone is the leak
 * `strippedParentheticals.test.ts` records; on all four it says what
 * each quality is written as and separates nothing.
 *
 * The qualities are pinned against the scale steps, independently, in
 * `__tests__/diatonicQualities.test.ts`.
 * =====================================================================
 */
const DIATONIC_QUALITY_CARDS: Flashcard[] = [
  { id: 'dq-maj-1', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In major, what quality is the 1 chord?",
    correctAnswer: "major 7 (maj7)",
    decoys: ["dominant 7 (7)", "minor 7 (m7)", "half-diminished (ø)"],
    explanation: "The I chord in a major key naturally lands on major 7 — it's the resting, settled 'home' color. When Stevie Wonder, Donny Hathaway, or PJ Morton sit on a Imaj7, you feel the key plainly.",
    skillTag: 'chord-quality-major-I' },
  { id: 'dq-maj-2', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In major, what quality is the 2 chord?",
    correctAnswer: "minor 7 (m7)",
    decoys: ["major 7 (maj7)", "half-diminished (ø)", "dominant 7 (7)"],
    explanation: "In major, the ii is minor 7 — the predominant that leans toward the V. It's the Dm7 in the key of C major, and it's the first chord of every 2-5-1 jazz and neo-soul players run a thousand times.",
    skillTag: 'chord-quality-major-ii' },
  { id: 'dq-maj-3', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In major, what quality is the 3 chord?",
    correctAnswer: "minor 7 (m7)",
    decoys: ["major 7 (maj7)", "half-diminished (ø)", "dominant 7 (7)"],
    explanation: "The iii chord is minor 7 in major keys — a mellow tonic substitute. When gospel and neo-soul players slide from Imaj7 to iii7 (Cmaj7 → Em7), they're coloring the tonic without really leaving home.",
    skillTag: 'chord-quality-major-iii' },
  { id: 'dq-maj-4', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In major, what quality is the 4 chord?",
    correctAnswer: "major 7 (maj7)",
    decoys: ["minor 7 (m7)", "dominant 7 (7)", "half-diminished (ø)"],
    explanation: "In major, the IV chord is also major 7 — two resting maj7 chords in the key, on the 1 and the 4. Plagal soul endings and hymn-style cadences live on this IVmaj7 → Imaj7 move.",
    skillTag: 'chord-quality-major-IV' },
  { id: 'dq-maj-5', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In major, what quality is the 5 chord?",
    correctAnswer: "dominant 7 (7)",
    decoys: ["major 7 (maj7)", "minor 7 (m7)", "half-diminished (ø)"],
    explanation: "The V chord is dominant 7 — the only chord in a major key that naturally wants to resolve home. The tritone inside the dom7 is the engine of every V → I resolution in every style, from gospel cadences to jazz turnarounds.",
    skillTag: 'chord-quality-major-V' },
  { id: 'dq-maj-6', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In major, what quality is the 6 chord?",
    correctAnswer: "minor 7 (m7)",
    decoys: ["major 7 (maj7)", "dominant 7 (7)", "half-diminished (ø)"],
    explanation: "The vi chord is minor 7 — the relative minor's home chord living inside a major key. The 1-5-6-4 pop/gospel progression leans on vi7 as its emotional center; it's where the song breathes inward before going back out.",
    skillTag: 'chord-quality-major-vi' },
  { id: 'dq-maj-7', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In major, what quality is the 7 chord?",
    correctAnswer: "half-diminished (ø)",
    decoys: ["minor 7 (m7)", "dominant 7 (7)", "diminished 7 (°7)"],
    explanation: "In major, the vii° is half-diminished 7 (m7b5) — Bm7b5 in the key of C major. Rarely played as its own chord; more often it's hiding inside a V9 voicing, supplying the tense leading-tone pull toward I.",
    skillTag: 'chord-quality-major-vii' },
  { id: 'dq-nm-1', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In natural minor, what quality is the 1 chord?",
    correctAnswer: "minor 7 (m7)",
    decoys: ["minor-major 7 (mMaj7)", "dominant 7 (7)", "major 7 (maj7)"],
    explanation: "In natural minor (pure Aeolian), the i chord is minor 7 — no raised 7th, no bright tension, just smooth and settled. D'Angelo, Erykah Badu, and Robert Glasper grooves often sit on a min7 tonic forever.",
    skillTag: 'chord-quality-natural-minor-i' },
  { id: 'dq-nm-2', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In natural minor, what quality is the 2 chord?",
    correctAnswer: "half-diminished (ø)",
    decoys: ["minor 7 (m7)", "dominant 7 (7)", "diminished 7 (°7)"],
    explanation: "the 2 half-diminished, borrowed into a major key; I Believe I Can Fly\n\nThe ii in natural minor is half-diminished (m7b5) — Bm7b5 in the key of A minor. It's the predominant chord in every minor-key 2-5-1 (Bm7b5 → E7 → Am7) — fundamental jazz and gospel turnaround vocabulary.",
    skillTag: 'chord-quality-natural-minor-ii' },
  { id: 'dq-nm-3', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In natural minor, what quality is the 3 chord?",
    correctAnswer: "major 7 (maj7)",
    decoys: ["minor 7 (m7)", "dominant 7 (7)", "half-diminished (ø)"],
    explanation: "In natural minor, the III chord is major 7 — it's literally the relative major's tonic. When a song in the key of A minor slides to Cmaj7, you're hearing the III major-7 color — the door into the brighter relative key.",
    skillTag: 'chord-quality-natural-minor-III' },
  { id: 'dq-nm-4', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In natural minor, what quality is the 4 chord?",
    correctAnswer: "minor 7 (m7)",
    decoys: ["dominant 7 (7)", "major 7 (maj7)", "half-diminished (ø)"],
    explanation: "the 4 minor, borrowed into a major key: the sad 4\n\nIn natural minor, the iv chord is minor 7 — the pure minor-key predominant. The same iv minor is also what major-key songs 'borrow' for that gospel/soul bittersweet lift (PJ Morton, Madison Ryan Ward live here).",
    skillTag: 'chord-quality-natural-minor-iv' },
  { id: 'dq-nm-5', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In natural minor, what quality is the 5 chord?",
    correctAnswer: "minor 7 (m7)",
    decoys: ["dominant 7 (7)", "major 7 (maj7)", "half-diminished (ø)"],
    explanation: "the minor 5: the soft minor vamp (Am to Em7), no dominant pull\n\nThe v chord in natural minor is minor 7 — no raised 7th means no dominant pull. Songs that use the minor v instead of V7 feel suspended and modal; you hear this in Dorian-leaning soul and Portuguese-flavored ballads.",
    skillTag: 'chord-quality-natural-minor-v' },
  { id: 'dq-nm-6', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In natural minor, what quality is the 6 chord?",
    correctAnswer: "major 7 (maj7)",
    decoys: ["minor 7 (m7)", "dominant 7 (7)", "half-diminished (ø)"],
    explanation: "In natural minor, the VI chord is major 7 — a bright, hopeful chord nestled inside a dark key. Gospel and soul songs in minor often lift into VImaj7 for the hook, then drop back to i for the verse.",
    skillTag: 'chord-quality-natural-minor-VI' },
  { id: 'dq-nm-7', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In natural minor, what quality is the 7 chord?",
    correctAnswer: "dominant 7 (7)",
    decoys: ["major 7 (maj7)", "minor 7 (m7)", "half-diminished (ø)"],
    explanation: "the ♭7, borrowed into a major key: the gospel push\n\nThe VII in natural minor is a dominant 7 on the flat-7 — the bVII you hear all over Mixolydian rock and gospel (F7 in the key of G minor). It doesn't resolve like a V7; it just sits, blue and broad.",
    skillTag: 'chord-quality-natural-minor-VII' },
  { id: 'dq-hm-1', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In harmonic minor, what quality is the 1 chord?",
    correctAnswer: "minor-major 7 (mMaj7)",
    decoys: ["minor 7 (m7)", "dominant 7 (7)", "major 7 (maj7)"],
    explanation: "In harmonic minor, the i chord is minor-major 7 — a minor triad with a raised 7th (the 'James Bond chord'). Tense and cinematic; rarely used as a sit-and-groove tonic, more for a single dramatic moment.",
    skillTag: 'chord-quality-harmonic-minor-i' },
  { id: 'dq-hm-2', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In harmonic minor, what quality is the 5 chord?",
    correctAnswer: "dominant 7 (7)",
    decoys: ["minor 7 (m7)", "major 7 (maj7)", "half-diminished (ø)"],
    explanation: "the major or dominant 5 in a minor key: minor with a real dominant\n\nHarmonic minor raises the 7th of the scale, turning the normally-minor v into V7 — and that's what gives minor keys their strong resolution. Without this raised-7 move, a minor-key cadence feels weak; every dramatic gospel and jazz minor ending uses it.",
    skillTag: 'chord-quality-harmonic-minor-V' },
  { id: 'dq-hm-3', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In harmonic minor, what quality is the 7 chord?",
    correctAnswer: "diminished 7 (°7)",
    decoys: ["half-diminished (ø)", "minor 7 (m7)", "dominant 7 (7)"],
    explanation: "the diminished 7 a half step under the root: the pass into the 1\n\nIn harmonic minor, the vii° is fully diminished 7 (not half-dim). It's a tense leading-tone chord that resolves straight to i — used in jazz turnarounds, gospel modulations, and as a passing chord between any two stable harmonies.",
    skillTag: 'chord-quality-harmonic-minor-vii' },
  { id: 'dq-hm-4', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In harmonic minor, what quality is the 3 chord?",
    correctAnswer: "augmented major 7 (+maj7)",
    decoys: ["major 7 (maj7)", "augmented 7 (+7)", "dominant 7 (7)"],
    explanation: "In harmonic minor, the III+ is augmented major 7 — sharp, unstable color. Rarely a standalone chord; you'll usually hear it as a passing sound in a descending bass line or a reharm move.",
    skillTag: 'chord-quality-harmonic-minor-III' },
  { id: 'dq-hm-6', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In harmonic minor, what quality is the 2 chord?",
    correctAnswer: "half-diminished (ø)",
    decoys: ["minor 7 (m7)", "dominant 7 (7)", "minor-major 7 (mMaj7)"],
    skillTag: 'chord-quality-harmonic-minor-ii' },
  { id: 'dq-hm-7', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In harmonic minor, what quality is the 4 chord?",
    correctAnswer: "minor 7 (m7)",
    decoys: ["minor-major 7 (mMaj7)", "dominant 7 (7)", "diminished 7 (°7)"],
    skillTag: 'chord-quality-harmonic-minor-iv' },
  { id: 'dq-hm-8', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In harmonic minor, what quality is the 6 chord?",
    correctAnswer: "major 7 (maj7)",
    decoys: ["augmented major 7 (+maj7)", "dominant 7 (7)", "minor 7 (m7)"],
    skillTag: 'chord-quality-harmonic-minor-VI' },
  { id: 'dq-mm-1', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In melodic minor, what quality is the 1 chord?",
    correctAnswer: "minor-major 7 (mMaj7)",
    decoys: ["minor 7 (m7)", "major 7 (maj7)", "augmented major 7 (+maj7)"],
    skillTag: 'chord-quality-melodic-minor-i' },
  { id: 'dq-mm-2', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In melodic minor, what quality is the 2 chord?",
    correctAnswer: "minor 7 (m7)",
    decoys: ["half-diminished (ø)", "dominant 7 (7)", "minor-major 7 (mMaj7)"],
    skillTag: 'chord-quality-melodic-minor-ii' },
  { id: 'dq-mm-3', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In melodic minor, what quality is the 3 chord?",
    correctAnswer: "augmented major 7 (+maj7)",
    decoys: ["major 7 (maj7)", "minor-major 7 (mMaj7)", "dominant 7 (7)"],
    skillTag: 'chord-quality-melodic-minor-III' },
  { id: 'dq-mm-4', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In melodic minor, what quality is the 4 chord?",
    correctAnswer: "dominant 7 (7)",
    decoys: ["major 7 (maj7)", "minor 7 (m7)", "augmented 7 (+7)"],
    explanation: "the major 4 in a minor key: the bright 4",
    skillTag: 'chord-quality-melodic-minor-IV' },
  { id: 'dq-mm-5', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In melodic minor, what quality is the 5 chord?",
    correctAnswer: "dominant 7 (7)",
    decoys: ["minor 7 (m7)", "major 7 (maj7)", "half-diminished (ø)"],
    skillTag: 'chord-quality-melodic-minor-V' },
  { id: 'dq-mm-6', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In melodic minor, what quality is the 6 chord?",
    correctAnswer: "half-diminished (ø)",
    decoys: ["minor 7 (m7)", "diminished 7 (°7)", "dominant 7 (7)"],
    skillTag: 'chord-quality-melodic-minor-vi' },
  { id: 'dq-mm-7', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "In melodic minor, what quality is the 7 chord?",
    correctAnswer: "half-diminished (ø)",
    decoys: ["diminished 7 (°7)", "minor 7 (m7)", "minor-major 7 (mMaj7)"],
    skillTag: 'chord-quality-melodic-minor-vii' },
  { id: 'dq-hm-5', category: 'diatonic-qualities', categoryName: CATEGORY_LABELS['diatonic-qualities'],
    question: "Moving the 5 chord from minor 7 to dominant 7 within a minor key means switching to _____",
    correctAnswer: "harmonic minor",
    // NOT MELODIC MINOR, which raises the 7 too and so was a second right
    // answer (Silas, 14 Sep 2026).
    decoys: ["natural minor", "Dorian", "Phrygian"],
    explanation: "Switching from minor v to dominant V inside a minor key means you've borrowed the raised 7th from harmonic minor — that's the move that makes the resolution strong. Every minor-key gospel cadence and jazz turnaround uses this.",
    skillTag: 'chord-quality-minor-modes' },
  // `dq-extra-1`, major's 4 as a triad, was retired on 14 Sep 2026: the
  // deck is seventh chords, and `dq-maj-4` asks the same chord. Its
  // history folded into `dq-maj-4` — `lib/migrations/retireDqExtra1.ts`.
];

/**
 * `fh-3` IS NOT IN HERE, AND THE RECORD OF IT IS GONE TOO.
 *
 * Eleven generated cadence cards folded into Progression Vocabulary's
 * 2-5-1 on 9 Sep 2026; `fh-3` was the hand-written one, in the key of
 * C major, and it asked exactly what `pr-prog-2-5-1-C` asks in
 * different words. The 2-5-1 lives once.
 *
 * A frozen copy of its text sat below this array so the fold-in could
 * prove which card it became. The fold-in has run on both devices and
 * went with the other movers on 10 Sep (restructure commit 9), so the
 * copy went with it.
 */
const FUNCTIONAL_HARMONY_CARDS: Flashcard[] = [
  { id: 'fh-1', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "The 5 chord most strongly resolves to _____",
    correctAnswer: "1",
    decoys: ["4", "6m", "3m"],
    explanation: "The 5 pulls to the 1. The final chord of a gospel cadence, a jazz turnaround or an R&B chorus gets its resolution from this one 5 → 1 move.",
    skillTag: 'resolution-V-to-I' },
  { id: 'fh-2', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "The leading tone (7th scale degree) resolves to _____",
    correctAnswer: "1",
    decoys: ["2", "5", "6"],
    explanation: "The leading tone, the 7, sits a half step below the 1 and wants to rise: ti → do. That half-step pull is the strongest melodic expectation in tonal music, and vocal runs and bass lines use it constantly.",
    skillTag: 'leading-tone-resolution' },
  { id: 'fh-4', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "The 4 → 1 move (the \"Amen\" cadence) is also called the _____",
    correctAnswer: "plagal cadence",
    decoys: ["authentic cadence", "half cadence", "deceptive cadence"],
    explanation: "The 4 → 1 move is the gospel Amen cadence: hymn endings, Kirk Franklin payoffs and worship-song resolutions land on it. Church musicians know it as the 4 back to the 1; classical theory books call the same move the plagal cadence.",
    skillTag: 'plagal-cadence' },
  { id: 'fh-5', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "The strongest \"going home\" cadence, 5 → 1, is also called the _____",
    correctAnswer: "authentic cadence",
    decoys: ["plagal cadence", "half cadence", "deceptive cadence"],
    explanation: "5 → 1 is the most decisive resolution in Western music, and it is how almost every song lands its final chord. Working musicians call it going home; theory textbooks call it the authentic cadence.",
    skillTag: 'authentic-cadence' },
  { id: 'fh-6', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "When the 5 goes to the 6m instead of the 1 (the \"fake-out\" resolution), the cadence is called _____",
    correctAnswer: "deceptive cadence",
    decoys: ["plagal cadence", "half cadence", "authentic cadence"],
    explanation: "When the 5 moves to the 6m instead of the 1, the ear is set up for home and gets the relative minor instead. Soul, gospel and R&B writers use it to stretch a bridge before landing for real. Theory calls it the deceptive cadence.",
    skillTag: 'deceptive-cadence' },
  { id: 'fh-7', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "A phrase that ends \"hanging\" on the 5 chord (waiting for resolution) uses a _____",
    correctAnswer: "half cadence",
    decoys: ["plagal cadence", "deceptive cadence", "authentic cadence"],
    explanation: "A phrase that ends on the 5 instead of resolving to the 1 is left waiting: that is the half cadence. Pop and R&B pre-choruses end on the 5 to set up the hook.",
    skillTag: 'half-cadence' },
  { id: 'fh-8', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "The tonic function is served by which chord(s)?",
    correctAnswer: "1 and 6m",
    decoys: ["2m and 4", "5 and 7°", "3m only"],
    explanation: "The 1 and the 6m are both home chords: they share two notes and do the same resting job. That is why 1 · 5 · 6m · 4 still feels grounded, with the 6m standing in for the 1.",
    skillTag: 'tonic-function' },
  { id: 'fh-9', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "The \"lead-up\" function (chords that set up the 5) is served by _____",
    correctAnswer: "2m and 4",
    decoys: ["1 and 6m", "5 and 7°", "3m and 5"],
    explanation: "The 2m and the 4 are the lead-up chords: they move away from home and set up the 5. The move from either one to the 5 is everywhere in gospel, soul and jazz; theory calls these chords predominant, or subdominant, function.",
    skillTag: 'predominant-function' },
  { id: 'fh-10', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "The dominant function (chords that pull back to the 1) is served by _____",
    correctAnswer: "5 and 7°",
    decoys: ["1 and 6m", "2m and 4", "3m and 6m"],
    explanation: "The 5 and the 7° both contain the leading tone, which pulls back to the 1. In practice you will almost always reach for the 5, or the 5 as a 7 chord, but knowing the 7° shares the job helps with reharm and substitution.",
    skillTag: 'dominant-function' },
  // `fh-11` (V/V in the key of C) AND `fh-12` (V/vi in the key of C) WERE
  // HERE. The generators skipped the key of C while these asked it; the
  // generated C cards now ask it word for word, and the practice moved
  // there on 14 Sep 2026.
  { id: 'fh-13', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "In jazz, the \"tritone substitution\" of G7 is _____",
    correctAnswer: "D♭7",
    decoys: ["C7", "F7", "B7"],
    explanation: "The tritone sub replaces the 5 chord's dominant 7 with the dominant 7 a tritone away. G7 and D♭7 share the same tritone, B and F, so both resolve to C. Robert Glasper and modern jazz pianists use it to add chromatic color to a 2 · 5 · 1.",
    skillTag: 'tritone-substitution' },
  { id: 'fh-14', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "The ♭7 chord in a major key is borrowed from _____",
    correctAnswer: "Mixolydian / parallel minor",
    decoys: ["Dorian / parallel major", "Lydian", "harmonic minor"],
    explanation: "The ♭7 chord is B♭ in the key of C major. It is borrowed from Mixolydian or the parallel minor, and rock, gospel and soul use it to lean bluesy without modulating. Stevie Wonder and Kirk Franklin use it constantly.",
    skillTag: 'borrowed-bVII' },
  { id: 'fh-15', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "The 4m chord in a major key is borrowed from _____",
    correctAnswer: "parallel minor",
    decoys: ["relative minor", "Lydian", "Phrygian"],
    explanation: "The 4m is the minor version of the 4, borrowed from the parallel minor key. Gospel, R&B and soul reach for it before resolving home; PJ Morton, Madison Ryan Ward and countless church bridges use it. Theory books call this modal interchange, or parallel minor borrowing.",
    skillTag: 'borrowed-iv-minor' },
  // `fh-16` (ending a minor-key song on a major 1) retired on 14 Sep 2026:
  // its answer was an adjective. Nothing else asks what it asked, so its
  // rows stay where they are for the orphan sweep to name.
  { id: 'fh-17', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "The Circle of 4ths moves each chord by _____",
    correctAnswer: "up a perfect 4th (down a 5th)",
    decoys: ["up a major 2nd (down a minor 7th)", "down a major 3rd (up a minor 6th)", "down a half step (up a major 7th)"],
    explanation: "The Circle of 4ths moves each root up a perfect 4th, which lands on the same note as down a 5th: G · C · F · B♭. It is the order the app drills keys in, and the way 2 · 5 · 1 moves.",
    skillTag: 'circle-of-fifths' },
  { id: 'fh-18', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: "In a 1 · 5 · 6m · 4 progression, swapping the plain 5 for a fuller version typically means using _____",
    correctAnswer: "the 5 as a 7 chord",
    decoys: ["the 6m", "the 3m", "the 2m"],
    explanation: "Swapping the plain 5 for the 5 as a 7 chord in 1 · 5 · 6m · 4 adds the dominant pull. It is almost always the move when you want the chord to push rather than sit.",
    skillTag: 'progression-substitution-V' },
  // `fh-19` (the 3m as tonic and dominant at once) retired on 14 Sep 2026:
  // two shared notes are true of several chords. Its rows stay, as
  // `fh-16`'s do.
];

/**
 * The hand-written key-signature cards, all of them — the ones the
 * generated sets replaced and the ones they did not.
 *
 * SPLIT BY ID BELOW RATHER THAN BY POSITION, because the two kinds are
 * interleaved here in teaching order and reordering the array to suit a
 * filter would be reordering a reader's list to suit a machine.
 */
const KEY_SIG_CARDS_ALL: Flashcard[] = [
  { id: 'ks-17', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The parallel minor of the key of D major is _____', correctAnswer: 'D minor',
    decoys: ['B minor', 'A minor', 'F minor'],
    explanation: "The key of D minor is the key of D major's parallel minor — same root, opposite quality. The parallel minor is where major-key songs 'borrow' chords from when they want to lean dark (iv minor, bVII, bVI all come from this borrowing).",
    skillTag: 'parallel-minor-of-D' },
  { id: 'ks-18', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The parallel minor of the key of F major is _____', correctAnswer: 'F minor',
    decoys: ['D minor', 'A minor', 'C minor'],
    explanation: "The key of F minor is the key of F major's parallel minor — same tonic, different quality. When a gospel song in the key of F major borrows an Ab or Bb minor chord, it's pulling from the key of F minor's palette without actually leaving the key.",
    skillTag: 'parallel-minor-of-F' },
  { id: 'ks-21', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The order of sharps in a key signature is _____', correctAnswer: 'F# C# G# D# A# E# B#',
    decoys: ['Bb Eb Ab Db Gb Cb Fb', 'F# G# A# B# C# D# E#', 'C# D# E# F# G# A# B#'],
    explanation: "Sharps always appear in this fixed order: F♯ C♯ G♯ D♯ A♯ E♯ B♯ (mnemonic: 'Father Charles Goes Down And Ends Battle'). A key with four sharps has the first four; a key with two has the first two. This is how you read any sharp key signature instantly without memorizing each one. Read the same sentence backwards and you have the order of flats.",
    skillTag: 'order-of-sharps' },
  { id: 'ks-22', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The order of flats in a key signature is _____', correctAnswer: 'Bb Eb Ab Db Gb Cb Fb',
    decoys: ['F# C# G# D# A# E# B#', 'Ab Bb Cb Db Eb Fb Gb', 'Eb Bb Ab Db Gb Cb Fb'],
    explanation: "Flats always appear in this order: B♭ E♭ A♭ D♭ G♭ C♭ F♭ — Battle Ends And Down Goes Charles' Father. That's the sharps mnemonic read backwards, because the two orders are exact reverses of each other. Learn one sentence and you have both. Quicker still: the first four spell BEAD, then G C F.",
    skillTag: 'order-of-flats' },

  // --- Scale construction (sc-* IDs) ---------------------------------
  // Natural-minor interval geometry + the full minor → relative-major
  // mapping that the S&P scale mini-track leans on. ks-13/14/15 cover
  // the MAJOR → minor direction; these cards cover MINOR → major and
  // round out the parallel-vs-relative distinction.
  { id: 'ksc-1', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'What are the intervals of the natural minor scale?',
    correctAnswer: '1, 2, b3, 4, 5, b6, b7',
    decoys: ['1, b2, b3, 4, 5, b6, b7', '1, 2, 3, 4, 5, 6, b7', '1, 2, b3, 4, b5, b6, b7'],
    explanation: "Natural minor (Aeolian) flats the 3rd, 6th, and 7th of the major scale — everything else stays. That b3/b6/b7 triple is the dark-but-stable color you hear in every D'Angelo groove and gospel ballad that never wants to brighten up.",
    skillTag: 'natural-minor-intervals' },
  { id: 'ksc-2', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'Natural minor differs from major by which altered notes?',
    correctAnswer: 'b3, b6, and b7',
    decoys: ['b3 and b7 only', 'b2, b3, and b6', 'b3, 4, and b7'],
    explanation: "Three flattened notes — b3, b6, b7 — flip a major scale into its parallel natural minor. The b3 is the headline (minor third), the b7 kills the leading tone, the b6 darkens the upper tetrachord. All three together is what makes natural minor feel settled instead of yearning.",
    skillTag: 'natural-minor-vs-major' },
  { id: 'ksc-15', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'To find the relative major of any minor key, go ___ half steps up from the minor root',
    correctAnswer: '3 half steps up (a minor third)',
    decoys: ['4 half steps up (a major third)', '5 half steps up (a perfect fourth)', '2 half steps up (a whole tone)'],
    explanation: "Minor + 3 half steps = its relative major. C minor + 3 = Eb. A minor + 3 = C. This single shortcut beats memorizing all 12 pairs — once you internalize the minor-3rd jump, every relative-pair question collapses to the same move.",
    skillTag: 'relative-major-formula' },
  { id: 'ksc-16', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'Parallel minor vs relative minor — what is the difference?',
    correctAnswer: 'Parallel minor shares the same root. Relative minor shares the same notes',
    decoys: [
      'Parallel minor shares the same notes; relative minor shares the same root',
      'Parallel and relative minor are the same thing',
      'Parallel minor is a whole step down; relative minor is a minor 3rd up',
    ],
    explanation: "Two different ways a minor key can relate to a major key. Parallel = same tonic, opposite quality (C major ↔ C minor) — used for chord borrowing inside one key center. Relative = same key signature, different tonic (C major ↔ A minor) — used for pivoting between bright and dark sections without changing the notes.",
    skillTag: 'parallel-vs-relative-minor' },
  { id: 'ksc-17', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The parallel minor of the key of G major is _____',
    correctAnswer: 'G minor',
    decoys: ['E minor', 'C minor', 'D minor'],
    explanation: "Parallel minor = same root, flipped quality. The key of G major's parallel minor is the key of G minor (one flat → two flats). When a song in the key of G major borrows a Bb chord or a Cm, it's reaching into the key of G minor's palette without leaving the G tonic.",
    skillTag: 'parallel-minor-of-G' },
  { id: 'ksc-18', category: 'key-signatures', categoryName: CATEGORY_LABELS['key-signatures'],
    question: 'The parallel minor of the key of Bb major is _____',
    correctAnswer: 'Bb minor',
    decoys: ['G minor', 'D minor', 'F minor'],
    explanation: "The key of Bb major's parallel minor is the key of Bb minor — same root, flipped quality (two flats → five flats). Common borrowed chords from this side: Db (bIII), Eb (iv when treated as minor), Gb (bVI) — the gospel/soul flavors that make a tune in the key of Bb major feel briefly heavy.",
    skillTag: 'parallel-minor-of-Bb' },
];


/**
 * What stays hand-written: the parallel-minor cards, the order of
 * sharps and flats, the natural-minor formula, the "3 half steps up"
 * rule and the parallel-vs-relative definition. Silas has not ruled on
 * these, so they are exactly as they were.
 */
const KEY_SIG_CARDS: Flashcard[] = KEY_SIG_CARDS_ALL;

const MODE_CARDS: Flashcard[] = [
  // `mo-1` TO `mo-6` WERE HERE: "Dorian mode starts on which scale
  // degree?" and its five siblings. The generated "the mode of the key of
  // C major starting on D" cards ask the same thing in every key, so they
  // retired on 14 Sep 2026 and their practice moved onto the key of C's
  // card for that degree. See `lib/migrations/hfDeckCleanup.ts`.
  { id: 'mo-7', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Mixolydian mode's signature altered note is _____",
    correctAnswer: "♭7",
    decoys: ["♯4", "♭3", "♭6"],
    explanation: "Mixolydian's signature note is the ♭7: it is a major scale with a flattened 7th. That ♭7 is what you hear in gospel, rock and R&B whenever the tonic chord is a dominant 7 that just sits there, never resolving.",
    skillTag: 'mode-mixolydian-signature' },
  { id: 'mo-8', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Lydian mode's signature altered note is _____",
    correctAnswer: "♯4",
    decoys: ["♭7", "♭3", "♯5"],
    explanation: "Lydian's signature note is the ♯4: a major scale with a raised 4th. You hear it in Tom Misch, Robert Glasper and Disney and Pixar scores.",
    skillTag: 'mode-lydian-signature' },
  { id: 'mo-9', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Dorian mode's signature altered note is _____",
    correctAnswer: "natural 6",
    decoys: ["♭2", "♭7 only", "♯4"],
    explanation: "Dorian is minor with a raised (natural) 6th. Over a minor tonic, that 6 is what separates Dorian from natural minor. It is the signature of D'Angelo grooves, modal jazz and minor vamps that stay on one chord.",
    skillTag: 'mode-dorian-signature' },
  { id: 'mo-10', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Phrygian mode's signature altered note is _____",
    correctAnswer: "♭2",
    decoys: ["♭3", "♭6", "♯4"],
    explanation: "Phrygian's signature is the ♭2, the half step right above the tonic. Played over a minor tonic, it gives the mode its Spanish and Middle-Eastern flavor.",
    skillTag: 'mode-phrygian-signature' },
  // `mo-11`, `mo-12` AND `mo-13` WERE HERE — the hand-written C mode
  // cards. Ruling 42 generates every key including C, so they asked
  // the identical question with the identical answer as
  // `mo-mode-C-6`, `mo-mode-C-2` and `mo-mode-C-5`. Their practice
  // moved onto those; see `modeFoldIn.ts`, which holds the proof.
  { id: 'mo-14', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "The signature chord that says 'Dorian' is _____",
    correctAnswer: "1m7 with a major 4",
    decoys: ["5m7 with a major 1", "3m with a major 4", "2m7♭5"],
    explanation: "The Dorian sound is a minor tonic with a major 4: Dm7 · G7 · Dm7 · G7. That major 4, where natural minor has a 4m, is the signature. Sit on the two-chord vamp and you are in 'So What' and D'Angelo territory.",
    skillTag: 'mode-dorian-chord' },
  { id: 'mo-15', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "The signature chord that says 'Lydian' is _____",
    correctAnswer: "the 1 as a maj7♯11 chord",
    decoys: ["the 1 as a 7 chord", "the 1 as a maj7 chord", "the 1 as an mMaj7 chord"],
    explanation: "The Lydian chord is a major 7 on the 1 with a raised 4 on top: maj7♯11. That ♯11 is the Lydian note; PJ Morton, Tom Misch and gospel arrangers stack it on the 1 or the 4.",
    skillTag: 'mode-lydian-chord' },
  { id: 'mo-16', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "The signature chord that says 'Mixolydian' is _____",
    correctAnswer: "the 1 as a 7 chord",
    decoys: ["the 1 as a maj7 chord", "the 1 as a maj7♯11 chord", "the 1 as an m7 chord"],
    explanation: "Mixolydian is signaled by a dominant 7 on the tonic that doesn't resolve: a G7 that stays put instead of going to C. Funk and gospel vamps, blues-rock riffs and Stevie Wonder verses that groove on a 7 chord live here.",
    skillTag: 'mode-mixolydian-chord' },
  { id: 'mo-17', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Harmonic minor differs from natural minor by _____",
    correctAnswer: "a raised 7th",
    decoys: ["a raised 6th", "a raised 4th", "a lowered 2nd"],
    explanation: "Harmonic minor raises the 7th of natural minor, and that is the only difference. The raised 7 turns the 5m into a dominant 7, which gives a minor key its strong resolution back to the 1m.",
    skillTag: 'harmonic-minor-difference' },
  { id: 'mo-18', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Melodic minor (ascending) differs from natural minor by _____",
    correctAnswer: "raised 6th and 7th",
    decoys: ["raised 7th only", "raised 6th only", "lowered 2nd and 7th"],
    explanation: "Melodic minor (ascending) raises both the 6th and the 7th of natural minor, so going up it is one note away from major. Classical tradition reverts to natural minor on the way down; jazz keeps the raised notes both ways.",
    skillTag: 'melodic-minor-difference' },
  { id: 'mo-20', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Ionian mode is the same as _____",
    correctAnswer: "major scale",
    decoys: ["natural minor", "melodic minor", "pentatonic"],
    explanation: "Ionian is another name for the plain major scale, and the mode all the others are measured against.",
    skillTag: 'mode-ionian-equivalent' },
];

// Pentatonic-scales — major + minor pent intervals, what's removed
// from the parent scale, and the relative-pent relationship that
// makes C major pent and A minor pent the same 5 notes. The
// "musical starting points" cards (pent-3 / pent-4 / pent-7 in the
// original spec) were dropped — they're performance heuristics, not
// theory facts. ID numbering keeps the original gaps (1, 2, 5, 6,
// 8, 9, 10) for traceability against the spec.
const CHORD_CONSTRUCTION_CARDS: Flashcard[] = [
  { id: 'cc-1', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: "A major 7 chord stacks these intervals from root",
    correctAnswer: "major 3rd + minor 3rd + major 3rd",
    decoys: ["major 3rd + minor 3rd + minor 3rd", "minor 3rd + major 3rd + major 3rd", "major 3rd + major 3rd + minor 3rd"],
    explanation: "A maj7 stacks a major 3rd, a minor 3rd and a major 3rd: 1 3 5 7. Cmaj7 is C E G B. It is the resting 1 chord in R&B and jazz.",
    skillTag: 'chord-construction-maj7' },
  { id: 'cc-2', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: "A dominant 7 chord stacks these intervals from root",
    correctAnswer: "major 3rd + minor 3rd + minor 3rd",
    decoys: ["major 3rd + minor 3rd + major 3rd", "minor 3rd + minor 3rd + minor 3rd", "major 3rd + major 3rd + major 3rd"],
    explanation: "A dominant 7 stacks a major 3rd, a minor 3rd and a minor 3rd: 1 3 5 ♭7. C7 is C E G B♭. The ♭7 is what makes it lean: the 5 as a 7 chord pulls to the 1, and the 1 as a 7 chord (Mixolydian) sits and grooves.",
    skillTag: 'chord-construction-dom7' },
  { id: 'cc-3', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: "A minor 7 chord stacks these intervals from root",
    correctAnswer: "minor 3rd + major 3rd + minor 3rd",
    decoys: ["major 3rd + minor 3rd + major 3rd", "minor 3rd + minor 3rd + major 3rd", "major 3rd + minor 3rd + minor 3rd"],
    explanation: "A minor 7 stacks a minor 3rd, a major 3rd and a minor 3rd: 1 ♭3 5 ♭7. Cm7 is C E♭ G B♭. It is the default minor chord in neo-soul, jazz and gospel: every Dm7 or Em7 you hear in a vamp.",
    skillTag: 'chord-construction-min7' },
  { id: 'cc-4', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: "A diminished 7 chord stacks these intervals from root",
    correctAnswer: "minor 3rd + minor 3rd + minor 3rd",
    decoys: ["minor 3rd + minor 3rd + major 3rd", "major 3rd + minor 3rd + minor 3rd", "minor 3rd + major 3rd + minor 3rd"],
    explanation: "A diminished 7 stacks three minor 3rds in a row, every interval the same. It has no single tonal center, so jazz and gospel use it as a passing chord between two more stable ones.",
    skillTag: 'chord-construction-dim7' },
  // `cc-5`, `cc-6`, `cc-7`, `cc-10`, `cc-11`, `cc-14`, `cc-15` AND `cc-17`
  // WERE HERE: "Cmaj7 contains the notes _____" and its siblings, in the key
  // of C only. Spell the chord in a key (`spellChordCards.ts`) asks it in
  // every key on the keyboard; cc-5, cc-6, cc-7 and cc-14 folded into its key
  // of C cards, and the four that are not diatonic sevenths retired with
  // their rows deleted (Silas, 14 Sep 2026). See `hfDeckCleanup.ts`.
  { id: 'cc-8', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: "Bm7♭5 is also called _____",
    correctAnswer: "half-diminished (ø)",
    decoys: ["diminished 7 (°7)", "minor-major 7 (mMaj7)", "dominant 7 (7)"],
    explanation: "Bm7♭5 (B D F A) is a minor 7 with a flattened 5th, the same chord as half-diminished (ø). It is the 2 of every minor-key 2 · 5 · 1: Bm7♭5 · E7 · Am.",
    skillTag: 'chord-name-m7b5' },
  { id: 'cc-9', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: "A dominant 7♯9 chord contains which altered tone?",
    correctAnswer: "raised 9",
    decoys: ["flat 9", "sharp 11", "flat 13"],
    explanation: "A 7♯9 stacks a raised 9, an augmented 2nd above the root, on top of a dominant 7. It is the Hendrix chord: C7♯9 is C E G B♭ D♯. The ♯9 is the same key as the minor 3rd, so it sounds against the chord's major 3rd; you hear it in Hendrix, Stevie Wonder and gospel cadences.",
    skillTag: 'chord-construction-7-sharp-9' },
  { id: 'cc-12', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: "A sus2 chord replaces the 3rd with _____",
    correctAnswer: "the 2nd",
    decoys: ["the 4th", "the 6th", "the flat 3rd"],
    explanation: "A sus2 swaps the 3rd for the 2nd: Csus2 is C D G instead of C E G. With no 3rd it is neither major nor minor; common in indie arrangements and Daniel Caesar-style guitar voicings.",
    skillTag: 'chord-construction-sus2' },
  { id: 'cc-13', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: "A sus4 chord replaces the 3rd with _____",
    correctAnswer: "the 4th",
    decoys: ["the 2nd", "the 6th", "the 7th"],
    explanation: "A sus4 swaps the 3rd for the 4th: Csus4 is C F G. It is the held sound before a resolution, and gospel cadences lean on exactly this move: 5(7sus4) → 5(7) → 1.",
    skillTag: 'chord-construction-sus4' },
  { id: 'cc-16', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: "The tritone interval inside a dom7 chord is between _____",
    correctAnswer: "the 3rd and the ♭7",
    decoys: ["the root and the 5", "the 5 and the ♭7", "the root and the ♭7"],
    explanation: "The tritone inside a dominant 7 lies between the 3rd and the ♭7: in G7, B and F. It is what pulls the 5 chord back to the 1, and why tritone substitutions work: G7 and D♭7 share the same tritone.",
    skillTag: 'dom7-tritone' },
  { id: 'cc-18', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: "Which chord has no perfect 5th?",
    correctAnswer: "diminished 7",
    // NOT HALF-DIMINISHED 7, which has no perfect 5th either and so was
    // a second right answer (14 Sep 2026).
    decoys: ["dominant 7", "major 7", "minor 7"],
    explanation: "The diminished 7 chord has no perfect 5th: its 5th is flattened. It is built entirely from stacked minor 3rds, which is why it is used as a passing chord rather than a resting one.",
    skillTag: 'chord-no-perfect-5th' },
  { id: 'cc-19', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: "An augmented triad stacks _____",
    correctAnswer: "two major 3rds",
    decoys: ["two minor 3rds", "major then minor 3rd", "minor then major 3rd"],
    explanation: "An augmented triad stacks two major 3rds: C E G♯. The raised 5th leaves it unresolved; it appears in transitions, and as an altered 5 chord (5+) before resolving in minor keys.",
    skillTag: 'chord-construction-augmented' },
  { id: 'cc-20', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: "A diminished triad stacks _____",
    correctAnswer: "two minor 3rds",
    decoys: ["two major 3rds", "major then minor 3rd", "minor then major 3rd"],
    explanation: "A diminished triad stacks two minor 3rds: C E♭ G♭. The ♭5 makes it unstable; as the 7° chord it pulls to the 1, and it shows up more often as part of a diminished 7 passing move.",
    skillTag: 'chord-construction-diminished' },
];

/**
 * =====================================================================
 * FOUR CARDS ARE NOT IN THIS ARRAY ANY MORE, AND THAT IS THE POINT.
 *
 * A progression is in every key or it is not in the deck. One card in
 * one key teaches a shape in the one place a reader least needs it and
 * reads as coverage the family does not have.
 *
 * FOUR MORE WENT ON 9 SEP, WITH THE GENERATED SETS THEY FOLDED INTO.
 * A progression Silas has no reference for yet does not earn thirteen
 * cards: `pr-5`'s gospel walk-up, `pr-6`'s rhythm changes and `pr-10`'s
 * neo-soul cycle. `pr-4`'s 6-4-1-5 went for a different reason — it is
 * the 1-5-6-4 loop started in a different place, and `pr-9` teaches
 * that rotation as a fact on its own.
 *
 * THEIR HISTORY IS IN TWO PLACES AND BOTH ARE AUTHORISED. Commit 8
 * moved each one's rows onto its generated twin, so a device that has
 * run that migration holds them at `pr-prog-gospel-walk-up-C` and a
 * device that has not still holds them at `pr-5`. Every id from both
 * sides is in `REMOVED_WITHOUT_SUCCESSOR`.
 *
 * `pr-13` WAS THE BOSSA TURNAROUND, I-VI-ii-V in F with the VI played
 * as a secondary dominant. It is the dominant-6 variation of the
 * 1-6-2-5, which is generated in thirteen keys — so it will live as a
 * VARIATION on that card rather than as a progression of its own, and
 * a one-key card holding its place until then is the thing this rule
 * removes.
 *
 * `pr-11` was the descending minor i-♭VII-♭VI-V in A MINOR, and the
 * thirteen keys are a major-key vocabulary — read as minor tonics they
 * would name D♭ minor and G♭ minor. `pr-14` was the Dorian vamp, in a
 * MODE rather than a key, and this family has no modal vocabulary at
 * all. `pr-15` was 4-1-5-6, a rotation of the 1-5-6-4 that is in every
 * key. `pr-20` was 1-♭7-4, in C.
 *
 * DELETED RATHER THAN FILTERED OUT. Nothing reads their text: no
 * generated card asks what they asked, so there is nothing for a
 * fold-in to compare them against, and a retired card kept for a
 * comparison nobody makes is dead weight. Their ids are in
 * `REMOVED_WITHOUT_SUCCESSOR`, which is what deletes their history.
 *
 * THE PLAGAL VAMP `pr-8` NAMES NO KEY AND IS THE EXCEPTION THAT STAYS.
 * =====================================================================
 */
const PROGRESSION_CARDS_ALL: Flashcard[] = [
  { id: 'pr-8', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'A plagal vamp is which two chords alternating?',
    correctAnswer: 'IV - I',
    decoys: ['V - I', 'ii - V', 'vi - IV'],
    explanation: "A plagal vamp cycles IV and I — the gospel 'Amen' move stretched into a whole section. Worship music, gospel altar calls, and soul outros sit on this two-chord cycle for minutes at a time, building intensity before the climax.",
    skillTag: 'progression-plagal-vamp' },
  { id: 'pr-9', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The 1-5-6-4 and 6-4-1-5 progressions use the same chords; what changes?',
    correctAnswer: 'The starting point',
    decoys: ['The chord qualities', 'The key', 'The duration of each chord'],
    explanation: "1-5-6-4 and 6-4-1-5 use the same four chords — a rotation, just started at different points. That's why you hear these progressions in thousands of songs but they feel different: the starting point (and which chord becomes the emotional 'home' base) changes the whole mood.",
    skillTag: 'progression-rotation-concept' },
  { id: 'pr-12', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'In the 12-bar blues, bars 5-6 typically go to which chord?',
    correctAnswer: 'IV7',
    decoys: ['ii7', 'V7', 'vi'],
    explanation: "In the 12-bar blues form, bars 5 and 6 land on IV7 — the 'second chord' of the blues structure. This move is what turns a generic rock/pop tune into a proper blues: the IV appears right on schedule every time, and your ear knows.",
    skillTag: 'progression-12-bar-blues-structure' },
  { id: 'pr-16', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'A tonic-pedal progression keeps which note in the bass?',
    correctAnswer: 'the 1 (tonic)',
    decoys: ['the 5 (dominant)', 'the 3', 'the 7'],
    explanation: "A tonic-pedal progression holds the 1 in the bass while chords move above it. Keeps the song feeling grounded even as harmony shifts — a staple of soul grooves, gospel bridges, and any song that wants to feel anchored while the top moves around.",
    skillTag: 'progression-tonic-pedal' },
  { id: 'pr-17', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'A dominant pedal progression keeps which note in the bass?',
    correctAnswer: 'the 5',
    decoys: ['the 1', 'the 3', 'the 6'],
    explanation: "A dominant pedal holds the 5 in the bass — and since the 5 wants to resolve to 1, the whole thing creates building tension. Common in gospel buildups and jazz intros where the song sits on the V, waiting and waiting before finally dropping home.",
    skillTag: 'progression-dominant-pedal' },
  { id: 'pr-19', category: 'progressions', categoryName: CATEGORY_LABELS.progressions,
    question: 'The Coltrane changes cycle through how many key centers?',
    correctAnswer: 'three (a major 3rd apart)',
    decoys: ['two (a tritone apart)', 'four (a minor 3rd apart)', 'six (a whole step apart)'],
    explanation: "Coltrane changes cycle through three key centers a major 3rd apart (e.g., B → G → Eb → back to B). The 'Giant Steps' shape — hard to improvise over, but the underlying logic is simple: three tonics dividing the octave equally.",
    skillTag: 'progression-coltrane-cycle' },
];


const PROGRESSION_CARDS: Flashcard[] = PROGRESSION_CARDS_ALL;

const SLASH_CHORD_CARDS: Flashcard[] = [
  { id: 'sc-1', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'C/E is in which inversion?', correctAnswer: '1st inversion',
    decoys: ['root position', '2nd inversion', '3rd inversion'],
    explanation: "C/E means a C chord with E (the 3rd) in the bass — that's 1st inversion. Slash chords are how you notate inversions without writing out the full voicing; the symbol after the slash is just the bass note.",
    skillTag: 'slash-inversion-C-E' },
  { id: 'sc-2', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'C/G is in which inversion?', correctAnswer: '2nd inversion',
    decoys: ['root position', '1st inversion', '3rd inversion'],
    explanation: "C/G is a C chord with G (the 5th) in the bass — 2nd inversion. Used for smoother bass motion, especially when the bass is descending or ascending step-wise through a progression.",
    skillTag: 'slash-inversion-C-G' },
  { id: 'sc-3', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'Cmaj7/B is in which inversion?', correctAnswer: '3rd inversion',
    decoys: ['root position', '1st inversion', '2nd inversion'],
    explanation: "Cmaj7/B has B (the major 7th) in the bass — 3rd inversion. The half-step between the bass B and the root C creates a moody tension — pianists use this voicing in R&B and jazz ballads for that close, intimate sound.",
    skillTag: 'slash-inversion-Cmaj7-B' },
  { id: 'sc-4', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'G/B in the key of C major functions as _____',
    correctAnswer: 'V with its 3rd in the bass',
    decoys: ['V with its 5th in the bass', 'iii with its root in the bass', 'vii° with its root in the bass'],
    explanation: "G/B in the key of C major puts the leading tone (B) in the bass underneath the V chord — and that B pulls right up to C on the next chord. Classic descending-bass device used in countless gospel and soul ballads: I → V/B → vi (C → G/B → Am). In Nashville numbers, that's 5/7.",
    skillTag: 'slash-function-G-B-in-C' },
  { id: 'sc-5', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'A 2nd inversion triad has which note in the bass?',
    correctAnswer: 'the 5th of the chord',
    decoys: ['the root of the chord', 'the 3rd of the chord', 'the 7th of the chord'],
    explanation: "A 2nd-inversion triad puts its 5th in the bass — like C/G. This bass note is less stable than the root, so 2nd inversion is mostly used for passing moments or specific voice-leading needs (ascending bass through a progression, for example). In Nashville numbers, a 1-chord 2nd inversion is written 1/5.",
    skillTag: 'inversion-2nd-bass-note' },
  { id: 'sc-6', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'A 1st inversion triad has which note in the bass?',
    correctAnswer: 'the 3rd of the chord',
    decoys: ['the root of the chord', 'the 5th of the chord', 'the 6th of the chord'],
    explanation: "A 1st-inversion triad puts its 3rd in the bass — like C/E. Gentler than root position, used widely in R&B and gospel for smooth step-wise bass motion. Hymn writers and church pianists rely on it heavily. In Nashville numbers, a 1-chord 1st inversion is written 1/3.",
    skillTag: 'inversion-1st-bass-note' },
  { id: 'sc-7', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'F/G in the key of C major is most often used as _____',
    correctAnswer: 'a V7sus4 substitute',
    decoys: ['a IV inversion', 'a bII chord', 'a secondary dominant'],
    explanation: "F/G in C is a classic V7sus4 substitute — G in the bass, F-A-C on top gives you the G7sus sound without the 3rd. Widely used in neo-soul, gospel, and modern R&B for a suspended, 'held' feel before resolution to the I. Chord-tone view: G isn't a tone of F (F-A-C), so this is a hybrid/slash chord, not an inversion.",
    skillTag: 'slash-function-F-G' },
  // `sc-8`, `sc-9` AND `sc-10` WERE HERE — the hand-written C cards for
  // 1/3, 5/7 and 4/5. Ruling 37 folded them into the generator, which
  // covers C for every shape now. They asked the identical question
  // with the identical answer and carried no `axis`, so the Slash Chord
  // filter could not see them and they had no sound; their practice
  // moved onto the generated cards. See `slashCFoldIn.ts`, which holds
  // the proof.
  { id: 'sc-12', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'The descending bass line 1 - 5/7 - 6 - 1/3 moves the bass by _____',
    correctAnswer: 'step',
    decoys: ['leap', 'a 5th each step', 'a 3rd each step'],
    explanation: "1 → 7 → 6 → 3 is a smooth, mostly-stepwise descending bass line. This kind of bass motion is one of the most common devices in gospel, soul, and ballad writing — the smoother the bass walks, the more connected the harmony feels above it.",
    skillTag: 'slash-descending-bass-motion' },
  { id: 'sc-13', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'A pedal-tone progression using slash chords over a single bass note is called a _____',
    correctAnswer: 'pedal point / slash-chord pedal',
    decoys: ['walking bass', 'chromatic bass', 'oblique motion'],
    explanation: "A pedal-tone progression keeps the same bass note while chords change above it — often written as a chain of slash chords (C/G, F/G, G — all with G in the bass). Creates suspense and builds tension; used heavily in gospel buildups, cinematic intros, and worship music transitions.",
    skillTag: 'slash-pedal-point' },
  { id: 'sc-14', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'A slash chord X/Y where Y is NOT a chord tone is sometimes called _____',
    correctAnswer: 'a polychord or hybrid chord',
    decoys: ['an inversion', 'a secondary dominant', 'an altered chord'],
    explanation: "When the bass note isn't part of the chord above it (like F/G — F major over G bass), you've left inversion territory and entered polychord/hybrid chord territory. This is how modern jazz and neo-soul players get those rich, stacked sounds that aren't quite one chord and aren't quite two.",
    skillTag: 'slash-non-chord-tone' },
  { id: 'sc-15', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'The main purpose of using slash chords is to _____',
    correctAnswer: 'control bass movement',
    decoys: ['change chord quality', 'add tension', 'modulate to a new key'],
    explanation: "The main reason to write slash chords is to control the bass line — making it step-wise or melodic instead of leaping around with each chord change. Good bass voice leading is what separates a competent arrangement from a great one; gospel and soul arrangers obsess over it.",
    skillTag: 'slash-purpose-voice-leading' },
  { id: 'sc-16', category: 'slash-chords', categoryName: CATEGORY_LABELS['slash-chords'],
    question: 'The V chord in first inversion has which chord tone in the bass?',
    correctAnswer: 'its 3rd',
    decoys: ['its 5th', 'its 7th', 'its root'],
    explanation: "First inversion always puts its 3rd in the bass. For the V chord the 3rd is the leading tone — in the key of C major that's B under a G chord = G/B (Nashville: 5/7), and that leading-tone bass pulls up a half step to 1. This is the chord-tone twin of the 5/7 card.",
    skillTag: 'inversion-V-first-bass-tone' },
];

// `EAR_THEORY_CARDS` WAS HERE. Ear-Theory Crossover retired on 14 Sep 2026
// (Silas, 13 Sep): every card described a sound in adjectives and asked
// for the label, with nothing to hear. Ten of the fifteen asked a fact
// another deck asks and their history moved onto that card; see
// `lib/migrations/hfDeckCleanup.ts`.

// --- Combine all -----------------------------------------------------

// --- Tritone pairs + enharmonic equivalents (Foundational / Math) ---

/** Chromatic semitone for any common note spelling, including the
 *  double-edge enharmonics (Cb, B#, E#, Fb). */
const NOTE_SEMITONE: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4,
  'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10,
  B: 11, Cb: 11,
};

/** Near-miss note decoys around `correct`'s pitch (±1, ±2 semitones), in
 *  sharp spelling, excluding the correct note. Never the correct pitch,
 *  so no decoy is a hidden enharmonic of the answer. */
function noteDecoys(correct: string, count = 3): string[] {
  const sem = NOTE_SEMITONE[correct] ?? 0;
  // Spell the decoys the way the ANSWER is spelled. Building them from
  // the sharp table unconditionally made every flat answer the only
  // flat on screen — pick the odd one out and you are right without
  // knowing any theory. See __tests__/noteDecoys.test.ts.
  const useFlats = /[b♭]/.test(correct.slice(1));

  // Matching the family is not enough on its own: only five of twelve
  // names carry an accidental, and a black key's immediate neighbours
  // are mostly white ones — so ±1/±2 around F# yields F, G, E, G#, and
  // dropping G# leaves F# the only sharp again. Take the nearest
  // same-shape decoy FIRST, then fill outward from the neighbours, so
  // at least one option always looks like the answer.
  const answerHasAccidental = /[b#♭♯]/.test(correct.slice(1));
  const byDistance = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6]
    .map(d => sem + d)
    .filter(x => (((x % 12) + 12) % 12) !== (((sem % 12) + 12) % 12));
  const spelled = byDistance.map(x => noteAt(x, useFlats));
  const sameShape = spelled.filter(
    n => /[b#♭♯]/.test(n.slice(1)) === answerHasAccidental,
  );
  const pool = sameShape.length > 0
    ? [sameShape[0], ...spelled]
    : spelled;
  return makeDecoys(pool, correct, count);
}

/**
 * The enharmonic note pairs, at module scope so the axis order can
 * read them.
 *
 * MOVED OUT OF THE GENERATOR RATHER THAN COPIED BESIDE THE GRID. A
 * second list of the same spellings is how a grid comes to show a
 * column no card can land in.
 */
export const ENHARMONIC_NOTE_PAIRS: ReadonlyArray<[string, string, string]> = [
    ['Ab', 'G#', 'Ab in flat keys (Eb/Ab/Db major); G# in sharp keys (A/E/B major).'],
    ['Bb', 'A#', 'Bb in flat keys; A# only in sharp keys (B / F# major).'],
    ['Db', 'C#', 'Db in flat keys (Ab/Db/Gb); C# in sharp keys (D/A/E major).'],
    ['Eb', 'D#', 'Eb in flat keys; D# in sharp keys (E / B major).'],
    ['Gb', 'F#', 'Gb in flat keys (Db/Gb); F# in sharp keys (G/D/A major).'],
    ['B#', 'C', 'B# is C re-spelled: the leading tone of C# major / raised numbers.'],
    ['Cb', 'B', 'Cb is B re-spelled: the 4th of the key of Gb major and other flat-key contexts.'],
    ['E#', 'F', 'E# is F re-spelled: the 3rd of C# major / raised numbers.'],
    ['Fb', 'E', 'Fb is E re-spelled: appears in heavily-flat keys and lowered numbers.'],
];

/** The enharmonic degree groups, at module scope for the same
 *  reason as the note pairs above. */
export const ENHARMONIC_INTERVAL_GROUPS:
  ReadonlyArray<{ members: readonly string[]; context: string }> = [
    { members: ['2', '9'], context: 'Same pitch an octave apart: "2" in sus/add voicings, "9" in extended (9th / 13th) chords.' },
    { members: ['b2', 'b9'], context: 'b2 for a Phrygian / sus flavour; b9 as the altered-dominant tension. Same pitch, different role.' },
    { members: ['#2', 'b3', '#9'], context: 'All the minor-third pitch: b3 as the chord’s third, #2 as a raised-2nd passing tone, #9 as the "Hendrix" altered-dominant tension. Context decides the spelling.' },
    { members: ['4', '11'], context: 'Same pitch an octave apart: "4" in sus/add voicings, "11" in extended chords.' },
    { members: ['#4', 'b5', '#11'], context: 'The tritone: #4 (Lydian, raising the 4th), b5 (altered dominant / half-diminished, lowering the 5th), #11 (the extended-chord name). Context decides the spelling.' },
    { members: ['6', '13'], context: 'Same pitch an octave apart: "6" in sixth chords, "13" in extended dominants.' },
    { members: ['b6', '#5', 'b13'], context: 'The augmented-fifth sound: #5 (augmented / altered dominant), b6 (minor / borrowed), b13 (the extended-dominant name). Context decides the spelling.' },
];

/**
 * Every spelling the enharmonic cards ask about, in generation
 * order: both halves of each note pair, then each degree group's
 * members. DERIVED from the two lists above, so a spelling cannot
 * exist on a card and be missing from the axis.
 */
export const ENHARMONIC_SPELLINGS: ReadonlyArray<string> = [
  ...ENHARMONIC_NOTE_PAIRS.flatMap(([x, y]) => [x, y]),
  ...ENHARMONIC_INTERVAL_GROUPS.flatMap(g => g.members),
];

/**
 * ♭ AND ♯ IN THE CARD'S TEXT (Silas, 14 Sep 2026): a note's accidental
 * (B♭, G♯) and a degree's (♭2, ♯9, ♯11). Applied to what a reader sees —
 * question, answer, decoys, explanation — after the decoys are chosen.
 * NOT to `axis` or `skillTag`: those are the stored spellings the facet
 * chips, the grid's columns and the card's sound are keyed by.
 *
 * Only a letter A to G or a digit in the accidental's place is touched,
 * so a word with a b in it is left alone.
 */
function enharmonicGlyphs(text: string): string {
  return text
    .replace(/(^|[^A-Za-z])([A-G])b(?![a-z])/g, '$1$2♭')
    .replace(/([A-G])#/g, '$1♯')
    .replace(/(^|[^A-Za-z])b(\d)/g, '$1♭$2')
    .replace(/#(\d)/g, '♯$1');
}

/** A card with every accidental in its text written as a glyph. */
function withEnharmonicGlyphs(card: Flashcard): Flashcard {
  return {
    ...card,
    question: enharmonicGlyphs(card.question),
    correctAnswer: enharmonicGlyphs(card.correctAnswer),
    decoys: card.decoys.map(enharmonicGlyphs),
    ...(card.explanation === undefined ? {} : { explanation: enharmonicGlyphs(card.explanation) }),
  };
}

function generateEnharmonicEquivalentCards(): Flashcard[] {
  const cards: Flashcard[] = [];
  let i = 1;

  // Note-name equivalents — same pitch, two spellings. [a, b, context]
  const notePairs = ENHARMONIC_NOTE_PAIRS;
  for (const [x, y, ctx] of notePairs) {
    cards.push({
      id: `enh-n-${i++}`,
      // `spelling` is the note being ASKED about, so the two cards of a
      // pair sit in different cells rather than colliding in one.
      axis: { spelling: x, equivalent: y, kind: 'note' },
      category: 'enharmonic-equivalents',
      categoryName: CATEGORY_LABELS['enharmonic-equivalents'],
      question: `Enharmonic equivalent of ${x}?`,
      correctAnswer: y,
      decoys: noteDecoys(y),
      explanation: `${x} = ${y}: same key on the piano, different spelling. ${ctx}`,
      skillTag: `enharmonic-note-${x}`,
    });
    cards.push({
      id: `enh-n-${i++}`,
      axis: { spelling: y, equivalent: x, kind: 'note' },
      category: 'enharmonic-equivalents',
      categoryName: CATEGORY_LABELS['enharmonic-equivalents'],
      question: `Enharmonic equivalent of ${y}?`,
      correctAnswer: x,
      decoys: noteDecoys(x),
      explanation: `${y} = ${x}: same key on the piano, different spelling. ${ctx}`,
      skillTag: `enharmonic-note-${y}`,
    });
  }

  // Interval-name equivalents — same pitch distance, different spellings;
  // context decides which reads correctly. Several are THREE-way: the
  // same pitch has a chord-tone, an altered, and an extension spelling.
  // One card per spelling ("equivalent of X?" → the other member(s)).
  const intervalPool = [
    '2', 'b2', '#2', '3', 'b3', '4', '#4', 'b5', '5', '#5', 'b6', '6',
    'b7', '7', '9', 'b9', '#9', '11', '#11', '13', 'b13',
  ];
  /**
   * Decoys for an enharmonic-equivalent card, matched to the ANSWER'S
   * SHAPE.
   *
   * =====================================================================
   * THE FIX IS DIFFERENT DECOYS, NEVER DECORATED ONES.
   *
   * A three-way group answers with a pair — "equivalent of #2?" is
   * "b3 / #9" — while the decoys came out of a flat list of single
   * degrees. So the answer was the only option with a slash in it, and
   * the only one containing a space, on all nine three-way cards. Both
   * were 100% reliable: pick the one with the slash and you are right
   * without knowing what an enharmonic is.
   *
   * The wrong repair is to put slashes on the decoys. "b2 / 11" names
   * two degrees that are not enharmonic with each other, so it teaches
   * something false — the same objection `catalogExpansions.ts` records
   * against forcing a gloss onto a decoy to produce "A♭ (G♯)".
   *
   * The right repair is to draw the decoys from the OTHER three-way
   * groups, which are real pairs, correctly written, and wrong for this
   * question. Same shape, nothing invented.
   * =====================================================================
   */
  const intervalDecoys = (
    correct: string,
    members: readonly string[],
    seed: string,
  ) => {
    const pairs = correct.includes(' / ');
    const pool = pairs
      ? intervalGroups
        .filter(g => g.members.length > 2)
        .flatMap(g => g.members.map(x => g.members.filter(y => y !== x).join(' / ')))
        .filter(p => p !== correct)
      : intervalPool.filter(n => !members.includes(n));
    return chooseDecoys(correct, pool, {
      count: DECOY_COUNT, seed, label: seed, category: 'enharmonic-equivalents',
    });
  };
  const intervalGroups = ENHARMONIC_INTERVAL_GROUPS;
  for (const { members, context } of intervalGroups) {
    for (const m of members) {
      const answer = members.filter(x => x !== m).join(' / ');
      cards.push({
        id: `enh-i-${i++}`,
        // `members.join('/')` names the GROUP the degree belongs to —
        // the row every spelling of one pitch shares.
        axis: { spelling: m, group: members.join('/'), kind: 'interval' },
        category: 'enharmonic-equivalents',
        categoryName: CATEGORY_LABELS['enharmonic-equivalents'],
        question: `Enharmonic equivalent of ${m}?`,
        correctAnswer: answer,
        decoys: intervalDecoys(answer, members, `enh-i-${m}`),
        explanation: `${members.join(' = ')}: same pitch distance, different spelling. ${context}`,
        skillTag: `enharmonic-interval-${m}`,
      });
    }
  }

  return cards.map(withEnharmonicGlyphs);
}


// --- Pentatonic scales in twelve keys ------------------------------
//
// Replaces two hand-written C cards. The five FORMULA cards above stay
// literal and untouched: they are key-agnostic (1, ♭3, 4, 5, ♭7) and
// there is nothing to derive.
//
// Explanations are split. The formula half names this key's five notes
// and varies; the context half is about the SOUND and is shared across
// all twelve, because D'Angelo and Aretha are attached to minor
// pentatonic, not to C.

// The three pentatonic context sentences MOVED to `catalogExpansions`,
// beside the generator that writes them now. `retiredPentatonicKeyCards`
// imports them back, so the retired cards still read exactly as they
// did — which is what the fold-in compares against.

/**
 * The one Named Note card that is still asked.
 *
 * =====================================================================
 * WRITTEN OUT, NOW THAT THE GENERATOR IT CAME FROM IS GONE.
 *
 * Named Notes retired into `degree-notes` on 3 Sep 2026 and its
 * twenty-four cards folded onto their counterparts — except this one.
 * "In the key of F# major, 4 of the scale = ?" asks about the key of
 * F♯ major and the family that replaced it asks in G♭ major, so there
 * was nothing to fold it onto: it kept its own id, its own rows and its
 * own question, and only the category it is filed under moved.
 *
 * WHY IT COULD NOT BE FOLDED. `degree-notes` generates from
 * `FLAT_TWELVE`, which spells the sixth key G♭, and the 4 of G♭ is C♭.
 * This card asks the 4 of F♯ and answers B — the same key on a
 * keyboard, different letters on the page. The restructure plan named
 * the risk in terms (§1.5): "the likely outcome is that they are
 * quietly dropped, and you lose the only F♯-major card in the app
 * without anyone deciding to." So it was placed rather than dropped.
 *
 * It was derived from `generateNamedNoteCards()` — twenty-four cards
 * built to keep one. That generator existed for the migration that
 * read it, and it went with the migration (restructure commit 9), so
 * the card is a literal now. Every field below is what the generator
 * produced, to the byte, including the decoys its seeded chooser picked.
 *
 * WHAT IS STILL UNRULED. Whether the deck should ask in F♯ or in G♭ at
 * all is Part 4 item 5 of the plan and nobody has answered it.
 *
 * ITS ID IS `nn-12` AND MUST STAY `nn-12`. A reader's spacing row,
 * every attempt and any annotation are keyed on it.
 * =====================================================================
 */
const F_SHARP_SURVIVOR: Flashcard[] = [{
  id: 'nn-12',
  category: 'degree-notes',
  categoryName: DEGREE_NOTE_CATEGORY_NAME,
  axis: { key: 'F#', degree: 4 },
  question: 'In the key of F# major, 4 of the scale = ?',
  correctAnswer: 'B',
  decoys: ['G', 'F#', 'G#'],
  explanation: 'The key of F# major is F# G# A# B C# D# E# (F) — number 4 is B. Knowing every scale in every key cold is the unglamorous skill that lets you sit in at any session: when the MD calls "key of F# major, hit the 4", you\'re already there.',
  skillTag: 'named-note-key-F#-degree-4',
  visualHint: {
    key: 'F# major',
    destinationNote: 'B',
    startingDegree: 1,
    destinationDegree: 4,
    direction: 'up',
    distance: 3,
  },
}];

/**
 * The deck.
 *
 * WRAPPED IN `withFacets`, which attaches what each card is about
 * without touching the cards themselves — no id moves, nothing renders
 * differently, and nothing is written to a row. See `facets.ts`.
 */
export const FLASHCARDS: Flashcard[] = withFacets([
  // `generateScaleDegreeMathCards` was here. It produced 84 cards whose
  // answers were always plain degree numbers, so the category could be
  // scored by counting letters and ignoring the interval's quality.
  // `scaleDegreeQualityCards` below asks the same 84 questions as its
  // alteration-zero subset, plus 84 more that land outside the key.
  // `sdmQualityMigration.ts` moved a reader's history across, and is
  // retired now that it has.
  ...DIATONIC_QUALITY_CARDS,
  ...FUNCTIONAL_HARMONY_CARDS,
  ...KEY_SIG_CARDS,
  ...MODE_CARDS,
  // `PENTATONIC_CARDS` WAS SPREAD HERE — the five formula cards.
  // Retired in commit 8; see the note on the array.
  // `generatePentatonicKeyCards()` WAS HERE. Commit 8 regenerated the
  // notes cards over the thirteen keys and replaced the relative ones
  // with the lick question; see `pentatonicFoldIn.ts`.
  // `generateIntervalCards()` WAS HERE. Ruling 43 replaced its twenty
  // hand-picked pairs with the full grid in `catalogExpansions`, and
  // their practice moved onto it — see `intervalFoldIn.ts`.
  ...CHORD_CONSTRUCTION_CARDS,
  ...PROGRESSION_CARDS,
  ...SLASH_CHORD_CARDS,
  ...generateEnharmonicEquivalentCards(),
  // The twelve-key expansions. APPENDED, never interleaved: every
  // generator above numbers by position, so inserting into one of
  // their input lists renumbers every card after it — see
  // generatedCardIds.test.ts. These carry root-suffixed ids and cannot
  // collide with, or repoint, anything above.
  ...expansionCards(),
  // `intervalInversionCards()` WAS HERE — fifteen fact cards about the
  // rule ("a Major 3rd inverted is a _____", "an interval and its
  // inversion always add up to _____"). The skill is the relationship
  // between two notes on the keyboard, both ways, and the grid already
  // asks both directions of every one of them. "Quality flips" and
  // "adds up to 9" are explanation, not a test, so they moved into the
  // reveal of every interval card and the fact cards went.
  // The quality-carrying rebuild of scale-degree math, ALONGSIDE the
  // 84 above rather than in place of them. Those 84 are this set's
  // alteration-zero subset one for one, so retiring them is a separate
  // step with its own decision about the spacing history attached to
  // their ids. Content-suffixed ids (`sdm-2-down-m6`) cannot collide
  // with the positional ones above (`sdm-2-down-6th`).
  ...scaleDegreeQualityCards(),
  // Twelve keys x thirteen degrees x three questions. Silas saw the
  // number — 468, and the deck it makes — and ruled it in.
  ...degreeNoteCards(),
  // Ten chords the band can be sitting on, in thirteen keys. Appended
  // for the reason every generated family is: its ids carry the key
  // and the chord, so nothing above can be renumbered by it.
  ...modalImprovisationCards(),
  // Spell the chord in a key: thirteen keys × seven degrees of major
  // (Silas, 14 Sep 2026). Appended like every generated family; its ids
  // carry the scale, the key and the degree.
  ...generateSpellChordCards(),
  ...F_SHARP_SURVIVOR,
]);

export function cardsByCategory(category: FlashcardCategory): Flashcard[] {
  return FLASHCARDS.filter(c => c.category === category);
}

export function cardById(id: string): Flashcard | undefined {
  return FLASHCARDS.find(c => c.id === id);
}
