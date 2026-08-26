/**
 * What the mixed drill on a module home is called.
 *
 * =====================================================================
 * ONE STRING, ONE PLACE, BOTH HOMES.
 *
 * Harmonic fluency said "all categories mixed" and reading said "all
 * four mixed" — two sentences for one button, and reading's carried a
 * number in words that nothing could keep true. A category added to
 * either module would have left the wrong word on the screen with
 * nothing to catch it.
 *
 * THE COUNT IS THE POOL'S OWN LENGTH, passed by the caller from the
 * SAME array it hands the drill. Not a constant beside the button, not
 * a second read of the catalog: the number on the button and the
 * number of categories the run draws from are the same value, so they
 * cannot disagree and neither needs updating when a category moves.
 * =====================================================================
 */
export function mixedDrillLabel(poolSize: number): string {
  return `Start Drill · All Categories (${poolSize}) Mixed`;
}
