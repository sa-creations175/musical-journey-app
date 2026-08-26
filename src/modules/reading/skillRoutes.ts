/**
 * A reading skill's own page, and its address.
 *
 * =====================================================================
 * THE SLUG IS NOT THE SKILL ID, AND THAT IS DELIBERATE.
 *
 * The ids are `note`, `shape`, `sig`, `chord` — they are keys, and
 * `sig` in particular is an abbreviation nobody would type into a
 * browser. The nav has always called these four notes, shapes,
 * signatures and chords; the URL says the same words the reader was
 * shown.
 *
 * One table, both directions, so a route that parses and a link that
 * builds cannot disagree about which is which.
 * =====================================================================
 */
import { READING_SKILL_ORDER } from './homeCards';
import type { ReadingDrillSkill } from './pickCard';

const SLUG: Readonly<Record<ReadingDrillSkill, string>> = {
  note: 'notes',
  shape: 'shapes',
  sig: 'signatures',
  chord: 'chords',
};

const SKILL_BY_SLUG: Readonly<Record<string, ReadingDrillSkill>> =
  Object.fromEntries(
    READING_SKILL_ORDER.map(skill => [SLUG[skill], skill]),
  );

export function readingSkillPath(skill: ReadingDrillSkill): string {
  return `/reading/${SLUG[skill]}`;
}

/** The skill a slug names, or null when it names none. */
export function readingSkillForSlug(slug: string): ReadingDrillSkill | null {
  return SKILL_BY_SLUG[slug] ?? null;
}
