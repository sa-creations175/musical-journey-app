/**
 * Scales section of the S&P module — Part 5 of the Scales
 * submodule build (src/docs/SCALES_SUBMODULE_DESIGN.md).
 *
 * Shows all 96 cells from the scaleSkills catalog, grouped by
 * scale kind, color-coded by acquisitionStage. Pentatonic groups
 * fan out to one row per starting point (1/5/6 for major, 1/b3/b7
 * for minor) so the user can see per-sp progress at a glance.
 *
 * Tapping a cell opens ScalesDrillModal — a slim runner that
 * captures Flying / Cruising / Crawling and writes a procedural
 * rating signal to spacingState via recordEngagement. Natural-minor
 * cells additionally surface the relative-major callout in the
 * assess phase per the design doc.
 *
 * No DrillSkill / DrillType / DrillSession rows are written by
 * this surface — the Scales catalog is static, spacingState is
 * the canonical signal, and there are no per-cell drill-type
 * subdivisions to pick from.
 */
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SpacingState, type AcquisitionStage } from '../../lib/db';
import {
  SCALE_CELLS,
  MAJOR_PENT_STARTING_POINTS,
  MINOR_PENT_STARTING_POINTS,
  type ScaleCell,
  type ScaleKind,
  type PentStartingPoint,
} from './scaleSkills';
import { CIRCLE_OF_FOURTHS } from './spTiers';
import ScalesDrillModal from './ScalesDrillModal';

type StageBucket = 'new' | 'acquiring' | 'acquired';

/** Collapse the spacingState ladder into the three-bucket palette
 *  the design doc asks for. `acquired+` (consolidated, mastered)
 *  all read as "acquired" since the heat-grid cell color reflects
 *  acquisition state, not longer-term decay. */
function bucketFor(stage: AcquisitionStage | undefined): StageBucket {
  if (stage === 'acquired' || stage === 'consolidated' || stage === 'mastered') {
    return 'acquired';
  }
  if (stage === 'acquiring') return 'acquiring';
  return 'new';
}

const STAGE_BG: Readonly<Record<StageBucket, string>> = {
  acquired:  'bg-mastered/35 hover:bg-mastered/50 border-mastered/40',
  acquiring: 'bg-developing/25 hover:bg-developing/40 border-developing/40',
  new:       'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border-neutral-300 dark:border-neutral-700',
};

const STAGE_LEGEND_LABEL: Readonly<Record<StageBucket, string>> = {
  acquired:  'acquired',
  acquiring: 'in progress',
  new:       'not started',
};

interface ScaleRow {
  rowKey: string;
  rowLabel: string;
  cells: ScaleCell[];
}

interface ScaleGroup {
  kind: ScaleKind;
  label: string;
  description: string;
  rows: ScaleRow[];
}

// ---------------------------------------------------------------------
// Group construction
// ---------------------------------------------------------------------

function buildGroups(): ScaleGroup[] {
  return [
    {
      kind: 'major',
      label: 'Major',
      description: 'Maintenance — already known. Low session priority.',
      rows: [singleRow('major', 'Major scale')],
    },
    {
      kind: 'major-pentatonic',
      label: 'Major Pentatonic',
      description: 'Three starting points — root, dominant, relative-minor position.',
      rows: MAJOR_PENT_STARTING_POINTS.map(sp =>
        pentRow('major-pentatonic', sp, `From ${sp}`),
      ),
    },
    {
      kind: 'natural-minor',
      label: 'Natural Minor',
      description: 'Drill cell — active coverage. Pairs with the relative major.',
      rows: [singleRow('natural-minor', 'Natural minor scale')],
    },
    {
      kind: 'minor-pentatonic',
      label: 'Minor Pentatonic',
      description: 'Three starting points — root, blue-note entry (b3), descending riff (b7).',
      rows: MINOR_PENT_STARTING_POINTS.map(sp =>
        pentRow('minor-pentatonic', sp, `From ${sp}`),
      ),
    },
  ];
}

function singleRow(kind: 'major' | 'natural-minor', label: string): ScaleRow {
  const cells = SCALE_CELLS.filter(c => c.kind === kind);
  return { rowKey: kind, rowLabel: label, cells: sortByCircleOfFourths(cells) };
}

function pentRow(
  kind: 'major-pentatonic' | 'minor-pentatonic',
  sp: PentStartingPoint,
  label: string,
): ScaleRow {
  const cells = SCALE_CELLS.filter(
    c => c.kind === kind && c.startingPoint === sp,
  );
  return { rowKey: `${kind}:${sp}`, rowLabel: label, cells: sortByCircleOfFourths(cells) };
}

function sortByCircleOfFourths(cells: ScaleCell[]): ScaleCell[] {
  const order = new Map(CIRCLE_OF_FOURTHS.map((k, i) => [k, i]));
  return [...cells].sort((a, b) => {
    const ai = order.get(a.keyName) ?? CIRCLE_OF_FOURTHS.length;
    const bi = order.get(b.keyName) ?? CIRCLE_OF_FOURTHS.length;
    return ai - bi;
  });
}

// ---------------------------------------------------------------------
// Progress summary
// ---------------------------------------------------------------------

interface ProgressCounts {
  total: number;
  acquired: number;
  acquiring: number;
  new: number;
}

