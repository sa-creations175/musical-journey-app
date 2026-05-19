import type { ChordFunction, Phrase, Song, SongSection } from '../../lib/db';
import { normalizePhrase } from './beatsModel';

// Bar-grid derivation for the redesigned lead sheet view
// (Lead Sheet Redesign, May 2026 — docs/LEAD_SHEET_REDESIGN.md).
//
// The phrase/beat data model anchors a ChordFunction to a beat id
// inside a phrase; it doesn't carry duration intrinsically. Step 1 of
// the redesign added `ChordFunction.beats?: number` (default 1) so each
// chord cell now knows how wide it is inside its bar. The renderer
// concatenates chord cells in document order across phrases and packs
// them into bars sized by the section's time signature.
//
// Backward compatibility: existing chords have no `beats` field, so
// they all read as 1-beat cells and render as uniform boxes — the
// user enriches the timing per-song over time.

const DEFAULT_TIME_SIGNATURE = '4/4';

export interface BarCell {
  /** Original chord placement. Undefined slots represent the empty
   *  remainder of a bar (e.g. a 2-beat chord in a 4/4 bar leaves 2
   *  trailing beats with no chord cell). */
  chord: ChordFunction;
  /** Beats this chord occupies inside the bar. Always >= 1. When a
   *  chord's declared `beats` exceeds the bar's remaining capacity it
   *  is split: this cell carries the chunk that fits in the current
   *  bar, and `tiedFromPrev`/`tiedToNext` flags mark the split. */
  beats: number;
  /** True when this cell continues a chord that started in the
   *  previous bar (the bar-grid renderer can draw a tie indicator). */
  tiedFromPrev?: boolean;
  /** True when this chord continues into the next bar. */
  tiedToNext?: boolean;
  /** Source phrase id this chord placement lives on. Used by the
   *  bar-grid editor to persist beat-count changes back to Dexie via
   *  Phrase.chordsByArrangement[arrId][beatId]. Both halves of a
   *  tie-split cell share the same phraseId + beatId since they
   *  represent one underlying chord placement. */
  phraseId: string;
  /** Source beat id within the phrase. See `phraseId`. */
  beatId: string;
}

export interface Bar {
  /** Zero-indexed bar number within the section. */
  index: number;
  /** Chord cells inside this bar, left-to-right. Total of `cells[].beats`
   *  equals `beatsPerBar` when the bar is full, or less when the
   *  section ends mid-bar. */
  cells: BarCell[];
  /** True when the bar has no chords and is purely an empty remainder. */
  isEmpty: boolean;
}

/** Parse a time-signature string into its numerator / denominator.
 *  Falls back to 4/4 for unrecognised or missing input. Free-text
 *  values like "12/8" or "5/4" parse normally; gibberish defaults. */
export function parseTimeSignature(ts: string | undefined | null): {
  beatsPerBar: number;
  beatUnit: number;
} {
  if (!ts) return { beatsPerBar: 4, beatUnit: 4 };
  const match = ts.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return { beatsPerBar: 4, beatUnit: 4 };
  const beatsPerBar = parseInt(match[1], 10);
  const beatUnit = parseInt(match[2], 10);
  if (!Number.isFinite(beatsPerBar) || beatsPerBar <= 0) {
    return { beatsPerBar: 4, beatUnit: 4 };
  }
  if (!Number.isFinite(beatUnit) || beatUnit <= 0) {
    return { beatsPerBar, beatUnit: 4 };
  }
  return { beatsPerBar, beatUnit };
}

/** Resolve the time signature for a section: section override →
 *  song-level default → "4/4". */
export function effectiveTimeSignature(
  song: Pick<Song, 'timeSignature'> | undefined | null,
  section: Pick<SongSection, 'timeSignature'> | undefined | null,
): string {
  return (
    section?.timeSignature?.trim() ||
    song?.timeSignature?.trim() ||
    DEFAULT_TIME_SIGNATURE
  );
}

interface SourceChord {
  chord: ChordFunction;
  beats: number;
  phraseId: string;
  beatId: string;
}

/** Flatten a section's chord placements (for the active arrangement)
 *  into a single document-order list with source identifiers attached
 *  so the bar-grid editor can write changes back to the right slot. */
function collectChordCells(
  section: SongSection,
  activeArrangementId: string,
): SourceChord[] {
  const out: SourceChord[] = [];
  for (const phrase of section.phrases ?? []) {
    const normalised = normalizePhrase(phrase);
    const placements = normalised.chordsByArrangement[activeArrangementId] ?? {};
    for (const beat of normalised.beats) {
      const chord = placements[beat.id];
      if (!chord) continue;
      // Skip truly empty placements but keep unparsed ones — the user
      // typed something and should see it in the grid.
      const isMeaningful =
        chord.unparsed ||
        chord.function !== '' ||
        chord.quality !== '' ||
        Boolean(chord.bass);
      if (!isMeaningful) continue;
      const beats = sanitiseBeats(chord.beats);
      out.push({ chord, beats, phraseId: phrase.id, beatId: beat.id });
    }
  }
  return out;
}

