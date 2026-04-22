// Shown above a quiz when focus mode has narrowed the pool below the
// minimum unique items needed for the rolling-window tier calculation
// to mean anything. The attempts still log to the database (calendar,
// daily goal, streaks all update normally) — we just skip the fluency
// side-effect so a tight drill session can't shortcut a tier change.
export default function FluencyProtectionNotice() {
  return (
    <div className="rounded-lg border border-developing/40 bg-developing/5 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-200">
      <span aria-hidden className="mr-1.5">ⓘ</span>
      focus sessions with fewer than 4 items don't count toward fluency tiers
      — practice freely without inflating your stats.
    </div>
  );
}
