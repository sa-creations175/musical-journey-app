/**
 * The four rules the shared player's brief asks to be pinned.
 *
 * Nothing autoplays; Pause and Resume are continuous; the lift moves
 * the whole hand or none of it; and the bass walks by the rule rather
 * than by whatever the first chord happened to suggest.
 *
 * The first of those is a claim about COMPONENTS and is asserted where
 * the components are — `components/__tests__/sharedPlayer.test.tsx`.
 * The other three are arithmetic and live here.
 */
import { describe, expect, it } from 'vitest';
import { bassLine, nearest, voiceAll } from '../../builtAnswers/voiceLeading';
import { handTones } from '../../builtAnswers/chordShapes';
import { liftHand, playerMarks, soundingNotes } from '../voices';
import { DEFAULT_PLAYER_SETTINGS, LADDER_RUNGS } from '../settings';

describe('the bass walks by the rule', () => {
  /**
   * =====================================================================
   * A FOURTH OR A FIFTH ALTERNATES; EVERYTHING ELSE TAKES THE SMALLEST
   * MOVE.
   *
   * A 2 5 1 is two fourths in a row. A bass that always took the
   * nearest instance of the next root would go up a fourth and up a
   * fourth again and be a seventh above where it started by the third
   * chord. Alternating keeps it near home, which is what a bass player
   * does.
   *
   * THREE KEYS, because the rule is about intervals and not about
   * notes: the brief asks for it in three and a rule that only held in
   * C would be an accident of where the pitch classes fall.
   * =====================================================================
   */
  const twoFiveOne = (keyPc: number) => [
    (keyPc + 2) % 12, (keyPc + 7) % 12, keyPc,
  ];

  it('never walks a 2 5 1 in one direction, in any of three keys', () => {
    for (const [key, name] of [[0, 'C'], [5, 'F'], [10, 'B♭']] as const) {
      const line = bassLine(twoFiveOne(key), []) as number[];
      expect(line, name).toHaveLength(3);
      const first = line[1] > line[0] ? 'up' : 'down';
      const second = line[2] > line[1] ? 'up' : 'down';
      expect(first, `${name} alternates`).not.toBe(second);
    }
  });

  it('stays inside the bass register in all three', () => {
    for (const key of [0, 5, 10]) {
      for (const m of bassLine(twoFiveOne(key), []) as number[]) {
        expect(m).toBeGreaterThanOrEqual(36);
        expect(m).toBeLessThanOrEqual(59);
      }
    }
  });

  it('moves by a step where the roots are a step apart', () => {
    // NOT EVERY MOVE ALTERNATES — only the fourths and fifths do. A
    // 1 → 2 is a whole tone and takes the smallest move, which is up.
    const line = bassLine([0, 2, 4], []) as number[];
    expect(line[1] - line[0]).toBe(2);
    expect(line[2] - line[1]).toBe(2);
  });

  it('obeys a tapped arrow over its own rule', () => {
    const forced = bassLine([0, 5, 10], ['down', 'down']) as number[];
    expect(forced[1]).toBeLessThan(forced[0]);
    expect(forced[2]).toBeLessThan(forced[1]);
  });

  it('never moves a root by a fifth to fit — whole octaves or the step', () => {
    // A root already in the bass moves a whole octave rather than
    // staying put, so tapping a move always does something audible.
    const line = bassLine([0, 0], ['up']) as number[];
    expect(line[1] - line[0]).toBe(12);
  });
});

describe('the hand can be forced up or down', () => {
  it('lands above the last chord when told up, and below when told down', () => {
    const previous = [60, 64, 67];
    const up = nearest([2, 5, 9], previous, 'up');
    const down = nearest([2, 5, 9], previous, 'down');
    expect(Math.min(...up)).toBeGreaterThan(Math.min(...previous));
    expect(Math.min(...down)).toBeLessThan(Math.min(...previous));
  });

  it('ignores a direction with nothing in it rather than going silent', () => {
    // Nothing sits below the bottom of the window, so "down" gives the
    // nearest placement rather than no chord at all.
    const previous = [55, 59, 62];
    expect(nearest([0, 4, 7], previous, 'down').length).toBeGreaterThan(0);
  });

  it('threads the direction through a whole progression', () => {
    // UP IS NEVER BELOW DOWN. Where the window has room both ways the
    // two land in different places; where it has room only one way both
    // land in the same one, because a direction with nothing in it is
    // ignored rather than obeyed into silence. Either way this holds.
    const chords = [0, 5, 10].map(pc => ({
      rootPc: pc, tones: handTones('m7', 'rootless'),
    }));
    const up = voiceAll(chords, { bass: true, handMoves: ['up', 'up'] });
    const down = voiceAll(chords, { bass: true, handMoves: ['down', 'down'] });
    for (let i = 1; i < chords.length; i += 1) {
      expect(Math.min(...up[i]!.hand))
        .toBeGreaterThanOrEqual(Math.min(...down[i]!.hand));
    }
    // And on a chord the window can hold both ways, they really differ.
    const room = [{ rootPc: 0, tones: handTones('maj7', 'rootless') },
      { rootPc: 2, tones: handTones('m7', 'rootless') }];
    const roomUp = voiceAll(room, { bass: true, handMoves: ['up'] });
    const roomDown = voiceAll(room, { bass: true, handMoves: ['down'] });
    expect(Math.min(...roomUp[1]!.hand))
      .toBeGreaterThan(Math.min(...roomDown[1]!.hand));
  });
});

