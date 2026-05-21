/**
 * Which blocks may be extended from the rating screen (prep-flow).
 *
 * Per the design: extend appears on flashcard, shapes & patterns, and
 * repertoire/song drills — NOT on mental visualization. Scale-drill
 * warm-ups are an exception: they carry `isWarmup` (they precede the
 * main work) but are full in-session drills you may want more time on,
 * so they DO get extend. Mental viz shares the `shapes-and-patterns`
 * moduleRef, so it's distinguished by its quickLaunchRoute.
 */
import { scaleCellForItemRef } from '../shapes-and-patterns/scaleSkills';

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
  itemRefs?: string[];
}): boolean {
  // Mental viz rides the shapes moduleRef but isn't a timed drill.
  if (block.quickLaunchRoute?.includes('mental-viz')) return false;
  // Scale-drill blocks are extendable even though they're flagged as
  // warm-ups — they're the in-session runner's drills.
  const isScaleDrill =
    !!block.itemRefs?.length && scaleCellForItemRef(block.itemRefs[0]) !== null;
  if (isScaleDrill) return true;
  if (block.isWarmup) return false;
  return EXTEND_ELIGIBLE_MODULES.has(block.moduleRef);
}
