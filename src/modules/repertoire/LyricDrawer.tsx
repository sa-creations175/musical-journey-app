import { useEffect, useState } from 'react';
import type { SongLyricLine } from '../../lib/db';
import { lineStatus } from './lyricSyllables';
import { measureSafeArea } from './leadSheetOverlay';
import LyricListRow from './LyricListRow';
import LyricPasteBox from './LyricPasteBox';

/** Breathing room between the drawer and whatever it docks above, so
 *  the inset edges read as floating rather than as a seam. */
const DRAWER_GAP = 8;

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
  onArmWord,
  onAddLines,
  onSetLineKind,
  onDuplicateLine,
  onLineDelete,
  onLineUnplace,
}: {
  lines: SongLyricLine[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tapping a fully UNPLACED lyric row arms the two-part line
   *  gesture. The caller collapses the drawer and hands off to the
   *  anchored prompt. */
  onArmLine: (lineId: string) => void;
  /** Tapping a word in pick mode arms that one syllable. Same existing
   *  arming intent a grid chip tap produces. */
  onArmWord?: (syllableId: string) => void;
  /** Raw pasted text. Parsed once, by the caller, at the write. */
  onAddLines?: (text: string) => void | Promise<void>;
  /** Correct a parser guess: flip a row between header and lyric. */
  onSetLineKind?: (lineId: string, kind: 'lyric' | 'header') => void | Promise<void>;
  /** Insert an independent copy of a line below it, for repeats. */
  onDuplicateLine?: (lineId: string) => void | Promise<void>;
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
  // Which row's "…" menu is open. One at a time.
  const [menuLineId, setMenuLineId] = useState<string | null>(null);
  // Which row is PICKING a word. Drawer UI state, deliberately not an
  // arming kind: pick mode does not change what a beat-cell tap does.
  // Only once a word is tapped is anything armed, and that is the
  // existing `{ kind: 'syllable' }` intent, unchanged.
  const [pickLineId, setPickLineId] = useState<string | null>(null);
  const [dockOffset, setDockOffset] = useState(0);
  useEffect(() => {
    const measure = () =>
      setDockOffset(
        measureSafeArea({
          // Excludes BOTH drawers: itself for the circularity, and the
          // progressions drawer because they are mutually exclusive —
          // a collapsed sibling must not push this one up.
          exclude: '[data-lyric-drawer], [data-progression-drawer]',
        }).bottom,
      );
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
      style={{ bottom: dockOffset + DRAWER_GAP }}
      /* INSET and rounded, not full-bleed. Edge-to-edge with a top
         border read as browser chrome — a status bar the app happened
         to have — rather than as part of the page. Floating it off the
         edges with a shadow says "control", which is what it is.
         z-40: above the grid, below the cell-anchored overlays at
         180/190 so the prompt is never behind the drawer. */
      /* FILLED, because white-on-white made it read as page
         background — it measured 1.00:1 against the page behind it,
         invisible by construction rather than by degree, which is
         exactly the "kept losing track of it" report.
         THE FILL IS NEUTRAL, NOT THE MODULE ACCENT. The strip reports
         a SUCCESS state ("9 of 9 lines placed"), and pink reads as a
         warning there however far its saturation sits from the alert
         reds — the hue was making a claim about state that the strip
         does not mean. Indigo was considered and rejected: it is
         spoken for by transient placement feedback on armed cells,
         and reusing it would make "this cell is armed" and "this is
         the lyric drawer" visually indistinguishable.
         THE ACCENT SURVIVES AS THE EDGE, which is what separates the
         strip from the page and keeps the module's identity on it.
         Findability does not regress — it improves slightly: the
         neutral fill measures 1.32:1 against the white page where the
         accent fill measured 1.31:1, and 1.55:1 vs 1.52:1 in dark.
         Surface, not type: the button below keeps SectionToggle's
         stone/fluent idiom, so the strip stays in the collapsible-
         header family. Being hard to see was a SURFACE problem. */
      className="fixed inset-x-3 z-40 rounded-xl border border-repertoire-200 dark:border-repertoire-600 bg-chrome-50 dark:bg-chrome-800 shadow-[0_2px_16px_rgba(0,0,0,0.16)] overflow-hidden"
    >
      {/* Label and count GROUPED, not pushed to opposite ends — at
          arm's length a label on the left and a number on the right
          read as two unrelated things. Type follows SectionToggle so
          the strip belongs to the same family as every other
          collapsible header on the lead sheet: same uppercase idiom,
          same ▸/▾ scheme, same stone resting colour, fluent on hover. */}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        /* One stone step darker than SectionToggle's resting colour,
           because the surface underneath it moved. The RAISED step is
           kept across the move to a neutral fill, and it still leaves
           the label more legible than it was before the strip was
           coloured at all: 4.80:1 on the old white → 5.80:1 on this
           surface, and 7.85:1 → 8.58:1 in dark. (It was 5.84:1 /
           8.77:1 on the accent fill — the fill moved, the step did
           not.) Same token family, same idiom; only the surface
           underneath it changed. */
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-stone-600 dark:text-stone-300 hover:text-fluent"
      >
        <span aria-hidden className="text-[9px] leading-none">
          {open ? '▾' : '▸'}
        </span>
        lyrics
        {/* ONE overall line count here; each row carries its own word
            count. Two numbers doing two different jobs. */}
        <span className="font-normal normal-case tracking-normal text-neutral-500 dark:text-neutral-400">
          {lyricLines.length === 0
            ? '· none yet'
            : `· ${placedLines} of ${lyricLines.length} lines placed`}
        </span>
      </button>

      {open && (
        <div
          /* THE BODY IS CONTENT, NOT CHROME, so it keeps the plain
             reading surface. The tint identifies the strip — which is
             the whole control when collapsed, and that is where it was
             getting lost — while half a viewport of lyrics stays on
             the surface lyrics are meant to be read on. The accent
             rule is what separates the two. */
          className="overflow-y-auto px-3 pb-3 pt-2 flex flex-col gap-1 border-t border-repertoire-200 dark:border-repertoire-600 bg-white dark:bg-neutral-900"
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
              <LyricListRow
                key={line.id}
                line={line}
                onArm={onArmLine}
                onSetLineKind={onSetLineKind}
                onDuplicate={onDuplicateLine}
                onArmWord={onArmWord}
                picking={pickLineId === line.id}
                onPickingChange={pick =>
                  setPickLineId(pick ? line.id : null)
                }
                menuOpen={menuLineId === line.id}
                onMenuOpenChange={openNow =>
                  setMenuLineId(openNow ? line.id : null)
                }
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