describe('the lift moves the whole hand or not at all', () => {
  it('takes every note up together', () => {
    expect(liftHand([55, 59, 62], true)).toEqual([67, 71, 74]);
  });

  it('leaves the hand where it is when one note would fall off the top', () => {
    // PER-NOTE WOULD RE-ORDER THE CHORD. A voicing whose top note
    // cannot rise would come back with its bottom note above its top,
    // which is a chord nobody plays. So the whole hand stays.
    const high = [72, 76, 80];
    expect(liftHand(high, true)).toEqual(high);
    expect(liftHand(high, true)).toEqual([...high].sort((a, b) => a - b));
  });

  it('never re-orders, whatever it is handed', () => {
    for (const hand of [[55, 59, 62], [60, 70, 82], [48, 60, 84], [70, 74, 77]]) {
      const lifted = liftHand(hand, true);
      expect([...lifted].sort((a, b) => a - b)).toEqual(lifted);
      expect(lifted).toHaveLength(hand.length);
    }
  });

  it('does nothing at all when it is off', () => {
    expect(liftHand([55, 59, 62], false)).toEqual([55, 59, 62]);
  });
});

describe('what sounds is what lights', () => {
  const chord = { hand: [59, 62, 65], bass: 43, rootPc: 7, name: 'G7' };

  it('puts the root in the left hand by default', () => {
    const { notes, hands } = soundingNotes(chord, DEFAULT_PLAYER_SETTINGS);
    expect(notes).toEqual([43, 59, 62, 65]);
    expect(hands).toEqual(['L', 'R', 'R', 'R']);
  });

  it('brings the root into the chord for one hand, under the hand', () => {
    const { notes, hands } = soundingNotes(
      chord, { ...DEFAULT_PLAYER_SETTINGS, hands: 'one' },
    );
    expect(notes[0]).toBe(55);
    expect(notes.slice(1)).toEqual([59, 62, 65]);
    expect(new Set(hands)).toEqual(new Set(['R']));
  });

  it('plays the bass alone for bass only', () => {
    const { notes } = soundingNotes(
      chord, { ...DEFAULT_PLAYER_SETTINGS, listen: 'bass' },
    );
    expect(notes).toEqual([43]);
  });

  it('is the lowest note alone on a chord that has no bass of its own', () => {
    const { notes } = soundingNotes(
      { hand: [60, 64, 67], bass: null, rootPc: 0, name: 'C' },
      { ...DEFAULT_PLAYER_SETTINGS, listen: 'bass' },
    );
    expect(notes).toEqual([60]);
  });

  it('marks exactly the keys it sounds, and bands the bass', () => {
    const marks = playerMarks(chord, DEFAULT_PLAYER_SETTINGS);
    expect([...marks.keys()].sort((a, b) => a - b)).toEqual([43, 59, 62, 65]);
    expect(marks.get(43)!.bassBand).toBe(true);
    expect(marks.get(59)!.bassBand).toBeUndefined();
  });

  it('lights the lift where the lift sounds', () => {
    const up = { ...DEFAULT_PLAYER_SETTINGS, octaveUp: true };
    const marks = playerMarks(chord, up);
    expect([...marks.keys()].sort((a, b) => a - b)).toEqual([43, 71, 74, 77]);
  });
});

describe('the ladder', () => {
  it('has no bass rung — that question is Listen to now', () => {
    expect(LADDER_RUNGS).toEqual(['triads', 'guide', 'seventh', 'full']);
    expect(LADDER_RUNGS).not.toContain('bass');
  });
});
