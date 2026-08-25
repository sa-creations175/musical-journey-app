/**
 * Progress detail — every item in one category, arranged.
 *
 * Card → grid → item, each level the one below it summarised. The card
 * says how the category is going; this says which items make it so; a
 * cell opens onto that one item's reps.
 *
 * THE GRID AND THE TAIL ARE BOTH RENDERED. See `placeItems` — the tail
 * is most categories, not an edge case.
 *
 * THE VIEW TOGGLE IS DISPLAY ONLY. Chromatic and circle-of-fourths hold
 * the same twelve values; a column means the same thing either way. The
 * choice is remembered between visits, like the criteria panel's open
 * state.
 */
import { useMemo, useState } from 'react';
import ProgressBar from '../ProgressBar';
import { FALLBACK_INTERVAL_DAYS } from '../../lib/progressBar';
import { TIER_BADGE_CLASS, TIER_BAR_CLASS, TIER_LABEL } from '../../lib/tier';
import type { SkillRecord } from '../../modules/skills/registry';
import { axisLabel, resolveView, type GridSpec } from './axis';
import { placeItems } from './placeItems';

export interface ProgressDetailProps {
  categoryLabel: string;
  items: readonly SkillRecord[];
  /** `null` where the category has no axes — flat list only. */
  grid: GridSpec | null;
  accentHex: string;
  now: number;
  /** Remembered view per axis field. */
  viewFor: (field: string) => string | null;
  onViewChange: (field: string, viewId: string) => void;
  /** Next-due timestamps by itemId, where the module schedules. */
  dueByItem?: ReadonlyMap<string, number | null>;
  onClose: () => void;
}

