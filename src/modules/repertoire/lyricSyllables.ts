import type {
  LyricLine,
  LyricSyllable,
  LyricSyllableAnchor,
  SongLyricLine,
} from '../../lib/db';
import { distributedWordPositions } from './lyricLine';
import {
  isHeaderLine,
  parseLyricSheet,
  type ParsedLyricRow,
} from './lyricSheetParse';

// Song-owned lyric model (Lyric Placement Redesign rev 3, Aug 2026 —
// docs/LYRIC_SYLLABLE_PLACEMENT_AUDIT_AND_PLAN.md).
//
// Everything here is pure: take the current lines, return new ones. The
// caller commits. Mirrors the shape barGrid.ts uses for ChordPlacement,
// deliberately — the two solve the same problem (derived positions
// replaced by explicit anchors) and should read the same way.
//
// THE INVARIANT this module exists to enforce: a placed syllable moves
// only when the user moves it. Every operation below either sets one
// syllable's anchor or leaves anchors alone. Nothing re-spreads, nothing
// cascades, nothing rebases. The old model derived every position from
// the line's start/end and its syllable COUNT, which is why splitting a
// word shifted the whole line — see the audit's §5.

// --- construction -----------------------------------------------------

/** Split a line of text into one syllable per whitespace token.
 *  Punctuation stays attached ("yeah," and "don't" are single tokens),
 *  matching the old `tokenizeLyricLines` behaviour. */
export function syllablesFromText(
  text: string,
  makeId: () => string = () => crypto.randomUUID(),
): LyricSyllable[] {
  return text
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .map(t => ({ id: makeId(), text: t }));
}

/** Build song lines from parsed drawer rows. Headers carry no
 *  syllables; lyric rows are split on whitespace, all unplaced. */
export function linesFromParsedRows(
  rows: ParsedLyricRow[],
  makeId: () => string = () => crypto.randomUUID(),
): SongLyricLine[] {
  return rows.map(row =>
    row.kind === 'header'
      ? { id: makeId(), kind: 'header' as const, text: row.text }
      : {
          id: makeId(),
          kind: 'lyric' as const,
          text: row.text,
          syllables: syllablesFromText(row.text, makeId),
        },
  );
}

// --- status -----------------------------------------------------------

export type LineStatus = 'header' | 'unplaced' | 'partial' | 'placed';

/** Drawer row status. `partial` also reports how far along it is. */
export function lineStatus(line: SongLyricLine): {
  status: LineStatus;
  placed: number;
  total: number;
} {
  if (line.kind === 'header') return { status: 'header', placed: 0, total: 0 };
  const syllables = line.syllables ?? [];
  const total = syllables.length;
  const placed = syllables.filter(s => s.anchor !== undefined).length;
  if (total === 0) return { status: 'unplaced', placed: 0, total: 0 };
  if (placed === 0) return { status: 'unplaced', placed, total };
  if (placed === total) return { status: 'placed', placed, total };
  return { status: 'partial', placed, total };
}

// --- generic single-syllable rewrite ----------------------------------

/** Apply `fn` to the one syllable with this id, leaving every other
 *  object identity intact. Returns the input array unchanged when the
 *  id isn't found or `fn` returns the same syllable. */
function mapSyllable(
  lines: ReadonlyArray<SongLyricLine>,
  syllableId: string,
  fn: (syllable: LyricSyllable, line: SongLyricLine) => LyricSyllable,
): SongLyricLine[] {
  let touched = false;
  const next = lines.map(line => {
    if (!line.syllables) return line;
    let lineTouched = false;
    const syllables = line.syllables.map(s => {
      if (s.id !== syllableId) return s;
      const updated = fn(s, line);
      if (updated === s) return s;
      lineTouched = true;
      return updated;
    });
    if (!lineTouched) return line;
    touched = true;
    return { ...line, syllables };
  });
  return touched ? next : [...lines];
}

