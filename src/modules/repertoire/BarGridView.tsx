import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  type DraggableSyntheticListeners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DraggableAttributes } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ChordFunction, Song, SongSection } from '../../lib/db';
import { chordToDisplay } from './chordFunction';
import { useNotationMode } from '../../lib/notationPref';
import {
  type Bar,
  type BarCell,
  deriveBarGrid,
  effectiveTimeSignature,
  parseTimeSignature,
} from './barGrid';
import ChordGlyph from './chordGlyph';

// Bar-grid renderer (Lead Sheet Redesign, May 2026 —
// docs/LEAD_SHEET_REDESIGN.md). Renders chord placements as a measure
// grid with proportional-width chord boxes inside each bar.
//
// Interactions (when the parent supplies handlers):
//   · click a chord box  → opens a popover below the bar with
//                          [−] N [+] controls for the chord's beat
//                          count (`onChordBeatsChange`).
//   · drag a chord box   → reorders chord values across slots
//                          (`onChordReorder`). Slot anchors stay
//                          put; only which chord lives at each slot
//                          changes — consistent with the redesign's
//                          decoupling of lyrics from chord positions.
//
// A chord split across bars (tie-split) renders as two visual cells
// but is one placement. Only the leading half is draggable + clickable
// so each sortable id stays unique; the trailing half is decorative.

// 2 bars per row gives each bar enough horizontal space that bars
// holding 4 single-beat chords in 4/4 fit comfortably (cell min-width
// × beatsPerBar < bar's column width) without needing the inner
// `overflow-x-auto` scroll fallback to kick in for typical usage.
const BARS_PER_ROW = 2;

interface Props {
  song: Song;
  section: SongSection;
  activeArrangementId: string;
  /** When supplied, chord cells become tappable: clicking a cell opens
   *  a popover below the bar with `−` / `+` beat-count controls that
   *  persist via this callback. When omitted, beats are read-only. */
  onChordBeatsChange?: (
    phraseId: string,
    beatId: string,
    beats: number,
  ) => Promise<void> | void;
  /** When supplied, chord boxes become draggable to reorder. The
   *  callback receives document-order indices and is expected to
   *  apply arrayMove + persist. When omitted, drag is disabled. */
  onChordReorder?: (fromIndex: number, toIndex: number) => Promise<void> | void;
}

interface EditingState {
  phraseId: string;
  beatId: string;
  /** Which bar to anchor the popover under. Tracked separately so a
   *  tie-split chord can open the editor below the half the user
   *  actually clicked (left half vs right half live in different
   *  bars but share the same `phraseId:beatId`). */
  barIndex: number;
}

