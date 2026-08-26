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

/** The DOM id a detail block answers to. One function, so a writer and
 *  a reader cannot disagree about the name. */
export function detailAnchorId(key: string): string {
  return `category-detail-${key}`;
}

export default function CategoryDetailStack({
  entries, expanded, onToggle, accentHex, now, viewFor, onViewChange,
  dueByItem,
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
}) {
  return (
    <div className="space-y-3" data-testid="category-detail-stack">
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
    </div>
  );
}
