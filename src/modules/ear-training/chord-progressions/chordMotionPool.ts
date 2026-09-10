/**
 * The Chord Motion pool: which motions exist, and what their ids are.
 *
 * =====================================================================
 * PULLED OUT OF THE TAB SO NOTHING HAS TO IMPORT A SCREEN TO ASK.
 *
 * This lived inside `ChordMotionTab.tsx`, a 1,200-line component, and
 * two things outside the drill already needed it: the dashboard read
 * layer (whose own comment says it must not import a component) and
 * now the ear-training orphan sweep, which runs on the boot path and
 * has no business pulling React and a screen's worth of markup in
 * behind it.
 *
 * Nothing about the pool changed. The tab still re-exports what it
 * always did, so no caller had to move.
 *
 * =====================================================================
 * THE POOL IS GENERATED, WHICH IS WHY IT CAN BE ASKED WITHOUT A TABLE
 * OF IDS.
 *
 * Twelve chromatic positions against the eleven that are not
 * themselves: 132 motions, built once. An id is `motion:{start}-{dest}-
 * {asc|desc}`, and `parseMotionId` is the only thing that says whether
 * a stored one still names a motion this app has.
 * =====================================================================
 */
import type { ChordQuality } from './catalog';

export type Direction = 'asc' | 'desc';

// 12 positions in the chromatic scale relative to the tonic of a major
// key. Diatonic positions are 1-7 (offsets 0,2,4,5,7,9,11); the five
// chromatic slots fill the gaps with borrowed-quality defaults:
//   b2 / b3 / b6 / b7 as majors (Neapolitan + borrowed-from-minor
//   majors) and #4 as diminished (tritone / vii° of V).
// This is the universe of motion endpoints across both scope settings;
// the pool filters at runtime by entry.diatonic when the user is in
// "diatonic only" mode.
export type DegreeLabel =
  | '1' | 'b2' | '2' | 'b3' | '3' | '4' | '#4' | '5' | 'b6' | '6' | 'b7' | '7';

export interface DegreeEntry {
  label: DegreeLabel;
  semi: number;
  diatonic: boolean;
  quality: ChordQuality;
}

export const DEGREE_TABLE: DegreeEntry[] = [
  { label: '1',  semi: 0,  diatonic: true,  quality: 'major' },
  { label: 'b2', semi: 1,  diatonic: false, quality: 'major' },
  { label: '2',  semi: 2,  diatonic: true,  quality: 'minor' },
  { label: 'b3', semi: 3,  diatonic: false, quality: 'major' },
  { label: '3',  semi: 4,  diatonic: true,  quality: 'minor' },
  { label: '4',  semi: 5,  diatonic: true,  quality: 'major' },
  { label: '#4', semi: 6,  diatonic: false, quality: 'diminished' },
  { label: '5',  semi: 7,  diatonic: true,  quality: 'dominant' },
  { label: 'b6', semi: 8,  diatonic: false, quality: 'major' },
  { label: '6',  semi: 9,  diatonic: true,  quality: 'minor' },
  { label: 'b7', semi: 10, diatonic: false, quality: 'major' },
  { label: '7',  semi: 11, diatonic: true,  quality: 'diminished' },
];

const DEGREE_BY_LABEL = new Map<string, DegreeEntry>(DEGREE_TABLE.map(e => [e.label, e]));

export function degreeEntry(label: string): DegreeEntry | undefined {
  return DEGREE_BY_LABEL.get(label);
}

// Approximate musical-interval count (2..7) from a semitone span. Keeps
// the scope filter buckets sensible across both diatonic and chromatic
// endpoints. The boundary cases (tritone at 6 st, mediant overlaps) are
// not strict music-theory spellings — they're just scope buckets.
export function intervalCountFromSemi(semi: number): 2 | 3 | 4 | 5 | 6 | 7 {
  const s = Math.abs(semi);
  if (s <= 2) return 2;
  if (s <= 4) return 3;
  if (s <= 5) return 4;
  if (s <= 7) return 5;
  if (s <= 9) return 6;
  return 7;
}

export interface Motion {
  startLabel: DegreeLabel;
  destLabel: DegreeLabel;
  /** Semitones above the tonic for start / destination. Preserved on
   *  the motion so callers don't need to re-look-up the degree table. */
  startSemi: number;
  destSemi: number;
  direction: Direction;
  /** Musical interval count (2..7). Used only for the scope filter
   *  buckets; feedback quality (major 3rd vs minor 3rd, perfect 5th vs
   *  tritone, etc.) is computed separately from the actual semitone
   *  delta via intervalFromSemitones(). */
  distance: 2 | 3 | 4 | 5 | 6 | 7;
  /** True when BOTH endpoints are diatonic (scale degrees 1..7 of the
   *  major scale). Drives the diatonic-only scope filter. */
  isDiatonic: boolean;
}

export function motionId(m: Pick<Motion, 'startLabel' | 'destLabel' | 'direction'>): string {
  return `motion:${m.startLabel}-${m.destLabel}-${m.direction}`;
}

export function parseMotionId(id: string): Motion | null {
  // Labels can contain b/# plus a digit, so we lean on a non-hyphen
  // match rather than \d+. Legacy ids stored as `motion:1-5-asc` parse
  // cleanly because "1" and "5" are valid DegreeLabel entries.
  const m = id.match(/^motion:([^-]+)-([^-]+)-(asc|desc)$/);
  if (!m) return null;
  const startEntry = degreeEntry(m[1]);
  const destEntry = degreeEntry(m[2]);
  if (!startEntry || !destEntry) return null;
  const direction = m[3] as Direction;
  const distance = intervalCountFromSemi(Math.abs(destEntry.semi - startEntry.semi));
  return {
    startLabel: startEntry.label,
    destLabel: destEntry.label,
    startSemi: startEntry.semi,
    destSemi: destEntry.semi,
    direction,
    distance,
    isDiatonic: startEntry.diatonic && destEntry.diatonic,
  };
}

// Every in-octave motion between any two distinct chromatic-scale
// positions. The pool is generated once and filtered at call time by
// distance / direction / note-context (see filterMotions). Order is
// asc/desc by the underlying semitone offsets — no octave crossing.
function buildAllMotions(): Motion[] {
  const motions: Motion[] = [];
  for (const s of DEGREE_TABLE) {
    for (const d of DEGREE_TABLE) {
      if (s.label === d.label) continue;
      motions.push({
        startLabel: s.label,
        destLabel: d.label,
        startSemi: s.semi,
        destSemi: d.semi,
        direction: d.semi > s.semi ? 'asc' : 'desc',
        distance: intervalCountFromSemi(Math.abs(d.semi - s.semi)),
        isDiatonic: s.diatonic && d.diatonic,
      });
    }
  }
  return motions;
}

export const ALL_MOTIONS: ReadonlyArray<Motion> = buildAllMotions();

/**
 * What a distance is called in prose.
 *
 * IT LIVED ON THE SCREEN and the fluency tracker imported the screen to
 * get it. A name for a distance is a fact about the pool, so it sits
 * beside the pool.
 */
export const INTERVAL_NAME: Record<2 | 3 | 4 | 5 | 6 | 7, string> = {
  2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th',
};
