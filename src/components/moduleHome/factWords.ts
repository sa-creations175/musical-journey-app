/**
 * How long, and how long ago, in the words the app already used.
 *
 * =====================================================================
 * LIFTED OUT OF `CategoryCard`, UNCHANGED.
 *
 * The card said "7m — 5m practice, 2m testing" and "4d ago"; the
 * summary tiles say the same two facts about the same section, one page
 * deeper. Two copies of these would have been two ways of saying
 * "yesterday" about one drill, and they would have drifted the first
 * time either was touched.
 * =====================================================================
 */

/**
 * Seconds as a reader would say them. Mirrors the drill modal's own
 * formatter — minutes once past one, hours once past sixty.
 */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** How long ago, in the words the card has always used. */
export function agoWord(daysAgo: number): string {
  if (daysAgo === 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  return `${daysAgo}d ago`;
}
