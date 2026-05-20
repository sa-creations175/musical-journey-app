import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  type DraggableSyntheticListeners,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import type { DraggableAttributes } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ChordFunction, LyricLine, Song, SongSection } from '../../lib/db';
import { chordToDisplay, parseChordFunction } from './chordFunction';
import { useNotationMode } from '../../lib/notationPref';
import {
  type Bar,
  type BarCell,
  deriveBarGrid,
  effectiveHarmonicTag,
  effectiveTimeSignature,
  parseTimeSignature,
} from './barGrid';
import { distributedWordPositions } from './lyricLine';
import ChordGlyph from './chordGlyph';

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
  emptyBeat: (barIndex: number, beatPos: number) =>
    `emptybeat:${barIndex}:${beatPos}`,
  /** Lyric drop slot per beat (lyric drop target). Distinct prefix
   *  from `emptybeat:` because chord drags only see emptybeat targets
   *  and lyric drags only see beat targets. */
  beat: (barIndex: number, beatPos: number) => `beat:${barIndex}:${beatPos}`,
  pending: (lineId: string) => `pending:${lineId}`,
  lineStart: (lineId: string) => `lineStart:${lineId}`,
  lineEnd: (lineId: string) => `lineEnd:${lineId}`,
  word: (lineId: string, wordIdx: number) => `word:${lineId}:${wordIdx}`,
  bar: (barIndex: number) => `bar:${barIndex}`,
};

