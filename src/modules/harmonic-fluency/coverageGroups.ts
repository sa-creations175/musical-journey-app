/**
 * The coverage groups, and which categories are in each.
 *
 * =====================================================================
 * IT LIVED IN FOUR FILES, AND THREE OF THEM WERE WRONG.
 *
 * `moduleItemCounts.ts`, `goals/progress.ts`, `GoalCreationFlow.tsx`
 * and `GoalSuggestionFlow.tsx` each held a hand-maintained copy, and
 * each carried a comment saying it "mirrors" the others. They did not:
 *
 *   The two goal-picker copies had NO `pentatonic-scales` in
 *   Foundational, so thirty-eight cards could not be picked in the
 *   accuracy target at all.
 *
 *   Both of them still listed `reverse-key-pivots` under
 *   Functional / Applied. That category retired into `degree-notes` on
 *   3 Sep 2026 and has held no cards since, so it was an option that
 *   could never be satisfied.
 *
 *   And when Modal Improvisation arrived on 9 Sep 2026, three of the
 *   four were updated and `goals/progress.ts` was not — so the family
 *   generated its cards, drew its grid, and was silently absent from
 *   the cold-start walk.
 *
 * A comment cannot keep four lists in step. This is the list.
 *
 * =====================================================================
 * TWO KEYS FOR ONE GROUP, AND BOTH ARE LOAD-BEARING.
 *
 * `unit` is the kebab-case form a goal's `targetUnit` carries, written
 * by the goal picker and read back by the scope resolver. It is STORED,
 * so it cannot be renamed.
 *
 * `id` is the camelCase field on `harmonicFluencyCounts().byGroup`,
 * which is what a denominator is looked up by.
 *
 * They were two independent tables with a drift guard between them.
 * They are two fields of one row now, and the guard is a tautology it
 * keeps for the same price as deleting it.
 *
 * =====================================================================
 * THREE GROUPS SINCE 14 SEP 2026 (Silas; walked in
 * `hf-restructure-walk.html`): single notes, notes stacked, chords
 * moving. Notes, Degrees, Scales & Keys · Chords · Movement. Same
 * thirteen families, same counts; only membership and titles changed.
 *
 * CHORDS AND MOVEMENT KEEP THEIR UNITS. They hold exactly the families
 * Chord Knowledge and Functional / Applied held, so a goal that stored
 * `chord-knowledge` or `functional-applied` still means what it meant.
 * The first group is new — Foundational's five families plus Intervals and
 * Mode Identification — so it takes a new unit.
 *
 * THE TWO RETIRED UNITS STILL RESOLVE. `foundational` and
 * `ear-recognition` are stored on goals set before the regroup, and a goal
 * keeps meaning what it meant on the day it was set: each keeps its own
 * family list (`HF_RETIRED_GROUPS`), is counted from it, and is offered by
 * no picker.
 *
 * SCALES & MODES, LATER THE SAME DAY. Pentatonic Scales folded into
 * `modes`, so a live group lists `modes` once and holds all 139. The
 * retired two still count by the families as they were filed that day —
 * pentatonic cards in `foundational`, mode cards in `ear-recognition` —
 * which is `hfUnitHoldsCard` reading `cardKind` for a retired unit.
 * =====================================================================
 */
import type { FlashcardCategory } from './catalog';
import { cardKind } from './cardKind';

/** The camelCase field on `harmonicFluencyCounts().byGroup`. */
export type HarmonicFluencyGroupId =
  | 'notesDegreesScalesKeys'
  | 'chordKnowledge'
  | 'functionalApplied';

/** The kebab-case form a goal's `targetUnit` stores. */
export type HarmonicFluencyGroupUnit =
  | 'notes-degrees-scales-keys'
  | 'chord-knowledge'
  | 'functional-applied';

/** Units a goal set before 14 Sep 2026 may still carry. */
export type RetiredHarmonicFluencyGroupUnit = 'foundational' | 'ear-recognition';

export interface HarmonicFluencyGroupSpec {
  id: HarmonicFluencyGroupId;
  unit: HarmonicFluencyGroupUnit;
  /** What the group is called on screen. */
  title: string;
  categories: ReadonlyArray<FlashcardCategory>;
}

