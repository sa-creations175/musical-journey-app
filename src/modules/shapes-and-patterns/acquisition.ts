/**
 * What "acquired" means in Shapes & Patterns — once, for every surface.
 *
 * =====================================================================
 * THREE SURFACES GAVE THREE ANSWERS ABOUT THE SAME CELL.
 *
 * The Scales matrix drew a cell from all three of its hands, so a cell
 * worked left and right showed as in progress. The Progress line above
 * it and each group's "n/96 acquired" heading counted only rows where
 * `hand === 'both'`, so the same cell counted as not started. The
 * module home card counted distinct itemRefs and ignored the hand
 * entirely, so it counted as touched. One cell, three readings, and
 * nothing on screen said which to believe.
 *
 * THE RULE, and it is the only one now:
 *
 *   not started   no spacingState row for any hand
 *   in progress   at least one hand has a row, but not all are acquired
 *   acquired      every hand the item is drilled on is acquired
 *
 * =====================================================================
 * "EVERY HAND THE ITEM IS DRILLED ON" IS NOT ALWAYS THREE.
 *
 * Scales and chord shapes run left, then right, then both. Voice
 * leading is two-handed by nature and only ever writes `both`; mental
 * visualisation has no hand dimension at all. Requiring left and right
 * of those would make them permanently unacquirable — a cell that can
 * never go green because the rows it is waiting for cannot exist.
 *
 * So the hand list comes from `shapesItemHandCount`, which is already
 * the app's answer to "does this itemRef have a hand dimension" and is
 * what the session budget reads. One fact, one place.
 * =====================================================================
 */
import type { AcquisitionStage, DrillHand, SpacingState } from '../../lib/db';
import { shapesItemHandCount } from '../../lib/sessionAlgorithm/timePerAttempt';

export type AcquisitionBucket = 'not-started' | 'in-progress' | 'acquired';

/** The order a drill runs the hands in, and the order bars read. */
export const HAND_ORDER: ReadonlyArray<DrillHand> = ['left', 'right', 'both'];

/** Two-handed items write this one row and nothing else. */
const BOTH_ONLY: ReadonlyArray<DrillHand> = ['both'];

/**
 * Collapse the spacing ladder into the three buckets every S&P grid
 * paints with. `acquired+` — consolidated, mastered — all read as
 * acquired: a cell's colour is about acquisition, not about longer-term
 * decay, which the spacing curve carries separately.
 */
export function bucketForStage(
  stage: AcquisitionStage | null | undefined,
): AcquisitionBucket {
  if (stage === 'acquired' || stage === 'consolidated' || stage === 'mastered') {
    return 'acquired';
  }
  if (stage === undefined || stage === null) return 'not-started';
  return 'in-progress';
}

/** The hands this itemRef is drilled on, in drill order. */
export function handsFor(itemRef: string): ReadonlyArray<DrillHand> {
  return shapesItemHandCount(itemRef) > 1 ? HAND_ORDER : BOTH_ONLY;
}

export interface AcquisitionCounts {
  total: number;
  acquired: number;
  inProgress: number;
  notStarted: number;
}

/**
 * The rows, indexed so a surface can ask about a cell or one of its
 * hands without walking the table again.
 *
 * ONE HAND, ONE ROW. This used to say a hand could hold more than one,
 * because chord shapes were drilled solid AND arpeggiated with a
 * spacing row each, and "this hand is acquired" meant every row logged
 * for it was. The arpeggiated dimension is retired — practice can be
 * broken or blocked, a test is always blocked, and proficiency comes
 * only from testing — so the manner no longer forks the rating and a
 * hand has exactly one row again.
 *
 * The reduce below is kept over the whole list rather than reading
 * `[0]`, because a duplicate row is possible in principle and the
 * lower answer is the safe one. It is not there to express a rule any
 * more; it is there so a stray row cannot silently promote a hand.
 */
export interface AcquisitionIndex {
  /** Every itemRef with at least one row. */
  touched: ReadonlySet<string>;
  /** One hand of one item. */
  hand: (itemRef: string, hand: DrillHand) => AcquisitionBucket;
  /** The whole cell — the rule at the top of this file. */
  cell: (itemRef: string) => AcquisitionBucket;
  /** How the given items divide across the three buckets. */
  count: (itemRefs: readonly string[]) => AcquisitionCounts;
}

export function acquisitionIndex(
  rows: readonly SpacingState[],
): AcquisitionIndex {
  const stagesByHand = new Map<string, AcquisitionStage[]>();
  const touched = new Set<string>();
  for (const r of rows) {
    touched.add(r.itemRef);
    const key = `${r.itemRef} ${r.hand}`;
    const list = stagesByHand.get(key);
    if (list) list.push(r.acquisitionStage);
    else stagesByHand.set(key, [r.acquisitionStage]);
  }

  const hand = (itemRef: string, h: DrillHand): AcquisitionBucket => {
    const stages = stagesByHand.get(`${itemRef} ${h}`);
    if (stages === undefined || stages.length === 0) return 'not-started';
    return stages.every(s => bucketForStage(s) === 'acquired')
      ? 'acquired'
      : 'in-progress';
  };

  const cell = (itemRef: string): AcquisitionBucket => {
    if (!touched.has(itemRef)) return 'not-started';
    const hands = handsFor(itemRef);
    return hands.every(h => hand(itemRef, h) === 'acquired')
      ? 'acquired'
      : 'in-progress';
  };

  const count = (itemRefs: readonly string[]): AcquisitionCounts => {
    const out: AcquisitionCounts = {
      total: itemRefs.length, acquired: 0, inProgress: 0, notStarted: 0,
    };
    for (const ref of itemRefs) {
      const bucket = cell(ref);
      if (bucket === 'acquired') out.acquired += 1;
      else if (bucket === 'in-progress') out.inProgress += 1;
      else out.notStarted += 1;
    }
    return out;
  };

  return { touched, hand, cell, count };
}

/**
 * One hand's share of a group, for the per-hand bars on a card.
 *
 * Reported as counts rather than percentages so the bar and any number
 * beside it are drawn from the same figures.
 */
export function handCounts(
  index: AcquisitionIndex,
  itemRefs: readonly string[],
  hand: DrillHand,
): AcquisitionCounts {
  const out: AcquisitionCounts = {
    total: itemRefs.length, acquired: 0, inProgress: 0, notStarted: 0,
  };
  for (const ref of itemRefs) {
    const bucket = index.hand(ref, hand);
    if (bucket === 'acquired') out.acquired += 1;
    else if (bucket === 'in-progress') out.inProgress += 1;
    else out.notStarted += 1;
  }
  return out;
}
