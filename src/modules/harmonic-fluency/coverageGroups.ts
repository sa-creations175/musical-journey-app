/**
 * The four coverage groups, and which categories are in each.
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
 * =====================================================================
 */
import type { FlashcardCategory } from './catalog';

/** The camelCase field on `harmonicFluencyCounts().byGroup`. */
export type HarmonicFluencyGroupId =
  | 'foundational'
  | 'chordKnowledge'
  | 'functionalApplied'
  | 'earRecognition';

/** The kebab-case form a goal's `targetUnit` stores. */
export type HarmonicFluencyGroupUnit =
  | 'foundational'
  | 'chord-knowledge'
  | 'functional-applied'
  | 'ear-recognition';

export interface HarmonicFluencyGroupSpec {
  id: HarmonicFluencyGroupId;
  unit: HarmonicFluencyGroupUnit;
  /** What the group is called on screen. */
  title: string;
  categories: ReadonlyArray<FlashcardCategory>;
}

/**
 * The four, in the order every surface walks them.
 *
 * ORDER IS PART OF THE DEFINITION. `HF_GROUP_ORDER` in `coldStart.ts`
 * is the cold-start walk and it is this order; the pickers render it;
 * the coverage pills read it. A fifth group added here appears in all
 * of them, which is the point.
 */
export const HARMONIC_FLUENCY_GROUPS: ReadonlyArray<HarmonicFluencyGroupSpec> = [
  {
    id: 'foundational',
    unit: 'foundational',
    title: 'Foundational / Math',
    categories: [
      'scale-degree-math', 'degree-notes', 'key-signatures',
      'pentatonic-scales', 'enharmonic-equivalents',
    ],
  },
  {
    id: 'chordKnowledge',
    unit: 'chord-knowledge',
    title: 'Chord Knowledge',
    categories: ['diatonic-qualities', 'chord-construction', 'slash-chords'],
  },
  {
    id: 'functionalApplied',
    unit: 'functional-applied',
    title: 'Functional / Applied',
    categories: ['functional-harmony', 'progressions', 'modal-improvisation'],
  },
  {
    id: 'earRecognition',
    unit: 'ear-recognition',
    title: 'Ear & Recognition',
    categories: ['modes', 'intervals', 'ear-theory'],
  },
];

/** Keyed by the counts field. What `moduleItemCounts` sums. */
export const HF_CATEGORIES_BY_GROUP: Readonly<
  Record<HarmonicFluencyGroupId, ReadonlyArray<FlashcardCategory>>
> = Object.fromEntries(
  HARMONIC_FLUENCY_GROUPS.map(g => [g.id, g.categories]),
) as Record<HarmonicFluencyGroupId, ReadonlyArray<FlashcardCategory>>;

/** Keyed by the stored unit. What a goal's `targetUnit` resolves to. */
export const HF_CATEGORIES_BY_UNIT: Readonly<
  Record<string, ReadonlyArray<FlashcardCategory>>
> = Object.fromEntries(
  HARMONIC_FLUENCY_GROUPS.map(g => [g.unit, g.categories]),
);

/** Stored unit → counts field. */
export const HF_UNIT_TO_COUNT_GROUP: Readonly<
  Record<string, HarmonicFluencyGroupId>
> = Object.fromEntries(HARMONIC_FLUENCY_GROUPS.map(g => [g.unit, g.id]));

/** What a group is called. Read by both pickers rather than written
 *  out beside each of them. */
export const HF_GROUP_TITLE: Readonly<Record<string, string>> =
  Object.fromEntries(HARMONIC_FLUENCY_GROUPS.map(g => [g.unit, g.title]));
