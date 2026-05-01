/**
 * Phase 3 Step 4h — Personal affirmation surface.
 *
 * Renders a single affirmation in italic neutral text below the
 * session stack. Hidden entirely when no affirmation is supplied.
 *
 * The proposal screen passes a pre-picked affirmation (chosen via
 * pickRandomAffirmation from the user's past pool); this component
 * only paints. Keeps random-pick logic pure + testable, separate
 * from the React tree.
 */

interface Props {
  affirmation: string | null;
}

export default function AffirmationSurface({ affirmation }: Props) {
  if (!affirmation) return null;
  return (
    <div
      className="text-center text-[12px] italic text-neutral-500 dark:text-neutral-400 px-3 py-1.5"
      aria-label="personal affirmation"
    >
      &ldquo;{affirmation}&rdquo;
    </div>
  );
}
