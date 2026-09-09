/**
 * What is underneath a square.
 *
 * =====================================================================
 * A SQUARE'S TARGETS ARE WHAT IT IS FOR, NOT WHAT HAS BEEN DRILLED.
 *
 * The grids paint one square per (row × key), and each square stands
 * for more than one spacing row:
 *
 *   chord shape   inversion states × hands   — twelve for a triad
 *   scale         hands                      — three
 *   voice leading one row                    — two-handed by nature
 *
 * The square's word is the LOWEST of those, and that only means
 * anything if untouched targets are counted. Enumerating from the rows
 * that happen to exist would let one Mastered inversion speak for the
 * eleven nobody has opened. So the list comes from the catalog, and
 * `rollUpTargets` is handed `undefined` wherever there is no row.
 * =====================================================================
 *
 * =====================================================================
 * SUPPLEMENTARY IS NOT ONE OF THEM, AND THAT IS NOW THE WHOLE APP'S
 * ANSWER RATHER THAN THIS FILE'S.
 *
 * The supplementary state is the left-hand root under a right-hand
 * triad. It is NOT a distinct shape to own: the triad is already
 * drilled on its own, and the left hand is one note. It is a
 * combination of two things already counted, not a new hand skill.
 *
 * A real voicing — root, third and flat seven in the left hand — IS a
 * different thing, and it belongs with voice leading rather than here.
 *
 * THIS REVERSES THE 20 AUGUST 2026 RULING, which put supplementary
 * into the score on the grounds that the LH-root + RH-triad voicing is
 * how a seventh actually gets played. The chord-shape catalog was 720
 * under that ruling and is 1944 under this one — the difference is
 * those 72 rows leaving, and the hand axis arriving. See
 * `catalog.ts`'s note where the first ruling was recorded.
 * =====================================================================
 */
import type { DrillHand, SpacingState } from '../../lib/db';
import {
  isFluentPlus, rollUpTargets, rollUpTargetsFurthest,
} from '../../lib/spacing/rollup';
import { bandVerdictForRow } from '../../lib/spacing/row';
import type { BandVerdict } from '../../lib/spacing/banding';
import {
  CHORD_QUALITIES,
  CHORD_QUALITY_BY_ID,
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  KEYS,
  VOICE_LEADING_PATTERNS,
  enumerateVoiceLeadingCells,
} from './catalog';
import { SCALE_CELLS } from './scaleSkills';
import { movementCellRefs } from './movements/movementCells';
import { MENTAL_VIZ_ITEMS } from './mentalVizLibrary';
import { HAND_ORDER, handsFor } from './acquisition';

/** One thing a square is waiting on. */
export interface CellTarget {
  itemRef: string;
  hand: DrillHand;
}

/**
 * A chord square's targets: every acquisition-path inversion state for
 * the quality, across all three hands.
 *
 * Extensions and specials have no inversion state and their itemRef has
 * no fourth segment — `INVERSION_STATES_FOR_CHORD_SHAPE_KIND` says
 * `[null]` for both, which is what produces the bare ref here.
 */
export function chordCellTargets(quality: string, keyName: string): CellTarget[] {
  const kind = CHORD_QUALITY_BY_ID.get(quality)?.kind ?? 'special';
  const base = `chord-shape:${quality}:${keyName}`;
  const out: CellTarget[] = [];
  for (const state of INVERSION_STATES_FOR_CHORD_SHAPE_KIND[kind]) {
    if (state === 'supplementary') continue;
    const itemRef = state === null ? base : `${base}:${state}`;
    for (const hand of HAND_ORDER) out.push({ itemRef, hand });
  }
  return out;
}

/**
 * A square with one itemRef: every hand that itemRef is drilled on.
 *
 * The hand list comes from `handsFor`, which is the app's one answer to
 * whether an itemRef has a hand dimension at all. Voice leading and
 * mental visualisation come back with `both` alone — asking them for a
 * left hand would hold their squares at Started forever, waiting on a
 * row that cannot exist.
 */
export function itemCellTargets(itemRef: string): CellTarget[] {
  return handsFor(itemRef).map(hand => ({ itemRef, hand }));
}

