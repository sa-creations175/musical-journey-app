/**
 * Carrying the SM-2 flashcard schedule onto the one engine.
 *
 * =====================================================================
 * WHAT COULD BE REBUILT WAS REBUILT. WHAT COULD NOT WAS CARRIED.
 *
 * Every counter on a `flashcardStates` row — totalAttempts,
 * totalCorrect, consecutiveCorrect — is a re-derivation of rows that
 * are still in `attempts`, and `attempts` is the FULLER record:
 * harmonic fluency skips its SM-2 write in focus-protected sessions
 * and writes the attempt row regardless, so the counters can undercount
 * and the attempt rows cannot. Both modules have written an attempt row
 * for every answer since the commit that first wrote either
 * (9cef052 for HF, 3f23526 for vocabulary), so nothing is lost by
 * counting from attempts.
 *
 * Three things could NOT be rebuilt, and they are what this carries:
 * the next review date, and the two user-authored flags. The ease
 * factor is deliberately dropped — the new engine has no equivalent
 * and inventing one would be worse than losing it.
 *
 * IDEMPOTENT. Keyed on a pref, and every write is a merge onto the
 * existing spacing row rather than a replacement, so a second run is a
 * no-op and a half-finished run resumes cleanly.
 * =====================================================================
 */

import { db, type AttemptRecord, type SpacingState } from '../db';
import { getPref, setPref } from '../userPrefs';
import { putSpacingState } from '../practiceWrites';
import { getMemoryType } from '../memoryType';
import { MS_PER_DAY } from './engine';
import { bandForAccuracyPercent } from './bands';
import { tallyExposureDays } from './settings';
import { loadOverrides, settingsForCard } from './store';
import { moduleRefForCardId } from '../flashcards/cardSpacing';

export const PREF_FLASHCARD_MIGRATION = 'spacingFlashcardMigrationDone';

/**
 * THE SECOND GATE, AND THE ONE THAT MATTERS RIGHT NOW.
 *
 * `PREF_FLASHCARD_MIGRATION` above answers "has it run". This answers
 * "may it run", and it defaults to NO. The migration is wired into
 * boot and will not fire until this is set, because carrying every
 * schedule across is a one-way write over live data and the count
 * wants looking at first.
 *
 * Arm it from the console when you have read the preview the boot logs:
 *
 *   await (await import('/src/lib/userPrefs.ts'))
 *     .setPref('spacingFlashcardMigrationArmed', true)
 *
 * Then reload. The run itself is still idempotent and still keyed on
 * the done-pref, so arming it twice is harmless.
 */
export const PREF_FLASHCARD_MIGRATION_ARMED = 'spacingFlashcardMigrationArmed';

/** The floor that decides which path a card takes. */
export const RATING_FLOOR_ANSWERS = 5;

export interface MigrationReport {
  /** Already run — nothing was touched. */
  skipped: boolean;
  /** Cards with five or more answers, carried into maintaining. */
  toMaintaining: number;
  /** Cards under the floor, resumed inside the tally. */
  toAcquiring: number;
  /** Flag or note carried across. */
  flagsCarried: number;
  /** Rows that named a card no module claims — left alone, not deleted. */
  unclaimed: number;
}

/**
 * IT USED TO FILE VOCABULARY UNDER `production`, WHICH WAS THE WRONG
 * ADDRESS AND WOULD HAVE THROWN ON THE NEXT ANSWER.
 *
 * `production` is integration memory and takes only rating signals; a
 * vocabulary card emits attempts. Rows carried under that ref would
 * have been written once and then rejected by every `recordEngagement`
 * that followed. The deck has its own declarative ref now, and the one
 * definition of which card goes where lives beside the readers — see
 * `flashcards/cardSpacing.ts`. Carrying a row to an address the live
 * code does not read from loses the history as surely as not carrying
 * it, and does it silently.
 */
const moduleForCardId = moduleRefForCardId;

