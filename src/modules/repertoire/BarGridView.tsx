import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLongPress } from '../../lib/useLongPress';
import {
  type DraggableSyntheticListeners,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import type { DraggableAttributes } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLiveQuery } from 'dexie-react-hooks';
import type {
  ChordFunction,
  LyricLine,
  Song,
  SongLyricLine,
  SongSection,
  VoicingEntry,
  VoicingHand,
  VoicingPattern,
} from '../../lib/db';
import {
  type CellOccupant,
  type LineMarkerPlacement,
  canJoinNext,
  cellKey,
  lineStatus,
  findSyllable,
} from './lyricSyllables';
import { chordToDisplay, keyPrefersFlats, parseChordFunction } from './chordFunction';
import { pitchClassOf } from './chordParser';
import { chordRootNote, normalizeVoicing, sanitizeVoicing } from './voicingHelpers';
import PianoKeyboard from '../../components/PianoKeyboard';
import { qualityIdFromSuffix } from '../shapes-and-patterns/voicingQualityMap';
import { CHORD_QUALITY_BY_ID } from '../shapes-and-patterns/catalog';
import {
  loadVoicingCandidates,
  orderVoicingCandidates,
  createUserVoicingPattern,
} from '../shapes-and-patterns/voicingPatterns';
import { useNotationMode } from '../../lib/notationPref';
import {
  type Bar,
  assembleBarItems,
  type BarCell,
  deriveBarGrid,
  slotsPerBar,
  slotToPosition,
  effectiveHarmonicTag,
  effectiveTimeSignature,
  parseTimeSignature,
} from './barGrid';
import {
  beatNoteName,
  formatDurationBeats,
  slotsFromDurationInput,
} from './chordDuration';
import { distributedWordPositions } from './lyricLine';
import { chordPalette, useIsDarkMode } from './chordColors';
import ChordGlyph from './chordGlyph';
import SectionToggle from './SectionToggle';
import LyricListRow from './LyricListRow';

// Bar-grid renderer (Lead Sheet Redesign, May 2026 —
// docs/LEAD_SHEET_REDESIGN.md).
//
// Renders chord placements as a measure grid. Below each bar's chord
// row sits a lyric row: per-beat drop zones plus any placed lyric-
// line words whose distributed position falls in this bar. Unplaced
// lines (start == end == 0) live in a "pending tray" above the bars
// and become draggable strips the user drops onto a beat slot.
//
// All drag-and-drop is owned by the parent `DndContext` in
// `LeadSheetSection` — this component just declares the draggables
// and droppables via dnd-kit hooks. Chord cells stay sortable (chord
// reorder), lyric markers / words / pending strips are free
// draggables targeting the per-beat droppables.

// Drag id prefixes used across BarGridView + LyricStagingArea +
// LeadSheetSection's onDragEnd dispatch.
export const DRAG_ID = {
  chord: (placementId: string) => `chord:${placementId}`,
  /** Empty beat slot in a bar (chord drop target). */
  /** Empty slot in a bar (chord drop target). The trailing `+` marks
   *  an offbeat, so on-beat ids are byte-identical to what they were
   *  before eighths existed — an existing target cannot be renamed by
   *  a feature the song has not enabled. */
  emptyBeat: (barIndex: number, beatPos: number, offbeat?: boolean) =>
    `emptybeat:${barIndex}:${beatPos}${offbeat ? '+' : ''}`,
  /** Lyric drop slot per beat (lyric drop target). Distinct prefix
   *  from `emptybeat:` because chord drags only see emptybeat targets
   *  and lyric drags only see beat targets. */
  beat: (barIndex: number, beatPos: number, offbeat?: boolean) =>
    `beat:${barIndex}:${beatPos}${offbeat ? '+' : ''}`,
  pending: (lineId: string) => `pending:${lineId}`,
  lineStart: (lineId: string) => `lineStart:${lineId}`,
  lineEnd: (lineId: string) => `lineEnd:${lineId}`,
  word: (lineId: string, wordIdx: number) => `word:${lineId}:${wordIdx}`,
  /** Song-owned syllable (rev 3). Replaces `word:` once a song has
   *  migrated to `Song.lyricLines`; both exist while sections can still
   *  be on the legacy path. */
  syllable: (syllableId: string) => `syl:${syllableId}`,
  bar: (barIndex: number) => `bar:${barIndex}`,
};

/**
 * The INVERSE of `DRAG_ID.beat` / `DRAG_ID.emptyBeat`.
 *
 * Lives beside the builders because keeping them apart is what broke:
 * the drop handler open-coded `parseInt(beatStr, 10)`, which reads
 * "2+" as 2 and DROPS THE OFFBEAT SILENTLY — no refusal, just a word
 * landing on the cell next door. The chord branch had its own correct
 * copy of this parse a few lines above; the lyric branch had a wrong
 * one. One parser, next to the builder it inverts.
 *
 * Returns null for an id that is not a slot target at all.
 */
export function parseSlotDropId(
  id: string,
): { barIndex: number; beatPos: number; offbeat: boolean } | null {
  const prefix = id.startsWith('beat:')
    ? 'beat:'
    : id.startsWith('emptybeat:')
      ? 'emptybeat:'
      : null;
  if (!prefix) return null;
  const [barStr, beatStr] = id.slice(prefix.length).split(':');
  if (beatStr === undefined) return null;
  const barIndex = parseInt(barStr, 10);
  const beatPos = parseInt(beatStr, 10);
  if (!Number.isFinite(barIndex) || !Number.isFinite(beatPos)) return null;
  return { barIndex, beatPos, offbeat: beatStr.endsWith('+') };
}

/**
 * Bars per row: 2 on desktop, 1 on mobile (≤768px). Compound meters
 * (e.g. 6/8's 6 beat slots) are unreadably cramped at 2-per-row on a
 * phone, so each bar takes the full container width there.
 *
 * Responsive via a media query rather than pure CSS because the bar row
 * and its aligned lyric row are chunked into rows in JS, and both grids
 * must share the same column count to stay aligned — a CSS-only column
 * change would orphan the lyric row beneath both bars. Layout-only: no
 * data or business logic depends on this value.
 */
const MOBILE_QUERY = '(max-width: 768px)';

function useBarsPerRow(): number {
  const read = () =>
    typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
      ? 1
      : 2;
  const [barsPerRow, setBarsPerRow] = useState(read);
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setBarsPerRow(read());
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return barsPerRow;
}

interface Props {
  song: Song;
  section: SongSection;
  activeArrangementId: string;
  /** Chord placements for the active arrangement, already split into
   *  bar/cell shape. Re-derived from `section` here too, but exposed
   *  as a prop would let a future caller mock it; currently internal. */
  onChordBeatsChange?: (
    placementId: string,
    beats: number,
  ) => Promise<void> | void;
  onChordTagChange?: (
    placementId: string,
    tag: string | null,
  ) => Promise<void> | void;
  /** Tap 'Delete chord' in the chord-edit popover. Removes the
   *  placement from section.chordPlacements (caller reconciles
   *  barLayout). The popover closes once this resolves. */
  onChordDelete?: (placementId: string) => Promise<void> | void;
  /** Save a piano voicing (offset/hand entries) from the chord-edit popover.
   *  `voicingPatternId` records which carousel pattern the voicing came from
   *  (omitted/undefined = a hand-edited custom voicing, which clears any
   *  prior provenance). */
  onChordVoicingChange?: (
    placementId: string,
    voicing: VoicingEntry[],
    voicingPatternId?: string,
  ) => Promise<void> | void;
  /** Save the per-placement pinned voicing-pattern ids (carousel favorites). */
  onChordVoicingPinsChange?: (
    placementId: string,
    pinnedVoicingIds: string[],
  ) => Promise<void> | void;
  /** Whether chord cells render as sortable (drag-to-reorder). Drag
   *  end is handled by the parent DndContext; this flag just tells
   *  us to wrap each cell in `useSortable`. */
  chordsAreSortable?: boolean;
  /** Lyric lines on this section. Pending lines (start == end) render
   *  in the tray above the grid; placed lines render in their bars'
   *  lyric rows. */
  lyricLines?: LyricLine[];
  /** Song-owned anchor→cell index (rev 3). When present the lyric row
   *  renders from this instead of from `lyricLines`, and every legacy
   *  lyric prop above is ignored. Built once per song above the
   *  sections, because a line's syllables may be anchored into any of
   *  them. */
  cellIndex?: Map<string, CellOccupant[]>;
  /** A lyric drag is in flight — beat cells switch to their
   *  drop-target treatment. */
  lyricDragActive?: boolean;
  /** cellKey of a cell that just refused a drop (out-of-order
   *  placement). Cleared by the parent after the animation. */
  rejectedCell?: string | null;
  /** Line start/end markers grouped by cell (rev 3 §A1). */
  markerIndex?: Map<string, LineMarkerPlacement[]>;
  /** Tap-to-place (step 6a): the syllable a beat-cell tap will place. */
  armedSyllableId?: string | null;
  /** The line placement in progress, if any. Drives the beat-cell hint
   *  alongside `armedSyllableId`, and marks the ◂ when the END is what
   *  is being asked for. */
  awaitingLine?: { lineId: string; edge: 'start' | 'end' } | null;
  /** Cell key the line-end prompt is anchored to, and a callback the
   *  matching cell uses to hand its NODE up. Node identity, never a
   *  beat-id lookup: beat ids repeat across sections. */
  promptAnchorCellKey?: string | null;
  onPromptAnchorNode?: (node: HTMLElement | null) => void;
  onSyllableTap?: (syllableId: string) => void;
  onBeatCellTap?: (
    barIndex: number,
    beatPos: number,
    /** Viewport rect of the tapped cell, for positioning a refusal
     *  message over it. */
    cellRect?: DOMRect,
    offbeat?: boolean,
  ) => void | Promise<void>;
  /** Full song store — the edit popover needs a syllable's text and
   *  whether it has a next sibling to join with. */
  songLyricLines?: SongLyricLine[];
  onSyllableSplit?: (syllableId: string, splitAt: number) => void | Promise<void>;
  onSyllableJoin?: (syllableId: string) => void | Promise<void>;
  onSyllableChange?: (syllableId: string, nextText: string) => void | Promise<void>;
  onSyllableUnplace?: (syllableId: string) => void | Promise<void>;
  /** Return a whole line to the tray, keeping its text. Reached from
   *  the tray row and from the syllable popover's line-scope action. */
  onLineUnplace?: (lineId: string) => void | Promise<void>;
  /** Tap-× on a line removes it from the section entirely. */
  onLineDelete?: (lineId: string) => void;
  /** Tap-`+ bar` appends an empty bar to the grid for lyric-only
   *  placement. Increments `section.barCount`. */
  onAddBar?: () => void;
  /** Tap-× on an empty bar's header removes that bar. Caller is
   *  responsible for warning the user if the bar carries lyrics. */
  onDeleteBar?: (barIndex: number) => void;
  /** When supplied, each bar gets a drag handle in its header that
   *  fires this callback on drop. The handler is expected to call
   *  `reorderBar` and persist the result (phrases + barLayout +
   *  lyricLines). When omitted, bar drag is disabled. */
  onBarReorder?: (fromIndex: number, toIndex: number) => void | Promise<void>;
  /** Tap-syllable-split (Lead Sheet Redesign step 7). Called when the
   *  user picks a split position inside a placed word. */
  onWordSplit?: (
    lineId: string,
    wordIndex: number,
    splitAt: number,
  ) => void | Promise<void>;
  /** Tap-syllable-join (Lead Sheet Redesign step 7). Called with the
   *  wordIndex of the LEFT syllable; joinWords merges it with the
   *  one immediately following. */
  onWordJoin?: (lineId: string, wordIndex: number) => void | Promise<void>;
  /** Inline syllable text edit. The WordEditPopover's 'edit' mode fires
   *  this with the new trimmed text; the handler runs setWordText and
   *  persists. Pairs with onWordSplit / onWordJoin as the third
   *  syllable-level mutation. */
  onWordChange?: (
    lineId: string,
    wordIndex: number,
    nextText: string,
  ) => void | Promise<void>;
  /** Tap the header's ↩ button. Pops the parent's undo stack and
   *  restores the prior section state. */
  onUndo?: () => void | Promise<void>;
  /** Drives the undo button's enabled state. */
  canUndo?: boolean;
  /** Tap the header's ↪ button. Pops the redo stack and restores. */
  onRedo?: () => void | Promise<void>;
  /** Drives the redo button's enabled state. */
  canRedo?: boolean;
  /** When supplied, the time-signature label in the header becomes a
   *  picker that lets the user override the song-level default for
   *  this section. `null` clears the override (fall back to song
   *  default). */
  onTimeSignatureChange?: (next: string | null) => void | Promise<void>;
  /** When supplied, tapping an empty beat slot opens an inline chord-
   *  add popover; on confirm this fires with the parsed chord and the
   *  destination position. Caller is expected to create a new
   *  `ChordPlacement` with these fields + a fresh id + beats:1. */
  onChordAdd?: (
    barIndex: number,
    beatPos: number,
    chord: ChordFunction,
    offbeat?: boolean,
  ) => void | Promise<void>;
  /** Session-lifetime chord clipboard. When set, the chord-add popover
   *  on an empty beat shows a one-tap 'Paste' option. */
  copiedChord?: ChordFunction | null;
  /** Tap 'Copy chord' in the chord-edit popover; stores the chord's
   *  function/quality/bass/harmonicTag in the parent's clipboard. */
  onCopyChord?: (chord: ChordFunction) => void;
  /** Play mode — hides the bar-grid header (label/count/time-sig +
   *  undo/redo) and the + bar button, and renders empty beat slots as
   *  nothing so only occupied chords show. */
  playMode?: boolean;
}

interface EditingState {
  /** Bar-anchored placement id (or legacy `legacy:phraseId:beatId`
   *  for unmigrated sections). Handlers route by this id end-to-end. */
  placementId: string;
  /** Which bar to anchor the popover under. A placement lives in
   *  exactly one bar; tracked here so the popover renders below the
   *  correct BarBox without re-walking the grid. */
  barIndex: number;
}

