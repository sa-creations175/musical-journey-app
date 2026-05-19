import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  type DraggableSyntheticListeners,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import type { DraggableAttributes } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { ChordFunction, LyricLine, Song, SongSection } from '../../lib/db';
import { chordToDisplay } from './chordFunction';
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
  chord: (phraseId: string, beatId: string) => `chord:${phraseId}:${beatId}`,
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
    phraseId: string,
    beatId: string,
    beats: number,
  ) => Promise<void> | void;
  onChordTagChange?: (
    phraseId: string,
    beatId: string,
    tag: string | null,
  ) => Promise<void> | void;
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
}

interface EditingState {
  phraseId: string;
  beatId: string;
  barIndex: number;
}

export default function BarGridView({
  song,
  section,
  activeArrangementId,
  onChordBeatsChange,
  onChordTagChange,
  chordsAreSortable = false,
  lyricLines = [],
  onLineDelete,
  onAddBar,
  onDeleteBar,
  onBarReorder,
}: Props) {
  const [notationMode] = useNotationMode();
  const timeSignature = effectiveTimeSignature(song, section);
  const { beatsPerBar } = parseTimeSignature(timeSignature);

  const bars = useMemo(
    () => deriveBarGrid(section, activeArrangementId, beatsPerBar),
    [section, activeArrangementId, beatsPerBar],
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      const node = containerRef.current;
      if (!node) return;
      if (e.target instanceof Node && node.contains(e.target)) return;
      setEditing(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const key = `${editing.phraseId}:${editing.beatId}`;
    const stillVisible = bars.some(
      bar =>
        bar.index === editing.barIndex &&
        bar.cells.some(c => cellKey(c) === key),
    );
    if (!stillVisible) setEditing(null);
  }, [bars, editing]);

  if (bars.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-neutral-200 dark:border-neutral-800 p-3">
        <BarGridHeader timeSignature={timeSignature} barCount={0} />
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
        const key = cellKey(cell);
        setEditing(prev => {
          if (
            prev &&
            `${prev.phraseId}:${prev.beatId}` === key &&
            prev.barIndex === barIndex
          ) {
            return null;
          }
          return { phraseId: cell.phraseId, beatId: cell.beatId, barIndex };
        });
      }
    : undefined;

  const handleBeatsChange = onChordBeatsChange
    ? async (cell: BarCell, nextBeats: number) => {
        const clamped = Math.min(Math.max(1, Math.round(nextBeats)), beatsPerBar);
        if (clamped === (cell.chord.beats ?? 1)) return;
        await onChordBeatsChange(cell.phraseId, cell.beatId, clamped);
      }
    : undefined;

  const handleTagChange = onChordTagChange
    ? async (cell: BarCell, tag: string | null) => {
        await onChordTagChange(cell.phraseId, cell.beatId, tag);
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
                  draggable={chordsAreSortable}
                  onDeleteBar={onDeleteBar}
                  barDragEnabled={Boolean(onBarReorder)}
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
      <BarGridHeader timeSignature={timeSignature} barCount={bars.length} />
      {body}
    </div>
  );
}

function cellKey(cell: BarCell): string {
  return `${cell.phraseId}:${cell.beatId}`;
}

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

