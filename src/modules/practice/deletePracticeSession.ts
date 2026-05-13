/**
 * Cascade-delete a practice session: removes the session row plus
 * every practiceBlocks row that references it, then waits one
 * microtask + drains the sync queue so the Supabase mirror catches
 * up before the caller resolves.
 *
 * Mirrors the Re-plan delete pattern in ConfirmedWeeklyPlanSummary
 * (Goals.tsx). The Dexie `deleting` hook schedules a setTimeout(0)
 * enqueue per row (see lib/sync/hooks.ts) — we yield once so those
 * callbacks land in db.syncQueue, then drain pushes the deletes to
 * Supabase. Without the yield + drain a fast page refresh after
 * delete could lose the deletes to the next pull's replace-bulkPut.
 *
 * Returns the count of blocks deleted alongside the session so
 * callers can surface meaningful confirmation copy if needed.
 */
import { db } from '../../lib/db';
import { drain } from '../../lib/sync/engine';

export interface DeletePracticeSessionResult {
  blocksDeleted: number;
}

export async function deletePracticeSession(
  sessionId: string,
): Promise<DeletePracticeSessionResult> {
  const blockIds = await db.practiceBlocks
    .where('sessionId')
    .equals(sessionId)
    .primaryKeys();

  if (blockIds.length > 0) {
    await db.practiceBlocks.bulkDelete(blockIds);
  }
  await db.practiceSessions.delete(sessionId);

  // Let the Dexie deleting hooks' setTimeout(0) enqueues fire, then
  // push to Supabase. See lib/sync/hooks.ts for the PSD-escape
  // rationale behind the deferred enqueue.
  await new Promise(resolve => setTimeout(resolve, 0));
  await drain();

  return { blocksDeleted: blockIds.length };
}
