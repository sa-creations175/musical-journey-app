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
 *
 * SO IS THE ORIENTATION TOGGLE, for the same reason and through the
 * same remembered store — see `orientationField` in `axis.ts`. Which
 * way up a grid reads is the reader's call, not the catalogue's: a
 * 7 x 24 is a sideways scroll one way up and a downward one the other,
 * and which of those is better depends on the screen and the reader,
 * neither of which this file can see. A category with no second axis
 * does not offer it — there is nothing to swap.
 */
import { useMemo, useState } from 'react';
import ProgressBar from '../ProgressBar';
import { FALLBACK_INTERVAL_DAYS } from '../../lib/progressBar';
import { TIER_BADGE_CLASS, TIER_BAR_CLASS, TIER_LABEL, type Tier } from '../../lib/tier';
import type { SkillRecord } from '../../modules/skills/registry';
import {
  AS_DECLARED, HORIZONTAL, SINGLE_ROW, TRANSPOSED, VERTICAL, axisLabel,
  canTranspose, layoutField, orientationField,
  orientedGrid, resolveView, type AxisSpec, type GridSpec,
} from './axis';
import { placeItems, type PlacedGrid } from './placeItems';

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

  // WHAT IS DRAWN, which is the declared grid turned or not turned. The
  // declared one is read only to decide that; everything downstream —
  // headers, placement, the tail's sentence — reads `shown`, so there
  // is no second place that can hold the old orientation.
  const turnable = canTranspose(grid);
  const orientKey = orientationField(categoryLabel);
  const transposed = turnable && viewFor(orientKey) === TRANSPOSED;
  const shown = useMemo(
    () => (grid === null ? null : orientedGrid(grid, transposed)),
    [grid, transposed],
  );

  /**
   * WHICH DRAWING IS SHOWN. Horizontal the first time — nothing is
   * remembered, and the table is what every other category shows —
   * and thereafter whatever was last chosen. `Vertical` is the
   * category's own component; a category with none has no toggle.
   */
  const Vertical = shown?.vertical;
  const layoutKey = layoutField(categoryLabel);
  const vertical = Vertical !== undefined && viewFor(layoutKey) === VERTICAL;

  const columnView = shown ? resolveView(shown.columns, viewFor(shown.columns.field)) : null;
  const rowView = shown
    ? (shown.rows ? resolveView(shown.rows, viewFor(shown.rows.field)) : SINGLE_ROW)
    : null;

  const placed = useMemo(
    () => placeItems(items, shown, columnView ?? { id: '', label: '', values: [] },
      rowView ?? { id: '', label: '', values: [] }),
    [items, shown, columnView, rowView],
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
          Close
        </button>
      </div>

      {shown && columnView && rowView && placed.grid !== null && (() => {
        const g = placed.grid;
        return (
        <>
          <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
            {/* ONE TOGGLE PER AXIS THAT HAS ORDERINGS, whichever way up
                the grid is drawn. Offering it for the columns only meant
                that turning the grid took the key toggle off screen with
                the axis it belonged to. */}
            <AxisViewToggle
              axis={shown.columns}
              current={columnView.id}
              accentHex={accentHex}
              onChange={onViewChange}
            />
            {shown.rows && (
              <AxisViewToggle
                axis={shown.rows}
                current={rowView.id}
                accentHex={accentHex}
                onChange={onViewChange}
              />
            )}

            {/* THE OTHER DRAWING, where the category has one. Not a
                transpose: a table and a staff are two pictures of the
                same items, not one picture turned — so it is its own
                control and it does not disable that one. */}
            {Vertical && (
              <div
                className="ml-auto inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5"
                data-testid="grid-layout"
                data-layout={vertical ? VERTICAL : HORIZONTAL}
              >
                {[HORIZONTAL, VERTICAL].map(id => {
                  const on = (id === VERTICAL) === vertical;
                  return (
                    <button
                      key={id}
                      type="button"
                      data-testid={`grid-layout-${id}`}
                      aria-pressed={on}
                      onClick={() => onViewChange(layoutKey, id)}
                      className={`px-2 py-0.5 rounded-md text-[11px] ${
                        on ? 'text-white' : 'text-neutral-500'
                      }`}
                      style={on ? { backgroundColor: accentHex } : undefined}
                    >
                      {LAYOUT_LABEL[id]}
                    </button>
                  );
                })}
              </div>
            )}

            {turnable && (
              <button
                type="button"
                data-testid="grid-orientation"
                data-transposed={transposed ? 'true' : 'false'}
                aria-pressed={transposed}
                onClick={() => onViewChange(orientKey, transposed ? AS_DECLARED : TRANSPOSED)}
                className={`ml-auto px-2 py-1 rounded-md text-[11px] border ${
                  transposed
                    ? 'text-white border-transparent'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-500'
                }`}
                style={transposed ? { backgroundColor: accentHex } : undefined}
              >
                {ORIENTATION_LABEL}
              </button>
            )}
          </div>

          {/* ONE TABLE, OR ONE PER ROW. Split, each table draws its own
              headers and is told which group it is labelling, because
              the columns mean a different thing in each — see
              `splitRows`. Unsplit is the same single table as before. */}
          {vertical && Vertical ? (
            <Vertical items={items} onOpen={setOpenItem} />
          ) : shown.splitRows ? (
            g.rows.map(r => (
              <GridTable
                key={String(r)}
                grid={g}
                columns={shown.columns}
                rows={[r]}
                group={r}
                caption={shown.rows ? axisLabel(shown.rows, r) : ''}
                onOpen={setOpenItem}
              />
            ))
          ) : (
            <GridTable
              grid={g}
              columns={shown.columns}
              rows={g.rows}
              {...(shown.rows ? { rowAxis: shown.rows } : {})}
              onOpen={setOpenItem}
            />
          )}

          <TierLegend />
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
              {' '}{shown?.columns.label}{shown?.rows ? ` / ${shown.rows.label}` : ''} coordinates
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
 * The table itself — one of them, or one per group when split.
 *
 * Pulled out of the body unchanged in behaviour: same cells, same tier
 * colours, same click-to-open. What it gained is a GROUP, which the
 * column labels are told about, and the frame rule.
 */
function GridTable({
  grid, columns, rows, rowAxis, group, caption, onOpen,
}: {
  grid: PlacedGrid;
  columns: AxisSpec;
  /** The row values this table draws — every row, or the one group. */
  rows: readonly (string | number)[];
  /** Present where a row header column is drawn. A split table names
   *  its group in the caption instead. */
  rowAxis?: AxisSpec;
  group?: string | number;
  caption?: string;
  onOpen: (item: SkillRecord) => void;
}) {
  const framed = columns.inFrame;
  return (
    <div className="overflow-x-auto" data-testid="progress-grid-scroll">
      {caption !== undefined && caption !== '' && (
        <div
          data-testid="grid-caption"
          data-group={String(group)}
          className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1"
        >
          {caption}
        </div>
      )}
      <table
        className="border-collapse text-[11px]"
        data-testid="progress-grid"
        {...(group !== undefined ? { 'data-group': String(group) } : {})}
      >
        <thead>
          {/* WHERE THE STAFF ITSELF SITS. A rule over the framed
              columns, so the positions outside it read as ledger
              rather than as more staff. Drawn only where the axis
              declares a frame; every other axis has none. */}
          {framed && (
            <tr data-testid="grid-frame">
              {rowAxis && <th className="sticky left-0 bg-white dark:bg-neutral-900 z-10" />}
              {grid.columns.map(c => (
                <th
                  key={String(c)}
                  data-testid="grid-frame-cell"
                  data-column={String(c)}
                  data-framed={framed(c) ? 'true' : 'false'}
                  className={`h-1.5 p-0 ${
                    framed(c) ? 'border-t-2 border-neutral-400 dark:border-neutral-500' : ''
                  }`}
                />
              ))}
            </tr>
          )}
          <tr>
            {rowAxis && <th className="sticky left-0 bg-white dark:bg-neutral-900 z-10" />}
            {grid.columns.map(c => (
              <th
                key={String(c)}
                data-testid="grid-column"
                data-column={String(c)}
                className="px-1.5 py-1 font-medium text-neutral-500 whitespace-nowrap"
              >
                {axisLabel(columns, c, group)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={String(r)} data-testid="grid-row" data-row={String(r)}>
              {rowAxis && (
                <th className="sticky left-0 bg-white dark:bg-neutral-900 z-10 pr-2 py-1 text-right font-medium text-neutral-500 whitespace-nowrap">
                  {axisLabel(rowAxis, r)}
                </th>
              )}
              {grid.columns.map(c => {
                const cell = grid.cells.get(String(c))?.get(String(r)) ?? [];
                const item = cell[0];
                return (
                  <td key={String(c)} className="p-0.5">
                    {item ? (
                      <button
                        type="button"
                        data-testid="grid-cell"
                        data-cell={`${c}|${r}`}
                        onClick={() => onOpen(item)}
                        title={item.name}
                        className={`w-7 h-7 rounded ${
                          // A null tier is a module that cannot
                          // compute one — no data, which is what
                          // NOT STARTED means. Read off the same
                          // map rather than repeating its colour.
                          TIER_BAR_CLASS[item.currentTier ?? 'untouched']
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
  );
}

/**
 * THE ORIENTATION CONTROL HAS NO NAME YET, and that is deliberate.
 *
 * Silas names it. A placeholder word would ship as copy and would then
 * have to be un-shipped; an empty string renders a control that is
 * plainly waiting for one. Everything else about it works — it turns
 * the grid, it remembers, it is keyed per category.
 */
const ORIENTATION_LABEL = '';

/**
 * The two sides of the layout toggle.
 *
 * These are Silas's own words for them — "a toggle between horizontal
 * and vertical" — kept as constants rather than inlined so that
 * renaming them is one edit. Unlike the orientation control above,
 * this one cannot ship nameless: two blank buttons would be a choice
 * with nothing to choose between.
 */
const LAYOUT_LABEL: Readonly<Record<string, string>> = {
  [HORIZONTAL]: 'Horizontal',
  [VERTICAL]: 'Vertical',
};

/**
 * One axis's orderings, as a row of buttons. Nothing when the axis has
 * only one — a toggle between a thing and itself is decoration.
 */
function AxisViewToggle({
  axis, current, accentHex, onChange,
}: {
  axis: AxisSpec;
  current: string;
  accentHex: string;
  onChange: (field: string, viewId: string) => void;
}) {
  if (axis.views.length < 2) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-testid="axis-view-toggle">
      <span className="text-[11px] text-neutral-500 uppercase tracking-wide">
        {axis.label}:
      </span>
      {axis.views.map(v => {
        const on = v.id === current;
        return (
          <button
            key={v.id}
            type="button"
            data-testid={`axis-view-${v.id}`}
            aria-pressed={on}
            onClick={() => onChange(axis.field, v.id)}
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
  );
}

/**
 * What a cell's colour means, under the cells it explains.
 *
 * NOT A COPY OF THE PALETTE. The swatch is the class the cell itself
 * paints with and the word is the tier's own name, both read out of
 * `tier.ts`. A legend that spelled its own colours would be a second
 * answer to "what is fluent green" and would go stale the first time
 * one moved.
 *
 * The ORDER is the only thing decided here, and it is a reading order
 * rather than the catalogue's: the ladder from nothing to mastered,
 * with `stale` last because it is not a rung on that ladder — it is
 * what happens to a rung left alone.
 */
const LEGEND_TIERS: ReadonlyArray<Tier> = [
  'untouched', 'started', 'needsWork', 'developing', 'fluent', 'mastered', 'stale',
];

function TierLegend() {
  return (
    <ul
      className="flex items-center gap-x-3 gap-y-1.5 flex-wrap text-[10px] text-neutral-500"
      data-testid="tier-legend"
    >
      {LEGEND_TIERS.map(t => (
        <li key={t} className="inline-flex items-center gap-1.5" data-legend-tier={t}>
          <span
            className={`w-3 h-3 rounded-sm shrink-0 ${TIER_BAR_CLASS[t]}`}
            aria-hidden
          />
          <span>{TIER_LABEL[t]}</span>
        </li>
      ))}
    </ul>
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
          Close
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
        <dt className="text-neutral-500">Proven</dt>
        <dd className="tabular-nums" data-testid="item-proven">
          {proven} of {item.window.length}
        </dd>
        <dt className="text-neutral-500">Last Practised</dt>
        <dd className="tabular-nums">
          {item.daysSince === null ? 'never'
            : item.daysSince === 0 ? 'today'
              : `${item.daysSince}d ago`}
        </dd>
        <dt className="text-neutral-500">Next Due</dt>
        <dd className="tabular-nums" data-testid="item-due">
          {dueAt === null ? '—'
            : dueAt <= now ? 'now'
              : `in ${Math.ceil((dueAt - now) / 86400000)}d`}
        </dd>
      </dl>
    </div>
  );
}
