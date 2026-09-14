import { degreeAscii, expansionCards, practicalName } from './catalogExpansions';
import { chooseDecoys } from './decoyGuard';
import { scaleDegreeQualityCards } from './scaleDegreeQualityCards';
import { DEGREE_NOTE_CATEGORY_NAME, degreeNoteCards } from './degreeNoteCards';
import { DEGREE_MATH_CATEGORY_NAME } from './scaleDegreeQualityCards';
import { withFacets } from './facets';
import {
  MODAL_IMPROV_CATEGORY_NAME, modalImprovisationCards,
} from './modalImprovisation';
// Harmonic Fluency flashcard catalog.
// Static data — no audio, no keys in the DB beyond per-user SM-2 state.
// Programmatic generators fill systematic categories (scale-degree math,
// reverse key pivots, intervals); hand-written cards cover nuanced
// categories (functional harmony, slash chords, ear-theory crossover).

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
  | 'ear-theory'
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
  'modes': 'Mode Identification',
  'pentatonic-scales': 'Pentatonic Scales',
  'intervals': 'Interval Identification',
  'chord-construction': 'Chord Construction',
  'progressions': 'Progression Vocabulary',
  'slash-chords': 'Slash Chords & Inversions',
  'ear-theory': 'Ear-Theory Crossover',
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
 */
