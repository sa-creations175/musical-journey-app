import { getPref, setPref } from '../../lib/userPrefs';
import type { IntervalBounds } from '../../lib/spacingState';
import { INTERVAL_GROWTH_FACTOR } from '../../lib/spacingState';
import type { DueWindows } from './matrix/keySpacing';

/**
 * How often a song key has to be proven again, as four settings.
 *
 * ---------------------------------------------------------------
 * THE NUMBERS WERE ALWAYS THERE. NOBODY HAD EVER SEEN THEM.
 *
 * A flat 30-day window decided when every key on every song lapsed,
 * and a 30-day ceiling in `MAX_INTERVAL_BY_MEMORY_TYPE` decided how
 * far the interval could ever stretch. Both were constants nobody had
 * looked at, deciding something the user cares about a great deal —
 * the same class of rule `RULE_LEGIBILITY.md` tracks about seventy of.
 *
 * Making them settings is not a feature so much as an admission: the
 * right values can only be found by living with them, and that is
 * impossible while they are invisible.
 * ---------------------------------------------------------------
 *
 * WHAT IS ADJUSTABLE AND WHAT IS NOT. The two ENDS move; the rule
 * between them does not. Doubling on a pass and halving on a miss is
 * the algorithm every other module is drilled with, and a repertoire
 * that could change it would not be using the same engine. Set the
 * floor to 4 and the sequence becomes 4 → 8 → 16 → 32, clamped by
 * whatever the ceiling says — derived, never listed.
 */

export const PREF_FIRST_INTERVAL_DAYS = 'songKeyFirstIntervalDays';
export const PREF_LONGEST_INTERVAL_DAYS = 'songKeyLongestIntervalDays';
export const PREF_DUE_SOON_DAYS = 'songKeyDueSoonDays';
export const PREF_GRACE_DAYS = 'songKeyGraceDays';

/**
 * Defaults, and they are not arbitrary: they reproduce exactly what
 * the app already did. The shared engine's `INITIAL_INTERVAL_DAYS` of
 * 1 doubles to 2 on a first pass, and `integration` caps at 30. So a
 * user who never opens these settings sees no change in behaviour —
 * the controls expose the existing rule rather than replacing it.
 */
export const FIRST_INTERVAL_DEFAULT = 2;
export const LONGEST_INTERVAL_DEFAULT = 30;
export const DUE_SOON_DEFAULT = 7;
export const GRACE_DEFAULT = 7;

export interface SongKeySpacingSettings {
  firstIntervalDays: number;
  longestIntervalDays: number;
  dueSoonDays: number;
  graceDays: number;
}

export const SPACING_DEFAULTS: SongKeySpacingSettings = {
  firstIntervalDays: FIRST_INTERVAL_DEFAULT,
  longestIntervalDays: LONGEST_INTERVAL_DEFAULT,
  dueSoonDays: DUE_SOON_DEFAULT,
  graceDays: GRACE_DEFAULT,
};

/** Clamp a stored value into something usable. These cross a sync
 *  boundary and can arrive from another device or an older build; a
 *  zero or a negative would make every key permanently overdue. */
function positive(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1
    ? Math.round(raw)
    : fallback;
}

export async function getSpacingSettings(): Promise<SongKeySpacingSettings> {
  const [first, longest, dueSoon, grace] = await Promise.all([
    getPref<number>(PREF_FIRST_INTERVAL_DAYS, FIRST_INTERVAL_DEFAULT),
    getPref<number>(PREF_LONGEST_INTERVAL_DAYS, LONGEST_INTERVAL_DEFAULT),
    getPref<number>(PREF_DUE_SOON_DAYS, DUE_SOON_DEFAULT),
    getPref<number>(PREF_GRACE_DAYS, GRACE_DEFAULT),
  ]);
  const firstDays = positive(first, FIRST_INTERVAL_DEFAULT);
  return {
    firstIntervalDays: firstDays,
    // The ceiling can never sit below the floor. A user who drags one
    // past the other would otherwise get a sequence that starts above
    // its own cap, and every pass would shorten the interval.
    longestIntervalDays: Math.max(
      firstDays,
      positive(longest, LONGEST_INTERVAL_DEFAULT),
    ),
    dueSoonDays: positive(dueSoon, DUE_SOON_DEFAULT),
    graceDays: positive(grace, GRACE_DEFAULT),
  };
}

export async function setSpacingSetting(
  key: string,
  value: number,
): Promise<void> {
  await setPref(key, Math.max(1, Math.round(value)));
}

/** The bounds the spacing engine needs. `initialDays` is the value the
 *  engine GROWS from, so it is the requested first interval divided by
 *  the growth factor — set 2 and the first pass lands on 2, not 4. */
export function boundsFrom(settings: SongKeySpacingSettings): IntervalBounds {
  return {
    initialDays: Math.max(1, settings.firstIntervalDays / INTERVAL_GROWTH_FACTOR),
    maxDays: settings.longestIntervalDays,
  };
}

export function windowsFrom(settings: SongKeySpacingSettings): DueWindows {
  return {
    dueSoonDays: settings.dueSoonDays,
    graceDays: settings.graceDays,
  };
}

/**
 * The sequence the settings produce, for showing back to the user.
 *
 * A floor of 2 in isolation says nothing about what is being agreed
 * to; "2 → 4 → 8 → 16 → 30 days" says all of it. Derived from the two
 * ends rather than listed, so it cannot disagree with what the engine
 * will actually do.
 */
export function intervalSequence(settings: SongKeySpacingSettings): number[] {
  const out: number[] = [];
  let current = Math.max(1, Math.round(settings.firstIntervalDays));
  const cap = Math.max(current, Math.round(settings.longestIntervalDays));
  // Guard against a growth factor of 1 or less, which would spin.
  const factor = Math.max(1.0001, INTERVAL_GROWTH_FACTOR);
  while (current < cap) {
    out.push(current);
    current = Math.round(current * factor);
  }
  out.push(cap);
  return out;
}
