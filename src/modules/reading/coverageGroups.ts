/**
 * Reading coverage groups — the sub-areas a coverage goal can target.
 *
 * SIX GROUPS, deliberately in the Harmonic-Fluency direction rather
 * than the Shapes one. HF gets by with four groups over ~130 cards
 * because its groups are just category unions; Shapes needs 776 lines
 * because its coverage groups carry per-family inversion multipliers,
 * key fan-out, and back-compat ids from a redesign. Reading has none
 * of that — a group here is a predicate over itemRefs and a label.
 *
 * The four skills are the natural axis: "get my key signatures
 * solid" is a goal someone actually has. Chord identification is then
 * split by family because at 69 items it is the bulk of the module
 * and triads / sevenths / open shapes are separately targetable in a
 * way the other three skills are not.
 *
 * EVERY SKILL NEEDS A GROUP, not just the ones worth targeting.
 * The groups PARTITION the module — an item matched by none of them
 * would silently drop out of `readingCounts().byGroup`, and the
 * group-sum invariant would catch it as a total mismatch rather than
 * as the missing group it actually is. Notation shapes gets a group
 * at seven items for that reason, not because seven items make a
 * compelling goal.
 *
 * Denominators are NOT written here. Each group carries a matcher and
 * the count falls out of the catalog walk — see `readingCounts()` in
 * lib/moduleItemCounts.ts. A hand-authored number would be a second
 * source of truth, and it would be wrong the first time the catalog
 * moved.
 */

import {
  CHORD_QUALITIES,
  parseReadingItemRef,
  type ChordFamily,
} from './catalog';

export type ReadingCoverageGroupId =
  | 'key-signatures'
  | 'note-recognition'
  | 'notation-shapes'
  | 'chord-triads'
  | 'chord-sevenths'
  | 'chord-open-shapes';

export interface ReadingCoverageGroupDef {
  id: ReadingCoverageGroupId;
  label: string;
  /** One-line description for the goal picker (step 5). */
  blurb: string;
  matches: (itemRef: string) => boolean;
}

const FAMILY_BY_QUALITY = new Map<string, ChordFamily>(
  CHORD_QUALITIES.map(q => [q.id, q.family]),
);

/** True when the ref is a chord item of the given family. Routes
 *  through the parser rather than a string prefix so a malformed ref
 *  cannot match anything. */
function chordFamilyMatcher(family: ChordFamily) {
  return (itemRef: string): boolean => {
    const parsed = parseReadingItemRef(itemRef);
    if (parsed?.skill !== 'chord') return false;
    return FAMILY_BY_QUALITY.get(parsed.qualityId) === family;
  };
}

export const READING_COVERAGE_GROUPS: ReadonlyArray<ReadingCoverageGroupDef> = [
  {
    id: 'key-signatures',
    label: 'Key signatures',
    blurb: 'Read a signature, name the key, count the accidentals.',
    matches: ref => parseReadingItemRef(ref)?.skill === 'sig',
  },
  {
    id: 'note-recognition',
    label: 'Note recognition',
    blurb: 'Name a note on either clef, two ledger lines either side.',
    matches: ref => parseReadingItemRef(ref)?.skill === 'note',
  },
  {
    id: 'notation-shapes',
    label: 'Notation shapes',
    blurb: 'Read the silhouette — root position and the inversions.',
    matches: ref => parseReadingItemRef(ref)?.skill === 'shape',
  },
  {
    id: 'chord-triads',
    label: 'Triads',
    blurb: 'Major, minor, diminished, augmented — all inversions.',
    matches: chordFamilyMatcher('triad'),
  },
  {
    id: 'chord-sevenths',
    label: 'Seventh chords',
    blurb: 'Dominant, major, minor, half-diminished, diminished.',
    matches: chordFamilyMatcher('seventh'),
  },
  {
    id: 'chord-open-shapes',
    label: 'Open left-hand shapes',
    blurb: 'Octaves, fifths, tenths — the shapes real charts use.',
    matches: chordFamilyMatcher('open'),
  },
];

const GROUP_BY_ID = new Map<string, ReadingCoverageGroupDef>(
  READING_COVERAGE_GROUPS.map(g => [g.id, g]),
);

export function getReadingCoverageGroup(
  id: string,
): ReadingCoverageGroupDef | undefined {
  return GROUP_BY_ID.get(id);
}

/** Matcher for a group id, or null when the id is unknown. Mirrors
 *  `itemRefMatcherForCoverageGroup` in the Shapes module so the
 *  scope-enumeration call sites read the same. */
export function itemRefMatcherForReadingGroup(
  id: string,
): ((itemRef: string) => boolean) | null {
  return GROUP_BY_ID.get(id)?.matches ?? null;
}
