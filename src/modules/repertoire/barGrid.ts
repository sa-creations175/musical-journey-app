import type {
  ChordFunction,
  ChordPlacement,
  LyricLine,
  Phrase,
  Song,
  SongSection,
} from '../../lib/db';
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

// ---------------------------------------------------------------------
// Harmonic tagging (Lead Sheet Redesign step 4). Auto-detection only
// affects the rendered visual treatment — auto tags are never written
// to Dexie. A manual tag set on `ChordFunction.harmonicTag` always
// overrides whatever the auto-detector would suggest.
// ---------------------------------------------------------------------

/**
 * True when a quality string reads as a dominant chord. Two accepted
 * prefixes (after lowercasing):
 *   · explicit `dom` — `dom7`, `dom9`, `dom13` etc.
 *   · bare extension — `7`, `9`, `11`, `13` (with `7b9`, `9(13)`,
 *     `7sus4` etc. flowing from the leading number)
 *
 * Forms that contain those digits non-initially — `maj7`, `m7`,
 * `dim7`, `add9`, `6/9` — are rejected because the leading token
 * classifies the chord as something else (major-7, minor, diminished,
 * added tone, sixth-with-nine respectively).
 */
export function isDominantQuality(quality: string): boolean {
  const q = quality.trim().toLowerCase();
  if (q === '') return false;
  if (q.startsWith('dom')) return true;
  return /^(7|9|11|13)(?![0-9])/.test(q);
}

/**
 * Coarse quality classifier used by the diatonic-mismatch detector.
 * Distinct from the cross-module `SongChord.quality` bucket because
 * it operates on the user-facing quality string (`""`, `"m7"`,
 * `"dom9(13)"`) rather than on a pre-parsed enum.
 *
 *   ''                                 → 'major' (bare triad)
 *   'maj' / 'maj7' / '6' / 'add9'      → 'major'
 *   'm' / 'm7' / 'min7'                → 'minor'
 *   '7' / '9' / 'dom7' / '13b9'        → 'dominant'
 *   'dim' / 'dim7' / '°'               → 'diminished'
 *   'm7b5' / 'ø' / 'ø7'                → 'half-dim'
 *   'aug' / '+' / 'aug7'               → 'augmented'
 *   'sus' / 'sus4' / 'sus2'            → 'sus'
 */
type QualityClass =
  | 'major'
  | 'minor'
  | 'dominant'
  | 'diminished'
  | 'half-dim'
  | 'augmented'
  | 'sus';

function classifyQuality(quality: string): QualityClass {
  const q = quality.trim().toLowerCase();
  if (q === '') return 'major';
  if (q.includes('m7b5') || q.startsWith('ø')) return 'half-dim';
  if (q.startsWith('dim') || q.startsWith('°')) return 'diminished';
  if (q.startsWith('aug') || q.startsWith('+')) return 'augmented';
  if (isDominantQuality(q)) return 'dominant';
  if (/^m(?!aj)/.test(q) || q.startsWith('min')) return 'minor';
  if (q.startsWith('sus')) return 'sus';
  return 'major';
}

// Diatonic-major chord-quality expectations per scale degree. A chord
// whose quality classifies as one of the listed values is treated as
// diatonic; anything else falls through to the borrowed-chord rule.
// Degree 5 accepts both `dominant` (V7) and `major` (bare V triad).
// Degree 7 accepts both `diminished` (vii°) and `half-dim` (viiø7).
const DIATONIC_QUALITIES_MAJOR: Record<string, ReadonlyArray<QualityClass>> = {
  '1': ['major'],
  '2': ['minor'],
  '3': ['minor'],
  '4': ['major'],
  '5': ['dominant', 'major'],
  '6': ['minor'],
  '7': ['diminished', 'half-dim'],
};

/**
 * Returns the auto-detected harmonic tag for a chord, or undefined
 * when no rule fires. Assumes the surrounding section is in a major
 * key (minor-key detection is a future enhancement).
 *
 * Rule order (first match wins):
 *   1. Dominant quality on any degree other than the literal V →
 *      'secondary_dominant'. Altered fifths (b5/#5) with dominant
 *      quality still count (tritone substitutions).
 *   2. Minor quality on the literal V →  'secondary_ii'. The V chord
 *      is functioning as ii of another local key.
 *   3. Any other quality mismatch vs the diatonic-major expectations →
 *      'borrowed'. Altered degrees (b2, b3, #4, b6, b7, b5, etc.)
 *      are non-diatonic by definition and fall through here unless
 *      rule 1 caught them.
 *
 * Sus and unknown qualities skip the borrowed check — they're
 * ambiguous embellishments that rarely indicate actual borrowing.
 * Unparsed chords always return undefined.
 */