export default function BarGridView({
  song,
  section,
  activeArrangementId,
  onChordBeatsChange,
  onChordTagChange,
  onChordDelete,
  onChordVoicingChange,
  onChordVoicingPinsChange,
  chordsAreSortable = false,
  lyricLines = [],
  cellIndex,
  lyricDragActive = false,
  rejectedCell = null,
  markerIndex,
  armedSyllableId = null,
  awaitingLine = null,
  promptAnchorCellKey = null,
  onPromptAnchorNode,
  onSyllableTap,
  onBeatCellTap,
  songLyricLines,
  onSyllableSplit,
  onSyllableJoin,
  onSyllableChange,
  onSyllableUnplace,
  onLineUnplace,
  onLineDelete,
  onAddBar,
  onDeleteBar,
  onBarReorder,
  onWordSplit,
  onWordJoin,
  onWordChange,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  onTimeSignatureChange,
  onChordAdd,
  copiedChord,
  onCopyChord,
  playMode = false,
}: Props) {
  const eighths = song.eighths === true;
  const [notationMode] = useNotationMode();
  const timeSignature = effectiveTimeSignature(song, section);
  const { beatsPerBar, beatUnit } = parseTimeSignature(timeSignature);

  const bars = useMemo(
    () => deriveBarGrid(section, activeArrangementId, beatsPerBar, eighths),
    // `eighths` decides how many positions a bar has, so leaving it out
    // meant toggling it mid-session kept rendering the grid derived
    // under the old setting until something else happened to change.
    [section, activeArrangementId, beatsPerBar, eighths],
  );
  /** Positions a bar offers. Every width in the row divides by THIS,
   *  not by beatsPerBar — which is what keeps a migrated chord's
   *  rendered width identical to what it was before. */
  const barSlots = slotsPerBar(beatsPerBar, eighths);

  // Flat list of chord sortable ids across all bars so cross-bar
  // drag-to-reorder uses one SortableContext. Each cell carries its
  // bar-anchored placement id (or a legacy `legacy:phraseId:beatId`
  // synthetic id for unmigrated sections).
  const chordSortableIds = useMemo(
    () =>
      bars
        .flatMap(b => b.cells)
        .filter(c => !c.tiedFromPrev)
        .map(c => DRAG_ID.chord(c.placementId)),
    [bars],
  );

  // Lines partitioned into pending (start == end == 0) and placed
  // (anything with a range). The parent submits all lines into
  // section.lyricLines with start/end = 0 initially; the first drop
  // moves them out of the pending state.
  const { pendingLines, placedLines } = useMemo(() => {
    const pending: LyricLine[] = [];
    const placed: LyricLine[] = [];
    for (const line of lyricLines) {
      const isPending =
        line.startBar === 0 &&
        line.startBeat === 0 &&
        line.endBar === 0 &&
        line.endBeat === 0;
      if (isPending) pending.push(line);
      else placed.push(line);
    }
    return { pendingLines: pending, placedLines: placed };
  }, [lyricLines]);

  const [editing, setEditing] = useState<EditingState | null>(null);
  // Word-edit popover state (step 7). Anchored under the bar that
  // contains the word's current visual position.
  const [wordEditing, setWordEditing] = useState<{
    lineId: string;
    wordIndex: number;
    barIndex: number;
    mode: 'actions' | 'split' | 'edit';
  } | null>(null);
  // Time-signature picker state (step 8). Anchored under the header
  // time-signature label.
  const [timeSigPickerOpen, setTimeSigPickerOpen] = useState(false);
  // Chord-add popover (step ?: tap-to-add chord on empty beat slot).
  // Anchored under the bar containing the tapped empty slot.
  const [newChordAt, setNewChordAt] = useState<
    { barIndex: number; beatPos: number; offbeat?: boolean } | null
  >(null);
  // Foundation view (detection redesign part 4). When on, harmonically-
  // tagged chords (secondary dominants etc.) ghost out to reveal the
  // structural skeleton. Local to this section view — not persisted.
  const [foundationMode, setFoundationMode] = useState(false);
  // Syllable-edit popover (rev 3). Anchored under the bar holding the
  // tapped syllable, mirroring the legacy word popover.
  const [syllableEditing, setSyllableEditing] = useState<{
    syllableId: string;
    barIndex: number;
    mode: 'actions' | 'split' | 'edit';
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const barsPerRow = useBarsPerRow();

  useEffect(() => {
    if (!editing && !wordEditing && !timeSigPickerOpen && !newChordAt && !syllableEditing) return;
    const onDown = (e: MouseEvent) => {
      const node = containerRef.current;
      if (!node) return;
      if (e.target instanceof Node && node.contains(e.target)) return;
      setEditing(null);
      setWordEditing(null);
      setTimeSigPickerOpen(false);
      setNewChordAt(null);
      setSyllableEditing(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editing, wordEditing, timeSigPickerOpen, newChordAt, syllableEditing]);

  // Drop the popover if its syllable disappears (split/join/undo).
  useEffect(() => {
    if (!syllableEditing || !songLyricLines) return;
    if (!findSyllable(songLyricLines, syllableEditing.syllableId)) {
      setSyllableEditing(null);
    }
  }, [songLyricLines, syllableEditing]);

  useEffect(() => {
    if (!editing) return;
    const stillVisible = bars.some(
      bar =>
        bar.index === editing.barIndex &&
        bar.cells.some(c => c.placementId === editing.placementId),
    );
    if (!stillVisible) setEditing(null);
  }, [bars, editing]);

  useEffect(() => {
    if (!wordEditing) return;
    const line = lyricLines.find(l => l.id === wordEditing.lineId);
    if (!line || wordEditing.wordIndex >= line.words.length) {
      setWordEditing(null);
    }
  }, [lyricLines, wordEditing]);

  if (bars.length === 0) {
    // Play mode: an empty section contributes nothing but its name label
    // (rendered by LeadSheetSection) — no editing chrome.
    if (playMode) return null;
    return (
      <div className="rounded-md border border-dashed border-neutral-200 dark:border-neutral-800 p-3">
        <BarGridHeader
          timeSignature={timeSignature}
          barCount={0}
          onUndo={onUndo}
          canUndo={canUndo}
          onRedo={onRedo}
          canRedo={canRedo}
          isOverridden={section.timeSignature !== undefined && section.timeSignature.trim() !== ''}
          onTimeSignatureChange={onTimeSignatureChange}
          pickerOpen={timeSigPickerOpen}
          setPickerOpen={setTimeSigPickerOpen}
          foundationMode={foundationMode}
          onToggleFoundation={() => setFoundationMode(v => !v)}
        />
        <p className="mt-2 text-[11px] italic text-neutral-500">
          No chords yet — add chord placements on phrase lines below, or
          {' '}
          {onAddBar ? 'tap + bar to start an empty bar for lyrics.' : 'they\'ll appear here as bars.'}
        </p>
        {onAddBar && (
          <div className="mt-2">
            <AddBarButton onAddBar={onAddBar} />
          </div>
        )}
      </div>
    );
  }

  const rows: Bar[][] = [];
  for (let i = 0; i < bars.length; i += barsPerRow) {
    rows.push(bars.slice(i, i + barsPerRow));
  }

  const editable = Boolean(onChordBeatsChange || onChordTagChange);

  const handleCellClick = editable
    ? (cell: BarCell, barIndex: number) => {
        // Opening the chord-edit popover dismisses any chord-add
        // popover in progress; the two anchor to the same bar and
        // would visually collide.
        setNewChordAt(null);
        setEditing(prev => {
          if (
            prev &&
            prev.placementId === cell.placementId &&
            prev.barIndex === barIndex
          ) {
            return null;
          }
          return { placementId: cell.placementId, barIndex };
        });
      }
    : undefined;

  const handleEmptyBeatClick = onChordAdd
    ? (barIndex: number, beatPos: number, offbeat?: boolean) => {
        // Opening chord-add dismisses any chord-edit popover.
        setEditing(null);
        // `offbeat` is part of the identity of the slot that was
        // tapped. Dropping it made every "and" slot a dead target —
        // the add box could only ever match an on-beat position — and
        // silently, because a handler with FEWER parameters than its
        // prop type is assignable in TypeScript.
        setNewChordAt(prev =>
          prev &&
          prev.barIndex === barIndex &&
          prev.beatPos === beatPos &&
          (prev.offbeat ?? false) === (offbeat ?? false)
            ? null
            : { barIndex, beatPos, offbeat },
        );
      }
    : undefined;

  const handleBeatsChange = onChordBeatsChange
    ? async (cell: BarCell, nextBeats: number) => {
        const clamped = Math.min(Math.max(1, Math.round(nextBeats)), barSlots);
        // Compare against `cell.beats` (the live placement.beats),
        // not `cell.chord.beats` (the stale legacy ChordFunction
        // field that's only set at materialization and never updated).
        if (clamped === cell.beats) return;
        await onChordBeatsChange(cell.placementId, clamped);
      }
    : undefined;

  const handleTagChange = onChordTagChange
    ? async (cell: BarCell, tag: string | null) => {
        await onChordTagChange(cell.placementId, tag);
      }
    : undefined;

  const handleDelete = onChordDelete
    ? async (cell: BarCell) => {
        await onChordDelete(cell.placementId);
        setEditing(null);
      }
    : undefined;

  const handleVoicing = onChordVoicingChange
    ? async (cell: BarCell, voicing: VoicingEntry[], voicingPatternId?: string) => {
        await onChordVoicingChange(cell.placementId, voicing, voicingPatternId);
      }
    : undefined;

  const handlePins = onChordVoicingPinsChange
    ? async (cell: BarCell, pinnedVoicingIds: string[]) => {
        await onChordVoicingPinsChange(cell.placementId, pinnedVoicingIds);
      }
    : undefined;

  const body = (
    <>
      {/* THE GRID IS THE BODY OF THE SECTION and nothing sits above
          it. The per-section lyric tray used to render here, splitting
          the lyric controls across the section — tray above the grid,
          add box below it — for no reason other than where each was
          built. The tray now renders in LeadSheetSection beneath the
          add box, so the two halves of one job are together and in the
          same order the lyrics drawer uses. */}
      <div className="mt-2 space-y-3">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx}>
            {/* Bar row (chord boxes). */}
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${barsPerRow}, minmax(0, 1fr))` }}
            >
              {row.map(bar => (
                <BarBox
                  key={bar.index}
                  bar={bar}
                  eighths={eighths}
                  barSlots={barSlots}
                  durationUnit={beatNoteName(beatUnit)}
                  sectionKey={song.key}
                  notationMode={notationMode}
                  editing={editing}
                  onCellClick={handleCellClick}
                  onBeatsChange={handleBeatsChange}
                  onTagChange={handleTagChange}
                  onDelete={handleDelete}
                  onVoicingChange={handleVoicing}
                  onVoicingPinsChange={handlePins}
                  onCopyChord={onCopyChord}
                  copiedChord={copiedChord}
                  foundationMode={foundationMode}
                  draggable={chordsAreSortable}
                  onDeleteBar={onDeleteBar}
                  barDragEnabled={Boolean(onBarReorder)}
                  onEmptyBeatClick={handleEmptyBeatClick}
                  newChordAt={newChordAt}
                  onChordAddSubmit={
                    onChordAdd
                      ? (barIdx, beatPos, chord, offbeat) => {
                          void onChordAdd(barIdx, beatPos, chord, offbeat);
                          setNewChordAt(null);
                        }
                      : undefined
                  }
                  onChordAddCancel={() => setNewChordAt(null)}
                  playMode={playMode}
                />
              ))}
              {row.length < barsPerRow &&
                Array.from({ length: barsPerRow - row.length }).map((_, i) => (
                  <div key={`pad-${i}`} aria-hidden />
                ))}
            </div>
            {/* Lyric row aligned beat-by-beat with the bar row above.
                Same grid columns so each LyricBarSegment lines up
                under its bar; inside each segment beatsPerBar equal-
                width drop slots give beat-level alignment. */}
            <div
              className="grid gap-2 mt-1"
              style={{ gridTemplateColumns: `repeat(${barsPerRow}, minmax(0, 1fr))` }}
            >
              {row.map(bar => cellIndex ? (
                <SyllableBarSegment
                  key={bar.index}
                  sectionId={section.id}
                  barIndex={bar.index}
                  eighths={eighths}
                  barSlots={barSlots}
                  cellIndex={cellIndex}
                  lyricDragActive={lyricDragActive}
                  rejectedCell={rejectedCell}
                  markerIndex={markerIndex}
                  songLyricLines={songLyricLines}
                  editing={syllableEditing}
                  onEditingChange={setSyllableEditing}
                  armedSyllableId={armedSyllableId}
                  awaitingLine={awaitingLine}
                  promptAnchorCellKey={promptAnchorCellKey}
                  onPromptAnchorNode={onPromptAnchorNode}
                  onSyllableTap={onSyllableTap}
                  onBeatCellTap={onBeatCellTap}
                  onOpenSyllableMenu={
                    onSyllableSplit || onSyllableJoin || onSyllableChange
                      ? syllableId =>
                          setSyllableEditing(prev =>
                            prev && prev.syllableId === syllableId
                              ? null
                              : { syllableId, barIndex: bar.index, mode: 'actions' },
                          )
                      : undefined
                  }
                  onSplit={onSyllableSplit}
                  onJoin={onSyllableJoin}
                  onChange={onSyllableChange}
                  onUnplace={onSyllableUnplace}
                  onUnplaceLine={onLineUnplace}
                />
              ) : (
                <LyricBarSegment
                  key={bar.index}
                  barIndex={bar.index}
                  beatsPerBar={beatsPerBar}
                  placedLines={placedLines}
                  onLineDelete={onLineDelete}
                  wordEditing={wordEditing}
                  onWordClick={
                    onWordSplit || onWordJoin
                      ? (lineId, wordIndex) =>
                          setWordEditing(prev =>
                            prev &&
                            prev.lineId === lineId &&
                            prev.wordIndex === wordIndex
                              ? null
                              : {
                                  lineId,
                                  wordIndex,
                                  barIndex: bar.index,
                                  mode: 'actions',
                                },
                          )
                      : undefined
                  }
                  onWordEditingChange={setWordEditing}
                  onWordSplit={onWordSplit}
                  onWordJoin={onWordJoin}
                  onWordChange={onWordChange}
                />
              ))}
              {row.length < barsPerRow &&
                Array.from({ length: barsPerRow - row.length }).map((_, i) => (
                  <div key={`pad-lyr-${i}`} aria-hidden />
                ))}
            </div>
          </div>
        ))}
        {!playMode && !cellIndex && pendingLines.length > 0 && (
          <PendingTray lines={pendingLines} onLineDelete={onLineDelete} />
        )}
        {!playMode && onAddBar && (
          <div className="pt-1">
            <AddBarButton onAddBar={onAddBar} />
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      ref={containerRef}
      className="rounded-md border border-black/[0.07] px-2 py-3 md:p-3 bg-neutral-50/40 dark:bg-neutral-900/40"
    >
      {!playMode && (
        <BarGridHeader
          timeSignature={timeSignature}
          barCount={bars.length}
          onUndo={onUndo}
          canUndo={canUndo}
          onRedo={onRedo}
          canRedo={canRedo}
          isOverridden={section.timeSignature !== undefined && section.timeSignature.trim() !== ''}
          onTimeSignatureChange={onTimeSignatureChange}
          pickerOpen={timeSigPickerOpen}
          setPickerOpen={setTimeSigPickerOpen}
          foundationMode={foundationMode}
          onToggleFoundation={() => setFoundationMode(v => !v)}
        />
      )}
      {chordsAreSortable ? (
        <SortableContext items={chordSortableIds}>{body}</SortableContext>
      ) : (
        body
      )}
    </div>
  );
}

// cellKey was the legacy `${phraseId}:${beatId}` join — placementId
// is now the cell identity, so this helper is gone.

function AddBarButton({ onAddBar }: { onAddBar: () => void }) {
  return (
    <button
      type="button"
      onClick={onAddBar}
      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-fluent hover:border-fluent"
    >
      <span aria-hidden>+</span> bar
    </button>
  );
}

// Time-signature presets surfaced in the section-level picker.
// Mirrors `SongDetailView.TIME_SIGNATURE_PRESETS` so picks match
// across the song-meta editor and the per-section override.
const SECTION_TIME_SIGNATURE_PRESETS = ['4/4', '3/4', '6/8', '5/4', '7/8', '12/8'];

function BarGridHeader({
  timeSignature,
  barCount,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  isOverridden,
  onTimeSignatureChange,
  pickerOpen,
  setPickerOpen,
  foundationMode,
  onToggleFoundation,
}: {
  timeSignature: string;
  barCount: number;
  onUndo?: () => void | Promise<void>;
  canUndo?: boolean;
  onRedo?: () => void | Promise<void>;
  canRedo?: boolean;
  isOverridden: boolean;
  onTimeSignatureChange?: (next: string | null) => void | Promise<void>;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  foundationMode: boolean;
  onToggleFoundation: () => void;
}) {
  return (
    <div className="relative flex items-center justify-between text-[10px] uppercase tracking-wide text-neutral-500">
      <span>bar grid</span>
      <div className="flex items-center gap-2">
        <span>
          {barCount} bar{barCount === 1 ? '' : 's'} ·{' '}
          {onTimeSignatureChange ? (
            <button
              type="button"
              onClick={() => setPickerOpen(!pickerOpen)}
              title={
                isOverridden
                  ? 'Section override — tap to change or clear'
                  : 'Inherits song time signature — tap to override'
              }
              className="font-mono hover:text-fluent"
            >
              {timeSignature}
              {isOverridden && <span className="text-fluent ml-0.5">*</span>}
            </button>
          ) : (
            <span className="font-mono">{timeSignature}</span>
          )}
        </span>
        <button
          type="button"
          onClick={onToggleFoundation}
          aria-pressed={foundationMode}
          title={
            foundationMode
              ? 'Foundation view — tagged chords ghosted. Tap for full view.'
              : 'Full view — tap to reveal the harmonic skeleton'
          }
          className={`rounded border px-1.5 py-0.5 normal-case ${
            foundationMode
              ? 'border-fluent bg-fluent/10 text-fluent'
              : 'border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-fluent hover:border-fluent'
          }`}
        >
          {foundationMode ? 'Foundation' : 'Full'}
        </button>
        {onUndo && (
          <button
            type="button"
            onClick={() => void onUndo()}
            disabled={!canUndo}
            aria-label="Undo last edit"
            title={canUndo ? 'Undo last edit' : 'Nothing to undo'}
            className="text-[14px] leading-none px-1 text-neutral-500 hover:text-fluent disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↩
          </button>
        )}
        {onRedo && (
          <button
            type="button"
            onClick={() => void onRedo()}
            disabled={!canRedo}
            aria-label="Redo last undo"
            title={canRedo ? 'Redo last undo' : 'Nothing to redo'}
            className="text-[14px] leading-none px-1 text-neutral-500 hover:text-fluent disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↪
          </button>
        )}
      </div>

      {pickerOpen && onTimeSignatureChange && (
        <TimeSignaturePicker
          current={timeSignature}
          isOverridden={isOverridden}
          onPick={value => {
            void onTimeSignatureChange(value);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function TimeSignaturePicker({
  current,
  isOverridden,
  onPick,
  onClose,
}: {
  current: string;
  isOverridden: boolean;
  onPick: (value: string | null) => void;
  onClose: () => void;
}) {
  const [customDraft, setCustomDraft] = useState('');
  const trimmedDraft = customDraft.trim();
  const applyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (trimmedDraft === '') return;
    onPick(trimmedDraft);
  };
  return (
    <div
      className="absolute top-full right-0 mt-1 z-30 min-w-[14rem] rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-md p-2 text-[11px] normal-case tracking-normal"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-neutral-500">time signature</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="close time signature picker"
          className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          ×
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {SECTION_TIME_SIGNATURE_PRESETS.map(preset => {
          const selected = current === preset && isOverridden;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onPick(preset)}
              className={`px-2 py-0.5 rounded-full border font-mono ${
                selected
                  ? 'border-fluent bg-fluent/10 text-fluent'
                  : 'border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent'
              }`}
            >
              {preset}
            </button>
          );
        })}
      </div>
      <form className="flex items-center gap-1 mb-1" onSubmit={applyCustom}>
        <input
          type="text"
          value={customDraft}
          onChange={e => setCustomDraft(e.target.value)}
          placeholder="custom (e.g. 9/8)"
          className="flex-1 px-2 py-0.5 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 font-mono"
          onClick={e => e.stopPropagation()}
        />
        <button
          type="submit"
          disabled={trimmedDraft === ''}
          className="px-2 py-0.5 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent disabled:opacity-30 disabled:cursor-not-allowed"
        >
          apply
        </button>
      </form>
      {isOverridden && (
        <button
          type="button"
          onClick={() => onPick(null)}
          className="text-[11px] text-neutral-500 hover:text-needswork"
        >
          clear override (use song default)
        </button>
      )}
    </div>
  );
}

// --- Pending tray -----------------------------------------------------
// Lines the user has just pasted but not yet placed. Each renders as
// a draggable strip showing all words. Dropping on a beat slot
// initialises the line's range to that beat + a default of 1 bar.

/** Song-owned variant (rev 3). Lists lines with nothing placed yet.
 *  Interim only — the lyric drawer subsumes this in step 7, at which
 *  point "pending" stops being a bucket and is just "unplaced". */
export function SongPendingTray({
  lines,
  onLineDelete,
  onLineUnplace,
  onArmLine,
  onArmWord,
  onSetLineKind,
  onDuplicateLine,
  collapsed,
  onToggle,
}: {
  lines: SongLyricLine[];
  onLineDelete?: (lineId: string) => void;
  onLineUnplace?: (lineId: string) => void | Promise<void>;
  onArmLine?: (lineId: string) => void;
  onArmWord?: (syllableId: string) => void;
  onSetLineKind?: (lineId: string, kind: 'lyric' | 'header') => void | Promise<void>;
  onDuplicateLine?: (lineId: string) => void | Promise<void>;
  collapsed: boolean;
  onToggle?: () => void;
}) {
  const [pickLineId, setPickLineId] = useState<string | null>(null);
  const [menuLineId, setMenuLineId] = useState<string | null>(null);
  // Momentary reveal, deliberately NOT persisted like the other lead
  // sheet prefs. Those are standing preferences — "I don't want to see
  // this" — whereas showing finished lines is "let me fix one thing".
  // It also sits inside a tray that is itself collapsed by default, so
  // a remembered expansion would be invisible state waiting to
  // surprise someone.
  const [showPlaced, setShowPlaced] = useState(false);

  const unfinished = lines.filter(l => lineStatus(l).status !== 'placed');
  const placed = lines.filter(l => lineStatus(l).status === 'placed');
  const placeable = unfinished.filter(l => l.kind !== 'header').length;

  const rowFor = (line: SongLyricLine, dimPlaced: boolean) => (
    <TrayRow
      key={line.id}
      line={line}
      dimPlaced={dimPlaced}
      onArm={onArmLine}
      onArmWord={onArmWord}
      picking={pickLineId === line.id}
      onPickingChange={pick => setPickLineId(pick ? line.id : null)}
      menuOpen={menuLineId === line.id}
      onMenuOpenChange={open => setMenuLineId(open ? line.id : null)}
      onSetLineKind={onSetLineKind}
      onDuplicate={onDuplicateLine}
      onDelete={onLineDelete}
      onUnplace={onLineUnplace}
    />
  );

  return (
    <div className="mt-2 rounded border border-dashed border-neutral-300 dark:border-neutral-700 p-2 bg-white/40 dark:bg-neutral-900/40">
      {/* Collapsed by default, and HIDDEN rather than removed on
          purpose. Step 7 replaces these per-section trays with a
          song-level lyric drawer; they will probably go entirely then.
          But drag has known problems, so the fallback stays until the
          drawer has been in real use — see the plan doc's note on the
          step 2 → step 7 gap. The count keeps the tray honest while
          shut: you can see there is unplaced work without opening it. */}
      <SectionToggle
        label="unplaced lyrics"
        expanded={!collapsed}
        onToggle={onToggle}
        count={placeable}
        hint={collapsed ? undefined : 'tap to place, or drag onto a beat'}
      />
      {!collapsed && (
        <div className="flex flex-col gap-1 mt-1">
          {unfinished.map(line => rowFor(line, false))}
          {placed.length > 0 && (
            <>
              {/* ONE group control, not per-line collapsing. Finished
                  lines have to be reachable now that the tray can pick
                  words — otherwise moving one word of a finished line
                  would mean opening the drawer — but showing them all
                  by default would undo the compactness that justified
                  hiding them. */}
              <SectionToggle
                label={`${placed.length} placed line${placed.length === 1 ? '' : 's'}`}
                expanded={showPlaced}
                onToggle={() => setShowPlaced(v => !v)}
                className="mt-1"
              />
              {showPlaced && placed.map(line => rowFor(line, true))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** A tray row: the shared list row, made draggable. */
function TrayRow({
  line,
  dimPlaced,
  ...rest
}: {
  line: SongLyricLine;
  dimPlaced: boolean;
} & Omit<React.ComponentProps<typeof LyricListRow>, 'line' | 'drag' | 'dimPlaced'>) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: DRAG_ID.pending(line.id),
  });
  const isHeader = line.kind === 'header';
  return (
    <LyricListRow
      {...rest}
      line={line}
      dimPlaced={dimPlaced}
      drag={
        isHeader
          ? undefined
          : {
              setNodeRef,
              attributes: attributes as unknown as Record<string, unknown>,
              listeners: listeners as unknown as Record<string, unknown>,
              isDragging,
              handle: (
                <span
                  className="text-neutral-500 dark:text-neutral-400 mr-1"
                  aria-hidden
                >
                  ≡
                </span>
              ),
            }
      }
    />
  );
}

function PendingTray({
  lines,
  onLineDelete,
}: {
  lines: LyricLine[];
  onLineDelete?: (lineId: string) => void;
}) {
  return (
    <div className="mt-2 rounded border border-dashed border-neutral-300 dark:border-neutral-700 p-2 bg-white/40 dark:bg-neutral-900/40">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
        pending lyrics — drag onto a beat to place
      </div>
      <div className="flex flex-col gap-1">
        {lines.map(line => (
          <PendingLineStrip key={line.id} line={line} onDelete={onLineDelete} />
        ))}
      </div>
    </div>
  );
}

function PendingLineStrip({
  line,
  onDelete,
}: {
  line: LyricLine;
  onDelete?: (lineId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: DRAG_ID.pending(line.id),
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div className="flex items-center gap-2">
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="flex-1 inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[11px] text-neutral-700 dark:text-neutral-200 cursor-grab active:cursor-grabbing select-none touch-none"
      >
        <span className="text-neutral-400 mr-1" aria-hidden>≡</span>
        <span className="truncate">{line.words.join(' ')}</span>
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(line.id)}
          aria-label="delete pending lyric line"
          className="text-neutral-400 hover:text-needswork text-xs leading-none px-1"
        >
          ×
        </button>
      )}
    </div>
  );
}

// --- Bar box -----------------------------------------------------------

function BarBox({
  bar,
  eighths,
  barSlots,
  durationUnit,
  sectionKey,
  notationMode,
  editing,
  onCellClick,
  onBeatsChange,
  onTagChange,
  onDelete,
  onVoicingChange,
  onVoicingPinsChange,
  onCopyChord,
  copiedChord,
  foundationMode,
  draggable,
  onDeleteBar,
  barDragEnabled,
  onEmptyBeatClick,
  newChordAt,
  onChordAddSubmit,
  onChordAddCancel,
  playMode,
}: {
  bar: Bar;
  eighths: boolean;
  barSlots: number;
  /** Note value one beat represents, e.g. "quarter notes". Named from
   *  the time signature's denominator, never assumed. */
  durationUnit: string;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  editing: EditingState | null;
  onCellClick?: (cell: BarCell, barIndex: number) => void;
  onBeatsChange?: (cell: BarCell, beats: number) => void | Promise<void>;
  onTagChange?: (cell: BarCell, tag: string | null) => void | Promise<void>;
  onDelete?: (cell: BarCell) => void | Promise<void>;
  onVoicingChange?: (cell: BarCell, voicing: VoicingEntry[], voicingPatternId?: string) => void | Promise<void>;
  onVoicingPinsChange?: (cell: BarCell, pinnedVoicingIds: string[]) => void | Promise<void>;
  onCopyChord?: (chord: ChordFunction) => void;
  copiedChord?: ChordFunction | null;
  foundationMode: boolean;
  draggable: boolean;
  onDeleteBar?: (barIndex: number) => void;
  barDragEnabled: boolean;
  onEmptyBeatClick?: (
    barIndex: number,
    beatPos: number,
    offbeat?: boolean,
  ) => void;
  newChordAt: { barIndex: number; beatPos: number; offbeat?: boolean } | null;
  onChordAddSubmit?: (
    barIndex: number,
    beatPos: number,
    chord: ChordFunction,
    offbeat?: boolean,
  ) => void;
  onChordAddCancel: () => void;
  playMode: boolean;
}) {
  const editingCellInThisBar =
    editing && editing.barIndex === bar.index
      ? bar.cells.find(c => c.placementId === editing.placementId) ?? null
      : null;


  // Walk slots 0..barSlots-1 to assemble the row. At each position
  // we either emit a chord cell (its leading half), skip a position
  // that's covered by a tied multi-beat chord, or emit an empty beat
  // drop slot. This is what makes Option C work: empty positions —
  // both gaps between chords AND trailing dashed space — become
  // discrete droppables for chord drag.
  const items = assembleBarItems(bar.cells, barSlots, eighths);

  // Bar drag (whole-bar reorder). useDraggable supplies the visual
  // transform + drag listeners attached to a small handle in the
  // header; useDroppable lets this bar accept other bars as drop
  // targets. The two share the same id (`bar:N`) and combine refs
  // on the bar's wrapper so the lift visual and drop region align.
  const bardrop = useDroppable({
    id: DRAG_ID.bar(bar.index),
    disabled: !barDragEnabled,
  });
  const bardrag = useDraggable({
    id: DRAG_ID.bar(bar.index),
    disabled: !barDragEnabled,
  });
  const setBarRefs = (node: HTMLDivElement | null) => {
    bardrop.setNodeRef(node);
    bardrag.setNodeRef(node);
  };
  const barStyle: CSSProperties = barDragEnabled
    ? {
        transform: CSS.Translate.toString(bardrag.transform),
        opacity: bardrag.isDragging ? 0.4 : 1,
      }
    : {};
  const dropHighlight =
    barDragEnabled && bardrop.isOver && !bardrag.isDragging
      ? 'ring-2 ring-fluent ring-offset-1 ring-offset-white dark:ring-offset-neutral-900'
      : '';

  return (
    <div
      ref={setBarRefs}
      style={barStyle}
      className={`relative rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1 pt-3 pb-1 min-h-[44px] ${dropHighlight}`}
    >
      <span className="absolute top-0.5 left-1 text-[9px] text-neutral-400 font-mono">
        {bar.index + 1}
      </span>
      {barDragEnabled && (
        <button
          type="button"
          {...bardrag.attributes}
          {...bardrag.listeners}
          aria-label={`drag bar ${bar.index + 1}`}
          title="drag to reorder this bar"
          className="absolute top-0.5 left-5 text-[10px] leading-none text-neutral-400 hover:text-fluent cursor-grab active:cursor-grabbing touch-none px-0.5"
        >
          ⋮⋮
        </button>
      )}
      {/* ANY bar is deletable, not just chord-free ones. The case that
          most needs it is a section transcribed as five bars that is
          actually four — and the spare bar has chords in it. A confirm
          names what will be removed. */}
      {onDeleteBar && (
        <button
          type="button"
          onClick={() => onDeleteBar(bar.index)}
          aria-label={`delete bar ${bar.index + 1}`}
          title="delete this bar"
          className="absolute top-0.5 right-1 text-[10px] leading-none text-neutral-400 hover:text-needswork px-0.5"
        >
          ×
        </button>
      )}
      {/* No horizontal scroll at any size: slots flex-shrink to fit the
          bar with NO min-width floor, so every beat slot (e.g. 6/8's six)
          stays fully visible and scales equally to the bar width on both
          desktop and mobile. Each slot's `width: beats/barSlots %`
          basis still yields large slots when the bar is wide; a min-width
          floor only ever bound on narrow columns — which was exactly what
          caused the clipping/scroll. */}
      <div className="flex items-stretch gap-0.5 h-full">
        {items.map((item, idx) => {
          if (item.kind === 'empty') {
            // Play mode: empty positions render as nothing (no box, no
            // dashed border) so only occupied chords show.
            if (playMode) return null;
            return (
              <EmptyBeatSlot
                key={`e-${item.beatPos}${item.offbeat ? '+' : ''}`}
                barIndex={bar.index}
                beatPos={item.beatPos}
                widthPct={(1 / barSlots) * 100}
                offbeat={item.offbeat}
                onClick={
                  onEmptyBeatClick
                    ? () => onEmptyBeatClick(bar.index, item.beatPos, item.offbeat)
                    : undefined
                }
                isAdding={
                  newChordAt !== null &&
                  newChordAt.barIndex === bar.index &&
                  newChordAt.beatPos === item.beatPos &&
                  (newChordAt.offbeat ?? false) === (item.offbeat ?? false)
                }
              />
            );
          }
          const { cell, widthPct } = item;
          const isEditing =
            editing !== null && editing.placementId === cell.placementId;
          if (draggable) {
            return (
              <SortableChordCell
                key={`c-${cell.placementId}`}
                cell={cell}
                widthPct={widthPct}
                sectionKey={sectionKey}
                notationMode={notationMode}
                isEditing={isEditing}
                foundationMode={foundationMode}
                onClick={onCellClick ? c => onCellClick(c, bar.index) : undefined}
              />
            );
          }
          return (
            <ChordCellBox
              key={`c-${cell.placementId}-${idx}`}
              cell={cell}
              widthPct={widthPct}
              sectionKey={sectionKey}
              notationMode={notationMode}
              isEditing={isEditing}
              foundationMode={foundationMode}
              onClick={onCellClick ? c => onCellClick(c, bar.index) : undefined}
            />
          );
        })}
      </div>

      {editingCellInThisBar && (onBeatsChange || onTagChange) && (
        <ChordEditorPopover
          key={editingCellInThisBar.placementId}
          cell={editingCellInThisBar}
          barSlots={barSlots}
          eighths={eighths}
          durationUnit={durationUnit}
          sectionKey={sectionKey}
          notationMode={notationMode}
          onBeatsChange={onBeatsChange}
          onTagChange={onTagChange}
          onDelete={onDelete}
          onVoicingChange={onVoicingChange}
          onVoicingPinsChange={onVoicingPinsChange}
          onCopyChord={onCopyChord}
        />
      )}

      {newChordAt !== null &&
        newChordAt.barIndex === bar.index &&
        onChordAddSubmit && (
          <ChordAddPopover
            barIndex={newChordAt.barIndex}
            beatPos={newChordAt.beatPos}
            sectionKey={sectionKey}
            notationMode={notationMode}
            copiedChord={copiedChord}
            onSubmit={chord =>
              onChordAddSubmit(
                newChordAt.barIndex,
                newChordAt.beatPos,
                chord,
                newChordAt.offbeat,
              )
            }
            onCancel={onChordAddCancel}
          />
        )}
    </div>
  );
}

// --- Lyric bar segment ------------------------------------------------
// One bar's slot in the lyric row that sits below each bar row.
// Renders `beatsPerBar` equal-width drop targets — each is a
// `beat:${barIndex}:${beatPos}` droppable that also stacks any words
// / markers belonging to lines whose distributed positions land in
// this bar. The outer parent grid columns guarantee horizontal
// alignment with the bar boxes above.

interface WordEditingState {
  lineId: string;
  wordIndex: number;
  barIndex: number;
  mode: 'actions' | 'split' | 'edit';
}

function LyricBarSegment({
  barIndex,
  beatsPerBar,
  placedLines,
  onLineDelete,
  wordEditing,
  onWordClick,
  onWordEditingChange,
  onWordSplit,
  onWordJoin,
  onWordChange,
}: {
  barIndex: number;
  beatsPerBar: number;
  placedLines: LyricLine[];
  onLineDelete?: (lineId: string) => void;
  wordEditing: WordEditingState | null;
  onWordClick?: (lineId: string, wordIndex: number) => void;
  onWordEditingChange: (next: WordEditingState | null) => void;
  onWordSplit?: (
    lineId: string,
    wordIndex: number,
    splitAt: number,
  ) => void | Promise<void>;
  onWordJoin?: (lineId: string, wordIndex: number) => void | Promise<void>;
  onWordChange?: (
    lineId: string,
    wordIndex: number,
    nextText: string,
  ) => void | Promise<void>;
}) {
  // Compute, per beat slot, which words/markers belong here. A word
  // belongs to (bar, beat) when its global position floors to that
  // beat. Each line contributes at most one start marker (in start
  // bar at startBeat) and one end marker (in end bar at endBeat).
  type SlotItem =
    | { kind: 'word'; line: LyricLine; wordIndex: number; text: string }
    | { kind: 'startMarker'; line: LyricLine }
    | { kind: 'endMarker'; line: LyricLine };

  const slots: SlotItem[][] = Array.from({ length: beatsPerBar }, () => []);

  for (const line of placedLines) {
    if (line.startBar === barIndex) {
      slots[line.startBeat]?.push({ kind: 'startMarker', line });
    }
    if (line.endBar === barIndex) {
      slots[line.endBeat]?.push({ kind: 'endMarker', line });
    }
    const positions = distributedWordPositions(line, beatsPerBar);
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const wordBar = Math.floor(pos / beatsPerBar);
      const wordBeat = Math.round(pos - wordBar * beatsPerBar);
      if (wordBar !== barIndex) continue;
      const clampedBeat = Math.min(Math.max(0, wordBeat), beatsPerBar - 1);
      slots[clampedBeat].push({
        kind: 'word',
        line,
        wordIndex: i,
        text: line.words[i],
      });
    }
  }

  const popoverWord =
    wordEditing && wordEditing.barIndex === barIndex
      ? placedLines.find(l => l.id === wordEditing.lineId)
      : null;
  const popoverWordText =
    popoverWord && wordEditing
      ? popoverWord.words[wordEditing.wordIndex]
      : null;

  return (
    <div className="relative flex gap-0.5 px-1">
      {Array.from({ length: beatsPerBar }).map((_, beatPos) => (
        <BeatDropSlot
          key={beatPos}
          barIndex={barIndex}
          beatPos={beatPos}
          items={slots[beatPos]}
          onLineDelete={onLineDelete}
          onWordClick={onWordClick}
        />
      ))}
      {wordEditing && popoverWord && popoverWordText !== null && (
        <WordEditPopover
          key={`${wordEditing.lineId}:${wordEditing.wordIndex}`}
          state={wordEditing}
          wordText={popoverWordText}
          wordCount={popoverWord.words.length}
          onClose={() => onWordEditingChange(null)}
          onModeChange={mode =>
            onWordEditingChange({ ...wordEditing, mode })
          }
          onSplit={
            onWordSplit
              ? splitAt => {
                  void onWordSplit(wordEditing.lineId, wordEditing.wordIndex, splitAt);
                  onWordEditingChange(null);
                }
              : undefined
          }
          onJoin={
            onWordJoin
              ? leftIndex => {
                  void onWordJoin(wordEditing.lineId, leftIndex);
                  onWordEditingChange(null);
                }
              : undefined
          }
          onChange={
            onWordChange
              ? nextText => {
                  void onWordChange(
                    wordEditing.lineId,
                    wordEditing.wordIndex,
                    nextText,
                  );
                  onWordEditingChange(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

// --- anchor-based lyric row (rev 3) ----------------------------------
// Used once a song has migrated to `Song.lyricLines`. Renders straight
// from the song-level anchor→cell index built above the sections, so a
// syllable anchored into THIS section shows here regardless of which
// line owns it. The legacy `LyricBarSegment` below stays as the
// pre-migration path.

interface SyllableEditingState {
  syllableId: string;
  barIndex: number;
  mode: 'actions' | 'split' | 'edit';
}

function SyllableBarSegment({
  eighths,
  barSlots,
  sectionId,
  barIndex,
  cellIndex,
  lyricDragActive,
  rejectedCell,
  markerIndex,
  songLyricLines,
  editing,
  onEditingChange,
  armedSyllableId,
  awaitingLine,
  promptAnchorCellKey,
  onPromptAnchorNode,
  onSyllableTap,
  onBeatCellTap,
  onOpenSyllableMenu,
  onSplit,
  onJoin,
  onChange,
  onUnplace,
  onUnplaceLine,
}: {
  sectionId: string;
  barIndex: number;
  eighths: boolean;
  barSlots: number;
  cellIndex: Map<string, CellOccupant[]>;
  lyricDragActive: boolean;
  rejectedCell: string | null;
  markerIndex?: Map<string, LineMarkerPlacement[]>;
  songLyricLines?: SongLyricLine[];
  editing: SyllableEditingState | null;
  onEditingChange: (next: SyllableEditingState | null) => void;
  armedSyllableId: string | null;
  awaitingLine: { lineId: string; edge: 'start' | 'end' } | null;
  promptAnchorCellKey: string | null;
  onPromptAnchorNode?: (node: HTMLElement | null) => void;
  onSyllableTap?: (syllableId: string) => void;
  onBeatCellTap?: (
    barIndex: number,
    beatPos: number,
    /** Viewport rect of the tapped cell, for positioning a refusal
     *  message over it. */
    cellRect?: DOMRect,
    offbeat?: boolean,
  ) => void | Promise<void>;
  onOpenSyllableMenu?: (syllableId: string) => void;
  onSplit?: (syllableId: string, splitAt: number) => void | Promise<void>;
  onJoin?: (syllableId: string) => void | Promise<void>;
  onChange?: (syllableId: string, nextText: string) => void | Promise<void>;
  onUnplace?: (syllableId: string) => void | Promise<void>;
  onUnplaceLine?: (lineId: string) => void | Promise<void>;
}) {
  const found =
    editing && editing.barIndex === barIndex && songLyricLines
      ? findSyllable(songLyricLines, editing.syllableId)
      : null;
  return (
    <div className="relative flex gap-0.5 px-1">
      {Array.from({ length: barSlots }).map((_, slot) => {
        const { beatPos, offbeat } = slotToPosition(slot, eighths);
        const key = cellKey({ sectionId, barIndex, beatPos, offbeat });
        return (
          <SyllableDropSlot
            key={slot}
            barIndex={barIndex}
            beatPos={beatPos}
            offbeat={offbeat}
            occupants={cellIndex.get(key) ?? []}
            markers={markerIndex?.get(key) ?? []}
            dragActive={lyricDragActive}
            rejected={rejectedCell === key}
            armedSyllableId={armedSyllableId}
            awaitingLine={awaitingLine}
            isPromptAnchor={promptAnchorCellKey === key}
            onPromptAnchorNode={onPromptAnchorNode}
            // Any pending intent offers every cell — a syllable, or
            // either edge of a line. Legality is still never
            // pre-computed; checkPlacementOrder decides on tap.
            armingActive={armedSyllableId !== null || awaitingLine !== null}
            onSyllableTap={onSyllableTap}
            onBeatCellTap={onBeatCellTap}
            onOpenSyllableMenu={onOpenSyllableMenu}
          />
        );
      })}
      {editing && found && (
        <SyllableEditPopover
          key={editing.syllableId}
          state={editing}
          text={found.syllable.text}
          canJoinNext={
            songLyricLines
              ? canJoinNext(songLyricLines, editing.syllableId)
              : false
          }
          isPlaced={found.syllable.anchor !== undefined}
          onClose={() => onEditingChange(null)}
          onModeChange={mode => onEditingChange({ ...editing, mode })}
          onSplit={
            onSplit
              ? splitAt => {
                  void onSplit(editing.syllableId, splitAt);
                  onEditingChange(null);
                }
              : undefined
          }
          onJoin={
            onJoin
              ? () => {
                  void onJoin(editing.syllableId);
                  onEditingChange(null);
                }
              : undefined
          }
          onChange={
            onChange
              ? nextText => {
                  void onChange(editing.syllableId, nextText);
                  onEditingChange(null);
                }
              : undefined
          }
          onUnplace={
            onUnplace
              ? () => {
                  void onUnplace(editing.syllableId);
                  onEditingChange(null);
                }
              : undefined
          }
          onUnplaceLine={
            onUnplaceLine && found.line.syllables?.some(s => s.anchor)
              ? () => {
                  void onUnplaceLine(found.line.id);
                  onEditingChange(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

/** Syllable actions: rename, split, join-next, and un-place. Un-place
 *  is how a placed syllable returns to the ghost pool — and once every
 *  syllable of a line is un-placed, the line reappears in the tray
 *  where it can be deleted. That's the whole delete path until the
 *  drawer lands in step 7. */
function SyllableEditPopover({
  state,
  text,
  canJoinNext,
  isPlaced,
  onClose,
  onModeChange,
  onSplit,
  onJoin,
  onChange,
  onUnplace,
  onUnplaceLine,
}: {
  state: SyllableEditingState;
  text: string;
  canJoinNext: boolean;
  isPlaced: boolean;
  onClose: () => void;
  onModeChange: (mode: 'actions' | 'split' | 'edit') => void;
  onSplit?: (splitAt: number) => void;
  onJoin?: () => void;
  onChange?: (nextText: string) => void;
  onUnplace?: () => void;
  onUnplaceLine?: () => void;
}) {
  const [draft, setDraft] = useState(text);
  useEffect(() => {
    if (state.mode === 'edit') setDraft(text);
  }, [state.mode, text]);
  const trimmedDraft = draft.trim();

  return (
    <div
      // Clicks inside the menu must not disarm — it belongs to the
      // armed syllable.
      data-lyric-arm-keep=""
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-30 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-md p-2 text-[11px]"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-neutral-500">syllable:</span>
        <span className="font-mono text-neutral-700 dark:text-neutral-200">{text}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="close syllable editor"
          className="ml-auto text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          ×
        </button>
      </div>

      {state.mode === 'actions' && (
        <div className="flex flex-wrap gap-1">
          {onChange && (
            <button
              type="button"
              onClick={() => onModeChange('edit')}
              className="px-2 py-0.5 rounded-full border border-fluent/40 text-fluent hover:bg-fluent/10"
            >
              Edit
            </button>
          )}
          {onSplit && text.length > 1 && (
            <button
              type="button"
              onClick={() => onModeChange('split')}
              className="px-2 py-0.5 rounded-full border border-fluent/40 text-fluent hover:bg-fluent/10"
            >
              Split
            </button>
          )}
          {onJoin && (
            <button
              type="button"
              onClick={onJoin}
              disabled={!canJoinNext}
              className="px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Rejoin
            </button>
          )}
          {/* The two un-place actions differ by SCOPE, and the labels
              have to carry that on their own — a bare "Un-place" next
              to "Un-place line" read as one action and a variant of it,
              which is how the whole-line reset went unnoticed even
              though it was sitting right there.
              "Un-place this" rather than "Un-place syllable" because
              the menu acts on whatever CHUNK the tap hit, and the chunk
              isn't reliably a syllable: an unsplit "adore" is one chunk
              holding two syllables, while a split "a" / "dore" is two
              chunks. "Word" is wrong in the other direction. Naming the
              unit at all is the mistake; "this" sidesteps it. */}
          {onUnplace && isPlaced && (
            <button
              type="button"
              onClick={onUnplace}
              className="px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent"
              title="return just this one to the unplaced pool"
            >
              Un-place this
            </button>
          )}
          {onUnplaceLine && (
            <button
              type="button"
              onClick={onUnplaceLine}
              className="px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:border-fluent hover:text-fluent"
              title="return every syllable of this line to the tray, keeping its text"
            >
              Un-place full line
            </button>
          )}
        </div>
      )}

      {state.mode === 'split' && onSplit && (
        <div className="space-y-1">
          <div className="text-neutral-500">tap between two letters:</div>
          <div className="inline-flex items-center bg-neutral-50 dark:bg-neutral-800/60 rounded px-1 py-0.5">
            {text.split('').map((ch, i) => (
              <span key={`c-${i}`} className="contents">
                <span className="font-mono text-neutral-700 dark:text-neutral-200 px-0.5">
                  {ch}
                </span>
                {i < text.length - 1 && (
                  <button
                    type="button"
                    onClick={() => onSplit(i + 1)}
                    aria-label={`split after character ${i + 1}`}
                    className="inline-block min-w-[12px] min-h-[32px] mx-0.5 rounded-sm border border-dashed border-neutral-300 dark:border-neutral-700 hover:bg-fluent/10 hover:border-fluent"
                  />
                )}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onModeChange('actions')}
            className="text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            ← back
          </button>
        </div>
      )}

      {state.mode === 'edit' && onChange && (
        <form
          className="space-y-1"
          onSubmit={e => {
            e.preventDefault();
            if (trimmedDraft === '') return;
            onChange(trimmedDraft);
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onModeChange('actions');
              }
            }}
            aria-label="syllable text"
            className="w-full px-2 py-1 text-[12px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 font-mono"
          />
          <div className="flex items-center gap-1">
            <button
              type="submit"
              disabled={trimmedDraft === ''}
              className="px-2 py-0.5 rounded-full border border-fluent/40 text-fluent hover:bg-fluent/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => onModeChange('actions')}
              className="text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function SyllableDropSlot({
  barIndex,
  beatPos,
  offbeat,
  occupants,
  markers,
  dragActive,
  rejected,
  armedSyllableId,
  awaitingLine,
  isPromptAnchor,
  onPromptAnchorNode,
  armingActive,
  onSyllableTap,
  onBeatCellTap,
  onOpenSyllableMenu,
}: {
  barIndex: number;
  beatPos: number;
  offbeat?: boolean;
  occupants: CellOccupant[];
  markers: LineMarkerPlacement[];
  dragActive: boolean;
  rejected: boolean;
  armedSyllableId: string | null;
  awaitingLine: { lineId: string; edge: 'start' | 'end' } | null;
  isPromptAnchor: boolean;
  onPromptAnchorNode?: (node: HTMLElement | null) => void;
  armingActive: boolean;
  onSyllableTap?: (syllableId: string) => void;
  onBeatCellTap?: (
    barIndex: number,
    beatPos: number,
    /** Viewport rect of the tapped cell, for positioning a refusal
     *  message over it. */
    cellRect?: DOMRect,
    offbeat?: boolean,
  ) => void | Promise<void>;
  onOpenSyllableMenu?: (syllableId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: DRAG_ID.beat(barIndex, beatPos, offbeat),
  });
  // The old treatment was a 1px border-colour change plus a 10%-alpha
  // tint on an already-bordered 28px cell — technically present, not
  // actually visible. Dimming the non-targets is what makes the target
  // pop without needing a loud fill.
  // While a syllable is armed EVERY cell offers itself. Legality is not
  // computed here — checkPlacementOrder decides on tap, and pre-filtering
  // would duplicate that rule in a second place.
  //
  // GREY, not fluent. Green is the 1maj chord family, so a green hint
  // field made the cells look like they carried harmonic meaning —
  // worst directly under a green 1maj chord. Hint is transient
  // interaction state and must not speak the chord palette's language;
  // grey is the only hue with no musical meaning. Kept as a translucent
  // tint rather than a solid `bg-neutral-N` so it cannot be confused
  // with the disabled (`neutral-300`) or stale-tier (`neutral-400`)
  // greys, and so a chip sitting in the cell keeps its own edge.
  // PLACEMENT TARGET — the tap hint and the drag target, identical.
  //
  // Both answer the same question, "this is where it will land", so
  // they look the same. They never co-occur — during a drag the
  // non-target cells are dimmed rather than hinted — so the old
  // intensity split between them was separating two greys from each
  // other, work a dedicated hue no longer needs done.
  //
  // INDIGO, and the exhausted-chord-palette rule genuinely does not
  // apply here. Three reasons, each sufficient: this is TRANSIENT, and
  // nothing that exists for three seconds competes with a permanent
  // taxonomy; it is on the LYRIC row, a different band from the chord
  // cells; and it appears on EVERY cell at once, so a colour meaning
  // "any of these" cannot be read as a per-cell family colour, which is
  // by definition distinguishing. Section headers are the opposite case
  // and stay stone — a header does sit in the chord cells' layer.
  // Indigo is licensed for transient placement feedback on the grid and
  // nothing else. See the plan doc's colour-scope note.
  //
  // WHY NOT MORE GREY: the previous hint was a 10%-alpha grey wash — a
  // ~4% luminance shift on a 28px cell, measured at 1.05:1 against a
  // resting cell. That is below the threshold where a change reads as
  // intentional at all, which is why it was scanned straight past.
  //
  // BALANCE: the WASH is what made it shout, because it is a large
  // filled area; the RING is what makes it read as a target. So the
  // ring carries more of the load (/50 → /70) and the wash carries
  // less, which softens the highlighter quality without softening the
  // signal.
  //
  // Every value here is measured, not judged by eye, and the two modes
  // are measured SEPARATELY — an alpha that works over white is close
  // to invisible over neutral-900, which is why dark takes both a
  // lighter hue step and a higher alpha. Against a resting cell:
  //
  //   light  indigo-500/20 → 1.29:1   (was 1.38, floor 1.16)
  //   dark   indigo-400/25 → 1.49:1   (was 1.64, floor 1.35)
  //
  // The floors are not guesses: 1.16 and 1.35 are values already tried
  // and judged too weak to read. Softening stops well above them
  // rather than creeping back toward the 1.05 that failed.
  const placementTarget =
    'border-solid border-indigo-500 dark:border-indigo-400 ' +
    'bg-indigo-500/20 dark:bg-indigo-400/25 ' +
    'ring-2 ring-inset ring-indigo-500/70 dark:ring-indigo-400/70';

  const surface = rejected
    ? 'border-solid border-needswork bg-needswork/20 ring-2 ring-needswork'
    : armingActive && !dragActive
      ? `${placementTarget} cursor-pointer hover:bg-indigo-500/30 dark:hover:bg-indigo-400/35`
    : isOver
    ? placementTarget
    : dragActive
      ? 'border-dashed border-neutral-200 dark:border-neutral-800 opacity-50'
      : 'border-dashed border-neutral-200 dark:border-neutral-800';

  // Hand this cell's NODE up while it is the line-end prompt's anchor,
  // so the prompt can track it across scroll. Reported by the cell that
  // IS the anchor rather than looked up from above, because beat ids
  // (`beat:<bar>:<beat>`) repeat in every section — resolving one by id
  // would find a same-named cell a viewport away. Same node-identity
  // rule the drop targeting had to learn (88b807d).
  const anchorReport = useRef(onPromptAnchorNode);
  anchorReport.current = onPromptAnchorNode;
  const cellNode = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isPromptAnchor) return;
    anchorReport.current?.(cellNode.current);
    return () => anchorReport.current?.(null);
  }, [isPromptAnchor]);

  // STABLE ref callback. An inline arrow here would be a new function
  // every render, and React detaches the old ref (calling it with null)
  // before attaching the new one — so dnd-kit's `setNodeRef` would
  // unregister and re-register this droppable on EVERY render. That is
  // churn in the drop-target registry, which is the last place this
  // codebase needs surprises. `useCallback` keeps the identity stable,
  // restoring the single-attach behaviour the plain `ref={setNodeRef}`
  // had before the anchor tracking was added.
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      cellNode.current = node;
    },
    [setNodeRef],
  );

  return (
    <div
      ref={setRefs}
      data-lyric-arm-keep=""
      role={armingActive && onBeatCellTap ? 'button' : undefined}
      onClick={
        armingActive && onBeatCellTap
          ? e => {
              e.stopPropagation();
              // Measure the tapped node itself and hand the rect up, so
              // a refusal message can be placed over THIS cell. Measured
              // from `currentTarget` — node identity — rather than
              // looked up by a beat id, which is not unique across
              // sections and would resolve the wrong cell entirely.
              void onBeatCellTap(
                barIndex,
                beatPos,
                e.currentTarget.getBoundingClientRect(),
                offbeat,
              );
            }
          : undefined
      }
      aria-label={
        armingActive
          ? `place syllable at bar ${barIndex + 1} beat ${beatPos + 1}`
          : undefined
      }
      className={`relative flex-1 min-h-[28px] flex flex-col items-center justify-start gap-0.5 px-0.5 rounded border transition-opacity ${surface} ${rejected ? 'lyric-reject' : ''}`}
    >
      {markers.filter(m => m.edge === 'start').map(m => (
        <SongLineMarker key={`s-${m.lineId}`} marker={m} awaited={false} />
      ))}
      {occupants.map(occupant => (
        <SyllableChip
          key={occupant.syllable.id}
          syllableId={occupant.syllable.id}
          text={occupant.syllable.text}
          placed={occupant.placed}
          armed={armedSyllableId === occupant.syllable.id}
          onTap={onSyllableTap}
          onOpenMenu={onOpenSyllableMenu}
        />
      ))}
      {markers.filter(m => m.edge === 'end').map(m => (
        <SongLineMarker
          key={`e-${m.lineId}`}
          marker={m}
          // Only the END edge has a marker to highlight: at 'start'
          // the line has nothing placed, so no markers render at all.
          awaited={
            awaitingLine?.edge === 'end' && m.lineId === awaitingLine.lineId
          }
        />
      ))}
      {/* Insertion caret: a drop APPENDS to the stack, so the bar sits
          under everything already in the cell.
          Absolutely positioned ON PURPOSE. As a flow child it added its
          own height plus a gap to the hovered cell — and because cells
          stretch to the tallest in their row, the whole row grew the
          instant a target lit up. With MeasuringStrategy.Always that
          re-measures immediately, so hovering could shift the very
          geometry the hover was computed from. Taking it out of flow
          means highlighting can never move anything. */}
      {isOver && (
        <span
          className="pointer-events-none absolute inset-x-0.5 bottom-0.5 h-0.5 rounded-full bg-neutral-600 dark:bg-neutral-300"
          aria-hidden
        />
      )}
    </div>
  );
}

/**
 * A line's start/end handle (§A1).
 *
 * Dragging it places exactly one unit — the line's first for ▸, its
 * last for ◂ — and touches nothing else. It is NOT a range handle: the
 * old markers moved a line's start/end anchors and re-spread every word
 * between them, which is what made a single marker drag discard a whole
 * line's hand-placed positions.
 *
 * The handle is dimmed when the unit it governs is still unplaced,
 * which is its most useful state: right after a tray drop only the head
 * has landed, and dragging ◂ is how you say where the line ends.
 */
function SongLineMarker({
  marker,
  awaited,
}: {
  marker: LineMarkerPlacement;
  /** This is the end the app is currently asking for (beat two). */
  awaited: boolean;
}) {
  const dragId =
    marker.edge === 'start'
      ? DRAG_ID.lineStart(marker.lineId)
      : DRAG_ID.lineEnd(marker.lineId);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
  });
  const style: CSSProperties = { opacity: isDragging ? 0.3 : 1 };
  // The awaited end takes the armed chip's inverted fill, so the
  // waiting bar's question and the control it is asking about read as
  // the same thing. Without it the bar asks for an end while the marker
  // sits dimmed and dashed — which is precisely the disconnect that
  // made this control undiscoverable in the first place.
  const appearance = awaited
    ? 'bg-neutral-600 text-white dark:bg-neutral-300 dark:text-neutral-900 ring-2 ring-neutral-700 dark:ring-neutral-100 border-transparent'
    : marker.onItsUnit
      ? 'text-fluent border-fluent/40 bg-fluent/5'
      : 'text-fluent/60 border-dashed border-fluent/30 bg-transparent';
  return (
    <span
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      title={
        marker.edge === 'start'
          ? 'drag to place this line’s first word'
          : 'drag to place this line’s last word'
      }
      className={`cursor-grab active:cursor-grabbing select-none touch-none text-[10px] leading-none px-0.5 rounded border ${appearance}`}
    >
      {marker.edge === 'start' ? '▸' : '◂'}
    </span>
  );
}

/**
 * One syllable in the grid.
 *
 * PLACED chips keep the pre-migration look exactly — migration imports
 * every existing position as placed, so this is what makes "did
 * anything move?" a clean read after the store swap.
 *
 * GHOST chips (unplaced, provisionally spread between two placed
 * neighbours) are faded and italic: visibly provisional, still legible,
 * and never mistaken for something the user positioned.
 */
function SyllableChip({
  syllableId,
  text,
  placed,
  armed,
  onTap,
  onOpenMenu,
}: {
  syllableId: string;
  text: string;
  placed: boolean;
  armed: boolean;
  onTap?: (syllableId: string) => void;
  onOpenMenu?: (syllableId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: DRAG_ID.syllable(syllableId),
  });
  // No transform: a DragOverlay carries the moving copy, so the source
  // stays in place and its cell doesn't reflow mid-drag.
  const style: CSSProperties = { opacity: isDragging ? 0.3 : 1 };

  // ONE branch, not additive classes. `text-neutral-400` and
  // `text-neutral-900` have identical specificity, so which wins depends
  // on Tailwind's output order rather than on the order they appear in
  // this string — appending an armed override on top of the ghost styles
  // would be relying on that. Picking a single appearance avoids the
  // question entirely, and matters here because a GHOST can be armed.
  //
  // Inverted fill for armed: dark chip / light text in light mode, and
  // the reverse in dark. Reuses the "active" idiom CarryoverBanner
  // already uses (`bg-neutral-600 text-white`) and stays clear of the
  // greys that carry meaning — neutral-300 is disabled, neutral-400 is
  // the stale tier, neutral-200 is this chip's own hover.
  //
  // DELIBERATELY STILL NEUTRAL now that the hint field is indigo, and
  // it does more work than it used to. "The thing being placed" and
  // "places it could go" are different statements, and giving them
  // different hues is what keeps them readable as different. Measured
  // against the new field it holds up easily: 6.7:1 in light, 9.0:1 in
  // dark.
  const appearance = armed
    ? 'bg-neutral-600 text-white dark:bg-neutral-300 dark:text-neutral-900 ring-2 ring-neutral-700 dark:ring-neutral-100 opacity-100'
    : placed
      ? 'text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800'
      : 'text-neutral-400 dark:text-neutral-500 bg-neutral-50 dark:bg-neutral-900/40 opacity-70';

  // Long-press is a SHORTCUT to the same menu the "…" control opens —
  // one implementation, two entry points.
  //
  // Guarded on `isDragging` rather than by tightening the hook's move
  // tolerance: dnd-kit activates a drag at 5px, the hook cancels a
  // long-press at 15px, so a 5-15px movement held past the threshold
  // would otherwise fire BOTH. Dropping the tolerance to 4px would fix
  // that arithmetically but fights real finger drift, which the hook's
  // own comment measures at 3-5px.
  const draggingRef = useRef(isDragging);
  draggingRef.current = isDragging;
  const longPress = useLongPress(
    () => {
      if (draggingRef.current) return;
      onOpenMenu?.(syllableId);
    },
    { enabled: Boolean(onOpenMenu) },
  );

  // Compose rather than spread. `{...listeners}` followed by
  // `{...longPress}` would silently OVERWRITE dnd-kit's onPointerDown
  // with the hook's, killing drag activation entirely — both attach to
  // the same event. Calling dnd-kit first preserves the 5px activation
  // path; the hook's own handler only starts a timer, so ordering is
  // otherwise immaterial.
  const dragPointerDown = (listeners as Record<string, unknown> | undefined)
    ?.onPointerDown as ((e: React.PointerEvent<HTMLElement>) => void) | undefined;
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    dragPointerDown?.(e);
    longPress.onPointerDown(e);
  };

  return (
    <span
      ref={setNodeRef}
      style={style}
      data-lyric-arm-keep=""
      {...attributes}
      {...listeners}
      onPointerDown={onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
      onPointerLeave={longPress.onPointerLeave}
      onClick={
        onTap
          ? e => {
              // The PointerSensor's 5px activation distance means a bare
              // tap lands here without starting a drag. After a
              // long-press the hook swallows this click at the document
              // level, so holding opens the menu WITHOUT also arming.
              e.stopPropagation();
              onTap(syllableId);
            }
          : undefined
      }
      className={`relative select-none touch-none text-[10px] leading-tight italic px-1 rounded truncate max-w-[7rem] ${appearance} ${
        onTap && !armed
          ? 'cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700'
          : onTap
            ? 'cursor-pointer'
            : 'cursor-grab active:cursor-grabbing'
      }`}
      title={placed ? text : `${text} — not placed yet`}
    >
      {text}
      {/* The "…" appears ONLY on the armed syllable, so an unarmed grid
          stays clean. stopPropagation on pointerdown keeps a press here
          from starting a drag of the chip underneath. */}
      {armed && onOpenMenu && (
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            onOpenMenu(syllableId);
          }}
          aria-label={`open actions for "${text}"`}
          // Inherits the chip's text colour, so it is white on the dark
          // armed fill and near-black on the inverted dark-mode fill.
          // The hover wash flips with it for the same reason.
          className="ml-0.5 px-0.5 rounded leading-none hover:bg-white/25 dark:hover:bg-black/15"
        >
          …
        </button>
      )}
    </span>
  );
}

function BeatDropSlot({
  barIndex,
  beatPos,
  items,
  onLineDelete,
  onWordClick,
}: {
  barIndex: number;
  beatPos: number;
  items: Array<
    | { kind: 'word'; line: LyricLine; wordIndex: number; text: string }
    | { kind: 'startMarker'; line: LyricLine }
    | { kind: 'endMarker'; line: LyricLine }
  >;
  onLineDelete?: (lineId: string) => void;
  onWordClick?: (lineId: string, wordIndex: number) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: DRAG_ID.beat(barIndex, beatPos),
  });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-h-[28px] flex flex-col items-center justify-start gap-0.5 px-0.5 rounded border ${
        isOver
          ? 'border-fluent bg-fluent/10'
          : 'border-dashed border-neutral-200 dark:border-neutral-800'
      }`}
    >
      {items.map((item, idx) => {
        if (item.kind === 'startMarker') {
          return (
            <LineMarker
              key={`s-${item.line.id}-${idx}`}
              lineId={item.line.id}
              edge="start"
              onDelete={onLineDelete}
            />
          );
        }
        if (item.kind === 'endMarker') {
          return (
            <LineMarker
              key={`e-${item.line.id}-${idx}`}
              lineId={item.line.id}
              edge="end"
            />
          );
        }
        return (
          <WordChip
            key={`w-${item.line.id}-${item.wordIndex}`}
            lineId={item.line.id}
            wordIndex={item.wordIndex}
            text={item.text}
            onClick={onWordClick}
          />
        );
      })}
    </div>
  );
}

