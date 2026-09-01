/**
 * Scales section of the S&P module — Part 5 of the Scales
 * submodule build (src/docs/SCALES_SUBMODULE_DESIGN.md).
 *
 * Shows every scale pattern in the scaleSkills catalog, grouped by
 * scale kind, color-coded by acquisitionStage. Pentatonic groups
 * fan out to one row per starting point (1/5/6 for major, 1/b3/b7
 * for minor) so the user can see per-sp progress at a glance.
 *
 * Tapping a cell fills Progress Details below it; a hand inside that
 * opens the Practice/Test panel — the same panel chord shapes,
 * voice-leading, songs and the in-session runner all use. There is no
 * second way to run a scale drill any more.
 *
 * No DrillSkill / DrillType / DrillSession rows are written by
 * this surface — the Scales catalog is static, spacingState is
 * the canonical signal, and there are no per-cell drill-type
 * subdivisions to pick from.
 */
import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DrillSession, type DrillSkill, type SpacingState } from '../../lib/db';
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
import { circleOfFourthsIndex } from '../repertoire/circleOfFourths';
import { spellKey } from '../../lib/spelling';
import { useSpelling } from '../../lib/spellingPref';
import PracticeTestPanel from './practiceTest/PracticeTestPanel';
import { scaleSurface } from './practiceTest/makeSurfaces';
import { bandCellClasses } from './BandCell';
import KeyedGrid, {
  DEFAULT_LAYOUT, LayoutToggle, type Layout,
} from './KeyedGrid';
import { scrollSectionToTop } from '../../lib/scrollSectionToTop';
import {
  countFluentPlusTargets, itemCellTargets, rowsByRefHand, sectionTargets,
  targetKey, targetsAcrossKeys, verdictForTargets,
} from './cellTargets';
import { cellProgress, sessionSecondsById } from './handProgress';
import { sessionsByTarget } from './timeInvested';
import CellProgressDetails, {
  HAND_ROW_LABEL, type DetailTarget,
} from './CellProgressDetails';
import { NOT_STARTED, bandVerdictLabel, type BandVerdict } from '../../lib/spacing/banding';
import type { DrillHand } from '../../lib/db';

/** WHAT A SQUARE SAYS LIVES IN `BandCell` NOW. This file used to
 *  carry its own bucket palette and its own three legend words — the
 *  last place the retired acquisition vocabulary was drawn on a grid.
 *
 *  The Progress line, the per-group heading and the hand chooser still
 *  speak it, and are deliberately left: their replacements are copy,
 *  and copy is not mine to write. */

