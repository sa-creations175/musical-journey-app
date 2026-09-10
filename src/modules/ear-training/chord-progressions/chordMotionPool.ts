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
 * Sixteen chords against every other chord on a different root, both
 * ways, plus three same-root moves: 467 motions, built once. An id is `motion:{start}-{dest}-{asc|desc}`, and
 * `parseMotionId` is the only thing that says whether a stored one
 * still names a motion this app has.
 *
 * =====================================================================
 * A DEGREE CAN CARRY MORE THAN ONE QUALITY. Silas's ruling of 10 Sep
 * 2026: under Chromatic the pool gains 4m, 2ø and 5m — the borrowed
 * minor 4 of every backdoor, the half-diminished 2 of a minor 2 5 1,
 * the minor 5 of a Mixolydian vamp — beside the diatonic 4, 2m and 5.
 *
 * THE STORED IDS DID NOT MOVE. An id's degree segment has always meant
 * the degree AND its diatonic quality, and it still does: `motion:1-4-asc`
 * is 1 → 4 major, exactly as the rows written before today recorded it.
 * Only the borrowed chords carry a quality in the segment — `4m`, `5m`,
 * `2m7b5` — so no existing row is rewritten and none changes meaning.
 * Twelve positions × eleven made 132 before; the borrowed three add 72.
 * =====================================================================
 */
import type { ChordQuality } from './catalog';

/**
 * Which way the bass goes. `asc` is up, `desc` is down.
 *
 * =====================================================================
 * THE BASS'S REAL DIRECTION, EVERYWHERE. Silas's ruling of 10 Sep 2026.
 *
 * It used to be scale position — 1 → 6m was `asc` because the 6 sits
 * above the 1 in the octave — while the bass, taking the smaller move,
 * went down. Now every pair is two cards and the bass makes the jump
 * the card names: `motion:1-6-asc` is up a major 6th, `motion:1-6-desc`
 * down a minor 3rd. An id that existed before keeps the direction it
 * already meant, because scale-position `asc` WAS "up by the distance
 * to the next one above"; the twin is new.
 *
 * `'same'` IS A MOTION THAT KEEPS ITS ROOT — 4 → 4m, 5 → 5m, 2m → 2ø.
 * It has no up or down, so neither Direction chip excludes it.
 * =====================================================================
 */
export type Direction = 'asc' | 'desc' | 'same';

// 12 positions in the chromatic scale relative to the tonic of a major
// key. Diatonic positions are 1-7 (offsets 0,2,4,5,7,9,11); the five
// chromatic slots fill the gaps with borrowed-quality defaults:
//   b2 / b3 / b6 / b7 as majors (Neapolitan + borrowed-from-minor
//   majors) and #4 as diminished (tritone / vii° of V).
// This is the universe of motion endpoints across both scope settings;
// the pool filters at runtime by entry.diatonic when the user is in
// "diatonic only" mode.
export type DegreeLabel =
  | '1' | 'b2' | '2' | 'b3' | '3' | '4' | '#4' | '5' | 'b6' | '6' | 'b7' | '7'
  // The borrowed three: a degree the table already has, in a second
  // quality. The segment names both, because the bare degree is taken.
  | '2m7b5' | '4m' | '5m'
  // The ♯4's second seventh chord, F♯dim7 in C, beside the F♯m7♭5 the
  // bare `#4` has always meant.
  | '#4dim7';

export interface DegreeEntry {
  label: DegreeLabel;
  /** The degree alone — '4' for both the 4 and the 4m. */
  degree: string;
  semi: number;
  diatonic: boolean;
  quality: ChordQuality;
  /** A second quality on a degree the table already has. */
  borrowed?: true;
}

/**
 * Every chord a motion can start or land on, in chip order.
 *
 * A BORROWED CHORD SITS AFTER ITS DIATONIC TWIN, which is the chip row
 * Silas walked (1 · ♭2 · 2m · 2ø · ♭3 …) and also what makes a piano
 * tap — a pitch, with no quality — resolve to the diatonic one.
 */