/**
 * The three, in the order every surface walks them.
 *
 * ORDER IS PART OF THE DEFINITION. `HF_GROUP_ORDER` in `coldStart.ts`
 * is the cold-start walk and it is this order; the pickers render it;
 * the coverage pills read it. A fourth group added here appears in all
 * of them, which is the point.
 */
export const HARMONIC_FLUENCY_GROUPS: ReadonlyArray<HarmonicFluencyGroupSpec> = [
  {
    id: 'notesDegreesScalesKeys',
    unit: 'notes-degrees-scales-keys',
    title: 'Notes, Degrees, Scales & Keys',
    categories: [
      'degree-notes', 'scale-degree-math', 'key-signatures',
      'enharmonic-equivalents', 'intervals', 'modes',
    ],
  },
  {
    id: 'chordKnowledge',
    unit: 'chord-knowledge',
    title: 'Chords',
    categories: ['diatonic-qualities', 'slash-chords', 'chord-construction'],
  },
  {
    id: 'functionalApplied',
    unit: 'functional-applied',
    title: 'Movement',
    categories: ['progressions', 'modal-improvisation', 'functional-harmony'],
  },
];

/**
 * The two groups retired on 14 Sep 2026, with the families they held that
 * day. Reached only through a goal that stored the unit.
 */
export const HF_RETIRED_GROUPS: ReadonlyArray<{
  unit: RetiredHarmonicFluencyGroupUnit;
  title: string;
  categories: ReadonlyArray<FlashcardCategory>;
}> = [
  {
    unit: 'foundational',
    title: 'Foundational / Math',
    categories: [
      'scale-degree-math', 'degree-notes', 'key-signatures',
      'pentatonic-scales', 'enharmonic-equivalents',
    ],
  },
  {
    unit: 'ear-recognition',
    title: 'Ear & Recognition',
    categories: ['modes', 'intervals'],
  },
];

/** Keyed by the counts field. What `moduleItemCounts` sums. */
export const HF_CATEGORIES_BY_GROUP: Readonly<
  Record<HarmonicFluencyGroupId, ReadonlyArray<FlashcardCategory>>
> = Object.fromEntries(
  HARMONIC_FLUENCY_GROUPS.map(g => [g.id, g.categories]),
) as Record<HarmonicFluencyGroupId, ReadonlyArray<FlashcardCategory>>;

/** Keyed by the stored unit, the retired two included. What a goal's
 *  `targetUnit` resolves to. */
export const HF_CATEGORIES_BY_UNIT: Readonly<
  Record<string, ReadonlyArray<FlashcardCategory>>
> = Object.fromEntries([
  ...HARMONIC_FLUENCY_GROUPS.map(g => [g.unit, g.categories] as const),
  ...HF_RETIRED_GROUPS.map(g => [g.unit, g.categories] as const),
]);

/** Stored unit → counts field. The live three only: a retired unit is
 *  counted from its families (`scopeCatalog`). */
export const HF_UNIT_TO_COUNT_GROUP: Readonly<
  Record<string, HarmonicFluencyGroupId>
> = Object.fromEntries(HARMONIC_FLUENCY_GROUPS.map(g => [g.unit, g.id]));

/** What a group is called, the retired two included. Read by both
 *  pickers rather than written out beside each of them. */
export const HF_GROUP_TITLE: Readonly<Record<string, string>> = Object.fromEntries([
  ...HARMONIC_FLUENCY_GROUPS.map(g => [g.unit, g.title] as const),
  ...HF_RETIRED_GROUPS.map(g => [g.unit, g.title] as const),
]);

const RETIRED_UNITS: ReadonlySet<string> = new Set(HF_RETIRED_GROUPS.map(g => g.unit));

/**
 * Whether a stored unit holds this card. The one test every goal, stage
 * and scope walk asks, so the retired units cannot be read two ways.
 */
export function hfUnitHoldsCard(
  unit: string,
  card: { id: string; category: FlashcardCategory },
): boolean {
  const categories = HF_CATEGORIES_BY_UNIT[unit];
  if (categories === undefined) return false;
  return categories.includes(RETIRED_UNITS.has(unit) ? cardKind(card) : card.category);
}