export default function BarGridView({
  song,
  section,
  activeArrangementId,
  onChordBeatsChange,
  onChordReorder,
}: Props) {
  const [notationMode] = useNotationMode();
  const timeSignature = effectiveTimeSignature(song, section);
  const { beatsPerBar } = parseTimeSignature(timeSignature);

  const bars = useMemo(
    () => deriveBarGrid(section, activeArrangementId, beatsPerBar),
    [section, activeArrangementId, beatsPerBar],
  );

  // Flat list of unique placement ids in document order — counts each
  // chord once (skips the trailing half of any tie-split). Drives the
  // SortableContext and the fromIndex/toIndex math on drag-end.
  const placementIds = useMemo(
    () =>
      bars
        .flatMap(b => b.cells)
        .filter(c => !c.tiedFromPrev)
        .map(c => cellKey(c)),
    [bars],
  );

  const [editing, setEditing] = useState<EditingState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the editor on any mousedown outside the grid container.
  // Listening on `mousedown` (not click) so the editor collapses
  // before downstream click-handlers run.
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

  // If the underlying layout shifts (chord moved, deleted, etc.) and
  // the editing target is gone, drop the editor.
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (bars.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-neutral-200 dark:border-neutral-800 p-3">
        <BarGridHeader timeSignature={timeSignature} barCount={0} />
        <p className="mt-2 text-[11px] italic text-neutral-500">
          No chords yet — add chord placements on phrase lines below and they'll appear here as bars.
        </p>
      </div>
    );
  }

  const rows: Bar[][] = [];
  for (let i = 0; i < bars.length; i += BARS_PER_ROW) {
    rows.push(bars.slice(i, i + BARS_PER_ROW));
  }

  const handleCellClick = onChordBeatsChange
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

  const handleDragEnd = onChordReorder
    ? async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const fromIndex = placementIds.indexOf(String(active.id));
        const toIndex = placementIds.indexOf(String(over.id));
        if (fromIndex < 0 || toIndex < 0) return;
        // Close any open editor before reordering so the popover
        // doesn't briefly anchor to a stale slot.
        setEditing(null);
        await onChordReorder(fromIndex, toIndex);
      }
    : undefined;

  const gridBody = (
    <div className="mt-2 space-y-2">
      {rows.map((row, rowIdx) => (
        <div
          key={rowIdx}
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
              draggable={Boolean(onChordReorder)}
            />
          ))}
          {row.length < BARS_PER_ROW &&
            Array.from({ length: BARS_PER_ROW - row.length }).map((_, i) => (
              <div key={`pad-${i}`} aria-hidden />
            ))}
        </div>
      ))}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50/40 dark:bg-neutral-900/40"
    >
      <BarGridHeader timeSignature={timeSignature} barCount={bars.length} />
      {handleDragEnd ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={placementIds}>{gridBody}</SortableContext>
        </DndContext>
      ) : (
        gridBody
      )}
    </div>
  );
}