const HAND_LABEL: Readonly<Record<DrillHand, string>> = {
  left: 'Left Hand',
  right: 'Right Hand',
  both: 'Both Hands',
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

/** Cells in wheel order. The ordering itself is shared — see
 *  `circleOfFourthsIndex`; this only says which field carries the key. */
function sortByCircleOfFourths(cells: ScaleCell[]): ScaleCell[] {
  return [...cells].sort(
    (a, b) => circleOfFourthsIndex(a.keyName) - circleOfFourthsIndex(b.keyName),
  );
}

// ---------------------------------------------------------------------
// Progress summary
// ---------------------------------------------------------------------


// ---------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------

type RollupRule = 'furthest' | 'lowest';

/**
 * The scales grid, and everything about the cell you pick.
 *
 * =====================================================================
 * A CELL NAMES ITS STATUS. It was a square shaded by time invested,
 * which told you something had happened without saying what — and the
 * six words exist precisely so a reader never has to translate a colour
 * into a claim.
 *
 * A cell holds three targets: left hand, right hand, both hands, always
 * two octaves. Its status is the roll-up of the ones STILL COUNTED,
 * furthest by default.
 *
 * =====================================================================
 * REARRANGE IS PAGE STATE, AND ONLY PAGE STATE.
 *
 * The order survives switching layouts and picking cells; it does not
 * survive a reload. Holding it across visits is a stored value and a
 * stored value is not this commit's to add.
 * =====================================================================
 */
export default function ScaleDrills() {
  const [rule, setRule] = useState<RollupRule>('furthest');
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [arranging, setArranging] = useState(false);
  const [selected, setSelected] = useState<ScaleCell | null>(null);
  const [notCounted, setNotCounted] = useState<ReadonlySet<string>>(new Set());
  const [drilling, setDrilling] = useState<
    { cell: ScaleCell; hand: DrillHand } | null
  >(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [now] = useState(() => Date.now());

  const groups = useMemo(buildGroups, []);
  const [order, setOrder] = useState<number[]>(() => groups.map((_, i) => i));

  const spacingRows = useLiveQuery<SpacingState[]>(
    () => db.spacingState
      .where('moduleRef').equals('shapes-and-patterns')
      .toArray(),
    [],
  ) ?? [];
  const sessions = useLiveQuery<DrillSession[]>(
    () => db.drillSessions.toArray(),
    [],
  ) ?? [];
  /** Read even though scales name their own skill id: it is what makes
   *  this THE SAME CALL the module card makes, rather than a second
   *  one that happens to agree on scales. */
  const drillSkills = useLiveQuery<DrillSkill[]>(
    () => db.drillSkills.toArray(),
    [],
  ) ?? [];

  const byRefHand = useMemo(() => rowsByRefHand(spacingRows), [spacingRows]);
  /** THE ONE WALK, shared with the card. See `sessionsByTarget`. */
  const byTarget = useMemo(
    () => sessionsByTarget(sessions, drillSkills),
    [sessions, drillSkills],
  );
  const [spelling] = useSpelling();

  /** A hand is out of the score by cell AND hand — the three share an
   *  itemRef, so a key on the ref alone would take all three out.
   *  `targetKey` is the shared spelling, so the set this page builds is
   *  the set every counting surface reads. */
  const countedTargets = (cell: ScaleCell) =>
    itemCellTargets(cell.itemRef).filter(t => !notCounted.has(targetKey(t.itemRef, t.hand)));

  /**
   * A cell's status: the roll-up of the hands still counted.
   *
   * `verdictForTargets` is the furthest of them, which is the default
   * and the shared reader. Lowest asks the same rows the other way
   * round rather than through a second index.
   */
  const cellVerdict = (cell: ScaleCell): BandVerdict => {
    const targets = countedTargets(cell);
    if (targets.length === 0) return NOT_STARTED;
    return verdictForTargets(targets, byRefHand, rule);
  };

  /**
   * The progress line, in DRILLS.
   *
   * Both halves count targets — a scale cell is three drills, one per
   * hand — and both drop when a hand is taken out of the score. A
   * numerator counting cells over a denominator counting drills would
   * be the bug this rebuild exists to remove.
   */
  const totals = useMemo(
    () => countFluentPlusTargets(sectionTargets('scales', notCounted), byRefHand),
    [byRefHand, notCounted],
  );

  const pickCell = (cell: ScaleCell) => {
    setSelected(cell);
    // THE ANSWER GOES WHERE YOU ARE LOOKING — at the TOP of the screen,
    // clear of the sticky header, with the detail under it. See
    // `scrollSectionToTop`.
    scrollSectionToTop(detailRef.current);
  };

  /**
   * The cell's targets, as the detail section takes them.
   *
   * A SCALE CELL IS THREE HANDS. `cellProgress` returns them in the
   * catalog's order, so zipping is safe — and the row's name is the
   * hand's, because for a scale the hand IS the whole difference
   * between one target and the next.
   */
  const selectedTargets: DetailTarget[] = useMemo(() => {
    if (!selected) return [];
    const targets = itemCellTargets(selected.itemRef);
    const progress = cellProgress(targets, spacingRows, byTarget);
    return targets.map((t, i) => ({
      key: targetKey(t.itemRef, t.hand),
      label: HAND_ROW_LABEL[t.hand],
      hand: t.hand,
      progress: progress[i],
    }));
  }, [selected, spacingRows, byTarget]);

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)] backdrop-blur p-3 sm:p-5 space-y-5">
      <header className="space-y-1">
        <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          Scales
        </h3>
        <p className="text-xs text-neutral-500 leading-snug">
          Scale patterns across major, natural minor and the two pentatonics.
          Every cell names where that pattern stands in that key, across left
          hand, right hand and both hands.
        </p>
        <p className="text-xs text-neutral-500">
          Progress — {totals.fluentPlus} of {totals.total} Fluent+
        </p>
      </header>

      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <span className="uppercase tracking-wider font-semibold text-neutral-400">
          Cell reads as
        </span>
        {(['furthest', 'lowest'] as const).map(r => (
          <Toggle key={r} on={rule === r} onClick={() => setRule(r)}>
            {r === 'furthest' ? 'Furthest' : 'Lowest'}
          </Toggle>
        ))}
        <span className="ml-2 inline-flex items-center gap-2 flex-wrap">
          <LayoutToggle layout={layout} onChange={setLayout} />
        </span>
        <span className="uppercase tracking-wider font-semibold text-neutral-400 ml-2">
          Page
        </span>
        <Toggle on={arranging} onClick={() => setArranging(a => !a)}>
          {arranging ? 'Done rearranging' : 'Rearrange'}
        </Toggle>
      </div>

      <div className="space-y-6">
        {order.map((gi, pos) => {
          const group = groups[gi];
          if (!group) return null;
          const cells = group.rows.flatMap(r => r.cells);
          // THE HEADING COUNTS DRILLS, like the line above it. The
          // GRID still draws one square per cell — a square is a place
          // to look, a target is a thing to do.
          const groupTargets = cells.flatMap(countedTargets);
          const { total: groupTotal, fluentPlus } =
            countFluentPlusTargets(groupTargets, byRefHand);
          return (
            <div key={group.kind} className="space-y-2">
              <div className="flex items-baseline gap-2 flex-wrap">
                {arranging && (
                  <span className="inline-flex gap-1">
                    <MoveButton
                      dir="up"
                      disabled={pos === 0}
                      onClick={() => setOrder(o => swap(o, pos, pos - 1))}
                    />
                    <MoveButton
                      dir="down"
                      disabled={pos === order.length - 1}
                      onClick={() => setOrder(o => swap(o, pos, pos + 1))}
                    />
                  </span>
                )}
                <span className="text-sm font-medium">{group.label}</span>
                <span className="text-[11px] text-neutral-500">
                  {fluentPlus}/{groupTotal} Fluent+
                </span>
              </div>
              {group.description && (
                <p className="text-[11px] text-neutral-500">{group.description}</p>
              )}
              <KeyedGrid
                rows={group.rows.map(r => ({ rowKey: r.rowKey, label: r.rowLabel }))}
                keys={CIRCLE_OF_FOURTHS}
                layout={layout}
                spelling={spelling}
                renderCell={(rowKey, keyName, showKeyLabel) => {
                  const row = group.rows.find(r => r.rowKey === rowKey);
                  const cell = row?.cells.find(c => c.keyName === keyName);
                  if (!cell) return null;
                  return (
                    <StatusCell
                      cell={cell}
                      verdict={cellVerdict(cell)}
                      selected={cell.itemRef === selected?.itemRef}
                      onPick={pickCell}
                      keyLabel={showKeyLabel ? spellKey(keyName, spelling) : undefined}
                    />
                  );
                }}
              />
            </div>
          );
        })}
      </div>

      <CellProgressDetails
        ref={detailRef}
        cellLabel={selected ? scaleCellLabel(selected, spelling) : null}
        targets={selectedTargets}
        verdict={selected ? cellVerdict(selected) : NOT_STARTED}
        rollup={{ ruleWord: rule, unitLabel: 'hands' }}
        note="Two octaves, always."
        notCounted={notCounted}
        /* THE SITTINGS, OVER EVERY ROW — a sitting is a sitting
           whatever cell or hand it touched, so the totals are built
           once from all of them rather than per hand. */
        sessionSeconds={sessionSecondsById(sessions)}
        onToggleCounted={key => setNotCounted(prev => toggled(prev, key))}
        /* THE WIDER GESTURE, spelled the same way the narrow one is:
           a set of target keys, written all at once. See
           `applyAcrossKeys` — twelve exclusions, not a rule. */
        onApplyToEveryKey={(key, nowOut) =>
          setNotCounted(prev => applyAcrossKeys(prev, key, nowOut))}
        onDrill={key => {
          const target = selectedTargets.find(t => t.key === key);
          if (selected && target) setDrilling({ cell: selected, hand: target.hand });
        }}
        now={now}
      />

      {drilling && (
        /* THE SAME PANEL EVERY OTHER MODULE OPENS. It asks Practice or
           Test, then runs the session — drill settings and rating on
           one screen, the run ended before it is rated. */
        <PracticeTestPanel
          key={`${drilling.cell.itemRef} ${drilling.hand}`}
          surface={scaleSurface({
            cellLabel: scaleCellLabel(drilling.cell, spelling),
            skillLabel: HAND_LABEL[drilling.hand],
            itemRef: drilling.cell.itemRef,
            hand: drilling.hand,
          })}
          onClose={() => setDrilling(null)}
        />
      )}
    </section>
  );
}

