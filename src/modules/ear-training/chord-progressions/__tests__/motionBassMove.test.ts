/**
 * The verdict names what the bass did, read off what the player scheduled.
 *
 * THE EXPECTED WORDS ARE BUILT HERE, NOT BORROWED. The interval names are
 * the ruled list, typed out below, and the bass pair is read from
 * `seqSchedule` — the timestamps the audio is scheduled from — rather
 * than from `bassMove`'s own route to it. So the test fails if the line
 * reads a different pair from the one that sounded, or names it wrong.
 */
import { describe, expect, it } from 'vitest';
import { seqSchedule } from '../../../../lib/audio';
import { chordStep, placeBass, type PlayerChord } from '../../../../lib/player/voices';
import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from '../../../../lib/player/settings';
import { ALL_MOTIONS, motionId } from '../chordMotionPool';
import { bassMove, motionChords } from '../motionChords';

/** The ruled names, by semitones. An octave never happens. */
const RULED = [
  null, 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th',
  'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th',
];

/** The bass pair the sequencer was handed, and when each sounds. */
function scheduledBass(chords: PlayerChord[], settings: PlayerSettings): [number, number] {
  const { steps } = seqSchedule(placeBass(chords, settings).map(c => chordStep(c, settings, 2)), 0, 1, 0);
  return [steps[0].notes[0].midi, steps[1].notes[0].midi];
}

const KEYS = [0, 5, 10]; // C, F, B♭
const MODES: PlayerSettings[] = [
  { ...DEFAULT_PLAYER_SETTINGS, bass: 'forward' },
  { ...DEFAULT_PLAYER_SETTINGS, bass: 'blended' },
];

describe('the verdict follows the bass', () => {
  it('makes the jump the card names, for every card, three keys, both bass modes', () => {
    // =====================================================================
    // THE BASS MAKES THE JUMP THE CARD NAMES (10 Sep 2026). Every card
    // carries its move — +9 for 1 → 6m up, −3 for its twin down — and
    // the bass pair the sequencer is handed must move by exactly that:
    // same direction, same interval, never bent by the register.
    // =====================================================================
    let checked = 0;
    const directions = new Set<string>();
    for (const settings of MODES) {
      for (const key of KEYS) {
        for (const m of ALL_MOTIONS) {
          const where = `${key} ${motionId(m)} ${settings.bass}`;
          const { chords } = motionChords(key, m.startLabel, m.destLabel, 'seventh', 'flat', m.direction);
          const [from, to] = scheduledBass(chords, settings);
          expect(to - from, where).toBe(m.semitones);
          expect(Math.abs(to - from), where).toBeLessThan(12);
          // The verdict reads that pair, so it names the card's move.
          expect(bassMove(chords, settings)?.words, where).toBe(
            m.semitones === 0 ? 'same root'
              : `${m.semitones > 0 ? 'up' : 'down'} a ${RULED[Math.abs(m.semitones)]}`,
          );
          // And the bass stays under the hand, on the board.
          chords.forEach((c, i) => {
            const b = [from, to][i];
            expect(b, where).toBeLessThan(Math.min(...c.hand));
            // On the board, which starts at F1. The register can sit a
            // wide named jump a few keys under C2 rather than flip it.
            expect(b, where).toBeGreaterThanOrEqual(29);
          });
          directions.add(bassMove(chords, settings)!.direction);
          checked += 1;
        }
      }
    }
    // Guard the guard: every card was checked and all three kinds occur.
    expect(checked).toBe(ALL_MOTIONS.length * KEYS.length * MODES.length);
    expect(directions).toEqual(new Set(['up', 'down', 'same']));
  });

  it('reads the Forward bass where it sounds, an octave under Blended, and names the same move', () => {
    // A NAMED PAIR SMALL ENOUGH TO FIT THE WINDOW TWICE: Forward takes the
    // lowest octave that fits, Blended the highest (Silas, 14 Sep 2026).
    const both = KEYS.flatMap(key => ALL_MOTIONS
      .filter(m => m.direction !== 'same')
      .map(m => motionChords(key, m.startLabel, m.destLabel, 'seventh', 'flat', m.direction).chords))
      .find(chords => scheduledBass(chords, MODES[0])[0] !== scheduledBass(chords, MODES[1])[0]);
    // Guard: such a motion exists, so this is not vacuous.
    expect(both).toBeDefined();
    const [f] = scheduledBass(both!, MODES[0]);
    const [b] = scheduledBass(both!, MODES[1]);
    expect(f).toBe(b - 12);
    expect(f).toBeGreaterThanOrEqual(36);
    expect(b).toBeLessThanOrEqual(55);
    expect(bassMove(both!, MODES[0])?.from).toBe(f);
    expect(bassMove(both!, MODES[0])?.words).toBe(bassMove(both!, MODES[1])?.words);
  });

  it('key of C, Cmaj7 → Am7, bass C down to A: down a minor 3rd', () => {
    const { chords } = motionChords(0, '1', '6', 'seventh', 'flat', 'desc');
    expect(chords.map(c => c.name)).toEqual(['Cmaj7', 'Am7']);
    expect(bassMove(chords, DEFAULT_PLAYER_SETTINGS)?.words).toBe('down a minor 3rd');
  });

  it('the same move with the bass climbing: up a major 6th', () => {
    const { chords } = motionChords(0, '1', '6', 'seventh', 'flat', 'asc');
    expect(bassMove(chords, { ...DEFAULT_PLAYER_SETTINGS, bass: 'blended' })?.words)
      .toBe('up a major 6th');
  });
});
