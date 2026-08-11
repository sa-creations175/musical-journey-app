import { useEffect, useState } from 'react';
import type { SongLyricLine } from '../../lib/db';
import { canConvertToHeader, lineStatus } from './lyricSyllables';
import { useLongPress } from '../../lib/useLongPress';
import { measureSafeArea } from './leadSheetOverlay';
import LyricLineRow from './LyricLineRow';
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
      style={{ bottom: dockOffset + DRAWER_GAP }}
      /* INSET and rounded, not full-bleed. Edge-to-edge with a top
         border read as browser chrome — a status bar the app happened
         to have — rather than as part of the page. Floating it off the
         edges with a shadow says "control", which is what it is.
         z-40: above the grid, below the cell-anchored overlays at
         180/190 so the prompt is never behind the drawer. */
      className="fixed inset-x-3 z-40 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-[0_2px_16px_rgba(0,0,0,0.16)] overflow-hidden"
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
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-stone-500 dark:text-stone-400 hover:text-fluent"
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
              <DrawerRow
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

/**
 * One drawer row plus its correction menu.
 *
 * The parser guesses which pasted lines are headers and will sometimes
 * be wrong in both directions, so the correction has to be reachable —
 * and reachable the way the syllable popover is: a visible "…"
 * control, with long-press as a shortcut for anyone who knows it.
 * Long-press ALONE was rejected there for the same reason it would be
 * wrong here — an invisible affordance is not an affordance.
 */
function DrawerRow({
  line,
  onArm,
  onArmWord,
  picking,
  onPickingChange,
  onSetLineKind,
  onDuplicate,
  menuOpen,
  onMenuOpenChange,
  onDelete,
  onUnplace,
}: {
  line: SongLyricLine;
  onArm: (lineId: string) => void;
  onArmWord?: (syllableId: string) => void;
  picking: boolean;
  onPickingChange: (picking: boolean) => void;
  onSetLineKind?: (lineId: string, kind: 'lyric' | 'header') => void | Promise<void>;
  onDuplicate?: (lineId: string) => void | Promise<void>;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onDelete?: (lineId: string) => void;
  onUnplace?: (lineId: string) => void | Promise<void>;
}) {
  const isHeader = line.kind === 'header';
  const placedWords = lineStatus(line).placed;
  const hasMenu = Boolean(onSetLineKind || onDuplicate);
  const longPress = useLongPress(() => onMenuOpenChange(true), {
    enabled: hasMenu,
  });
  // Asked of the model rather than re-derived here, so the reason shown
  // and the rule enforced on write are the same rule.
  const convertible = canConvertToHeader(line);

  // WHAT A ROW TAP DOES, by how much of it is already down:
  //
  //   unplaced  → the two-part line gesture, unchanged
  //   partial   → PICK MODE. The gesture fixed initial placement but
  //               not repair: un-place one word of a finished line and
  //               it exists only in the drawer, where nothing could
  //               place it. Tap-to-place needs a chip on the grid.
  //   placed    → pick mode too, every word in "move it?" state. Also
  //               replaces re-arming the line's head, which is almost
  //               never wanted on a finished line.
  //   header    → nothing; the row body takes no handlers.
  const status = lineStatus(line).status;
  const picksWords = status === 'partial' || status === 'placed';

  const [moveWordId, setMoveWordId] = useState<string | null>(null);

  const handleWordTap = (syllableId: string) => {
    const word = (line.syllables ?? []).find(s => s.id === syllableId);
    if (!word) return;
    if (word.anchor) {
      // Already down. Offer the move rather than refusing — but say so
      // first, since tapping a placed word is as likely to be a misfire
      // as an intent.
      setMoveWordId(syllableId);
      return;
    }
    onArmWord?.(syllableId);
  };

  return (
    <div className="relative">
      <LyricLineRow
        line={line}
        dimPlaced={!picking}
        pickMode={picking}
        onWordTap={onArmWord ? handleWordTap : undefined}
        bodyProps={{
          onClick: () => {
            if (menuOpen) {
              onMenuOpenChange(false);
              return;
            }
            if (picksWords && onArmWord) {
              onPickingChange(!picking);
              setMoveWordId(null);
              return;
            }
            onArm(line.id);
          },
          role: 'button',
          'aria-label': picksWords
            ? `choose a word from "${line.text}"`
            : `place "${line.text}"`,
          onPointerDown: longPress.onPointerDown,
          onPointerMove: longPress.onPointerMove,
          onPointerUp: longPress.onPointerUp,
          onPointerCancel: longPress.onPointerCancel,
          onPointerLeave: longPress.onPointerLeave,
        }}
        bodyClassName={`cursor-pointer hover:border-fluent ${
          picking ? 'border-fluent' : ''
        }`}
        onDelete={onDelete}
        onUnplace={onUnplace}
      />
      {moveWordId && (
        <div className="mt-1 mb-1 flex flex-wrap items-center gap-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 text-[11px] shadow-md">
          <span className="text-neutral-600 dark:text-neutral-300">
            “{(line.syllables ?? []).find(s => s.id === moveWordId)?.text}” is
            already placed.
          </span>
          <button
            type="button"
            onClick={() => {
              // Arming writes NOTHING — re-placing is a single anchor
              // overwrite — so backing out needs no snapshot to undo.
              const id = moveWordId;
              setMoveWordId(null);
              onArmWord?.(id);
            }}
            className="px-2 py-0.5 rounded-full border border-fluent/40 text-fluent hover:bg-fluent/10"
          >
            move it
          </button>
          <button
            type="button"
            onClick={() => setMoveWordId(null)}
            className="px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent"
          >
            cancel
          </button>
        </div>
      )}
      {hasMenu && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onMenuOpenChange(!menuOpen);
          }}
          aria-label={`row options for "${line.text}"`}
          aria-expanded={menuOpen}
          className="absolute right-14 top-1/2 -translate-y-1/2 px-1 text-neutral-400 hover:text-fluent text-xs leading-none"
        >
          …
        </button>
      )}
      {menuOpen && hasMenu && (
        <div className="mt-1 mb-1 flex flex-wrap items-center gap-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 text-[11px] shadow-md">
          {/* Both paths, deliberately: the menu is the DISCOVERABLE one
              and the row's ⤺ is the FAST one — same pairing as "…"
              alongside long-press on a syllable. Both call the same
              un-place path. */}
          {onUnplace && placedWords > 0 && (
            <button
              type="button"
              onClick={() => {
                void onUnplace(line.id);
                onMenuOpenChange(false);
              }}
              className="px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent"
            >
              un-place full line
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              onClick={() => {
                void onDuplicate(line.id);
                onMenuOpenChange(false);
              }}
              title="insert an independent copy below — for a repeated refrain"
              className="px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent"
            >
              duplicate
            </button>
          )}
          {!onSetLineKind ? null : isHeader ? (
            <button
              type="button"
              onClick={() => {
                void onSetLineKind(line.id, 'lyric');
                onMenuOpenChange(false);
              }}
              className="px-2 py-0.5 rounded-full border border-fluent/40 text-fluent hover:bg-fluent/10"
            >
              make lyric line
            </button>
          ) : convertible ? (
            <button
              type="button"
              onClick={() => {
                void onSetLineKind(line.id, 'header');
                onMenuOpenChange(false);
              }}
              className="px-2 py-0.5 rounded-full border border-fluent/40 text-fluent hover:bg-fluent/10"
            >
              make header
            </button>
          ) : (
            // Explained rather than offered-and-refused: converting
            // discards the line's words, and some of them are placed.
            <span className="text-neutral-500">
              can&apos;t make this a header — un-place its words first.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
