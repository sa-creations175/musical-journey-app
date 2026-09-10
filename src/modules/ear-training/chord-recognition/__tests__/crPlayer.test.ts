/**
 * The chord recognition surface never re-voices, and this is that.
 *
 * =====================================================================
 * THE INVERSION IS THE ANSWER, SO NOTHING MAY MOVE A NOTE.
 *
 * The shared player voice-leads everywhere else; here it must not. What
 * the panel's settings are allowed to do is a short list, and every one
 * of them is checked against the same claim: the bottom note is still
 * the note the inversion is named for.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { crChords, crQuizChord } from '../crPlayer';
import { DEFAULT_PLAYER_SETTINGS } from '../../../../lib/player/settings';
import type { ChordData } from '../../../../lib/db';

/** A C major seventh, as the catalog stores one. */
const MAJ7 = {
  id: 'maj7', name: 'Major 7', intervals: [0, 4, 7, 11], tier: 3,
} as unknown as ChordData;
/** A plain major triad. */
const TRIAD = {
  id: 'maj', name: 'Major', intervals: [0, 4, 7], tier: 1,
} as unknown as ChordData;

const S = DEFAULT_PLAYER_SETTINGS;
const ROOT = 60;

describe('the chord sounds exactly as stored', () => {
  it('plays root position as the stored intervals', () => {
    expect(crQuizChord(MAJ7, ROOT, 0, S)).toEqual([60, 64, 67, 71]);
  });

  it('rotates for the asked inversion and nothing else', () => {
    // 1st inversion puts the 3rd at the bottom; the root goes up an
    // octave. Nothing is measured against a previous chord and nothing
    // is dragged into the middle of the board.
    expect(crQuizChord(MAJ7, ROOT, 1, S)).toEqual([64, 67, 71, 72]);
    expect(crQuizChord(MAJ7, ROOT, 2, S)).toEqual([67, 71, 72, 76]);
    expect(crQuizChord(MAJ7, ROOT, 3, S)).toEqual([71, 72, 76, 79]);
  });

  it('keeps the inversion under every setting the panel offers', () => {
    for (const inversion of [0, 1, 2, 3] as const) {
      const asked = crQuizChord(MAJ7, ROOT, inversion, S);
      const bottomPc = asked[0] % 12;
      for (const settings of [
        { ...S, octaveUp: true },
        { ...S, hands: 'one' as const },
        { ...S, colours: 'plain' as const },
      ]) {
        const played = crQuizChord(MAJ7, ROOT, inversion, settings);
        expect(played[0] % 12, `inversion ${inversion}`).toBe(bottomPc);
        expect([...played].sort((a, b) => a - b)).toEqual(played);
      }
    }
  });
});

describe('the three things a setting may do', () => {
  it('lifts the whole chord or none of it', () => {
    expect(crQuizChord(MAJ7, ROOT, 0, { ...S, octaveUp: true }))
      .toEqual([72, 76, 79, 83]);
    // A chord already near the top of the board stays where it is
    // rather than half of it moving.
    const high = crQuizChord(MAJ7, 76, 0, { ...S, octaveUp: true });
    expect(high).toEqual(crQuizChord(MAJ7, 76, 0, S));
  });

  it('plays the bottom note alone for bass only', () => {
    expect(crQuizChord(MAJ7, ROOT, 1, { ...S, listen: 'bass' })).toEqual([64]);
  });

  it('thins by dropping notes, never by moving them', () => {
    const seventh = crQuizChord(MAJ7, ROOT, 1, S, 'seventh');
    const triad = crQuizChord(MAJ7, ROOT, 1, S, 'triads');
    const guide = crQuizChord(MAJ7, ROOT, 1, S, 'guide');
    // Every note of a thinner rung is a note of the thicker one.
    for (const m of triad) expect(seventh).toContain(m);
    for (const m of guide) expect(seventh).toContain(m);
    expect(guide).toHaveLength(2);
    // AND THE BOTTOM NOTE IS STILL THE 3RD, which is what makes it a
    // first inversion. Thinning a chord must not answer the question.
    expect(triad[0] % 12).toBe(seventh[0] % 12);
  });

  it('leaves a triad alone — a triad is what it is', () => {
    const root = crQuizChord(TRIAD, ROOT, 0, S, 'triads');
    expect(root).toEqual([60, 64, 67]);
    // No seventh to thin to, so the guide rung gives the chord back
    // rather than two notes that are not its guide tones.
    expect(crQuizChord(TRIAD, ROOT, 0, S, 'guide')).toEqual(root);
  });
});

describe('the panel is handed one chord and no bass line', () => {
  it('puts nothing under the chord', () => {
    const [chord] = crChords(MAJ7, ROOT, 1, S, 'Cmaj7 · 1st inversion');
    expect(chord.bass).toBeNull();
    expect(chord.hand).toEqual([64, 67, 71, 72]);
    expect(chord.rootPc).toBe(0);
    expect(chord.name).toBe('Cmaj7 · 1st inversion');
  });
});
