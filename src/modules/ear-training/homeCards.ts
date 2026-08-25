/**
 * Ear training's adapter: four sub-modules → four cards.
 *
 * =====================================================================
 * THE ONE ASYMMETRY, AND IT IS DELIBERATE.
 *
 * The other two adapters describe things INSIDE one drill — a flashcard
 * category, a reading skill. These describe whole sub-modules, each
 * with its own route, its own catalog and its own attempts table
 * scope. The ear-training page runs no drill of its own, so a card here
 * navigates rather than filters.
 *
 * That is why this file exports `route` alongside the card: the page
 * needs somewhere to send you, and the other two do not.
 * =====================================================================
 *
 * ONE HUE ACROSS ALL FOUR. `moduleMeta` already gives intervals, chord
 * recognition, chord progressions and scales & modes the same
 * `#5a8752`, and the grid resolves the tint from the PARENT id, so all
 * four cards read as one module rather than four.
 *
 * COUNTS COME FROM `earTrainingCounts()`. See the report: those are
 * spacing-ROW counts, so intervals reads 26 where its catalogue is 13
 * seeds — a real question about what a card should denominate, raised
 * rather than answered here.
 */
import type { AttemptRecord } from '../../lib/db';
import { categoryCardStats, type CategoryCardModel } from '../../components/moduleHome/model';
import { earTrainingCounts } from '../../lib/moduleItemCounts';

/** The parent module, whose accent all four cards share. */
export const EAR_TRAINING_MODULE_ID = 'ear-training';

export interface EarTrainingSubModule {
  /** The attempts `moduleId` AND the card key — one identity. */
  id: string;
  label: string;
  route: string;
}

/**
 * Order is the pedagogical one the page already had, and matches
 * `ET_MODULE_REFS` in goals/progress.ts. Not sorted here.
 */
export const EAR_TRAINING_SUB_MODULES: ReadonlyArray<EarTrainingSubModule> = [
  { id: 'intervals',          label: 'intervals',          route: '/ear-training/intervals' },
  { id: 'chord-recognition',  label: 'chord recognition',  route: '/ear-training/chord-recognition' },
  { id: 'chord-progressions', label: 'chord progressions', route: '/ear-training/chord-progressions' },
  { id: 'scales-modes',       label: 'scales & modes',     route: '/ear-training/scales-modes' },
];

export function earTrainingRouteFor(key: string): string | null {
  return EAR_TRAINING_SUB_MODULES.find(m => m.id === key)?.route ?? null;
}

export function earTrainingCards(
  attempts: readonly AttemptRecord[],
  intervalsByModule: ReadonlyMap<string, ReadonlyMap<string, number>>,
  now: number,
): CategoryCardModel[] {
  const counts = earTrainingCounts();
  const countFor: Readonly<Record<string, number>> = {
    'intervals': counts.intervals,
    'chord-recognition': counts.chordRecognition,
    'chord-progressions': counts.chordProgressions,
    'scales-modes': counts.scalesModes,
  };

  return EAR_TRAINING_SUB_MODULES.map(mod => ({
    key: mod.id,
    label: mod.label,
    itemCount: countFor[mod.id] ?? 0,
    // The one line lands when the copy exists — see the report. The
    // four descriptions the old sub-module list carried are NOT moved
    // here; that would be a fifth home for the same sentence.
    description: null,
    // Each sub-module keeps its own spacing map: `useSpacingIntervals`
    // is keyed per module ref, and merging them would let two modules'
    // identically named itemRefs collide.
    ...categoryCardStats(
      attempts.filter(a => a.moduleId === mod.id),
      intervalsByModule.get(mod.id) ?? new Map(),
      now,
    ),
  }));
}
