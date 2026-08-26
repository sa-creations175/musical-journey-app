/**
 * The freshness scale, printed under the bars it explains.
 *
 * =====================================================================
 * NOTHING HAS TO BE DECODED.
 *
 * A bar at five sixths is meaningless on its own — the reader would
 * have to know there are seven rungs, that they are evenly spaced, and
 * where "within 1 week" sits among them. So the scale is on the screen:
 * every rung, at the length it draws, with its own words beside it.
 *
 * ONLY ON THE FRESHNESS TAB. Coverage and accuracy are percentages and
 * a percentage explains itself; freshness is the one measure whose bar
 * is a position on a scale rather than a proportion of something.
 * =====================================================================
 *
 * NEUTRAL, NOT TIERED. These segments are showing LENGTH, and colouring
 * them would put a second meaning on a swatch whose only job here is to
 * show how long each rung is. Colour on this screen is always accuracy,
 * and a scale of freshness has no accuracy to report.
 */
import { freshnessRungs } from './freshnessScale';

export default function FreshnessScaleStrip({ stepDays }: { stepDays: number }) {
  const rungs = freshnessRungs(stepDays);
  return (
    <div
      data-testid="mobile-freshness-scale"
      className="rounded-lg border border-black/[0.07] bg-neutral-50 dark:bg-neutral-800/40 px-2.5 py-2 space-y-1"
    >
      {rungs.map(rung => (
        <div
          key={rung.label}
          data-testid="mobile-freshness-rung"
          data-rung={rung.label}
          className="flex items-center gap-2"
        >
          <span
            aria-hidden
            className="h-1.5 w-14 shrink-0 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700"
          >
            <span
              className="block h-full bg-neutral-500 dark:bg-neutral-400"
              style={{ width: `${Math.round(rung.fraction * 100)}%` }}
            />
          </span>
          <span className="text-[10px] text-neutral-500">{rung.label}</span>
          {/* WHAT THE WORDS ARE WORTH, once the step has been moved off
              its default. Silent at the default, where "within 1 week"
              already says seven days and repeating it would be noise. */}
          {rung.upToDays !== null && rung.upToDays > 0 && (
            <span className="text-[10px] text-neutral-400 tabular-nums ml-auto">
              {rung.upToDays}d
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