export function autoHarmonicTag(chord: ChordFunction): string | undefined {
  if (chord.unparsed) return undefined;
  const cls = classifyQuality(chord.quality);

  // Rule 1: secondary dominant.
  if (cls === 'dominant' && chord.function !== '5') {
    return 'secondary_dominant';
  }

  // Rule 2: minor on the literal diatonic V → secondary ii.
  if (cls === 'minor' && chord.function === '5') {
    return 'secondary_ii';
  }

  // Rule 3: diatonic-quality mismatch → borrowed. Skip ambiguous
  // sus chords to avoid false positives (sus voicings are usually
  // momentary embellishments rather than mode borrowings).
  if (cls === 'sus') return undefined;

  // Altered degrees are never diatonic in a major key; if rule 1
  // didn't catch them already, the chord is borrowed.
  if (chord.function.startsWith('b') || chord.function.startsWith('#')) {
    return 'borrowed';
  }

  const expected = DIATONIC_QUALITIES_MAJOR[chord.function];
  if (!expected) return undefined;
  if (expected.includes(cls)) return undefined;
  return 'borrowed';
}

/**
 * Effective harmonic tag for a chord, combining the user's manual
 * label (which persists to Dexie) with the auto-detector (which is
 * display-only). Manual always wins, including the explicit empty
 * string which the caller can use to suppress an auto-tag.
 */
export function effectiveHarmonicTag(chord: ChordFunction): string | undefined {
  if (chord.harmonicTag !== undefined) {
    return chord.harmonicTag === '' ? undefined : chord.harmonicTag;
  }
  return autoHarmonicTag(chord);
}

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
  /** Beat position within the bar where this cell starts (0-indexed,
   *  0..beatsPerBar-1). In bar-anchored mode this comes from the
   *  placement; in legacy mode the packer assigns it sequentially. */
  beatPos: number;
  /** True when this cell continues a chord that started in the
   *  previous bar (the bar-grid renderer can draw a tie indicator). */
  tiedFromPrev?: boolean;
  /** True when this chord continues into the next bar. */
  tiedToNext?: boolean;
  /** Bar-anchored placement id (Option C). In bar-anchored mode this
   *  is the persistent `ChordPlacement.id`. In legacy phrase-anchored
   *  mode a synthetic id (`legacy:phraseId:beatId`) — operations on
   *  a legacy cell trigger migration to bar-anchored before persisting. */
  placementId: string;
  /** Legacy source phrase id (phrase-anchored mode only). Undefined
   *  in bar-anchored mode. Drives migration when the user first
   *  interacts with a legacy section's bar grid. */
  phraseId?: string;
  /** Legacy source beat id. Pair with `phraseId`. */
  beatId?: string;
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
/** Pack the section's chord placements into chord-chunk arrays of
 *  cells (each chunk = one bar's worth). Used by the legacy phrase-
 *  anchored render path; the bar-anchored path reads placements
 *  directly. */
function packChordChunks(
  cells: SourceChord[],
  beatsPerBar: number,
): BarCell[][] {
  const chunks: BarCell[][] = [];
  let current: BarCell[] = [];
  let currentBeatPos = 0;
  let remaining = beatsPerBar;
  const flush = () => {
    if (current.length === 0) return;
    chunks.push(current);
    current = [];
    currentBeatPos = 0;
    remaining = beatsPerBar;
  };
  for (const { chord, beats, phraseId, beatId } of cells) {
    let unplaced = beats;
    let firstChunk = true;
    while (unplaced > 0) {
      if (remaining === 0) flush();
      const take = Math.min(unplaced, remaining);
      const cell: BarCell = {
        chord,
        beats: take,
        beatPos: currentBeatPos,
        placementId: legacyPlacementId(phraseId, beatId),
        phraseId,
        beatId,
      };
      if (!firstChunk) cell.tiedFromPrev = true;
      if (take < unplaced) cell.tiedToNext = true;
      current.push(cell);
      currentBeatPos += take;
      remaining -= take;
      unplaced -= take;
      firstChunk = false;
    }
  }
  flush();
  return chunks;
}

