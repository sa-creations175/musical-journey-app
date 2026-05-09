import type { MonthlySuggestion } from './hfMonthly';

/**
 * Custom target shape for the monthly Repertoire suggestion. The
 * existing SongTargetSelection in GoalCreationFlow models a single
 * song goal — but the spec for monthly repertoire is multi-song:
 *
 *   Section 1 — Maintaining & advancing: every active song, target
 *   "comfortable" through the month.
 *
 *   Section 2 — New this month: a protected slot supporting one or
 *   more new songs, with placeholder support (empty slot until the
 *   user picks). New songs entered here auto-add to the catalog.
 *
 * Save logic for this shape (umbrella + N children, one per song)
 * lives in the body component; the suggestion fn just declares the
 * intent shape. Active song IDs aren't populated here — the body
 * component fetches them at mount via Dexie since suggestion fns
 * are intentionally pure / synchronous.
 */
export type RepertoireProficiencyLevel =
  | 'learning'
  | 'comfortable'
  | 'internalized'
  | 'cross-key'
  | 'maintenance';

export interface RepertoireMonthlyTarget {
  /** Active song IDs to maintain at `maintainLevel` through the
   *  month. Body component populates this on mount from the user's
   *  Dexie repertoire — empty here. */
  activeSongIds: string[];
  /** Target proficiency for active songs. Spec baseline:
   *  'comfortable'. */
  maintainLevel: RepertoireProficiencyLevel;
  /** New song(s) the user wants to start this month. Empty by
   *  default — the body component renders a multi-song picker /
   *  placeholder slot here. New songs entered through this slot
   *  auto-add to the user's repertoire catalog. */
  newSongIds: string[];
  /** Same proficiency vocabulary; new songs typically aim for
   *  'learning' as a starting milestone. */
  newSongLevel: RepertoireProficiencyLevel;
}

export function suggestRepertoireMonthly(): MonthlySuggestion<RepertoireMonthlyTarget> {
  return {
    target: {
      activeSongIds: [],
      maintainLevel: 'comfortable',
      newSongIds: [],
      newSongLevel: 'learning',
    },
    contextLines: [
      'Maintain every active song at comfortable through the month.',
      'Plus at least one new song to start working on — pick from the catalog or add a new one.',
    ],
  };
}