function BarGridHeader({
  timeSignature,
  barCount,
}: {
  timeSignature: string;
  barCount: number;
}) {
  return (
    <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-neutral-500">
      <span>bar grid</span>
      <span>
        {barCount} bar{barCount === 1 ? '' : 's'} · {timeSignature}
      </span>
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
  draggable,
  onDeleteBar,
  barDragEnabled,
}: {
  bar: Bar;
  beatsPerBar: number;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  editing: EditingState | null;
  onCellClick?: (cell: BarCell, barIndex: number) => void;
  onBeatsChange?: (cell: BarCell, beats: number) => void | Promise<void>;
  onTagChange?: (cell: BarCell, tag: string | null) => void | Promise<void>;
  draggable: boolean;
  onDeleteBar?: (barIndex: number) => void;
  barDragEnabled: boolean;
}) {
  const filledBeats = bar.cells.reduce((sum, c) => sum + c.beats, 0);
  const emptyBeats = Math.max(0, beatsPerBar - filledBeats);

  const editingCellInThisBar =
    editing && editing.barIndex === bar.index
      ? bar.cells.find(
          c => c.phraseId === editing.phraseId && c.beatId === editing.beatId,
        ) ?? null
      : null;

  const isEmptyBar = bar.cells.length === 0;

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
        {bar.cells.map((cell, idx) => {
          const widthPct = (cell.beats / beatsPerBar) * 100;
          const isEditing =
            editing !== null &&
            editing.phraseId === cell.phraseId &&
            editing.beatId === cell.beatId;
          const isLeadingHalf = !cell.tiedFromPrev;
          if (isLeadingHalf && draggable) {
            return (
              <DraggableChordCell
                key={idx}
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
              key={idx}
              cell={cell}
              widthPct={widthPct}
              sectionKey={sectionKey}
              notationMode={notationMode}
              isEditing={isEditing}
              onClick={
                isLeadingHalf && onCellClick
                  ? c => onCellClick(c, bar.index)
                  : undefined
              }
            />
          );
        })}
        {emptyBeats > 0 && (
          <div
            className="rounded border border-dashed border-neutral-200 dark:border-neutral-800"
            style={{ width: `${(emptyBeats / beatsPerBar) * 100}%` }}
            aria-hidden
          />
        )}
      </div>

      {editingCellInThisBar && (onBeatsChange || onTagChange) && (
        <ChordEditorPopover
          cell={editingCellInThisBar}
          beatsPerBar={beatsPerBar}
          sectionKey={sectionKey}
          notationMode={notationMode}
          onBeatsChange={onBeatsChange}
          onTagChange={onTagChange}
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

function LyricBarSegment({
  barIndex,
  beatsPerBar,
  placedLines,
  onLineDelete,
}: {
  barIndex: number;
  beatsPerBar: number;
  placedLines: LyricLine[];
  onLineDelete?: (lineId: string) => void;
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

  return (
    <div className="flex gap-0.5 px-1">
      {Array.from({ length: beatsPerBar }).map((_, beatPos) => (
        <BeatDropSlot
          key={beatPos}
          barIndex={barIndex}
          beatPos={beatPos}
          items={slots[beatPos]}
          onLineDelete={onLineDelete}
        />
      ))}
    </div>
  );
}

function BeatDropSlot({
  barIndex,
  beatPos,
  items,
  onLineDelete,
}: {
  barIndex: number;
  beatPos: number;
  items: Array<
    | { kind: 'word'; line: LyricLine; wordIndex: number; text: string }
    | { kind: 'startMarker'; line: LyricLine }
    | { kind: 'endMarker'; line: LyricLine }
  >;
  onLineDelete?: (lineId: string) => void;
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

function WordChip({
  lineId,
  wordIndex,
  text,
}: {
  lineId: string;
  wordIndex: number;
  text: string;
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
      className="cursor-grab active:cursor-grabbing select-none touch-none text-[10px] leading-tight italic text-neutral-700 dark:text-neutral-200 px-1 rounded bg-neutral-100 dark:bg-neutral-800 truncate max-w-[7rem]"
      title={text}
    >
      {text}
    </span>
  );
}

function DraggableChordCell({
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
  // Chord drag uses swap semantics. Each cell is both a draggable
  // source and a droppable target with the same id (`chord:`-
  // prefixed). The parent DndContext's `handleDragEnd` reads
  // active/over ids and swaps the two slots' chord values via
  // `swapChordPlacements`. No SortableContext / arrayMove — that
  // model produced cascading shifts that read as "chord disappeared
  // and everything shifted up" on cross-bar drops.
  const id = DRAG_ID.chord(cell.phraseId, cell.beatId);
  const chordDrop = useDroppable({ id });
  const chordDrag = useDraggable({ id });
  const setRefs = (node: HTMLElement | null) => {
    chordDrop.setNodeRef(node);
    chordDrag.setNodeRef(node);
  };
  const dragStyle: CSSProperties = {
    transform: CSS.Translate.toString(chordDrag.transform),
    opacity: chordDrag.isDragging ? 0.4 : 1,
    width: `${widthPct}%`,
  };
  // Drop-target highlight when another chord is hovering over this
  // one (and we're not dragging this one ourselves).
  const dropHighlight =
    chordDrop.isOver && !chordDrag.isDragging
      ? 'ring-2 ring-fluent ring-offset-1 ring-offset-white dark:ring-offset-neutral-900'
      : '';
  return (
    <ChordCellBox
      cell={cell}
      widthPct={widthPct}
      sectionKey={sectionKey}
      notationMode={notationMode}
      isEditing={isEditing}
      onClick={onClick}
      dragRef={setRefs}
      dragAttributes={chordDrag.attributes}
      dragListeners={chordDrag.listeners}
      dragStyle={dragStyle}
      extraClassName={dropHighlight}
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
}: {
  cell: BarCell;
  beatsPerBar: number;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  onBeatsChange?: (cell: BarCell, beats: number) => void | Promise<void>;
  onTagChange?: (cell: BarCell, tag: string | null) => void | Promise<void>;
}) {
  const chordBeats = cell.chord.beats ?? 1;
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
