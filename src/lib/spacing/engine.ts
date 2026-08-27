/**
 * The scheduler. Two stages, one set of rules, no module exceptions.
 *
 * =====================================================================
 * PURE. IT TAKES A STATE AND RETURNS THE NEXT ONE.
 *
 * Nothing here reads Dexie, reads the clock, or knows which module it
 * is scheduling. Every number arrives as resolved settings and every
 * moment arrives as an argument, which is what lets the settings
 * screen run the same code to draw its live preview as the drill runs
 * to schedule a real card. A preview computed by a second
 * implementation is a preview that will eventually disagree.
 * =====================================================================
 */

import type { AccuracyBand } from './bands';
import type { SpacingSettings } from './settings';
import { tallyExposureDays } from './settings';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SpacingStage = 'acquiring' | 'maintaining';

/**
 * Everything the scheduler needs to know about one card.
 *
 * `exposuresDone` counts ANSWERS GIVEN in the acquiring stage, not the
 * tally slot — the two differ as soon as an extra exposure is owed.
 * The tally itself is deliberately NOT stored: it is read from current
 * settings on every answer, which is what makes "changes apply from
 * the next time you answer that card" true without any extra
 * machinery.
 */
export interface SpacingCardState {
  stage: SpacingStage;
  exposuresDone: number;
  /** Exposures owed on the next day, from `add-to-next-day` misses. */
  extraExposures: number;
  /** Maintaining only. The wait that produced the current due date. */
  currentWaitDays: number;
  lastAnsweredAt: number | null;
  nextDueAt: number | null;
}

export function newCardState(): SpacingCardState {
  return {
    stage: 'acquiring',
    exposuresDone: 0,
    extraExposures: 0,
    currentWaitDays: 0,
    lastAnsweredAt: null,
    nextDueAt: null,
  };
}

export interface AnswerInput {
  state: SpacingCardState;
  settings: SpacingSettings;
  correct: boolean;
  /** The band the card is CURRENTLY in, or null while acquiring. */
  band: AccuracyBand | null;
  answeredAt: number;
}

/**
 * Advance a card by one answer.
 *
 * A card that is out of the schedule still moves through its stages —
 * it simply carries no due date. Dropping the state as well would mean
 * that switching a module back on restarted every card in it from
 * scratch, which is not what "out of the schedule" says.
 */
export function answer(input: AnswerInput): SpacingCardState {
  const { state, settings, correct, band, answeredAt } = input;
  const next = state.stage === 'acquiring'
    ? answerAcquiring(state, settings, correct, answeredAt)
    : answerMaintaining(state, settings, correct, band, answeredAt);

  if (!settings.inSchedule) return { ...next, nextDueAt: null };
  return next;
}

// =====================================================================
// Acquiring
// =====================================================================

/**
 * THE DAYS ARE MINIMUM GAPS, NOT DATES.
 *
 * Every due date is computed from the moment the card was last
 * ANSWERED, never from the day it was first seen. So a missed day
 * costs nothing: the card waits, appears at the next session, and the
 * remaining gaps run forward from there. Nothing resets and nothing
 * expires — the pattern is a shape, not a calendar.
 */
function answerAcquiring(
  state: SpacingCardState,
  settings: SpacingSettings,
  correct: boolean,
  answeredAt: number,
): SpacingCardState {
  const days = tallyExposureDays(settings.acquiring.tally);
  const policy = settings.acquiring.onWrong;

  // A tally of all zeros schedules nothing to acquire, so the card is
  // already past the stage rather than stuck inside it forever.
  if (days.length === 0) {
    return graduate(state, settings, answeredAt);
  }

  if (!correct) {
    if (policy === 'repeat-session') {
      // Again, now. Not a punishment and not progress: the card has
      // not been learned yet, so it has not earned an interval.
      return { ...state, lastAnsweredAt: answeredAt, nextDueAt: answeredAt };
    }
    if (policy === 'restart-pattern') {
      return {
        ...state,
        exposuresDone: 0,
        extraExposures: 0,
        lastAnsweredAt: answeredAt,
        nextDueAt: answeredAt,
      };
    }
    if (policy === 'add-to-next-day') {
      // Advance FIRST, then record the debt. Incrementing before the
      // advance let the same answer that created the extra consume it,
      // which made this policy a no-op wearing a counter.
      const advanced = advanceAcquiring(state, days, settings, answeredAt);
      return { ...advanced, extraExposures: advanced.extraExposures + 1 };
    }
    // 'nothing' — carry on exactly as a correct answer would.
  }

  return advanceAcquiring(state, days, settings, answeredAt);
}

function advanceAcquiring(
  state: SpacingCardState,
  days: ReadonlyArray<number>,
  settings: SpacingSettings,
  answeredAt: number,
): SpacingCardState {
  const at = Math.min(state.exposuresDone, days.length - 1);
  const currentDay = days[at];

  // An owed exposure is served the next time the card comes up, on the
  // same day as the slot it arrives with and WITHOUT consuming that
  // slot — which is what "add one to tomorrow" means: the day the card
  // next appears gets one more exposure than the tally said, exactly
  // as day 0 gets two.
  if (state.extraExposures > 0) {
    return {
      ...state,
      extraExposures: state.extraExposures - 1,
      lastAnsweredAt: answeredAt,
      nextDueAt: answeredAt,
    };
  }

  const done = state.exposuresDone + 1;
  if (done >= days.length) {
    // GRADUATION HAPPENS ON THE LAST EXPOSURE IN THE TALLY, which is
    // this one. The rating it earns is what the maintaining stage then
    // reads.
    return graduate({ ...state, exposuresDone: done }, settings, answeredAt);
  }

  const gap = days[done] - currentDay;
  return {
    ...state,
    exposuresDone: done,
    lastAnsweredAt: answeredAt,
    nextDueAt: answeredAt + gap * MS_PER_DAY,
  };
}

