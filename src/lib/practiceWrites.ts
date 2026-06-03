import {
  db,
  type AttemptRecord,
  type DrillSession,
  type SpacingState,
} from './db';
import { isDevMode } from './devMode';

/**
 * Dev-Mode-gated wrappers for the three practice-data write paths.
 *
 * Call sites that record real practice (quiz attempts, spacing decay
 * updates, drill sessions) go through these instead of `db.<table>`
 * directly. When Dev Mode is ON every wrapper is a silent no-op, so a
 * test session leaves attempts / spacingState / drillSessions
 * untouched. Every OTHER table still writes normally — Dev Mode only
 * suppresses practice data.
 *
 * The check lives here (application layer), NOT in a Dexie hook, so
 * suppression is explicit and greppable at the call site. The `void`
 * return of the no-op branch matches each Dexie method's
 * fire-and-forget usage at the call sites.
 */

export async function addAttempt(record: AttemptRecord): Promise<void> {
  if (isDevMode()) return;
  await db.attempts.add(record);
}

export async function bulkAddAttempts(
  records: ReadonlyArray<AttemptRecord>,
): Promise<void> {
  if (isDevMode()) return;
  await db.attempts.bulkAdd([...records]);
}

export async function putSpacingState(state: SpacingState): Promise<void> {
  if (isDevMode()) return;
  await db.spacingState.put(state);
}

export async function addDrillSession(session: DrillSession): Promise<void> {
  if (isDevMode()) return;
  await db.drillSessions.add(session);
}

export async function bulkAddDrillSessions(
  sessions: ReadonlyArray<DrillSession>,
): Promise<void> {
  if (isDevMode()) return;
  await db.drillSessions.bulkAdd([...sessions]);
}