/** Synthetic placement id used by the legacy phrase-anchored render
 *  path. Distinct from a real ChordPlacement id so handlers can detect
 *  legacy mode and trigger migration before persisting. */
function legacyPlacementId(phraseId: string, beatId: string): string {
  return `legacy:${phraseId}:${beatId}`;
}

/** True when a placement id was synthesised by the legacy render
 *  path. Caller should migrate the section to bar-anchored before
 *  applying an edit. */
export function isLegacyPlacementId(id: string): boolean {
  return id.startsWith('legacy:');
}

export function deriveBarGrid(
  section: SongSection,
  activeArrangementId: string,
  beatsPerBar: number,
): Bar[] {
  if (beatsPerBar <= 0) return [];

  // Bar-anchored render path (Option C). When `chordPlacements` is
  // defined, the section is fully migrated; we render each
  // placement at its explicit (barIndex, beatPos) instead of packing
  // phrase chords in document order. Mixed legacy + bar-anchored
  // isn't supported — migration converts all arrangements at once.
  if (section.chordPlacements !== undefined) {
    return deriveBarGridAnchored(section, activeArrangementId, beatsPerBar);
  }

  const cells = collectChordCells(section, activeArrangementId);
  const chordChunks = packChordChunks(cells, beatsPerBar);
  const bars: Bar[] = [];

  if (section.barLayout && section.barLayout.length > 0) {
    // Explicit layout drives bar order. Chord chunks fill 'chord'
    // entries in order; 'empty' entries render as empty bars; a
    // 'chord' entry with no remaining chunk falls through as empty.
    let chunkIdx = 0;
    for (let i = 0; i < section.barLayout.length; i++) {
      const kind = section.barLayout[i];
      if (kind === 'chord' && chunkIdx < chordChunks.length) {
        bars.push({ index: i, cells: chordChunks[chunkIdx], isEmpty: false });
        chunkIdx += 1;
      } else {
        bars.push({ index: i, cells: [], isEmpty: true });
      }
    }
    // Auto-grow: chord chunks beyond the explicit layout append as
    // chord bars so a user adding new chords via the phrase editor
    // doesn't silently lose bars.
    while (chunkIdx < chordChunks.length) {
      bars.push({ index: bars.length, cells: chordChunks[chunkIdx], isEmpty: false });
      chunkIdx += 1;
    }
    return bars;
  }

  // Legacy / unset layout: chord chunks + barCount padding at end.
  for (let i = 0; i < chordChunks.length; i++) {
    bars.push({ index: i, cells: chordChunks[i], isEmpty: false });
  }
  const requested = section.barCount ?? 0;
  while (bars.length < requested) {
    bars.push({ index: bars.length, cells: [], isEmpty: true });
  }
  return bars;
}

// ---------------------------------------------------------------------
// Option C — bar-anchored chord placements
// ---------------------------------------------------------------------

/** Bar-anchored render path. Walks `section.chordPlacements` (filtered
 *  to the active arrangement) and emits one `Bar` per layout position,
 *  with each placement landing at its explicit (barIndex, beatPos)
 *  inside its bar. Bars without placements come back empty so the
 *  per-beat-empty droppables can render. */
function deriveBarGridAnchored(
  section: SongSection,
  activeArrangementId: string,
  beatsPerBar: number,
): Bar[] {
  const placements = (section.chordPlacements ?? []).filter(
    p =>
      p.arrangementId === activeArrangementId &&
      p.beatPos >= 0 &&
      p.beatPos < beatsPerBar,
  );
  // Group by barIndex for fast lookup; sort within each bar by beatPos.
  const byBar = new Map<number, ChordPlacement[]>();
  let maxBar = -1;
  for (const p of placements) {
    if (p.barIndex < 0) continue;
    if (p.barIndex > maxBar) maxBar = p.barIndex;
    const list = byBar.get(p.barIndex);
    if (list) list.push(p);
    else byBar.set(p.barIndex, [p]);
  }
  for (const list of byBar.values()) {
    list.sort((a, b) => a.beatPos - b.beatPos);
  }

  // Total bar count = max(barLayout.length, placements' max bar + 1,
  // barCount). Honors explicit empty bars + the legacy padding field.
  let totalBars = Math.max(maxBar + 1, section.barCount ?? 0);
  const layout = section.barLayout;
  if (layout && layout.length > totalBars) totalBars = layout.length;

  const bars: Bar[] = [];
  for (let i = 0; i < totalBars; i++) {
    // barLayout 'empty' positions stay empty even if a placement
    // happens to point there — layout wins (rare, only on bad data).
    const explicitlyEmpty = layout?.[i] === 'empty';
    const here = explicitlyEmpty ? [] : byBar.get(i) ?? [];
    const cells: BarCell[] = here.map(p => ({
      chord: p.chord,
      beats: sanitiseBeats(p.beats),
      beatPos: p.beatPos,
      placementId: p.id,
    }));
    bars.push({ index: i, cells, isEmpty: cells.length === 0 });
  }
  return bars;
}

