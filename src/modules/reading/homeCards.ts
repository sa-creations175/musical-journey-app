/**
 * Reading's adapter: four skills → four cards.
 *
 * ORDER COMES FROM `READING_SKILL_ORDER`, which is the tab order the
 * page already had — notes, shapes, signatures, chords. Chord
 * identification is last because it genuinely depends on the other
 * three, which is a reason to order it, not to lock it.
 *
 * COUNTS COME FROM `readingCounts()`, the catalog walk the tab strip
 * already used. Reading is the one module whose counts need no
 * decision: `readingCounts()` enumerates the same items the drill
 * serves, so a card's denominator is the number of cards behind it.
 */
import type { AttemptRecord } from '../../lib/db';
import { categoryCardStats, type CategoryCardModel } from '../../components/moduleHome/model';
import { readingCounts } from '../../lib/moduleItemCounts';
import { readingSkillForItemRef } from './catalog';
import type { ReadingDrillSkill } from './pickCard';

/** Reading writes attempts under this module id — see `READING_MODULE_REF`. */
export const READING_MODULE_ID = 'reading';

export const READING_SKILL_ORDER: ReadonlyArray<ReadingDrillSkill> =
  ['note', 'shape', 'sig', 'chord'];

/** What each skill is called on screen. Exported so a pool row and a
 *  card cannot label the same skill two different ways. */
/**
 * What each Reading skill is called, everywhere it is called anything.
 *
 * FULL NAMES, NOT THE SHORT FORMS. "Notes" and "Chords" name the thing
 * being read rather than the skill being practised, and on a page that
 * also shows note names and chord symbols they read as content. What
 * the reader is drilling is recognition of a note, identification of a
 * chord — so the labels say that.
 *
 * ONE MAP, read by the chip row, the card title, the nav and the page
 * title. The nav used to carry its own copy of the four; it reads this
 * now, so a rename lands in all four places at once.
 */
export const READING_SKILL_LABELS: Readonly<Record<ReadingDrillSkill, string>> = {
  note: 'Note Recognition',
  shape: 'Notation Shapes',
  sig: 'Key Signatures',
  chord: 'Chord Identification',
};

export function isReadingCardKey(key: string): key is ReadingDrillSkill {
  return (READING_SKILL_ORDER as readonly string[]).includes(key);
}

export function readingCards(
  attempts: readonly AttemptRecord[],
  intervals: ReadonlyMap<string, number>,
  now: number,
): CategoryCardModel[] {
  const counts = readingCounts();
  const countFor: Readonly<Record<ReadingDrillSkill, number>> = {
    note: counts.noteRecognition,
    shape: counts.notationShapes,
    sig: counts.keySignatures,
    chord: counts.chordIdentification,
  };

  const mine = attempts.filter(a => a.moduleId === READING_MODULE_ID);

  return READING_SKILL_ORDER.map(skill => ({
    key: skill,
    label: READING_SKILL_LABELS[skill],
    itemCount: countFor[skill],
    // The bare count is honest here: one card, one item apiece.
    countDetail: null,
    // The one line lands when the copy exists — see the report on where
    // descriptions should live. The four blurbs the tab strip carried
    // are NOT moved here: they would become a fifth home for the same
    // sentence.
    description: null,
    // `itemId` IS the reading itemRef, so the skill is parsed back out
    // of it rather than stored a second time — see recordReadingAttempt.
    ...categoryCardStats(
      mine.filter(a => readingSkillForItemRef(a.itemId) === skill),
      intervals,
      now,
    ),
  }));
}
