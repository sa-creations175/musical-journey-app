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
): {
  line: SongLyricLine;
  syllable: LyricSyllable;
  index: number;
  /** The line's position in `lines` — song order, which now carries
   *  positional meaning (see `checkPlacementOrder`). */
  lineIndex: number;
} | null {
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const syllables = line.syllables ?? [];
    const index = syllables.findIndex(s => s.id === syllableId);
    if (index >= 0) {
      return { line, syllable: syllables[index], index, lineIndex };
    }
  }
  return null;
}

// --- placement --------------------------------------------------------

/** Why a placement was refused. */
export type OrderViolation =
  | 'before-previous'
  | 'after-next'
  | 'before-previous-line'
  | 'after-next-line'
  | 'off-axis';

/**
 * The span one line occupies on the global axis, or null when it has
 * nothing placed. Header rows always return null — they carry no
 * syllables — so they are transparent to the cross-line rule.
 *
 * Deliberately min/max over every placed syllable rather than
 * first/last in text order: a line that is itself internally inverted
 * (possible in data written before the guard existed) still reports an
 * honest span, so it constrains its neighbours by where it actually
 * sits rather than by where its endpoints claim to be.
 */
function placedGlobalRange(
  line: SongLyricLine,
  axis: BeatAxis,
): { min: number; max: number } | null {
  let min: number | null = null;
  let max: number | null = null;
  for (const s of line.syllables ?? []) {
    if (!s.anchor) continue;
    const global = anchorToGlobal(axis, s.anchor);
    if (global === null) continue;
    min = min === null ? global : Math.min(min, global);
    max = max === null ? global : Math.max(max, global);
  }
  return min === null || max === null ? null : { min, max };
}

/**
 * MONOTONIC ANCHORS. **Syllables never cross each other; they only ever
 * stack in order.**
 *
 * Returns the violation, or null when the placement is legal. This
 * function is the SINGLE authority on placement legality — drag, tap,
 * marker drags and tray drops all route through it, and nothing
 * pre-filters cells on its behalf.
 *
 * One rule covers within-a-line and across-lines alike: a placement is
 * refused **only when it would put a syllable out of order relative to
 * a syllable in a DIFFERENT cell.** Same-cell placement is never an
 * ordering question, because a cell has no internal geometry to be out
 * of order in — where a syllable sits in a stack is decided at render
 * by song order (`buildCellIndex`), never by the user and never by
 * when it was placed.
 *
 * Equality on the global axis IS "the same cell" — a global beat
 * uniquely identifies one cell — so the comparisons below are strict
 * in both directions. That is the whole implementation of "auto-order
 * on stack, refuse only across cells".
 *
 * **Within a line** (step 5): placed syllables run in text order along
 * the global axis. Without this, first-unit-only tray drops could
 * invert a line — head at bar 15 while the tail sits at bar 14 — and
 * the ghost spread would interpolate across a negative span,
 * scattering the middle syllables backwards. `provisionalPlacements`
 * additionally refuses to walk backwards, so the two defences are
 * independent.
 *
 * **Across lines** (step 6b): lyric lines run strictly sequential.
 * Line N's syllables land after line N-1's and before line N+1's,
 * where line order is the order of the song's `lyricLines` — which the
 * fold migration built in section order. This superseded the earlier
 * decision that line identity was "pure text grouping with no
 * positional meaning"; see
 * docs/LYRIC_SYLLABLE_PLACEMENT_AUDIT_AND_PLAN.md §2.0.
 *
 * 6b shipped this cross-line check as STRICTLY stricter than the
 * within-line one — refusing a landing *on* a neighbouring line's
 * syllable, so a cell could stack one line's syllables only. That is
 * **superseded**: musically the last word of one phrase and the first
 * word of the next routinely land on the same beat, and the two cases
 * are now identical. A cell may hold any number of syllables from any
 * number of lines; they read in song order.
 *
 * The nearest line with anything placed is the only binding one in
 * each direction, mirroring the within-line rule; lines with nothing
 * placed are transparent, so there is no ordering-of-operations rule
 * and no special case for empty lines. A later line placed before an
 * earlier one is constrained identically — the guard reads positions,
 * never history.
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

  for (let li = found.lineIndex - 1; li >= 0; li--) {
    const range = placedGlobalRange(lines[li], axis);
    if (!range) continue;
    // Strict, like the within-line comparison above: landing ON the
    // previous line's last syllable is the same cell, which auto-orders
    // rather than refusing.
    if (targetGlobal < range.max) return 'before-previous-line';
    break; // nearest preceding line with anything placed binds
  }
  for (let li = found.lineIndex + 1; li < lines.length; li++) {
    const range = placedGlobalRange(lines[li], axis);
    if (!range) continue;
    if (targetGlobal > range.min) return 'after-next-line';
    break;
  }
  return null;
}

/**
 * Place (or re-place) one syllable at a cell.
 *
 * **The no-ripple rule (§C) in its entirety: exactly one syllable
 * object changes, and only its anchor.** Nothing already in the target
 * cell is touched, and neither is anything in the cell being vacated.
 * Where the syllable lands in the target's stack is not decided here at
 * all — `buildCellIndex` reads it from song order at render time.
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
  // `checkPlacementOrder` returns 'off-axis' for a target that names no
  // real cell, so this also refuses out-of-range writes — the write
  // path cannot create the collision `anchorToGlobal` now guards
  // against at read time.
  if (axis && checkPlacementOrder(lines, syllableId, target, axis) !== null) {
    return [...lines];
  }
  const anchor: LyricSyllableAnchor = { ...target };
  return mapSyllable(lines, syllableId, s => {
    const a = s.anchor;
    if (
      a &&
      a.sectionId === anchor.sectionId &&
      a.barIndex === anchor.barIndex &&
      a.beatPos === anchor.beatPos
    ) {
      return s;
    }
    return { ...s, anchor };
  });
}

/**
 * Clear every anchor on one line, returning it to the tray fully
 * unplaced with its text intact.
 *
 * The non-destructive counterpart to deleting a line: "I want to start
 * this line's placement over" is a different intent from "I don't want
 * these words", and until now only the destructive one had a button.
 */
