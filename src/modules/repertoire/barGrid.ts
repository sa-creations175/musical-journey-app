import type { ChordFunction, Song, SongSection } from '../../lib/db';
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

/** Flatten a section's chord placements (for the active arrangement)
 *  into a single document-order list of `{ chord, beats }` pairs. */
function collectChordCells(
  section: SongSection,
  activeArrangementId: string,
): Array<{ chord: ChordFunction; beats: number }> {
  const out: Array<{ chord: ChordFunction; beats: number }> = [];
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
      out.push({ chord, beats });
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

  for (const { chord, beats } of cells) {
    let unplaced = beats;
    let firstChunk = true;
    while (unplaced > 0) {
      if (remaining === 0) flush();
      const take = Math.min(unplaced, remaining);
      const cell: BarCell = { chord, beats: take };
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
