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
  SEMI_BY_DEGREE,
  isEmpty,
  renderConcrete,
  renderNumbers,
  renderRoman,
} from '../../repertoire/chordFunction';
import { intervalColor } from '../../../lib/voicingColors';

/** Spacing-state moduleRef for every progression-quiz item. Must match
 *  the placeholder ref reserved in sessionAlgorithm/sessionDesign.ts
 *  (`CHORD_PROGRESSION_QUIZ_MODULE_REF`). */
export const CHORD_PROGRESSION_QUIZ_MODULE_REF = 'chord-progression-quiz';

// --- Question types --------------------------------------------------

/**
 * The quiz question types. Each (section, type) pair is an INDEPENDENT
 * SM-2 row (itemRef carries the type), so a section's easy types can
 * surface for review before its hard ones.
 *   recall             — Type 1: name the progression (numbers/Roman).
 *   mc                 — Type 2: multiple choice from other songs.
 *   barcount           — Type 4: how many bars.
 *   transpose-scaffold — Type 5a: recall concrete chords in a target key,
 *                        numbers shown as scaffolding.
 *   transpose-full     — Type 5b: recall numbers AND concrete chords in a
 *                        target key, no hints.
 */
export type QuizType =
  | 'recall'
  | 'mc'
  | 'barcount'
  | 'transpose-scaffold'
  | 'transpose-full';

/** All types, easy → hard (also the enumeration order). */
export const QUIZ_TYPES: readonly QuizType[] = [
  'recall',
  'mc',
  'barcount',
  'transpose-scaffold',
  'transpose-full',
];

// --- Item identity ---------------------------------------------------

/** Stable SM-2 itemRef for a (song, section, type) triple. The type is
 *  part of the ref so each question type spaces independently. */
export function quizItemRef(songId: string, sectionId: string, type: QuizType): string {
  return `cpq:${songId}:${sectionId}:${type}`;
}

/** Inverse of `quizItemRef`. Returns null for anything not matching the
 *  `cpq:<songId>:<sectionId>:<type>` shape (ids never contain ':'). */
export function parseQuizItemRef(
  ref: string,
): { songId: string; sectionId: string; type: QuizType } | null {
  const parts = ref.split(':');
  if (parts.length !== 4 || parts[0] !== 'cpq') return null;
  if (parts[1] === '' || parts[2] === '') return null;
  if (!QUIZ_TYPES.includes(parts[3] as QuizType)) return null;
  return { songId: parts[1], sectionId: parts[2], type: parts[3] as QuizType };
}

// --- Progression extraction ------------------------------------------

/** Whether a chord is meaningful (not a blank slot). Mirrors the bar-grid
 *  packer's filter so phrase-mode arrangement counts line up. */
function isMeaningfulChord(c: ChordFunction): boolean {
  return Boolean(c.unparsed) || c.function !== '' || c.quality !== '' || Boolean(c.bass);
}

/**
 * The arrangement to quiz from: the MOST COMPLETE one — the arrangement
 * with the most charted chords — so a half-finished alternate never wins
 * over the full chart. Ties break to the earliest-created arrangement
 * (earliest in `section.arrangements`). Falls back to the section's
 * selected/first arrangement, then the implicit 'basic', when nothing is
 * charted.
 */
export function mostCompleteArrangementId(section: SongSection): string {
  const counts = new Map<string, number>();
  for (const p of section.chordPlacements ?? []) {
    if (!isMeaningfulChord(p.chord)) continue;
    counts.set(p.arrangementId, (counts.get(p.arrangementId) ?? 0) + 1);
  }
  // Legacy phrase-anchored sections: count chords per arrangement from
  // the phrase beat maps.
  if (counts.size === 0) {
    for (const phrase of section.phrases ?? []) {
      for (const [arrId, beatMap] of Object.entries(phrase.chordsByArrangement ?? {})) {
        const n = Object.values(beatMap).filter(isMeaningfulChord).length;
        if (n > 0) counts.set(arrId, (counts.get(arrId) ?? 0) + n);
      }
    }
  }
  const fallback =
    section.activeArrangementId || section.arrangements?.[0]?.id || 'basic';
  if (counts.size === 0) return fallback;

  // Earliest-created order = position in section.arrangements.
  const order = new Map((section.arrangements ?? []).map((a, i) => [a.id, i]));
  let bestId = fallback;
  let bestCount = -1;
  let bestOrder = Number.POSITIVE_INFINITY;
  for (const [id, count] of counts) {
    const ord = order.get(id) ?? Number.POSITIVE_INFINITY;
    if (count > bestCount || (count === bestCount && ord < bestOrder)) {
      bestId = id;
      bestCount = count;
      bestOrder = ord;
    }
  }
  return bestId;
}

/** Ordered chords charted in a section's most-complete arrangement,
 *  left-to-right across the bar grid (empty bar remainders dropped). This
 *  is the raw sequence as charted — repeats included — suitable for the
 *  bar-grid reveal. Use `collapseProgression` for the compact line. */
export function sectionChords(song: Song, section: SongSection): ChordFunction[] {
  const { beatsPerBar } = parseTimeSignature(
    effectiveTimeSignature(song, section),
  );
  const bars = deriveBarGrid(section, mostCompleteArrangementId(section), beatsPerBar);
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
  return deriveBarGrid(section, mostCompleteArrangementId(section), beatsPerBar).length;
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

// --- Transposition (Types 5a / 5b) -----------------------------------

/** Common practice keys to transpose into. The drill rotates through
 *  these (minus the song's own key) across sessions so the user gets
 *  varied transposition reps. */
export const PRACTICE_KEYS: readonly string[] = ['C', 'F', 'G', 'Bb', 'D', 'Eb', 'A'];

/** Pick a transposition target key — a common practice key other than
 *  the song's original key. Pseudo-random over PRACTICE_KEYS (via `rng`)
 *  so successive cards / sessions vary. Falls back to 'C' (or the next
 *  key) if the song is already in C. */
export function pickTransposeKey(songKey: string | undefined, rng: Rng = Math.random): string {
  const own = (songKey ?? '').trim();
  const choices = PRACTICE_KEYS.filter(k => k !== own);
  const pool = choices.length > 0 ? choices : PRACTICE_KEYS;
  return pool[Math.floor(rng() * pool.length)] ?? 'C';
}

// --- Scale-degree color (bar-grid coloring) --------------------------

/** Color for a chord by its scale degree, reusing the shared interval
 *  color ramp (root deep-green, 4th purple, 5th gray, etc.) so the bar
 *  grid reads the progression's shape at a glance. Falls back to the
 *  perfect-5th gray for unresolved degrees. */
export function degreeColor(chord: ChordFunction): string {
  const semi = SEMI_BY_DEGREE[chord.function];
  return semi === undefined ? '#888780' : intervalColor(semi);
}