export default function ProgressDetail({
  categoryLabel, items, grid, accentHex, now, viewFor, onViewChange,
  dueByItem, onClose,
}: ProgressDetailProps) {
  const [openItem, setOpenItem] = useState<SkillRecord | null>(null);

  const columnView = grid ? resolveView(grid.columns, viewFor(grid.columns.field)) : null;
  const rowView = grid ? resolveView(grid.rows, viewFor(grid.rows.field)) : null;

  const placed = useMemo(
    () => placeItems(items, grid, columnView ?? { id: '', label: '', values: [] },
      rowView ?? { id: '', label: '', values: [] }),
    [items, grid, columnView, rowView],
  );

  return (
    <section className="space-y-4" data-testid="progress-detail">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-base font-medium">{categoryLabel}</h2>
        <span className="text-[11px] text-neutral-500 tabular-nums">
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 underline"
        >
          close
        </button>
      </div>

      {grid && columnView && rowView && placed.grid !== null && (() => {
        const g = placed.grid;
        return (
        <>
          {grid.columns.views.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-neutral-500 uppercase tracking-wide">
                {grid.columns.label}:
              </span>
              {grid.columns.views.map(v => {
                const on = v.id === columnView.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    data-testid={`axis-view-${v.id}`}
                    aria-pressed={on}
                    onClick={() => onViewChange(grid.columns.field, v.id)}
                    className={`px-2 py-1 rounded-md text-[11px] border ${
                      on ? 'text-white border-transparent'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-500'
                    }`}
                    style={on ? { backgroundColor: accentHex } : undefined}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="border-collapse text-[11px]" data-testid="progress-grid">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white dark:bg-neutral-900 z-10" />
                  {g.columns.map(c => (
                    <th
                      key={String(c)}
                      data-testid="grid-column"
                      data-column={String(c)}
                      className="px-1.5 py-1 font-medium text-neutral-500 whitespace-nowrap"
                    >
                      {axisLabel(grid.columns, c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.rows.map(r => (
                  <tr key={String(r)} data-testid="grid-row" data-row={String(r)}>
                    <th className="sticky left-0 bg-white dark:bg-neutral-900 z-10 pr-2 py-1 text-right font-medium text-neutral-500 whitespace-nowrap">
                      {axisLabel(grid.rows, r)}
                    </th>
                    {g.columns.map(c => {
                      const cell = g.cells.get(String(c))?.get(String(r)) ?? [];
                      const item = cell[0];
                      return (
                        <td key={String(c)} className="p-0.5">
                          {item ? (
                            <button
                              type="button"
                              data-testid="grid-cell"
                              data-cell={`${c}|${r}`}
                              onClick={() => setOpenItem(item)}
                              title={item.name}
                              className={`w-7 h-7 rounded ${
                                item.currentTier
                                  ? TIER_BAR_CLASS[item.currentTier]
                                  : 'bg-neutral-200 dark:bg-neutral-700'
                              }`}
                            />
                          ) : (
                            // An empty cell is a coordinate the catalog
                            // has no item for. Drawn, not omitted, so
                            // the grid keeps its shape.
                            <div
                              data-testid="grid-gap"
                              className="w-7 h-7 rounded border border-dashed border-neutral-200 dark:border-neutral-800"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
        );
      })()}

      {placed.tail.length > 0 && (
        <div data-testid="progress-tail">
          {placed.grid !== null && (
            // Named, not silent. "Everything else" would read as a
            // leftovers bin; these are items the category genuinely
            // does not vary by the grid's axes.
            <p className="text-[11px] text-neutral-500 mb-1.5">
              {placed.tail.length} item{placed.tail.length === 1 ? '' : 's'} with no
              {' '}{grid?.columns.label} / {grid?.rows.label} coordinates
            </p>
          )}
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-black/[0.07] rounded-lg overflow-hidden">
            {placed.tail.map(item => (
              <li key={item.skillId}>
                <button
                  type="button"
                  data-testid="tail-item"
                  data-item={item.itemId}
                  onClick={() => setOpenItem(item)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-black/[0.03]"
                >
                  <span className="flex-1 min-w-0 truncate">{item.name}</span>
                  {item.currentTier && (
                    <span className={`shrink-0 text-[10px] rounded-full border px-1.5 py-0.5 ${TIER_BADGE_CLASS[item.currentTier]}`}>
                      {TIER_LABEL[item.currentTier]}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {openItem && (
        <ItemDetail
          item={openItem}
          now={now}
          dueAt={dueByItem?.get(openItem.itemId) ?? null}
          onClose={() => setOpenItem(null)}
        />
      )}
    </section>
  );
}

/**
 * One item: its last twenty reps, when it is next due, how many times
 * it has been proven.
 *
 * The strip reads `item.window` — the actual rows the registry now
 * carries. Before 2b there was nothing here to draw from but a tier,
 * and a strip cannot be reconstructed from one.
 */
function ItemDetail({
  item, now, dueAt, onClose,
}: {
  item: SkillRecord;
  now: number;
  dueAt: number | null;
  onClose: () => void;
}) {
  const proven = item.window.filter(w => w.correct).length;
  return (
    <div
      className="rounded-lg border border-black/[0.07] p-3 space-y-2"
      data-testid="item-detail"
      data-item={item.itemId}
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-medium">{item.name}</span>
        {item.currentTier && (
          <span className={`text-[10px] rounded-full border px-1.5 py-0.5 ${TIER_BADGE_CLASS[item.currentTier]}`}>
            {TIER_LABEL[item.currentTier]}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[11px] text-neutral-500 underline"
        >
          close
        </button>
      </div>

      {item.window.length > 0 ? (
        <ProgressBar
          attempts={item.window}
          intervalDays={FALLBACK_INTERVAL_DAYS}
          now={now}
          label={item.name}
        />
      ) : (
        // Empty means one of two things and the record cannot tell them
        // apart — see SkillRecord.window. Saying "no reps recorded" is
        // true of both; "not practised yet" would be a guess.
        <p className="text-[11px] text-neutral-400">no reps recorded</p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-neutral-500">proven</dt>
        <dd className="tabular-nums" data-testid="item-proven">
          {proven} of {item.window.length}
        </dd>
        <dt className="text-neutral-500">last practised</dt>
        <dd className="tabular-nums">
          {item.daysSince === null ? 'never'
            : item.daysSince === 0 ? 'today'
              : `${item.daysSince}d ago`}
        </dd>
        <dt className="text-neutral-500">next due</dt>
        <dd className="tabular-nums" data-testid="item-due">
          {dueAt === null ? '—'
            : dueAt <= now ? 'now'
              : `in ${Math.ceil((dueAt - now) / 86400000)}d`}
        </dd>
      </dl>
    </div>
  );
}
