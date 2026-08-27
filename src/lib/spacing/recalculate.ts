/**
 * The one action that applies retroactively.
 *
 * =====================================================================
 * NORMAL EDITS DO NOT REACH WHAT IS ALREADY SCHEDULED. THIS DOES.
 *
 * Changing a setting applies from the next time that card is answered,
 * because the settings are resolved on every answer and nothing is
 * frozen onto the row. That is the right default: a card you are
 * part-way through should not have its due date moved under it by an
 * edit made on a settings screen.
 *
 * But it means a deliberate change — halving every ceiling, say — takes
 * as long to bite as it takes to work through the library. This is the
 * escape hatch, and it is deliberately separate, confirmed, and
 * counted first.
 *
 * WHAT IT DOES NOT TOUCH. A card with no due date is left alone: one
 * that has never been started has nothing to recompute, and one whose
 * level is out of the schedule is out on purpose. Neither is given a
 * due date it did not have.
 * =====================================================================
 */

import { db, type SpacingState } from '../db';
import { putSpacingState } from '../practiceWrites';
import { MS_PER_DAY } from './engine';
import { bandForRow } from './row';
import { loadOverrides, settingsForCard } from './store';

/** Rows that would actually change. Shown in the confirm. */
export async function countAffected(): Promise<number> {
  const rows = await db.spacingState.toArray();
  const overrides = await loadOverrides();
  let n = 0;
  for (const row of rows) {
    if (row.nextDueAt === null || row.nextDueAt === undefined) continue;
    const settings = settingsForCard(row.moduleRef, row.itemRef, overrides);
    if (!settings.inSchedule) continue;
    if (recomputedDueAt(row, settings) !== row.nextDueAt) n += 1;
  }
  return n;
}

/**
 * The due date the current settings would produce for a row that is
 * already scheduled.
 *
 * MEASURED FROM WHEN IT WAS LAST ANSWERED, not from now. Recalculating
 * must not hand every card in the library a fresh full-length wait
 * starting today — that would push a card due tomorrow out by a month
 * for the crime of having had its ceiling adjusted.
 */
function recomputedDueAt(
  row: SpacingState,
  settings: ReturnType<typeof settingsForCard>,
): number | null {
  const last = row.lastEngagedAt;
  if (last === null || last === undefined) return row.nextDueAt ?? null;

  // Acquiring rows keep their place in the tally: the pattern's gaps
  // are already measured from the last answer, so there is nothing a
  // settings change can retroactively move without inventing history.
  if ((row.spacingStage ?? 'maintaining') === 'acquiring') return row.nextDueAt ?? null;

  const band = bandForRow(row);
  const m = settings.maintaining;
  const ceiling = band === null ? m.firstWaitDays : m.perBand[band].ceilingDays;
  const wait = Math.max(
    m.minimumDays,
    Math.min(ceiling, row.currentIntervalDays > 0 ? row.currentIntervalDays : m.firstWaitDays),
  );
  return last + wait * MS_PER_DAY;
}

/** Apply it. Returns how many rows moved. */
export async function recalculateAllSchedules(): Promise<number> {
  const rows = await db.spacingState.toArray();
  const overrides = await loadOverrides();
  let moved = 0;
  for (const row of rows) {
    if (row.nextDueAt === null || row.nextDueAt === undefined) continue;
    const settings = settingsForCard(row.moduleRef, row.itemRef, overrides);
    if (!settings.inSchedule) continue;
    const next = recomputedDueAt(row, settings);
    if (next === null || next === row.nextDueAt) continue;
    const wait = row.lastEngagedAt === null || row.lastEngagedAt === undefined
      ? row.currentIntervalDays
      : (next - row.lastEngagedAt) / MS_PER_DAY;
    await putSpacingState({ ...row, nextDueAt: next, currentIntervalDays: wait });
    moved += 1;
  }
  return moved;
}
