import type { LyricLine } from '../../lib/db';

// Pure helpers for the lyric-line model (Lead Sheet Redesign step 6,
// May 2026 — docs/LEAD_SHEET_REDESIGN.md).
//
// A line carries a list of words and a beat range (startBar/startBeat
// → endBar/endBeat, inclusive). At render time the words distribute
// evenly across the range — first word at the start global beat, last
// word at the end global beat. Per-word `wordOffsets` add a small
// nudge on top of the even distribution.
//
// "Global beat" = barIndex * beatsPerBar + beatWithinBar. Treating
// beats as one continuous axis keeps the distribution math simple
// across bar boundaries.

function toGlobalBeat(bar: number, beat: number, beatsPerBar: number): number {
  return bar * beatsPerBar + beat;
}

function toBarBeat(
  globalBeat: number,
  beatsPerBar: number,
): { bar: number; beat: number } {
  // Floor for the bar index and modulo for the beat — clamping to
  // valid ranges happens at the caller; the helper assumes a non-
  // negative input.
  if (beatsPerBar <= 0) return { bar: 0, beat: 0 };
  const safe = Math.max(0, globalBeat);
  return { bar: Math.floor(safe / beatsPerBar), beat: safe % beatsPerBar };
}

/** Tokenize a paste of lyric text into one word-list per line. Splits
 *  the input on newlines; within each line splits on whitespace and
 *  drops empties. Empty lines are dropped entirely.
 *
 *   "yeah, yeah\nyou know it" → [["yeah,","yeah"], ["you","know","it"]]
 *
 *  Used by the staging area to convert a single paste into N
 *  LyricLines (one per text line).
 */
export function tokenizeLyricLines(text: string): string[][] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map(line =>
      line
        .split(/\s+/)
        .map(w => w.trim())
        .filter(w => w.length > 0),
    )
    .filter(line => line.length > 0);
}

/**
 * Absolute beat position (float) of each word in the line. First word
 * sits at the start global beat; last word at the end global beat;
 * intermediate words spaced evenly. A single-word line places its one
 * word at the start. `wordOffsets[i]`, when present, adds to the base
 * position; missing entries are treated as zero.
 *
 * Returns `[]` for a wordless line.
 */
export function distributedWordPositions(
  line: LyricLine,
  beatsPerBar: number,
): number[] {
  const n = line.words.length;
  if (n === 0) return [];
  const startGlobal = toGlobalBeat(line.startBar, line.startBeat, beatsPerBar);
  const endGlobal = toGlobalBeat(line.endBar, line.endBeat, beatsPerBar);
  const totalBeats = Math.max(0, endGlobal - startGlobal);
  const offsets = line.wordOffsets ?? [];
  const positions: number[] = [];
  for (let i = 0; i < n; i++) {
    const base =
      n === 1 ? startGlobal : startGlobal + (i * totalBeats) / (n - 1);
    positions.push(base + (offsets[i] ?? 0));
  }
  return positions;
}

/**
 * Move the start marker. Per spec, words re-distribute evenly across
 * the new range, so `wordOffsets` resets. The drag is refused
 * (returns the line unchanged) if the new start would land at or past
 * the current end — the line must keep a positive range.
 */
export function applyStartMarkerDrag(
  line: LyricLine,
  newStartBar: number,
  newStartBeat: number,
  beatsPerBar: number,
): LyricLine {
  const newStart = toGlobalBeat(newStartBar, newStartBeat, beatsPerBar);
  const end = toGlobalBeat(line.endBar, line.endBeat, beatsPerBar);
  if (newStart >= end && !(line.startBar === line.endBar && line.startBeat === line.endBeat)) {
    return line;
  }
  if (newStart < 0) return line;
  return {
    ...line,
    startBar: newStartBar,
    startBeat: newStartBeat,
    wordOffsets: undefined,
  };
}

/**
 * Move the end marker. Mirror of `applyStartMarkerDrag` — refuses a
 * drag that would land at or before the current start.
 */
