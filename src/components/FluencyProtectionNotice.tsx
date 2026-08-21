// Shown above a quiz when focus mode has narrowed the pool below the
// minimum unique items needed for the rolling-window tier calculation
// to mean anything. The attempts still log to the database (calendar,
// daily goal, streaks all update normally) — we just skip the fluency
// side-effect so a tight drill session can't shortcut a tier change.
//
// The rule itself comes from `lib/fluencyPool` rather than being
// written out here: the dashboard's legibility panel and the row prompt
// state the same rule, and three phrasings of one rule read as three
// rules.
import { FLUENCY_POOL_RULE } from '../lib/fluencyPool';

export default function FluencyProtectionNotice() {
  return (
    <div
      data-testid="fluency-protection-notice"
      className="rounded-lg border border-developing/40 bg-developing/5 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200"
    >
      <span aria-hidden className="mr-1.5">ⓘ</span>
      {FLUENCY_POOL_RULE} Practice freely — this session still counts
      toward coverage, recency and your streak.
    </div>
  );
}