// 2 bars per row keeps each bar wide enough for chord glyphs.
const BARS_PER_ROW = 2;

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
  /** Whether chord cells render as sortable (drag-to-reorder). Drag
   *  end is handled by the parent DndContext; this flag just tells
   *  us to wrap each cell in `useSortable`. */
  chordsAreSortable?: boolean;
  /** Lyric lines on this section. Pending lines (start == end) render
   *  in the tray above the grid; placed lines render in their bars'
   *  lyric rows. */
  lyricLines?: LyricLine[];
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
  ) => void | Promise<void>;
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
  chordsAreSortable = false,
  lyricLines = [],
  onLineDelete,
  onAddBar,
  onDeleteBar,
  onBarReorder,
  onWordSplit,
  onWordJoin,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  onTimeSignatureChange,
  onChordAdd,
}: Props) {
  const [notationMode] = useNotationMode();
  const timeSignature = effectiveTimeSignature(song, section);
  const { beatsPerBar } = parseTimeSignature(timeSignature);

  const bars = useMemo(
    () => deriveBarGrid(section, activeArrangementId, beatsPerBar),
    [section, activeArrangementId, beatsPerBar],
  );

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
    mode: 'actions' | 'split';
  } | null>(null);
  // Time-signature picker state (step 8). Anchored under the header
  // time-signature label.
  const [timeSigPickerOpen, setTimeSigPickerOpen] = useState(false);
  // Chord-add popover (step ?: tap-to-add chord on empty beat slot).
  // Anchored under the bar containing the tapped empty slot.
  const [newChordAt, setNewChordAt] = useState<
    { barIndex: number; beatPos: number } | null
  >(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing && !wordEditing && !timeSigPickerOpen && !newChordAt) return;
    const onDown = (e: MouseEvent) => {
      const node = containerRef.current;
      if (!node) return;
      if (e.target instanceof Node && node.contains(e.target)) return;
      setEditing(null);
      setWordEditing(null);
      setTimeSigPickerOpen(false);
      setNewChordAt(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editing, wordEditing, timeSigPickerOpen, newChordAt]);

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
  for (let i = 0; i < bars.length; i += BARS_PER_ROW) {
    rows.push(bars.slice(i, i + BARS_PER_ROW));
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
    ? (barIndex: number, beatPos: number) => {
        // Opening chord-add dismisses any chord-edit popover.
        setEditing(null);
        setNewChordAt(prev =>
          prev && prev.barIndex === barIndex && prev.beatPos === beatPos
            ? null
            : { barIndex, beatPos },
        );
      }
    : undefined;

  const handleBeatsChange = onChordBeatsChange
    ? async (cell: BarCell, nextBeats: number) => {
        const clamped = Math.min(Math.max(1, Math.round(nextBeats)), beatsPerBar);
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

  const body = (
    <>
      {pendingLines.length > 0 && (
        <PendingTray lines={pendingLines} onLineDelete={onLineDelete} />
      )}
      <div className="mt-2 space-y-3">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx}>
            {/* Bar row (chord boxes). */}
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${BARS_PER_ROW}, minmax(0, 1fr))` }}
            >
              {row.map(bar => (
                <BarBox
                  key={bar.index}
                  bar={bar}
                  beatsPerBar={beatsPerBar}
                  sectionKey={song.key}
                  notationMode={notationMode}
                  editing={editing}
                  onCellClick={handleCellClick}
                  onBeatsChange={handleBeatsChange}
                  onTagChange={handleTagChange}
                  onDelete={handleDelete}
                  draggable={chordsAreSortable}
                  onDeleteBar={onDeleteBar}
                  barDragEnabled={Boolean(onBarReorder)}
                  onEmptyBeatClick={handleEmptyBeatClick}
                  newChordAt={newChordAt}
                  onChordAddSubmit={
                    onChordAdd
                      ? (barIdx, beatPos, chord) => {
                          void onChordAdd(barIdx, beatPos, chord);
                          setNewChordAt(null);
                        }
                      : undefined
                  }
                  onChordAddCancel={() => setNewChordAt(null)}
                />
              ))}
              {row.length < BARS_PER_ROW &&
                Array.from({ length: BARS_PER_ROW - row.length }).map((_, i) => (
                  <div key={`pad-${i}`} aria-hidden />
                ))}
            </div>
            {/* Lyric row aligned beat-by-beat with the bar row above.
                Same grid columns so each LyricBarSegment lines up
                under its bar; inside each segment beatsPerBar equal-
                width drop slots give beat-level alignment. */}
            <div
              className="grid gap-2 mt-1"
              style={{ gridTemplateColumns: `repeat(${BARS_PER_ROW}, minmax(0, 1fr))` }}
            >
              {row.map(bar => (
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
                />
              ))}
              {row.length < BARS_PER_ROW &&
                Array.from({ length: BARS_PER_ROW - row.length }).map((_, i) => (
                  <div key={`pad-lyr-${i}`} aria-hidden />
                ))}
            </div>
          </div>
        ))}
        {onAddBar && (
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
      className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50/40 dark:bg-neutral-900/40"
    >
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
      />
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
  beatsPerBar,
  sectionKey,
  notationMode,
  editing,
  onCellClick,
  onBeatsChange,
  onTagChange,
  onDelete,
  draggable,
  onDeleteBar,
  barDragEnabled,
  onEmptyBeatClick,
  newChordAt,
  onChordAddSubmit,
  onChordAddCancel,
}: {
  bar: Bar;
  beatsPerBar: number;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  editing: EditingState | null;
  onCellClick?: (cell: BarCell, barIndex: number) => void;
  onBeatsChange?: (cell: BarCell, beats: number) => void | Promise<void>;
  onTagChange?: (cell: BarCell, tag: string | null) => void | Promise<void>;
  onDelete?: (cell: BarCell) => void | Promise<void>;
  draggable: boolean;
  onDeleteBar?: (barIndex: number) => void;
  barDragEnabled: boolean;
  onEmptyBeatClick?: (barIndex: number, beatPos: number) => void;
  newChordAt: { barIndex: number; beatPos: number } | null;
  onChordAddSubmit?: (
    barIndex: number,
    beatPos: number,
    chord: ChordFunction,
  ) => void;
  onChordAddCancel: () => void;
}) {
  const editingCellInThisBar =
    editing && editing.barIndex === bar.index
      ? bar.cells.find(c => c.placementId === editing.placementId) ?? null
      : null;

  const isEmptyBar = bar.cells.length === 0;

  // Walk beats 0..beatsPerBar-1 to assemble the row. At each position
  // we either emit a chord cell (its leading half), skip a position
  // that's covered by a tied multi-beat chord, or emit an empty beat
  // drop slot. This is what makes Option C work: empty positions —
  // both gaps between chords AND trailing dashed space — become
  // discrete droppables for chord drag.
  type Item =
    | { kind: 'cell'; cell: BarCell; widthPct: number }
    | { kind: 'empty'; beatPos: number };
  const items: Item[] = [];
  let pos = 0;
  while (pos < beatsPerBar) {
    const cell = bar.cells.find(c => !c.tiedFromPrev && c.beatPos === pos);
    if (cell) {
      const widthPct = (cell.beats / beatsPerBar) * 100;
      items.push({ kind: 'cell', cell, widthPct });
      pos += Math.max(1, cell.beats);
      continue;
    }
    // Skip positions covered by a multi-beat cell that started earlier.
    const covering = bar.cells.find(
      c => !c.tiedFromPrev && c.beatPos < pos && c.beatPos + c.beats > pos,
    );
    if (covering) {
      pos += 1;
      continue;
    }
    items.push({ kind: 'empty', beatPos: pos });
    pos += 1;
  }

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
      {isEmptyBar && onDeleteBar && (
        <button
          type="button"
          onClick={() => onDeleteBar(bar.index)}
          aria-label={`delete bar ${bar.index + 1}`}
          title="delete this empty bar"
          className="absolute top-0.5 right-1 text-[10px] leading-none text-neutral-400 hover:text-needswork px-0.5"
        >
          ×
        </button>
      )}
      <div className="flex items-stretch gap-0.5 h-full overflow-x-auto">
        {items.map((item, idx) => {
          if (item.kind === 'empty') {
            return (
              <EmptyBeatSlot
                key={`e-${item.beatPos}`}
                barIndex={bar.index}
                beatPos={item.beatPos}
                widthPct={(1 / beatsPerBar) * 100}
                onClick={
                  onEmptyBeatClick
                    ? () => onEmptyBeatClick(bar.index, item.beatPos)
                    : undefined
                }
                isAdding={
                  newChordAt !== null &&
                  newChordAt.barIndex === bar.index &&
                  newChordAt.beatPos === item.beatPos
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
              onClick={onCellClick ? c => onCellClick(c, bar.index) : undefined}
            />
          );
        })}
      </div>

      {editingCellInThisBar && (onBeatsChange || onTagChange) && (
        <ChordEditorPopover
          cell={editingCellInThisBar}
          beatsPerBar={beatsPerBar}
          sectionKey={sectionKey}
          notationMode={notationMode}
          onBeatsChange={onBeatsChange}
          onTagChange={onTagChange}
          onDelete={onDelete}
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
            onSubmit={chord =>
              onChordAddSubmit(newChordAt.barIndex, newChordAt.beatPos, chord)
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
  mode: 'actions' | 'split';
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
        />
      )}
    </div>
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
}: {
  state: WordEditingState;
  wordText: string;
  wordCount: number;
  onClose: () => void;
  onModeChange: (mode: 'actions' | 'split') => void;
  onSplit?: (splitAt: number) => void;
  onJoin?: (leftIndex: number) => void;
}) {
  const canJoinPrev = state.wordIndex > 0;
  const canJoinNext = state.wordIndex < wordCount - 1;

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
  onSubmit,
  onCancel,
}: {
  barIndex: number;
  beatPos: number;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
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
  widthPct,
  onClick,
  isAdding,
}: {
  barIndex: number;
  beatPos: number;
  widthPct: number;
  onClick?: () => void;
  isAdding?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: DRAG_ID.emptyBeat(barIndex, beatPos),
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
      className={`rounded border border-dashed shrink-0 transition-colors ${
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
  onClick,
}: {
  cell: BarCell;
  widthPct: number;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  isEditing: boolean;
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
  onClick?: (cell: BarCell) => void;
  dragRef?: (node: HTMLElement | null) => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  dragStyle?: CSSProperties;
  extraClassName?: string;
}) {
  const text = chordToDisplay(cell.chord, notationMode, sectionKey);
  const palette = colorForFunction(cell.chord);
  const roundedLeft = !cell.tiedFromPrev;
  const roundedRight = !cell.tiedToNext;
  const radiusClass = [
    roundedLeft ? 'rounded-l-sm' : '',
    roundedRight ? 'rounded-r-sm' : '',
  ].join(' ');
  const tagged = effectiveHarmonicTag(cell.chord) !== undefined;
  const borderStyleClass = tagged ? 'border-dashed' : 'border-solid';

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
      className={`flex flex-col items-center justify-between py-0.5 px-0.5 border-2 ${borderStyleClass} ${palette.border} ${palette.bg} ${radiusClass} overflow-hidden touch-none min-w-[72px] shrink-0 ${
        interactive ? 'cursor-pointer hover:brightness-105' : ''
      } ${isEditing ? 'ring-2 ring-fluent ring-offset-1 ring-offset-white dark:ring-offset-neutral-900' : ''} ${extraClassName ?? ''}`}
      style={baseStyle}
      title={cell.chord.raw ?? text}
    >
      <div className={`text-[11px] leading-tight font-semibold ${palette.text} truncate w-full text-center`}>
        {text ? <ChordGlyph text={text} /> : <span className="opacity-40">—</span>}
      </div>
      <div className={`flex items-center justify-center gap-0.5 text-[8px] ${palette.dot}`}>
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

function labelForTag(tag: string): string {
  const preset = TAG_PRESETS.find(p => p.value === tag);
  return preset?.label ?? tag;
}

function ChordEditorPopover({
  cell,
  beatsPerBar,
  sectionKey,
  notationMode,
  onBeatsChange,
  onTagChange,
  onDelete,
}: {
  cell: BarCell;
  beatsPerBar: number;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  onBeatsChange?: (cell: BarCell, beats: number) => void | Promise<void>;
  onTagChange?: (cell: BarCell, tag: string | null) => void | Promise<void>;
  onDelete?: (cell: BarCell) => void | Promise<void>;
}) {
  // Source-of-truth beat count is `cell.beats` (= placement.beats).
  // `cell.chord.beats` is a stale legacy field carried over from
  // pre-Option-C materialization and isn't updated after edits.
  const chordBeats = cell.beats;
  const canDec = chordBeats > 1;
  const canInc = chordBeats < beatsPerBar;
  const text = chordToDisplay(cell.chord, notationMode, sectionKey);

  const manualTag = cell.chord.harmonicTag;
  const autoOnly = manualTag === undefined;
  const effectiveTag = effectiveHarmonicTag(cell.chord);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState('');

  const stepBy = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onBeatsChange) return;
    void onBeatsChange(cell, chordBeats + delta);
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

  return (
    <div
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-20 min-w-[16rem] rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-md"
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
            aria-label="decrease beat count"
          >
            −
          </button>
          <span className="font-mono tabular-nums text-sm min-w-[1.5ch] text-center text-neutral-700 dark:text-neutral-200">
            {chordBeats}
          </span>
          <button
            type="button"
            onClick={stepBy(1)}
            disabled={!canInc}
            className="w-6 h-6 leading-none rounded border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="increase beat count"
          >
            +
          </button>
          <span className="text-[10px] text-neutral-400">
            beat{chordBeats === 1 ? '' : 's'}
          </span>
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

      {onDelete && (
        <div className="px-2 py-1.5 border-t border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              void onDelete(cell);
            }}
            className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-needswork hover:text-needswork"
            aria-label="delete chord"
          >
            <span aria-hidden>🗑</span> Delete chord
          </button>
        </div>
      )}
    </div>
  );
}

