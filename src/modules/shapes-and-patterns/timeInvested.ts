/**
 * How long has been spent in each Shapes & Patterns sub-module.
 *
 * =====================================================================
 * EVERY DRILL HAS ALWAYS RECORDED A DURATION. Nothing new is written
 * for scales, chord shapes or voice leading — `DrillSession` carries
 * `durationSeconds` and has since the module was built. What was
 * missing was a read: no surface added them up.
 *
 * TWO KINDS OF `skillId`, AND THAT IS THE WHOLE COMPLICATION.
 *
 * Scales and voice leading stand their canonical itemRef in for both
 * `skillId` and `drillTypeId` — they run off static catalogs and have
 * no `DrillSkill` row — so those sessions name their own section and
 * the sum is a filter and an add. Chord shapes DO have a `DrillSkill`
 * row and store its id, which says nothing about what it is until it
 * is looked up. Hence the join, and hence this file rather than a line
 * inside the adapter.
 *
 * A SESSION THAT RESOLVES TO NOTHING IS DROPPED, not counted somewhere
 * convenient. A `DrillSkill` deleted by a cleanup pass leaves sessions
 * behind (see `cleanup.ts`), and adding those into whichever section
 * happened to be first would be inventing time.
 * =====================================================================
 */
import type { DrillSession, DrillSkill } from '../../lib/db';
import type { ShapesSectionId } from './homeCards';

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
 * Seconds logged per section.
 *
 * Sections with no sessions are absent rather than zero — a card shows
 * a time it has measured or shows none, and `0s` is a measurement.
 */
export function shapesTimeInvested(
  sessions: readonly DrillSession[],
  drillSkills: readonly DrillSkill[],
): ReadonlyMap<ShapesSectionId, number> {
  const kindById = new Map(drillSkills.map(s => [s.id, s.kind] as const));
  const out = new Map<ShapesSectionId, number>();

  for (const session of sessions) {
    const section = sectionForSession(session.skillId, kindById);
    if (section === null) continue;
    out.set(section, (out.get(section) ?? 0) + session.durationSeconds);
  }
  return out;
}

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