function cellKey(cell: BarCell): string {
  return `${cell.phraseId}:${cell.beatId}`;
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

function BarBox({
  bar,
  beatsPerBar,
  sectionKey,
  notationMode,
  editing,
  onCellClick,
  onBeatsChange,
  draggable,
}: {
  bar: Bar;
  beatsPerBar: number;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  editing: EditingState | null;
  onCellClick?: (cell: BarCell, barIndex: number) => void;
  onBeatsChange?: (cell: BarCell, beats: number) => void | Promise<void>;
  draggable: boolean;
}) {
  const filledBeats = bar.cells.reduce((sum, c) => sum + c.beats, 0);
  const emptyBeats = Math.max(0, beatsPerBar - filledBeats);

  // The cell whose popover should anchor under this bar (if any).
  const editingCellInThisBar =
    editing && editing.barIndex === bar.index
      ? bar.cells.find(
          c =>
            c.phraseId === editing.phraseId &&
            c.beatId === editing.beatId,
        ) ?? null
      : null;

  return (
    <div className="relative rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1 pt-3 pb-1 min-h-[44px]">
      <span className="absolute top-0.5 left-1 text-[9px] text-neutral-400 font-mono">
        {bar.index + 1}
      </span>
      {/* Inner flex row holds the chord cells. Cells have a min width
          so chord glyphs like `1dom9(13)` aren't truncated on narrow
          1-beat slots; when their natural sum exceeds the bar's
          column width, the row scrolls horizontally within the bar
          rather than overlapping into the next bar's column. */}
      <div className="flex items-stretch gap-0.5 h-full overflow-x-auto">
        {bar.cells.map((cell, idx) => {
          const widthPct = (cell.beats / beatsPerBar) * 100;
          const isEditing =
            editing !== null &&
            editing.phraseId === cell.phraseId &&
            editing.beatId === cell.beatId;
          // Only the leading half of a tie-split is interactive; the
          // trailing half renders as a decorative continuation.
          const isLeadingHalf = !cell.tiedFromPrev;
          if (isLeadingHalf && draggable) {
            return (
              <SortableChordCell
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
      {editingCellInThisBar && onBeatsChange && (
        <BeatCountPopover
          cell={editingCellInThisBar}
          beatsPerBar={beatsPerBar}
          sectionKey={sectionKey}
          notationMode={notationMode}
          onBeatsChange={onBeatsChange}
        />
      )}
    </div>
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
    useSortable({ id: cellKey(cell) });
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
}) {
  const text = chordToDisplay(cell.chord, notationMode, sectionKey);
  const palette = colorForFunction(cell.chord);
  const roundedLeft = !cell.tiedFromPrev;
  const roundedRight = !cell.tiedToNext;
  const radiusClass = [
    roundedLeft ? 'rounded-l-sm' : '',
    roundedRight ? 'rounded-r-sm' : '',
  ].join(' ');

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
      className={`flex flex-col items-center justify-between py-0.5 px-0.5 border ${palette.border} ${palette.bg} ${radiusClass} overflow-hidden touch-none min-w-[72px] shrink-0 ${
        interactive ? 'cursor-pointer hover:brightness-105' : ''
      } ${isEditing ? 'ring-2 ring-fluent ring-offset-1 ring-offset-white dark:ring-offset-neutral-900' : ''}`}
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

function BeatCountPopover({
  cell,
  beatsPerBar,
  sectionKey,
  notationMode,
  onBeatsChange,
}: {
  cell: BarCell;
  beatsPerBar: number;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  onBeatsChange: (cell: BarCell, beats: number) => void | Promise<void>;
}) {
  const chordBeats = cell.chord.beats ?? 1;
  const canDec = chordBeats > 1;
  const canInc = chordBeats < beatsPerBar;
  const text = chordToDisplay(cell.chord, notationMode, sectionKey);
  const stepBy = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    void onBeatsChange(cell, chordBeats + delta);
  };
  return (
    <div
      // Popover anchored below the bar. z-index keeps it above the
      // next row of bars; pointer-events-auto so click-throughs work
      // while the parent grid uses pointer-events normally.
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-20 flex items-center gap-2 px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-md"
      onClick={e => e.stopPropagation()}
    >
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
  );
}

// Scale-degree color families. Per LEAD_SHEET_REDESIGN.md:
//   1, 4         → teal
//   2, 5         → purple
//   3, 6         → amber
//   7 / altered  → coral (rose family in Tailwind)
//
// "Altered" = any function carrying a leading b/# accidental.
function colorForFunction(chord: ChordFunction): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  if (chord.unparsed || chord.function === '') {
    return {
      bg: 'bg-neutral-100 dark:bg-neutral-800/60',
      text: 'text-neutral-700 dark:text-neutral-200',
      border: 'border-neutral-300/60 dark:border-neutral-700/60',
      dot: 'text-neutral-400',
    };
  }
  const fn = chord.function;
  const isAltered = fn.startsWith('b') || fn.startsWith('#');
  const digit = fn.replace(/^[b#]/, '');
  if (isAltered || digit === '7') {
    return {
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-700 dark:text-rose-200',
      border: 'border-rose-300/60 dark:border-rose-800/60',
      dot: 'text-rose-400',
    };
  }
  if (digit === '1' || digit === '4') {
    return {
      bg: 'bg-teal-50 dark:bg-teal-950/40',
      text: 'text-teal-700 dark:text-teal-200',
      border: 'border-teal-300/60 dark:border-teal-800/60',
      dot: 'text-teal-400',
    };
  }
  if (digit === '2' || digit === '5') {
    return {
      bg: 'bg-purple-50 dark:bg-purple-950/40',
      text: 'text-purple-700 dark:text-purple-200',
      border: 'border-purple-300/60 dark:border-purple-800/60',
      dot: 'text-purple-400',
    };
  }
  if (digit === '3' || digit === '6') {
    return {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-200',
      border: 'border-amber-300/60 dark:border-amber-800/60',
      dot: 'text-amber-400',
    };
  }
  return {
    bg: 'bg-neutral-100 dark:bg-neutral-800/60',
    text: 'text-neutral-700 dark:text-neutral-200',
    border: 'border-neutral-300/60 dark:border-neutral-700/60',
    dot: 'text-neutral-400',
  };
}
