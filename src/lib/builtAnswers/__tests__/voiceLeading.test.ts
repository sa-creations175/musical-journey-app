/**
 * Chords that move as little as possible, and a bass that walks.
 *
 * =====================================================================
 * THE CLAIMS HERE ARE ABOUT SOUND, AND NONE OF THEM IS VISIBLE.
 *
 * A voicing that is legal but badly placed sounds wrong and looks fine:
 * the keyboard lights the notes it was given. So the window, the
 * direction of the bass and the "as little as possible" itself are
 * asserted as arithmetic, where they can be read.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  BASS_CEILING, BASS_FLOOR, CEILING, FLOOR,
  allVoicings, bassLine, nearest, stack, voiceAll, voicingDistance, voicingsOf,
} from '../voiceLeading';
import { CHORD_INTERVALS, handTones } from '../chordShapes';

/** A chord's pitch classes, as the voicer takes them. */
const pcsOf = (rootPc: number, q: Parameters<typeof handTones>[0], mode: Parameters<typeof handTones>[1]) =>
  handTones(q, mode).map(t => (rootPc + t) % 12);

describe('stacking upward', () => {
  it('puts each note above the last', () => {
    expect(stack([0, 4, 7], 60)).toEqual([60, 64, 67]);
    // The fifth of F is C, whose pitch class is BELOW F's. It still
    // sounds above it.
    expect(stack([5, 9, 0], 53)).toEqual([53, 57, 60]);
  });

  it('pushes a repeated pitch class a whole octave, never doubling in place', () => {
    expect(stack([0, 0], 60)).toEqual([60, 72]);
  });

  it('reaches a ninth as a ninth', () => {
    // 14 semitones above the root arrives as pitch class 2, an octave
    // and a tone up — not as the 2 underneath the third.
    const v = stack([0, 4, 7, 10, 2], 48);
    expect(v).toEqual([48, 52, 55, 58, 62]);
    expect(v[4] - v[0]).toBe(14);
  });
});

describe('the window the hand plays in', () => {
  it('offers only voicings inside it', () => {
    for (const v of allVoicings([0, 4, 7])) {
      expect(v[0]).toBeGreaterThanOrEqual(FLOOR);
      expect(v[v.length - 1]).toBeLessThanOrEqual(CEILING);
    }
  });

  it('widens downward rather than returning nothing', () => {
    // A ninth chord spans 14 semitones, so C9 in root position has no
    // placement between the floor and the ceiling: 60 would top out at
    // 74. It drops to 48 rather than drawing nothing.
    const c9 = handTones('9', 'one').map(t => t % 12);
    const v = voicingsOf(c9, 0);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0][0]).toBe(48);
    expect(v[0][v[0].length - 1]).toBeLessThanOrEqual(CEILING);
  });

  it('lets another inversion answer where no placement of one does', () => {
    // B9 fits nowhere in root position, at either floor. Some
    // inversion of it does, and that is what `nearest` reaches for.
    const b9 = handTones('9', 'one').map(t => (11 + t) % 12);
    expect(voicingsOf(b9, 0)).toEqual([]);
    expect(allVoicings(b9).length).toBeGreaterThan(0);
    expect(nearest(b9, [60, 64, 67]).length).toBe(b9.length);
  });

  it('rotates the inversion, and clamps one a triad does not have', () => {
    const root = voicingsOf([0, 4, 7], 0)[0];
    const first = voicingsOf([0, 4, 7], 1)[0];
    expect(root[0] % 12).toBe(0);
    expect(first[0] % 12).toBe(4);
    // A triad has no 3rd inversion; asking for one gives the last it
    // has rather than nothing.
    expect(voicingsOf([0, 4, 7], 3)[0][0] % 12).toBe(7);
  });
});

describe('distance is measured both ways', () => {
  it('does not let a small chord hide inside a big one', () => {
    // Every note of [60,64,67] is IN [60,64,67,71], so the one-way
    // distance is zero. Measured both ways the extra note counts.
    const oneWay = [60, 64, 67].reduce(
      (d, m) => d + Math.min(...[60, 64, 67, 71].map(p => Math.abs(p - m))), 0,
    );
    expect(oneWay).toBe(0);
    expect(voicingDistance([60, 64, 67], [60, 64, 67, 71])).toBeGreaterThan(0);
  });

  it('is zero only for the same notes', () => {
    expect(voicingDistance([60, 64, 67], [60, 64, 67])).toBe(0);
  });
});

describe('the nearest voicing is nearer than the same inversion', () => {
  it('finds the F7 closest to a Cm7, whichever inversion that is', () => {
    // The 2 5 1 in the key of B♭ major: Cm7 then F7.
    const cm7 = voicingsOf(pcsOf(0, 'm7', 'one'), 0)[0];
    const f7 = nearest(pcsOf(5, '7', 'one'), cm7);
    const rootPosition = voicingsOf(pcsOf(5, '7', 'one'), 0)[0];
    expect(voicingDistance(f7, cm7))
      .toBeLessThanOrEqual(voicingDistance(rootPosition, cm7));
    // And it really moves a short way: no voice travels more than a
    // major third.
    for (const m of f7) {
      expect(Math.min(...cm7.map(p => Math.abs(p - m)))).toBeLessThanOrEqual(4);
    }
  });

  it('keeps the hand in the window across a whole progression', () => {
    // Four chords is where a transposing voice-leader walks off the
    // bottom of the board.
    const chords = [0, 7, 9, 5].map(pc => ({
      rootPc: pc, tones: handTones('m7', 'one'),
    }));
    for (const v of voiceAll(chords, { bass: true })) {
      expect(v!.hand[0]).toBeGreaterThanOrEqual(48);
      expect(v!.hand[v!.hand.length - 1]).toBeLessThanOrEqual(CEILING);
    }
  });
});