export function unplaceLine(
  lines: ReadonlyArray<SongLyricLine>,
  lineId: string,
): SongLyricLine[] {
  let touched = false;
  const next = lines.map(line => {
    if (line.id !== lineId || !line.syllables) return line;
    if (!line.syllables.some(s => s.anchor)) return line;
    touched = true;
    return {
      ...line,
      syllables: line.syllables.map(s => {
        if (!s.anchor) return s;
        const { anchor: _dropped, ...rest } = s;
        return rest;
      }),
    };
  });
  if (!touched) return [...lines];
  return next;
}

/**
 * Insert a copy of one line directly below it.
 *
 * For repeated material — a refrain sung three times is entered once,
 * so the second and third occurrences have no lines to place. This
 * makes them without retyping.
 *
 * **A COPY, NOT A LINK.** New line id, new syllable ids, no shared
 * objects: the two are independent from the moment they exist, and
 * editing or placing one never touches the other. Nothing here
 * establishes a relationship for a future feature to sync.
 *
 * **The copy arrives fully UNPLACED, even from a fully placed line.**
 * Not a limitation — the point of a duplicate is that it goes
 * somewhere ELSE. Carrying the anchors over would stack an identical
 * second copy of every word in the cells the original already
 * occupies, which is never what "duplicate this refrain" means.
 *
 * Inserted directly BELOW the original, which matters more than it
 * looks: line order carries positional meaning (§2.0), so the copy is
 * constrained by the guard to be placed after the original. That is
 * right for a refrain that comes back later, and is why the copy is
 * not appended to the end of the song.
 */
export function duplicateLine(
  lines: ReadonlyArray<SongLyricLine>,
  lineId: string,
  makeId: () => string = () => crypto.randomUUID(),
): SongLyricLine[] {
  const index = lines.findIndex(l => l.id === lineId);
  if (index < 0) return [...lines];
  const source = lines[index];
  const copy: SongLyricLine =
    source.kind === 'header'
      ? { id: makeId(), kind: 'header', text: source.text }
      : {
          id: makeId(),
          kind: 'lyric',
          text: source.text,
          syllables: (source.syllables ?? []).map(sy => ({
            id: makeId(),
            text: sy.text,
          })),
        };
  return [...lines.slice(0, index + 1), copy, ...lines.slice(index + 1)];
}

