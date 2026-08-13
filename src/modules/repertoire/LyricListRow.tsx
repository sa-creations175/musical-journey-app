import { useState, type ReactNode } from 'react';
import type { SongLyricLine } from '../../lib/db';
import { canConvertToHeader, lineStatus } from './lyricSyllables';
import { useLongPress } from '../../lib/useLongPress';
import LyricLineRow from './LyricLineRow';

/**
 * A lyric line with all its BEHAVIOUR — tap routing, pick mode, the
 * move flow, and the "…" correction menu.
 *
 * Shared by the song-level drawer and the per-section tray, which must
 * behave identically: the same line offering different actions
 * depending on which list you happen to be looking at is a rule the
 * user has to remember. The tray adds DRAG on top rather than instead.
 *
 * `LyricLineRow` remains the presentational half. The split is worth
 * keeping straight: that one owns how a line LOOKS, this one owns what
 * a tap DOES.
 *
 * ON THE FIVE RENDERINGS — tray at rest, tray picking, drawer at rest,
 * drawer picking, and the dimmed placed group — none of them is a
 * "mode" either component branches on. They are combinations of two
 * orthogonal booleans (`picking`, `dimPlaced`) plus an optional drag
 * handle. Nothing here asks "am I in the tray", and nothing should: a
 * `variant: 'tray' | 'drawer'` prop is exactly how five renderings
 * would become five code paths.
 */
export default function LyricListRow({

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
  drag,
  dimPlaced = true,
}: {
  line: SongLyricLine;
  /** Absent means the two-part line gesture is unavailable, so a
   *  fully-unplaced row simply does nothing. */
  onArm?: (lineId: string) => void;
  onArmWord?: (syllableId: string) => void;
  picking: boolean;
  onPickingChange: (picking: boolean) => void;
  onSetLineKind?: (lineId: string, kind: 'lyric' | 'header') => void | Promise<void>;
  onDuplicate?: (lineId: string) => void | Promise<void>;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onDelete?: (lineId: string) => void;
  onUnplace?: (lineId: string) => void | Promise<void>;
  /** Supplied by the tray, absent in the drawer. The row stays
   *  tappable either way — drag is additive. */
  drag?: {
    setNodeRef: (node: HTMLElement | null) => void;
    attributes: Record<string, unknown>;
    listeners?: Record<string, unknown>;
    isDragging: boolean;
    handle?: ReactNode;
  };
  dimPlaced?: boolean;
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

  const dragPointerDown = drag?.listeners?.onPointerDown as
    | ((e: React.PointerEvent<HTMLElement>) => void)
    | undefined;

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
        dimPlaced={dimPlaced && !picking}
        pickMode={picking}
        onWordTap={onArmWord ? handleWordTap : undefined}
        handle={drag?.handle}
        bodyRef={drag?.setNodeRef}
        bodyStyle={drag ? { opacity: drag.isDragging ? 0.3 : 1 } : undefined}
        /* A HEADER GETS THE DRAG WIRING AND NOTHING ELSE. It has no
           syllables, so arming it is meaningless and long-press-for-
           menu is reachable from the row's own button — but it must be
           draggable, because a header created by the paste box lands
           at the bottom of the list and moving it is the whole point.
           Suppressing the arming props HERE rather than inside
           LyricLineRow keeps the decision with the component that
           knows what a row is for. */
        bodyProps={
          isHeader
            ? {
                ...(drag?.attributes as Record<string, never> | undefined),
                ...(drag?.listeners as Record<string, never> | undefined),
              }
            : {
          ...(drag?.attributes as Record<string, never> | undefined),
          ...(drag?.listeners as Record<string, never> | undefined),
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
            onArm?.(line.id);
          },
          role: 'button',
          'aria-label': picksWords
            ? `choose a word from "${line.text}"`
            : `place "${line.text}"`,
          // COMPOSED, never spread over. dnd-kit's listeners and the
          // long-press hook both attach to onPointerDown, so spreading
          // one after the other silently drops whichever came first —
          // the same collision solved on SyllableChip, solved the same
          // way. dnd-kit runs first so its 5px activation is preserved;
          // a bare tap moves less than that, so onClick still fires and
          // tap and drag coexist on one element.
          onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
            dragPointerDown?.(e);
            longPress.onPointerDown(e);
          },
          onPointerMove: longPress.onPointerMove,
          onPointerUp: longPress.onPointerUp,
          onPointerCancel: longPress.onPointerCancel,
          onPointerLeave: longPress.onPointerLeave,
              }
        }
        bodyClassName={`${
          drag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
        } hover:border-fluent ${picking ? 'border-fluent' : ''}`}
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
