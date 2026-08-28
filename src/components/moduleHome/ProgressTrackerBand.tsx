/**
 * The boundary between a drill and the progress it produced.
 *
 * =====================================================================
 * ONE SHELL, AND IT REPLACES THREE DIFFERENT ANSWERS.
 *
 * A page that drills at the top and charts at the bottom has to say
 * where one stops. Three modules had solved that three ways: Reading
 * drew a hairline rule with a label beside it, Ear Training's four
 * trackers each rendered their own `<h2>Fluency Tracker</h2>`, and
 * Harmonic Fluency's category page drew nothing at all — the drill ran
 * straight into the grid.
 *
 * This is the one band, used by all of them. Not three components
 * built to look alike, and not a rule one page owns and the others
 * copy.
 * =====================================================================
 *
 * IT IS THE SCROLL TARGET AS WELL AS THE HEADING. A card's Progress
 * Tracker button lands here, so the reader arrives at the top of the
 * section rather than part-way into it. `ref` is forwarded for that;
 * `scroll-mt-4` keeps the band clear of the sticky app header when it
 * does.
 *
 * THE COLOUR IS THE APP HEADER'S, `#0f3d2e`, read off `Layout` rather
 * than approximated. Deliberately literal: the point of the band is
 * that it is the same dark green the page is already framed in, so a
 * near-miss would read as a third colour rather than as a repeat.
 */
import type { ReactNode, Ref } from 'react';

/** The app header's own green. Kept in step with `Layout`'s inline
 *  style by hand — there is no token for it, and inventing one here
 *  would put the definition in the wrong place. */
export const BAND_BACKGROUND = '#0f3d2e';

export default function ProgressTrackerBand({
  label,
  count,
  countNoun = 'items',
  right,
  ref,
  className = '',
  'data-testid': testId = 'progress-tracker-band',
}: {
  /** What the section is called. Defaults at the call site to
   *  `PROGRESS_TRACKER_LABEL` so the band and the button that scrolls
   *  to it cannot name different things. */
  label: string;
  /** Item count for the right end. Omitted where the page has no
   *  honest number — an absent count is better than a wrong one. */
  count?: number;
  countNoun?: string;
  /** Anything other than a count for the right end. Wins over `count`
   *  where a page has something more useful to say there. */
  right?: ReactNode;
  ref?: Ref<HTMLDivElement>;
  className?: string;
  'data-testid'?: string;
}) {
  const tail = right ?? (count === undefined
    ? null
    : `${count} ${count === 1 ? countNoun.replace(/s$/, '') : countNoun}`);

  return (
    <div
      ref={ref}
      data-testid={testId}
      // `h2` inside rather than on the wrapper: the band is a bar with
      // two ends, and the heading is only the left one.
      className={`mt-8 mb-5 rounded-lg px-4 py-2.5 text-white flex items-center justify-between gap-3 scroll-mt-4 ${className}`}
      style={{ backgroundColor: BAND_BACKGROUND }}
    >
      <h2 className="text-[0.78rem] font-bold uppercase tracking-[0.14em] leading-none">
        {label}
      </h2>
      {tail !== null && (
        <span className="text-[0.78rem] opacity-70 leading-none shrink-0">
          {tail}
        </span>
      )}
    </div>
  );
}