/** Deterministic id for a placement materialised from a legacy
 *  phrase-anchored chord. Lets the handlers map a legacy `BarCell`
 *  id (`legacy:phraseId:beatId`) to its post-migration placement
 *  without threading a side-channel mapping table. Format is
 *  intentionally distinct from `crypto.randomUUID` so user-added
 *  placements (uuid) and migrated ones (`mat-…`) stay collision-free. */
export function migratedPlacementId(
  arrangementId: string,
  phraseId: string,
  beatId: string,
): string {
  return `mat-${arrangementId}-${phraseId}-${beatId}`;
}

/** Resolve a legacy `BarCell.placementId` (`legacy:phraseId:beatId`)
 *  to the post-migration placement id for a given arrangement. Returns
 *  undefined when the input isn't a legacy id. Useful in the chord-
 *  edit handlers: if the active placementId is legacy, materialize
 *  first then look up the real id with this helper. */
export function resolveLegacyPlacementId(
  legacyId: string,
  arrangementId: string,
): string | undefined {
  if (!isLegacyPlacementId(legacyId)) return undefined;
  const rest = legacyId.slice('legacy:'.length);
  const colonIdx = rest.indexOf(':');
  if (colonIdx < 0) return undefined;
  const phraseId = rest.slice(0, colonIdx);
  const beatId = rest.slice(colonIdx + 1);
  return migratedPlacementId(arrangementId, phraseId, beatId);
}

/** Convert a section's legacy phrase-anchored chords into bar-anchored
 *  ChordPlacement entries — one entry per chord cell that the legacy
 *  packer would have produced. Walks ALL arrangements so the migration
 *  is complete in a single pass.
 *
 *  Idempotent: if `section.chordPlacements` is already defined,
 *  returns it unchanged (caller can skip the commit).
 *
 *  Uses deterministic `migratedPlacementId(arrId, phraseId, beatId)`
 *  ids so `resolveLegacyPlacementId` can map a still-rendering legacy
 *  BarCell id to its new placement id in a single op.
 */
export function materializeChordPlacements(
  section: SongSection,
  beatsPerBar: number,
): ChordPlacement[] {
  if (section.chordPlacements !== undefined) return section.chordPlacements;
  const arrangementIds = collectArrangementIds(section);
  const out: ChordPlacement[] = [];
  for (const arrId of arrangementIds) {
    const sourceCells = collectChordCells(section, arrId);
    const chunks = packChordChunks(sourceCells, beatsPerBar);
    for (let barIndex = 0; barIndex < chunks.length; barIndex++) {
      for (const cell of chunks[barIndex]) {
        // Skip tied continuations — they share a placement with the
        // leading half. Tie-splits collapse to a single chord whose
        // beats may exceed beatsPerBar; that's preserved verbatim.
        if (cell.tiedFromPrev) continue;
        // Compute the chord's full beats by summing the chunk + any
        // continuation segments. Walk forward across bars until we
        // find a cell that isn't tiedFromPrev with the same source.
        const totalBeats = sumChordBeats(chunks, barIndex, cell);
        const placementId =
          cell.phraseId && cell.beatId
            ? migratedPlacementId(arrId, cell.phraseId, cell.beatId)
            : crypto.randomUUID();
        out.push({
          id: placementId,
          arrangementId: arrId,
          barIndex,
          beatPos: cell.beatPos,
          beats: totalBeats,
          chord: cell.chord,
        });
      }
    }
  }
  return out;
}

function collectArrangementIds(section: SongSection): string[] {
  const ids = new Set<string>();
  for (const phrase of section.phrases ?? []) {
    const arrangements = phrase.chordsByArrangement ?? {};
    for (const arrId of Object.keys(arrangements)) ids.add(arrId);
  }
  if (ids.size === 0) ids.add('basic');
  return Array.from(ids);
}

