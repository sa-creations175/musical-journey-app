/**
 * A voicing carried from one chord to another by chord tone.
 *
 * =====================================================================
 * THE CLAIM: pasting a C voicing onto A minor comes out MINOR, with
 * nothing to fix.
 *
 * Ruling 13, and the two rejected alternatives are what the assertions
 * are really against — exact keys would give a C major chord on a minor
 * placement, and a plain semitone shape would keep the major third over
 * the minor chord. Both sound fine and are the wrong chord, which is
 * the only kind of wrong worth writing a test file about.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { copyVoicing, pasteVoicing } from '../voicingClipboard';
import type { VoicingEntry } from '../db';

const L = (offset: number): VoicingEntry => ({ offset, hand: 'L' });
const R = (offset: number): VoicingEntry => ({ offset, hand: 'R' });

/** The prototype's C shape: bass an octave down, the rest above. */
const C_SHAPE = [L(-12), R(4), R(7), R(12)];

describe('paste rebuilds the roles on the target quality', () => {
  it('a major shape pasted onto a minor chord comes out minor', () => {
    const pasted = pasteVoicing(copyVoicing(C_SHAPE, ''), 'm');
    // The third moved 4 → 3. Everything else is where it was.
    expect(pasted).toEqual([L(-12), R(3), R(7), R(12)]);
  });

  it('and back again, unchanged', () => {
    const there = pasteVoicing(copyVoicing(C_SHAPE, ''), 'm');
    const back = pasteVoicing(copyVoicing(there, 'm'), '');
    expect(back).toEqual(C_SHAPE);
  });

  it('a seventh becomes the target’s own seventh', () => {
    // maj7 [0,4,7,11] → m7 [0,3,7,10]: the third and the seventh both
    // move, by different amounts, which a semitone shape could not do.
    const maj7 = [R(0), R(4), R(7), R(11)];
    expect(pasteVoicing(copyVoicing(maj7, 'maj7'), 'm7'))
      .toEqual([R(0), R(3), R(7), R(10)]);
  });

  it('keeps the hand each note was played with', () => {
    const pasted = pasteVoicing(copyVoicing(C_SHAPE, ''), 'm');
    expect(pasted.map(e => e.hand)).toEqual(['L', 'R', 'R', 'R']);
  });
});

describe('what survives the round trip unchanged', () => {
  it('a bass note below the root stays below it', () => {
    // THE ONE THAT WOULD BE WRONG INVISIBLY. `Math.trunc` on -12 gives
    // octave 0 and puts the walk-up's bass note inside the chord.
    expect(pasteVoicing(copyVoicing([L(-12)], ''), 'm')).toEqual([L(-12)]);
    expect(pasteVoicing(copyVoicing([L(-5)], ''), 'm')).toEqual([L(-5)]);
    expect(pasteVoicing(copyVoicing([L(-24)], ''), 'm')).toEqual([L(-24)]);
  });

  it('a note that is not a chord tone keeps its own pitch class', () => {
    // A colour someone pressed on purpose. It has no role to become, so
    // it arrives as itself rather than being dropped — the voicing
    // comes over whole and the reader can see what it did.
    const withColour = [R(0), R(4), R(7), R(2)];
    expect(pasteVoicing(copyVoicing(withColour, ''), 'm'))
      .toEqual([R(0), R(3), R(7), R(2)]);
  });

  it('an extension with no counterpart keeps its own pitch class', () => {
    // The honest limit of a positional role model: a min9's ninth has
    // no fifth entry to land on in a plain minor triad.
    const min9 = [R(0), R(3), R(7), R(10), R(14)];
    const onTriad = pasteVoicing(copyVoicing(min9, 'm9'), 'm');
    expect(onTriad).toHaveLength(5);
    expect(onTriad[4]).toEqual(R(14));
  });

  it('an unknown quality still pastes, because the bridge never fails', () => {
    const pasted = pasteVoicing(copyVoicing(C_SHAPE, ''), 'wat?');
    expect(pasted).toHaveLength(C_SHAPE.length);
  });
});

describe('what was copied says where it came from', () => {
  it('records the roles it found, and the quality it found them in', () => {
    const copied = copyVoicing(C_SHAPE, '');
    expect(copied.fromQuality).toBe('');
    // root, third, fifth, root-an-octave-up.
    expect(copied.tones.map(t => t.role)).toEqual([0, 1, 2, 0]);
    expect(copied.tones.map(t => t.octave)).toEqual([-12, 0, 0, 12]);
  });
});
