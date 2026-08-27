/**
 * Every number that decides when something comes back, and the rule
 * for which level of the tree a given number came from.
 *
 * =====================================================================
 * THE TALLY IS THE LEADER. THE ANSWER COUNT IS DERIVED FROM IT.
 *
 * "How many answers before a rating appears" is not a dial. It is
 * `sum(tally)`, and it is shown as a readout. Two dials that can
 * disagree about the same fact is how a settings screen starts lying:
 * set the count to 5 and the tally to four exposures and one of them
 * is wrong, with nothing to say which.
 * =====================================================================
 */

import type { AccuracyBand } from './bands';
import { ACCURACY_BANDS } from './bands';

/** Day 0 through day 5. Six slots, fixed — the spec's grid. */
export const TALLY_DAYS = 6;

/**
 * What happens to an acquiring card answered WRONG.
 *
 * `repeat-session` is the default and the gentlest reading of a miss
 * during first exposure: you have not learned it yet, so you see it
 * again now rather than being punished on a schedule.
 */
export type AcquiringMissPolicy =
  | 'repeat-session'
  | 'add-to-next-day'
  | 'restart-pattern'
  | 'nothing';

/** What happens to a maintaining card answered wrong. */
export type MaintainingMissPolicy =
  | 'back-to-first-wait'
  | 'halve'
  | 'nothing';

/**
 * How a band grows the wait on a correct answer.
 *
 * `'back-to-first'` is not a multiplier and is not `× 1`. Needs work
 * returns to the first wait every single time, so a card you are
 * failing stays on your plate at a fixed short interval instead of
 * creeping outward one small multiplication at a time.
 */
export type BandGrowth = { kind: 'multiply'; factor: number } | { kind: 'back-to-first' };

export interface BandRule {
  growth: BandGrowth;
  /** The wait can never exceed this, whatever the multiplier says. */
  ceilingDays: number;
}

export interface SpacingSettings {
  /** Off means: no due dates, out of due counts, out of generated
   *  sessions. Still drillable, ratings and progress still visible. */
  inSchedule: boolean;
  acquiring: {
    /** Exposures on day 0, 1, 2, 3, 4, 5. A zero means the card does
     *  not appear that day at all. */
    tally: number[];
    onWrong: AcquiringMissPolicy;
  };
  maintaining: {
    /** The wait immediately after graduating, before any band applies. */
    firstWaitDays: number;
    perBand: Record<AccuracyBand, BandRule>;
    onWrong: MaintainingMissPolicy;
    /** Floor. No computed wait is ever shorter than this. */
    minimumDays: number;
  };
  stale: {
    /** Counted from the DUE DATE, never from the length of the wait. */
    graceDays: number;
  };
}

/**
 * The shipped defaults. Placeholders from the spec, and deliberately
 * so — they are the starting point for living with the thing, not a
 * claim that these are the right numbers.
 */
export const DEFAULT_SPACING_SETTINGS: SpacingSettings = {
  inSchedule: true,
  acquiring: {
    tally: [2, 1, 0, 1, 0, 1],
    onWrong: 'repeat-session',
  },
  maintaining: {
    firstWaitDays: 2,
    perBand: {
      'needs-work': { growth: { kind: 'back-to-first' },      ceilingDays: 2 },
      'developing': { growth: { kind: 'multiply', factor: 1.5 }, ceilingDays: 7 },
      'fluent':     { growth: { kind: 'multiply', factor: 2.5 }, ceilingDays: 30 },
      'mastered':   { growth: { kind: 'multiply', factor: 2.5 }, ceilingDays: 60 },
    },
    onWrong: 'back-to-first-wait',
    minimumDays: 1,
  },
  stale: {
    graceDays: 7,
  },
};

// =====================================================================
// Partial settings — what one level of the tree actually stores
// =====================================================================

/**
 * A level stores ONLY what was set there. Absence is the mechanism:
 * a field with no value at this level takes its parent's, and that is
 * how "inherited" and "changed here" stay distinguishable without a
 * second flag to keep in sync.
 */
export interface PartialSpacingSettings {
  inSchedule?: boolean;
  acquiring?: {
    tally?: number[];
    onWrong?: AcquiringMissPolicy;
  };
  maintaining?: {
    firstWaitDays?: number;
    perBand?: Partial<Record<AccuracyBand, Partial<BandRule>>>;
    onWrong?: MaintainingMissPolicy;
    minimumDays?: number;
  };
  stale?: {
    graceDays?: number;
  };
}

/**
 * Every leaf a level can override, as a flat path.
 *
 * FLAT, because the UI marks changes per FIELD — Chord Recognition in
 * the spec inherits its tally while overriding the first wait and two
 * of Fluent's numbers. A per-object granularity would make that row
 * read "changed" for the whole of Maintaining and lose which number
 * the reader actually moved.
 */
