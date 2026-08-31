/**
 * How long has been spent in each Shapes & Patterns sub-module, and on
 * each thing inside it.
 *
 * =====================================================================
 * EVERY DRILL HAS ALWAYS RECORDED A DURATION. Nothing new is written
 * for scales, chord shapes or voice leading — `DrillSession` carries
 * `durationSeconds` and has since the module was built, and `fromTest`
 * since the run row learned what kind of run it was. What was missing
 * was a read: no surface added them up.
 *
 * TWO KINDS OF `skillId`, AND THAT IS THE WHOLE COMPLICATION.
 *
 * Scales and voice leading stand their canonical itemRef in for both
 * `skillId` and `drillTypeId` — they run off static catalogs and have
 * no `DrillSkill` row — so those sessions name their own item. Chord
 * shapes DO have a `DrillSkill` row and store its id, which says
 * nothing about what it is until it is looked up. Hence the join, and
 * hence this file rather than a line inside the adapter.
 *
 * A SESSION THAT RESOLVES TO NOTHING IS DROPPED, not counted somewhere
 * convenient. A `DrillSkill` deleted by a cleanup pass leaves sessions
 * behind (see `cleanup.ts`), and adding those into whichever section
 * happened to be first would be inventing time.
 *
 * =====================================================================
 * THE CARD'S FIGURE IS THE SUM OF ITS CELLS' TARGETS, AND SO IS
 * PROGRESS DETAILS'.
 *
 * The card used to sum by itemRef PREFIX and Progress Details summed
 * per (itemRef, hand). Two walks over the same rows, and nothing made
 * them agree — a row for a scale that is not in the catalog landed on
 * the card and in no cell, so the card could read more minutes than
 * everything under it added up to.
 *
 * Now there is one map, keyed by target, and both read it. The card
 * adds up the targets `sectionCells` enumerates; Progress Details adds
 * up one cell's. They cannot disagree, because there is only one
 * answer to add up.
 * =====================================================================
 */
import type { DrillSession, DrillSkill } from '../../lib/db';
import { itemRefForSkill } from './drillModel';
import { sectionCells, type SectionId } from './cellTargets';
import type { ShapesSectionId } from './homeCards';

/**
 * Time on one thing, split by what kind of work it was.
 *
 * THE TWO ARE NOT A TOTAL AND A SLICE. They are the two halves, and the
 * total is their sum — computed where it is shown, never stored
 * alongside them, so a total and its parts cannot drift.
 *
 * ABSENT COUNTS AS PRACTICE, which is the row's own rule: a run written
 * before `fromTest` existed is a practice run. See `wasTestRun`.
 */
export interface TimeSplit {
  practiceSeconds: number;
  testingSeconds: number;
}

export const NO_TIME: TimeSplit = { practiceSeconds: 0, testingSeconds: 0 };

export function totalSeconds(split: TimeSplit): number {
  return split.practiceSeconds + split.testingSeconds;
}

/** `${itemRef} ${hand}` — the key a `CellTarget` is looked up by. */
export function targetKey(itemRef: string, hand: string): string {
  return `${itemRef} ${hand}`;
}

/**
 * WHICH ITEM A DRILL ROW IS ABOUT — one answer, for every surface.
 *
 * Self-naming skillIds (scales, voice leading, mental viz) are already
 * the itemRef. A chord shape's is a `DrillSkill` id and has to be
 * joined; `itemRefForSkill` is the app's one derivation of an itemRef
 * from a skill, so this adds no second rule.
 *
 * Null when the row names nothing that still exists. Dropped, never
 * bucketed somewhere convenient.
 */
export function itemRefForSession(
  session: DrillSession,
  skillById: ReadonlyMap<string, DrillSkill>,
): string | null {
  for (const [prefix] of SECTION_BY_PREFIX) {
    if (session.skillId.startsWith(prefix)) return session.skillId;
  }
  const skill = skillById.get(session.skillId);
  return skill ? itemRefForSkill(skill) : null;
}

