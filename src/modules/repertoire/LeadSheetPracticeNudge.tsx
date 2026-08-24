/**
 * The offer, at the moment lead-sheet editing begins.
 *
 * ---------------------------------------------------------------
 * A NUDGE, AND EVERYTHING ABOUT IT SAYS SO.
 *
 * It appears AFTER the edit has landed, not before — so nothing about
 * it can read as permission being asked for. Dismissing changes only
 * whether the time gets recorded.
 *
 * Inline at the top of the lead sheet card, never a modal and never
 * over the sheet. You are at the piano, and the thing you were reading
 * has to stay readable.
 *
 * "You're building the lead sheet" is the activity's OWN wording, from
 * `lib/practiceActivities.ts`. The nudge and the chip the user would
 * tick afterwards say the same thing, so the offer and the record
 * agree about what the work was.
 *
 * `not now` is quiet text rather than a button, because dismissing is
 * the cheaper action and should not compete with the offer.
 * ---------------------------------------------------------------
 *
 * NOT RENDERED AT ALL when the target cell cannot be resolved — see
 * `cellForLeadSheetEdit`. A "start practising" that opens nothing is
 * the RUN-button dishonesty again: there is no honest label for a
 * button that does nothing.
 */
export default function LeadSheetPracticeNudge({
  onStart, onDismiss,
}: {
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-md border border-[#E88943]/40 bg-[#E88943]/5 px-3 py-2.5 space-y-2">
      <div className="space-y-1">
        <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100">
          You’re building the lead sheet, and nothing is being timed.
        </p>
        <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
          That’s practice. Start a session and this time lands on the song.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          className="px-3 py-1.5 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90"
        >
          start practising
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          not now
        </button>
      </div>
    </div>
  );
}