export type SettingsPath =
  | 'inSchedule'
  | 'acquiring.tally'
  | 'acquiring.onWrong'
  | 'maintaining.firstWaitDays'
  | 'maintaining.onWrong'
  | 'maintaining.minimumDays'
  | 'stale.graceDays'
  | `maintaining.perBand.${AccuracyBand}.growth`
  | `maintaining.perBand.${AccuracyBand}.ceilingDays`;

export const SETTINGS_PATHS: ReadonlyArray<SettingsPath> = [
  'inSchedule',
  'acquiring.tally',
  'acquiring.onWrong',
  'maintaining.firstWaitDays',
  'maintaining.onWrong',
  'maintaining.minimumDays',
  'stale.graceDays',
  ...ACCURACY_BANDS.flatMap(b => [
    `maintaining.perBand.${b.id}.growth` as SettingsPath,
    `maintaining.perBand.${b.id}.ceilingDays` as SettingsPath,
  ]),
];

/** Read one leaf out of a partial, or undefined when unset there. */
export function readPath(
  partial: PartialSpacingSettings,
  path: SettingsPath,
): unknown {
  switch (path) {
    case 'inSchedule': return partial.inSchedule;
    case 'acquiring.tally': return partial.acquiring?.tally;
    case 'acquiring.onWrong': return partial.acquiring?.onWrong;
    case 'maintaining.firstWaitDays': return partial.maintaining?.firstWaitDays;
    case 'maintaining.onWrong': return partial.maintaining?.onWrong;
    case 'maintaining.minimumDays': return partial.maintaining?.minimumDays;
    case 'stale.graceDays': return partial.stale?.graceDays;
    default: {
      const m = /^maintaining\.perBand\.(.+)\.(growth|ceilingDays)$/.exec(path);
      if (!m) return undefined;
      const rule = partial.maintaining?.perBand?.[m[1] as AccuracyBand];
      return m[2] === 'growth' ? rule?.growth : rule?.ceilingDays;
    }
  }
}

// =====================================================================
// Resolution
// =====================================================================

/** One level of the chain, root first. */
export interface SettingsLevel {
  /** Node id — `'ear-training'`, `'chord-recognition'`, … */
  id: string;
  /** Display name, for "from Ear Training". */
  label: string;
  settings: PartialSpacingSettings;
}

export interface ResolvedSettings {
  value: SpacingSettings;
  /**
   * Where each leaf came from. `null` means nothing in the chain set
   * it and the shipped default applies — which is a third state the UI
   * needs, distinct from "inherited from a level above".
   */
  sourceByPath: Record<SettingsPath, SettingsLevel | null>;
}

/**
 * Walk the chain root-first, letting each level overwrite what it sets.
 *
 * `inSchedule` is deliberately NOT resolved this way — see
 * `effectiveInSchedule`. Every other field is last-writer-wins down
 * the chain, which is ordinary inheritance.
 */
export function resolveSettings(chain: ReadonlyArray<SettingsLevel>): ResolvedSettings {
  const value: SpacingSettings = structuredCloneSettings(DEFAULT_SPACING_SETTINGS);
  const sourceByPath = Object.fromEntries(
    SETTINGS_PATHS.map(p => [p, null]),
  ) as Record<SettingsPath, SettingsLevel | null>;

  for (const level of chain) {
    const s = level.settings;
    if (s.inSchedule !== undefined) {
      value.inSchedule = s.inSchedule;
      sourceByPath.inSchedule = level;
    }
    if (s.acquiring?.tally !== undefined) {
      value.acquiring.tally = [...s.acquiring.tally];
      sourceByPath['acquiring.tally'] = level;
    }
    if (s.acquiring?.onWrong !== undefined) {
      value.acquiring.onWrong = s.acquiring.onWrong;
      sourceByPath['acquiring.onWrong'] = level;
    }
    if (s.maintaining?.firstWaitDays !== undefined) {
      value.maintaining.firstWaitDays = s.maintaining.firstWaitDays;
      sourceByPath['maintaining.firstWaitDays'] = level;
    }
    if (s.maintaining?.onWrong !== undefined) {
      value.maintaining.onWrong = s.maintaining.onWrong;
      sourceByPath['maintaining.onWrong'] = level;
    }
    if (s.maintaining?.minimumDays !== undefined) {
      value.maintaining.minimumDays = s.maintaining.minimumDays;
      sourceByPath['maintaining.minimumDays'] = level;
    }
    if (s.stale?.graceDays !== undefined) {
      value.stale.graceDays = s.stale.graceDays;
      sourceByPath['stale.graceDays'] = level;
    }
    for (const band of ACCURACY_BANDS) {
      const rule = s.maintaining?.perBand?.[band.id];
      if (rule?.growth !== undefined) {
        value.maintaining.perBand[band.id].growth = rule.growth;
        sourceByPath[`maintaining.perBand.${band.id}.growth`] = level;
      }
      if (rule?.ceilingDays !== undefined) {
        value.maintaining.perBand[band.id].ceilingDays = rule.ceilingDays;
        sourceByPath[`maintaining.perBand.${band.id}.ceilingDays`] = level;
      }
    }
  }

  return { value, sourceByPath };
}

