// Chord Progression Quiz — pure logic.
//
// A non-keyboard (phone + laptop) recall drill over the user's own
// repertoire: each quizzable item is one SECTION of one song (verse of
// Song A and chorus of Song A are independent), spaced via SM-2 under the
// dedicated 'chord-progression-quiz' moduleRef (procedural / rating —
// distinct from the ear-training 'chord-progressions' AURAL quiz).
//
// Chords already live functionally in the lead sheet (scale-degree
// `function` + quality), so this module reuses the repertoire renderers
// (renderRoman / renderConcrete) and the bar-grid derivation rather than
// re-deriving any harmony. This file is the pure layer — extraction,
// item identity, display lines, and question-option builders. The async
// queue loader and the drill UI sit on top of it.

import type { ChordFunction, Song, SongSection } from '../../../lib/db';
import {
  deriveBarGrid,
  effectiveTimeSignature,
  parseTimeSignature,
} from '../../repertoire/barGrid';
import {
  isEmpty,
  renderConcrete,
  renderNumbers,
  renderRoman,
} from '../../repertoire/chordFunction';

/** Spacing-state moduleRef for every progression-quiz item. Must match
 *  the placeholder ref reserved in sessionAlgorithm/sessionDesign.ts
 *  (`CHORD_PROGRESSION_QUIZ_MODULE_REF`). */
export const CHORD_PROGRESSION_QUIZ_MODULE_REF = 'chord-progression-quiz';

// --- Item identity ---------------------------------------------------

/** Stable SM-2 itemRef for a (song, section) pair. */
export function quizItemRef(songId: string, sectionId: string): string {
  return `cpq:${songId}:${sectionId}`;
}

/** Inverse of `quizItemRef`. Returns null for anything not matching the
 *  `cpq:<songId>:<sectionId>` shape (ids never contain ':'). */
export function parseQuizItemRef(
  ref: string,
): { songId: string; sectionId: string } | null {
  const parts = ref.split(':');
  if (parts.length !== 3 || parts[0] !== 'cpq') return null;
  if (parts[1] === '' || parts[2] === '') return null;
  return { songId: parts[1], sectionId: parts[2] };
}

// --- Progression extraction ------------------------------------------

/** Active arrangement for a section: explicit selection → first declared
 *  arrangement → the implicit 'basic'. Matches the renderer's default. */
export function activeArrangementId(section: SongSection): string {
  return (
    section.activeArrangementId ||
    section.arrangements?.[0]?.id ||
    'basic'
  );
}

/** Ordered chords charted in a section's active arrangement, left-to-right
 *  across the bar grid (empty bar remainders dropped). This is the raw
 *  sequence as charted — repeats included — suitable for the bar-grid
 *  reveal. Use `collapseProgression` for the compact harmonic line. */
export function sectionChords(song: Song, section: SongSection): ChordFunction[] {
  const { beatsPerBar } = parseTimeSignature(
    effectiveTimeSignature(song, section),
  );
  const bars = deriveBarGrid(section, activeArrangementId(section), beatsPerBar);
  const chords: ChordFunction[] = [];
  for (const bar of bars) {
    for (const cell of bar.cells) {
      if (isEmpty(cell.chord)) continue;
      chords.push(cell.chord);
    }
  }
  return chords;
}

/** Number of bars in a section's bar grid (filled + explicit empty bars),
 *  used by the Bar-Count question. Reads the same derivation the lead
 *  sheet renders, so it reflects what the user actually sees. */
export function sectionBarCount(song: Song, section: SongSection): number {
  const { beatsPerBar } = parseTimeSignature(
    effectiveTimeSignature(song, section),
  );
  return deriveBarGrid(section, activeArrangementId(section), beatsPerBar).length;
}

/** A section is quizzable only when its active arrangement has chords
 *  actually entered (the Bar-Count type and the recall types all need a
 *  real progression). Incomplete / empty sections are excluded. */
export function hasChartData(song: Song, section: SongSection): boolean {
  return sectionChords(song, section).length > 0;
}

// --- Harmonic line (collapsed, for display + comparison) -------------

/** Canonical identity of a chord for collapsing consecutive repeats and
 *  for distractor de-duplication — function + quality + bass, or the raw
 *  text for unparsed entries. */
function chordKey(c: ChordFunction): string {
  if (c.unparsed) return `raw:${(c.raw ?? '').trim()}`;
  return `${c.function}|${c.quality}|${c.bass ?? ''}`;
}

/** Collapse consecutive identical chords so a chart that holds one chord
 *  across several bars/beats reads as a single harmonic step (the user
 *  recalls "I VI II V", not the rhythm). */
