import { useEffect, useState } from 'react';
import type { SongLyricLine } from '../../lib/db';
import { lineStatus } from './lyricSyllables';
import { measureSafeArea } from './leadSheetOverlay';
import LyricLineRow from './LyricLineRow';
import LyricPasteBox from './LyricPasteBox';

/**
 * The song's lyrics, docked at the bottom of the lead sheet.
 *
 * WHY THIS ONE BELONGS AT THE BOTTOM, when two other things were moved
 * away from there today: the drawer is genuinely whole-screen chrome,
 * like a nav bar. It is about the song, not about any cell. The plan
 * doc's principle — feedback about a specific cell anchors to that
 * cell, the bottom is reserved for things about the whole screen — is
 * what puts the refusal message and the placement prompt at their
 * cells and puts this here.
 *
 * **It builds no arming UI of its own.** Tapping a line arms it and
 * collapses the drawer; the existing anchored prompt takes over from
 * there. An earlier spec had the drawer stay slim showing the armed
 * line and a cancel — that was the same mistake, and it is cut.
 *
 * Song-level by design: one list, all lines in song order, no section
 * awareness and no auto-scroll. You scroll where you want and tap; the
 * monotonic guard refuses anything out of order.
 */
export default function LyricDrawer({
  lines,
  open,
  onOpenChange,
  onArmLine,
  onAddLines,
  onLineDelete,
  onLineUnplace,
}: {
  lines: SongLyricLine[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tapping a lyric row arms its placement. The caller collapses the
   *  drawer and hands off to the anchored prompt. */
  onArmLine: (lineId: string) => void;
  /** Raw pasted text. Parsed once, by the caller, at the write. */
  onAddLines?: (text: string) => void | Promise<void>;
  onLineDelete?: (lineId: string) => void;
  onLineUnplace?: (lineId: string) => void | Promise<void>;
}) {
  // Dock above whatever bottom chrome already exists — MobileBottomNav
  // below the md breakpoint, nothing above it. Measured, not assumed:
  // the nav's height moves with `env(safe-area-inset-bottom)` and it is
  // `display: none` on desktop.
  //
  // EXCLUDING ITSELF is load-bearing. This drawer marks itself as
  // bottom chrome so the cell-anchored overlays stay clear of it — so
  // measuring "bottom chrome" without the exclusion would measure the
  // drawer and push it up by its own height, every frame.
  const [dockOffset, setDockOffset] = useState(0);
  useEffect(() => {
    const measure = () =>
      setDockOffset(measureSafeArea({ exclude: '[data-lyric-drawer]' }).bottom);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  const lyricLines = lines.filter(l => l.kind === 'lyric');
  const placedLines = lyricLines.filter(
    l => lineStatus(l).status === 'placed',
  ).length;

  return (
    <div
      /* Bottom chrome, so the anchored overlays inset past it — and
         when the drawer is OPEN at half height they inset past all of
         it, which is right: the prompt belongs in the part of the grid
         still visible. Measured rather than declared, so slim and open
         need no special-casing. */
      data-app-chrome="bottom"
      data-lyric-drawer=""
      style={{ bottom: dockOffset }}
      /* Above the grid, below the cell-anchored overlays at 180/190 so
         the prompt is never behind the drawer. */
      className="fixed inset-x-0 z-40 border-t border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-[0_-2px_12px_rgba(0,0,0,0.12)]"
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-stone-500 dark:text-stone-400 hover:text-fluent"
      >
        <span aria-hidden className="text-[9px] leading-none">
          {open ? '▾' : '▸'}
        </span>
        lyrics
        {/* ONE overall line count here; each row carries its own word
            count. Two numbers doing two different jobs. */}
        <span className="ml-auto font-normal normal-case tracking-normal text-neutral-500 dark:text-neutral-400">
          {lyricLines.length === 0
            ? 'none yet'
            : `${placedLines} of ${lyricLines.length} lines placed`}
        </span>
      </button>

      {open && (
        <div
          className="overflow-y-auto px-3 pb-3 flex flex-col gap-1"
          style={{ maxHeight: '50vh' }}
        >
          {onAddLines && (
            <div className="pb-1">
              <LyricPasteBox onCommit={onAddLines} />
            </div>
          )}
          {lyricLines.length === 0 ? (
            <p className="text-[11px] text-neutral-500 italic py-2">
              no lyrics yet.
            </p>
          ) : (
            // EVERY line, in song order, placed ones dimmed — the
            // drawer doubles as the readable lyric sheet, so hiding
            // finished lines would break the read. The per-section tray
            // filters instead; same row, different caller.
            lines.map(line => (
              <LyricLineRow
                key={line.id}
                line={line}
                dimPlaced
                bodyProps={{
                  onClick: () => onArmLine(line.id),
                  role: 'button',
                  'aria-label': `place "${line.text}"`,
                }}
                bodyClassName="cursor-pointer hover:border-fluent"
                onDelete={onLineDelete}
                onUnplace={onLineUnplace}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
