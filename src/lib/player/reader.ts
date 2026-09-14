/**
 * The reader: names any set of lit keys from scratch.
 *
 * =====================================================================
 * EVERY ROOT, EVERY QUALITY, AND WHAT WAS LEFT OUT.
 *
 * Silas's spec of 12 Sep 2026 (§3), with the order he ruled on 13 Sep.
 * Every root from C to B is tried against every quality the app teaches
 * — the Chord Recognition seed, and the dominant 9 from `chordShapes` —
 * and a quality is kept when the lit notes are a subset of it with at
 * most these gaps, in this order of preference:
 *
 *   exact · no 5th · rootless · rootless, no 5th · no 3rd · no 3rd, no 5th
 *
 * THE 3RD SAYS WHAT A CHORD IS; THE ROOT SAYS WHERE IT SITS. So a
 * reading that keeps its 3rd outranks one that lacks it (Silas, 13 Sep).
 *
 * THE LOWEST LIT NOTE WINS AS ROOT OVER AN ABSENT ROOT (spec §3). Where
 * some reading has its root on the lowest note, no rootless reading
 * outranks it. That is what keeps A♭ E♭ G♭ reading A♭7 (no 3rd), as the
 * spec's own worked example says, rather than B6 rootless; where no
 * reading has its root at the bottom (E G A) the order above decides,
 * and it reads C6 rootless.
 *
 * A ♯9 THAT IS LIT STANDS IN FOR THE 3RD, so E G B D never offers
 * "E7♯9 (no 3rd)": the G is already sounding where a minor 3rd would.
 *
 * NOTHING IS THROWN AWAY: up to three other readings show as "also",
 * except a reading missing two notes, and a rootless one when the best
 * name is a triad.
 * =====================================================================
 */
import { CHORD_SEEDS } from '../../modules/ear-training/chord-recognition/seed';
import { CHORD_INTERVALS } from '../builtAnswers/chordShapes';
import {
  DEFAULT_PROGRESSION_SPELLING, type ProgressionSpelling,
} from '../progressionSpellingShape';
import { DEFAULT_SPELLING, spellNote, type Spelling } from '../spelling';

export type Omission = 'none' | 'no5' | 'rootless' | 'rootlessNo5' | 'no3' | 'no3no5';

/** A quality the reader can name. */
export interface ReaderQuality {
  /** The Chord Recognition id, or `dom9` for the one from `chordShapes`. */
  id: string;
  /** The Chord Recognition family, which the panel's Colour row reads. */
  family: string;
  intervals: ReadonlyArray<number>;
}

/** Dominant first: a bare number means dominant, so where a 7 and an m7
 *  read the same notes equally well, the 7 leads. */
const FAMILY_ORDER: ReadonlyArray<string> = ['dom', 'major', 'minor', 'sus', 'dim', 'aug'];

export const READER_QUALITIES: ReadonlyArray<ReaderQuality> = [
  ...CHORD_SEEDS.map(s => ({ id: s.id, family: s.family, intervals: s.intervals })),
  { id: 'dom9', family: 'dom', intervals: CHORD_INTERVALS['9'] },
];

/** The suffix a quality is written with, under the spelling setting. */
export function qualitySymbol(id: string, spelling: ProgressionSpelling): string {
  switch (id) {
    case 'maj': return '';
    case 'min': return 'm';
    case 'dim': return spelling.halfDimTriad;
    case 'dim7': return spelling.halfDimTriad === '°' ? '°7' : 'dim7';
    case 'm7b5': return spelling.halfDimSeventh;
    case 'aug': return 'aug';
    case 'maj7': return 'maj7';
    case 'min7': return 'm7';
    case 'dom7': return '7';
    case 'minMaj7': return 'mMaj7';
    case 'dom7sus4': return '7sus4';
    case 'dom7b9': return '7♭9';
    case 'dom7#9': return '7♯9';
    case 'dom7#9#5': return '7♯9♯5';
    case 'dom13': return '13';
    case 'dom9': return '9';
    case 'maj9': return 'maj9';
    case 'maj13': return 'maj13';
    case 'maj6': return '6';
    case 'maj6_9': return '6/9';
    case 'min9': return 'm9';
    case 'min11': return 'm11';
    case 'min6': return 'm6';
    case 'min6_9': return 'm6/9';
    default: return id;
  }
}

export interface ReadCandidate {
  /** The full name as shown: "G6/E", "Cmaj9 rootless". */
  name: string;
  rootPc: number;
  quality: ReaderQuality;
  omission: Omission;
  /** Whether the chord's root is the lowest lit note. */
  rootIsBass: boolean;
}

export interface Reading {
  kind: 'none' | 'note' | 'interval' | 'chord' | 'unnamed';
  /** The name, or the notes and their interval, or "" for nothing lit. */
  name: string;
  /** Up to three other readings. */
  alts: string[];
  /** The winning chord reading, where the notes read as a chord. */
  best: ReadCandidate | null;
}

export interface ReadOptions {
  spelling?: Spelling;
  progression?: ProgressionSpelling;
}

