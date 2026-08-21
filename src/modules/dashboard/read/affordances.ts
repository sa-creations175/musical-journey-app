/**
 * What a row is TRAINING, what would ADVANCE it, and what is odd about
 * its numbers.
 *
 * ─── Why this file exists ────────────────────────────────────────────
 *
 * The trigger was twenty minutes spent, by the person who built the
 * module the week before, unable to work out what Reading's chord
 * identification tested or how it differed from notation shapes. If the
 * author cannot reconstruct it, the row has to say it.
 *
 * A row already owed two things: what the number means, and what would
 * move it. This adds a third, and it comes first: WHAT AM I PRACTISING.
 *
 * ─── A description is an explanation, not a label ────────────────────
 *
 * "Notation shapes: notation shapes" is a label. It tells someone who
 * already knows nothing new, and someone who does not know, nothing at
 * all. Each entry below says what the row ASKS YOU TO DO, and names the
 * row it depends on where it has one.
 *
 * ─── Thirty-odd descriptions, every row covered ──────────────────────
 *
 * Descriptions are written for module rows, submodules and the repeated
 * sub-skill shapes. Everything deeper — one card, one key, one section —
 * INHERITS THE NEAREST ONE ABOVE IT, and the panel says which row it
 * came from. Writing one per item would mean 3,700 of them, most saying
 * the same thing; leaving item rows blank would be the status report
 * again.
 *
 * ─── Keys drift; a test catches it ───────────────────────────────────
 *
 * `BY_NODE_ID` is keyed on the joined path, which changes the day
 * someone renames a segment — and a description silently detaching from
 * its row would not surface for months. `affordances.test.ts` asserts
 * every key resolves to a real node in an assembled tree, and that every
 * submodule row resolves to something.
 *
 * Pure. Nodes and counts in, strings out.
 */
import { moduleLabelFor } from './catalogs';
import type { TreeNode } from './tree';
import { COVERAGE_MIN_ENGAGEMENTS, ACCURACY_WINDOW } from './itemStats';

// =====================================================================
// What skill is this
// =====================================================================

export interface SkillDescription {
  text: string;
  /** The row this was written for, when it is not this row. Named so an
   *  inherited explanation cannot pass as one written for the item. */
  inheritedFrom?: string;
}

const EAR = 'ear-training';
const HF = 'harmonic-fluency';
const SP = 'shapes-and-patterns';

/**
 * Keyed on node id — the module id, then each path segment.
 *
 * One entry per row that has something of its own to say. Anything
 * below one of these inherits it.
 */