/** Sum the beats of a chord that may have been tie-split across bars
 *  by the legacy packer. Walks forward from the chunk position until
 *  the next non-continuation cell or end of chunks. */
function sumChordBeats(
  chunks: BarCell[][],
  startBar: number,
  startCell: BarCell,
): number {
  let total = startCell.beats;
  if (!startCell.tiedToNext) return total;
  let bar = startBar + 1;
  while (bar < chunks.length) {
    const first = chunks[bar][0];
    if (!first || !first.tiedFromPrev) break;
    if (first.phraseId !== startCell.phraseId || first.beatId !== startCell.beatId) break;
    total += first.beats;
    if (!first.tiedToNext) break;
    bar += 1;
  }
  return total;
}

// --- CRUD helpers on ChordPlacement[] --------------------------------
// All pure: take the current placements array, return a new one. The
// caller (LeadSheetSection) commits via `commit({ chordPlacements })`.

/** Append a new placement. */
export function addChordPlacement(
  placements: ReadonlyArray<ChordPlacement>,
  placement: ChordPlacement,
): ChordPlacement[] {
  return [...placements, placement];
}

/** Drop the placement with the matching id. */
export function removeChordPlacement(
  placements: ReadonlyArray<ChordPlacement>,
  placementId: string,
): ChordPlacement[] {
  return placements.filter(p => p.id !== placementId);
}

/** Shallow-merge a patch onto the matching placement. Used by the
 *  chord-edit popover (beats / tag / chord function changes). */
export function updateChordPlacement(
  placements: ReadonlyArray<ChordPlacement>,
  placementId: string,
  patch: Partial<Omit<ChordPlacement, 'id'>>,
): ChordPlacement[] {
  return placements.map(p => (p.id === placementId ? { ...p, ...patch } : p));
}

/** Move a placement to a new (barIndex, beatPos). Used by chord-onto-
 *  empty-beat drag. The caller is responsible for ensuring the
 *  destination beat is empty (no overlap with another placement); the
 *  collision detection in BarGridView already guarantees this since
 *  emptybeat droppables only render at unoccupied beat positions. */
export function moveChordPlacement(
  placements: ReadonlyArray<ChordPlacement>,
  placementId: string,
  barIndex: number,
  beatPos: number,
): ChordPlacement[] {
  const target = placements.find(p => p.id === placementId);
  if (!target) return [...placements];
  if (target.barIndex === barIndex && target.beatPos === beatPos) {
    return [...placements];
  }
  return placements.map(p =>
    p.id === placementId ? { ...p, barIndex, beatPos } : p,
  );
}

/** Swap two placements' bar/beat positions. Used by chord-onto-chord
 *  drag. Each chord's metadata (beats, harmonicTag, function, etc.)
 *  travels with its placement; only the anchors swap. */
export function swapChordPlacements(
  placements: ReadonlyArray<ChordPlacement>,
  fromId: string,
  toId: string,
): ChordPlacement[] {
  if (fromId === toId) return [...placements];
  const from = placements.find(p => p.id === fromId);
  const to = placements.find(p => p.id === toId);
  if (!from || !to) return [...placements];
  return placements.map(p => {
    if (p.id === fromId) return { ...p, barIndex: to.barIndex, beatPos: to.beatPos };
    if (p.id === toId) return { ...p, barIndex: from.barIndex, beatPos: from.beatPos };
    return p;
  });
}

/** Permute placements' barIndex via an old→new bar-position map.
 *  Used by `reorderBar` after computing the layout permutation, so
 *  chord data follows its bar through a drag reorder. */
