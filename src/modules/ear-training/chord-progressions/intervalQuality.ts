// Interval-quality helpers shared by Chord Motion (and any future
// modules that need to name intervals from MIDI distance rather than
// scale-degree distance). The distinction matters: "4 → 2 in Db major"
// is a scale-degree 3rd, but the actual semitone distance (Gb → Eb =
// 3 st) makes it a *minor* 3rd — and minor vs. major 3rds sound very
// different.

export type IntervalDirection = 'ascending' | 'descending';

export interface IntervalQuality {
  /** Stable id used as part of the intervalDescriptions row key. */
  id: string;
  /** Short human-readable name: "minor 3rd", "Perfect 4th", "Tritone". */
  name: string;
  /** Semitone span this quality represents (0..12). */
  semitones: number;
}

// Index 0..12. Tritone sits at 6 without distinguishing aug4/dim5
// because we don't have the spelling context needed to tell them apart
// in-code, and musically they sound identical.
export const INTERVAL_QUALITIES: IntervalQuality[] = [
  { id: 'unison',      name: 'Unison',      semitones: 0 },
  { id: 'minor-2nd',   name: 'minor 2nd',   semitones: 1 },
  { id: 'major-2nd',   name: 'major 2nd',   semitones: 2 },
  { id: 'minor-3rd',   name: 'minor 3rd',   semitones: 3 },
  { id: 'major-3rd',   name: 'major 3rd',   semitones: 4 },
  { id: 'perfect-4th', name: 'Perfect 4th', semitones: 5 },
  { id: 'tritone',     name: 'Tritone',     semitones: 6 },
  { id: 'perfect-5th', name: 'Perfect 5th', semitones: 7 },
  { id: 'minor-6th',   name: 'minor 6th',   semitones: 8 },
  { id: 'major-6th',   name: 'major 6th',   semitones: 9 },
  { id: 'minor-7th',   name: 'minor 7th',   semitones: 10 },
  { id: 'major-7th',   name: 'major 7th',   semitones: 11 },
  { id: 'octave',      name: 'Octave',      semitones: 12 },
];

/**
 * Resolve a raw semitone distance to a named interval quality. Callers
 * pass the absolute semitone delta between two MIDI pitches; distances
 * larger than an octave wrap modulo 12 so "a 10th" reads as "a minor 3rd"
 * at the quality level (direction is the caller's concern). This matches
 * the algorithm spec'd in the Chord Motion design doc.
 */
export function intervalFromSemitones(semitones: number): IntervalQuality {
  let s = Math.abs(semitones);
  if (s > 12) s = s % 12;
  return INTERVAL_QUALITIES[s] ?? INTERVAL_QUALITIES[0];
}

/**
 * Stable row key for the intervalDescriptions table. Combines quality
 * id with direction so ascending and descending versions store
 * separately — they often attract different associations.
 */
export function intervalDescriptionKey(qualityId: string, direction: IntervalDirection): string {
  return `${qualityId}-${direction}`;
}

// Direction-specific starter descriptions. These are Claude's defaults
// shown italicized beneath the interval label; users can override per
// quality+direction via the editor.
const DEFAULT_DESCRIPTIONS_ASC: Record<string, string> = {
  'unison':      'holding, sitting in place',
  'minor-2nd':   'tight tension, longing upward, half-step lean',
  'major-2nd':   'stepping forward, natural motion',
  'minor-3rd':   'melancholic lift, soulful rise, classic gospel minor ascent',
  'major-3rd':   'bright opening, confident lift, happy step up',
  'perfect-4th': 'anthemic step, opening gesture, gospel "Amazing Grace" feel',
  'tritone':     'unstable leap, dramatic tension, bluesy dissonance',
  'perfect-5th': 'strong declarative leap, confident reach',
  'minor-6th':   'yearning lift, longing reach, emotional climb',
  'major-6th':   'sweet upward lift, warm stretch',
  'minor-7th':   'wide soulful reach, bluesy/gospel leap',
  'major-7th':   'dramatic stretch, rare but striking climb',
  'octave':      'full return to home one octave higher',
};

const DEFAULT_DESCRIPTIONS_DESC: Record<string, string> = {
  'unison':      'holding, sitting in place',
  'minor-2nd':   'quiet resolution, tension releasing, half-step sigh',
  'major-2nd':   'gentle descent, natural falling step',
  'minor-3rd':   'melancholic sigh, classic soulful descent, gospel lament',
  'major-3rd':   'warm settling, arrival from brightness',
  'perfect-4th': 'grounding descent',
  'tritone':     'unstable fall, dark drop, bluesy dissonance',
  'perfect-5th': 'strong resolved descent, falling fifth',
  'minor-6th':   'deep sighing drop, emotional fall',
  'major-6th':   'wide sweet descent',
  'minor-7th':   'dramatic wide drop, bluesy collapse',
  'major-7th':   'rare wide drop, striking unusual descent',
  'octave':      'full return to home one octave lower',
};

export function defaultIntervalDescription(
  qualityId: string,
  direction: IntervalDirection,
): string {
  const table = direction === 'ascending' ? DEFAULT_DESCRIPTIONS_ASC : DEFAULT_DESCRIPTIONS_DESC;
  return (
    table[qualityId] ??
    `a ${qualityId.replace('-', ' ')} ${direction} — sit with this interval and see what feeling it leaves.`
  );
}
