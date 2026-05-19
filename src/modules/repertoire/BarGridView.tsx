import { useEffect, useMemo, useRef, useState } from 'react';
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

// Read-only bar-grid renderer (Lead Sheet Redesign step 2, May 2026 —
// docs/LEAD_SHEET_REDESIGN.md). Renders the section's chord placements
// for the active arrangement as a measure grid: fixed-width bars, four
// per row, with chord boxes proportional to their beat counts. Color
// coded by scale-degree family so patterns become visually recognisable
// across songs.
//
// Currently chord cells default to 1 beat each (existing data has no
// beats field yet) — step 3 introduces in-place beat-count editing so
// the proportional layout becomes meaningful per-song.

const BARS_PER_ROW = 4;

interface Props {
  song: Song;
  section: SongSection;
  activeArrangementId: string;
  /** When supplied, chord cells become tappable: clicking a cell opens
   *  an inline `−` / `+` editor that persists the new beat count via
   *  this callback. When omitted, the view stays read-only. */
  onChordBeatsChange?: (
    phraseId: string,
    beatId: string,
    beats: number,
  ) => Promise<void> | void;
}

export default function BarGridView({
  song,
  section,
  activeArrangementId,
  onChordBeatsChange,
}: Props) {
  const [notationMode] = useNotationMode();
  const timeSignature = effectiveTimeSignature(song, section);
  const { beatsPerBar } = parseTimeSignature(timeSignature);

  const bars = useMemo(
    () => deriveBarGrid(section, activeArrangementId, beatsPerBar),
    [section, activeArrangementId, beatsPerBar],
  );

  // Inline editor identity = `${phraseId}:${beatId}`. Null = no editor
  // open. Stored as a flat string so the two visible halves of a
  // tie-split cell share one editor automatically.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the editor on any mousedown outside this grid. Listening on
  // `mousedown` (not click) so the editor closes before any other
  // click-handler runs — matches the rest of the app's popover pattern.
  useEffect(() => {
    if (!editingKey) return;
    const onDown = (e: MouseEvent) => {
      const node = containerRef.current;
      if (!node) return;
      if (e.target instanceof Node && node.contains(e.target)) return;
      setEditingKey(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editingKey]);

  // If the section / arrangement re-renders into a new chord layout
  // that no longer contains the editing target, drop the editor.
  useEffect(() => {
    if (!editingKey) return;
    const stillVisible = bars.some(bar =>
      bar.cells.some(c => cellKey(c) === editingKey),
    );
    if (!stillVisible) setEditingKey(null);
  }, [bars, editingKey]);

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

  // Group bars into rows of BARS_PER_ROW so each row wraps cleanly
  // (CSS grid would also work; explicit rows keep bar numbering and
  // future per-row affordances simple).
  const rows: Bar[][] = [];
  for (let i = 0; i < bars.length; i += BARS_PER_ROW) {
    rows.push(bars.slice(i, i + BARS_PER_ROW));
  }

  const handleCellClick = onChordBeatsChange
    ? (cell: BarCell) => {
        const key = cellKey(cell);
        setEditingKey(prev => (prev === key ? null : key));
      }
    : undefined;

  const handleBeatsChange = onChordBeatsChange
    ? async (cell: BarCell, nextBeats: number) => {
        const clamped = Math.min(Math.max(1, Math.round(nextBeats)), beatsPerBar);
        if (clamped === (cell.chord.beats ?? 1)) return;
        await onChordBeatsChange(cell.phraseId, cell.beatId, clamped);
      }
    : undefined;

  return (
    <div
      ref={containerRef}
      className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50/40 dark:bg-neutral-900/40"
    >
      <BarGridHeader timeSignature={timeSignature} barCount={bars.length} />
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
                editingKey={editingKey}
                onCellClick={handleCellClick}
                onBeatsChange={handleBeatsChange}
              />
            ))}
            {/* Pad the final row with empty cells so bar widths stay
                consistent regardless of how many fit on the last row. */}
            {row.length < BARS_PER_ROW &&
              Array.from({ length: BARS_PER_ROW - row.length }).map((_, i) => (
                <div key={`pad-${i}`} aria-hidden />
              ))}
          </div>
        ))}
      </div>
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
  editingKey,
  onCellClick,
  onBeatsChange,
}: {
  bar: Bar;
  beatsPerBar: number;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  editingKey: string | null;
  onCellClick?: (cell: BarCell) => void;
  onBeatsChange?: (cell: BarCell, beats: number) => void | Promise<void>;
}) {
  // Empty trailing space in a partial bar — render as a flex spacer
  // so chord widths inside still scale to fractions of `beatsPerBar`.
  const filledBeats = bar.cells.reduce((sum, c) => sum + c.beats, 0);
  const emptyBeats = Math.max(0, beatsPerBar - filledBeats);

  return (
    <div className="relative rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1 pt-3 pb-1 min-h-[44px]">
      <span className="absolute top-0.5 left-1 text-[9px] text-neutral-400 font-mono">
        {bar.index + 1}
      </span>
      <div className="flex items-stretch gap-0.5 h-full">
        {bar.cells.map((cell, idx) => (
          <ChordCellBox
            key={idx}
            cell={cell}
            widthPct={(cell.beats / beatsPerBar) * 100}
            sectionKey={sectionKey}
            notationMode={notationMode}
            beatsPerBar={beatsPerBar}
            isEditing={editingKey === cellKey(cell)}
            onClick={onCellClick}
            onBeatsChange={onBeatsChange}
          />
        ))}
        {emptyBeats > 0 && (
          <div
            className="rounded border border-dashed border-neutral-200 dark:border-neutral-800"
            style={{ width: `${(emptyBeats / beatsPerBar) * 100}%` }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

function ChordCellBox({
  cell,
  widthPct,
  sectionKey,
  notationMode,
  beatsPerBar,
  isEditing,
  onClick,
  onBeatsChange,
}: {
  cell: BarCell;
  widthPct: number;
  sectionKey: string | undefined;
  notationMode: ReturnType<typeof useNotationMode>[0];
  beatsPerBar: number;
  isEditing: boolean;
  onClick?: (cell: BarCell) => void;
  onBeatsChange?: (cell: BarCell, beats: number) => void | Promise<void>;
}) {
  const text = chordToDisplay(cell.chord, notationMode, sectionKey);
  const palette = colorForFunction(cell.chord);
  // Tie markers: rounded only on the outside edges of a multi-bar
  // chord so visually it reads as one continuous box across bars.
  const roundedLeft = !cell.tiedFromPrev;
  const roundedRight = !cell.tiedToNext;
  const radiusClass = [
    roundedLeft ? 'rounded-l-sm' : '',
    roundedRight ? 'rounded-r-sm' : '',
  ].join(' ');

  const interactive = Boolean(onClick);
  // Authoritative beats count comes from the underlying chord, not
  // from the (possibly tie-split) cell.beats, so the editor reflects
  // and writes the chord's total span.
  const chordBeats = cell.chord.beats ?? 1;
  const canDec = chordBeats > 1;
  const canInc = chordBeats < beatsPerBar;

  const handleClick = (e: React.MouseEvent) => {
    if (!onClick) return;
    e.stopPropagation();
    onClick(cell);
  };

  const stepBy = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onBeatsChange) return;
    void onBeatsChange(cell, chordBeats + delta);
  };

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? handleClick : undefined}
      className={`flex flex-col items-center justify-between py-0.5 px-0.5 border ${palette.border} ${palette.bg} ${radiusClass} overflow-hidden ${
        interactive ? 'cursor-pointer hover:brightness-105' : ''
      } ${isEditing ? 'ring-1 ring-fluent ring-offset-1 ring-offset-white dark:ring-offset-neutral-900' : ''}`}
      style={{ width: `${widthPct}%` }}
      title={cell.chord.raw ?? text}
    >
      <div className={`text-[11px] leading-tight font-semibold ${palette.text} truncate w-full text-center`}>
        {text ? <ChordGlyph text={text} /> : <span className="opacity-40">—</span>}
      </div>
      {isEditing && onBeatsChange ? (
        <div
          className={`flex items-center justify-center gap-1 text-[10px] ${palette.text}`}
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={stepBy(-1)}
            disabled={!canDec}
            className="px-1 leading-none rounded border border-current/30 hover:bg-white/50 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="decrease beat count"
          >
            −
          </button>
          <span className="font-mono tabular-nums min-w-[1ch] text-center">
            {chordBeats}
          </span>
          <button
            type="button"
            onClick={stepBy(1)}
            disabled={!canInc}
            className="px-1 leading-none rounded border border-current/30 hover:bg-white/50 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="increase beat count"
          >
            +
          </button>
        </div>
      ) : (
        <div className={`flex items-center justify-center gap-0.5 text-[8px] ${palette.dot}`}>
          {Array.from({ length: cell.beats }).map((_, i) => (
            <span key={i} aria-hidden>·</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Scale-degree color families. Per LEAD_SHEET_REDESIGN.md:
//   1, 4         → teal
//   2, 5         → purple
//   3, 6         → amber
//   7 / altered  → coral (rose family in Tailwind)
//
// "Altered" = any function carrying a leading b/# accidental (b2, b3,
// #4, b6, b7). Unparsed placements get a neutral fallback.
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
  // Fallback for any unrecognised function token (shouldn't happen
  // for parsed chords but keeps the renderer total).
  return {
    bg: 'bg-neutral-100 dark:bg-neutral-800/60',
    text: 'text-neutral-700 dark:text-neutral-200',
    border: 'border-neutral-300/60 dark:border-neutral-700/60',
    dot: 'text-neutral-400',
  };
}