export function applyEndMarkerDrag(
  line: LyricLine,
  newEndBar: number,
  newEndBeat: number,
  beatsPerBar: number,
): LyricLine {
  const newEnd = toGlobalBeat(newEndBar, newEndBeat, beatsPerBar);
  const start = toGlobalBeat(line.startBar, line.startBeat, beatsPerBar);
  if (newEnd <= start && !(line.startBar === line.endBar && line.startBeat === line.endBeat)) {
    return line;
  }
  return {
    ...line,
    endBar: newEndBar,
    endBeat: newEndBeat,
    wordOffsets: undefined,
  };
}

/**
 * Apply a nudge to one word's offset. `beatDelta` is added to the
 * existing offset (initializing the offsets array to zeros first when
 * missing). The resulting word position is clamped to stay within the
 * line's [startGlobalBeat, endGlobalBeat] range — a word can't be
 * nudged outside its line's markers.
 */
export function applyWordNudge(
  line: LyricLine,
  wordIndex: number,
  beatDelta: number,
  beatsPerBar: number,
): LyricLine {
  if (wordIndex < 0 || wordIndex >= line.words.length) return line;
  const base = distributedWordPositions(
    { ...line, wordOffsets: undefined },
    beatsPerBar,
  );
  const startGlobal = toGlobalBeat(line.startBar, line.startBeat, beatsPerBar);
  const endGlobal = toGlobalBeat(line.endBar, line.endBeat, beatsPerBar);

  const offsets = new Array<number>(line.words.length).fill(0);
  const existing = line.wordOffsets ?? [];
  for (let i = 0; i < line.words.length; i++) {
    offsets[i] = existing[i] ?? 0;
  }
  offsets[wordIndex] += beatDelta;
  const newPos = base[wordIndex] + offsets[wordIndex];
  if (newPos < startGlobal) offsets[wordIndex] = startGlobal - base[wordIndex];
  if (newPos > endGlobal) offsets[wordIndex] = endGlobal - base[wordIndex];
  return { ...line, wordOffsets: offsets };
}

/** Convert an absolute global-beat value back to a (bar, beat) pair.
 *  Exposed for the drag-end handler, which wants to compute which
 *  beat slot a marker was dropped onto. */
export function globalBeatToBarBeat(
  globalBeat: number,
  beatsPerBar: number,
): { bar: number; beat: number } {
  return toBarBeat(globalBeat, beatsPerBar);
}

// --- Syllable split / join (Lead Sheet Redesign step 7) ---------------
//
// A word in a LyricLine can be split into two syllables (e.g.
// "somethin'" → ["some", "thin'"]). The two syllables become separate
// entries in `words` and each gets its own offset so they can be
// nudged independently. Joining is the inverse — merges adjacent
// words back into one and keeps the first word's offset.

/**
 * Split `line.words[wordIndex]` at character position `splitAt` into
 * two adjacent entries. The first piece keeps `words[wordIndex]`'s
 * slot; the second piece is inserted at `wordIndex + 1`.
 *
 * `wordOffsets` grows by one entry. The new second-syllable offset
 * defaults to `(existing offset for wordIndex) + 0.5`, clamped to
 * keep the syllable's position inside the line's [startGlobal,
 * endGlobal] range.
 *
 * No-op (returns the line unchanged) when `wordIndex` is out of
 * range, `splitAt < 1`, or `splitAt >= word.length` (we refuse
 * splits that would produce an empty string on either side).
 */
