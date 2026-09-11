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
import {
  bassDrop, chordStep, handsForSetting, liftHand, playerMarks, soundingNotes, stepBeats,
} from '../voices';
import { panelBeats } from '../../builtAnswers/play';
import { BROKEN_STEP_BEATS } from '../../audio';
import { DEFAULT_PLAYER_SETTINGS, LADDER_RUNGS, handsFrom } from '../settings';

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

  it('brings the root into the right hand, under it, and leaves the bass in the left', () => {
    // G7 rootless B D F over G: Root in the right hand gives G B D F,
    // the root just under the hand on a first chord — and the left hand
    // still plays the same G.
    const [withRoot] = handsForSetting([chord], { ...DEFAULT_PLAYER_SETTINGS, hands: 'root' });
    expect(withRoot.hand).toEqual([55, 59, 62, 65]);
    expect(withRoot.bass).toBe(43);
    const { notes, hands } = soundingNotes(withRoot, DEFAULT_PLAYER_SETTINGS);
    expect(notes).toEqual([43, 55, 59, 62, 65]);
    expect(hands).toEqual(['L', 'R', 'R', 'R', 'R']);
  });

  it('leaves the rootless hand alone, and a hand that already has its root', () => {
    expect(handsForSetting([chord], DEFAULT_PLAYER_SETTINGS)[0].hand).toEqual([59, 62, 65]);
    const triad = { hand: [55, 59, 62], bass: 43, rootPc: 7, name: 'G' };
    expect(handsForSetting([triad], { ...DEFAULT_PLAYER_SETTINGS, hands: 'root' })[0].hand)
      .toEqual([55, 59, 62]);
    // Guide tones are two notes by definition; nothing is added.
    const guide = { hand: [59, 65], bass: 43, rootPc: 7, name: 'G7' };
    expect(handsForSetting([guide], { ...DEFAULT_PLAYER_SETTINGS, hands: 'root' })[0].hand)
      .toEqual([59, 65]);
  });

  it('reads the retired "one" as Root in the right hand', () => {
    expect(handsFrom('one')).toBe('root');
    expect(handsFrom('both')).toBe('rootless');
    expect(handsFrom(undefined)).toBe('rootless');
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

/**
 * The app's one broken mode.
 *
 * =====================================================================
 * BROKEN IS A SCHEDULE, NOT A DIFFERENT CHORD.
 *
 * Silas's ruling of 10 Sep 2026 collapsed three broken modes into one —
 * chord recognition's up and down, and the harmonic diary's ascending
 * and descending arpeggio. What is left rolls UP, three quarters of a
 * beat between onsets, and that is the whole of the difference: the
 * same notes, in the same order, at the same volumes, through the same
 * sequencer.
 *
 * The thing worth pinning is that the roll does not RE-ORDER anything,
 * because the surface that most needs broken is the one where the
 * bottom note is the answer.
 * =====================================================================
 */
describe('broken rolls the chord and changes nothing else', () => {
  const chord = {
    name: 'Cmaj7', rootPc: 0, bass: 36, hand: [60, 64, 67, 71],
  };
  const blocked = DEFAULT_PLAYER_SETTINGS;
  const broken = { ...DEFAULT_PLAYER_SETTINGS, attack: 'broken' as const };

  it('carries a roll only when broken is chosen', () => {
    expect(chordStep(chord, blocked, 2).roll).toBeUndefined();
    expect(chordStep(chord, broken, 2).roll).toBe(BROKEN_STEP_BEATS);
  });

  it('plays the same notes in the same order either way', () => {
    // THE POINT, for chord recognition: the inversion is the question,
    // so a roll that sorted or reversed would be re-voicing it.
    expect(chordStep(chord, broken, 2).intervals)
      .toEqual(chordStep(chord, blocked, 2).intervals);
    expect(chordStep(chord, broken, 2).hands)
      .toEqual(chordStep(chord, blocked, 2).hands);
  });

  it('gives the roll room to finish, and leaves a blocked chord alone', () => {
    // Five sounding notes — the bass and four in the hand — is 3.75
    // beats of rolling, which will not fit in the two a panel chord
    // gets. A blocked chord keeps its two.
    expect(stepBeats(chord, blocked, 2)).toBe(2);
    expect(stepBeats(chord, broken, 2)).toBeCloseTo(5 * BROKEN_STEP_BEATS, 10);
  });

  it('never shortens a chord that was already long enough', () => {
    // A two-note shape rolls in 1.5 beats and still gets its two.
    const two = { name: 'C5', rootPc: 0, bass: null, hand: [60, 67] };
    expect(stepBeats(two, broken, 2)).toBe(2);
  });

  it('lets Pause measure the sequence it actually plays', () => {
    // THE BUG THIS PREVENTS: `panelBeats` counted two beats a chord
    // while the player gave a rolled one nearly four, so Resume would
    // pick up from a point the sequence had not reached.
    const chords = [chord, chord];
    const summed = chords
      .reduce((n, c) => n + stepBeats(c, broken, 2), 0);
    expect(panelBeats(chords, { settings: broken })).toBe(summed);
    expect(panelBeats(chords, { settings: blocked })).toBe(4);
  });
});

/**
 * The Bass row, and the law underneath it.
 *
 * =====================================================================
 * FORWARD MOVES THE WHOLE LINE OR NONE OF IT.
 *
 * Silas's ruling of 10 Sep 2026, and the "whole line" is the
 * load-bearing half. The bass rule chooses where each root goes
 * RELATIVE to the one before it — up a fourth here, down a fifth there.
 * Drop one note of that line and not another and you have replaced the
 * move it chose with a different one, which is the one thing a
 * loudness control must not do.
 *
 * AND THE LIT KEYS ARE THE SOUNDING KEYS. A bass that drops an octave
 * lights an octave lower, or the board is teaching the wrong note.
 * =====================================================================
 */
describe('the bass level', () => {
  const forward = DEFAULT_PLAYER_SETTINGS;
  const blended = { ...DEFAULT_PLAYER_SETTINGS, bass: 'blended' as const };

  /** A line whose lowest bass has room to fall. */
  const roomy = [
    { name: 'F', rootPc: 5, bass: 53, hand: [60, 64, 69] },
    { name: 'C', rootPc: 0, bass: 48, hand: [60, 64, 67] },
  ];
  /** A line whose lowest bass is already on the board's floor. */
  const low = [
    { name: 'C', rootPc: 0, bass: 48, hand: [60, 64, 67] },
    { name: 'F', rootPc: 5, bass: 41, hand: [60, 65, 69] },
  ];

  it('opens on Forward, because the bass is what a progression is doing', () => {
    expect(DEFAULT_PLAYER_SETTINGS.bass).toBe('forward');
  });

  it('drops the whole line an octave where there is room', () => {
    expect(bassDrop(roomy, forward)).toBe(-12);
    expect(soundingNotes(roomy[0], forward, -12).notes[0]).toBe(41);
    expect(soundingNotes(roomy[1], forward, -12).notes[0]).toBe(36);
  });

  it('drops none of it when one note of the line would fall off the board', () => {
    // THE WHOLE POINT. 41 - 12 is 29, below the four-octave board, so
    // the line stays where it is rather than moving the notes that can
    // and leaving the one that cannot.
    expect(bassDrop(low, forward)).toBe(0);
  });

  it('does not move a blended line at all', () => {
    expect(bassDrop(roomy, blended)).toBe(0);
    expect(soundingNotes(roomy[0], blended).notes[0]).toBe(53);
  });

  it('moves the bass and nothing else', () => {
    // A bass control that lifted the hand would be a second octave
    // control wearing this one's clothes.
    const dropped = soundingNotes(roomy[0], forward, -12);
    const level = soundingNotes(roomy[0], blended);
    expect(dropped.notes.slice(1)).toEqual(level.notes.slice(1));
  });

  it('drops only the bass under Root in the right hand too', () => {
    const rooted = handsForSetting(roomy, { ...forward, hands: 'root' });
    const dropped = soundingNotes(rooted[0], forward, -12);
    const level = soundingNotes(rooted[0], blended, 0);
    expect(dropped.notes.slice(1)).toEqual(level.notes.slice(1));
    expect(dropped.notes[0]).toBe(level.notes[0] - 12);
  });

  it('lights the key it actually sounds', () => {
    // THE LAW, and the reason `playerMarks` takes the drop at all: the
    // board would otherwise paint the bass an octave above where it is
    // heard, and teach the wrong note.
    const lit = [...playerMarks(roomy[0], forward, -12).keys()];
    expect(lit).toContain(41);
    expect(lit).not.toContain(53);
    expect([...playerMarks(roomy[0], blended, 0).keys()]).toContain(53);
  });
});
