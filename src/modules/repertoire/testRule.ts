/**
 * The test rule, in one sentence, written once.
 *
 * =====================================================================
 * IT WAS WORDED SEVEN WAYS ACROSS TEN SURFACES.
 *
 * Three axes varied independently and nobody chose any of them: runs /
 * run-throughs / tests; in a row / consecutive / back to back; and
 * whether the time constraint was stated at all. Two surfaces stated
 * the rule with no time constraint whatsoever, which is a different
 * rule rather than a shorter sentence.
 *
 * A rule the app states seven ways is a rule the reader has to
 * reconstruct, and the reconstruction is where "back to back" and
 * "consecutive" stop obviously meaning the same thing. So there is one
 * string and every surface uses it.
 *
 * =====================================================================
 * "IN ONE TESTING SESSION", NOT "IN ONE SITTING".
 *
 * The tail is load-bearing and the change is not cosmetic. A session
 * can be paused — walked away from and returned to — and it is still
 * the same session. "Sitting" says otherwise, and under Pause it would
 * be actively wrong: a streak survives a break, because the streak
 * belongs to the session rather than to an unbroken stretch of time.
 *
 * `spacing/settings.ts` keeps "in one sitting" and must not be swept
 * into this. It uses the phrase about spreading flashcard answers
 * across days, where the phrase is the thing being argued against.
 * Same words, different rule, correct as written.
 * =====================================================================
 *
 * Approved copy — `docs/WHOLE_SONG_TEST_COPY.md`, 29 Aug 2026. Do not
 * reword, and do not write a variation for one surface.
 */
export const TEST_RULE_SENTENCE =
  'Three clean run-throughs in a row, in one testing session.';

/** The same rule inside a longer sentence, where a full stop would cut
 *  the thought in half. Identical words; the caller supplies the join. */
export const TEST_RULE_CLAUSE =
  'three clean run-throughs in a row, in one testing session';