/**
 * In-schedule cascades DOWN and cannot be re-enabled from below.
 *
 * =====================================================================
 * NOT INHERITANCE. A SWITCH, AND AN ANCESTOR'S OFF IS FINAL.
 *
 * If Ear Training is out of the schedule, Chord Motion is out of the
 * schedule, and no setting on Chord Motion can put it back — the
 * parent's switch would then be a lie about what it controls. So this
 * is an AND down the chain rather than last-writer-wins.
 * =====================================================================
 */
export function effectiveInSchedule(chain: ReadonlyArray<SettingsLevel>): boolean {
  for (const level of chain) {
    if (level.settings.inSchedule === false) return false;
  }
  return true;
}

/** Which ancestor turned it off, or null when it is on. */
export function turnedOffBy(
  chain: ReadonlyArray<SettingsLevel>,
): SettingsLevel | null {
  for (const level of chain) {
    if (level.settings.inSchedule === false) return level;
  }
  return null;
}

/** Paths this level sets itself — the "changed here" marks. */
export function pathsSetAt(level: SettingsLevel): SettingsPath[] {
  return SETTINGS_PATHS.filter(p => readPath(level.settings, p) !== undefined);
}

/**
 * A deep copy that does not depend on `structuredClone` being present.
 * The settings object is small, closed, and known — three nested
 * objects and one array — so it is spelled out rather than reached for
 * generically.
 */
function structuredCloneSettings(s: SpacingSettings): SpacingSettings {
  return {
    inSchedule: s.inSchedule,
    acquiring: { tally: [...s.acquiring.tally], onWrong: s.acquiring.onWrong },
    maintaining: {
      firstWaitDays: s.maintaining.firstWaitDays,
      perBand: Object.fromEntries(
        ACCURACY_BANDS.map(b => [b.id, {
          growth: { ...s.maintaining.perBand[b.id].growth },
          ceilingDays: s.maintaining.perBand[b.id].ceilingDays,
        }]),
      ) as Record<AccuracyBand, BandRule>,
      onWrong: s.maintaining.onWrong,
      minimumDays: s.maintaining.minimumDays,
    },
    stale: { graceDays: s.stale.graceDays },
  };
}

// =====================================================================
// Readouts and warnings — derived, never stored
// =====================================================================

/** Total answers the tally produces before a rating appears. */
export function tallyAnswerCount(tally: ReadonlyArray<number>): number {
  return tally.reduce((n, x) => n + Math.max(0, Math.floor(x)), 0);
}

/** How many distinct days the tally touches. */
export function tallyDistinctDays(tally: ReadonlyArray<number>): number {
  return tally.filter(x => Math.floor(x) > 0).length;
}

/**
 * The day offsets of each exposure, in order.
 * `[2,1,0,1,0,1]` → `[0,0,1,3,5]`.
 */
export function tallyExposureDays(tally: ReadonlyArray<number>): number[] {
  const out: number[] = [];
  tally.forEach((count, day) => {
    for (let i = 0; i < Math.max(0, Math.floor(count)); i++) out.push(day);
  });
  return out;
}

export const MIN_RECOMMENDED_ANSWERS = 5;
export const MIN_RECOMMENDED_DAYS = 3;

export interface TallyWarning {
  id: 'too-few-answers' | 'too-few-days';
  text: string;
}

/**
 * SOFT. These warn and never block — a reader who wants three
 * exposures over two days is allowed to have them, and finding out
 * whether that works is the reason the setting is exposed at all.
 *
 * The spec ships the OK line and not these two; the copy here is
 * written to match its voice and is the one piece of screen text in
 * this file not taken from it.
 */
export function tallyWarnings(tally: ReadonlyArray<number>): TallyWarning[] {
  const out: TallyWarning[] = [];
  const answers = tallyAnswerCount(tally);
  const days = tallyDistinctDays(tally);
  if (answers < MIN_RECOMMENDED_ANSWERS) {
    out.push({
      id: 'too-few-answers',
      text: `${answers} answer${answers === 1 ? '' : 's'} is a thin basis for a first rating. `
        + `Five or more gives the rating something to stand on.`,
    });
  }
  if (days < MIN_RECOMMENDED_DAYS) {
    out.push({
      id: 'too-few-days',
      text: `Spread over ${days} day${days === 1 ? '' : 's'}. `
        + `Three or more separate days is what makes it stick rather than just land.`,
    });
  }
  return out;
}

/** The OK line, straight from the spec. */
export function tallySummary(tally: ReadonlyArray<number>): string {
  const answers = tallyAnswerCount(tally);
  const days = tallyDistinctDays(tally);
  return `${answers} answer${answers === 1 ? '' : 's'} over ${days} day${days === 1 ? '' : 's'}`
    + ` — a rating appears after the last one.`;
}