function LineMarker({
  lineId,
  edge,
  onDelete,
}: {
  lineId: string;
  edge: 'start' | 'end';
  onDelete?: (lineId: string) => void;
}) {
  const dragId = edge === 'start' ? DRAG_ID.lineStart(lineId) : DRAG_ID.lineEnd(lineId);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };
  const glyph = edge === 'start' ? '▸' : '◂';
  return (
    <div className="inline-flex items-center gap-0.5">
      <span
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        title={`${edge} marker — drag to a beat`}
        className="cursor-grab active:cursor-grabbing select-none touch-none text-[10px] leading-none text-fluent px-0.5 rounded border border-fluent/40 bg-fluent/5"
      >
        {glyph}
      </span>
      {edge === 'start' && onDelete && (
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            onDelete(lineId);
          }}
          aria-label="delete lyric line"
          className="text-[10px] leading-none text-neutral-400 hover:text-needswork"
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Word edit popover (step 7 — syllable split / join). Anchored
 *  inside the LyricBarSegment for the bar holding the tapped word.
 *  Two modes: an action picker (Split / Join prev / Join next) and a
 *  split editor (the word's characters with tappable inter-character
 *  gaps that fire `onSplit(splitAt)` on tap). */
function WordEditPopover({
  state,
  wordText,
  wordCount,
  onClose,
  onModeChange,
  onSplit,
  onJoin,
  onChange,
}: {
  state: WordEditingState;
  wordText: string;
  wordCount: number;
  onClose: () => void;
  onModeChange: (mode: 'actions' | 'split' | 'edit') => void;
  onSplit?: (splitAt: number) => void;
  onJoin?: (leftIndex: number) => void;
  onChange?: (nextText: string) => void;
}) {
  const canJoinPrev = state.wordIndex > 0;
  const canJoinNext = state.wordIndex < wordCount - 1;

  // Inline edit (free-text rename) — `draft` mirrors `wordText` and is
  // reset whenever the popover (re-)enters edit mode or the target word
  // changes, so the input always starts from the current saved value
  // (cancelling and re-opening Edit doesn't show a stale draft).
  const [draft, setDraft] = useState(wordText);
  useEffect(() => {
    if (state.mode === 'edit') setDraft(wordText);
  }, [state.mode, wordText]);
  const trimmedDraft = draft.trim();

  return (
    <div
      // Absolutely positioned below the segment row. left-1/2 +
      // -translate-x-1/2 centers it under the bar; z-index keeps it
      // above any neighbouring rows.
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-30 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-md p-2 text-[11px]"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-neutral-500">word:</span>
        <span className="font-mono text-neutral-700 dark:text-neutral-200">{wordText}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="close word editor"
          className="ml-auto text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          ×
        </button>
      </div>

      {state.mode === 'actions' && (
        <div className="flex flex-wrap gap-1">
          {onChange && (
            <button
              type="button"
              onClick={() => onModeChange('edit')}
              className="px-2 py-0.5 rounded-full border border-fluent/40 text-fluent hover:bg-fluent/10"
            >
              Edit
            </button>
          )}
          {onSplit && wordText.length > 1 && (
            <button
              type="button"
              onClick={() => onModeChange('split')}
              className="px-2 py-0.5 rounded-full border border-fluent/40 text-fluent hover:bg-fluent/10"
            >
              Split
            </button>
          )}
          {onJoin && (
            <button
              type="button"
              onClick={() => onJoin(state.wordIndex - 1)}
              disabled={!canJoinPrev}
              className="px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Join prev
            </button>
          )}
          {onJoin && (
            <button
              type="button"
              onClick={() => onJoin(state.wordIndex)}
              disabled={!canJoinNext}
              className="px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {/* Stays "Join next" here: the LEGACY popover has no
                  word-boundary guard, so this really can merge across
                  words. Only the guarded song-owned popover earns
                  "Rejoin". */}
              Join next
            </button>
          )}
        </div>
      )}

      {state.mode === 'split' && (
        <div className="space-y-1">
          <div className="text-neutral-500">tap between two letters:</div>
          <div className="inline-flex items-center bg-neutral-50 dark:bg-neutral-800/60 rounded px-1 py-0.5">
            {wordText.split('').map((ch, i) => (
              <span key={`c-${i}`} className="contents">
                <span className="font-mono text-neutral-700 dark:text-neutral-200 px-0.5">
                  {ch}
                </span>
                {i < wordText.length - 1 && (
                  <button
                    type="button"
                    onClick={() => onSplit?.(i + 1)}
                    aria-label={`split after character ${i + 1}`}
                    className="inline-block min-w-[12px] min-h-[32px] mx-0.5 rounded-sm border border-dashed border-neutral-300 dark:border-neutral-700 hover:bg-fluent/10 hover:border-fluent"
                  />
                )}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onModeChange('actions')}
            className="text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            ← back
          </button>
        </div>
      )}

      {state.mode === 'edit' && onChange && (
        <form
          className="space-y-1"
          onSubmit={e => {
            e.preventDefault();
            if (trimmedDraft === '') return;
            onChange(trimmedDraft);
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onModeChange('actions');
              }
            }}
            aria-label="syllable text"
            className="w-full px-2 py-1 text-[12px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 font-mono"
          />
          <div className="flex items-center gap-1">
            <button
              type="submit"
              disabled={trimmedDraft === ''}
              className="px-2 py-0.5 rounded-full border border-fluent/40 text-fluent hover:bg-fluent/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => onModeChange('actions')}
              className="text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function WordChip({
  lineId,
  wordIndex,
  text,
  onClick,
}: {
  lineId: string;
  wordIndex: number;
  text: string;
  onClick?: (lineId: string, wordIndex: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: DRAG_ID.word(lineId, wordIndex),
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <span
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={
        onClick
          ? e => {
              // Drag's PointerSensor uses 5px activation distance, so a
              // bare click (no movement) lands here without starting a
              // drag. Stop propagation so the bar grid's container
              // mousedown handler doesn't immediately close the popover.
              e.stopPropagation();
              onClick(lineId, wordIndex);
            }
          : undefined
      }
      className={`select-none touch-none text-[10px] leading-tight italic text-neutral-700 dark:text-neutral-200 px-1 rounded bg-neutral-100 dark:bg-neutral-800 truncate max-w-[7rem] ${
        onClick
          ? 'cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700'
          : 'cursor-grab active:cursor-grabbing'
      }`}
      title={text}
    >
      {text}
    </span>
  );
}

/** One unoccupied beat position inside a bar. Registers as a
 *  droppable (`emptybeat:bar:pos`) so chord drags can land here.
 *  Visual is the same dashed placeholder that used to render as one
 *  big trailing block — now split into per-beat slots. */
/** Inline popover for tap-to-add chord on an empty beat slot.
 *  Anchored under the BarBox that owns the slot. Parses Nashville
 *  notation (or Roman / concrete chord names) via `parseChordFunction`
 *  and previews the result as the user types. On submit fires
 *  `onSubmit(parsedChord)`; on cancel fires `onCancel`. */
function ChordAddPopover({
  barIndex,
  beatPos,
  sectionKey,
  notationMode,
  copiedChord,
  onSubmit,
  onCancel,
}: {
  barIndex: number;
  beatPos: number;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  copiedChord?: ChordFunction | null;
  onSubmit: (chord: ChordFunction) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const parsed = trimmed === '' ? null : parseChordFunction(trimmed, sectionKey);
  const isReady =
    parsed !== null &&
    (parsed.function !== '' || parsed.quality !== '' || Boolean(parsed.bass));
  const previewText = parsed
    ? chordToDisplay(parsed, notationMode, sectionKey)
    : '';
  const submit = () => {
    if (!parsed || !isReady) return;
    onSubmit(parsed);
  };
  const copiedText = copiedChord
    ? chordToDisplay(copiedChord, notationMode, sectionKey)
    : '';
  return (
    <div
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-30 min-w-[14rem] rounded-md border border-fluent/40 bg-white dark:bg-neutral-900 shadow-md p-2 space-y-1.5 text-[11px]"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between text-neutral-500">
        <span>
          add chord · bar {barIndex + 1} beat {beatPos + 1}
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="cancel"
          className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          ×
        </button>
      </div>
      {copiedChord && (
        <button
          type="button"
          onClick={() => onSubmit(copiedChord)}
          className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded-full border border-fluent bg-fluent/10 text-fluent hover:bg-fluent/20"
        >
          <span aria-hidden>📋</span> Paste{' '}
          {copiedText ? <ChordGlyph text={copiedText} /> : 'chord'}
        </button>
      )}
      <input
        type="text"
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="e.g. 4maj7, 1dom9(13), 5m7"
        className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 font-mono"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-neutral-500">
          preview:{' '}
          {previewText ? (
            <span className="font-semibold text-neutral-700 dark:text-neutral-200">
              <ChordGlyph text={previewText} />
            </span>
          ) : (
            <span className="italic">—</span>
          )}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={!isReady}
          className="px-2 py-0.5 rounded-full border border-fluent bg-fluent/10 text-fluent hover:bg-fluent/20 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function EmptyBeatSlot({
  barIndex,
  beatPos,
  offbeat,
  widthPct,
  onClick,
  isAdding,
}: {
  barIndex: number;
  beatPos: number;
  offbeat?: boolean;
  widthPct: number;
  onClick?: () => void;
  isAdding?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: DRAG_ID.emptyBeat(barIndex, beatPos, offbeat),
  });
  return (
    <div
      ref={setNodeRef}
      style={{ width: `${widthPct}%` }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={
        onClick
          ? e => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      title={onClick ? 'Tap to add chord here' : undefined}
      className={`rounded border border-dashed shrink transition-colors ${
        isOver
          ? 'border-fluent bg-fluent/10'
          : isAdding
            ? 'border-fluent bg-fluent/5'
            : 'border-neutral-200 dark:border-neutral-800'
      } ${onClick ? 'cursor-pointer hover:border-fluent/50 hover:bg-fluent/5' : ''}`}
      aria-label={`empty beat slot bar ${barIndex + 1} beat ${beatPos + 1}`}
    />
  );
}

function SortableChordCell({
  cell,
  widthPct,
  sectionKey,
  notationMode,
  isEditing,
  foundationMode,
  onClick,
}: {
  cell: BarCell;
  widthPct: number;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  isEditing: boolean;
  foundationMode: boolean;
  onClick?: (cell: BarCell) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: DRAG_ID.chord(cell.placementId) });
  const dragStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    width: `${widthPct}%`,
  };
  return (
    <ChordCellBox
      cell={cell}
      widthPct={widthPct}
      sectionKey={sectionKey}
      notationMode={notationMode}
      isEditing={isEditing}
      foundationMode={foundationMode}
      onClick={onClick}
      dragRef={setNodeRef}
      dragAttributes={attributes}
      dragListeners={listeners}
      dragStyle={dragStyle}
    />
  );
}

function ChordCellBox({
  cell,
  widthPct,
  sectionKey,
  notationMode,
  isEditing,
  foundationMode = false,
  onClick,
  dragRef,
  dragAttributes,
  dragListeners,
  dragStyle,
  extraClassName,
}: {
  cell: BarCell;
  widthPct: number;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  isEditing: boolean;
  foundationMode?: boolean;
  onClick?: (cell: BarCell) => void;
  dragRef?: (node: HTMLElement | null) => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  dragStyle?: CSSProperties;
  extraClassName?: string;
}) {
  const text = chordToDisplay(cell.chord, notationMode, sectionKey);
  const hasVoicing = Boolean(cell.voicing && cell.voicing.length > 0);
  const isDark = useIsDarkMode();
  const palette = chordPalette(cell.chord, isDark);
  const roundedLeft = !cell.tiedFromPrev;
  const roundedRight = !cell.tiedToNext;
  const radiusClass = [
    roundedLeft ? 'rounded-l-sm' : '',
    roundedRight ? 'rounded-r-sm' : '',
  ].join(' ');
  const tagValue = effectiveHarmonicTag(cell.chord);
  const tagged = tagValue !== undefined;
  const borderStyleClass = tagged ? 'border-dashed' : 'border-solid';
  // Foundation view: ghost out non-structural (tagged) chords so the
  // harmonic skeleton reads through. Box size + beat dots are kept so
  // bars and beat positions never shift — only the fill/text fade.
  const ghosted =
    foundationMode && tagValue !== undefined && GHOST_TAGS.has(tagValue);
  // Ghosted cells keep their Tailwind treatment; coloured cells drive
  // border/fill/text through inline styles off the hex palette.
  const surfaceClass = ghosted
    ? 'border-neutral-300 dark:border-neutral-700 bg-transparent opacity-40'
    : '';
  const surfaceStyle: CSSProperties = ghosted
    ? {}
    : { borderColor: palette.border, backgroundColor: palette.bg };
  const textClass = ghosted ? 'text-neutral-400' : '';
  const textStyle: CSSProperties = ghosted ? {} : { color: palette.text };
  // Slash chords: the cell fill follows the BASS degree (see
  // `chordPalette`), so the numerator needs its own treatment or it
  // reads as an afterthought. Coloring just its text wasn't enough —
  // for hue-neighbour families ("5maj/7": amber root on a red cell) two
  // dark 700-level colors on one pale fill don't separate. So the root
  // gets a compact pill in its OWN family's fill + text, turning the
  // comparison into fill-vs-fill. The bass half stays on the cell fill.
  //
  // Whichever mode is active, the pill takes that mode's fill so it
  // matches what that family's cells actually look like. NB: if a dark
  // theme ever ships, re-check this — both fills go translucent-dark
  // there and the pill would need its own light treatment to stay
  // legible. Ghosted (Foundation view) cells stay faded; root-position
  // chords ignore this entirely.
  const rootPalette = ghosted
    ? null
    : chordPalette({ ...cell.chord, bass: undefined }, isDark);
  const numeratorPill = rootPalette
    ? {
        bg: rootPalette.bg,
        text: rootPalette.text,
        border: rootPalette.border,
      }
    : undefined;

  const interactive = Boolean(onClick);
  const handleClick = (e: React.MouseEvent) => {
    if (!onClick) return;
    e.stopPropagation();
    onClick(cell);
  };

  const baseStyle: CSSProperties = dragStyle ?? { width: `${widthPct}%` };

  return (
    <div
      ref={dragRef as React.Ref<HTMLDivElement>}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? handleClick : undefined}
      {...(dragAttributes ?? {})}
      {...(dragListeners ?? {})}
      className={`relative flex flex-col items-center justify-between py-0.5 px-0.5 border-2 ${borderStyleClass} ${surfaceClass} ${radiusClass} overflow-hidden touch-none shrink ${
        interactive ? 'cursor-pointer hover:brightness-105' : ''
      } ${isEditing ? 'ring-2 ring-fluent ring-offset-1 ring-offset-white dark:ring-offset-neutral-900' : ''} ${extraClassName ?? ''}`}
      style={{ ...baseStyle, ...surfaceStyle }}
      title={cell.chord.raw ?? text}
    >
      {hasVoicing && !ghosted && (
        <span
          aria-label="voicing set"
          title="Voicing set"
          className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-fluent"
        />
      )}
      <div
        className={`text-[11px] leading-tight font-semibold ${textClass} truncate w-full text-center`}
        style={textStyle}
      >
        {text ? (
          <ChordGlyph text={text} numeratorPill={numeratorPill} />
        ) : (
          <span className="opacity-40">—</span>
        )}
      </div>
      <div
        className="flex items-center justify-center gap-0.5 text-[8px]"
        style={{ color: palette.dot }}
      >
        {Array.from({ length: cell.beats }).map((_, i) => (
          <span key={i} aria-hidden>·</span>
        ))}
      </div>
    </div>
  );
}

const TAG_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'secondary_dominant', label: 'Secondary dom' },
  { value: 'borrowed', label: 'Borrowed' },
  { value: 'passing', label: 'Passing' },
  { value: 'pedal', label: 'Pedal' },
];

// Harmonic tags that Foundation view ghosts out as non-structural.
// 'pedal' is intentionally excluded — a pedal point is structural.
const GHOST_TAGS = new Set([
  'secondary_dominant',
  'secondary_ii',
  'borrowed',
  'passing',
]);

function labelForTag(tag: string): string {
  const preset = TAG_PRESETS.find(p => p.value === tag);
  return preset?.label ?? tag;
}

function ChordEditorPopover({
  cell,
  barSlots,
  eighths,
  durationUnit,
  sectionKey,
  notationMode,
  onBeatsChange,
  onTagChange,
  onDelete,
  onVoicingChange,
  onVoicingPinsChange,
  onCopyChord,
}: {
  cell: BarCell;
  /** Duration ceiling, in the positions a bar offers — `beatsPerBar`
   *  doubled when the song is on eighths. Clamping to beats here
   *  would cap a migrated chord at half a bar. */
  barSlots: number;
  eighths: boolean;
  durationUnit: string;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  onBeatsChange?: (cell: BarCell, beats: number) => void | Promise<void>;
  onTagChange?: (cell: BarCell, tag: string | null) => void | Promise<void>;
  onDelete?: (cell: BarCell) => void | Promise<void>;
  onVoicingChange?: (cell: BarCell, voicing: VoicingEntry[], voicingPatternId?: string) => void | Promise<void>;
  onVoicingPinsChange?: (cell: BarCell, pinnedVoicingIds: string[]) => void | Promise<void>;
  onCopyChord?: (chord: ChordFunction) => void;
}) {
  // Source-of-truth beat count is `cell.beats` (= placement.beats).
  // `cell.chord.beats` is a stale legacy field carried over from
  // pre-Option-C materialization and isn't updated after edits.
  const chordBeats = cell.beats;
  const canDec = chordBeats > 1;
  const canInc = chordBeats < barSlots;
  const text = chordToDisplay(cell.chord, notationMode, sectionKey);

  const manualTag = cell.chord.harmonicTag;
  const autoOnly = manualTag === undefined;
  const effectiveTag = effectiveHarmonicTag(cell.chord);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState('');

  // Piano voicing. The root resolves from the song key + chord degree;
  // when the key is unknown we can't anchor offsets, so the voicing UI
  // shows a "set the key" hint instead. Edit mode drives a local draft;
  // Save commits via onVoicingChange. (The popover is keyed by
  // placementId at the render site, so this local state resets cleanly
  // when the user opens a different chord.)
  const rootNote = sectionKey ? chordRootNote(sectionKey, cell.chord.function) : '';
  const rootPc = pitchClassOf(rootNote);
  const canVoice = Boolean(onVoicingChange) && rootPc >= 0;
  const savedVoicing = cell.voicing;
  const hasVoicing = Boolean(savedVoicing && savedVoicing.length > 0);
  const preferFlats = sectionKey ? keyPrefersFlats(sectionKey) : true;
  const [editingVoicing, setEditingVoicing] = useState(false);
  const [draftVoicing, setDraftVoicing] = useState<VoicingEntry[]>([]);
  // "Save to library" naming flow: when set, an inline name field is shown
  // and confirming persists these offsets as a named user pattern.
  const [namingPattern, setNamingPattern] = useState<{
    offsets: VoicingEntry[];
    thenStopEditing: boolean;
  } | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const closeNaming = () => {
    setNamingPattern(null);
    setNameDraft('');
  };

  const beginEditVoicing = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeNaming();
    setDraftVoicing(normalizeVoicing(savedVoicing));
    setEditingVoicing(true);
  };
  // Tap a key: if its offset is already present (any hand) remove it,
  // otherwise add it with the hand the keyboard's L/R pill has selected.
  const toggleVoicingOffset = (offset: number, hand: VoicingHand) => {
    setDraftVoicing(prev =>
      prev.some(e => e.offset === offset)
        ? prev.filter(e => e.offset !== offset)
        : [...prev, { offset, hand }].sort((a, b) => a.offset - b.offset),
    );
  };
  const saveVoicing = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onVoicingChange) return;
    // Hand-edit → no pattern id (clears provenance). sanitizeVoicing
    // de-dupes + sorts; not a register rewrite (offsets are canonical).
    void onVoicingChange(cell, sanitizeVoicing(draftVoicing));
    closeNaming();
    setEditingVoicing(false);
  };
  const cancelVoicing = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeNaming();
    setEditingVoicing(false);
  };

  // --- Voicing carousel: candidate patterns for this chord's quality ---
  // Live so the set updates when the user saves a pattern or pins/unpins.
  const qualityMatch = qualityIdFromSuffix(cell.chord.quality);
  const qualityId = qualityMatch.id;
  // When the chord's quality isn't a known one, we voice the nearest base —
  // name it so the user knows the candidates are a best-effort match.
  const approxLabel = qualityMatch.exact
    ? null
    : CHORD_QUALITY_BY_ID.get(qualityId)?.label ?? qualityId;
  const pinnedIds = cell.pinnedVoicingIds ?? [];
  const pinnedKey = pinnedIds.join('|');
  const candidates = useLiveQuery(
    async () =>
      orderVoicingCandidates(
        await loadVoicingCandidates(qualityId, pinnedIds),
        pinnedIds,
      ),
    [qualityId, pinnedKey],
    [] as VoicingPattern[],
  );
  // A hand-edited voicing that isn't one of the saved patterns gets a
  // synthetic leading "Custom" slide so browse mode always reflects what's
  // actually applied (and offers to save it as a pattern).
  const CUSTOM_SLIDE_ID = '__custom__';
  const appliedIsPattern = candidates.some(p => p.id === cell.voicingPatternId);
  const customSlide: VoicingPattern | null =
    hasVoicing && !appliedIsPattern
      ? {
          id: CUSTOM_SLIDE_ID,
          qualityId,
          label: 'Custom',
          offsets: normalizeVoicing(savedVoicing),
          isSystem: false,
          sortOrder: -1,
          source: 'user',
          createdAt: 0,
          updatedAt: 0,
        }
      : null;
  const slides: VoicingPattern[] = customSlide ? [customSlide, ...candidates] : candidates;

  // Default to the applied slide until the user navigates.
  const appliedIndex = customSlide
    ? 0
    : slides.findIndex(p => p.id === cell.voicingPatternId);
  const [navIndex, setNavIndex] = useState<number | null>(null);
  const rawIndex = navIndex ?? (appliedIndex >= 0 ? appliedIndex : 0);
  const carouselIndex = slides.length
    ? Math.min(Math.max(rawIndex, 0), slides.length - 1)
    : 0;
  const current: VoicingPattern | undefined = slides[carouselIndex];
  const isCustomSlide = current?.id === CUSTOM_SLIDE_ID;
  const currentIsApplied = isCustomSlide || current?.id === cell.voicingPatternId;
  const currentIsPinned = !isCustomSlide && !!current && pinnedIds.includes(current.id);

  const stepCarousel = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const n = slides.length;
    if (n === 0) return;
    setNavIndex((((carouselIndex + delta) % n) + n) % n);
  };
  const applyCurrent = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onVoicingChange || !current) return;
    void onVoicingChange(cell, sanitizeVoicing(current.offsets), current.id);
  };
  const togglePinCurrent = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onVoicingPinsChange || !current || isCustomSlide) return;
    const id = current.id;
    void onVoicingPinsChange(
      cell,
      pinnedIds.includes(id) ? pinnedIds.filter(x => x !== id) : [...pinnedIds, id],
    );
  };
  // Persist a voicing as a reusable, named user pattern (global for the
  // quality, O2), then apply it. Used from edit mode (the draft) and the
  // Custom slide. label maps to VoicingPattern.label.
  const persistAsPattern = (
    offsets: VoicingEntry[],
    thenStopEditing: boolean,
    label?: string,
  ) => {
    if (!onVoicingChange) return;
    const clean = sanitizeVoicing(offsets);
    if (clean.length === 0) return;
    void (async () => {
      const p = await createUserVoicingPattern(qualityId, clean, label);
      await onVoicingChange(cell, clean, p.id);
      if (thenStopEditing) setEditingVoicing(false);
    })();
  };
  // "Save to library" opens the inline name field; confirming persists.
  const beginNaming = (offsets: VoicingEntry[], thenStopEditing: boolean) => {
    if (sanitizeVoicing(offsets).length === 0) return;
    setNameDraft('');
    setNamingPattern({ offsets, thenStopEditing });
  };
  const confirmNaming = () => {
    if (!namingPattern) return;
    persistAsPattern(
      namingPattern.offsets,
      namingPattern.thenStopEditing,
      nameDraft.trim() || undefined,
    );
    closeNaming();
  };
  const saveAsPattern = (e: React.MouseEvent) => {
    e.stopPropagation();
    beginNaming(draftVoicing, true);
  };
  const saveCustomAsPattern = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (current) beginNaming(normalizeVoicing(current.offsets), false);
  };
  const namingField = (
    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <input
        autoFocus
        type="text"
        value={nameDraft}
        onChange={e => setNameDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            confirmNaming();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            closeNaming();
          }
        }}
        placeholder="Voicing name…"
        className="flex-1 min-w-0 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-[11px]"
      />
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          confirmNaming();
        }}
        className="text-fluent hover:underline text-[11px]"
      >
        Save
      </button>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          closeNaming();
        }}
        className="text-neutral-500 hover:text-needswork text-[11px]"
      >
        cancel
      </button>
    </div>
  );

  // Stepping is already the right size: one SLOT is half a beat on an
  // eighths song and a whole beat otherwise, which is exactly the
  // asked-for behaviour. Only the number shown was ever wrong.
  const stepBy = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onBeatsChange) return;
    setDurationDraft(null);
    void onBeatsChange(cell, chordBeats + delta);
  };

  /** Non-null while the user is typing; null means "show the stored
   *  value". Keeps a half-finished entry like "2." from being parsed
   *  on every keystroke. */
  const [durationDraft, setDurationDraft] = useState<string | null>(null);

  const commitDuration = () => {
    const draft = durationDraft;
    setDurationDraft(null);
    if (draft === null || !onBeatsChange) return;
    const slots = slotsFromDurationInput(draft, eighths, barSlots);
    // Unparseable or non-positive input leaves the chord alone rather
    // than coercing a typo into a duration.
    if (slots === null || slots === chordBeats) return;
    void onBeatsChange(cell, slots);
  };

  const applyTag = (tag: string | null) => {
    if (!onTagChange) return;
    void onTagChange(cell, tag);
    setPickerOpen(false);
    setCustomDraft('');
  };

  const applyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customDraft.trim();
    if (trimmed === '') return;
    applyTag(trimmed);
  };

  // Mobile (<768px): render as a full-width bottom sheet — fixed to the
  // viewport, height-capped, scrollable — so the 28rem popover no longer
  // overflows a 390px screen and the keyboard + carousel stay reachable.
  // It stays a DOM descendant of the bar-grid container (no portal), so the
  // outside-click close handler keeps working; the lead-sheet card's
  // backdrop-blur was removed so `fixed` anchors to the viewport.
  // md+: the original popover anchored below the chord. (Design step 3.)
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg md:absolute md:inset-x-auto md:bottom-auto md:top-full md:left-1/2 md:-translate-x-1/2 md:mt-1 md:z-20 md:w-[28rem] md:max-w-[90vw] md:max-h-[70vh] md:rounded-md md:shadow-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      onClick={e => e.stopPropagation()}
    >
      {onBeatsChange && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-neutral-200 dark:border-neutral-800">
          <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
            {text ? <ChordGlyph text={text} /> : '—'}
          </span>
          <button
            type="button"
            onClick={stepBy(-1)}
            disabled={!canDec}
            className="w-6 h-6 leading-none rounded border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="shorten chord"
          >
            −
          </button>
          {/* TYPEABLE, and in note values. Stepper-only made the long
              jumps painful, which is half of why odd values got typed
              in the first place. The field shows what is stored,
              converted — never the raw slot count. */}
          <input
            type="text"
            inputMode="decimal"
            value={durationDraft ?? formatDurationBeats(chordBeats, eighths)}
            onChange={e => setDurationDraft(e.target.value)}
            onFocus={e => e.currentTarget.select()}
            onBlur={commitDuration}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setDurationDraft(null);
                e.currentTarget.blur();
              }
            }}
            aria-label={`duration in ${durationUnit}`}
            className="font-mono tabular-nums text-sm w-[4ch] text-center rounded border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-700 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-400"
          />
          <button
            type="button"
            onClick={stepBy(1)}
            disabled={!canInc}
            className="w-6 h-6 leading-none rounded border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="lengthen chord"
          >
            +
          </button>
          <span className="text-[10px] text-neutral-400">{durationUnit}</span>
        </div>
      )}

      {onTagChange && (
        <div className="px-2 py-1.5">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-neutral-500">tag:</span>
            {effectiveTag ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200">
                {labelForTag(effectiveTag)}
                {autoOnly && <span className="text-neutral-400">· auto</span>}
              </span>
            ) : (
              <span className="text-neutral-400 italic">none</span>
            )}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setPickerOpen(prev => !prev);
              }}
              className="ml-auto text-fluent hover:underline"
            >
              {pickerOpen ? 'close' : effectiveTag ? 'edit' : '+ tag'}
            </button>
          </div>

          {pickerOpen && (
            <div className="mt-2 space-y-1.5">
              <div className="flex flex-wrap gap-1">
                {TAG_PRESETS.map(preset => {
                  const selected = manualTag === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        applyTag(preset.value);
                      }}
                      className={`px-2 py-0.5 text-[11px] rounded-full border ${
                        selected
                          ? 'border-fluent bg-fluent/10 text-fluent'
                          : 'border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <form className="flex items-center gap-1" onSubmit={applyCustom}>
                <input
                  type="text"
                  value={customDraft}
                  onChange={e => setCustomDraft(e.target.value)}
                  placeholder="custom…"
                  className="flex-1 px-2 py-0.5 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200"
                  onClick={e => e.stopPropagation()}
                />
                <button
                  type="submit"
                  disabled={customDraft.trim() === ''}
                  className="px-2 py-0.5 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-fluent hover:text-fluent disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  apply
                </button>
              </form>
              {manualTag !== undefined && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    applyTag(null);
                  }}
                  className="text-[11px] text-neutral-500 hover:text-needswork"
                >
                  clear tag
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {onVoicingChange && (
        <div className="px-2 py-1.5 border-t border-neutral-200 dark:border-neutral-800 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-neutral-500">voicing</span>
            {canVoice ? (
              editingVoicing ? (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={saveVoicing} className="text-fluent hover:underline">
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={saveAsPattern}
                    disabled={draftVoicing.length === 0}
                    className="text-fluent hover:underline disabled:opacity-30"
                  >
                    Save to library
                  </button>
                  <button type="button" onClick={cancelVoicing} className="text-neutral-500 hover:text-needswork">
                    cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={beginEditVoicing} className="text-fluent hover:underline">
                  {hasVoicing ? 'Edit / custom' : '+ Custom voicing'}
                </button>
              )
            ) : null}
          </div>

          {!canVoice ? (
            <p className="text-[11px] text-neutral-400 italic">
              set the song key to add a voicing
            </p>
          ) : editingVoicing ? (
            <div onClick={e => e.stopPropagation()} className="space-y-1">
              <PianoKeyboard
                rootPc={rootPc}
                preferFlats={preferFlats}
                voicing={draftVoicing}
                editable
                onToggle={toggleVoicingOffset}
                octaves={4}
                absoluteOffsets
              />
              {namingPattern && namingField}
            </div>
          ) : (
            <div onClick={e => e.stopPropagation()} className="space-y-1">
              {approxLabel && (
                <p className="text-[10px] text-neutral-400 italic text-center">
                  ≈ closest match: {approxLabel}
                </p>
              )}
              <PianoKeyboard
                rootPc={rootPc}
                preferFlats={preferFlats}
                voicing={current?.offsets ?? []}
                faint={!current}
                octaves={4}
                absoluteOffsets
              />
              {current && (
                <>
                  <div className="flex items-center justify-between text-[11px]">
                    <button
                      type="button"
                      onClick={stepCarousel(-1)}
                      disabled={slides.length < 2}
                      aria-label="previous voicing"
                      className="px-1.5 py-0.5 rounded hover:text-fluent disabled:opacity-30"
                    >
                      ‹
                    </button>
                    <div className="flex flex-col items-center leading-tight">
                      <span className="text-neutral-600 dark:text-neutral-300">{current.label}</span>
                      <span className="text-neutral-400">
                        {carouselIndex + 1} of {slides.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={stepCarousel(1)}
                      disabled={slides.length < 2}
                      aria-label="next voicing"
                      className="px-1.5 py-0.5 rounded hover:text-fluent disabled:opacity-30"
                    >
                      ›
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    {isCustomSlide ? (
                      <button type="button" onClick={saveCustomAsPattern} className="text-fluent hover:underline">
                        Save to library
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={togglePinCurrent}
                        aria-pressed={currentIsPinned}
                        className={currentIsPinned ? 'text-amber-500' : 'text-neutral-400 hover:text-amber-500'}
                      >
                        {currentIsPinned ? '★ pinned' : '☆ pin'}
                      </button>
                    )}
                    {currentIsApplied ? (
                      <span className="text-fluent">✓ applied</span>
                    ) : (
                      <button type="button" onClick={applyCurrent} className="text-fluent hover:underline">
                        Use this voicing
                      </button>
                    )}
                  </div>
                  {namingPattern && namingField}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {(onCopyChord || onDelete) && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-t border-neutral-200 dark:border-neutral-800">
          {onCopyChord && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onCopyChord(cell.chord);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent"
              aria-label="copy chord"
            >
              <span aria-hidden>📋</span> Copy chord
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                void onDelete(cell);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-needswork hover:text-needswork"
              aria-label="delete chord"
            >
              <span aria-hidden>🗑</span> Delete chord
            </button>
          )}
        </div>
      )}
    </div>
  );
}