export const CATEGORY_ORDER: FlashcardCategory[] = [
  'scale-degree-math', 'degree-notes', 'enharmonic-equivalents',
  'diatonic-qualities', 'functional-harmony',
  'key-signatures', 'modes', 'pentatonic-scales', 'intervals',
  'chord-construction', 'progressions', 'modal-improvisation',
  'slash-chords', 'ear-theory',
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
    question: 'The V chord most strongly resolves to _____',
    correctAnswer: 'I', decoys: ['IV', 'vi', 'iii'],
    explanation: "V pulls to I — this is the gravity of Western harmony. Every 'final' chord of every style — gospel cadence, jazz turnaround, R&B chorus landing — gets its resolution from this one V → I pull.",
    skillTag: 'resolution-V-to-I' },
  { id: 'fh-2', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The leading tone (7th scale degree) resolves to _____',
    correctAnswer: '1', decoys: ['2', '5', '6'],
    explanation: "The leading tone (7) sits a half-step below the tonic and wants to rise — your ear expects 'ti → do.' That tiny half-step pull is the strongest melodic expectation in tonal music; vocal runs and bass lines exploit it constantly.",
    skillTag: 'leading-tone-resolution' },
  { id: 'fh-4', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The IV → I move (the "Amen" cadence) is also called the _____',
    correctAnswer: 'plagal cadence',
    decoys: ['authentic cadence', 'half cadence', 'deceptive cadence'],
    explanation: "The IV → I move is the gospel 'Amen' cadence — the sound of hymn endings, Kirk Franklin payoffs, and worship-song resolutions. Every church musician knows it as 'the 4 back to the 1'; classical theory books call this same move the 'plagal cadence.'",
    skillTag: 'plagal-cadence' },
  { id: 'fh-5', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The strongest "going home" cadence — V → I — is also called the _____',
    correctAnswer: 'authentic cadence',
    decoys: ['plagal cadence', 'half cadence', 'deceptive cadence'],
    explanation: "V → I is the strongest, most decisive resolution in Western music — it's how almost every song you know lands its final chord. Working musicians just call it 'going home'; theory textbooks call it the 'authentic cadence.'",
    skillTag: 'authentic-cadence' },
  { id: 'fh-6', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'When V goes to vi instead of I (the "fake-out" resolution), the cadence is called _____',
    correctAnswer: 'deceptive cadence',
    decoys: ['plagal cadence', 'half cadence', 'authentic cadence'],
    explanation: "When V slides to vi instead of I, your ear is set up for home and gets the relative minor instead — a fake-out. Soul, gospel, and R&B writers use this constantly to stretch tension across a bridge before finally landing for real. Also called the 'deceptive cadence' in theory.",
    skillTag: 'deceptive-cadence' },
  { id: 'fh-7', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'A phrase that ends "hanging" on the V chord (waiting for resolution) uses a _____',
    correctAnswer: 'half cadence',
    decoys: ['plagal cadence', 'deceptive cadence', 'authentic cadence'],
    explanation: "When a phrase ends on V instead of resolving to I, it hangs in the air, waiting — that's the 'half cadence.' Every pop and R&B pre-chorus that builds suspense before the hook uses this 'end-on-the-5' setup.",
    skillTag: 'half-cadence' },
  { id: 'fh-8', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The tonic function is served by which chord(s)?',
    correctAnswer: 'I and vi',
    decoys: ['ii and IV', 'V and vii°', 'iii only'],
    explanation: "Both I and vi feel like 'home' chords — they share two notes and serve the same resting function. That's why a 1-5-6-4 progression still feels grounded: the vi is standing in for the I, just with a darker color.",
    skillTag: 'tonic-function' },
  { id: 'fh-9', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The "lead-up" function (chords that set up the V) is served by _____',
    correctAnswer: 'ii and IV',
    decoys: ['I and vi', 'V and vii°', 'iii and V'],
    explanation: "ii and IV are the 'lead-up' chords — they build tension away from home and set up the V. The ii → V and IV → V moves are everywhere in gospel, soul, and jazz; theory calls these chords 'predominant' or 'subdominant' function.",
    skillTag: 'predominant-function' },
  { id: 'fh-10', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The dominant function (chords that pull back to I) is served by _____',
    correctAnswer: 'V and vii°',
    decoys: ['I and vi', 'ii and IV', 'iii and vi'],
    explanation: "V and vii° both contain the leading tone, which creates the pull back to I. Practically you'll almost always reach for V (or V7) — but knowing vii° shares the dominant function helps with reharm and substitution.",
    skillTag: 'dominant-function' },
  { id: 'fh-11', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'A secondary dominant V/V in the key of C major is which chord?',
    correctAnswer: 'D7', decoys: ['G7', 'A7', 'E7'],
    explanation: "A secondary dominant is the V-of-a-non-tonic chord. V/V (five of five) points to V: in the key of C major, that's D7 → G7. Gospel bridges, Stevie Wonder verses, and jazz tunes use secondary dominants to tour through the key without fully modulating.",
    skillTag: 'secondary-dominant-V-of-V' },
  { id: 'fh-12', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'V/vi in the key of C major resolves to _____',
    correctAnswer: 'Am', decoys: ['Em', 'Dm', 'Fmaj7'],
    explanation: "V/vi is the V chord pointing at vi — in the key of C major, that's E7 → Am. You hear this constantly in gospel and soul when a song pivots into its relative minor for a bridge or emotional lift before drifting back home.",
    skillTag: 'secondary-dominant-V-of-vi' },
  { id: 'fh-13', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'In jazz, the "tritone substitution" of G7 is _____',
    correctAnswer: 'Db7', decoys: ['C7', 'F7', 'B7'],
    explanation: "The tritone sub replaces a V7 with a dominant 7 a tritone away — G7 and Db7 share the same tritone (B–F), so they resolve to C equally well. Robert Glasper and modern jazz pianists use this to add chromatic color to a 2-5-1.",
    skillTag: 'tritone-substitution' },
  { id: 'fh-14', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'bVII in a major key is borrowed from _____',
    correctAnswer: 'Mixolydian / parallel minor',
    decoys: ['Dorian / parallel major', 'Lydian', 'harmonic minor'],
    explanation: "bVII is the flat-7 chord — Bb in the key of C major. It's borrowed from Mixolydian or the parallel minor, and you hear it everywhere in rock, gospel, and soul when a song leans bluesy without actually modulating. Stevie Wonder and Kirk Franklin use bVII constantly.",
    skillTag: 'borrowed-bVII' },
  { id: 'fh-15', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'iv minor in a major key is borrowed from _____',
    correctAnswer: 'parallel minor',
    decoys: ['relative minor', 'Lydian', 'Phrygian'],
    explanation: "The iv minor is the minor version of IV, borrowed from the parallel minor key. It's one of the most emotionally loaded chords in gospel, R&B, and soul — PJ Morton, Madison Ryan Ward, and countless church bridges use it for that bittersweet pull before resolving home. Theory books call this 'modal interchange' or 'parallel minor borrowing.'",
    skillTag: 'borrowed-iv-minor' },
  { id: 'fh-16', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'Ending a minor-key song on a major I chord (instead of minor i) creates _____',
    correctAnswer: 'a bright, hopeful resolution',
    decoys: ['a deceptive cadence', 'a dissonant modal shift', 'a suspended ending'],
    explanation: "Ending a minor-key section on a major I chord instead of the expected minor i creates a bright, hopeful lift. You hear this in traditional hymns that end triumphantly and in gospel arrangements where a minor verse resolves to major at the very end. Classical theory calls this a 'Picardy third' (named after the Picardy region of France), but working musicians would just say 'ending on the major 1.'",
    skillTag: 'major-ending-in-minor-key' },
  { id: 'fh-17', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'The circle of fifths describes motion by _____',
    correctAnswer: 'descending perfect 5ths',
    decoys: ['ascending major 2nds', 'descending major 3rds', 'chromatic descent'],
    explanation: "The circle of fifths is the engine of functional harmony: chords move most strongly by descending perfect 5ths (G → C → F → Bb...). Every ii-V-I is a piece of the circle, and jazz standards modulate through it constantly.",
    skillTag: 'circle-of-fifths' },
  { id: 'fh-18', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'In a 1-5-6-4 progression, swapping the plain V for a fuller version typically means using _____',
    correctAnswer: 'V7', decoys: ['vi', 'iii', 'ii'],
    explanation: "Swapping the plain V for V7 in a 1-5-6-4 adds the dominant pull and a bluesy/gospel lean. V7 is V's fuller, more active cousin — and it's almost always the right move when you want the chord to push, not just sit there.",
    skillTag: 'progression-substitution-V' },
  { id: 'fh-19', category: 'functional-harmony', categoryName: CATEGORY_LABELS['functional-harmony'],
    question: 'A chord that has both tonic and dominant function qualities is _____',
    correctAnswer: 'iii',
    decoys: ['IV', 'ii', 'vi'],
    explanation: "The iii — the chord built on the 3rd number — is a kind of harmonic chameleon — it shares two notes with I (tonic function) and two with V (dominant function). That's why iii can substitute for either in the right context, and why it shows up in slick reharm moves.",
    skillTag: 'mediant-function' },
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
  { id: 'mo-1', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Dorian mode starts on which scale degree of the major scale?',
    correctAnswer: '2', decoys: ['3', '4', '6'],
    explanation: "Dorian is what you get by playing a major scale starting on the 2nd number. In the key of C major, that's D Dorian: D-E-F-G-A-B-C — the sound of cool, hopeful-minor vamps (think Miles Davis's 'So What' or any D'Angelo groove that sits on a minor chord without ever resolving).",
    skillTag: 'mode-dorian-degree' },
  { id: 'mo-2', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Phrygian mode starts on which scale degree?',
    correctAnswer: '3', decoys: ['2', '4', '6'],
    explanation: "Phrygian starts on the 3rd of the major scale — E Phrygian from C major. The flat-2 on top of a minor tonic gives it a dark, Spanish/flamenco color; you hear hints of it in metal and in some hip-hop sample loops.",
    skillTag: 'mode-phrygian-degree' },
  { id: 'mo-3', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Lydian mode starts on which scale degree?',
    correctAnswer: '4', decoys: ['3', '5', '7'],
    explanation: "Lydian starts on the 4th of the major scale — F Lydian from the key of C major. The key of F major's 4th is B♭. F Lydian's is B natural. Play F A C E and add B on top: that's Fmaj7♯11, and the B is the ♯11.",
    skillTag: 'mode-lydian-degree' },
  { id: 'mo-4', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Mixolydian mode starts on which scale degree?',
    correctAnswer: '5', decoys: ['4', '6', '7'],
    explanation: "Mixolydian starts on the 5th of the major scale — G Mixolydian from C major. The flat-7 instead of the leading tone gives it a bluesy, gospel, Hendrix color; it's the scale of rock, R&B, and gospel vamps that never quite resolve.",
    skillTag: 'mode-mixolydian-degree' },
  { id: 'mo-5', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Aeolian mode (natural minor) starts on which scale degree?',
    correctAnswer: '6', decoys: ['5', '7', '3'],
    explanation: "Aeolian is just natural minor — it starts on the 6th of the major scale. A Aeolian from C major is A-B-C-D-E-F-G. Every 'pure' minor-key song that doesn't raise the 7th is in Aeolian.",
    skillTag: 'mode-aeolian-degree' },
  { id: 'mo-6', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Locrian mode starts on which scale degree?',
    correctAnswer: '7', decoys: ['6', '5', '1'],
    explanation: "Locrian starts on the 7th number — unstable and almost never used as a home mode. Jazz players improvise Locrian over m7b5 chords, but you won't find a straight-ahead Locrian song.",
    skillTag: 'mode-locrian-degree' },
  { id: 'mo-7', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Mixolydian mode's signature altered note is _____",
    correctAnswer: 'b7', decoys: ['#4', 'b3', 'b6'],
    explanation: "Mixolydian's flavor note is the flat-7 — it's a major scale with a flattened 7th. That flat-7 is the bluesy color you hear in gospel, rock, and R&B whenever the tonic chord is a dominant 7 that just sits there, never resolving.",
    skillTag: 'mode-mixolydian-signature' },
  { id: 'mo-8', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Lydian mode's signature altered note is _____",
    correctAnswer: '#4', decoys: ['b7', 'b3', '#5'],
    explanation: "Lydian's signature note is the sharp-4 — a major scale with a raised 4th. That #4 is the 'cinematic, floating' sound; you hear it in Tom Misch, Robert Glasper, and Disney/Pixar score writing.",
    skillTag: 'mode-lydian-signature' },
  { id: 'mo-9', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Dorian mode's signature altered note is _____",
    correctAnswer: 'natural 6',
    decoys: ['b2', 'b7 only', '#4'],
    explanation: "Dorian is minor with a raised (natural) 6th — over a minor tonic, that 6 is what makes Dorian feel hopeful-minor instead of dead-sad. It's the signature of D'Angelo grooves, modal jazz, and any minor vamp that doesn't feel mournful.",
    skillTag: 'mode-dorian-signature' },
  { id: 'mo-10', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "Phrygian mode's signature altered note is _____",
    correctAnswer: 'b2', decoys: ['b3', 'b6', '#4'],
    explanation: "Phrygian's signature is the flat-2 — that half-step right above the tonic. It's what gives the mode its Spanish/Middle-Eastern flavor when played over a minor tonic.",
    skillTag: 'mode-phrygian-signature' },
  // `mo-11`, `mo-12` AND `mo-13` WERE HERE — the hand-written C mode
  // cards. Ruling 42 generates every key including C, so they asked
  // the identical question with the identical answer as
  // `mo-mode-C-6`, `mo-mode-C-2` and `mo-mode-C-5`. Their practice
  // moved onto those; see `modeFoldIn.ts`, which holds the proof.
  { id: 'mo-14', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "The signature chord that says 'Dorian' is _____",
    correctAnswer: 'i minor 7 with a major IV',
    decoys: ['v minor 7 with a major I', 'iii minor with a major IV', 'ii minor 7 flat 5'],
    explanation: "The Dorian sound is a minor tonic with a MAJOR IV — e.g., Dm7 | G7 | Dm7 | G7. That major IV (instead of the usual minor iv) is the telltale signature; sit on this two-chord vamp and you're in pure 'So What' / D'Angelo territory.",
    skillTag: 'mode-dorian-chord' },
  { id: 'mo-15', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "The signature chord that says 'Lydian' is _____",
    correctAnswer: 'I maj7#11',
    decoys: ['I7', 'Imaj7', 'i(maj7)'],
    explanation: "The signature Lydian chord is I maj7#11 — a major 7 with a raised 4. That #11 is the shimmering, cinematic color; PJ Morton, Tom Misch, and gospel arrangers stack it for that lifted, dreamlike sound on the I or IV.",
    skillTag: 'mode-lydian-chord' },
  { id: 'mo-16', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: "The signature chord that says 'Mixolydian' is _____",
    correctAnswer: 'I7 as a tonic',
    decoys: ['Imaj7', 'I maj7#11', 'i minor 7'],
    explanation: "Mixolydian is signaled by a tonic dominant-7 chord that doesn't resolve — a G7 that stays put, not going to C. Every funky gospel vamp, every blues-rock riff, and every Stevie Wonder verse that grooves on a 7-chord lives in this space.",
    skillTag: 'mode-mixolydian-chord' },
  { id: 'mo-17', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Harmonic minor differs from natural minor by _____',
    correctAnswer: 'a raised 7th',
    decoys: ['a raised 6th', 'a raised 4th', 'a lowered 2nd'],
    explanation: "Harmonic minor raises the 7th of natural minor — that's the only difference, and it's a powerful one. That raised 7 is what turns the minor v into a proper V7, giving minor-key music a strong resolution back to i.",
    skillTag: 'harmonic-minor-difference' },
  { id: 'mo-18', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Melodic minor (ascending) differs from natural minor by _____',
    correctAnswer: 'raised 6th and 7th',
    decoys: ['raised 7th only', 'raised 6th only', 'lowered 2nd and 7th'],
    explanation: "Melodic minor (ascending) raises both the 6th and 7th of natural minor — going up, it sounds almost major. Classical tradition reverts to natural minor on the way down, but jazz keeps the raised notes both directions.",
    skillTag: 'melodic-minor-difference' },
  { id: 'mo-20', category: 'modes', categoryName: CATEGORY_LABELS.modes,
    question: 'Ionian mode is the same as _____',
    correctAnswer: 'major scale',
    decoys: ['natural minor', 'melodic minor', 'pentatonic'],
    explanation: "Ionian is just another word for the plain major scale. Any time someone says 'Ionian mode,' they mean the vanilla major — it's the mode all the others get measured against.",
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
    question: 'A major 7 chord stacks these intervals from root', correctAnswer: 'major 3rd + minor 3rd + major 3rd',
    decoys: ['major 3rd + minor 3rd + minor 3rd', 'minor 3rd + major 3rd + major 3rd', 'major 3rd + major 3rd + minor 3rd'],
    explanation: "A maj7 stacks major 3rd, then minor 3rd, then major 3rd — that's root-3-5-7. In C: C-E-G-B. It's the sound of tonic rest in R&B and jazz; every 'nice' final chord in soul music is a maj7.",
    skillTag: 'chord-construction-maj7' },
  { id: 'cc-2', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A dominant 7 chord stacks these intervals from root', correctAnswer: 'major 3rd + minor 3rd + minor 3rd',
    decoys: ['major 3rd + minor 3rd + major 3rd', 'minor 3rd + minor 3rd + minor 3rd', 'major 3rd + major 3rd + major 3rd'],
    explanation: "A dominant 7 stacks major 3rd, minor 3rd, minor 3rd — root, 3, 5, b7. In C: C-E-G-Bb. The flat-7 is what makes it lean — V7 chords pull to I, and I7 (Mixolydian) tonics just sit and groove.",
    skillTag: 'chord-construction-dom7' },
  { id: 'cc-3', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A minor 7 chord stacks these intervals from root', correctAnswer: 'minor 3rd + major 3rd + minor 3rd',
    decoys: ['major 3rd + minor 3rd + major 3rd', 'minor 3rd + minor 3rd + major 3rd', 'major 3rd + minor 3rd + minor 3rd'],
    explanation: "A minor 7 stacks minor 3rd, major 3rd, minor 3rd — root, b3, 5, b7. In C: C-Eb-G-Bb. The default 'smooth' minor chord in neo-soul, jazz, and gospel — every Dm7 or Em7 you hear in a vamp.",
    skillTag: 'chord-construction-min7' },
  { id: 'cc-4', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A diminished 7 chord stacks these intervals from root', correctAnswer: 'minor 3rd + minor 3rd + minor 3rd',
    decoys: ['minor 3rd + minor 3rd + major 3rd', 'major 3rd + minor 3rd + minor 3rd', 'minor 3rd + major 3rd + minor 3rd'],
    explanation: "A diminished 7 stacks three minor 3rds in a row — every interval the same. It has no single tonal center, so jazz and gospel use it as a passing chord to slide between two more stable harmonies.",
    skillTag: 'chord-construction-dim7' },
  { id: 'cc-5', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'Cmaj7 contains the notes _____', correctAnswer: 'C, E, G, B',
    decoys: ['C, E, G, Bb', 'C, Eb, G, B', 'C, E, G#, B'],
    explanation: "Cmaj7 = C-E-G-B. The major triad C-E-G plus B (the major 7th) on top. The B is what gives it that soft, lit-from-within quality you hear at the end of a slow R&B ballad.",
    skillTag: 'chord-notes-Cmaj7' },
  { id: 'cc-6', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'G7 contains the notes _____', correctAnswer: 'G, B, D, F',
    decoys: ['G, Bb, D, F', 'G, B, D, F#', 'G, B, D#, F'],
    explanation: "G7 = G-B-D-F. Major triad G-B-D plus F on top (the flat 7). The B-F tritone inside is the engine — it's what pulls G7 toward C, and it's why tritone substitutions work on the V chord.",
    skillTag: 'chord-notes-G7' },
  { id: 'cc-7', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'Dm7 contains the notes _____', correctAnswer: 'D, F, A, C',
    decoys: ['D, F#, A, C', 'D, F, A, C#', 'D, F, Ab, C'],
    explanation: "Dm7 = D-F-A-C. Minor triad D-F-A plus C on top. The default ii chord in the key of C major — every 2-5-1 in the key of C major starts here (Dm7 → G7 → Cmaj7).",
    skillTag: 'chord-notes-Dm7' },
  { id: 'cc-8', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'Bm7b5 is also called _____', correctAnswer: 'half-diminished 7',
    decoys: ['fully diminished 7', 'minor-major 7', 'dominant 7 flat 5'],
    explanation: "Bm7b5 (B-D-F-A) is a minor 7 with a flattened 5th — same chord as half-diminished 7. It's the ii of every minor-key 2-5-1 (Bm7b5 → E7 → Am) — fundamental jazz turnaround vocabulary.",
    skillTag: 'chord-name-m7b5' },
  { id: 'cc-9', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A dominant 7#9 chord contains which altered tone?',
    correctAnswer: 'raised 9',
    decoys: ['flat 9', 'sharp 11', 'flat 13'],
    explanation: "A 7#9 chord stacks a raised 9 — an augmented 2nd above the root — on top of a dom7: the 'Hendrix chord' (C7#9 = C-E-G-Bb-D#). The major 3rd colliding with the minor 3rd (the #9 spelled enharmonically) creates bluesy, knife-edge tension; you hear it in Hendrix, Stevie Wonder, and gospel cadences.",
    skillTag: 'chord-construction-7-sharp-9' },
  { id: 'cc-10', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A Cadd9 chord contains _____', correctAnswer: 'C E G D',
    decoys: ['C E G B D', 'C E G Bb D', 'C Eb G D'],
    explanation: "Cadd9 is a C major triad with an added 9 (D) — no 7th, just the color tone. Bright, open sound; you hear it all over indie pop and neo-soul (Tom Misch, Daniel Caesar, Frank Ocean's cleaner moments).",
    skillTag: 'chord-construction-add9' },
  { id: 'cc-11', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'C6/9 contains _____', correctAnswer: 'C E G A D',
    decoys: ['C E G B D', 'C E G A', 'C Eb G A D'],
    explanation: "C6/9 stacks C-E-G plus a 6 (A) and a 9 (D) — no 7th, just rich color tones. The classic gospel and jazz 'final chord' sound: sweet, settled, and fully resolved without being plain.",
    skillTag: 'chord-construction-6-9' },
  { id: 'cc-12', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A sus2 chord replaces the 3rd with _____', correctAnswer: 'the 2nd',
    decoys: ['the 4th', 'the 6th', 'the flat 3rd'],
    explanation: "A sus2 swaps the 3rd for the 2nd — Csus2 is C-D-G instead of C-E-G. Open, ambiguous sound, neither major nor minor; common in indie/alt arrangements and Daniel Caesar-style guitar voicings.",
    skillTag: 'chord-construction-sus2' },
  { id: 'cc-13', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A sus4 chord replaces the 3rd with _____', correctAnswer: 'the 4th',
    decoys: ['the 2nd', 'the 6th', 'the 7th'],
    explanation: "A sus4 swaps the 3rd for the 4th — Csus4 is C-F-G. It's the 'held' sound before resolution; gospel cadences (V7sus4 → V7 → I) lean on this exact suspense-and-release move constantly.",
    skillTag: 'chord-construction-sus4' },
  { id: 'cc-14', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'Fmaj7 contains _____', correctAnswer: 'F A C E',
    decoys: ['F A C Eb', 'F Ab C E', 'F A C# E'],
    explanation: "Fmaj7 = F-A-C-E. Major triad plus E on top — warm, settled IV chord in the key of C major, or the tonic when you're in the key of F major. Default 'pretty' chord on the 4 of any major key.",
    skillTag: 'chord-notes-Fmaj7' },
  { id: 'cc-15', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'Am(maj7) contains _____', correctAnswer: 'A C E G#',
    decoys: ['A C E G', 'A C# E G#', 'A C Eb G#'],
    explanation: "Am(maj7) = A-C-E-G# — a minor triad with a raised 7th, the 'James Bond chord.' Tense and cinematic; used sparingly for a single dramatic beat rather than as a sit-and-groove tonic.",
    skillTag: 'chord-notes-Am-maj7' },
  { id: 'cc-16', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'The tritone interval inside a dom7 chord is between _____',
    correctAnswer: 'the 3rd and the b7',
    decoys: ['the root and the 5', 'the 5 and the b7', 'the root and the b7'],
    explanation: "The tritone inside a dom7 lives between the 3rd and the flat-7 (in G7: B to F). That tritone is the engine — it's what pulls V7 back to I, and it's why tritone substitutions work (G7 and Db7 share the same tritone).",
    skillTag: 'dom7-tritone' },
  { id: 'cc-17', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'C9 (dominant 9) contains _____', correctAnswer: 'C E G Bb D',
    decoys: ['C E G B D', 'C E G Bb F', 'C Eb G Bb D'],
    explanation: "C9 is dominant 9 — C-E-G-Bb-D. The 9 on top of the dom7 adds brighter, richer color than a plain C7. Common in funk, soul, and gospel (think Stevie Wonder's 'I Wish' horn stabs).",
    skillTag: 'chord-notes-C9' },
  { id: 'cc-18', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'Which chord has no perfect 5th?', correctAnswer: 'diminished 7',
    decoys: ['dominant 7', 'major 7', 'half-diminished 7'],
    explanation: "The diminished 7 chord has no perfect 5th — its 5th is flattened. All its intervals are stacked minor 3rds, so nothing inside it is stable; that's why it's used as a passing/transition chord rather than a resting one.",
    skillTag: 'chord-no-perfect-5th' },
  { id: 'cc-19', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'An augmented triad stacks _____',
    correctAnswer: 'two major 3rds',
    decoys: ['two minor 3rds', 'major then minor 3rd', 'minor then major 3rd'],
    explanation: "An augmented triad stacks two major 3rds — like C-E-G#. The raised 5th creates an unsettled, suspended feeling; appears in cinematic transitions and sometimes as V+ (an altered V) before resolving in minor keys.",
    skillTag: 'chord-construction-augmented' },
  { id: 'cc-20', category: 'chord-construction', categoryName: CATEGORY_LABELS['chord-construction'],
    question: 'A diminished triad stacks _____',
    correctAnswer: 'two minor 3rds',
    decoys: ['two major 3rds', 'major then minor 3rd', 'minor then major 3rd'],
    explanation: "A diminished triad stacks two minor 3rds — C-Eb-Gb. The flat-5 makes it unstable; as a vii° chord it pulls to the tonic, and it more commonly shows up as part of a bigger dim7 passing move.",
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

const EAR_THEORY_CARDS: Flashcard[] = [
  { id: 'et-1', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A song moves from IV to a chord that feels darker and more emotional. The destination is most likely _____',
    correctAnswer: 'iv minor',
    decoys: ['vi', 'ii minor', 'V/IV'],
    explanation: "When a major-key song slides from IV to iv (F to Fm in the key of C major), that minor-IV is borrowed from the parallel minor, and it's the most powerful borrowed-chord move in popular music. It's the 'gospel pull' — PJ Morton, Madison Ryan Ward, and countless church bridges live here. Theory books call it 'modal interchange'; working players just call it 'the minor 4.'",
    skillTag: 'ear-theory-IV-to-iv' },
  { id: 'et-2', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A gospel song has a signature move where V becomes a Dom7#9 before resolving. This creates _____',
    correctAnswer: 'bluesy tension before the resolution',
    decoys: ['a modal shift', 'a descending bass', 'a suspended feeling'],
    explanation: "V7#9 — the 'Hendrix chord' acting as the V — stacks a minor third (the #9) against the major third, creating bluesy/gospel tension right before resolution. Common in gospel cadences in the moment just before the payoff back to I; you also hear it all over Stevie Wonder and funk.",
    skillTag: 'ear-theory-7-sharp-9-tension' },
  { id: 'et-3', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'If a song feels like it is in the key of C major but uses a Bb chord, that Bb is likely _____',
    correctAnswer: 'bVII borrowed from Mixolydian',
    decoys: ['a passing chord', 'a tritone substitution', 'a chromatic mediant'],
    explanation: "When a C-major song drops a Bb chord (bVII), it's borrowing from Mixolydian or the parallel minor — a classic rock/gospel move. Stevie Wonder, Kirk Franklin, and countless worship tunes use bVII for that broad, bluesy lift without actually changing key.",
    skillTag: 'ear-theory-bVII-borrowed' },
  { id: 'et-4', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A song feels unresolved at the end, lingering on a bright chord a whole step below the tonic. That chord is likely _____',
    correctAnswer: 'bVII',
    decoys: ['IV', 'vi', 'ii'],
    explanation: "A song that ends hanging on bVII (Bb in the key of C major) feels suspended, unfinished — it's a flat-seven ending instead of a clean tonic resolution. Common in modern indie, gospel-leaning soul, and any track where the writer wants to avoid too-tidy closure (Frank Ocean, Tom Misch sometimes leave songs there).",
    skillTag: 'ear-theory-ending-on-bVII' },
  { id: 'et-5', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A minor chord that sounds "floating" and contemplative when used as a tonic is most likely _____',
    correctAnswer: 'i minor 11 (Dorian feel)',
    decoys: ['i minor 7 (natural minor)', 'i half-diminished', 'i minor-major 7'],
    explanation: "A 'floating' minor tonic chord is almost always a i minor 11 in a Dorian context — the natural 6 plus the rich stack of 9-11 extensions gives it the airy, never-quite-resolving quality you hear in D'Angelo, Erykah Badu, and Robert Glasper vamps.",
    skillTag: 'ear-theory-dorian-floating' },
  { id: 'et-6', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A progression that feels like it keeps "almost resolving" but defers is using _____',
    correctAnswer: 'deceptive cadences (V - vi)',
    decoys: ['plagal cadences (IV - I)', 'half cadences (ending on V)', 'modal interchange'],
    explanation: "A progression that keeps 'almost resolving' is leaning on deceptive cadences — V slides to vi instead of I, postponing the real resolution. Soul, gospel, and R&B writers use this to extend a bridge or build emotional weight before the real landing finally arrives.",
    skillTag: 'ear-theory-deferred-resolution' },
  { id: 'et-7', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A chord that sounds "suspended" and wants to pull down to a major triad is most likely _____',
    correctAnswer: 'sus4',
    decoys: ['sus2', 'major 7', 'add9'],
    explanation: "A sus4 chord replaces the 3rd with the 4th, creating a 'held' tension that wants to resolve down to a major triad. Gospel cadences (V7sus4 → V7 → I) lean on this exact move — that suspension-and-release is one of the most identifiable sounds in church music.",
    skillTag: 'ear-theory-sus4-tension' },
  { id: 'et-8', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A song in a major key suddenly sounds "cinematic and dreamy" on the IV chord. That chord is most likely _____',
    correctAnswer: 'IV maj7#11',
    decoys: ['IV 7', 'IV 6/9', 'iv minor'],
    explanation: "A IV chord that sounds dreamy/cinematic is usually a maj7#11 — borrowing from Lydian. That raised 4th is the 'shimmering' color; PJ Morton, Robert Glasper, and modern gospel arrangers use it for lift on the IV when they want the song to bloom open.",
    skillTag: 'ear-theory-lydian-IV' },
  { id: 'et-9', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'The "James Bond chord" — a minor triad with a major 7 — is called _____',
    correctAnswer: 'minor-major 7',
    decoys: ['minor 7', 'half-diminished 7', 'minor 6'],
    explanation: "A minor triad with a raised 7th is a minor-major 7 chord — nicknamed the 'James Bond chord' for its signature use in those scores. Tense, cinematic, used sparingly for a single striking moment rather than as a sit-and-groove chord.",
    skillTag: 'ear-theory-min-maj7' },
  { id: 'et-10', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A chord that sounds like "the neo-soul chord" with a stacked 9th, 11th, and 13th on minor is _____',
    correctAnswer: 'minor 11',
    decoys: ['minor 9', 'minor-major 9', 'minor 6/9'],
    explanation: "A minor chord stacked with 9-11-13 is a minor 11 — 'the neo-soul chord.' Lush, cloudy, rarely resolving; the signature sound of Tom Misch, D'Angelo, Jazmine Sullivan, and H.E.R. vamps where everything hangs beautifully suspended.",
    skillTag: 'ear-theory-min11-neo-soul' },
  { id: 'et-11', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A "Hendrix chord" sound combines which two seemingly-conflicting tones?',
    correctAnswer: 'major 3rd and minor 3rd',
    decoys: ['major 7 and minor 7', 'natural 5 and flat 5', '#4 and 5'],
    explanation: "The Hendrix chord is a dom7 with a raised 9 (#9) — the major 3rd and the minor 3rd (spelled as #9) colliding to create that bluesy, knife-edge tension. Hendrix made it his signature, and you hear it all over funk, gospel cadences, and any tune that wants that 'wrong-but-right' bite.",
    skillTag: 'ear-theory-hendrix-chord' },
  { id: 'et-12', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A gospel resolution often uses V7sus4 before V7 to create _____',
    correctAnswer: 'suspension-and-release tension',
    decoys: ['modal ambiguity', 'chromatic descent', 'a deceptive resolution'],
    explanation: "V7sus4 resolving to V7 sets up suspense — the suspended 4th pulls down to the 3rd just before resolving to I. Gospel, R&B, and worship cadences use this 'hold-then-drop' tension constantly; once you can hear it, you'll catch it in every other Sunday-morning song.",
    skillTag: 'ear-theory-V7sus4-release' },
  { id: 'et-13', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'When a song\'s bass descends by step while chords change above it, the technique is called _____',
    correctAnswer: 'descending bass line',
    decoys: ['parallel motion', 'pedal point', 'oblique harmony'],
    explanation: "When the bass walks down by step while chords shift on top, you have a descending bass line — maybe the most universal tool in ballad writing. It's a signature move in gospel, soul, and standards (think 'A Whiter Shade of Pale,' or any Donny Hathaway slow burn).",
    skillTag: 'ear-theory-descending-bass' },
  { id: 'et-14', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'A Dominant 7 that does NOT resolve (it acts as the tonic) reveals which mode?',
    correctAnswer: 'Mixolydian',
    decoys: ['Dorian', 'Lydian', 'Phrygian'],
    explanation: "A dominant 7 chord acting as the tonic — sitting there, not resolving — reveals Mixolydian mode (the major scale with a flat 7 instead of the leading tone). It's the harmonic bedrock of rock, funky gospel vamps, and blues-based R&B.",
    skillTag: 'ear-theory-non-resolving-dom7' },
  { id: 'et-15', category: 'ear-theory', categoryName: CATEGORY_LABELS['ear-theory'],
    question: 'The IV → I move is also nicknamed _____',
    correctAnswer: 'the Amen cadence',
    decoys: ['the leading-tone cadence', 'the deceptive cadence', 'the half cadence'],
    explanation: "The IV → I move is the 'Amen cadence' — named for how hymns end on those two chords sung to the word 'Amen.' Every gospel and worship musician knows it as 'the 4 back to the 1'; classical theory books call the same move the 'plagal cadence.'",
    skillTag: 'ear-theory-amen-cadence' },
];

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
    ['B#', 'C', 'B# is C re-spelled — the leading tone of C# major / raised numbers.'],
    ['Cb', 'B', 'Cb is B re-spelled — the 4th of the key of Gb major and other flat-key contexts.'],
    ['E#', 'F', 'E# is F re-spelled — the 3rd of C# major / raised numbers.'],
    ['Fb', 'E', 'Fb is E re-spelled — appears in heavily-flat keys and lowered numbers.'],
];

