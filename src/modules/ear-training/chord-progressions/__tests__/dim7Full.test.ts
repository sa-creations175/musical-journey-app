/**
 * A dim7 at Full Voicing is its four notes and nothing else.
 *
 * Silas, 10 Sep 2026: "It's F♯ A C E♭. You can't add anything to it."
 * Every Chord Motion card with the ♯4°7 on it, at Full Voicing, in every
 * key, with every hands / lift / bass setting, is scheduled and its
 * sounding pitch classes checked against the chord's own four.
 */
import { describe, expect, it } from 'vitest';
import { chordStep, placeBass } from '../../../../lib/player/voices';
import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from '../../../../lib/player/settings';
import { handTones } from '../../../../lib/builtAnswers/chordShapes';
import { ALL_MOTIONS, motionId } from '../chordMotionPool';
import { motionChords } from '../motionChords';

const SETTINGS: PlayerSettings[] = [];
for (const bass of ['forward', 'blended'] as const) {
  for (const hands of ['rootless', 'root'] as const) {
    for (const octaveUp of [false, true]) {
      SETTINGS.push({ ...DEFAULT_PLAYER_SETTINGS, bass, hands, octaveUp });
    }
  }
}

describe('a dim7 at Full Voicing', () => {
  it('is its own four notes in the hand, no 9th', () => {
    expect(handTones('dim7', 'full')).toEqual([3, 6, 9, 12]);
  });

  it('sounds only the chord’s pitch classes, on every dim7 card', () => {
    const cards = ALL_MOTIONS.filter(m => m.startLabel === '#4dim7' || m.destLabel === '#4dim7');
    // Guard the guard: there are dim7 cards to check, both ways.
    expect(cards.length).toBeGreaterThan(20);
    let checked = 0;
    for (let key = 0; key < 12; key++) {
      for (const m of cards) {
        const { chords } = motionChords(key, m.startLabel, m.destLabel, 'full', 'flat', m.direction);
        const i = m.destLabel === '#4dim7' ? 1 : 0;
        const root = chords[i].rootPc;
        const allowed = new Set([0, 3, 6, 9].map(iv => (root + iv) % 12));
        for (const settings of SETTINGS) {
          const step = chordStep(placeBass(chords, settings)[i], settings, 2);
          for (const midi of step.intervals) {
            expect(allowed.has(((midi % 12) + 12) % 12), `${key} ${motionId(m)}`).toBe(true);
          }
          checked += 1;
        }
      }
    }
    expect(checked).toBe(12 * cards.length * SETTINGS.length);
  });
});
