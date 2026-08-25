/**
 * Reading's attempt write path — the three calls, in one place.
 *
 * ---------------------------------------------------------------
 * THE SHAPE IS COPIED FROM EAR TRAINING ON PURPOSE
 *
 * `addAttempt` → `recordEngagement` → `updateDailySummary`, in that
 * order. It is the one thing all five ET surfaces agree on, and
 * agreeing with it is worth more than any improvement I could make to
 * it here.
 *
 * What is NOT copied is where it lives. ET repeats the block inline in
 * each quiz component, which is why the five copies drifted on
 * everything except the call order. This sits in its own module so it
 * can be tested without mounting a drill.
 * ---------------------------------------------------------------
 *
 * `itemId` IS the itemRef. Chord recognition and Scales already do
 * this; Intervals is the one that does not, storing `interval.id` in
 * `itemId` and composing `${id}:${direction}` separately for spacing —
 * so its attempts and its spacing rows disagree about what an item is.
 * `AttemptRecord.direction` is that split fossilised, and Reading does
 * not inherit it: every distinction Reading makes is already a segment
 * of the ref.
 *
 * DEV MODE is handled upstream — `addAttempt` in practiceWrites.ts is
 * a no-op when it is on. `recordEngagement` and `updateDailySummary`
 * are not gated there, which mirrors what every ET surface already
 * does rather than inventing a different rule for this module.
 */

import { addAttempt } from '../../lib/practiceWrites';
import { elapsedFields } from '../../lib/attemptTiming';
import { recordEngagement } from '../../lib/spacingState';
import { updateDailySummary } from '../../lib/dailySummaries';
import type { AttemptRecord } from '../../lib/db';
import { READING_MODULE_REF } from '../goals/progress';
import { parseReadingItemRef } from './catalog';
import type { NoteVerdict } from './answerModels';

export interface ReadingAttemptInput {
  /** The full Reading itemRef. Becomes BOTH `itemId` and the spacing
   *  `itemRef` — one identity, not two. */
  itemRef: string;
  correct: boolean;
  /** Time from the card appearing to the answer being submitted.
   *  Recorded, not shown, and nothing branches on it. */
  elapsedMs: number;
  /** Note items: the staged verdict, so a miss can be attributed to
   *  the letter or the octave. Ignored for every other skill. */
  noteVerdict?: NoteVerdict;
  /** Key-signature `name` items: whether the accidental-count hint was
   *  showing. Ignored elsewhere. */
  hintUsed?: boolean;
  /** Injectable for tests. */
  timestamp?: number;
}

/**
 * What missed, or undefined when nothing did. Undefined for a correct
 * attempt is the point — the field answers "what went wrong", so it
 * should be absent when nothing did.
 *
 * =====================================================================
 * ONLY 'letter' IS REACHABLE NOW, AND THE OTHER TWO ARE NOT DEAD.
 *
 * The question asked for a letter and an octave, so a miss was one of
 * three: 'letter', 'octave', or 'both'. It now asks only for the
 * letter, so a wrong answer can only be a wrong letter.
 *
 * `AttemptRecord.noteMiss` keeps all three values and
 * `readingMissBreakdown` keeps counting all three, because rows
 * written before this change carry them and that history is true. A
 * narrowed union would make those rows unreadable to their own reader
 * — reinterpreting recorded practice to match a question that has
 * since changed, which is the one thing a history must not do.
 * =====================================================================
 */
export function noteMissFor(
  verdict: NoteVerdict | undefined,
): AttemptRecord['noteMiss'] {
  if (!verdict || verdict.correct) return undefined;
  return 'letter';
}

/**
 * Build the attempt row. Exported separately from the write so a test
 * can assert the row's shape without a fake IndexedDB, and so the
 * "which fields are set when" rules are checkable in isolation.
 *
 * Returns null for a ref that is not a well-formed Reading item —
 * writing an attempt against an unparseable ref would put a row in the
 * table that no coverage or accuracy query could ever attribute.
 */
export function buildReadingAttempt(
  input: ReadingAttemptInput,
): AttemptRecord | null {
  const parsed = parseReadingItemRef(input.itemRef);
  if (!parsed) return null;

  const record: AttemptRecord = {
    moduleId: READING_MODULE_REF,
    itemId: input.itemRef,
    correct: input.correct,
    timestamp: input.timestamp ?? Date.now(),
    // THROUGH THE CEILING, which Reading has never had. It has been
    // recording elapsedMs unguarded for months with `shownAt` set once
    // per card and never invalidated, so a card left open overnight is
    // stored as an answer that took hours. This stops new rows like
    // that; it does not touch the old ones, which the probe needs to
    // see as they are.
    //
    // `elapsedFields` takes a start and a now rather than a duration,
    // so the start is reconstructed from the two numbers already here.
    // The alternative — a second ceiling check written inline — is the
    // copy of a rule that goes wrong when the rule moves.
    ...elapsedFields(
      (input.timestamp ?? Date.now()) - input.elapsedMs,
      input.timestamp ?? Date.now(),
    ),
  };

  // Skill-scoped fields, gated on the SKILL rather than on the caller
  // remembering — a hint flag on a chord row would be meaningless and
  // would pollute the hint split.
  if (parsed.skill === 'note') {
    const miss = noteMissFor(input.noteVerdict);
    if (miss) record.noteMiss = miss;
  }
  if (parsed.skill === 'sig' && parsed.direction === 'name' && input.hintUsed) {
    record.hintUsed = true;
  }

  return record;
}

/**
 * Record one answered Reading card. Returns the row that was written,
 * or null when the ref was not a Reading item.
 *
 * Serial, not parallel: `recordEngagement` reads-then-writes its
 * spacing row, so overlapping calls on one item can lose an update.
 * ChordProgressionsQuiz already learned this and says so at its own
 * call site.
 */
export async function recordReadingAttempt(
  input: ReadingAttemptInput,
): Promise<AttemptRecord | null> {
  const record = buildReadingAttempt(input);
  if (!record) return null;

  await addAttempt(record);
  await recordEngagement({
    itemRef: record.itemId,
    moduleRef: READING_MODULE_REF,
    signal: { kind: 'attempt', correct: record.correct },
    timestamp: record.timestamp,
  });
  await updateDailySummary(READING_MODULE_REF);
  return record;
}