/*
 * THE DIMINISHED FAMILY, IN THE CATALOG'S OWN WORDS. `half-dim` is the
 * m7♭5 — the 7, the ♯4 and the borrowed 2 — and `diminished` is the
 * fully diminished dim7, which only the ♯4's second chip carries. Until
 * 10 Sep 2026 this table called the m7♭5 `diminished` because nothing
 * here was a dim7; the ids never named a quality for these, so no
 * stored row changes meaning.
 */
export const DEGREE_TABLE: DegreeEntry[] = [
  { label: '1',     degree: '1',  semi: 0,  diatonic: true,  quality: 'major' },
  { label: 'b2',    degree: 'b2', semi: 1,  diatonic: false, quality: 'major' },
  { label: '2',     degree: '2',  semi: 2,  diatonic: true,  quality: 'minor' },
  { label: '2m7b5', degree: '2',  semi: 2,  diatonic: false, quality: 'half-dim', borrowed: true },
  { label: 'b3',    degree: 'b3', semi: 3,  diatonic: false, quality: 'major' },
  { label: '3',     degree: '3',  semi: 4,  diatonic: true,  quality: 'minor' },
  { label: '4',     degree: '4',  semi: 5,  diatonic: true,  quality: 'major' },
  { label: '4m',    degree: '4',  semi: 5,  diatonic: false, quality: 'minor', borrowed: true },
  { label: '#4',    degree: '#4', semi: 6,  diatonic: false, quality: 'half-dim' },
  { label: '#4dim7', degree: '#4', semi: 6,  diatonic: false, quality: 'diminished', borrowed: true },
  { label: '5',     degree: '5',  semi: 7,  diatonic: true,  quality: 'dominant' },
  { label: '5m',    degree: '5',  semi: 7,  diatonic: false, quality: 'minor', borrowed: true },
  { label: 'b6',    degree: 'b6', semi: 8,  diatonic: false, quality: 'major' },
  { label: '6',     degree: '6',  semi: 9,  diatonic: true,  quality: 'minor' },
  { label: 'b7',    degree: 'b7', semi: 10, diatonic: false, quality: 'major' },
  { label: '7',     degree: '7',  semi: 11, diatonic: true,  quality: 'half-dim' },
];

const DEGREE_BY_LABEL = new Map<string, DegreeEntry>(DEGREE_TABLE.map(e => [e.label, e]));

export function degreeEntry(label: string): DegreeEntry | undefined {
  return DEGREE_BY_LABEL.get(label);
}

// Approximate musical-interval count (2..7) from a semitone span. Keeps
// the scope filter buckets sensible across both diatonic and chromatic
// endpoints. The boundary cases (tritone at 6 st, mediant overlaps) are
// not strict music-theory spellings — they're just scope buckets.
export function intervalCountFromSemi(semi: number): Distance {
  const s = Math.abs(semi);
  // SAME ROOT is its own bucket, the Distance row's first chip. A zero
  // used to fall in with the 2nds, when nothing in the pool could
  // produce one.
  if (s === 0) return 1;
  if (s <= 2) return 2;
  if (s <= 4) return 3;
  if (s <= 5) return 4;
  if (s <= 7) return 5;
  if (s <= 9) return 6;
  return 7;
}

/** A distance bucket: 1 is Same Root, then 2nds through 7ths. */
export type Distance = 1 | 2 | 3 | 4 | 5 | 6 | 7;

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
  distance: Distance;
  /** True when BOTH endpoints are diatonic (scale degrees 1..7 of the
   *  major scale). Drives the diatonic-only scope filter. */
  isDiatonic: boolean;
  /** Each end's degree alone, and the quality it carries — so a
   *  `4m` reads as the 4, minor, and a legacy `4` as the 4, major. */
  startDegree: string;
  startQuality: ChordQuality;
  destDegree: string;
  destQuality: ChordQuality;
  /** Either end is a borrowed chord. None of these existed before
   *  10 Sep 2026, so no row from the scaffolding era can name one. */
  borrowed: boolean;
  /**
   * The bass's move, in semitones: +9 for up a major 6th, −3 for down
   * a minor 3rd, 0 for a same-root move. Never more than eleven either
   * way — the two cards of a pair add up to an octave.
   */
  semitones: number;
  /** The direction the pair did NOT have before 10 Sep 2026 — `1 → 6m`
   *  down, `6m → 1` up. New ids; no stored row can name one. */
  twin: boolean;
}