export function remapPlacementBars(
  placements: ReadonlyArray<ChordPlacement>,
  oldToNew: Map<number, number>,
): ChordPlacement[] {
  return placements.map(p => {
    const next = oldToNew.get(p.barIndex);
    if (next === undefined || next === p.barIndex) return p;
    return { ...p, barIndex: next };
  });
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/**
 * Whole-bar reorder. Moves the bar at `fromIndex` to `toIndex` and
 * returns a transactional patch the caller commits together so chord
 * placements (or legacy phrases), layout, and lyric anchors stay in
 * sync.
 *
 * Bar-anchored mode (Option C): when `section.chordPlacements` is
 * defined, placements get their `barIndex` remapped via the old→new
 * bar permutation. Legacy mode: phrase chords permute the same way
 * the old chord-bar reorder used to (preserved for unmigrated
 * sections + tests).
 *
 * Returns `null` for no-op moves (same index, out of range, empty
 * section).
 */
export function reorderBar(
  section: SongSection,
  activeArrangementId: string,
  fromIndex: number,
  toIndex: number,
  beatsPerBar: number,
): {
  phrases?: Phrase[];
  chordPlacements?: ChordPlacement[];
  barLayout: Array<'chord' | 'empty'>;
  lyricLines: LyricLine[];
} | null {
  if (fromIndex === toIndex) return null;
  if (beatsPerBar <= 0) return null;

  const currentBars = deriveBarGrid(section, activeArrangementId, beatsPerBar);
  if (currentBars.length === 0) return null;

  const currentLayout: Array<'chord' | 'empty'> = section.barLayout
    ? [...section.barLayout]
    : currentBars.map(b => (b.isEmpty ? 'empty' : 'chord'));

  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= currentLayout.length ||
    toIndex >= currentLayout.length
  ) {
    return null;
  }

  const newLayout = arrayMove(currentLayout, fromIndex, toIndex);

  // Bar-index permutation: for each old position, where does it land?
  const oldToNew = new Map<number, number>();
  for (let i = 0; i < currentLayout.length; i++) oldToNew.set(i, i);
  if (fromIndex < toIndex) {
    oldToNew.set(fromIndex, toIndex);
    for (let i = fromIndex + 1; i <= toIndex; i++) oldToNew.set(i, i - 1);
  } else {
    oldToNew.set(fromIndex, toIndex);
    for (let i = toIndex; i < fromIndex; i++) oldToNew.set(i, i + 1);
  }

  const lyricLines = (section.lyricLines ?? []).map(line => ({
    ...line,
    startBar: oldToNew.get(line.startBar) ?? line.startBar,
    endBar: oldToNew.get(line.endBar) ?? line.endBar,
  }));

  // Bar-anchored mode (Option C): remap placements' barIndex via the
  // old→new permutation. Each chord follows its bar through the move
  // without touching beatPos or chord data.
  if (section.chordPlacements !== undefined) {
    const chordPlacements = remapPlacementBars(section.chordPlacements, oldToNew);
    return { chordPlacements, barLayout: newLayout, lyricLines };
  }

  let phrases = section.phrases ?? [];

  // Legacy phrase-anchored mode. Chord placement permutation only
  // fires when the moved bar is a chord bar (empty-bar moves don't
  // touch chord data).
  if (currentLayout[fromIndex] === 'chord') {
    const countChordsBefore = (
      layout: Array<'chord' | 'empty'>,
      pos: number,
    ): number => {
      let count = 0;
      for (let i = 0; i < pos; i++) {
        if (layout[i] === 'chord') count += 1;
      }
      return count;
    };
    const fromChunkIdx = countChordsBefore(currentLayout, fromIndex);
    const toChunkIdx = countChordsBefore(newLayout, toIndex);

    if (fromChunkIdx !== toChunkIdx) {
      // Per-chunk placement groups (each = one bar's worth, leading
      // halves only — trailing tied halves share the placement id).
      const chordChunks = currentBars.filter(b => !b.isEmpty);
      const placementGroups = chordChunks.map(chunk =>
        chunk.cells
          .filter(c => !c.tiedFromPrev)
          .map(c => ({ phraseId: c.phraseId, beatId: c.beatId, chord: c.chord })),
      );
      const reorderedGroups = arrayMove(placementGroups, fromChunkIdx, toChunkIdx);
      const newPlacementOrder = reorderedGroups.flat();

      // Snapshot phrase/beat slots in document order so we can map
      // the new chord values back to them position-by-position.
      const slots: Array<{ phraseId: string; beatId: string }> = [];
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
          slots.push({ phraseId: phrase.id, beatId: beat.id });
        }
      }

      const newBySlot = new Map<string, ChordFunction>();
      for (let i = 0; i < slots.length && i < newPlacementOrder.length; i++) {
        const key = `${slots[i].phraseId}:${slots[i].beatId}`;
        newBySlot.set(key, newPlacementOrder[i].chord);
      }

      phrases = phrases.map(phrase => {
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
  }

  return { phrases, barLayout: newLayout, lyricLines };
}