/** The enharmonic degree groups, at module scope for the same
 *  reason as the note pairs above. */
export const ENHARMONIC_INTERVAL_GROUPS:
  ReadonlyArray<{ members: readonly string[]; context: string }> = [
    { members: ['2', '9'], context: 'Same pitch an octave apart — "2" in sus/add voicings, "9" in extended (9th / 13th) chords.' },
    { members: ['b2', 'b9'], context: 'b2 for a Phrygian / sus flavour; b9 as the altered-dominant tension. Same pitch, different role.' },
    { members: ['#2', 'b3', '#9'], context: 'All the minor-third pitch: b3 as the chord’s third, #2 as a raised-2nd passing tone, #9 as the "Hendrix" altered-dominant tension. Context decides the spelling.' },
    { members: ['4', '11'], context: 'Same pitch an octave apart — "4" in sus/add voicings, "11" in extended chords.' },
    { members: ['#4', 'b5', '#11'], context: 'The tritone: #4 (Lydian, raising the 4th), b5 (altered dominant / half-diminished, lowering the 5th), #11 (the extended-chord name). Context decides the spelling.' },
    { members: ['6', '13'], context: 'Same pitch an octave apart — "6" in sixth chords, "13" in extended dominants.' },
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
      explanation: `${x} = ${y} — same key on the piano, different spelling. ${ctx}`,
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
      explanation: `${y} = ${x} — same key on the piano, different spelling. ${ctx}`,
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
        explanation: `${members.join(' = ')} — same pitch distance, different spelling. ${context}`,
        skillTag: `enharmonic-interval-${m}`,
      });
    }
  }

  return cards;
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
  ...EAR_THEORY_CARDS,
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
  ...F_SHARP_SURVIVOR,
]);

export function cardsByCategory(category: FlashcardCategory): Flashcard[] {
  return FLASHCARDS.filter(c => c.category === category);
}

export function cardById(id: string): Flashcard | undefined {
  return FLASHCARDS.find(c => c.id === id);
}
