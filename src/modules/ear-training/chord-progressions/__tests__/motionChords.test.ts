/**
 * A chord motion, voiced by the shared player's own rules.
 *
 * =====================================================================
 * "NO OCTAVE CROSSING" RETIRES, AND THIS IS WHAT REPLACES IT.
 *
 * Chord Motion placed both chords in root position from their own
 * degree and forbade the second from crossing the first — a rule of its
 * own, in place of the voice leading every other surface uses. Silas's
 * ruling of 10 Sep 2026: the shared player voices them, and whichever
 * inversion falls out of nearest voicing is the inversion.
 *
 * What these pin is that the two chords share ONE rule with the Full
 * Progression card — the bass line by the app's bass rule, a rootless
 * right hand, the second chord nearest to the first.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { motionChords } from '../motionChords';
import { bassLine } from '../../../../lib/builtAnswers/voiceLeading';

describe('the two chords', () => {
  it('roots them on the degrees the motion names, in the key', () => {
    // 1 → 4 in the key of F: F and B♭.
    const { rootPcs } = motionChords(5, '1', '4', 'seventh');
    expect(rootPcs).toEqual([5, 10]);
  });

  it('names each chord by its own quality', () => {
    // The 2 of a major key is minor, the 5 is dominant, the 7 is
    // half-diminished — the motion pool's own table.
    expect(motionChords(0, '2', '5', 'seventh').chords.map(c => c.name))
      .toEqual(['Dm7', 'G7']);
    // At the app's default spelling the half-diminished is ø7.
    expect(motionChords(0, '7', '1', 'seventh').chords.map(c => c.name))
      .toEqual(['Bø7', 'Cmaj7']);
  });

  it('takes its bass line from the app\'s bass rule, not its own', () => {
    // THE RULE THAT REPLACED "no octave crossing". Read off `bassLine`
    // rather than written down here, so the two cannot drift.
    const { chords, rootPcs } = motionChords(0, '1', '4', 'seventh');
    expect(chords.map(c => c.bass)).toEqual(bassLine(rootPcs, []));
  });

  it('voices the second chord nearest to the first', () => {
    // The hands move as little as they can. Any chord of a major key
    // shares tones with its neighbours, so the second hand is never a
    // whole octave away from the first.
    const { chords } = motionChords(0, '1', '5', 'seventh');
    const [a, b] = chords.map(c => c.hand);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(Math.abs(b[0] - a[0])).toBeLessThan(12);
  });

  it('keeps the right hand rootless, with the root in the bass', () => {
    const { chords, rootPcs } = motionChords(0, '2', '5', 'seventh');
    chords.forEach((c, i) => {
      expect(c.bass! % 12, c.name).toBe(rootPcs[i]);
      expect(c.hand.map(m => m % 12), c.name).not.toContain(rootPcs[i]);
    });
  });

  it('thins and thickens with the ladder, and keeps its bass', () => {
    const rungs = (['guide', 'seventh', 'full'] as const)
      .map(r => motionChords(0, '1', '4', r).chords);
    // Guide tones are two notes; the rungs above add to them.
    expect(rungs[0][0].hand.length).toBe(2);
    expect(rungs[1][0].hand.length).toBeGreaterThan(rungs[0][0].hand.length);
    for (const chords of rungs) {
      for (const c of chords) expect(c.bass).not.toBeNull();
    }
  });

  it('crosses where the nearest voicing says to, which is the point', () => {
    // A motion that used to be forbidden: the old rule kept the second
    // chord's hand strictly above or below the first. Nearest voicing
    // has no such rule, and the two hands may sit in the same octave.
    const { chords } = motionChords(0, '1', '7', 'seventh');
    const [a, b] = chords.map(c => c.hand);
    const overlap = a.some(x => b.some(y => Math.abs(x - y) < 12));
    expect(overlap).toBe(true);
  });
});
