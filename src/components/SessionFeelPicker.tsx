import { FEEL_OPTIONS, type Feel } from '../lib/fluencyScale';
import { feelColour } from '../lib/spacing/statusColour';

/**
 * The four-step fluency scale, drawn.
 *
 * ---------------------------------------------------------------
 * ONE PICKER, SO A SECOND SCALE CANNOT APPEAR BESIDE THE FIRST.
 *
 * Membership and order come from `FEEL_OPTIONS` in
 * `lib/fluencyScale.ts` — only the styling lives here — and now the
 * DRAWING lives in one place too. It was private to
 * `CellInteractionModal`, which was fine while that modal was the only
 * surface asking. Step 3d-6 adds a second, on the same page, and a
 * copied picker is how two scales end up side by side: one gets a step
 * relabelled, or a colour changed, and nobody notices they have
 * drifted until the two disagree about the same session.
 *
 * The one thing callers vary is the QUESTION. "How did this section
 * feel?" and "How did it go?" are genuinely different questions —
 * one is about a section, one about a whole sitting — answered on the
 * same scale. So `label` is a prop and the options are not.
 *
 * A THIRD 1–4 EXISTS and is deliberately not routed through here:
 * `lib/sessionTimer/blockRatingOptions.ts`, same shape, same SM-2
 * mapping, step 3 labelled "Clean" rather than "Comfortable". Merging
 * it restyles the session-block rating screen across S&P and
 * Production, which is dashboard work — see the build queue's *Also
 * carried*. Naming it here so the next person to add a picker knows it
 * is a known split rather than one they are about to create.
 * ---------------------------------------------------------------
 *
 * OPTIONAL EVERYWHERE. Null is a legitimate value and clicking the
 * active option clears it — an unrated session records the time
 * honestly rather than a middling score nobody gave.
 */
/**
 * THE HINTS ARE THIS FILE'S; THE COLOURS ARE NOT.
 *
 * Three files held a byte-identical copy of the four rating colours —
 * here, `blockRatingOptions` and `FEEL_CARD_OPTIONS` — so recolouring
 * the ramp was three edits. `statusColour` owns the mapping now:
 * Struggled is Needs Work, In flow is Mastered, and In flow follows
 * Mastered to the royal blue rather than staying a second green
 * alongside Clean.
 */
const FEEL_HINT: Record<Feel, string> = {
  1: 'breakdowns', 2: 'getting there', 3: 'steady, clean', 4: 'effortless',
};

const FEEL_STYLES: Record<Feel, { activeClass: string; inactiveClass: string; hint: string }> = {
  1: { ...feelStyle(1), hint: FEEL_HINT[1] },
  2: { ...feelStyle(2), hint: FEEL_HINT[2] },
  3: { ...feelStyle(3), hint: FEEL_HINT[3] },
  4: { ...feelStyle(4), hint: FEEL_HINT[4] },
};

function feelStyle(feel: Feel): { activeClass: string; inactiveClass: string } {
  const c = feelColour(feel);
  return { activeClass: c.fill, inactiveClass: c.outline };
}

export default function SessionFeelPicker({
  label,
  value,
  onChange,
}: {
  /** The question. Differs by surface; the scale does not. */
  label: string;
  value: Feel | null;
  onChange: (next: Feel | null) => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
        {label}{' '}
        <span className="text-neutral-400 font-normal">(Optional)</span>
      </div>
      <div className="flex items-stretch gap-2">
        {FEEL_OPTIONS.map(opt => {
          const active = value === opt.feel;
          const style = FEEL_STYLES[opt.feel];
          return (
            <button
              key={opt.feel}
              type="button"
              onClick={() => onChange(active ? null : opt.feel)}
              aria-pressed={active}
              className={`flex-1 px-3 py-2 rounded-md border text-sm transition-colors ${
                active ? style.activeClass : style.inactiveClass
              }`}
            >
              <span className="font-medium">{opt.label}</span>
              <span className="ml-1.5 opacity-70 text-[11px]">{style.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
