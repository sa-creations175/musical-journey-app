/**
 * How long a song may go untouched before its card says so.
 *
 * =====================================================================
 * NEGLECT IS NOT DECAY, AND THE CARD SAYS BOTH.
 *
 * A rung is a CLAIM, and `songRetestState` reports when that claim is
 * due to be re-proven or has lapsed. This is a different question: a
 * song can be neglected without any claim having decayed. Its keys can
 * all sit comfortably inside their intervals while the song itself has
 * not been touched in a month, because the schedule stretches as you
 * pass and a well-proven song asks for very little.
 *
 * So the two live apart on the card. The BADGE carries retest; the LAST
 * PRACTISED line carries neglect. Folding them into one signal would
 * make "this needs attention" mean two different jobs — one is "prove
 * this again or lose the rung", the other is "you have not played this
 * in a while" — which call for different responses.
 * =====================================================================
 *
 * PER STAGE, BECAUSE THE RUNGS ARE NOT ALIKE. A song still being
 * learned goes cold fastest: the representations are new and a week
 * away undoes real work. An internalized song is the point of all of
 * it — freed up, automatic, and safe to leave for three weeks.
 *
 * STORED AND EDITABLE, not constants in a file. The right values can
 * only be found by living with them, which is impossible while they are
 * invisible — the same admission `spacingPrefs.ts` makes about the
 * numbers next to these.
 */
import { getPref, setPref } from '../../lib/userPrefs';
import type { RepertoireStage } from '../../lib/db';
import { STAGES } from './stage';

/** One pref key per rung, derived rather than four literals. */
export function practiceWindowKey(stage: RepertoireStage): string {
  return `songPracticeWindowDays.${stage}`;
}

/**
 * Starting values. Not arbitrary, and not a measurement either —
 * a first guess at how fast each rung goes cold, put on screen so it
 * can be argued with.
 */
export const PRACTICE_WINDOW_DEFAULTS: Record<RepertoireStage, number> = {
  'learning': 7,
  'comfortable': 14,
  'cross-key': 14,
  'internalized': 21,
};

export type PracticeWindows = Record<RepertoireStage, number>;

/** Clamp a stored value into something usable. These cross a sync
 *  boundary and can arrive from another device or an older build; a
 *  zero or a negative would make every song permanently stale. */
function positive(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1
    ? Math.round(raw)
    : fallback;
}

export async function getPracticeWindows(): Promise<PracticeWindows> {
  const entries = await Promise.all(STAGES.map(async stage => {
    const raw = await getPref<number>(
      practiceWindowKey(stage), PRACTICE_WINDOW_DEFAULTS[stage],
    );
    return [stage, positive(raw, PRACTICE_WINDOW_DEFAULTS[stage])] as const;
  }));
  return Object.fromEntries(entries) as PracticeWindows;
}

export async function setPracticeWindow(
  stage: RepertoireStage,
  value: number,
): Promise<void> {
  await setPref(practiceWindowKey(stage), Math.max(1, Math.round(value)));
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whether this song has gone past its window.
 *
 * NEVER PRACTISED IS NOT STALE. A song added this morning has no
 * practice to be behind on, and amber on it would be scolding the
 * reader for a song they have not started rather than one they have
 * let go. The card already says "not practised yet" in words.
 */
export function practiceIsStale(
  lastPractisedAt: number | null,
  stage: RepertoireStage,
  now: number,
  windows: PracticeWindows,
): boolean {
  if (lastPractisedAt === null) return false;
  return now - lastPractisedAt > windows[stage] * MS_PER_DAY;
}