/** Locate a syllable and its position within its line — what the edit
 *  popover needs to decide whether "join next" is available. */
export function findSyllable(
  lines: ReadonlyArray<SongLyricLine>,
  syllableId: string,
): { line: SongLyricLine; syllable: LyricSyllable; index: number } | null {
  for (const line of lines) {
    const syllables = line.syllables ?? [];
    const index = syllables.findIndex(s => s.id === syllableId);
    if (index >= 0) return { line, syllable: syllables[index], index };
  }
  return null;
}

/** Every placed syllable sitting in one cell, across all lines. */
function syllablesInCell(
  lines: ReadonlyArray<SongLyricLine>,
  sectionId: string,
  barIndex: number,
  beatPos: number,
): LyricSyllable[] {
  const out: LyricSyllable[] = [];
  for (const line of lines) {
    for (const s of line.syllables ?? []) {
      const a = s.anchor;
      if (
        a &&
        a.sectionId === sectionId &&
        a.barIndex === barIndex &&
        a.beatPos === beatPos
      ) {
        out.push(s);
      }
    }
  }
  return out;
}

// --- placement --------------------------------------------------------

/** Why a placement was refused. */
export type OrderViolation =
  | 'before-previous'
  | 'after-next'
  | 'off-axis';

/**
 * MONOTONIC ANCHORS. A line's placed syllables must run in text order
 * along the global beat axis — syllable *i* can never sit strictly
 * before an earlier placed syllable or strictly after a later one.
 *
 * Returns the violation, or null when the placement is legal.
 *
 * Equality is legal: two syllables of a line may share a cell, and a
 * placement landing exactly on a neighbour's beat is fine. Only
 * CROSSING is forbidden.
 *
 * Without this, first-unit-only tray drops could invert a line — drop
 * the head at bar 15 while the tail sits at bar 14 — and the ghost
 * spread would then interpolate across a negative span, scattering the
 * middle syllables backwards. Rejecting the placement is the fix;
 * `provisionalPlacements` additionally refuses to walk backwards, so
 * the two defences are independent.
 */
export function checkPlacementOrder(
  lines: ReadonlyArray<SongLyricLine>,
  syllableId: string,
  target: { sectionId: string; barIndex: number; beatPos: number },
  axis: BeatAxis,
): OrderViolation | null {
  const found = findSyllable(lines, syllableId);
  if (!found) return null;
  const targetGlobal = anchorToGlobal(axis, target);
  if (targetGlobal === null) return 'off-axis';

  const syllables = found.line.syllables ?? [];
  for (let i = found.index - 1; i >= 0; i--) {
    const anchor = syllables[i].anchor;
    if (!anchor) continue;
    const global = anchorToGlobal(axis, anchor);
    if (global === null) continue;
    if (targetGlobal < global) return 'before-previous';
    break; // nearest placed predecessor is the only binding one
  }
  for (let i = found.index + 1; i < syllables.length; i++) {
    const anchor = syllables[i].anchor;
    if (!anchor) continue;
    const global = anchorToGlobal(axis, anchor);
    if (global === null) continue;
    if (targetGlobal > global) return 'after-next';
    break;
  }
  return null;
}

/**
 * Place (or re-place) one syllable at a cell.
 *
 * The dropped syllable APPENDS to the target cell's stack — its order
 * is one past the current maximum — so nothing already there is
 * displaced. This is the no-ripple rule (§C) in its entirety: exactly
 * one syllable object changes, and only its anchor.
 *
 * Re-placing a syllable that's already somewhere is just an anchor
 * overwrite, so it needs no special case.
 */