const BY_NODE_ID: Readonly<Record<string, string>> = {
  // ── Harmonic fluency ───────────────────────────────────────────────
  [HF]:
    'Theory recall away from the keyboard. A question, an answer you say '
    + 'in your head, and a right-or-wrong mark. No instrument involved, '
    + 'which is what makes it the module you can practise on a train.',
  [`${HF}/Scale Degree Math`]:
    'Arithmetic on scale degrees, with no key named. "Three, up a minor '
    + 'third" — the answer is 5, and it is 5 in every key, because the '
    + 'question never says which key you are in. This is the layer under '
    + 'every other harmonic skill: it is what lets you transpose without '
    + 'learning anything twice.',
  [`${HF}/Named Notes Across Keys`]:
    'The same degree, spelled in a real key. "What is the 6 of E♭?" Scale '
    + 'Degree Math is keyless arithmetic; this attaches it to letters and '
    + 'accidentals, which is the step between knowing the shape of a key '
    + 'and being able to say what is in it.',
  [`${HF}/Tritone Pairs`]:
    'The two notes a tritone apart, in both directions. The interval is '
    + 'symmetrical, so every note has exactly one partner — which is what '
    + 'makes the pairs worth knowing cold rather than working out.',
  [`${HF}/Enharmonic Equivalents`]:
    'The same pitch under its other name. F♯ and G♭ sound identical and '
    + 'are written differently for a reason; naming the alternative on '
    + 'demand is what reading in an unfamiliar key asks for constantly.',
  [`${HF}/Diatonic Chord Qualities`]:
    'Which quality sits on each degree of the major scale — major, minor, '
    + 'minor, major, dominant, minor, diminished. Held by DEGREE rather '
    + 'than by key, which is what lets you harmonise a melody without '
    + 'working it out from scratch each time.',
  [`${HF}/Functional Harmony`]:
    'What a chord DOES rather than what it is. Tonic, subdominant, '
    + 'dominant, and the pull between them — the reason a V wants to '
    + 'resolve to I and a IV does not.',
  [`${HF}/Key Signatures & Relationships`]:
    'How many accidentals a key carries, which keys sit next to it, and '
    + 'which minor shares its signature. The map you navigate by, where '
    + "Reading's Key Signature Recognition is reading the map off a page.",
  [`${HF}/Reverse Key Pivots`]:
    'The question backwards: given a note and the degree it is, name the '
    + 'key. "A is the 3 of which major key?" Harder than the forward '
    + 'direction, and the one that actually comes up when you are working '
    + 'out what key something is in.',
  [`${HF}/Mode Identification`]:
    'Naming a mode from its formula, or from where it sits relative to '
    + "the major scale it comes from. Theory rather than ear: Ear "
    + "Training's Scales & Modes is the same material by sound, and the "
    + 'two are worth building separately.',
  [`${HF}/Pentatonic Scales`]:
    'The five-note scales, their starting points, and what they contain '
    + 'in each key. The vocabulary most soloing actually sits on.',
  [`${HF}/Interval Identification`]:
    'Naming the distance between two notes on paper. The written '
    + "counterpart to Ear Training's Intervals: same distances, and here "
    + 'you are handed the notes rather than the sound.',
  [`${HF}/Chord Construction`]:
    'Spelling a chord from its name. What notes are in a Cmin7♭5, and how '
    + 'the formula stacks them.',
  [`${HF}/Progression Vocabulary`]:
    'Naming and recalling common progressions by their numerals. The '
    + 'shorthand that lets a whole song be described in four symbols.',
  [`${HF}/Slash Chords & Inversions`]:
    'What a chord over a bass note is, and which inversion it makes. C/E '
    + 'is a C major triad with its third at the bottom — reading that '
    + 'instantly is what makes a bass line make sense.',
  [`${HF}/Ear-Theory Crossover`]:
    'Questions sitting between hearing and knowing: what a described '
    + 'sound is, what a named interval feels like. The bridge the other '
    + 'fourteen categories exist to build.',

  // ── Ear training ───────────────────────────────────────────────────
  [EAR]:
    'Naming what you hear. Every row is right or wrong against a played '
    + 'sound, with no instrument in your hands and no notation in front '
    + 'of you.',
  [`${EAR}/Intervals`]:
    'Two notes played one after the other; name the distance. Ascending '
    + 'and descending are separate rows: a descending minor 6th does not '
    + 'feel like an ascending one, and a reference tune that works going '
    + 'up rarely works coming down.',
  [`${EAR}/Chord Recognition`]:
    'A chord is played; name its quality. The root changes every card, so '
    + 'what you are training is the colour of the stack rather than the '
    + 'note it starts on.',
  [`${EAR}/Chord Progressions`]:
    'Three different drills sharing one module: hearing which key you are '
    + 'in, hearing one chord move to another, and holding a whole '
    + 'progression together.',
  [`${EAR}/Chord Progressions/Key Detection`]:
    'A passage plays; name the key. No chords to name — just the centre '
    + 'of gravity, which is the thing everything else is measured from.',
  [`${EAR}/Chord Progressions/Chord Motion`]:
    'One chord moving to another, named by scale degree. Cadence-level '
    + 'work: the smallest unit of harmonic movement there is.',
  [`${EAR}/Chord Progressions/Chord Motion/Destination`]:
    'Given where the motion started, name where it landed.',
  [`${EAR}/Chord Progressions/Chord Motion/First Chord`]:
    'Name where the motion STARTED, which is the harder direction. It is '
    + 'only asked in the minimal scaffold, so a low number here usually '
    + 'means you have not spent time in that mode. Coverage counts all '
    + '132 motions whichever scaffold you have been using, so the '
    + 'percentage means the same thing each time you look at it.',
  [`${EAR}/Chord Progressions/Full Progression`]:
    'Name every chord of a progression, in order. Harder than the '
    + 'cadence-level work in Chord Motion, because it tests holding the '
    + 'whole thing together rather than one move at a time.',
  [`${EAR}/Scales & Modes`]:
    'Nine modes, and two quite different ways of meeting each one.',

  // ── Reading ────────────────────────────────────────────────────────
  reading:
    'Reading notation off the staff under time pressure. Four skills, and '
    + 'two of them are built out of the other two.',
  'reading/Note Recognition':
    'One note on the staff; name the pitch. Both clefs, and answers are '
    + 'pitches with their octave, like C4.',
  'reading/Key Signature Recognition':
    'The accidentals at the front of the staff, and everything that '
    + 'follows from them. Two rows per key, because seeing a signature '
    + 'and reconstructing one are different directions of the same '
    + 'knowledge.',
  'reading/Notation Shapes':
    'The fast silhouette pre-read. One pick from seven: is this stack a '
    + 'triad or a seventh, and which inversion, read off the shape alone. '
    + 'Root, quality and clef do not come into it. This is the pre-read '
    + 'that Chord Identification builds a full answer on top of, which is '
    + 'why it sits above it in the list.',
  'reading/Chord Identification':
    'The full conjunctive answer: inversion AND quality AND clef, all '
    + 'three required, on a chord whose root changes every card. Notation '
    + 'Shapes is the smaller question living inside this one — you can '
    + 'answer that on its own, and you cannot answer this without it. The '
    + 'same relationship as counting accidentals inside naming a key.',

  // ── Shapes & Patterns ──────────────────────────────────────────────
  [SP]:
    'Physical shapes under the hands, at the keyboard. Nothing here is '
    + 'marked right or wrong: you rate the rep on the four-step fluency '
    + 'scale, because no part of the app can see whether your hand found '
    + 'the shape.',
  [`${SP}/Chord Shapes`]:
    'One shape, in one key, played until it is under the fingers. The '
    + 'grid is quality × inversion × key, and the CELL is the shape in '
    + 'the key — hands and articulation are ways of practising it rather '
    + 'than separate things to know, so they are not counted separately.',
  [`${SP}/Scales`]:
    'Scales and pentatonics across all twelve keys, rated by how the rep '
    + 'went rather than by how long it took.',
  [`${SP}/Voice-Leading`]:
    'Moving between chords with the smallest hand movement that works. '
    + 'The patterns are the named ones: the diatonic cycle, 5→1, the '
    + '2-5-1s. Each carries its own row types, since a pattern started '
    + 'from a different position is a different thing under the hands.',
  [`${SP}/Mental Visualisation`]:
    'Picturing a shape without touching the keys. It sits inside Shapes & '
    + 'Patterns because it is the same material, and keeps its own '
    + 'coverage and score: it builds the physical skill rather than '
    + 'measuring it, so it is tracked alongside rather than counted in.',

  // ── Song repertoire ────────────────────────────────────────────────
  repertoire:
    'Songs you are learning, section by section. The two columns read two '
    + 'different records: coverage counts logged practice, and the score '
    + 'counts clean test run-throughs at tempo. So one tells you whether '
    + 'you have been working on a section and the other whether it holds '
    + 'up.',

  // ── Production ─────────────────────────────────────────────────────
  production:
    'Making records — which is two unrelated things: lessons you work '
    + 'through, and vocabulary you have to know cold.',
  'production/Lessons':
    'Worked lessons, self-rated on a five-step scale of their own: not '
    + 'started, read it, deep dive, tried it, mastered. A lesson has a '
    + 'reading path and a doing path, and the rating tracks how far down '
    + 'it you got. It is a separate scale from fluency.',
  'production/Vocabulary':
    'Producer vocabulary as flashcards, marked right or wrong. Knowing '
    + 'what a word means is what lets a tutorial, or somebody else in the '
    + 'room, make sense in real time.',
};

