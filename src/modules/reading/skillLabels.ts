/**
 * The four Reading skills: their order, and what each one is called.
 *
 * =====================================================================
 * A LEAF, AND THAT IS THE WHOLE REASON IT IS ITS OWN FILE.
 *
 * These two constants started in `homeCards`, which is fine while only
 * a component reads them. But the point of having one name per skill is
 * that EVERYTHING reads it — the chip row, the card titles, the nav,
 * the page title, the goal-scope picker — and `homeCards` sits in a
 * cycle: it imports `moduleItemCounts`, which imports `coverageGroups`,
 * which needs the names. A module that builds an array at load time got
 * `undefined` back, because `homeCards` had not finished initialising
 * when it asked.
 *
 * This file imports nothing but a type. Anything can read it, at any
 * point in the graph, and get a value. `homeCards` re-exports both so
 * the existing call sites did not have to move.
 * =====================================================================
 */
import type { ReadingDrillSkill } from './pickCard';

export const READING_SKILL_ORDER: ReadonlyArray<ReadingDrillSkill> =
  ['note', 'shape', 'sig', 'chord'];

/**
 * What each Reading skill is called, everywhere it is called anything.
 *
 * FULL NAMES, NOT THE SHORT FORMS. "Notes" and "Chords" name the thing
 * being read rather than the skill being practised, and on a page that
 * also shows note names and chord symbols they read as content. What
 * the reader is drilling is recognition of a note, identification of a
 * chord — so the labels say that.
 *
 * ONE MAP, and by now four things had their own copy of it: the nav,
 * the progress-tracker card titles and the goal-scope picker all
 * carried hand-typed fours that drifted into three different casings.
 * They all read this. A rename lands everywhere at once, or nowhere.
 */
export const READING_SKILL_LABELS: Readonly<Record<ReadingDrillSkill, string>> = {
  note: 'Note Recognition',
  shape: 'Notation Shapes',
  sig: 'Key Signatures',
  chord: 'Chord Identification',
};
