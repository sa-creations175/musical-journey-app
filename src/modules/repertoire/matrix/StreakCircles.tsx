/**
 * Three slots, filling.
 *
 * =====================================================================
 * SLOTS, NOT A NUMBER, AND THAT IS THE WHOLE DESIGN.
 *
 * "2 of 3" is a fact and does nothing for the part of you that wants to
 * finish the set. The bar is three in a row, so it should look like
 * three things to fill.
 *
 * THE RESET HAS TO BE SEEN HAPPENING. Getting to two and losing it is
 * information about how solid the song actually is, and it is the
 * moment the bar means anything. A count that quietly changed from 2 to
 * 0 would hide the only event worth noticing, so a broken streak turns
 * the slots red until the next run.
 *
 * =====================================================================
 * ONE IMPLEMENTATION, TWO PLACES, DIFFERENT SIZES.
 *
 * The panel has room for the circles plus the sentence explaining them;
 * the lead-sheet strip has room for the circles alone. That is a size
 * difference and a caption difference, not a second component — drawing
 * three circles twice is how the two end up disagreeing about what a
 * broken streak looks like.
 *
 * It carries NO text of its own, which is what makes it usable in a
 * strip. The aria label names the count and comes from the caller,
 * because the strip and the panel are describing sessions of different
 * kinds and the app never says the bare word.
 * =====================================================================
 */
interface Props {
  /** How many of the three are filled, 0–3. */
  count: number;
  /** True when the last gate-relevant run was not clean. */
  broken: boolean;
  /** `sm` for the strip, `md` for the panel. */
  size?: 'sm' | 'md';
  /** Names the count for assistive tech. The caller supplies it
   *  because only the caller knows which kind of session this is. */
  label: string;
}

const DOT_SIZE: Record<'sm' | 'md', string> = {
  sm: 'w-3.5 h-3.5 border-2',
  md: 'w-5 h-5 border-2',
};

export default function StreakCircles({
  count, broken, size = 'md', label,
}: Props) {
  return (
    <span
      className="inline-flex items-center gap-2"
      role="img"
      aria-label={label}
    >
      {[0, 1, 2].map(i => (
        <span
          key={i}
          aria-hidden
          className={[
            DOT_SIZE[size],
            'rounded-full transition-colors',
            broken
              ? 'border-needswork/50 bg-transparent'
              : i < count
                ? 'border-blue-500 bg-blue-500'
                : 'border-neutral-300 dark:border-neutral-600 bg-transparent',
          ].join(' ')}
        />
      ))}
    </span>
  );
}