/**
 * Keyed on `moduleId::label`, for a sub-skill shape that REPEATS.
 *
 * Reading's two key-signature rows appear under all 26 keys; the mode
 * tabs under all nine modes; the inversion states under every chord
 * quality. Keying those by node id would mean 26, 9 and 72 identical
 * entries and one of them going stale unnoticed.
 */
const BY_MODULE_LABEL: Readonly<Record<string, string>> = {
  [`${EAR}::Ascending`]:
    'The same thirteen distances, played upward.',
  [`${EAR}::Descending`]:
    'The same thirteen distances, played downward. A separate list, '
    + 'because the reference tunes that work going up rarely work coming '
    + 'down.',
  [`${EAR}::Foundational Triads`]:
    'Three-note chords: the qualities everything else is a variation of.',
  [`${EAR}::Seventh Chords`]:
    'Four-note chords. A seventh on top changes what the chord wants to '
    + 'do, not just how it sounds.',
  [`${EAR}::Dominant Variations`]:
    'Dominant chords and their alterations — the family that carries most '
    + 'of the tension in gospel, soul and jazz harmony.',
  [`${EAR}::Extensions & Colors`]:
    'Ninths, elevenths, thirteenths and altered tones. Recognising these '
    + 'is recognising a colour on top of a chord you can already name.',
  [`${EAR}::Chord Accuracy`]:
    'Every chord in the progression, named correctly. One submitted '
    + 'answer counts as one result, all of it or none: what is being '
    + 'tested is holding the whole progression together.',
  [`${EAR}::Inversion Accuracy`]:
    'Whether you got the bass note right as well as the chord: the INV '
    + 'badge. Slash progressions only.',
  [`${EAR}::Pattern Recognition`]:
    'Naming the progression as a shape once you have named its chords. '
    + 'Hearing I–vi–ii–V as one familiar thing is its own skill, on top '
    + 'of hearing the four chords that make it up.',
  [`${EAR}::Hear Simple Scale`]:
    'The scale played as single notes, up and down. Name the mode.',
  [`${EAR}::Hear Mode In Context`]:
    'A vamp loops — a progression with a melody over it — and you name '
    + 'the mode it is built on. Much closer to how you would meet a mode '
    + 'in real music, and much harder than hearing it bare.',
  'reading::Visual Recognition':
    'See the signature on the staff, name the key. One question, one '
    + 'answer, and the direction you meet first when reading.',
  'reading::Conceptual Knowledge':
    'Given the key: how many accidentals does it carry, and which ones in '
    + 'written order. Two stored questions merged into one row, because '
    + 'they are two steps of ONE skill — you cannot name them in order '
    + 'without knowing how many there are. Counting subsumes into naming '
    + 'the way Notation Shapes subsumes into Chord Identification.',
  [`${SP}::Root Position`]:
    'The shape with its root at the bottom. Where a quality gets learned '
    + 'first, and the reference the inversions are heard against.',
  [`${SP}::1st Inversion`]:
    'The third at the bottom. The same notes and a different hand.',
  [`${SP}::2nd Inversion`]:
    'The fifth at the bottom.',
  [`${SP}::3rd Inversion`]:
    'The seventh at the bottom. Sevenths only — a triad has no fourth '
    + 'note to put there.',
  [`${SP}::All Inversions Fluid`]:
    'Moving root → 1st → 2nd → root, up and down the keyboard without '
    + 'stopping. Its own skill rather than a summary of the three above '
    + 'it: the transitions are what playing actually asks for, and they '
    + 'take separate work from the positions themselves.',
  [`${SP}::Triads`]:
    'Three-note shapes, pictured rather than played.',
  [`${SP}::Sevenths`]:
    'Four-note shapes, pictured rather than played. Inversion sits above '
    + 'key, so "major 7, second inversion" reads across all twelve keys '
    + 'at once. That is usually the more useful view, since inversions '
    + 'are what tend to trip people up.',
};