export function splitWord(
  line: LyricLine,
  wordIndex: number,
  splitAt: number,
  beatsPerBar: number,
): LyricLine {
  if (wordIndex < 0 || wordIndex >= line.words.length) return line;
  const word = line.words[wordIndex];
  if (splitAt < 1 || splitAt >= word.length) return line;

  const firstHalf = word.slice(0, splitAt);
  const secondHalf = word.slice(splitAt);

  const newWords = [
    ...line.words.slice(0, wordIndex),
    firstHalf,
    secondHalf,
    ...line.words.slice(wordIndex + 1),
  ];

  // Carry existing offsets verbatim across the split. The new entry
  // at wordIndex+1 inherits (offset of wordIndex) + 0.5 so the split
  // syllable lands just after the first half by default.
  const existing = line.wordOffsets ?? [];
  const firstOffset = existing[wordIndex] ?? 0;
  const newOffsets: number[] = [];
  for (let i = 0; i < wordIndex; i++) newOffsets.push(existing[i] ?? 0);
  newOffsets.push(firstOffset);
  newOffsets.push(firstOffset + 0.5);
  for (let i = wordIndex + 1; i < line.words.length; i++) {
    newOffsets.push(existing[i] ?? 0);
  }

  // Clamp the new syllable's offset so its position stays inside the
  // line's range. Uses the post-split distribution since the word
  // count just grew — the new syllable's base position lives at the
  // new (wordIndex+1) slot.
  const draft: LyricLine = {
    ...line,
    words: newWords,
    wordOffsets: undefined,
  };
  const newBase = distributedWordPositions(draft, beatsPerBar)[wordIndex + 1];
  const startGlobal = toGlobalBeat(line.startBar, line.startBeat, beatsPerBar);
  const endGlobal = toGlobalBeat(line.endBar, line.endBeat, beatsPerBar);
  const desired = newBase + newOffsets[wordIndex + 1];
  if (desired < startGlobal) {
    newOffsets[wordIndex + 1] = startGlobal - newBase;
  } else if (desired > endGlobal) {
    newOffsets[wordIndex + 1] = endGlobal - newBase;
  }

  return { ...line, words: newWords, wordOffsets: newOffsets };
}

/**
 * Join `line.words[wordIndex]` and `line.words[wordIndex + 1]` into a
 * single entry. The merged word keeps the first word's offset; the
 * second's offset is dropped. Other words' offsets stay put.
 *
 * No-op when `wordIndex` is out of range or there's no next word.
 */
export function joinWords(line: LyricLine, wordIndex: number): LyricLine {
  if (wordIndex < 0 || wordIndex >= line.words.length - 1) return line;

  const merged = line.words[wordIndex] + line.words[wordIndex + 1];
  const newWords = [
    ...line.words.slice(0, wordIndex),
    merged,
    ...line.words.slice(wordIndex + 2),
  ];

  const existing = line.wordOffsets ?? [];
  // Only carry an offsets array forward if any were actually set;
  // otherwise leave undefined so distributedWordPositions falls back
  // to bare even distribution.
  if (existing.length === 0) {
    return { ...line, words: newWords };
  }
  const newOffsets: number[] = [];
  for (let i = 0; i < wordIndex; i++) newOffsets.push(existing[i] ?? 0);
  newOffsets.push(existing[wordIndex] ?? 0);
  for (let i = wordIndex + 2; i < line.words.length; i++) {
    newOffsets.push(existing[i] ?? 0);
  }
  return { ...line, words: newWords, wordOffsets: newOffsets };
}

/**
 * Replace the text of `line.words[wordIndex]` with `nextText`. Used by
 * the inline syllable editor (tap a syllable, type a new value) to fix
 * typos or change a syllable's content without splitting/joining.
 *
 * The text is trimmed before storing. No-op (returns the line
 * unchanged) when `wordIndex` is out of range, the trimmed value is
 * empty (we refuse to leave an empty syllable), or the trimmed value
 * is identical to the current word. `wordOffsets` are preserved as-is
 * — only the word's text changes, not its position.
 */
export function setWordText(
  line: LyricLine,
  wordIndex: number,
  nextText: string,
): LyricLine {
  if (wordIndex < 0 || wordIndex >= line.words.length) return line;
  const trimmed = nextText.trim();
  if (trimmed === '') return line;
  if (trimmed === line.words[wordIndex]) return line;
  const newWords = [...line.words];
  newWords[wordIndex] = trimmed;
  return { ...line, words: newWords };
}
