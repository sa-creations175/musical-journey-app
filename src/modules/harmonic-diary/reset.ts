import { db } from '../../lib/db';
import { drain } from '../../lib/sync/engine';
import { getCurrentUserId } from '../../lib/sync/currentUser';
import { allStarters } from './starters';
import { seedStartersIfNeeded, SEED_DIARY_PREF } from './data';

/**
 * One-shot console utility to clean up duplicate Harmonic Diary
 * entries.
 *
 * What it does:
 *   1. Read current local + queued count for inspection.
 *   2. `bulkDelete` every harmonicDiaryEntries row. bulkDelete fires
 *      the `deleting` hook for each row, which enqueues a `delete` op
 *      on the sync queue → cloud rows go away too.
 *   3. Delete the SEED_DIARY_PREF userPrefs row (also synced) so the
 *      seeder's version-flag guard sees the seed as "not yet run."
 *   4. Wait for the sync queue to drain to zero so the cloud actually
 *      reflects the deletes before we re-seed.
 *   5. Call `seedStartersIfNeeded`. Flag is gone, in-flight guard is
 *      fresh — runs exactly one clean seed.
 *   6. Wait for that seed to drain to cloud.
 *   7. Return before/after counts + the expected count for verification.
 *
 * Why not `db.harmonicDiaryEntries.clear()`: clear() is a table-level
 * truncate that does NOT fire per-row hooks. It would wipe local but
 * leave the cloud copies in place, and the next replace-mode pull
 * would re-hydrate the duplicates back into local.
 *
 * Console:
 *   await window.__resetHarmonicDiary()
 */
export async function resetHarmonicDiary(): Promise<{
  before: { local: number; queued: number };
  after: { local: number; queued: number };
  expected: number;
  ok: boolean;
}> {
  if (!getCurrentUserId()) {
    throw new Error('Not signed in. Sign in before running reset.');
  }

  const expected = allStarters().length;
  const beforeLocal = await db.harmonicDiaryEntries.count();
  const beforeQueued = await db.syncQueue.count();
  console.log(`[reset] before: local=${beforeLocal}, queued=${beforeQueued}, expected after reset=${expected}`);

  // 1. Delete all diary entries. bulkDelete fires `deleting` hooks
  //    which enqueue per-row deletes — that's how the cloud copies
  //    get cleaned up too.
  const allEntries = await db.harmonicDiaryEntries.toArray();
  const allIds = allEntries.map(e => e.entryId);
  if (allIds.length > 0) {
    await db.harmonicDiaryEntries.bulkDelete(allIds);
    console.log(`[reset] bulkDeleted ${allIds.length} local rows`);
  }

  // 2. Drop the seed flag so the seeder's version check passes.
  //    userPrefs is synced too, so this propagates.
  await db.userPrefs.delete(SEED_DIARY_PREF);
  console.log(`[reset] cleared seed flag (${SEED_DIARY_PREF})`);

  // 3. Wait for everything we just queued (deletes + flag clear) to
  //    actually push to Supabase before we trigger the re-seed —
  //    otherwise a tab-focus pull could race the seed and confuse us.
  await waitForQueueDrain('post-delete');

  // 4. Fresh seed. Flag is gone, in-flight guard cleared the previous
  //    null'd state, so this runs the full seeder once.
  await seedStartersIfNeeded();
  console.log('[reset] seedStartersIfNeeded complete');

  // 5. Wait for the new entries to push to the cloud.
  await waitForQueueDrain('post-seed');

  const afterLocal = await db.harmonicDiaryEntries.count();
  const afterQueued = await db.syncQueue.count();
  const ok = afterLocal === expected && afterQueued === 0;
  console.log(`[reset] after: local=${afterLocal}, queued=${afterQueued}, expected=${expected}, ok=${ok}`);

  return {
    before: { local: beforeLocal, queued: beforeQueued },
    after: { local: afterLocal, queued: afterQueued },
    expected,
    ok,
  };
}

/**
 * Wait for the sync queue to drain to zero. The sync layer's
 * `drain()` function bails immediately if another drain is already
 * running (concurrency guard), so we can't just `await drain()` once
 * — we have to poll.
 *
 * Also gives the Dexie write hooks' `setTimeout(fn, 0)` deferrals a
 * chance to fire before the first count check.
 */
async function waitForQueueDrain(label: string, timeoutMs = 10_000): Promise<void> {
  // Give hook setTimeouts a chance to enqueue.
  await new Promise(r => setTimeout(r, 50));
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await drain();
    const remaining = await db.syncQueue.count();
    if (remaining === 0) return;
    await new Promise(r => setTimeout(r, 200));
  }
  const remaining = await db.syncQueue.count();
  console.warn(`[reset] ${label}: queue did not fully drain within ${timeoutMs}ms (${remaining} items remain)`);
}

declare global {
  interface Window {
    __resetHarmonicDiary?: typeof resetHarmonicDiary;
  }
}

if (typeof window !== 'undefined') {
  window.__resetHarmonicDiary = resetHarmonicDiary;
}
