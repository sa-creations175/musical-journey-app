import type { CSSProperties, ComponentPropsWithoutRef, ReactNode } from 'react';
import type { SongLyricLine } from '../../lib/db';
import { lineStatus } from './lyricSyllables';

/**
 * One lyric line as a row: its words with per-word placed status, a
 * progress badge, and the un-place / delete actions.
 *
 * Shared by the per-section tray and the song-level lyric drawer
 * (step 7). What differs between them is how the row's BODY is
 * activated, not what it looks like — the tray makes it draggable, the
 * drawer makes it tappable-to-arm — so the body's ref and handlers are
 * supplied by the caller rather than chosen here.
 *
 * The other thing that differs is WHICH lines each shows, and that
 * also stays with the caller: the tray filters to unfinished lines,
 * while the drawer lists every line in song order with placed ones
 * dimmed, because it doubles as the readable lyric sheet.
 *
 * VOCABULARY: rows say "words", never "syllables". A word only becomes
 * syllables once it has been split, which normally happens after
 * placement — so "syllables" belongs to the grid, where splitting has
 * actually happened, and "words" belongs here.
 */
export default function LyricLineRow({
  line,
  dimPlaced = false,
  pickMode = false,
  onWordTap,
  handle,
  bodyRef,
  bodyProps,
  bodyClassName = '',
  bodyStyle,
  onDelete,
  onUnplace,
}: {
  line: SongLyricLine;
  /** Fade a fully-placed line. The drawer lists placed lines so it
   *  reads as the whole lyric sheet; dimming keeps "what's left"
   *  legible at a glance without hiding anything. */
  dimPlaced?: boolean;
  /** PICK MODE inverts the row's emphasis. At rest a row answers "how
   *  much of this is done", so placed words read solid and unplaced
   *  ones recede. While picking it answers "which word do I place
   *  next", and the unplaced ones are the targets — leaving them faint
   *  would read as "unavailable", which is backwards. */
  pickMode?: boolean;
  onWordTap?: (syllableId: string) => void;
  /** Leading affordance glyph, e.g. the tray's drag handle. */
  handle?: ReactNode;
  bodyRef?: (node: HTMLDivElement | null) => void;
  /** Spread onto the body — dnd-kit's attributes + listeners from the
   *  tray, an onClick from the drawer. Typed as plain div props, which
   *  both are. */
  bodyProps?: ComponentPropsWithoutRef<'div'>;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
  onDelete?: (lineId: string) => void;
  onUnplace?: (lineId: string) => void | Promise<void>;
}) {
  const status = lineStatus(line);
  const isHeader = line.kind === 'header';
  const dim = dimPlaced && status.status === 'placed';
  return (
    <div className="flex items-center gap-2">
      <div
        // Stable hook for the row's activatable body, so callers and
        // tests address it directly rather than by DOM shape.
        data-line-body=""
        ref={bodyRef}
        style={bodyStyle}
        {...(isHeader ? {} : bodyProps)}
        /* Row fill is lifted off the page (neutral-50 light,
           neutral-800 dark) rather than sitting at white/neutral-900,
           where it was nearly invisible against the tray's own
           translucent panel — in dark mode the row and the panel were
           literally the same colour. */
        className={`flex-1 inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] select-none touch-none ${
          isHeader
            ? 'border-transparent bg-neutral-200/70 dark:bg-neutral-700/60 text-neutral-600 dark:text-neutral-300 uppercase tracking-wide'
            : 'border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
        } ${dim ? 'opacity-55' : ''} ${bodyClassName}`}
      >
        {!isHeader && handle}
        {/* Word-by-word status: placed solid, unplaced lighter, so one
            glance shows what's left rather than an abstract count.
            BOTH tiers sit close to the text colour, not just the faint
            one — unplaced words used to be at neutral-400/500, which
            reads as "disabled" on a white row and was genuinely hard to
            read. The gap between the two tiers is what carries the
            meaning, so it is preserved at higher contrast rather than
            widened. Contrast only, no hue: this sits directly above a
            grid of chord-family colours, and green in particular is
            1maj. */}
        <span className={pickMode ? 'min-w-0' : 'truncate min-w-0'}>
          {isHeader || !line.syllables
            ? line.text
            : line.syllables.map((s, i) => {
                const placed = s.anchor !== undefined;
                // Contrast and weight, not hue. Indigo is licensed for
                // "where will this land" on the grid; this answers
                // "what will be placed", which is a different question
                // on a different surface.
                const tone = pickMode
                  ? placed
                    ? 'text-neutral-400 dark:text-neutral-500'
                    : 'font-semibold text-neutral-900 dark:text-neutral-100'
                  : placed
                    ? undefined
                    : 'text-neutral-600 dark:text-neutral-300 italic';
                const body = (
                  <>
                    {i > 0 ? ' ' : ''}
                    {s.text}
                  </>
                );
                if (!pickMode || !onWordTap) {
                  return (
                    <span key={s.id} className={tone}>
                      {body}
                    </span>
                  );
                }
                return (
                  <button
                    key={s.id}
                    type="button"
                    // The row body is itself tappable; a word tap must
                    // not also fire it.
                    onClick={e => {
                      e.stopPropagation();
                      onWordTap(s.id);
                    }}
                    aria-label={
                      placed
                        ? `move "${s.text}"`
                        : `place "${s.text}"`
                    }
                    className={`${tone} rounded px-0.5 hover:text-fluent hover:bg-fluent/10`}
                  >
                    {body}
                  </button>
                );
              })}
        </span>
        {status.status === 'partial' && (
          <span className="ml-auto pl-2 text-[10px] text-neutral-500 dark:text-neutral-400 shrink-0">
            {status.placed}/{status.total} placed
          </span>
        )}
      </div>
      {onUnplace && status.placed > 0 && (
        <button
          type="button"
          onClick={() => void onUnplace(line.id)}
          aria-label="un-place all words in this line"
          title="un-place all — return this line's words to unplaced"
          className="text-neutral-400 hover:text-fluent text-xs leading-none px-1 shrink-0"
        >
          ⤺
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(line.id)}
          aria-label="delete lyric line"
          title={
            status.placed > 0
              ? 'delete this line — it has placed words, so it will confirm first'
              : 'delete this line'
          }
          className="text-neutral-400 hover:text-needswork text-xs leading-none px-1 shrink-0"
        >
          ×
        </button>
      )}
    </div>
  );
}