describe('the bass walks by step or by octave', () => {
  it('goes up to the next root above, and down to the next below', () => {
    const up = bassLine([0, 7], ['up']);
    const down = bassLine([0, 7], ['down']);
    expect(up[1]! - up[0]!).toBe(7);
    expect(down[1]! - down[0]!).toBe(-5);
  });

  it('moves a whole octave rather than standing still', () => {
    // Tapping a move must always do something audible.
    const up = bassLine([0, 0], ['up']);
    expect(up[1]! - up[0]!).toBe(12);
    const down = bassLine([0, 0], ['down']);
    expect(down[1]! - down[0]!).toBe(-12);
  });

  it('never moves by anything but the interval between the roots', () => {
    // The failure this guards: a line "adjusted to fit" by a fifth.
    const roots = [0, 2, 7, 0];
    const line = bassLine(roots, ['up', 'down', 'up']).map(m => m!);
    for (let i = 1; i < line.length; i += 1) {
      const moved = Math.abs(line[i] - line[i - 1]) % 12;
      const wanted = Math.abs(((roots[i] - roots[i - 1]) % 12 + 12) % 12);
      expect([wanted, (12 - wanted) % 12]).toContain(moved);
    }
  });

  it('shifts the whole line into the bass register, by octaves', () => {
    const line = bassLine([0, 7, 2, 9, 4, 11], ['up', 'up', 'up', 'up', 'up'])
      .map(m => m!);
    expect(Math.min(...line)).toBeGreaterThanOrEqual(BASS_FLOOR);
    // Shifted as a block: every interval is unchanged.
    const raw = [0];
    for (const step of [7, 7, 7, 7, 7]) raw.push(raw[raw.length - 1] + step);
    const deltas = line.map((m, i) => (i === 0 ? 0 : m - line[i - 1]));
    expect(deltas.slice(1)).toEqual([7, 7, 7, 7, 7]);
    expect(Math.max(...line)).toBeLessThanOrEqual(BASS_CEILING + 12);
  });
});

describe('a whole progression, voiced', () => {
  it('gives the first chord the layout that was chosen and voice-leads the rest', () => {
    const chords = [0, 5].map(pc => ({ rootPc: pc, tones: handTones('', 'one') }));
    const rooted = voiceAll(chords, { bass: false, inversion: 0 });
    const second = voiceAll(chords, { bass: false, inversion: 1 });
    expect(rooted[0]!.hand[0] % 12).toBe(0);
    expect(second[0]!.hand[0] % 12).toBe(4);
    // And the second chord followed each of them somewhere different.
    expect(second[1]!.hand).not.toEqual(rooted[1]!.hand);
  });

  it('draws what there is when a chord has not been built', () => {
    const out = voiceAll(
      [{ rootPc: 0, tones: handTones('', 'one') }, null],
      { bass: true },
    );
    expect(out[0]).not.toBeNull();
    expect(out[1]).toBeNull();
  });

  it('puts the root in the bass for every layout but one hand', () => {
    const chords = [{ rootPc: 0, tones: handTones('m7', 'one') }];
    expect(voiceAll(chords, { bass: false })[0]!.bass).toBeNull();
    // A C STARTS AN OCTAVE UP FROM THE FLOOR. The line's first note
    // takes the bottom octave only from A♭ upward — below that it opens
    // an octave higher, so a walk downward has somewhere to go and the
    // opening note is not so low it disappears. Silas's shared-player
    // prototype, 10 Sep 2026.
    expect(voiceAll(chords, { bass: true })[0]!.bass).toBe(BASS_FLOOR + 12);
  });

  it('plays a bass-only rung as a bass and no hand at all', () => {
    const chords = [{ rootPc: 0, tones: handTones('maj7', 'bass') }];
    const v = voiceAll(chords, { bass: true })[0]!;
    expect(v.hand).toEqual([]);
    expect(v.bass).toBe(BASS_FLOOR + 12);
  });
});

describe('the thickness ladder adds one note at a time', () => {
  it('never invents a ninth on a triad', () => {
    // "Full voicing" on a plain major has no seventh to build on, so it
    // stacks the octave. Rootless is the triad itself for the same
    // reason: there is nothing to leave out.
    expect(handTones('', 'full')).toEqual([4, 7, 12]);
    expect(handTones('', 'rootless')).toEqual(CHORD_INTERVALS['']);
    expect(handTones('maj7', 'full')).toEqual([4, 7, 11, 14]);
  });

  it('climbs from two notes to four', () => {
    expect(handTones('m7', 'guide')).toHaveLength(2);
    expect(handTones('m7', 'seventh')).toHaveLength(3);
    expect(handTones('m7', 'full')).toHaveLength(4);
    expect(handTones('m7', 'triads')).toEqual([0, 3, 7]);
    expect(handTones('m7', 'bass')).toEqual([]);
  });

  it('takes the 3 and the 7 for guide tones, and the 3 and 5 on a triad', () => {
    expect(handTones('7', 'guide')).toEqual([4, 10]);
    expect(handTones('', 'guide')).toEqual([4, 7]);
  });
});