export function placeSyllable(
  lines: ReadonlyArray<SongLyricLine>,
  syllableId: string,
  target: { sectionId: string; barIndex: number; beatPos: number },
  /** When supplied, the monotonic-order rule is enforced here too, so
   *  no caller can write an inverted line even by skipping the UI's
   *  pre-check. Omitted only where there is no axis to check against. */
  axis?: BeatAxis,
): SongLyricLine[] {
  if (axis && checkPlacementOrder(lines, syllableId, target, axis) !== null) {
    return [...lines];
  }
  const occupants = syllablesInCell(
    lines,
    target.sectionId,
    target.barIndex,
    target.beatPos,
  ).filter(s => s.id !== syllableId);
  const nextOrder = occupants.reduce(
    (max, s) => Math.max(max, s.anchor?.order ?? -1),
    -1,
  ) + 1;
  const anchor: LyricSyllableAnchor = { ...target, order: nextOrder };
  const placed = mapSyllable(lines, syllableId, s => {
    const a = s.anchor;
    if (
      a &&
      a.sectionId === anchor.sectionId &&
      a.barIndex === anchor.barIndex &&
      a.beatPos === anchor.beatPos &&
      a.order === anchor.order
    ) {
      return s;
    }
    return { ...s, anchor };
  });
  // Compact the cell the syllable LEFT so its former neighbours keep a
  // gapless 0..n-1 order. Their relative order is untouched.
  return normalizeCellOrders(placed);
}

/** Clear a syllable's anchor, returning it to the drawer's ghost pool. */
export function unplaceSyllable(
  lines: ReadonlyArray<SongLyricLine>,
  syllableId: string,
): SongLyricLine[] {
  const next = mapSyllable(lines, syllableId, s => {
    if (!s.anchor) return s;
    const { anchor: _dropped, ...rest } = s;
    return rest;
  });
  return normalizeCellOrders(next);
}

/**
 * Compact every cell's orders to 0..n-1, preserving relative order.
 * Ties (two syllables claiming the same order, only reachable from
 * legacy or concurrent-sync data) break on syllable id so the result is
 * deterministic across devices rather than dependent on array order.
 */
