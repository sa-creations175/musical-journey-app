import type {
  DayProfile,
  DayProfileExpectedSessions,
  DayProfileName,
} from '../../../lib/db';

/**
 * Q9-locked default pre-fills for the three day profiles, used to
 * seed Screen 2 of the Goals onboarding flow when the user has no
 * existing day profiles. Single generic default set per the design
 * resolution — no pre-question to tier defaults; users edit slots
 * that don't fit them.
 *
 * Standard ≈ 85 min total; Deep ≈ 120 min total; Light ≈ 15 min
 * total. Standard and Deep land within the research-supported
 * 1–2 hours of focused work zone.
 */
export const DAY_PROFILE_DEFAULTS: Record<
  Exclude<DayProfileName, 'custom'>,
  DayProfileExpectedSessions
> = {
  standard: {
    morning: { minutes: 20, context: 'keys', skip: false },
    midday:  { minutes: 20, context: 'phone', skip: false },
    evening: { minutes: 45, context: 'keys', skip: false },
  },
  light: {
    morning: { minutes: 0,  context: 'keys',  skip: true },
    midday:  { minutes: 15, context: 'phone', skip: false },
    evening: { minutes: 0,  context: 'keys',  skip: true },
  },
  deep: {
    // Spec note: Deep midday default is "phone/laptop". The slot
    // schema holds a single context; we default to 'phone' to match
    // the Standard midday context so the user only retypes when
    // their actual midday changes — laptop / mixed are one click
    // away in the dropdown.
    morning: { minutes: 30, context: 'keys',  skip: false },
    midday:  { minutes: 30, context: 'phone', skip: false },
    evening: { minutes: 60, context: 'keys',  skip: false },
  },
};

/** The three day-profile names the onboarding flow asks the user to
 *  build. Custom is created elsewhere (post-onboarding edits). */
export const ONBOARDING_PROFILE_NAMES: ReadonlyArray<
  Exclude<DayProfileName, 'custom'>
> = ['standard', 'light', 'deep'];

export const PROFILE_LABELS: Record<DayProfileName, string> = {
  standard: 'Standard',
  light:    'Light',
  deep:     'Deep',
  custom:   'Custom',
};

export const PROFILE_TAGLINES: Record<DayProfileName, string> = {
  standard: 'A typical practice day.',
  light:    'Bare minimum for busy or low-energy days.',
  deep:     'Extended sessions when you have the time.',
  custom:   'A bespoke day shape.',
};

export const SLOT_LABELS: Record<keyof DayProfileExpectedSessions, string> = {
  morning: 'Morning',
  midday:  'Midday',
  evening: 'Evening',
};

/**
 * Visual treatment for each onboarding day profile — icon + accent
 * color shade. Class strings are written out in full (rather than
 * composed at runtime) so the Tailwind JIT picks them up. Render-
 * time consumers apply them as a left-border accent on the profile
 * card and a colored badge behind the icon.
 *
 * Color choices:
 *   Standard — neutral slate (a typical day, no emphasis)
 *   Light    — cool blue (smaller, low-energy)
 *   Deep     — warm purple (extended, high-engagement)
 */
export const PROFILE_VISUALS: Record<
  Exclude<DayProfileName, 'custom'>,
  { icon: string; borderClass: string; badgeClass: string }
> = {
  standard: {
    icon: '📅',
    borderClass: 'border-l-slate-400 dark:border-l-slate-500',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  },
  light: {
    icon: '🪶',
    borderClass: 'border-l-sky-500 dark:border-l-sky-400',
    badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
  },
  deep: {
    icon: '🔥',
    borderClass: 'border-l-purple-600 dark:border-l-purple-400',
    badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200',
  },
};

/** Build a fresh DayProfile record carrying the Q9 default for the
 *  given profile name. The id follows the existing per-user-table
 *  pattern: a stable, scope-bearing slug so re-seeding upserts the
 *  same row instead of creating duplicates. */
export function makeDefaultDayProfile(name: Exclude<DayProfileName, 'custom'>): DayProfile {
  return {
    id: `dayprofile-${name}`,
    name,
    expectedSessions: DAY_PROFILE_DEFAULTS[name],
    isDefault: name === 'standard',
  };
}

/** Reconcile a pre-existing list of DayProfile records with the
 *  three onboarding profiles, returning a complete trio with any
 *  missing profile populated from the Q9 defaults. Used to seed
 *  Screen 2's editor without losing prior edits.
 */
export function buildOnboardingProfiles(
  existing: ReadonlyArray<DayProfile>,
): Record<Exclude<DayProfileName, 'custom'>, DayProfile> {
  const byName = new Map<string, DayProfile>();
  for (const p of existing) byName.set(p.name, p);
  return {
    standard: byName.get('standard') ?? makeDefaultDayProfile('standard'),
    light:    byName.get('light')    ?? makeDefaultDayProfile('light'),
    deep:     byName.get('deep')     ?? makeDefaultDayProfile('deep'),
  };
}
