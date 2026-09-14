/**
 * Law (a) of the shared player, on Chord Motion: the lit keys are the
 * sounding keys.
 *
 * =====================================================================
 * THE PAINTED SET EQUALS THE SCHEDULED SET, ON EVERY STEP.
 *
 * The old surface voiced its chords in root position from their own
 * degree and drew the board from a second calculation. Two calculations
 * of one thing drift, and this one drifted where "no octave crossing"
 * had moved a note the board did not know about.
 *
 * There is one calculation now — `soundingNotes` — and both the schedule
 * and the marks read it. This test asserts they agree for every chord of
 * every motion in the pool, in three keys, at every thickness, with the
 * bass Forward and Blended and with one hand and two.
 *
 * WHAT THE BOARD MAY LEAVE OUT is a note off the four octaves it draws,
 * and nothing else — a note the player schedules above or below the
 * board has nowhere to light. So the comparison is against the scheduled
 * set narrowed to the board, which is the only difference allowed.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { ALL_MOTIONS, motionId } from '../chordMotionPool';
import { motionChords, motionMarks } from '../motionChords';
import { chordStep, handsForSetting, placeBass } from '../../../../lib/player/voices';
import { DEFAULT_PLAYER_SETTINGS, bassWindow } from '../../../../lib/player/settings';
import { onBoard } from '../../../../lib/builtAnswers/board';
import { keyToRootMidi } from '../progressionTheory';
import { LIST_RUNGS } from '../sharedList';

/** C, F and B♭ — the rule is about intervals, so one key would be luck. */
const KEYS = ['C', 'F', 'B♭'] as const;

const VARIANTS = [
  { name: 'bass forward, rootless', patch: { bass: 'forward' as const, hands: 'rootless' as const } },
  { name: 'bass blended, rootless', patch: { bass: 'blended' as const, hands: 'rootless' as const } },
  { name: 'bass forward, root in the right hand', patch: { bass: 'forward' as const, hands: 'root' as const } },
  { name: 'bass only', patch: { listen: 'bass' as const } },
  { name: 'up an octave', patch: { octaveUp: true } },
];

describe('the lit keys are the sounding keys', () => {
  for (const variant of VARIANTS) {
    it(`agrees on every step of every motion — ${variant.name}`, () => {
      const settings = { ...DEFAULT_PLAYER_SETTINGS, ...variant.patch };
      for (const key of KEYS) {
        const keyPc = ((keyToRootMidi(key) % 12) + 12) % 12;
        for (const motion of ALL_MOTIONS) {
          for (const rung of LIST_RUNGS) {
            const { chords } = motionChords(
              keyPc, motion.startLabel, motion.destLabel, rung,
            );
            // What the sequencer plays: the register, then the Hands row,
            // applied to the list.
            const played = handsForSetting(placeBass(chords, settings), settings);
            played.forEach((chord, i) => {
              const scheduled = chordStep(chord, settings, 2).intervals
                .filter(onBoard)
                .sort((a, b) => a - b);
              const painted = [...motionMarks(chords, i, settings).keys()]
                .sort((a, b) => a - b);
              const where = `${key} ${motionId(motion)} ${rung} step ${i}`;
              expect([...new Set(painted)], where).toEqual([...new Set(scheduled)]);
            });
          }
        }
      }
    });
  }
});

describe('a named motion moves into the register as one block', () => {
  it('shifts both basses by the same octaves, inside the window, on every register', () => {
    for (const bassRegister of ['c1', 'c2', 'c3'] as const) {
      for (const bass of ['forward', 'blended'] as const) {
        const settings = { ...DEFAULT_PLAYER_SETTINGS, bass, bassRegister };
        const { low, high } = bassWindow(bassRegister);
        for (const key of KEYS) {
          const keyPc = ((keyToRootMidi(key) % 12) + 12) % 12;
          for (const motion of ALL_MOTIONS) {
            const { chords } = motionChords(
              keyPc, motion.startLabel, motion.destLabel, 'seventh', 'flat', motion.direction,
            );
            const placed = placeBass(chords, settings);
            const where = `${bassRegister} ${bass} ${key} ${motionId(motion)}`;
            const shifts = placed.map((c, i) => (c.bass as number) - (chords[i].bass as number));
            expect(Math.abs(shifts[0] % 12), where).toBe(0);
            expect(shifts[1], where).toBe(shifts[0]);
            // THE DIRECTION WINS. A jump of up to a major 6th always fits
            // the window at some octave; a wider one (a minor 6th's twin
            // up to a major 7th) may not, and then the pair sits as little
            // outside it as an octave shift allows — never more than the
            // jump's size less eight.
            const [a, b] = placed.map(c => c.bass as number);
            const outside = [a, b].reduce((n, m) => n + Math.max(0, low - m) + Math.max(0, m - high), 0);
            expect(outside, where).toBeLessThanOrEqual(Math.max(0, Math.abs(b - a) - 8));
          }
        }
      }
    }
  });
});
