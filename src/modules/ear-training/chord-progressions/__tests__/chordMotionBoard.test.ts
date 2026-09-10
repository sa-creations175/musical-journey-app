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
import { bassDrop, chordStep } from '../../../../lib/player/voices';
import { DEFAULT_PLAYER_SETTINGS } from '../../../../lib/player/settings';
import { onBoard } from '../../../../lib/builtAnswers/board';
import { keyToRootMidi } from '../progressionTheory';
import { LIST_RUNGS } from '../sharedList';

/** C, F and B♭ — the rule is about intervals, so one key would be luck. */
const KEYS = ['C', 'F', 'B♭'] as const;

const VARIANTS = [
  { name: 'bass forward, two hands', patch: { bass: 'forward' as const, hands: 'both' as const } },
  { name: 'bass blended, two hands', patch: { bass: 'blended' as const, hands: 'both' as const } },
  { name: 'bass forward, one hand', patch: { bass: 'forward' as const, hands: 'one' as const } },
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
            const drop = bassDrop(chords, settings);
            chords.forEach((chord, i) => {
              const scheduled = chordStep(chord, settings, 2, drop).intervals
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

describe('the bass drop is the whole line or none of it', () => {
  it('never lights one chord an octave below the other', () => {
    const settings = { ...DEFAULT_PLAYER_SETTINGS, bass: 'forward' as const };
    for (const key of KEYS) {
      const keyPc = ((keyToRootMidi(key) % 12) + 12) % 12;
      for (const motion of ALL_MOTIONS) {
        const { chords } = motionChords(
          keyPc, motion.startLabel, motion.destLabel, 'seventh',
        );
        const drop = bassDrop(chords, settings);
        expect([0, -12], motionId(motion)).toContain(drop);
      }
    }
  });
});
