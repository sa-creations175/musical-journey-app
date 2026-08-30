import StreakCircles from '../../repertoire/matrix/StreakCircles';

/**
 * Where you are, what you are doing, and what it gets you — one picture.
 *
 * =====================================================================
 * THE PROGRESS BAR AND THE PRIZE IN THE SAME LINE.
 *
 * The circles on their own say how far through you are. The rung words
 * on their own say what a pass is worth. Neither answers the question
 * someone actually has three runs into a test, which is "is this worth
 * finishing" — and that question is only answerable by seeing both at
 * once.
 *
 * So: where this item stands now, the three circles filling, and the
 * rung it lands on. The destination is drawn as an outline until the
 * third circle fills and then lights, because a prize that looks won
 * before it is won is not a prize.
 *
 * =====================================================================
 * TWO VOCABULARIES, AND THE CALLER PICKS.
 *
 * A whole-song test moves the SONG LADDER: Learning → Comfortable. A
 * section or a chord shape moves a BAND: whatever it reads now →
 * whatever the three winners would set.
 *
 * This component takes words rather than choosing them. It has no way
 * to know which ladder an item is on, and a `kind` prop would be a
 * second place that decides — one that could disagree with the result
 * screen, which decides the same thing from the same fact.
 *
 * NO NEW COPY. Every word on it is `STAGE_LABEL` or `TIER_LABEL`, both
 * already the app's, and it says nothing of its own.
 * =====================================================================
 */
interface Props {
  /** Where the item stands now — the app's word for it. */
  from: string;
  /** Where a pass would put it. */
  to: string;
  /** The destination's colour, once it is won. A Tailwind background
   *  class, so the band borrows the same palette the grids use rather
   *  than a second set of colours for the same rungs. */
  toneClass: string;
  /** How many of the three are filled. */
  count: number;
  /** True when the last counting run was below Clean. */
  broken: boolean;
  /** Emphasised for a whole song — the claim is bigger, and the band
   *  is the one place on the panel that can say so without words. */
  emphasised?: boolean;
}

export default function TestLadderBand({
  from, to, toneClass, count, broken, emphasised = false,
}: Props) {
  const won = count >= 3;

  return (
    <div
      className={[
        'flex items-center justify-center gap-3 flex-wrap',
        'rounded-lg border px-3 py-3',
        emphasised
          ? 'border-fluent bg-fluent/5'
          : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900',
      ].join(' ')}
    >
      <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
        {from}
      </span>

      <StreakCircles
        count={count}
        broken={broken}
        label={`${count} of 3 clean run-throughs in a row`}
      />

      {/* AN OUTLINE UNTIL IT IS WON. Dashed rather than dimmed: dimmed
          reads as disabled, and this is not unavailable — it is not
          yet earned. */}
      <span
        className={[
          'px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold whitespace-nowrap transition-colors',
          won
            ? `${toneClass} text-white`
            : 'border border-dashed border-neutral-300 dark:border-neutral-600 text-neutral-400',
        ].join(' ')}
      >
        {to}
      </span>
    </div>
  );
}