function sanitiseBeats(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return 1;
  const rounded = Math.round(raw);
  return rounded >= 1 ? rounded : 1;
}

/**
 * Pack the section's chord placements into bars of `beatsPerBar`
 * beats each. A chord whose `beats` exceeds the bar's remaining
 * capacity is split across bars with `tiedToNext`/`tiedFromPrev`
 * markers — no chord data is dropped.
 *
 * Returns an empty array when the section has no meaningful chord
 * placements (the renderer can fall back to an "add chords" hint).
 */
export function deriveBarGrid(
  section: SongSection,
  activeArrangementId: string,
  beatsPerBar: number,
): Bar[] {
  if (beatsPerBar <= 0) return [];
  const cells = collectChordCells(section, activeArrangementId);
  if (cells.length === 0) return [];

  const bars: Bar[] = [];
  let current: BarCell[] = [];
  let remaining = beatsPerBar;
  let barIndex = 0;

  const flush = () => {
    if (current.length === 0) return;
    bars.push({ index: barIndex, cells: current, isEmpty: false });
    barIndex += 1;
    current = [];
    remaining = beatsPerBar;
  };

  for (const { chord, beats, phraseId, beatId } of cells) {
    let unplaced = beats;
    let firstChunk = true;
    while (unplaced > 0) {
      if (remaining === 0) flush();
      const take = Math.min(unplaced, remaining);
      const cell: BarCell = { chord, beats: take, phraseId, beatId };
      if (!firstChunk) cell.tiedFromPrev = true;
      if (take < unplaced) cell.tiedToNext = true;
      current.push(cell);
      remaining -= take;
      unplaced -= take;
      firstChunk = false;
    }
  }
  flush();
  return bars;
}

/**
 * Reorder chord placements within the bar grid (Lead Sheet Redesign
 * step 3 — drag-to-reorder). The slot positions (phrase + beat
 * anchors) stay where they are; only which chord lives at each slot
 * changes. This keeps lyric anchoring intact and matches the
 * redesign's "lyrics decoupled from chord positions" intent.
 *
 * Returns a new array of phrases with the active arrangement's
 * chord placements rewritten. Returns `null` when the move is a
 * no-op (same index, out of range, or section has no placements) so
 * the caller can skip the Dexie commit.
 */
export function reorderChordPlacements(
  section: SongSection,
  activeArrangementId: string,
  fromIndex: number,
  toIndex: number,
): Phrase[] | null {
  if (fromIndex === toIndex) return null;
  const phrases = section.phrases ?? [];
  if (phrases.length === 0) return null;

  // Snapshot every meaningful placement in document order, alongside
  // its source phrase + beat. The order of `slots` is the canonical
  // visual order shown in the bar grid.
  const slots: Array<{ phraseId: string; beatId: string; chord: ChordFunction }> = [];
  for (const phrase of phrases) {
    const normalised = normalizePhrase(phrase);
    const placements = normalised.chordsByArrangement[activeArrangementId] ?? {};
    for (const beat of normalised.beats) {
      const chord = placements[beat.id];
      if (!chord) continue;
      const isMeaningful =
        chord.unparsed ||
        chord.function !== '' ||
        chord.quality !== '' ||
        Boolean(chord.bass);
      if (!isMeaningful) continue;
      slots.push({ phraseId: phrase.id, beatId: beat.id, chord });
    }
  }
  if (slots.length === 0) return null;
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= slots.length ||
    toIndex >= slots.length
  ) {
    return null;
  }

  // Move just the chord values; the slot anchors stay put. Using
  // arrayMove semantics (splice-remove + splice-insert) keeps the
  // ordering predictable when fromIndex < toIndex vs the reverse.
  const chords = slots.map(s => s.chord);
  const [moved] = chords.splice(fromIndex, 1);
  chords.splice(toIndex, 0, moved);

  // Build a lookup: `${phraseId}:${beatId}` → new chord. Then rebuild
  // each affected phrase's chordsByArrangement[activeArrangementId]
  // by walking its beats and assigning the new value at each slot.
  const newBySlot = new Map<string, ChordFunction>();
  for (let i = 0; i < slots.length; i++) {
    const key = `${slots[i].phraseId}:${slots[i].beatId}`;
    newBySlot.set(key, chords[i]);
  }

  return phrases.map(phrase => {
    const normalised = normalizePhrase(phrase);
    const oldPlacements = normalised.chordsByArrangement[activeArrangementId] ?? {};
    let changed = false;
    const nextPlacements: Record<string, ChordFunction> = { ...oldPlacements };
    for (const beat of normalised.beats) {
      const key = `${phrase.id}:${beat.id}`;
      if (!newBySlot.has(key)) continue;
      const next = newBySlot.get(key)!;
      if (oldPlacements[beat.id] !== next) {
        nextPlacements[beat.id] = next;
        changed = true;
      }
    }
    if (!changed) return phrase;
    return {
      ...phrase,
      beats: normalised.beats,
      chordsByArrangement: {
        ...normalised.chordsByArrangement,
        [activeArrangementId]: nextPlacements,
      },
    };
  });
}