/**
 * Where a part-way card resumes.
 *
 * A card with three answers under 2·1·0·1·0·1 has the day 0 and day 1
 * steps behind it, so it resumes at the day 3 step: the gap from the
 * last exposure it completed to the next one it owes. Counted from the
 * MIGRATION DATE, not from when it was first seen — the pattern's days
 * are minimum gaps, and the card has been sitting still since.
 */
export function resumeGapDays(tally: ReadonlyArray<number>, answersDone: number): number | null {
  const days = tallyExposureDays(tally);
  if (answersDone >= days.length) return null;   // nothing left to owe
  const previousDay = answersDone === 0 ? 0 : days[answersDone - 1];
  return Math.max(0, days[answersDone] - previousDay);
}

/** Answers per card, counted from the attempt log. */
async function answerCountsByItem(): Promise<Map<string, { total: number; correct: number }>> {
  const out = new Map<string, { total: number; correct: number }>();
  const bump = (rows: AttemptRecord[]) => {
    for (const a of rows) {
      const cur = out.get(a.itemId) ?? { total: 0, correct: 0 };
      cur.total += 1;
      if (a.correct) cur.correct += 1;
      out.set(a.itemId, cur);
    }
  };
  bump(await db.attempts.where('moduleId').equals('harmonic-fluency').toArray());
  bump(await db.attempts.where('moduleId').equals('production').toArray());
  return out;
}

/**
 * WORK OUT WHAT WOULD HAPPEN, WITHOUT DOING ANY OF IT.
 *
 * =====================================================================
 * THE PLAN IS SEPARATE FROM THE RUN, SO THE COUNT CAN BE SEEN FIRST.
 *
 * This used to be one function that read, decided and wrote in a single
 * pass, which meant the only way to learn how many rows it would touch
 * was to let it touch them. Splitting it costs nothing — the run below
 * is this plan plus a loop of writes — and it buys a number that can be
 * looked at before anything is committed to.
 *
 * Deliberately does NOT consult the done-pref. "What would this do" is
 * a fair question after it has already run, and answering `skipped`
 * would refuse it.
 * =====================================================================
 */
export async function planFlashcardMigration(
  now = Date.now(),
): Promise<{ report: MigrationReport; writes: SpacingState[] }> {
  const states = await db.flashcardStates.toArray();
  const counts = await answerCountsByItem();
  const overrides = await loadOverrides();
  const report: MigrationReport = {
    skipped: false, toMaintaining: 0, toAcquiring: 0, flagsCarried: 0, unclaimed: 0,
  };
  const writes: SpacingState[] = [];

  for (const state of states) {
    const moduleRef = moduleForCardId(state.cardId);
    let memoryType: string;
    try {
      memoryType = getMemoryType(moduleRef);
    } catch {
      report.unclaimed += 1;
      continue;
    }
    const settings = settingsForCard(moduleRef, state.cardId, overrides);
    const seen = counts.get(state.cardId) ?? { total: 0, correct: 0 };

    // The row may already exist — harmonic fluency has written both
    // schedulers on every answer, so most HF cards have one. Merging
    // onto it is what makes a second run a no-op.
    const existing = await db.spacingState
      .where('moduleRef').equals(moduleRef)
      .and(r => r.itemRef === state.cardId)
      .first();

    const base: SpacingState = existing ?? {
      id: crypto.randomUUID(),
      itemRef: state.cardId,
      moduleRef,
      hand: 'both',
      style: 'solid',
      memoryType: memoryType as SpacingState['memoryType'],
      acquisitionStage: 'acquiring',
      currentIntervalDays: 0,
      lastEngagedAt: state.lastReviewed || null,
      nextDueAt: null,
      performanceHistory: [],
    };

    const flags: Partial<SpacingState> = {};
    if (state.isFlagged) flags.studyLater = true;
    if (state.flagged) flags.reviewFlagged = true;
    if (state.flagNote) flags.reviewFlagNote = state.flagNote;
    if (Object.keys(flags).length > 0) report.flagsCarried += 1;

    if (seen.total >= RATING_FLOOR_ANSWERS) {
      // MAINTAINING. The existing due date is preserved exactly as it
      // stands — the reader has a schedule they are living with, and a
      // schema change is not a reason to move it.
      const accuracy = seen.total > 0 ? (seen.correct / seen.total) * 100 : 0;
      const band = bandForAccuracyPercent(accuracy);
      const wait = Math.max(
        settings.maintaining.minimumDays,
        Math.min(settings.maintaining.perBand[band].ceilingDays, state.interval || settings.maintaining.firstWaitDays),
      );
      writes.push({
        ...base,
        ...flags,
        spacingStage: 'maintaining',
        exposuresDone: seen.total,
        extraExposures: 0,
        currentIntervalDays: wait,
        lastEngagedAt: state.lastReviewed || base.lastEngagedAt,
        nextDueAt: state.nextReviewDate || base.nextDueAt,
      });
      report.toMaintaining += 1;
    } else {
      // ACQUIRING. The answers already given count toward the tally,
      // and the remaining gaps run from TODAY — the old due date is
      // discarded because acquiring gaps replace it.
      const gap = resumeGapDays(settings.acquiring.tally, seen.total);
      writes.push({
        ...base,
        ...flags,
        spacingStage: 'acquiring',
        exposuresDone: seen.total,
        extraExposures: 0,
        currentIntervalDays: 0,
        lastEngagedAt: state.lastReviewed || base.lastEngagedAt,
        nextDueAt: gap === null ? now : now + gap * MS_PER_DAY,
      });
      report.toAcquiring += 1;
    }
  }

  return { report, writes };
}

