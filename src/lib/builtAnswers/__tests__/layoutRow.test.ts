/**
 * Harmonic Fluency's answer-builder layout row speaks the player's words.
 *
 * Silas's ruling of 10 Sep 2026: Rootless right hand · Root in the right
 * hand · One hand — the shared player's two Hands names, from the same
 * table, plus the builder's own third. Labels and order only.
 */
import { describe, expect, it } from 'vitest';
import { VOICINGS, handTones, hasBass } from '../chordShapes';
import { HANDS_LABEL } from '../../player/settings';

describe('the layout row', () => {
  it('reads Rootless right hand · Root in the right hand · One hand', () => {
    expect(VOICINGS.map(v => v.label)).toEqual([
      'Rootless right hand', 'Root in the right hand', 'One hand',
    ]);
  });

  it('uses the shared player’s own two names, not a copy of them', () => {
    expect(VOICINGS.find(v => v.id === 'rootless')!.label).toBe(HANDS_LABEL.rootless);
    expect(VOICINGS.find(v => v.id === 'both')!.label).toBe(HANDS_LABEL.root);
  });

  it('keeps its ids, and each still means what its name says', () => {
    expect(VOICINGS.map(v => v.id).sort()).toEqual(['both', 'one', 'rootless']);
    // Rootless: a bass, and no root in the hand.
    expect(hasBass('rootless')).toBe(true);
    expect(handTones('maj7', 'rootless')).not.toContain(0);
    // Root in the right hand: a bass, and the root in the hand.
    expect(hasBass('both')).toBe(true);
    expect(handTones('maj7', 'both')).toContain(0);
    // One hand: everything in the right hand, no bass.
    expect(hasBass('one')).toBe(false);
    expect(handTones('maj7', 'one')).toContain(0);
  });
});