/**
 * The description for a row — its own, or the nearest one above it.
 *
 * Resolution order is most specific first: this exact row, then a
 * repeated sub-skill shape by label, then the closest ancestor that has
 * one. Matched on `id` boundaries rather than by splitting, so a label
 * containing a slash — a song title will, eventually — cannot produce a
 * false ancestor.
 */
export function skillDescriptionFor(
  node: TreeNode,
  moduleId: string,
): SkillDescription | null {
  const own = BY_NODE_ID[node.id] ?? BY_MODULE_LABEL[`${moduleId}::${node.label}`];
  if (own !== undefined) return { text: own };

  let bestKey: string | null = null;
  for (const key of Object.keys(BY_NODE_ID)) {
    if (!node.id.startsWith(`${key}/`)) continue;
    if (bestKey === null || key.length > bestKey.length) bestKey = key;
  }
  if (bestKey === null) return null;
  return {
    text: BY_NODE_ID[bestKey],
    inheritedFrom: bestKey.includes('/')
      ? bestKey.slice(bestKey.lastIndexOf('/') + 1)
      : moduleLabelFor(bestKey),
  };
}

/** Every registered key, for the guard test. */
export const DESCRIBED_NODE_IDS: ReadonlyArray<string> = Object.keys(BY_NODE_ID);
export const DESCRIBED_MODULE_LABELS: ReadonlyArray<string> =
  Object.keys(BY_MODULE_LABEL);