/** `${itemRef} ${hand}` → the row, for the lookups below. */
export function rowsByRefHand(
  rows: readonly SpacingState[],
): ReadonlyMap<string, SpacingState> {
  const m = new Map<string, SpacingState>();
  for (const r of rows) m.set(`${r.itemRef} ${r.hand}`, r);
  return m;
}

/**
 * Which way a square reads its targets.
 *
 * FURTHEST is the grids' default — as high as the best target under
 * it — and LOWEST is one tap away. See `rollUpVerdicts` and
 * `rollUpVerdictsFurthest`, which hold the two rules.
 */
export type RollupRule = 'furthest' | 'lowest';

/**
 * The square's one word, given its targets and the rows in hand.
 *
 * BOTH RULES COME FROM `rollup.ts`. Every grid used to hand-roll the
 * furthest half — a reduce over a local rank table — while asking the
 * shared reader for the lowest one, so "Furthest" and "Lowest" could
 * (and on the scales page did) return the same answer.
 */
export function verdictForTargets(
  targets: readonly CellTarget[],
  byRefHand: ReadonlyMap<string, SpacingState>,
  rule: RollupRule = 'lowest',
): BandVerdict {
  const rows = targets.map(t => byRefHand.get(targetKey(t.itemRef, t.hand)));
  return rule === 'furthest' ? rollUpTargetsFurthest(rows) : rollUpTargets(rows);
}

// =====================================================================
// Whole sections
// =====================================================================

/**
 * Every cell in a section, each as its own target list.
 *
 * =====================================================================
 * THE CARD AND THE GRID COUNT THE SAME THINGS OR THEY DISAGREE.
 *
 * The module card used to count spacing ROWS by itemRef prefix and ask
 * `acquisitionIndex.cell` about each — one itemRef, all its hands. The
 * grids draw CELLS, and for chord shapes a cell is four inversion
 * states across three hands, so the card was counting roughly four
 * things for every one thing the grid drew. Both were honest; they
 * were answers to different questions printed as if they were the
 * same one.
 *
 * So the enumeration lives here, once, and both read it.
 *
 * IT COMES FROM THE CATALOG, NOT FROM THE DATABASE. A section's cells
 * exist whether or not they have been drilled — that is what makes a
 * denominator a denominator, and what stops an untouched cell being
 * quietly left out of the count that is supposed to include it.
 * =====================================================================
 */
export function sectionCells(
  section: SectionId, outOfScore: OutOfScore = NOTHING_OUT,
): CellTarget[][] {
  const cells = allSectionCells(section);
  if (outOfScore.size === 0) return cells;
  // A CELL WITH EVERY TARGET OUT STAYS ON THE GRID as an empty cell.
  // The square is still drawn — it is a thing that exists that you are
  // not working on — and it contributes no targets to any count.
  return cells.map(targets => targets.filter(t => inScore(t, outOfScore)));
}

/**
 * EVERY DRILLABLE THING IN A SECTION, flat, and still in the score.
 *
 * =====================================================================
 * THIS IS THE COUNTING UNIT, AND IT IS THE ONLY ONE.
 *
 * The card, the grid's progress line, `shapesCounts`, every goal
 * denominator and the session generator's scope all come off this. A
 * cell was the unit for the card and the grid; an itemRef with no hand
 * axis was the unit for goals. Neither is a thing you sit down and
 * drill — a scale cell is three drills, one per hand, and a triad cell
 * is twelve.
 *
 * They have to be connected or they drift, and they had drifted: the
 * goal NUMERATOR counts spacingState rows, which are per hand, against
 * a denominator that had none — so a chord-shape coverage goal could
 * read over 100%.
 * =====================================================================
 */
/**
 * `movementIds` — the movements the caller has in hand, whose cells
 * belong to `voice-leading` (ruling 20).
 *
 * AN ARGUMENT, NOT A READ. Everything in this file is pure and
 * synchronous — the goals encoder, the coverage denominators and the
 * grids all call it during a render — and a movement lives in Dexie. So
 * a caller that has the list passes it and a caller that has not gets
 * exactly today's answer. Which callers pass it is a fact about them,
 * and it is stated where they do.
 */
export function sectionTargets(
  section: SectionId,
  outOfScore: OutOfScore = NOTHING_OUT,
  movementIds: readonly string[] = [],
): CellTarget[] {
  const flat = allSectionCells(section, movementIds).flat();
  return outOfScore.size === 0 ? flat : flat.filter(t => inScore(t, outOfScore));
}