/** `rank` LIVED HERE, and both roll-up rules live in `rollup.ts` now.
 *  This file's copy answered the lowest-of question while the shared
 *  reader answered the furthest one — so the two toggles returned the
 *  same word, and the Furthest control did nothing at all. */

/** In or out of the score, by target key. Nothing is deleted. */
function toggled(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

/**
 * The same change, to the same target, in every key of its row.
 *
 * =====================================================================
 * TWELVE EXCLUSIONS, NOT A RULE.
 *
 * It writes exactly what twelve clicks would have written, into the
 * same set every counting surface already reads. Nothing new is
 * stored and nothing new has to be consulted: the card, the grid,
 * every goal denominator and the session generator's scope all take a
 * set of target keys today, and they take this one.
 *
 * WHAT THAT COSTS, stated because it is real: a key added to the
 * catalog later does NOT inherit the change. There are twelve and
 * there have always been twelve, so the cost is theoretical — and
 * what it buys is that afterwards this is per cell again, so ONE key
 * can be put back without unpicking anything.
 *
 * SET, NOT TOGGLE. Every sibling ends up in the state the one you
 * clicked ended up in, so a row that was already half out comes out
 * whole rather than inverting into a stripe.
 * =====================================================================
 */
function applyAcrossKeys(
  set: ReadonlySet<string>, key: string, nowOut: boolean,
): ReadonlySet<string> {
  const next = new Set(set);
  for (const sibling of targetsAcrossKeys(key)) {
    if (nowOut) next.add(sibling); else next.delete(sibling);
  }
  return next;
}

function swap(order: number[], a: number, b: number): number[] {
  const next = order.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

function Toggle({ on, onClick, children }: {
  on: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={[
        'px-2 py-1 rounded-md border',
        on
          ? 'bg-fluent text-white border-fluent font-semibold'
          : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function MoveButton({ dir, disabled, onClick }: {
  dir: 'up' | 'down'; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'up' ? 'Move section up' : 'Move section down'}
      className="px-1 text-[10px] text-neutral-500 hover:text-fluent disabled:opacity-30"
    >
      {dir === 'up' ? '\u25b2' : '\u25bc'}
    </button>
  );
}

/**
 * One cell, naming its status.
 *
 * THE WORD IS ON THE TILE, not only in a legend. A grid of colours asks
 * the reader to hold a key in their head while they scan it; the six
 * words are short enough to print.
 */
function StatusCell({ cell, verdict, selected, onPick, keyLabel }: {
  cell: ScaleCell;
  verdict: BandVerdict;
  selected: boolean;
  onPick: (cell: ScaleCell) => void;
  keyLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(cell)}
      aria-pressed={selected}
      // NO `border` HERE. The fill is solid now and an outline round it
      // would draw a grey ring on every painted cell; Not Started
      // brings its own dashed one from `bandCellClasses`.
      className={[
        'px-1.5 py-1 rounded-md text-[10px] leading-tight text-left min-w-[5.5rem]',
        bandCellClasses(verdict),
        selected ? 'ring-2 ring-fluent ring-offset-1' : '',
      ].join(' ')}
    >
      {keyLabel && <span className="block font-mono opacity-70">{keyLabel}</span>}
      <span className="block font-medium">{bandVerdictLabel(verdict)}</span>
    </button>
  );
}