export function normalizeCellOrders(
  lines: ReadonlyArray<SongLyricLine>,
): SongLyricLine[] {
  const byCell = new Map<string, LyricSyllable[]>();
  for (const line of lines) {
    for (const s of line.syllables ?? []) {
      if (!s.anchor) continue;
      const key = cellKey(s.anchor);
      const list = byCell.get(key);
      if (list) list.push(s);
      else byCell.set(key, [s]);
    }
  }
  const nextOrderById = new Map<string, number>();
  for (const list of byCell.values()) {
    const sorted = [...list].sort((a, b) => {
      const ao = a.anchor?.order ?? 0;
      const bo = b.anchor?.order ?? 0;
      if (ao !== bo) return ao - bo;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    sorted.forEach((s, i) => nextOrderById.set(s.id, i));
  }
  let touched = false;
  const next = lines.map(line => {
    if (!line.syllables) return line;
    let lineTouched = false;
    const syllables = line.syllables.map(s => {
      if (!s.anchor) return s;
      const want = nextOrderById.get(s.id);
      if (want === undefined || want === s.anchor.order) return s;
      lineTouched = true;
      return { ...s, anchor: { ...s.anchor, order: want } };
    });
    if (!lineTouched) return line;
    touched = true;
    return { ...line, syllables };
  });
  return touched ? next : [...lines];
}

/** Reorder one cell's stack to the given syllable-id sequence — the
 *  write behind A4's tap-to-number. Ids not in the cell are ignored;
 *  occupants the caller omitted keep their relative order after the
 *  ones listed. */
export function setCellOrder(
  lines: ReadonlyArray<SongLyricLine>,
  cell: { sectionId: string; barIndex: number; beatPos: number },
  orderedIds: ReadonlyArray<string>,
): SongLyricLine[] {
  const occupants = syllablesInCell(
    lines,
    cell.sectionId,
    cell.barIndex,
    cell.beatPos,
  );
  if (occupants.length === 0) return [...lines];
  const wanted = orderedIds.filter(id => occupants.some(s => s.id === id));
  const rest = occupants
    .filter(s => !wanted.includes(s.id))
    .sort((a, b) => (a.anchor?.order ?? 0) - (b.anchor?.order ?? 0))
    .map(s => s.id);
  const finalOrder = [...wanted, ...rest];
  const rank = new Map(finalOrder.map((id, i) => [id, i]));
  let touched = false;
  const next = lines.map(line => {
    if (!line.syllables) return line;
    let lineTouched = false;
    const syllables = line.syllables.map(s => {
      const want = rank.get(s.id);
      if (want === undefined || !s.anchor || want === s.anchor.order) return s;
      lineTouched = true;
      return { ...s, anchor: { ...s.anchor, order: want } };
    });
    if (!lineTouched) return line;
    touched = true;
    return { ...line, syllables };
  });
  return touched ? next : [...lines];
}

// --- split / join / edit ----------------------------------------------

/**
 * Split a syllable's text at a character index.
 *
 * The FIRST piece keeps the original's anchor — so a placed syllable
 * stays exactly where it was — and the remainder becomes a new unplaced
 * syllable directly after it. This is what kills the old model's worst
 * ripple: `splitWord` grew the line's syllable count, which re-based
 * every other syllable's derived position (audit §5).
 *
 * No-op for an out-of-range index or a split that would leave an empty
 * side.
 */
export function splitSyllable(
  lines: ReadonlyArray<SongLyricLine>,
  syllableId: string,
  splitAt: number,
  makeId: () => string = () => crypto.randomUUID(),
): SongLyricLine[] {
  let touched = false;
  const next = lines.map(line => {
    if (!line.syllables) return line;
    const idx = line.syllables.findIndex(s => s.id === syllableId);
    if (idx < 0) return line;
    const target = line.syllables[idx];
    if (splitAt < 1 || splitAt >= target.text.length) return line;
    const head: LyricSyllable = { ...target, text: target.text.slice(0, splitAt) };
    // `continuesWord` records the split lineage, and is the only thing
    // that later authorises re-joining these two — see `canJoinNext`.
    const tail: LyricSyllable = {
      id: makeId(),
      text: target.text.slice(splitAt),
      continuesWord: true,
    };
    touched = true;
    return {
      ...line,
      syllables: [
        ...line.syllables.slice(0, idx),
        head,
        tail,
        ...line.syllables.slice(idx + 1),
      ],
    };
  });
  return touched ? next : [...lines];
}

/**
 * Whether a syllable may be merged with the next one — true only when
 * that next syllable came from splitting THIS word, so a join is
 * strictly the undo of a split.
 *
 * Joining across a word boundary would silently corrupt the lyric
 * ("ful" + "and" → "fuland"), and there is no undo at the word level to
 * recover from it, so the guard lives in the model rather than only in
 * the button's disabled state.
 *
 * Returns false for legacy-migrated syllables: the old `splitWord`
 * recorded no lineage, and two entries from a legacy split are
 * indistinguishable from two ordinary words. Not offering the join is
 * the safe direction — `Edit` can still fix the text.
 */
export function canJoinNext(
  lines: ReadonlyArray<SongLyricLine>,
  syllableId: string,
): boolean {
  const found = findSyllable(lines, syllableId);
  if (!found) return false;
  const syllables = found.line.syllables ?? [];
  const next = syllables[found.index + 1];
  return next !== undefined && next.continuesWord === true;
}

/**
 * Merge a syllable with the one after it in the same line. The merged
 * syllable keeps the FIRST one's anchor (and id), so a placed head
 * doesn't move; the tail's anchor, if it had one, is discarded along
 * with the tail.
 *
 * No-op when the syllable is last in its line, isn't found, or the next
 * syllable is a different word — see `canJoinNext`.
 */
export function joinSyllables(
  lines: ReadonlyArray<SongLyricLine>,
  syllableId: string,
): SongLyricLine[] {
  if (!canJoinNext(lines, syllableId)) return [...lines];
  let touched = false;
  const next = lines.map(line => {
    if (!line.syllables) return line;
    const idx = line.syllables.findIndex(s => s.id === syllableId);
    if (idx < 0 || idx >= line.syllables.length - 1) return line;
    const head = line.syllables[idx];
    const tail = line.syllables[idx + 1];
    touched = true;
    return {
      ...line,
      syllables: [
        ...line.syllables.slice(0, idx),
        { ...head, text: head.text + tail.text },
        ...line.syllables.slice(idx + 2),
      ],
    };
  });
  if (!touched) return [...lines];
  return normalizeCellOrders(next);
}

/** Rewrite one syllable's text. Position is untouched. No-op for an
 *  empty result or an unchanged value. */
export function setSyllableText(
  lines: ReadonlyArray<SongLyricLine>,
  syllableId: string,
  nextText: string,
): SongLyricLine[] {
  const trimmed = nextText.trim();
  if (trimmed === '') return [...lines];
  return mapSyllable(lines, syllableId, s =>
    s.text === trimmed ? s : { ...s, text: trimmed },
  );
}

// --- the global beat axis ---------------------------------------------
//
// Anchors are section-local, but the provisional spread has to reason
// across sections (a line's syllables may span them). The axis flattens
// every section's bars into one ascending beat line, in section order.

export interface SectionAxisEntry {
  sectionId: string;
  beatsPerBar: number;
  barCount: number;
}

export interface BeatAxis {
  entries: SectionAxisEntry[];
  /** sectionId → global beat at which that section's bar 0 beat 0 sits. */
  offsets: Map<string, number>;
  totalBeats: number;
}

export function buildBeatAxis(
  sections: ReadonlyArray<SectionAxisEntry>,
): BeatAxis {
  const offsets = new Map<string, number>();
  let cursor = 0;
  const entries: SectionAxisEntry[] = [];
  for (const s of sections) {
    entries.push(s);
    offsets.set(s.sectionId, cursor);
    cursor += Math.max(0, s.barCount) * Math.max(1, s.beatsPerBar);
  }
  return { entries, offsets, totalBeats: cursor };
}

/** Anchor → absolute beat. Null when the section isn't on the axis. */
export function anchorToGlobal(
  axis: BeatAxis,
  anchor: { sectionId: string; barIndex: number; beatPos: number },
): number | null {
  const base = axis.offsets.get(anchor.sectionId);
  if (base === undefined) return null;
  const entry = axis.entries.find(e => e.sectionId === anchor.sectionId);
  if (!entry) return null;
  return base + anchor.barIndex * Math.max(1, entry.beatsPerBar) + anchor.beatPos;
}

/** Absolute beat → the cell it lands in. Null when off the axis. */
export function globalToCell(
  axis: BeatAxis,
  global: number,
): { sectionId: string; barIndex: number; beatPos: number } | null {
  if (global < 0) return null;
  for (const entry of axis.entries) {
    const base = axis.offsets.get(entry.sectionId);
    if (base === undefined) continue;
    const beatsPerBar = Math.max(1, entry.beatsPerBar);
    const span = Math.max(0, entry.barCount) * beatsPerBar;
    if (global < base + span) {
      const local = global - base;
      return {
        sectionId: entry.sectionId,
        barIndex: Math.floor(local / beatsPerBar),
        beatPos: local % beatsPerBar,
      };
    }
  }
  return null;
}

// --- provisional (ghost) placement ------------------------------------

export interface ProvisionalPlacement {
  syllableId: string;
  lineId: string;
  /** Derived, never stored. */
  cell: { sectionId: string; barIndex: number; beatPos: number };
}

/**
 * Where the unplaced syllables of one line show as ghosts.
 *
 * Only runs of unplaced syllables sitting BETWEEN two placed ones get a
 * provisional position, spread evenly across the beats between their
 * anchors. A run hanging off either end — or a line with fewer than two
 * placed syllables — renders nothing and stays in the drawer.
 *
 * That restriction is what makes the old degenerate case unreachable.
 * The previous model spread every word across the line's start/end
 * markers, so dragging the two markers onto the same beat divided a
 * zero-width range and stacked the entire line into one cell (audit
 * §6). Here a spread needs two distinct endpoints by construction.
 */
export function provisionalPlacements(
  line: SongLyricLine,
  axis: BeatAxis,
): ProvisionalPlacement[] {
  if (line.kind !== 'lyric') return [];
  const syllables = line.syllables ?? [];
  const pins: Array<{ index: number; global: number }> = [];
  syllables.forEach((s, index) => {
    if (!s.anchor) return;
    const global = anchorToGlobal(axis, s.anchor);
    if (global !== null) pins.push({ index, global });
  });
  if (pins.length < 2) return [];

  const out: ProvisionalPlacement[] = [];
  for (let p = 0; p < pins.length - 1; p++) {
    const left = pins[p];
    const right = pins[p + 1];
    const gapLength = right.index - left.index - 1;
    if (gapLength <= 0) continue;
    const span = right.global - left.global;
    // The spread must never run backwards. `checkPlacementOrder` makes
    // an inverted line unreachable, but this is the second, independent
    // defence: a negative span would scatter the middle syllables in
    // reverse across the grid, which is exactly the garbage an inverted
    // pair produced before the guard existed. Emit nothing instead —
    // no ghosts is a legible state; ghosts running backwards is not.
    if (span < 0) continue;
    for (let k = 1; k <= gapLength; k++) {
      const global = Math.round(left.global + (span * k) / (gapLength + 1));
      const cell = globalToCell(axis, global);
      if (!cell) continue;
      out.push({
        syllableId: syllables[left.index + k].id,
        lineId: line.id,
        cell,
      });
    }
  }
  return out;
}

// --- read model -------------------------------------------------------

export interface CellOccupant {
  lineId: string;
  syllable: LyricSyllable;
  /** False = ghost (provisional, unplaced). */
  placed: boolean;
}

function cellKey(cell: {
  sectionId: string;
  barIndex: number;
  beatPos: number;
}): string {
  return `${cell.sectionId}:${cell.barIndex}:${cell.beatPos}`;
}

export { cellKey };

/**
 * The anchor → cell index the bar grid renders from. Built once per
 * song, above the sections, because a line's syllables may point at any
 * of them (§2.0).
 *
 * Within a cell: placed syllables first, ascending by `order`; ghosts
 * after, in line-then-syllable order. Ties on `order` break by syllable
 * id so two devices render the same stack.
 */
export function buildCellIndex(
  lines: ReadonlyArray<SongLyricLine>,
  axis: BeatAxis,
): Map<string, CellOccupant[]> {
  const index = new Map<string, CellOccupant[]>();
  const push = (key: string, occupant: CellOccupant) => {
    const list = index.get(key);
    if (list) list.push(occupant);
    else index.set(key, [occupant]);
  };

  const byId = new Map<string, LyricSyllable>();
  for (const line of lines) {
    if (line.kind !== 'lyric') continue;
    for (const s of line.syllables ?? []) {
      byId.set(s.id, s);
      if (s.anchor) {
        push(cellKey(s.anchor), { lineId: line.id, syllable: s, placed: true });
      }
    }
  }

  for (const line of lines) {
    for (const p of provisionalPlacements(line, axis)) {
      const syllable = byId.get(p.syllableId);
      if (!syllable) continue;
      push(cellKey(p.cell), { lineId: p.lineId, syllable, placed: false });
    }
  }

  for (const list of index.values()) {
    list.sort((a, b) => {
      if (a.placed !== b.placed) return a.placed ? -1 : 1;
      if (a.placed && b.placed) {
        const ao = a.syllable.anchor?.order ?? 0;
        const bo = b.syllable.anchor?.order ?? 0;
        if (ao !== bo) return ao - bo;
      }
      return a.syllable.id < b.syllable.id
        ? -1
        : a.syllable.id > b.syllable.id
          ? 1
          : 0;
    });
  }
  return index;
}

// --- bar operations ---------------------------------------------------

/** Remap anchors through a bar permutation, for whole-bar reorder.
 *  Only the named section's anchors move; beatPos and order are
 *  untouched, so a bar's stacks travel intact. */
export function remapAnchorBars(
  lines: ReadonlyArray<SongLyricLine>,
  sectionId: string,
  oldToNew: ReadonlyMap<number, number>,
): SongLyricLine[] {
  let touched = false;
  const next = lines.map(line => {
    if (!line.syllables) return line;
    let lineTouched = false;
    const syllables = line.syllables.map(s => {
      const a = s.anchor;
      if (!a || a.sectionId !== sectionId) return s;
      const to = oldToNew.get(a.barIndex);
      if (to === undefined || to === a.barIndex) return s;
      lineTouched = true;
      return { ...s, anchor: { ...a, barIndex: to } };
    });
    if (!lineTouched) return line;
    touched = true;
    return { ...line, syllables };
  });
  return touched ? next : [...lines];
}

/** Syllables anchored in one bar — what a bar-delete would destroy.
 *  The caller uses this to refuse (or warn about) the delete rather
 *  than silently moving placed work. */
export function placedSyllablesInBar(
  lines: ReadonlyArray<SongLyricLine>,
  sectionId: string,
  barIndex: number,
): LyricSyllable[] {
  const out: LyricSyllable[] = [];
  for (const line of lines) {
    for (const s of line.syllables ?? []) {
      if (s.anchor?.sectionId === sectionId && s.anchor.barIndex === barIndex) {
        out.push(s);
      }
    }
  }
  return out;
}

/** Shift anchors down after a bar is removed. Anchors IN the deleted
 *  bar are un-placed (back to the ghost pool) rather than silently
 *  relocated — losing a position is recoverable, a wrong one isn't. */
export function shiftAnchorsAfterBarDelete(
  lines: ReadonlyArray<SongLyricLine>,
  sectionId: string,
  deletedBar: number,
): SongLyricLine[] {
  let touched = false;
  const next = lines.map(line => {
    if (!line.syllables) return line;
    let lineTouched = false;
    const syllables = line.syllables.map(s => {
      const a = s.anchor;
      if (!a || a.sectionId !== sectionId) return s;
      if (a.barIndex === deletedBar) {
        lineTouched = true;
        const { anchor: _dropped, ...rest } = s;
        return rest;
      }
      if (a.barIndex > deletedBar) {
        lineTouched = true;
        return { ...s, anchor: { ...a, barIndex: a.barIndex - 1 } };
      }
      return s;
    });
    if (!lineTouched) return line;
    touched = true;
    return { ...line, syllables };
  });
  if (!touched) return [...lines];
  return normalizeCellOrders(next);
}

// --- migration --------------------------------------------------------

export interface SectionLyricSource {
  sectionId: string;
  beatsPerBar: number;
  lyricLines?: LyricLine[];
}

/**
 * Bump when `foldSectionLyrics` changes in a way that makes already-
 * migrated stores wrong, so the migration re-runs over them instead of
 * being locked out by the "already has lyricLines" guard.
 *
 *   1 — original. BROKEN: treated the legacy pending sentinel as a
 *       placement, so every un-placed line landed stacked on bar 0
 *       beat 0, and header text imported as a placeable lyric line.
 *   2 — sentinel lines fold to unplaced; headers are recognised.
 *
 * ⚠ A re-fold DISCARDS the song-level store and rebuilds it from
 * `section.lyricLines`. That is lossless only while the legacy records
 * remain the source of truth — which they are, because the fold never
 * writes to them. Once the drawer (step 7) lets the user author lyrics
 * that have no legacy counterpart, a destructive re-fold stops being
 * safe and this mechanism needs a merge instead. `commitSongLyrics`
 * stamps the current version on every user edit precisely so a future
 * bump can tell "migrated but untouched" from "the user has worked on
 * this".
 */
export const LYRIC_FOLD_VERSION = 2;

/**
 * The legacy model had no un-placed state in the DATA — a not-yet-
 * placed line was flagged by a sentinel range of (0,0)→(0,0), and the
 * check lived only in the renderer, which partitioned those lines out
 * before drawing.
 *
 * Reading the records directly without this check is what broke fold
 * v1: `distributedWordPositions` sees start == end, computes a total
 * span of zero, and returns position 0 for every word — so a whole
 * tray's worth of un-placed lines migrated stacked onto bar 0 beat 0.
 */
export function isLegacyPendingLine(line: LyricLine): boolean {
  return (
    line.startBar === 0 &&
    line.startBeat === 0 &&
    line.endBar === 0 &&
    line.endBeat === 0
  );
}

/**
 * Fold every section's legacy `lyricLines` into one song-level list.
 *
 * Existing positions import as PLACED, not as ghosts — they are the
 * user's real work, and importing them unplaced would discard it. Each
 * word's cell is computed with the SAME math the current renderer uses
 * (`distributedWordPositions`, floor for the bar, round for the beat,
 * clamped into range), so the first render after migration is identical
 * to the last one before it. That equivalence is step 2's acceptance
 * test.
 *
 * Sections are walked in the order given, so the drawer reads
 * top-to-bottom in song order on day one.
 *
 * Idempotent by construction: it only reads legacy fields, so running it
 * twice on the same input yields the same output. The caller skips it
 * once `song.lyricLines` exists.
 */
export function foldSectionLyrics(
  sections: ReadonlyArray<SectionLyricSource>,
  makeId: () => string = () => crypto.randomUUID(),
): SongLyricLine[] {
  const out: SongLyricLine[] = [];
  for (const section of sections) {
    const beatsPerBar = Math.max(1, section.beatsPerBar);
    // Per-cell running counter reproduces today's stacking order: lines
    // in array order, words in index order.
    const orderByCell = new Map<string, number>();
    for (const legacy of section.lyricLines ?? []) {
      const text = legacy.words.join(' ');
      const unplaced = isLegacyPendingLine(legacy);

      // Header recognition applies ONLY to un-placed lines. A "[Refrain]"
      // the user actually positioned on the grid stays a lyric line —
      // converting it would silently discard that placement, and
      // destroying a placement is worse than leaving a stray label
      // placeable. One long-press reclassifies it either way.
      if (unplaced && isHeaderLine(text)) {
        const parsed = parseLyricSheet(text)[0];
        out.push({
          id: makeId(),
          kind: 'header',
          text: parsed?.text ?? text,
        });
        continue;
      }

      // Un-placed lines fold to syllables with NO anchors, landing in
      // the ghost pool exactly as the tray showed them.
      if (unplaced) {
        out.push({
          id: makeId(),
          kind: 'lyric',
          text,
          syllables: legacy.words.map(word => ({ id: makeId(), text: word })),
        });
        continue;
      }

      const positions = distributedWordPositions(legacy, beatsPerBar);
      const syllables: LyricSyllable[] = legacy.words.map((word, i) => {
        const syllable: LyricSyllable = { id: makeId(), text: word };
        const pos = positions[i];
        if (pos === undefined || !Number.isFinite(pos)) return syllable;
        const barIndex = Math.floor(pos / beatsPerBar);
        if (barIndex < 0) return syllable;
        const rawBeat = Math.round(pos - barIndex * beatsPerBar);
        const beatPos = Math.min(Math.max(0, rawBeat), beatsPerBar - 1);
        const key = `${barIndex}:${beatPos}`;
        const order = orderByCell.get(key) ?? 0;
        orderByCell.set(key, order + 1);
        syllable.anchor = {
          sectionId: section.sectionId,
          barIndex,
          beatPos,
          order,
        };
        return syllable;
      });
      out.push({ id: makeId(), kind: 'lyric', text, syllables });
    }
  }
  return out;
}
