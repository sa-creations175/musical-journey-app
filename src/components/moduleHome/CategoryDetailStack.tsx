/**
 * The detail block on a drill page — one entry per lit category.
 *
 * =====================================================================
 * IT MIRRORS THE CHIP ROW, AND THAT IS THE WHOLE RULE.
 *
 * The page's own category is open; everything else lit is a collapsed
 * header you can open. Nothing renders fifteen grids unless fifteen are
 * asked for — a category's grid is a table with up to twenty-four
 * columns in it, and rendering the lit set eagerly would put several of
 * those below a drill nobody had started yet.
 *
 * Expansion is per category and unbounded: any number may be open at
 * once, because comparing two categories is a thing the reader will
 * want and an accordion that closes the last one makes impossible. Same
 * call `CategoryCardGrid` already made about its cards.
 * =====================================================================
 *
 * THE EXPANDED BODY IS `ProgressDetail`, unchanged. It is the surface
 * that already knows how to place items on a grid and how to show the
 * ones that have no coordinates; a second one here would be a second
 * set of answers to the same question. Its own "close" reads as
 * collapse, which is what closing one of these is.
 *
 * A CATEGORY WITH NO GRID RENDERS ITS FLAT LIST, and that is the answer
 * for it rather than a gap — see `progressGrids.ts`. `ProgressDetail`
 * already does this when `grid` is null; nothing here special-cases it.
 */
import { useEffect, useRef, useState } from 'react';
import { SCROLL_ROOM_CLASS, scrollSectionToTop } from '../../lib/scrollSectionToTop';
import ProgressDetail from './ProgressDetail';
import type { GridSpec } from './axis';
import type { SkillRecord } from '../../modules/skills/registry';

export interface DetailEntry {
  /** The category's own key — what the chip row and the cards use. */
  key: string;
  label: string;
  /** `null` where the category has no coordinates. */
  grid: GridSpec | null;
  items: readonly SkillRecord[];
}

/** The DOM id a detail block answers to, so a card's Progress Tracker
 *  button can scroll to it. One function, so the writer and the reader
 *  cannot disagree about the name. */
export function detailAnchorId(key: string): string {
  return `category-detail-${key}`;
}

export default function CategoryDetailStack({
  entries, expanded, onToggle, accentHex, now, viewFor, onViewChange,
  dueByItem, scrollTo, onScrolled,
}: {
  /** In the order the chip row shows them. */
  entries: readonly DetailEntry[];
  expanded: ReadonlySet<string>;
  onToggle: (key: string) => void;
  accentHex: string;
  now: number;
  viewFor: (field: string) => string | null;
  onViewChange: (field: string, viewId: string) => void;
  dueByItem?: ReadonlyMap<string, number | null>;
  /**
   * A category to bring into view — set by a card's Progress Tracker
   * button.
   *
   * READ AFTER THE RENDER THAT EXPANDS IT. The button expands and
   * scrolls in one press, and scrolling to a block that is still
   * collapsed would land on a header rather than on the grid the
   * reader asked for. An effect runs after the DOM has the expanded
   * block in it, so the two happen in the right order without the
   * caller sequencing them.
   */
  scrollTo?: string | null;
  /** Cleared once the scroll has been asked for, so the same category
   *  can be asked for again. */
  onScrolled?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  /**
   * Whether this stack has been landed on.
   *
   * =================================================================
   * THE ROOM HAS TO OUTLIVE THE REQUEST THAT NEEDED IT.
   *
   * `scrollTo` is cleared the instant it is acted on, so that a later
   * re-render cannot scroll the reader back down. But a smooth scroll
   * is still travelling at that point, and the document has to STAY
   * tall enough for it to arrive — a spacer that vanished a tick after
   * the request would cut the scroll short and the block would settle
   * mid-screen, which is the bug this is fixing.
   *
   * So it is remembered for the life of the page. A reader who was
   * sent here gets a screen of room below the stack; a reader who
   * simply opened the page gets none, because nothing asked to be at
   * the top.
   * =================================================================
   */
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (!scrollTo) return;
    // FOUND BY ATTRIBUTE, NOT BY `#id`. An id selector has to be
    // escaped and `CSS.escape` does not exist in jsdom; the key is a
    // validated slug either way, so matching the attribute is both
    // simpler and portable. The id stays for anchor links.
    const el = hostRef.current?.querySelector(`[data-detail-key="${scrollTo}"]`);
    // THE APP'S SCROLL. `scrollIntoView` aligns with the top of the
    // scrollport, which is underneath the sticky header, so the block
    // landed behind the chrome. What a test can check is which block
    // was asked for and that the chrome was measured — not that
    // anything moved, because jsdom has no layout.
    scrollSectionToTop(el as HTMLElement | null);
    setLanded(true);
    onScrolled?.();
  }, [scrollTo, onScrolled]);
  return (
    <div className="space-y-3" ref={hostRef} data-testid="category-detail-stack">
      {entries.map(entry => {
        const open = expanded.has(entry.key);
        return (
          <section
            key={entry.key}
            id={detailAnchorId(entry.key)}
            data-testid="category-detail"
            data-detail-key={entry.key}
            data-expanded={open ? 'true' : 'false'}
            className="rounded-2xl border border-black/[0.07] bg-white dark:bg-neutral-900 shadow-[0_2px_12px_rgba(0,0,0,0.07)] p-3 sm:p-4"
          >
            {open ? (
              <ProgressDetail
                categoryLabel={entry.label}
                items={entry.items}
                grid={entry.grid}
                accentHex={accentHex}
                now={now}
                viewFor={viewFor}
                onViewChange={onViewChange}
                {...(dueByItem ? { dueByItem } : {})}
                onClose={() => onToggle(entry.key)}
              />
            ) : (
              <button
                type="button"
                data-testid="category-detail-toggle"
                onClick={() => onToggle(entry.key)}
                aria-expanded={false}
                className="w-full flex items-baseline gap-3 text-left"
              >
                <span className="text-base font-medium">{entry.label}</span>
                <span className="text-[11px] text-neutral-500 tabular-nums">
                  {entry.items.length} item{entry.items.length === 1 ? '' : 's'}
                </span>
                <span aria-hidden className="ml-auto text-neutral-400">＋</span>
              </button>
            )}
          </section>
        );
      })}
      {/* ROOM BELOW THE BLOCK THAT WAS ASKED FOR. A browser cannot
          scroll past the end of the document, so a block near the
          bottom stops part way however it is asked. After the stack
          rather than a floor on it, because the block landed on may be
          the last one — a floor on the whole stack would be satisfied
          by the blocks ABOVE it and leave the one that matters short. */}
      {landed && (
        <div aria-hidden data-testid="detail-scroll-room" className={SCROLL_ROOM_CLASS} />
      )}
    </div>
  );
}