/** Which section a self-naming `skillId` belongs to, by its prefix. */
const SECTION_BY_PREFIX: ReadonlyArray<readonly [string, ShapesSectionId]> = [
  ['scale:', 'scales'],
  ['chord-shape:', 'chord-shapes'],
  ['vl:', 'voice-leading'],
  ['mv:', 'mental-viz'],
];

/** Which section a `DrillSkill` row belongs to, by its kind. */
const SECTION_BY_KIND: Readonly<Record<DrillSkill['kind'], ShapesSectionId>> = {
  'scale': 'scales',
  'chord-shape': 'chord-shapes',
  'voice-leading': 'voice-leading',
  'mental-viz': 'mental-viz',
};

/**
 * Every drill row, filed under the target it was about.
 *
 * THE ONE WALK. The card's minutes, Progress Details' minutes and
 * Progress Details' run logs are all readings of this — see the header.
 * A row that names nothing in the catalog is filed nowhere, which is
 * what stops the card outrunning the cells beneath it.
 */
export function sessionsByTarget(
  sessions: readonly DrillSession[],
  drillSkills: readonly DrillSkill[],
): ReadonlyMap<string, DrillSession[]> {
  const skillById = new Map(drillSkills.map(s => [s.id, s] as const));
  const out = new Map<string, DrillSession[]>();
  for (const session of sessions) {
    const itemRef = itemRefForSession(session, skillById);
    if (itemRef === null) continue;
    const key = targetKey(itemRef, session.hand);
    const at = out.get(key);
    if (at === undefined) out.set(key, [session]);
    else at.push(session);
  }
  return out;
}

/**
 * How long one list of rows ran, split.
 *
 * ABSENT `fromTest` IS PRACTICE — the row's own rule, not a default
 * chosen here. `=== true`, never `!== false`, or every legacy row lands
 * in the testing half.
 */
export function splitOf(sessions: readonly DrillSession[]): TimeSplit {
  let practiceSeconds = 0;
  let testingSeconds = 0;
  for (const s of sessions) {
    if (s.fromTest === true) testingSeconds += s.durationSeconds;
    else practiceSeconds += s.durationSeconds;
  }
  return { practiceSeconds, testingSeconds };
}

/** Add up one list of targets. */
export function timeForTargets(
  targets: ReadonlyArray<{ itemRef: string; hand: string }>,
  byTarget: ReadonlyMap<string, DrillSession[]>,
): TimeSplit {
  let practiceSeconds = 0;
  let testingSeconds = 0;
  for (const t of targets) {
    const at = splitOf(byTarget.get(targetKey(t.itemRef, t.hand)) ?? []);
    practiceSeconds += at.practiceSeconds;
    testingSeconds += at.testingSeconds;
  }
  return { practiceSeconds, testingSeconds };
}

/**
 * Time per section, split.
 *
 * Sections with no time at all are ABSENT rather than zero — a card
 * shows a time it has measured or shows none, and `0s` is a
 * measurement.
 */
export function shapesTimeInvested(
  sessions: readonly DrillSession[],
  drillSkills: readonly DrillSkill[],
): ReadonlyMap<ShapesSectionId, TimeSplit> {
  const byTarget = sessionsByTarget(sessions, drillSkills);
  const out = new Map<ShapesSectionId, TimeSplit>();
  for (const section of SECTIONS) {
    const split = timeForTargets(sectionCells(section).flat(), byTarget);
    if (totalSeconds(split) > 0) out.set(section, split);
  }
  return out;
}

const SECTIONS: ReadonlyArray<SectionId> = [
  'scales', 'chord-shapes', 'voice-leading', 'mental-viz',
];

/** Exported so a test can pin both routes to a section by name. */
export function sectionForSession(
  skillId: string,
  kindById: ReadonlyMap<string, DrillSkill['kind']>,
): ShapesSectionId | null {
  for (const [prefix, section] of SECTION_BY_PREFIX) {
    if (skillId.startsWith(prefix)) return section;
  }
  const kind = kindById.get(skillId);
  return kind === undefined ? null : SECTION_BY_KIND[kind];
}
