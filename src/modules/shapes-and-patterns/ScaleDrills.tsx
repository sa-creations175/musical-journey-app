/**
 * Scales section of the S&P module — Part 5 of the Scales
 * submodule build (src/docs/SCALES_SUBMODULE_DESIGN.md).
 *
 * Shows every scale pattern in the scaleSkills catalog, grouped by
 * scale kind, color-coded by acquisitionStage. Pentatonic groups
 * fan out to one row per starting point (1/5/6 for major, 1/b3/b7
 * for minor) so the user can see per-sp progress at a glance.
 *
 * Tapping a cell asks which hand, then opens the Practice/Test shell
 * on it — the same shell chord shapes and voice-leading use. The old
 * ScalesDrillModal is still reached by the in-session runner and is
 * not retired here.
 *
 * No DrillSkill / DrillType / DrillSession rows are written by
 * this surface — the Scales catalog is static, spacingState is
 * the canonical signal, and there are no per-cell drill-type
 * subdivisions to pick from.
 */
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SpacingState } from '../../lib/db';
import {
  SCALE_CELLS,
  MAJOR_PENT_STARTING_POINTS,
  MINOR_PENT_STARTING_POINTS,
  scaleCellLabel,
  type ScaleCell,
  type ScaleKind,
  type PentStartingPoint,
} from './scaleSkills';
import { CIRCLE_OF_FOURTHS } from './spTiers';
import { spellKey } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';
import PracticeTestPanel from './practiceTest/PracticeTestPanel';
import { scaleSurface } from './practiceTest/makeSurfaces';
import HandChooser from './HandChooser';
import ThreeBandCell from './ThreeBandCell';
import {
  acquisitionIndex,
  type AcquisitionBucket,
  type AcquisitionCounts,
  type AcquisitionIndex,
} from './acquisition';
import type { DrillHand } from '../../lib/db';

/** THE BUCKETS COME FROM `acquisition.ts` NOW. This file used to carry
 *  its own `bucketFor` and its own idea of what a cell's state was —
 *  one of the three answers the module gave about the same cell. */
const STAGE_BG: Readonly<Record<AcquisitionBucket, string>> = {
  'acquired':    'bg-mastered/35 hover:bg-mastered/50 border-mastered/40',
  'in-progress': 'bg-developing/25 hover:bg-developing/40 border-developing/40',
  'not-started': 'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border-neutral-300 dark:border-neutral-700',
};

/** The three swatch labels, Title Cased because a legend item is a
 *  label like any other chip — no `uppercase` class renders these, so
 *  what is written here is what appears.
 *
 *  The status-word rule is satisfied by the row's HEADING rather than
 *  by marking each of these, which is the whole reason the heading
 *  reads "Status" and not "Legend". See `Legend` below.
 *
 *  KNOWN AND NOT THIS COMMIT'S TO FIX: "In Progress" and "Acquired"
 *  are the old acquisition-stage vocabulary rather than the six
 *  rating words, and this legend is the last place they are still on
 *  screen — the chord cell modal dropped them. The wording belongs to
 *  the Practice/Test job, which is changing what these grids display;
 *  casing them here does not endorse them. */
const HAND_LABEL: Readonly<Record<DrillHand, string>> = {
  left: 'Left Hand',
  right: 'Right Hand',
  both: 'Both Hands',
};

