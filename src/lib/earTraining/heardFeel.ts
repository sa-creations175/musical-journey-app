/**
 * How an ear-training answer lands on the four-step scale.
 *
 * =====================================================================
 * RIGHT OR WRONG WAS NOT ENOUGH, AND THE REASON IS ON THE SCREEN.
 *
 * Two readers both answer a card correctly. One heard it once and named
 * it. The other played it four times, turned the chord into an arpeggio
 * and listened to the bass on its own. Those are not the same event, and
 * a boolean cannot tell them apart — so the app scheduled them the same
 * and called them both fluent.
 *
 * The four-step scale is what the rest of the app already grades
 * practice on: Struggled, Working on it, Clean, In flow. This puts an
 * ear-training answer on it, by rule rather than by asking — the reader
 * has just answered a question and should not then be asked how it
 * felt.
 *
 * =====================================================================
 * WHICH CONTROLS ARE AIDS, AND WHY TEMPO AND OCTAVE ARE NOT.
 *
 * Slowing a chord down or moving it an octave does not tell you what it
 * is; you still have to name it, and a reader who needs it slow is
 * hearing the same question at a speed they can follow. Hearing the
 * BASS ALONE, or hearing a chord played one note at a time, does part
 * of the naming: the bass of an inverted chord is the note the inversion
 * is named for, and a run hands you its notes one at a time.
 *
 * So those count and the other two are free. Silas's rule, and the aids
 * fold says it in one line above the controls.
 *
 * =====================================================================
 * THE STEPS, AND THE ONE THAT IS NOT ABOUT THE ANSWER.
 *
 *   In flow 100      right, first listen, no aid
 *   Clean 75         right, after replays, no aid
 *   Working on it 50 right with an aid, OR half right
 *   Struggled 25     wrong on the first question
 *
 * "Half right" is the second question missed with the first one got:
 * the right chord in the wrong inversion, the right progression from
 * the wrong position. It is not a failure — you heard the harmony and
 * not the voicing — and it is not a pass either.
 * =====================================================================
 */
import { type Feel } from '../fluencyScale';
import type { PlayAs } from '../player/settings';

export interface HeardOutcome {
  /** The FIRST question: which chord, or which progression. */
  firstRight: boolean;
  /** The SECOND question: which inversion, or which position. */
  secondRight: boolean;
  /** How many times Play again was pressed before answering. */
  replays: number;
  /** Whether Bass only, or a run where a run counts, was in force. */
  aided: boolean;
}

/** Where an answer lands on the scale. */
export function heardFeel(outcome: HeardOutcome): Feel {
  // WRONG ON THE FIRST QUESTION IS STRUGGLED, whatever happened after
  // it. A reader who named the wrong chord did not hear the chord, and
  // getting the inversion of a chord that was not there is not credit.
  if (!outcome.firstRight) return 1;
  if (!outcome.secondRight) return 2;
  if (outcome.aided) return 2;
  return outcome.replays > 0 ? 3 : 4;
}

/**
 * The feel an attempt row reads as.
 *
 * =====================================================================
 * NO MIGRATION, AND THE OLD ROWS ARE NOT GUESSED AT.
 *
 * Rows written before this existed carry `correct` and nothing else, so
 * they read as the two ENDS of the scale — In flow for a right answer,
 * Struggled for a wrong one — which is exactly the information they
 * hold. Nothing invents a Clean or a Working on it for a row that never
 * recorded one, and nothing is rewritten on disk.
 *
 * The consequence is worth saying out loud: a history from before
 * 10 Sep 2026 reads as all 100s and 25s, so an ear-training fluency
 * number will DROP when the middle two steps start appearing. That is
 * the measurement getting more honest, not the reader getting worse.
 * =====================================================================
 */
export function feelOfAttempt(
  row: { correct: boolean; feelRating?: Feel },
): Feel {
  return row.feelRating ?? (row.correct ? 4 : 1);
}

/**
 * Whether the panel's settings amount to an aid.
 *
 * IT READS THE TWO FIELDS THAT MATTER and ignores the rest, so a caller
 * hands over its whole settings object and the decision about which
 * controls count lives here and only here.
 *
 * PLAY AS COUNTS WHERE THE SURFACE SAYS SO. Up, Down and Up and Down are
 * a listening aid on every Ear Training quiz — Chord Recognition, Chord
 * Motion and Full Progression (Silas, 13 Sep 2026: the 9 Sep rule covers
 * all of Ear Training) — where only Together is free. Each of those
 * passes `playAsIsAid`; a surface that is not a quiz leaves it off.
 * Bass only is an aid everywhere.
 */
export function isAided(
  settings: { listen: 'both' | 'bass'; playAs?: PlayAs },
  opts: { playAsIsAid?: boolean } = {},
): boolean {
  if (settings.listen === 'bass') return true;
  return opts.playAsIsAid === true && (settings.playAs ?? 'together') !== 'together';
}
