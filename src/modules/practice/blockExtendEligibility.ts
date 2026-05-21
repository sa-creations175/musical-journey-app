/**
 * Which blocks may be extended from the rating screen (prep-flow).
 *
 * Per the design: extend appears on flashcard, shapes & patterns, and
 * repertoire/song drills — NOT on warm-ups or mental visualization.
 * Mental viz shares the `shapes-and-patterns` moduleRef, so it's
 * distinguished by its quickLaunchRoute (`…?tab=mental-viz`).
 */

const EXTEND_ELIGIBLE_MODULES: ReadonlySet<string> = new Set([
  'harmonic-fluency', // flashcards
  'ear-training', // flashcards / quiz
  'shapes-and-patterns', // chord-shape / scale / VL drills
  'repertoire', // song drills
]);

export function canExtendBlock(block: {
  moduleRef: string;
  isWarmup?: boolean;
  quickLaunchRoute?: string;
}): boolean {
  if (block.isWarmup) return false;
  // Mental viz rides the shapes moduleRef but isn't a timed drill.
  if (block.quickLaunchRoute?.includes('mental-viz')) return false;
  return EXTEND_ELIGIBLE_MODULES.has(block.moduleRef);
}