function graduate(
  state: SpacingCardState,
  settings: SpacingSettings,
  answeredAt: number,
): SpacingCardState {
  const wait = Math.max(settings.maintaining.minimumDays, settings.maintaining.firstWaitDays);
  return {
    ...state,
    stage: 'maintaining',
    extraExposures: 0,
    currentWaitDays: wait,
    lastAnsweredAt: answeredAt,
    nextDueAt: answeredAt + wait * MS_PER_DAY,
  };
}

// =====================================================================
// Maintaining
// =====================================================================

/**
 * The band decides how far the wait grows and how far it may ever go.
 *
 * Multiply THEN clamp, in that order, and clamp to the band's own
 * ceiling. A card that drops from Fluent to Developing is pulled back
 * under the shorter ceiling on its very next answer rather than
 * keeping a month-long wait it no longer deserves.
 */
function answerMaintaining(
  state: SpacingCardState,
  settings: SpacingSettings,
  correct: boolean,
  band: AccuracyBand | null,
  answeredAt: number,
): SpacingCardState {
  const m = settings.maintaining;
  const rule = band === null ? null : m.perBand[band];

  let wait: number;
  if (!correct) {
    switch (m.onWrong) {
      case 'back-to-first-wait': wait = m.firstWaitDays; break;
      case 'halve': wait = state.currentWaitDays / 2; break;
      case 'nothing': wait = state.currentWaitDays; break;
    }
  } else if (rule === null) {
    // No band yet — a card that graduated this instant and is being
    // answered again before any accuracy exists. The first wait is the
    // only defensible number here.
    wait = m.firstWaitDays;
  } else if (rule.growth.kind === 'back-to-first') {
    wait = m.firstWaitDays;
  } else {
    const base = state.currentWaitDays > 0 ? state.currentWaitDays : m.firstWaitDays;
    wait = base * rule.growth.factor;
  }

  // CLAMPED BUT NOT ROUNDED, and the difference is visible on screen.
  // Rounding at every step compounds: 1 → 1.7 → 2.89 → 4.91 shows as
  // 2 · 3 · 5, while rounding as it goes gives 2 → 3.4 → 5.78 → 6 and
  // drifts further with every answer. The stored wait keeps its
  // fraction and only the display rounds — which is also what makes
  // the spec's own preview sequences come out.
  const ceiling = rule?.ceilingDays ?? m.firstWaitDays;
  const clamped = Math.max(m.minimumDays, Math.min(ceiling, wait));

  return {
    ...state,
    stage: 'maintaining',
    currentWaitDays: clamped,
    lastAnsweredAt: answeredAt,
    nextDueAt: answeredAt + clamped * MS_PER_DAY,
  };
}

// =====================================================================
// Due and stale
// =====================================================================

export type DueState = 'not-scheduled' | 'waiting' | 'due' | 'stale';

/**
 * GRACE IS COUNTED FROM THE DUE DATE, NOT FROM THE WAIT.
 *
 * A 60-day card and a 2-day card that both came due on the 1st are
 * both stale on the 8th. Scaling grace to the length of the wait would
 * give the cards you see least the longest licence to be forgotten,
 * which is backwards.
 */
export function dueState(
  state: SpacingCardState,
  settings: SpacingSettings,
  now: number,
): DueState {
  if (!settings.inSchedule || state.nextDueAt === null) return 'not-scheduled';
  if (now < state.nextDueAt) return 'waiting';
  if (now >= state.nextDueAt + settings.stale.graceDays * MS_PER_DAY) return 'stale';
  return 'due';
}

/**
 * Queue order. Stale first, then due, oldest due date first.
 *
 * Stale sorting to the front is the ONLY thing stale does. It does not
 * change the band, does not change a colour, and does not change the
 * wait — see the spec's note.
 */
export function queueRank(
  state: SpacingCardState,
  settings: SpacingSettings,
  now: number,
): { rank: number; dueAt: number } {
  const s = dueState(state, settings, now);
  const rank = s === 'stale' ? 0 : s === 'due' ? 1 : s === 'waiting' ? 2 : 3;
  return { rank, dueAt: state.nextDueAt ?? Number.MAX_SAFE_INTEGER };
}

// =====================================================================
// Live preview
// =====================================================================

/**
 * The day sequence a band actually produces, for the settings screen.
 *
 * Runs the real `answerMaintaining` rather than re-deriving the
 * arithmetic, so the preview cannot drift from the scheduler. It stops
 * when the wait reaches the ceiling, because everything after that is
 * the same number forever.
 */
export function previewSequence(
  settings: SpacingSettings,
  band: AccuracyBand,
  maxSteps = 12,
): number[] {
  const m = settings.maintaining;
  const ceiling = m.perBand[band].ceilingDays;
  // The sequence STARTS at the first wait — that is the wait a card
  // graduates with, before any band has multiplied anything. Beginning
  // at the first multiplication would show a first step the reader
  // never experiences.
  const first = Math.max(m.minimumDays, Math.min(ceiling, m.firstWaitDays));
  const out: number[] = [Math.round(first)];
  let state: SpacingCardState = {
    ...newCardState(), stage: 'maintaining', currentWaitDays: first,
  };
  for (let i = 0; i < maxSteps; i++) {
    if (state.currentWaitDays >= ceiling) break;
    state = answerMaintaining(state, settings, true, band, 0);
    const shown = Math.round(state.currentWaitDays);
    if (shown === out[out.length - 1] && state.currentWaitDays >= ceiling) break;
    out.push(shown);
  }
  return out;
}