// =====================================================================
// What would advance it
// =====================================================================

/**
 * What would move this row, in its current state.
 *
 * DERIVED, never authored per row. A row reading "3 of 6 covered" that
 * cannot say what makes it 4 of 6 is a status report — the thing this
 * screen exists to replace — and a hand-written hint would go stale the
 * moment the numbers moved.
 *
 * Three shapes, because three rules genuinely differ:
 *
 *   A REPERTOIRE SECTION is gated on clean run-throughs at tempo, which
 *     `RULE_LEGIBILITY` §3.8 calls the best-surfaced rule in the app —
 *     stated in five places, every one of them AT THE DRILL. This is
 *     where the number gets read, and it was the one place it was not.
 *
 *   A PRODUCTION LESSON is covered by reaching a rating, not by a count.
 *
 *   EVERYTHING ELSE is the 3-attempt threshold below coverage, and the
 *     20-attempt window above it.
 */
export function advanceHintFor(node: TreeNode, moduleId: string): string {
  const isLeaf = node.children.length === 0;
  const selfRated = node.accuracyKind === 'self-rated';

  if (moduleId === 'repertoire' && isLeaf) {
    const short = COVERAGE_MIN_ENGAGEMENTS - node.engagementCount;
    const coverage = short > 0
      ? `${plural(short, 'more logged practice session')} touching this section `
        + 'would cover it. '
      : 'It is covered: three or more practice sessions have touched it. ';
    return coverage
      + 'The score comes from a different record: three consecutive clean '
      + 'run-throughs at or above (performance tempo − 10) BPM, in one '
      + 'key. Practice tells you whether you have been working on the '
      + 'section; a test run-through tells you whether it holds up.';
  }

  if (moduleId === 'production' && selfRated && isLeaf) {
    return 'Rating this lesson "tried it" covers it: that is the step where '
      + 'you have done the thing rather than read about it. "Read it" and '
      + '"deep dive" are both recorded and both leave it uncovered. '
      + '"Mastered" takes the score the rest of the way.';
  }

  const rep = selfRated ? 'rated rep' : 'attempt';

  if (isLeaf) {
    const short = COVERAGE_MIN_ENGAGEMENTS - node.engagementCount;
    if (short > 0) {
      return `${plural(short, `more ${rep}`)} would cover it: the threshold `
        + `is ${COVERAGE_MIN_ENGAGEMENTS}. Until then it stays on the `
        + 'uncovered list, which is where to look for what to start next.';
    }
    return `It is covered. The score now reads your last ${ACCURACY_WINDOW} `
      + `${rep}s on it, and that window rolls forward: each new one replaces `
      + 'the oldest still in it, so the number tracks how you are playing '
      + 'now.';
  }

  if (node.totalItems === 0) {
    return 'Nothing sits under this row to practise.';
  }

  const uncovered = node.totalItems - node.coveredItems;
  if (uncovered > 0) {
    const start = node.engagementCount === 0
      ? `Nothing is logged here yet. ${plural(uncovered, 'item')} `
      : `${plural(uncovered, 'item')} of ${node.totalItems} `;
    return `${start}${uncovered === 1 ? 'is' : 'are'} still under `
      + `${COVERAGE_MIN_ENGAGEMENTS} ${rep}s. Each needs a `
      + `${ordinal(COVERAGE_MIN_ENGAGEMENTS)} to count toward coverage. `
      + 'Open this row to see which ones.';
  }
  return 'Everything under this row is covered. The score averages each '
    + `item's own last ${ACCURACY_WINDOW} ${rep}s, one vote each, so it `
    + 'stays a reading of the whole row rather than of whichever item you '
    + 'have drilled hardest.';
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function ordinal(n: number): string {
  const words: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third' };
  return words[n] ?? `${n}th`;
}

// =====================================================================
// What is odd about this row's numbers
// =====================================================================

/** Counts a note needs that no node carries. */
export interface RowNoteContext {
  /**
   * Chord-progression attempt rows written before `submissionId`
   * existed. They cannot be collapsed into one result per submitted
   * answer, so they count one row per chord.
   */
  ungroupableProgressionAttempts?: number;
}

/**
 * The rules that make THIS row's numbers mean something other than they
 * appear to.
 *
 * Every one is a `RULE_LEGIBILITY` entry that reaches a number on this
 * screen. Stated at the row rather than only in the column panel,
 * because the column panel explains the rule and only the row knows
 * whether it applies.
 */
export function rowNotesFor(
  node: TreeNode,
  moduleId: string,
  context: RowNoteContext = {},
): string[] {
  const notes: string[] = [];

  if (node.excludedFromParentTotals) {
    notes.push(
      'These numbers belong to this row alone and are not counted in the '
      + 'Shapes & Patterns totals above. Picturing a shape builds the '
      + 'physical skill rather than measuring it, so it is tracked here on '
      + 'its own. Practising it does still refresh the recency shown above, '
      + 'because it is still practice.',
    );
  }

  if (node.id.startsWith(`${SP}/Mental Visualisation`)) {
    notes.push(
      'The attempt count here is a floor rather than a total: mental '
      + 'visualisation keeps only its last 20 reps per item, so anything '
      + 'drilled more than that reads 20. Coverage needs '
      + `${COVERAGE_MIN_ENGAGEMENTS}, so what counts as covered is `
      + 'unaffected.',
    );
  }

  const ungroupable = context.ungroupableProgressionAttempts ?? 0;
  if (ungroupable > 0 && node.id.startsWith(`${EAR}/Chord Progressions`)) {
    notes.push(
      `${plural(ungroupable, 'stored attempt')} here predate submission `
      + 'tracking and cannot be collapsed into one result per submitted '
      + 'answer, so each of them counts as one chord rather than one '
      + 'progression. Newer attempts are grouped. Worth knowing when the '
      + 'attempt count here looks higher than the number of times you '
      + 'remember sitting down with it.',
    );
  }

  if (node.mixedKinds) {
    notes.push(
      'The rows inside this one are scored in different ways: some marked '
      + 'right or wrong, some self-rated. A single number cannot mean the '
      + 'same thing for both, so this row shows a dash. Open it and each '
      + 'side shows its own score.',
    );
  }

  const focus = node.stats?.excludedByReason['focus-pool'] ?? 0;
  if (focus > 0) {
    notes.push(
      `${plural(focus, 'of these attempts')} ${focus === 1 ? 'was' : 'were'} `
      + 'made with fewer than 4 items selected, and ' + (focus === 1 ? 'is' : 'are')
      + ' held out of the score: with a pool that small a guess is right '
      + 'one time in three, so the percentage would not mean much. They '
      + 'still count toward coverage and recency.',
    );
  }

  const ungraded = node.stats?.excludedByReason['not-graded'] ?? 0;
  if (ungraded > 0) {
    notes.push(
      `${plural(ungraded, 'of these')} ${ungraded === 1 ? 'is a' : 'are'} `
      + 'practice session' + (ungraded === 1 ? '' : 's') + ', which '
      + `carr${ungraded === 1 ? 'ies' : 'y'} no pass or fail and so `
      + `${ungraded === 1 ? 'sits' : 'sit'} outside the score. `
      + 'They are what coverage and recency read; a tested run-through is '
      + 'what tells you whether the section holds up.',
    );
  }

  if (moduleId === 'repertoire' && node.depth === 1) {
    notes.push(
      'Coverage here counts sections, not keys. So the percentage means '
      + 'the same thing for every song, however many keys you have taken '
      + 'each one into. The keys sit under each section.',
    );
  }

  return notes;
}