/** How many drillable things a section holds, still in the score. */
export function sectionTargetCount(
  section: SectionId,
  outOfScore: OutOfScore = NOTHING_OUT,
  movementIds: readonly string[] = [],
): number {
  return sectionTargets(section, outOfScore, movementIds).length;
}

/**
 * The same target, in every key of the row it sits in.
 *
 * =====================================================================
 * THE KEY IS THE AXIS, AND THE ROW IS THE LIMIT.
 *
 * Taking a target out of the score is per cell, and doing that to
 * left-hand second inversion in all twelve keys is seventy-two clicks.
 * So the wider gesture spreads a change along the ONE axis the grids
 * lay out horizontally: the key.
 *
 * WHAT IT DOES NOT SPREAD ALONG is everything else. Left-hand second
 * inversion out of C major seven reaches major sevens in twelve keys —
 * not minor sevens, not the other inversions, not the other hands. The
 * row you are in is the row it applies to, because the row is what the
 * reader is looking at when they ask.
 *
 * COMPUTED FROM THE CATALOG, not by editing the key out of a string.
 * A scale's key is the last segment of a three-part ref and of a
 * four-part one; a chord's is the third of four. Rebuilding a ref by
 * position is how a pentatonic starting point silently becomes a key.
 *
 * The target itself is always in the list, so a caller can apply one
 * change to all of them without special-casing where it started.
 * =====================================================================
 */
export function targetsAcrossKeys(key: string): string[] {
  const hand = key.slice(key.lastIndexOf(' ') + 1) as DrillHand;
  const itemRef = key.slice(0, key.lastIndexOf(' '));

  if (itemRef.startsWith('chord-shape:')) {
    const [, quality, , state] = itemRef.split(':');
    if (!quality) return [key];
    return KEYS.flatMap(k => chordCellTargets(quality, k)
      .filter(t => (t.itemRef.split(':')[3] ?? null) === (state ?? null)
        && t.hand === hand)
      .map(t => targetKey(t.itemRef, t.hand)));
  }

  if (itemRef.startsWith('scale:')) {
    const here = SCALE_CELLS.find(c => c.itemRef === itemRef);
    if (here === undefined) return [key];
    return SCALE_CELLS
      .filter(c => c.kind === here.kind && c.startingPoint === here.startingPoint)
      .map(c => targetKey(c.itemRef, hand));
  }

  // VOICE LEADING AND MENTAL VISUALISATION HAVE NO WIDER GESTURE.
  // A voice-leading cell holds one target and offers no Edit what
  // counts at all, so nothing can reach here for one — and answering
  // "just this one" is the honest answer rather than an error.
  return [key];
}

/**
 * Every target in the three keyed sections — the universe a goal
 * denominator is scoped out of. Mental visualisation is excluded, per
 * the April 27 call: it counts toward consistency only.
 *
 * `movementIds` RIDES THROUGH FOR THE SAME REASON IT DOES ABOVE
 * (ruling 48). A movement is a drillable thing on the voice-leading
 * section, so drilling one writes spacing rows that a coverage
 * NUMERATOR counts. A denominator that did not count them could be
 * outrun — the failure this file's header describes, arriving from a
 * new direction. A caller with the list passes it; one without gets
 * exactly the catalog.
 */
export function shapesTargetUniverse(
  outOfScore: OutOfScore = NOTHING_OUT,
  movementIds: readonly string[] = [],
): CellTarget[] {
  return [
    ...sectionTargets('scales', outOfScore),
    ...sectionTargets('chord-shapes', outOfScore),
    ...sectionTargets('voice-leading', outOfScore, movementIds),
  ];
}