/** The plan's counts alone. Read-only; writes nothing, sets no pref. */
export async function previewFlashcardMigration(
  now = Date.now(),
): Promise<MigrationReport> {
  return (await planFlashcardMigration(now)).report;
}

export async function migrateFlashcardSchedules(
  now = Date.now(),
): Promise<MigrationReport> {
  // NOT ARMED READS EXACTLY LIKE ALREADY-RUN to every caller: nothing
  // is touched and `skipped` comes back true. The boot path tells the
  // two apart itself so it can log the preview in one case and not the
  // other.
  const armed = await getPref<boolean>(PREF_FLASHCARD_MIGRATION_ARMED, false);
  if (!armed) {
    return { skipped: true, toMaintaining: 0, toAcquiring: 0, flagsCarried: 0, unclaimed: 0 };
  }
  const already = await getPref<boolean>(PREF_FLASHCARD_MIGRATION, false);
  if (already) {
    return { skipped: true, toMaintaining: 0, toAcquiring: 0, flagsCarried: 0, unclaimed: 0 };
  }

  const { report, writes } = await planFlashcardMigration(now);
  for (const row of writes) await putSpacingState(row);
  await setPref(PREF_FLASHCARD_MIGRATION, true);
  return report;
}

/** What the console shows before a run — the plan, with nothing done. */
export function describePreview(r: MigrationReport): string {
  return '[spacing] flashcard migration is WIRED AND NOT ARMED. '
    + `It would touch ${r.toMaintaining + r.toAcquiring} rows: `
    + `${r.toMaintaining} into maintaining, ${r.toAcquiring} into acquiring, `
    + `${r.flagsCarried} carrying a flag`
    + (r.unclaimed > 0 ? `, ${r.unclaimed} unclaimed and left alone` : '')
    + `. Set the pref '${PREF_FLASHCARD_MIGRATION_ARMED}' to run it.`;
}

/** What the console shows after a run. */
export function describeMigration(r: MigrationReport): string {
  if (r.skipped) return '[spacing] flashcard migration already run — nothing touched';
  return `[spacing] flashcard schedules carried across: `
    + `${r.toMaintaining} to maintaining, ${r.toAcquiring} to acquiring, `
    + `${r.flagsCarried} with flags`
    + (r.unclaimed > 0 ? `, ${r.unclaimed} unclaimed and left alone` : '');
}
