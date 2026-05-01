/**
 * Phase 3 Step 4i — Cold-start one-time banner.
 *
 * Sits above the proposal screen on the user's first generated
 * session only. Hidden afterward forever (state held in userPrefs;
 * see coldStartBanner.ts).
 *
 * Display-only component. The proposal screen owns the visibility
 * read; this just renders when told. No close button — the banner
 * dismisses itself when the user completes their first generated
 * session (Step 6k).
 */
import { COLD_START_BANNER_TEXT } from './coldStartBannerPref';

interface Props {
  visible: boolean;
}

export default function ColdStartBanner({ visible }: Props) {
  if (!visible) return null;
  return (
    <div
      role="status"
      className="rounded-md border border-fluent/30 bg-fluent/5 px-3 py-2 text-[12px] text-neutral-700 dark:text-neutral-200"
    >
      {COLD_START_BANNER_TEXT}
    </div>
  );
}
