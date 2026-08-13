/**
 * Reading accuracy breakdowns — the readers for `noteMiss` and
 * `hintUsed`.
 *
 * These exist because of a rule: a field that nothing reads should not
 * be stored. `elapsedMs` is the deliberate exception — recognition
 * speed cannot be backfilled, so it is recorded unread on purpose and
 * that decision is written down at the field. These two are not
 * exceptions, so here are their readers.
 *
 * ---------------------------------------------------------------
 * WHY `attemptFilter` AND NOT `excludeFromFluency`
 *
 * The obvious lever for hint-on attempts was `excludeFromFluency`, and
 * it is the wrong one: every reader of that flag DROPS the row —
 * `moduleAccuracy` skips it, and so do both tier-unlock tallies. The
 * requirement is the opposite, that hint-on attempts stay in the same
 * pile and are separable within it.
 *
 * `moduleAccuracy(ids, { attemptFilter })` already does exactly that
 * and had no caller anywhere in the app. These are its first ones.
 * ---------------------------------------------------------------
 *
 * ONE THING attemptFilter CANNOT DO. It narrows which rows count
 * toward a correct/total ratio, so it expresses "accuracy among note
 * items" perfectly. It cannot express "of the misses, how many were
 * octave" — that is a tally over a REASON, not a ratio, and there is
 * no ratio whose numerator is the answer. `readingMissBreakdown` reads
 * the rows directly for that one figure.
 */

import { db, type AttemptRecord } from '../../lib/db';
import { moduleAccuracy, READING_MODULE_REF, type AccuracyResult } from '../goals/progress';
import { readingSkillForItemRef, parseReadingItemRef } from './catalog';

/** True for an attempt on a Reading item of the given skill. Routed
 *  through the parser, so a malformed itemId matches nothing rather
 *  than matching on a prefix. */
function isSkill(a: AttemptRecord, skill: string): boolean {
  return readingSkillForItemRef(a.itemId) === skill;
}

/** Accuracy across one Reading skill. */
export function readingSkillAccuracy(skill: string): Promise<AccuracyResult> {
  return moduleAccuracy([READING_MODULE_REF], {
    attemptFilter: a => isSkill(a, skill),
  });
}

export interface ReadingHintSplit {
  /** Signature `name` attempts answered with the count showing. */
  withHint: AccuracyResult;
  /** Signature `name` attempts answered without it. */
  withoutHint: AccuracyResult;
}

/**
 * "With hint" and "without" read separately, from one pile.
 *
 * Scoped to the `name` direction because that is the only place the
 * hint exists — a chord attempt has no hint state, and counting it as
 * "without hint" would quietly inflate the unaided figure with cards
 * that were never eligible for help.
 */
export async function readingHintSplit(): Promise<ReadingHintSplit> {
  const isNameDirection = (a: AttemptRecord) => {
    const parsed = parseReadingItemRef(a.itemId);
    return parsed?.skill === 'sig' && parsed.direction === 'name';
  };
  const [withHint, withoutHint] = await Promise.all([
    moduleAccuracy([READING_MODULE_REF], {
      attemptFilter: a => isNameDirection(a) && a.hintUsed === true,
    }),
    moduleAccuracy([READING_MODULE_REF], {
      attemptFilter: a => isNameDirection(a) && a.hintUsed !== true,
    }),
  ]);
  return { withHint, withoutHint };
}

export interface ReadingMissBreakdown {
  /** Note attempts that were wrong, by which half missed. */
  letter: number;
  octave: number;
  both: number;
  /** Total wrong note attempts — the denominator for the three above.
   *  Counted from the rows rather than summed, so a wrong attempt that
   *  somehow carries no `noteMiss` shows up as a gap instead of
   *  silently rebalancing the percentages. */
  totalWrong: number;
}

/**
 * How much of the note-recognition miss is octave versus letter.
 *
 * Reads `db.attempts` directly rather than going through
 * `moduleAccuracy`, because this is a tally over a reason and that
 * primitive returns a ratio. Same module scoping, same parser-based
 * skill check.
 */
export async function readingMissBreakdown(): Promise<ReadingMissBreakdown> {
  const rows = await db.attempts
    .where('moduleId').equals(READING_MODULE_REF)
    .toArray();
  const out: ReadingMissBreakdown = { letter: 0, octave: 0, both: 0, totalWrong: 0 };
  for (const a of rows) {
    if (a.correct) continue;
    if (!isSkill(a, 'note')) continue;
    out.totalWrong++;
    if (a.noteMiss === 'letter') out.letter++;
    else if (a.noteMiss === 'octave') out.octave++;
    else if (a.noteMiss === 'both') out.both++;
  }
  return out;
}