const STAGE_LEGEND_LABEL: Readonly<Record<AcquisitionBucket, string>> = {
  'acquired':    'Acquired',
  'in-progress': 'In Progress',
  'not-started': 'Not Started',
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

/** COUNTED BY THE SHARED RULE. This file used to walk the cells with a
 *  `stageOf` that read only the `both` row, which is what made the
 *  Progress line disagree with the grid under it. */
function countCells(cells: ScaleCell[], index: AcquisitionIndex): AcquisitionCounts {
  return index.count(cells.map(c => c.itemRef));
}

// ---------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------

export default function ScaleDrills() {
  /**
   * WHICH HAND FIRST, ASKED BEFORE THE DRILL OPENS.
   *
   * A tap used to open the modal at the start of its left → right →
   * both walk. `choosing` is the cell whose chooser is up; `openCell`
   * is the drill that was actually asked for, with the hands it will
   * run.
   */
  const [choosing, setChoosing] = useState<ScaleCell | null>(null);
  const [openCell, setOpenCell] = useState<
    { cell: ScaleCell; hands: readonly DrillHand[] } | null
  >(null);

  const spacingRows = useLiveQuery<SpacingState[]>(
    () => db.spacingState
      .where('moduleRef').equals('shapes-and-patterns')
      .toArray(),
    [],
  ) ?? [];

  /**
   * ONE INDEX, READ BY THE CELL, THE HEADING AND THE PROGRESS LINE.
   *
   * The three used to compute their own answer from the same rows and
   * arrive at different ones — see `acquisition.ts`.
   */
  const index = useMemo(() => acquisitionIndex(spacingRows), [spacingRows]);
  // The chooser names the cell it is about, so this page needs the
  // spelling the group blocks already read.
  const [spelling] = useSpelling();

  const handStagesOf = (itemRef: string) => ({
    left: index.hand(itemRef, 'left'),
    right: index.hand(itemRef, 'right'),
    both: index.hand(itemRef, 'both'),
  });

  const groups = useMemo(buildGroups, []);

  const totals = useMemo(
    () => countCells(SCALE_CELLS as ScaleCell[], index),
    [index],
  );

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-5">
      <header className="space-y-1">
        <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          Scales
        </h3>
        {/* THE COUNT IS THE CATALOG'S OWN. It was typed as `96`, which
            is right today and silently wrong the day a scale is added.

            "SCALE PATTERNS", NOT "CELLS". There are 48 scales here; the
            other 48 are the same pitch sets entered from a different
            starting point, which is why they are separate patterns and
            not repeats. */}
        <p className="text-xs text-neutral-500">
          {SCALE_CELLS.length} scale patterns across major, natural minor, and the
          two pentatonics. Color shows acquisition stage. Tap a cell to drill and
          rate Struggled / Working on it / Clean / In flow.
        </p>
      </header>

      <ProgressSummary counts={totals} />

      <div className="space-y-6">
        {groups.map(group => (
          <ScaleGroupBlock
            key={group.kind}
            group={group}
            index={index}
            handStagesOf={handStagesOf}
            onCellClick={setChoosing}
          />
        ))}
      </div>

      <Legend />

      {choosing && (
        <HandChooser
          title={scaleCellLabel(choosing, spelling)}
          hands={handStagesOf(choosing.itemRef)}
          cell={index.cell(choosing.itemRef)}
          onClose={() => setChoosing(null)}
          onChoose={hands => {
            setOpenCell({ cell: choosing, hands });
            setChoosing(null);
          }}
        />
      )}

      {openCell && (
        /* ONE HAND PER SESSION NOW. The old modal walked the hands it
           was given in order, one countdown each; the shell is a
           SESSION on one skill, and a hand is a skill. So the chooser
           opens the session for the hand you picked, and All Three
           opens three sessions in turn — see `handQueue`. */
        <PracticeTestPanel
          key={openCell.hands[0]}
          surface={scaleSurface({
            cellLabel: scaleCellLabel(openCell.cell, spelling),
            skillLabel: HAND_LABEL[openCell.hands[0]],
            itemRef: openCell.cell.itemRef,
            hand: openCell.hands[0],
          })}
          onClose={() => {
            const rest = openCell.hands.slice(1);
            setOpenCell(rest.length
              ? { cell: openCell.cell, hands: rest }
              : null);
          }}
        />
      )}
    </section>
  );
}

function ProgressSummary({ counts }: { counts: AcquisitionCounts }) {
  return (
    <div className="rounded-md border border-black/[0.07] p-2.5 flex items-baseline gap-3 flex-wrap text-xs">
      <span className="text-neutral-500">Progress</span>
      <span className="font-mono">
        <span className="text-mastered font-medium">{counts.acquired}</span>
        <span className="text-neutral-400"> Acquired</span>
        {' · '}
        <span className="text-developing font-medium">{counts.inProgress}</span>
        <span className="text-neutral-400"> In Progress</span>
        {' · '}
        <span className="text-neutral-500 font-medium">{counts.notStarted}</span>
        <span className="text-neutral-400"> Not Started</span>
      </span>
      <span className="text-neutral-400 ml-auto">{counts.total} scale patterns</span>
    </div>
  );
}

function ScaleGroupBlock({
  group,
  index,
  handStagesOf,
  onCellClick,
}: {
  group: ScaleGroup;
  index: AcquisitionIndex;
  handStagesOf: (itemRef: string) => {
    left: AcquisitionBucket; right: AcquisitionBucket; both: AcquisitionBucket;
  };
  onCellClick: (cell: ScaleCell) => void;
}) {
  const [spelling] = useSpelling();
  const groupCells = group.rows.flatMap(r => r.cells);
  const counts = countCells(groupCells, index);

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
                className="text-[10px] tracking-wide text-neutral-500 text-center font-mono"
              >
                {/* Label only. CIRCLE_OF_FOURTHS is still the identity
                    vocabulary the cells are keyed on. */}
                {spellKey(k, spelling)}
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
              {row.cells.map(cell => {
                const hands = handStagesOf(cell.itemRef);
                return (
                  <ThreeBandCell
                    key={cell.itemRef}
                    left={hands.left}
                    right={hands.right}
                    both={hands.both}
                    title={`${scaleCellLabel(cell, spelling)} — LH / RH / Both`}
                    onClick={() => onCellClick(cell)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] text-neutral-500">
      {/* "Status", not "Legend". The heading is what marks the three
          words after it as status words — one qualifier governing the
          list, rather than bolding every item in a three-item row
          where there is no ordinary English for them to hide in. */}
      <span>Status</span>
      <LegendChip bucket="not-started" />
      <LegendChip bucket="in-progress" />
      <LegendChip bucket="acquired" />
    </div>
  );
}

function LegendChip({ bucket }: { bucket: AcquisitionBucket }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 rounded-sm border ${STAGE_BG[bucket]}`} aria-hidden />
      <span>{STAGE_LEGEND_LABEL[bucket]}</span>
    </span>
  );
}