const INTERVAL_NAME: Readonly<Record<number, string>> = {
  1: 'minor 2nd', 2: 'major 2nd', 3: 'minor 3rd', 4: 'major 3rd', 5: 'perfect 4th',
  6: 'tritone', 7: 'perfect 5th', 8: 'minor 6th', 9: 'major 6th', 10: 'minor 7th', 11: 'major 7th',
};

const BASE_SCORE: Readonly<Record<Omission, number>> = {
  none: 100, no5: 85, rootless: 70, rootlessNo5: 55, no3: 50, no3no5: 35,
};

const OMISSION_TEXT: Readonly<Record<Omission, string>> = {
  none: '', no5: ' (no 5th)', rootless: ' rootless', rootlessNo5: ' rootless, no 5th',
  no3: ' (no 3rd)', no3no5: ' (no 3rd, no 5th)',
};

const isRootless = (o: Omission) => o === 'rootless' || o === 'rootlessNo5';
const missesTwo = (o: Omission) => o === 'rootlessNo5' || o === 'no3no5';

/** Name whatever is lit. MIDI numbers, any order, doubles allowed. */
export function readNotes(midis: ReadonlyArray<number>, opts: ReadOptions = {}): Reading {
  const spelling = opts.spelling ?? DEFAULT_SPELLING;
  const progression = opts.progression ?? DEFAULT_PROGRESSION_SPELLING;
  const note = (pc: number) => spellNote(pc, spelling);
  if (midis.length === 0) return { kind: 'none', name: '', alts: [], best: null };

  const sorted = [...midis].sort((a, b) => a - b);
  const bassPc = ((sorted[0] % 12) + 12) % 12;
  const pcs = [...new Set(sorted.map(m => ((m % 12) + 12) % 12))];

  if (pcs.length === 1) return { kind: 'note', name: note(pcs[0]), alts: [], best: null };
  if (pcs.length === 2) {
    const hi = pcs.find(p => p !== bassPc)!;
    const name = `${note(bassPc)} ${note(hi)} · ${INTERVAL_NAME[(hi - bassPc + 12) % 12]}`;
    return { kind: 'interval', name, alts: [], best: null };
  }

  type Scored = ReadCandidate & { score: number; order: number };
  const found: Scored[] = [];
  READER_QUALITIES.forEach((quality, qIndex) => {
    const need = new Set(quality.intervals.map(i => i % 12));
    for (let root = 0; root < 12; root += 1) {
      const lit = new Set(pcs.map(p => (p - root + 12) % 12));
      if ([...lit].some(i => !need.has(i))) continue;
      const missing = [...need].filter(i => !lit.has(i));
      const third = [...need].find(i => i === 3 || i === 4);
      const gone = (i: number | undefined) => i !== undefined && missing.includes(i);
      let omission: Omission | null = null;
      if (missing.length === 0) omission = 'none';
      else if (missing.length === 1 && gone(7)) omission = 'no5';
      else if (missing.length === 1 && gone(0)) omission = 'rootless';
      else if (missing.length === 2 && gone(7) && gone(0)) omission = 'rootlessNo5';
      else if (missing.length === 1 && gone(third)) omission = 'no3';
      else if (missing.length === 2 && gone(7) && gone(third)) omission = 'no3no5';
      if (omission === null) continue;
      // A LIT ♯9 STANDS IN FOR THE 3RD.
      if ((omission === 'no3' || omission === 'no3no5') && need.has(3) && lit.has(3)) continue;

      const rootIsBass = root === bassPc;
      const slash = !rootIsBass && !isRootless(omission);
      const name = `${note(root)}${qualitySymbol(quality.id, progression)}`
        + `${slash ? `/${note(bassPc)}` : ''}${OMISSION_TEXT[omission]}`;
      const score = BASE_SCORE[omission] - quality.intervals.length * 0.5
        + (rootIsBass ? 8 : 0) - (slash ? 5 : 0);
      const family = FAMILY_ORDER.indexOf(quality.family);
      found.push({
        name, rootPc: root, quality, omission, rootIsBass, score,
        order: (family < 0 ? FAMILY_ORDER.length : family) * 1000 + qIndex,
      });
    }
  });

  if (found.length === 0) {
    return { kind: 'unnamed', name: `${sorted.map(m => note(m % 12)).join(' ')} · no chord name`, alts: [], best: null };
  }

  const rootAtBottom = found.some(c => c.rootIsBass);
  const demoted = (c: Scored) => (rootAtBottom && isRootless(c.omission) ? 1 : 0);
  found.sort((a, b) => demoted(a) - demoted(b) || b.score - a.score || a.order - b.order);

  const seen = new Set<string>();
  const unique = found.filter(c => (seen.has(c.name) ? false : (seen.add(c.name), true)));
  const [best, ...rest] = unique;
  const triad = best.quality.intervals.length <= 3;
  const alts = rest
    .filter(c => !missesTwo(c.omission) && !(triad && isRootless(c.omission)))
    .slice(0, 3)
    .map(c => c.name);
  const { score: _s, order: _o, ...bestCandidate } = best;
  void _s; void _o;
  return { kind: 'chord', name: best.name, alts, best: bestCandidate };
}