/**
 * Can this line become a header?
 *
 * Only if none of its words are placed. Converting discards syllables,
 * so allowing it on a placed line would silently throw away real work
 * — the user would lose positions they had already set and have no
 * obvious way to know why.
 *
 * Exported so the UI can explain the refusal instead of offering a
 * dead action, while `setLineKind` re-checks it. Same
 * single-authority shape as `placeSyllable` re-checking the guard: one
 * rule, two readers, no second copy of the rule.
 */
export function canConvertToHeader(line: SongLyricLine): boolean {
  if (line.kind === 'header') return true;
  return (line.syllables ?? []).every(s => !s.anchor);
}

/**
 * Flip a drawer row between header and lyric.
 *
 * The parser guesses which pasted lines are section headers, and it
 * will sometimes be wrong in both directions. This is the correction.
 *
 * lyric → header drops the syllables and keeps the text, and is
 * REFUSED (returns the input unchanged) when any word is placed.
 * header → lyric re-splits the text into fresh unplaced words, so a
 * mis-detected header becomes a placeable line.
 */
export function setLineKind(
  lines: ReadonlyArray<SongLyricLine>,
  lineId: string,
  kind: 'lyric' | 'header',
  makeId: () => string = () => crypto.randomUUID(),
): SongLyricLine[] {
  let touched = false;
  const next = lines.map(line => {
    if (line.id !== lineId || line.kind === kind) return line;
    if (kind === 'header') {
      if (!canConvertToHeader(line)) return line;
      touched = true;
      const { syllables: _dropped, ...rest } = line;
      return { ...rest, kind: 'header' as const };
    }
    touched = true;
    return {
      ...line,
      kind: 'lyric' as const,
      syllables: syllablesFromText(line.text, makeId),
    };
  });
  return touched ? next : [...lines];
}

/**
 * Restore one line's syllables to a snapshot taken earlier.
 *
 * The undo behind cancelling a two-part line placement. Deliberately
 * NOT `unplaceLine`: a line being *resumed* may already carry anchors
 * from an earlier session, and cancelling a gesture that was only meant
 * to finish the line must not destroy them. `unplaceLine` clears
 * everything, which is "undo all of it" rather than "undo this
 * gesture" — a difference the user only discovers by losing work.
 *
 * A fresh drop snapshots a line with no anchors, so the two agree
 * exactly in that case and differ only where it matters.
 *
 * Scoped to one line rather than the whole store so a concurrent edit
 * elsewhere can't be reverted as a side effect.
 */