function countCells(cells: ScaleCell[], stageOf: (itemRef: string) => StageBucket): ProgressCounts {
  const counts: ProgressCounts = { total: cells.length, acquired: 0, acquiring: 0, new: 0 };
  for (const c of cells) {
    const bucket = stageOf(c.itemRef);
    counts[bucket] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------

export default function ScaleDrills() {
  const [openCell, setOpenCell] = useState<ScaleCell | null>(null);

  const spacingRows = useLiveQuery<SpacingState[]>(
    () => db.spacingState
      .where('moduleRef').equals('shapes-and-patterns')
      .toArray(),
    [],
  ) ?? [];

  const stageByItemRef = useMemo(() => {
    const m = new Map<string, AcquisitionStage>();
    for (const r of spacingRows) m.set(r.itemRef, r.acquisitionStage);
    return m;
  }, [spacingRows]);

  const stageOf = (itemRef: string): StageBucket =>
    bucketFor(stageByItemRef.get(itemRef));

  const groups = useMemo(buildGroups, []);

  const totals = useMemo(
    () => countCells(SCALE_CELLS as ScaleCell[], stageOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stageByItemRef],
  );

  return (
    <section className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-3 sm:p-5 space-y-5">
      <header className="space-y-1">
        <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          Scales
        </h3>
        <p className="text-xs text-neutral-500">
          96 cells across major, natural minor, and the two pentatonics. Color shows
          acquisition stage. Tap a cell to drill and rate Flying / Cruising / Crawling.
        </p>
      </header>

      <ProgressSummary counts={totals} />

      <div className="space-y-6">
        {groups.map(group => (
          <ScaleGroupBlock
            key={group.kind}
            group={group}
            stageOf={stageOf}
            onCellClick={setOpenCell}
          />
        ))}
      </div>

      <Legend />

      {openCell && (
        <ScalesDrillModal
          cell={openCell}
          onClose={() => setOpenCell(null)}
        />
      )}
    </section>
  );
}

function ProgressSummary({ counts }: { counts: ProgressCounts }) {
  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-2.5 flex items-baseline gap-3 flex-wrap text-xs">
      <span className="text-neutral-500">Progress</span>
      <span className="font-mono">
        <span className="text-mastered font-medium">{counts.acquired}</span>
        <span className="text-neutral-400"> acquired</span>
        {' · '}
        <span className="text-developing font-medium">{counts.acquiring}</span>
        <span className="text-neutral-400"> in progress</span>
        {' · '}
        <span className="text-neutral-500 font-medium">{counts.new}</span>
        <span className="text-neutral-400"> not started</span>
      </span>
      <span className="text-neutral-400 ml-auto">{counts.total} cells</span>
    </div>
  );
}

function ScaleGroupBlock({
  group,
  stageOf,
  onCellClick,
}: {
  group: ScaleGroup;
  stageOf: (itemRef: string) => StageBucket;
  onCellClick: (cell: ScaleCell) => void;
}) {
  const groupCells = group.rows.flatMap(r => r.cells);
  const counts = countCells(groupCells, stageOf);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h4 className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          {group.label}
        </h4>
        <span className="text-[11px] text-neutral-400 font-mono">
          {counts.acquired}/{counts.total} acquired
        </span>
      </div>
      <p className="text-[11px] text-neutral-500">{group.description}</p>

      <div className="overflow-x-auto">
        <div className="min-w-max space-y-1">
          {/* Column header — only on the first row to keep the section visually tight */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: `minmax(110px, 140px) repeat(${CIRCLE_OF_FOURTHS.length}, minmax(34px, 44px))`,
            }}
          >
            <div />
            {CIRCLE_OF_FOURTHS.map(k => (
              <div
                key={k}
                className="text-[10px] uppercase tracking-wide text-neutral-500 text-center font-mono"
              >
                {k}
              </div>
            ))}
          </div>

          {group.rows.map(row => (
            <div
              key={row.rowKey}
              className="grid items-center"
              style={{
                gridTemplateColumns: `minmax(110px, 140px) repeat(${CIRCLE_OF_FOURTHS.length}, minmax(34px, 44px))`,
              }}
            >
              <div className="text-xs pr-2 py-0.5 truncate text-neutral-600 dark:text-neutral-300">
                {row.rowLabel}
              </div>
              {row.cells.map(cell => (
                <CellButton
                  key={cell.itemRef}
                  cell={cell}
                  bucket={stageOf(cell.itemRef)}
                  onClick={() => onCellClick(cell)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CellButton({
  cell,
  bucket,
  onClick,
}: {
  cell: ScaleCell;
  bucket: StageBucket;
  onClick: () => void;
}) {
  const title = `${cell.label} — ${STAGE_LEGEND_LABEL[bucket]}`;
  return (
    <button
      onClick={onClick}
      title={title}
      className={`aspect-square mx-0.5 my-0.5 rounded-sm border transition focus:outline-none focus:ring-2 focus:ring-fluent/50 ${STAGE_BG[bucket]}`}
    />
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] text-neutral-500">
      <span>Legend</span>
      <LegendChip bucket="new" />
      <LegendChip bucket="acquiring" />
      <LegendChip bucket="acquired" />
    </div>
  );
}

function LegendChip({ bucket }: { bucket: StageBucket }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 rounded-sm border ${STAGE_BG[bucket]}`} aria-hidden />
      <span>{STAGE_LEGEND_LABEL[bucket]}</span>
    </span>
  );
}
