/**
 * The loop builder's chords: slots in a key, voice-led.
 *
 * =====================================================================
 * THE FIRST CHORD TAKES THE STARTING POSITION; EVERY CHORD AFTER IT IS
 * THE NEAREST HAND TO THE ONE BEFORE (spec §7). The same voice-leading
 * rule as every progression in the app (`voiceAll`), not a second one.
 *
 * THICKNESS THINS EACH CHORD, as the shared ladder does:
 *   Triads          the root, 3rd and 5th
 *   Guide tones     the 3rd and the 7th (the 6th where there is no 7th)
 *   Seventh chords  the root to the 7th
 *   Full voicing    every note the chord has
 * The root goes to the bass, so the hand is the rest.
 *
 * BASS DIRECTION: Up and Down name the move, so the Bass register moves
 * the whole line as a block and never flips it (Silas, 14 Sep 2026);
 * Nearest leaves the bass rule to choose.
 * =====================================================================
 */
import { voiceAll, type Move } from '../builtAnswers/voiceLeading';
import { DEFAULT_PROGRESSION_SPELLING, type ProgressionSpelling } from '../progressionSpellingShape';
import { spellNote, type Spelling } from '../spelling';
import { qualitySymbol } from './reader';
import type { SlotChord } from './slotChord';
import type { PlayerChord } from './voices';

export type LoopThickness = 'triads' | 'guide' | 'seventh' | 'full';
export type BassDirection = 'up' | 'down' | 'nearest';

/** The rows, in Silas's words. */
export const LOOP_THICKNESS_OPTIONS: ReadonlyArray<{ id: LoopThickness; label: string }> = [
  { id: 'triads', label: 'Triads' },
  { id: 'guide', label: 'Guide tones' },
  { id: 'seventh', label: 'Seventh chords' },
  { id: 'full', label: 'Full voicing' },
];
export const BASS_DIRECTION_OPTIONS: ReadonlyArray<{ id: BassDirection; label: string }> = [
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
  { id: 'nearest', label: 'Nearest' },
];
export const STARTING_POSITION_LABELS: ReadonlyArray<string> = ['Root', '1st', '2nd', '3rd'];

/** The hand's notes at a thickness, as semitones above the root, root left out. */
export function loopHandTones(intervals: ReadonlyArray<number>, thickness: LoopThickness): number[] {
  const byClass = (c: number) => intervals.find(i => ((i % 12) + 12) % 12 === c);
  const third = byClass(3) ?? byClass(4) ?? byClass(2) ?? byClass(5);
  const fifth = byClass(7) ?? byClass(6) ?? byClass(8);
  const seventh = byClass(10) ?? byClass(11) ?? (intervals.some(i => i % 12 === 9 && i < 12) ? byClass(9) : undefined);
  const present = (xs: Array<number | undefined>) => xs.filter((x): x is number => x !== undefined);
  switch (thickness) {
    case 'triads': return present([third, fifth]);
    case 'guide': return present([third, seventh ?? byClass(9)]);
    case 'seventh': return present([third, fifth, seventh]);
    case 'full': return intervals.filter(i => i % 12 !== 0 || i >= 12);
  }
}

/** What a slot's chord is called, in the key's spelling. */
export function slotName(chord: SlotChord, spelling: Spelling, progression: ProgressionSpelling = DEFAULT_PROGRESSION_SPELLING): string {
  return `${spellNote(chord.rootPc, spelling)}${qualitySymbol(chord.qualityId, progression)}`;
}

/**
 * The loop, voiced.
 *
 * Slots that do not parse are left out of what sounds — a red slot is a
 * slot waiting to be fixed, not a silence in the loop.
 */
export function loopChords(
  slots: ReadonlyArray<SlotChord | null>,
  opts: {
    startingPosition: number;
    thickness: LoopThickness;
    bassDirection: BassDirection;
    spelling: Spelling;
    progression?: ProgressionSpelling;
  },
): PlayerChord[] {
  const chords = slots.filter((s): s is SlotChord => s !== null);
  if (chords.length === 0) return [];
  const move: Move = opts.bassDirection === 'nearest' ? 'auto' : opts.bassDirection;
  const voiced = voiceAll(
    chords.map(c => ({ rootPc: c.rootPc, tones: loopHandTones(c.intervals, opts.thickness) })),
    {
      bass: true,
      inversion: opts.startingPosition,
      moves: chords.slice(1).map(() => move),
    },
  );
  return voiced.map((v, i) => ({
    hand: v?.hand ?? [],
    bass: v?.bass ?? null,
    rootPc: chords[i].rootPc,
    name: slotName(chords[i], opts.spelling, opts.progression),
    ...(i > 0 && move !== 'auto' ? { namesMove: true } : {}),
  }));
}
