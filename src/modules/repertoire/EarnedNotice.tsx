import { useEffect, useState } from 'react';
import { STAGE_LABEL } from './stage';
import type { SongStageEarned } from '../../lib/db';

/**
 * "You just earned this rung, and here is what did it."
 *
 * ---------------------------------------------------------------
 * THE PAGE CHANGES; NOTHING ASKS TO BE DISMISSED.
 *
 * This is the payoff for "play it, prove it, three times", and the
 * temptation is a modal — a dialog, a burst of confetti, something
 * that makes sure you noticed. It would be the wrong reward. You are
 * at the piano with your hands on the keys; anything that has to be
 * clicked away is an interruption charging you for good news. A page
 * that visibly changed is better than a dialog, every time.
 *
 * So: the tick lands in the panel while you are looking at it, the
 * rung group closes as the next one opens, and this arrives LAST,
 * naming what happened. Three parts of one motion, none of them
 * blocking.
 *
 * SAME SLOT AS THE DEMOTION NOTICE, which is why neither component
 * positions itself — the page renders one or the other. A drop and a
 * climb side by side would be two sentences about the same song
 * pointing in opposite directions.
 *
 * ---------------------------------------------------------------
 * ONLY A STATUS CHANGE GETS THIS. A DECISION, NOT AN OVERSIGHT.
 *
 * `stageEarned` is written by `stageReconciliation`, which runs on a
 * change of RUNG. So meeting one of Internalized's three criteria
 * without advancing produces no notice, no auto-opened panel, and no
 * tick-and-crossfade — the collapsed header's count simply moves,
 * "0 of 8 keys run clean" to "1 of 8".
 *
 * That is the right size of feedback for that size of event, and the
 * asymmetry is the point. If every criterion got the full treatment,
 * the one that actually matters would stop feeling different from
 * the ones that do not — the ceremony would become the background
 * and there would be nothing left to mark a rung with.
 *
 * The alternative was considered and declined: recording
 * criterion-completion events (a `criteriaMetLabels` watermark on the
 * song, diffed each evaluation) would make every tick witnessable.
 * It would also make every tick a small celebration, which is the
 * failure above, at the cost of a second event log to keep correct.
 * ---------------------------------------------------------------
 */
export default function EarnedNotice({
  earned,
}: {
  earned: SongStageEarned;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced);

  useEffect(() => {
    if (shown) return;
    // LAST of the three. The panel's tick lands at two frames; this
    // waits past that so the eye reads them in order rather than
    // being given two changes at once and choosing one.
    const t = window.setTimeout(() => setShown(true), 450);
    return () => window.clearTimeout(t);
  }, [shown]);

  return (
    <div
      className={[
        'rounded-md border border-fluent/40 bg-fluent/10 px-3 py-2.5',
        'motion-safe:transition-opacity motion-safe:duration-300',
        shown ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100">
        {STAGE_LABEL[earned.to]} — earned just now.
      </p>
      <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
        {/* The criterion as it read at the moment it completed, so the
            sentence stays true after the key it names is re-spelled or
            the rule beneath it changes. */}
        {earned.criterionLabel}.
      </p>
    </div>
  );
}

/** Duplicated deliberately rather than shared with the panel: this
 *  module is rendered by the page and that one by the panel, and a
 *  four-line hook is cheaper than a dependency between them. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
