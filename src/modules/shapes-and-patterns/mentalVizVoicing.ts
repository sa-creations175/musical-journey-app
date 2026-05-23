// Bridge mental-viz chords onto the shared PianoKeyboard's data model:
// a chord root pitch class + octave-aware offsets-from-root (with L/R
// hands), which PianoKeyboard colors by interval. Two shapes:
//   · triads / sevenths — a single-hand shape from the interval stack,
//     rotated for the inversion.
//   · extended dominants — explicit bottom-to-top tone lists with an
//     LH bass + RH upper structure (the spec's A/B positions, dom7b9
//     inversions, etc.).
import { QUALITY_INTERVALS, keyPrefersFlats } from './catalog';
import type { VoicingEntry } from '../../lib/db';

const ROOT_PC: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

export function rootPcOf(rootKey: string): number {
  return ROOT_PC[rootKey] ?? 0;
}

export function preferFlatsFor(rootKey: string): boolean {
  return keyPrefersFlats(rootKey);
}

// Voicings sit in the keyboard's middle register, not anchored at the
// far-left first octave: the shape/LH bass starts in the 2nd rendered
// octave and the extended-dominant RH stacks from the 3rd. Offsets are
// pcOffsetFromRoot + 12·displayOctave, so these are the base offsets of
// each region. (The mental-viz reveal renders 4 octaves to fit them.)
const SHAPE_OCTAVE = 12; // triads / sevenths + extended-dom LH: octave 2
const RH_OCTAVE = 24; // extended-dominant right hand: octave 3+

/** Octave-aware offsets-from-root for a triad/seventh inversion — the
 *  interval stack rotated so `inversion` lands the intended bass, with
 *  the rotated-out notes bumped up an octave. Single shape (all right
 *  hand), returned as plain-number offsets, based in the 2nd rendered
 *  octave (`SHAPE_OCTAVE`). */
export function chordShapeOffsets(qualityId: string, inversion: number): number[] {
  const intervals = QUALITY_INTERVALS[qualityId] ?? [0, 4, 7];
  const len = intervals.length;
  const inv = ((inversion % len) + len) % len;
  const offsets: number[] = [];
  for (let i = 0; i < len; i++) {
    const src = (i + inv) % len;
    const bump = i + inv >= len ? 12 : 0;
    offsets.push(intervals[src] + bump + SHAPE_OCTAVE);
  }
  return offsets;
}

/** Interval-name (relative to root) → pitch class 0–11. Octave-spread
 *  spellings fold to their pitch class; the stacker re-octaves them. */
const INTERVAL_PC: Record<string, number> = {
  '1': 0, b9: 1, '9': 2, '#9': 3, '3': 4, '11': 5,
  '#11': 6, '#4': 6, b5: 6, '5': 7, '#5': 8, b13: 8, b6: 8,
  '13': 9, '6': 9, b7: 10, '7': 11,
};

export interface ExtendedDomVoicing {
  id: string;
  /** itemRef family tag, e.g. "dom9_13" → "mv:dom9_13:A:G". */
  family: string;
  /** itemRef position tag, e.g. "A", "from3". */
  position: string;
  /** Card prompt suffix, e.g. "dom9(13) — A Position". */
  label: string;
  /** Optional alternate chord name shown alongside (e.g. dom7#9b13). */
  altName?: string;
  /** Left-hand tones (the bass), bottom-to-top, as interval names. */
  lh: string[];
  /** Right-hand tones, bottom-to-top, as interval names. */
  rh: string[];
}

// Section 3 — 8 extended-dominant voicings × 12 keys = 96 items.
export const EXTENDED_DOM_VOICINGS: ExtendedDomVoicing[] = [
  { id: 'dom9-13-a',  family: 'dom9_13',  position: 'A',     label: 'dom9(13) — A Position', lh: ['1'], rh: ['3', '13', 'b7', '9'] },
  { id: 'dom9-13-b',  family: 'dom9_13',  position: 'B',     label: 'dom9(13) — B Position', lh: ['1'], rh: ['b7', '9', '3', '13'] },
  { id: 'dom7s9s5-a', family: 'dom7#9#5', position: 'A',     label: 'dom7#9#5 — A Position', altName: 'dom7#9b13', lh: ['1'], rh: ['3', '#5', 'b7', '#9'] },
  { id: 'dom7s9s5-b', family: 'dom7#9#5', position: 'B',     label: 'dom7#9#5 — B Position', altName: 'dom7#9b13', lh: ['1'], rh: ['b7', '#9', '3', '#5'] },
  { id: 'dom7b9-3',   family: 'dom7b9',   position: 'from3', label: 'dom7b9 — from 3rd',     lh: ['1'], rh: ['3', '5', 'b7', 'b9'] },
  { id: 'dom7b9-5',   family: 'dom7b9',   position: 'from5', label: 'dom7b9 — from 5th',     lh: ['1'], rh: ['5', 'b7', 'b9', '3'] },
  { id: 'dom7b9-b7',  family: 'dom7b9',   position: 'fromb7', label: 'dom7b9 — from b7',     lh: ['1'], rh: ['b7', 'b9', '3', '5'] },
  { id: 'dom7b9-b9',  family: 'dom7b9',   position: 'fromb9', label: 'dom7b9 — from b9',     lh: ['1'], rh: ['b9', '3', '5', 'b7'] },
];

/** Place an extended-dominant voicing's tones onto octave-aware offsets:
 *  LH bass in the 2nd rendered octave, RH stacked ascending from the 3rd.
 *  Each tone is the smallest offset matching its pitch class strictly
 *  above the previous, so the diagram reads bottom-to-top exactly as the
 *  voicing stacks. */
export function extendedDomOffsets(v: ExtendedDomVoicing): VoicingEntry[] {
  const out: VoicingEntry[] = [];
  // LH starts in octave 2 (>= SHAPE_OCTAVE).
  let prev = SHAPE_OCTAVE - 1;
  for (const name of v.lh) {
    let off = INTERVAL_PC[name] ?? 0;
    while (off <= prev) off += 12;
    out.push({ offset: off, hand: 'L' });
    prev = off;
  }
  // RH begins in octave 3 (>= RH_OCTAVE) and above the LH top.
  let rhPrev = Math.max(prev, RH_OCTAVE - 1);
  for (const name of v.rh) {
    let off = INTERVAL_PC[name] ?? 0;
    while (off <= rhPrev) off += 12;
    out.push({ offset: off, hand: 'R' });
    rhPrev = off;
  }
  return out;
}