function allSectionCells(
  section: SectionId, movementIds: readonly string[] = [],
): CellTarget[][] {
  switch (section) {
    case 'scales':
      return SCALE_CELLS.map(c => itemCellTargets(c.itemRef));
    case 'chord-shapes':
      // The grid's own rows and columns: every catalog quality against
      // every key. The inversion states are INSIDE a cell, which is
      // exactly the difference this function exists to hold.
      return CHORD_QUALITIES.flatMap(
        q => KEYS.map(k => chordCellTargets(q.id, k)),
      );
    case 'voice-leading':
      return [
        ...VOICE_LEADING_PATTERNS.flatMap(
          p => KEYS.flatMap(
            k => enumerateVoiceLeadingCells(p, k).map(itemCellTargets),
          ),
        ),
        // ONE ROW EACH, TWELVE KEYS (ruling 20). A movement is a
        // drillable thing on this section exactly as a pattern is, so
        // it is part of the same denominator — the card's count, the
        // grid's total and the generator's scope all read this.
        ...movementIds.flatMap(
          id => movementCellRefs(id).map(itemCellTargets),
        ),
      ];
    case 'mental-viz':
      return MENTAL_VIZ_ITEMS.map(i => itemCellTargets(i.itemRef));
  }
}

export type SectionId = 'scales' | 'chord-shapes' | 'voice-leading' | 'mental-viz';

/** Every section, for the callers that want all of them. */
export const SECTION_IDS: ReadonlyArray<SectionId> = [
  'scales', 'chord-shapes', 'voice-leading', 'mental-viz',
];

/**
 * `${itemRef} ${hand}` — how a target is named where it has to be a
 * key: the time map, the row index, and the out-of-score set.
 */
export function targetKey(itemRef: string, hand: DrillHand): string {
  return `${itemRef} ${hand}`;
}

/**
 * What is out of the score.
 *
 * =====================================================================
 * A DENOMINATOR IS WHAT YOU ARE GOING FOR, NOT WHAT EXISTS.
 *
 * Edit what counts takes a target out — a hand of a scale, an inversion
 * of a chord — and the thing it comes out of is the SCORE: the card's
 * total, the grid's progress line, a goal's denominator and the session
 * generator's scope, all of them, or they drift. That is the whole
 * reason this is one enumeration and not five.
 *
 * A SET OF `targetKey`s, PASSED IN. It is not read from storage here
 * because these functions are pure and synchronous and the goal
 * surfaces that call them are too. Absent means nothing is out, which
 * is the honest default for a caller that has not been given the set.
 * =====================================================================
 */
export type OutOfScore = ReadonlySet<string>;

const NOTHING_OUT: OutOfScore = new Set<string>();

function inScore(t: CellTarget, outOfScore: OutOfScore): boolean {
  return !outOfScore.has(targetKey(t.itemRef, t.hand));
}

export interface FluentPlusCount {
  /** Cells in the section — the catalog's number, not the database's. */
  total: number;
  /** Cells whose every target is at Fluent or Mastered. */
  fluentPlus: number;
}

/**
 * How many of these cells are Fluent+.
 *
 * A cell counts once however many targets are under it. That is the
 * whole point: twelve targets at Mastered is ONE Fluent+ chord cell,
 * not twelve, and eleven at Mastered with one untouched is none —
 * `rollUpTargets` takes the lowest, so the cell is Started.
 */
/**
 * How many TARGETS are at Fluent or Mastered, out of how many the
 * section still holds.
 *
 * THE NUMERATOR AND THE DENOMINATOR COUNT THE SAME KIND OF THING.
 * `countFluentPlus` below counts CELLS — a chord cell is one whether it
 * holds four targets or twelve — which is the right unit for "how many
 * squares are green" and the wrong one for "how much of what I am going
 * for have I got". The card and the progress line ask the second.
 */
export function countFluentPlusTargets(
  targets: ReadonlyArray<CellTarget>,
  byRefHand: ReadonlyMap<string, SpacingState>,
): FluentPlusCount {
  let fluentPlus = 0;
  for (const t of targets) {
    const row = byRefHand.get(targetKey(t.itemRef, t.hand));
    if (row && isFluentPlus(bandVerdictForRow(row))) fluentPlus += 1;
  }
  return { total: targets.length, fluentPlus };
}

export function countFluentPlus(
  cells: ReadonlyArray<readonly CellTarget[]>,
  byRefHand: ReadonlyMap<string, SpacingState>,
): FluentPlusCount {
  let fluentPlus = 0;
  for (const targets of cells) {
    if (isFluentPlus(verdictForTargets(targets, byRefHand))) fluentPlus += 1;
  }
  return { total: cells.length, fluentPlus };
}