function motionBetween(s: DegreeEntry, d: DegreeEntry, direction: Direction): Motion {
  const upBy = (((d.semi - s.semi) % 12) + 12) % 12;
  const semitones = direction === 'same' ? 0
    : direction === 'asc' ? upBy : -((12 - upBy) % 12);
  return {
    startLabel: s.label,
    destLabel: d.label,
    startSemi: s.semi,
    destSemi: d.semi,
    direction,
    semitones,
    // THE CARD'S INTERVAL, not the scale-position gap: a 6th up and its
    // 3rd-down twin sit in different Distance buckets.
    distance: intervalCountFromSemi(semitones),
    twin: direction !== 'same' && (direction === 'asc') !== (d.semi > s.semi),
    isDiatonic: s.diatonic && d.diatonic,
    startDegree: s.degree,
    startQuality: s.quality,
    destDegree: d.degree,
    destQuality: d.quality,
    borrowed: s.borrowed === true || d.borrowed === true,
  };
}

export function motionId(m: Pick<Motion, 'startLabel' | 'destLabel' | 'direction'>): string {
  return `motion:${m.startLabel}-${m.destLabel}-${m.direction}`;
}

export function parseMotionId(id: string): Motion | null {
  // Labels can contain b/# plus a digit, so we lean on a non-hyphen
  // match rather than \d+. Legacy ids stored as `motion:1-5-asc` parse
  // cleanly because "1" and "5" are valid DegreeLabel entries.
  const m = id.match(/^motion:([^-]+)-([^-]+)-(asc|desc|same)$/);
  if (!m) return null;
  const startEntry = degreeEntry(m[1]);
  const destEntry = degreeEntry(m[2]);
  if (!startEntry || !destEntry) return null;
  const direction = m[3] as Direction;
  // A same-root id names a root it keeps; an asc/desc id names two.
  // Anything else — `motion:4-4m-asc`, `motion:4-5-same` — is not a
  // motion this pool has, and a stored one is not read as one.
  if ((direction === 'same') !== (startEntry.semi === destEntry.semi)) return null;
  return motionBetween(startEntry, destEntry, direction);
}

/**
 * The moves that keep their root. Silas's ruling of 10 Sep 2026: under
 * Chromatic the pool gains 4 → 4m, 5 → 5m and 2m → 2ø — the diatonic
 * chord to its borrowed twin, which is how the move is met in a song
 * (a IV going minor, not a iv going major). Ids follow the borrowed
 * rule: `motion:4-4m-same`.
 */
const SAME_ROOT_PAIRS: ReadonlyArray<readonly [DegreeLabel, DegreeLabel]> = [
  ['4', '4m'], ['5', '5m'], ['2', '2m7b5'],
];

// Every motion between two chords on DIFFERENT roots, BOTH WAYS: up to
// the next instance of the destination root, and down to the one
// below. The pool is generated once and filtered at call time by
// distance / direction / note-context (see filterMotions).
//
// A CHORD AND ITS OWN BORROWED TWIN ARE NOT GENERATED HERE — only the
// three same-root moves Silas ruled in, from `SAME_ROOT_PAIRS`, which
// carry `'same'` and the Same Root distance.
function buildAllMotions(): Motion[] {
  const motions: Motion[] = [];
  for (const s of DEGREE_TABLE) {
    for (const d of DEGREE_TABLE) {
      if (s.semi === d.semi) continue;
      // The direction the pair always had first, then its twin, so the
      // legacy half of the pool keeps its order.
      const natural: Direction = d.semi > s.semi ? 'asc' : 'desc';
      motions.push(motionBetween(s, d, natural));
      motions.push(motionBetween(s, d, natural === 'asc' ? 'desc' : 'asc'));
    }
  }
  for (const [from, to] of SAME_ROOT_PAIRS) {
    const s = degreeEntry(from);
    const d = degreeEntry(to);
    if (s && d) motions.push(motionBetween(s, d, 'same'));
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

/** A distance bucket as the Distance row names it: "Same Root", "2nds". */
export function distanceLabel(d: Distance): string {
  return d === 1 ? 'Same Root' : `${INTERVAL_NAME[d]}s`;
}