const DEGREE_PALETTES: Record<string, {
  bg: string;
  text: string;
  border: string;
  dot: string;
}> = {
  '1': {
    bg: 'bg-green-50 dark:bg-green-950/40',
    text: 'text-green-700 dark:text-green-200',
    border: 'border-green-500 dark:border-green-500',
    dot: 'text-green-500',
  },
  '2': {
    bg: 'bg-pink-50 dark:bg-pink-950/40',
    text: 'text-pink-700 dark:text-pink-200',
    border: 'border-pink-400 dark:border-pink-400',
    dot: 'text-pink-400',
  },
  '3': {
    bg: 'bg-teal-50 dark:bg-teal-950/40',
    text: 'text-teal-700 dark:text-teal-200',
    border: 'border-teal-500 dark:border-teal-500',
    dot: 'text-teal-500',
  },
  '4': {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-700 dark:text-purple-200',
    border: 'border-purple-600 dark:border-purple-500',
    dot: 'text-purple-600',
  },
  '5': {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-200',
    border: 'border-amber-500 dark:border-amber-500',
    dot: 'text-amber-500',
  },
  '6': {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-200',
    border: 'border-blue-500 dark:border-blue-500',
    dot: 'text-blue-500',
  },
  '7': {
    bg: 'bg-red-50 dark:bg-red-950/40',
    text: 'text-red-700 dark:text-red-200',
    border: 'border-red-500 dark:border-red-500',
    dot: 'text-red-500',
  },
};

const NEUTRAL_PALETTE = {
  bg: 'bg-neutral-100 dark:bg-neutral-800/60',
  text: 'text-neutral-700 dark:text-neutral-200',
  border: 'border-neutral-300 dark:border-neutral-700',
  dot: 'text-neutral-400',
};

function colorForFunction(chord: ChordFunction): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  if (chord.unparsed) return NEUTRAL_PALETTE;
  const source = chord.bass && chord.bass !== '' ? chord.bass : chord.function;
  if (source === '') return NEUTRAL_PALETTE;
  const digit = source.replace(/^[b#]/, '');
  return DEGREE_PALETTES[digit] ?? NEUTRAL_PALETTE;
}
