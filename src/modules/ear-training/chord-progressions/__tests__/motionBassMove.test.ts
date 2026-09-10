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
import { bassDrop, chordStep, type PlayerChord } from '../../../../lib/player/voices';
import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from '../../../../lib/player/settings';
import { ALL_MOTIONS } from '../chordMotionPool';
import { bassMove, motionChords } from '../motionChords';

/** The ruled names, by semitones. An octave never happens. */
const RULED = [
  null, 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th',
  'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th',
];

/** The bass pair the sequencer was handed, and when each sounds. */
function scheduledBass(chords: PlayerChord[], settings: PlayerSettings): [number, number] {
  const drop = bassDrop(chords, settings);
  const { steps } = seqSchedule(chords.map(c => chordStep(c, settings, 2, drop)), 0, 1, 0);
  return [steps[0].notes[0].midi, steps[1].notes[0].midi];
}

const KEYS = [0, 5, 10]; // C, F, B♭
const MODES: PlayerSettings[] = [
  { ...DEFAULT_PLAYER_SETTINGS, bass: 'forward' },
  { ...DEFAULT_PLAYER_SETTINGS, bass: 'blended' },
];

describe('the verdict follows the bass', () => {
  it('names the scheduled bass pair, for every motion, three keys, both bass modes', () => {
    let checked = 0;
    let disagreesWithPool = 0;
    const directions = new Set<string>();
    for (const settings of MODES) {
      for (const key of KEYS) {
        for (const m of ALL_MOTIONS) {
          const { chords } = motionChords(key, m.startLabel, m.destLabel, 'seventh');
          const [from, to] = scheduledBass(chords, settings);
          const semis = to - from;
          expect(Math.abs(semis), `${key} ${m.startLabel}-${m.destLabel}`).toBeGreaterThan(0);
          expect(Math.abs(semis)).toBeLessThan(12);
          const want = `${semis > 0 ? 'up' : 'down'} a ${RULED[Math.abs(semis)]}`;
          const got = bassMove(chords, settings);
          expect(got?.words, `${key} ${m.startLabel}-${m.destLabel} ${settings.bass}`).toBe(want);
          expect([got?.from, got?.to]).toEqual([from, to]);
          directions.add(got!.direction);
          if ((got!.direction === 'up') !== (m.direction === 'asc')) disagreesWithPool += 1;
          checked += 1;
        }
      }
    }
    // Guard the guard: the fixture really exercises both directions, and
    // the bass really does disagree with the pool's scale-position
    // direction somewhere — otherwise the old rule would pass too.
    expect(checked).toBe(ALL_MOTIONS.length * KEYS.length * MODES.length);
    expect(directions).toEqual(new Set(['up', 'down']));
    expect(disagreesWithPool).toBeGreaterThan(0);
  });

  it('reads the Forward bass where it sounds, an octave down, and names the same move', () => {
    // A motion high enough for Forward to drop the line — not every one
    // is: the drop waits until every bass fits above the board's floor.
    const dropped = KEYS.flatMap(key => ALL_MOTIONS.map(m =>
      motionChords(key, m.startLabel, m.destLabel, 'seventh').chords))
      .find(chords => bassDrop(chords, MODES[0]) === -12);
    // Guard: such a motion exists, so this is not vacuous.
    expect(dropped).toBeDefined();
    const [f] = scheduledBass(dropped!, MODES[0]);
    const [b] = scheduledBass(dropped!, MODES[1]);
    expect(f).toBe(b - 12);
    expect(bassMove(dropped!, MODES[0])?.from).toBe(f);
    expect(bassMove(dropped!, MODES[0])?.words).toBe(bassMove(dropped!, MODES[1])?.words);
  });

  it('key of C, Cmaj7 → Am7, bass C down to A: down a minor 3rd', () => {
    const { chords } = motionChords(0, '1', '6', 'seventh');
    expect(chords.map(c => c.name)).toEqual(['Cmaj7', 'Am7']);
    expect(bassMove(chords, DEFAULT_PLAYER_SETTINGS)?.words).toBe('down a minor 3rd');
  });

  it('the same move with the bass climbing: up a major 6th', () => {
    const { chords } = motionChords(0, '1', '6', 'seventh');
    const climbing = [chords[0], { ...chords[1], bass: chords[0].bass! + 9 }];
    expect(bassMove(climbing, { ...DEFAULT_PLAYER_SETTINGS, bass: 'blended' })?.words)
      .toBe('up a major 6th');
  });
});
