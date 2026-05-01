/**
 * Phase 3 Step 4i — Cold-start banner state.
 *
 * Per design Part 6, a one-time banner sits above the user's first
 * generated proposal:
 *
 *   "This is your first generated session — recommendations will
 *    get smarter as you practice."
 *
 * It disappears after the first generated session, never to be seen
 * again. State persists via userPrefs so a fresh tab / device sync
 * still respects it.
 *
 * Trigger to dismiss: the session-end flow (Step 6k) calls
 * markColdStartBannerSeen() once the user has actually completed
 * their first generated session. The banner is NOT dismissable by
 * the user during cold-start — it's an honest one-time note, not a
 * recurring nag.
 */
import { getPref, setPref } from '../../lib/userPrefs';

const KEY_SEEN = 'practice.coldStartBannerSeen';

export const COLD_START_BANNER_TEXT =
  'This is your first generated session — recommendations will get smarter as you practice.';

export async function shouldShowColdStartBanner(): Promise<boolean> {
  const seen = await getPref<boolean>(KEY_SEEN, false);
  return !seen;
}

export async function markColdStartBannerSeen(): Promise<void> {
  await setPref(KEY_SEEN, true);
}