export function restoreLineSyllables(
  lines: ReadonlyArray<SongLyricLine>,
  lineId: string,
  snapshot: ReadonlyArray<LyricSyllable>,
): SongLyricLine[] {
  let touched = false;
  const next = lines.map(line => {
    if (line.id !== lineId) return line;
    touched = true;
    return { ...line, syllables: snapshot.map(s => ({ ...s })) };
  });
  return touched ? next : [...lines];
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
  return next;
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
  return next;
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
/**
 * Anchor → absolute beat. Null when the anchor does not name a real
 * cell.
 *
 * THE INVARIANT THIS PROTECTS: **one global beat is exactly one cell.**
 * The unified stacking rule (§2.0 rev 5) rests on it entirely —
 * "equality on the global axis IS the same cell" is what makes
 * same-cell placement legal and cross-cell placement guarded.
 *
 * An anchor outside its bar's or section's range breaks that. Two
 * measured examples, both reachable from real operations:
 *
 *   · beat 3 of a bar that is now 3/4 computes to the same global as
 *     beat 0 of the NEXT bar
 *   · bar 9 of a section that now has 2 bars computes into the range
 *     of a LATER section entirely
 *
 * In both cases two distinct cells become indistinguishable to the
 * guard, which surfaces later as inexplicable refusals. Range-checking
 * here makes the invariant hold for ALL data — including anchors
 * written before the check existed — rather than depending on every
 * handler remembering to behave. An out-of-range anchor reads as
 * off-axis: invisible, and skipped when looking for binding
 * neighbours, which is the honest treatment of a position that does
 * not exist.
 */
export function anchorToGlobal(
  axis: BeatAxis,
  anchor: { sectionId: string; barIndex: number; beatPos: number },
): number | null {
  const base = axis.offsets.get(anchor.sectionId);
  if (base === undefined) return null;
  const entry = axis.entries.find(e => e.sectionId === anchor.sectionId);
  if (!entry) return null;
  const beatsPerBar = Math.max(1, entry.beatsPerBar);
  if (anchor.barIndex < 0 || anchor.barIndex >= Math.max(0, entry.barCount)) {
    return null;
  }
  if (anchor.beatPos < 0 || anchor.beatPos >= beatsPerBar) return null;
  return base + anchor.barIndex * beatsPerBar + anchor.beatPos;
}

/** True when this anchor names a cell that actually exists. */
export function anchorIsOnAxis(
  axis: BeatAxis,
  anchor: { sectionId: string; barIndex: number; beatPos: number },
): boolean {
  return anchorToGlobal(axis, anchor) !== null;
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
  /** Position of the owning line in the song's line list. */
  lineIndex: number;
  /** Position of the syllable within its line — the text order that
   *  decides how a cell's stack reads top-to-bottom. */
  textIndex: number;
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
 * **Within a cell, occupants read in SONG ORDER — `(lineIndex,
 * textIndex)` — and nothing else.** Placed and ghost interleave freely,
 * and line boundaries do not matter: a line's last syllable and the
 * next line's first may share a cell and read in that order.
 *
 * This is the only place a stack's order is decided. Placement writes
 * an anchor and nothing more, so drag and tap cannot produce different
 * stacks, and there is no stored ordering to drift out of sync with the
 * text.
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

  const located = new Map<
    string,
    { syllable: LyricSyllable; lineIndex: number; textIndex: number }
  >();
  lines.forEach((line, lineIndex) => {
    if (line.kind !== 'lyric') return;
    (line.syllables ?? []).forEach((s, textIndex) => {
      located.set(s.id, { syllable: s, lineIndex, textIndex });
      if (s.anchor) {
        push(cellKey(s.anchor), {
          lineId: line.id,
          syllable: s,
          placed: true,
          lineIndex,
          textIndex,
        });
      }
    });
  });

  for (const line of lines) {
    for (const p of provisionalPlacements(line, axis)) {
      const found = located.get(p.syllableId);
      if (!found) continue;
      push(cellKey(p.cell), {
        lineId: p.lineId,
        syllable: found.syllable,
        placed: false,
        lineIndex: found.lineIndex,
        textIndex: found.textIndex,
      });
    }
  }

  for (const list of index.values()) {
    list.sort((a, b) => {
      // SONG ORDER, and only song order.
      //
      // Two earlier tiers were removed here, both of which could put a
      // stack out of the order the lyrics read in:
      //
      // 1. Ascending `anchor.order`, which was an insertion counter
      //    (`max in cell + 1`). It recorded WHEN a syllable was placed,
      //    not WHERE it belongs — so dropping "O" into the cell already
      //    holding "come," rendered it BELOW "come,".
      // 2. Placed above ghosts. `provisionalPlacements` emits ghosts
      //    into their pins' own cell when a span is zero-length, so a
      //    line's LAST syllable could render above its own ghosts.
      //
      // (lineIndex, textIndex) is meaningful and stable across devices,
      // since it derives from the text rather than from generated ids
      // or from local edit history.
      if (a.lineIndex !== b.lineIndex) return a.lineIndex - b.lineIndex;
      return a.textIndex - b.textIndex;
    });
  }
  return index;
}

// --- line markers (rev 3 §A1) -----------------------------------------

export interface LineMarkerPlacement {
  lineId: string;
  edge: 'start' | 'end';
  /** The syllable this marker places when dragged — the line's first
   *  unit for 'start', its last for 'end'. */
  syllableId: string;
  /** Where the marker draws. */
  cell: { sectionId: string; barIndex: number; beatPos: number };
  /** True when the governed unit is already placed, i.e. the marker
   *  sits on the very syllable it controls. */
  onItsUnit: boolean;
}

/**
 * Where a line's start/end markers draw, and which unit each one
 * places (§A1).
 *
 * A marker is a handle for the line's FIRST or LAST unit — never for
 * the line's range, which no longer exists as a stored concept. Drag ▶
 * and only `syllables[0]` moves; drag ◀ and only the last syllable
 * moves. Nothing re-spreads, nothing else is touched.
 *
 * The markers draw at the line's current placement extent: ▶ in the
 * cell of the first PLACED syllable, ◀ in the cell of the last. When
 * the governed unit is itself unplaced — the usual state right after a
 * tray drop, where only the head has landed — the marker still draws at
 * that extent, and dragging it is how the unit gets placed. That is the
 * whole point of ◀: it is the affordance for setting where a line ends.
 *
 * A line with nothing placed has no markers; it lives in the tray.
 */
export function lineMarkers(
  lines: ReadonlyArray<SongLyricLine>,
): LineMarkerPlacement[] {
  const out: LineMarkerPlacement[] = [];
  for (const line of lines) {
    if (line.kind !== 'lyric') continue;
    const syllables = line.syllables ?? [];
    if (syllables.length === 0) continue;
    const firstPlaced = syllables.find(s => s.anchor);
    if (!firstPlaced?.anchor) continue;
    let lastPlaced = firstPlaced;
    for (const s of syllables) if (s.anchor) lastPlaced = s;

    const head = syllables[0];
    const tail = syllables[syllables.length - 1];
    out.push({
      lineId: line.id,
      edge: 'start',
      syllableId: head.id,
      cell: {
        sectionId: firstPlaced.anchor.sectionId,
        barIndex: firstPlaced.anchor.barIndex,
        beatPos: firstPlaced.anchor.beatPos,
      },
      onItsUnit: head.id === firstPlaced.id,
    });
    if (tail.id !== head.id && lastPlaced.anchor) {
      out.push({
        lineId: line.id,
        edge: 'end',
        syllableId: tail.id,
        cell: {
          sectionId: lastPlaced.anchor.sectionId,
          barIndex: lastPlaced.anchor.barIndex,
          beatPos: lastPlaced.anchor.beatPos,
        },
        onItsUnit: tail.id === lastPlaced.id,
      });
    }
  }
  return out;
}

/** Group markers by cell, for the renderer. */
export function buildMarkerIndex(
  lines: ReadonlyArray<SongLyricLine>,
): Map<string, LineMarkerPlacement[]> {
  const index = new Map<string, LineMarkerPlacement[]>();
  for (const marker of lineMarkers(lines)) {
    const key = cellKey(marker.cell);
    const list = index.get(key);
    if (list) list.push(marker);
    else index.set(key, [marker]);
  }
  return index;
}

/** The syllable a marker drag should place. */
export function markerTargetSyllable(
  lines: ReadonlyArray<SongLyricLine>,
  lineId: string,
  edge: 'start' | 'end',
): string | null {
  const line = lines.find(l => l.id === lineId);
  const syllables = line?.syllables ?? [];
  if (syllables.length === 0) return null;
  return edge === 'start'
    ? syllables[0].id
    : syllables[syllables.length - 1].id;
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
  return next;
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
    // A per-cell running counter used to stamp `anchor.order` here, to
    // reproduce the legacy stacking order (lines in array order, words
    // in index order). That is now exactly what song order gives for
    // free at render, so the counter and the field are both gone
    // (rev 5) and the fold's output is unchanged.
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
        syllable.anchor = { sectionId: section.sectionId, barIndex, beatPos };
        return syllable;
      });
      out.push({ id: makeId(), kind: 'lyric', text, syllables });
    }
  }
  return out;
}