export function collapseProgression(chords: ChordFunction[]): ChordFunction[] {
  const out: ChordFunction[] = [];
  let prevKey: string | null = null;
  for (const c of chords) {
    const k = chordKey(c);
    if (k === prevKey) continue;
    out.push(c);
    prevKey = k;
  }
  return out;
}

/** Roman-numeral tokens for the collapsed progression (I, VImaj7, ...). */
export function romanTokens(chords: ChordFunction[]): string[] {
  return collapseProgression(chords).map(c => renderRoman(c));
}

/** Concrete chord-letter tokens for the song's key (Cm, Ab, Dm7b5, ...). */
export function concreteTokens(
  chords: ChordFunction[],
  songKey: string | undefined,
): string[] {
  return collapseProgression(chords).map(c => renderConcrete(c, songKey));
}

/** Joined Roman-numeral line, the canonical comparison + display string
 *  for a progression ("I - VI - II - V"). */
export function romanLine(chords: ChordFunction[]): string {
  return romanTokens(chords).join(' - ');
}

/** Joined concrete-chord line for the song's key ("Cm - Ab - Dm7b5 - G7"). */
export function concreteLine(
  chords: ChordFunction[],
  songKey: string | undefined,
): string {
  return concreteTokens(chords, songKey).join(' - ');
}

/** Key-independent signature of a progression (collapsed number notation),
 *  used to tell whether two sections share the same progression so a
 *  multiple-choice distractor isn't accidentally a correct answer. */
export function progressionSignature(chords: ChordFunction[]): string {
  return collapseProgression(chords)
    .map(c => renderNumbers(c))
    .join('|');
}

// --- Randomness ------------------------------------------------------

export type Rng = () => number;

/** Fisher–Yates shuffle into a new array. Pure given `rng`. */
export function shuffle<T>(items: ReadonlyArray<T>, rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// --- Question Type 2: Multiple Choice (progression) ------------------

/** Build up to 4 multiple-choice options for "what is the progression?".
 *  The correct Roman line plus distractors drawn from OTHER songs'
 *  progressions (never a plausible variation of the same song — the
 *  caller supplies a pool already excluding this section). Distractors
 *  are de-duplicated against the answer and each other; if fewer than 3
 *  distinct distractors exist the option set comes back short and the
 *  caller should skip the multiple-choice type for this item.
 *
 *  Returns the shuffled option lines and the index of the correct one. */
export function buildProgressionChoices(
  correctLine: string,
  distractorPool: ReadonlyArray<string>,
  rng: Rng = Math.random,
): { options: string[]; correctIndex: number } {
  const seen = new Set<string>([correctLine]);
  const distractors: string[] = [];
  for (const line of shuffle(distractorPool, rng)) {
    if (distractors.length >= 3) break;
    if (seen.has(line)) continue;
    seen.add(line);
    distractors.push(line);
  }
  const options = shuffle([correctLine, ...distractors], rng);
  return { options, correctIndex: options.indexOf(correctLine) };
}

// --- Question Type 4: Bar Count --------------------------------------

/** Build 4 distinct bar-count options including the correct count.
 *  Distractors are drawn from musically plausible nearby counts (the
 *  common 4/8/12/16 lengths plus ±2 / ±4 around the answer), so the
 *  options read as believable section lengths rather than random numbers. */
export function buildBarCountOptions(
  correct: number,
  rng: Rng = Math.random,
): { options: number[]; correctIndex: number } {
  const candidates = [
    correct - 4,
    correct - 2,
    correct + 2,
    correct + 4,
    4,
    8,
    12,
    16,
  ].filter(n => n > 0 && n !== correct);

  const seen = new Set<number>([correct]);
  const distractors: number[] = [];
  for (const n of shuffle(candidates, rng)) {
    if (distractors.length >= 3) break;
    if (seen.has(n)) continue;
    seen.add(n);
    distractors.push(n);
  }
  // Top up from a widening spread in the unlikely event the plausible
  // pool collapsed to fewer than 3 (very small correct counts).
  let extra = 1;
  while (distractors.length < 3) {
    const n = correct + extra * 2 + 4;
    if (!seen.has(n)) {
      seen.add(n);
      distractors.push(n);
    }
    extra += 1;
  }

  const options = shuffle([correct, ...distractors], rng);
  return { options, correctIndex: options.indexOf(correct) };
}

// --- Type 2/4 → rating pre-fill --------------------------------------

export type QuizRating = 'flying' | 'cruising' | 'crawling';

/** Pre-filled self-rating for the objective question types: a correct
 *  answer suggests "Flying", an incorrect one "Crawling". The drill seeds
 *  the rating buttons with this but lets the user override before it's
 *  recorded as the SM-2 signal. */
export function ratingFromCorrectness(correct: boolean): QuizRating {
  return correct ? 'flying' : 'crawling';
}
