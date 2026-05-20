import { describe, expect, it } from 'vitest';
import {
  chordRootNote,
  degreeColor,
  intervalColor,
  normalizeVoicing,
  notesFromVoicing,
  semitonesFromRoot,
} from '../voicingHelpers';

/**
 * voicingHelpers resolve a chord's concrete root from the song key +
 * scale degree, and convert between note names and the pitch-class
 * semitone offsets stored on ChordPlacement.voicing. The key property
 * is transposition: the SAME offsets must render to the right notes in
 * any key, since that's what lets a voicing follow a key change.
 */
describe('chordRootNote', () => {
  it('resolves degree against a sharp-leaning key', () => {
    // 4 in B major → E.
    expect(chordRootNote('B', '4')).toBe('E');
    // 1 → tonic.
    expect(chordRootNote('B', '1')).toBe('B');
    // 5 in C → G.
    expect(chordRootNote('C', '5')).toBe('G');
  });

  it('spells with flats in flat-leaning keys', () => {
    // 4 in Bb → Eb (not D#).
    expect(chordRootNote('Bb', '4')).toBe('Eb');
    // F major prefers flats.
    expect(chordRootNote('F', '7')).toBe('E');
    expect(chordRootNote('F', '4')).toBe('Bb');
  });

  it('returns empty string for an unknown key or degree', () => {
    expect(chordRootNote('H', '4')).toBe('');
    expect(chordRootNote('B', '9')).toBe('');
    expect(chordRootNote('', '1')).toBe('');
  });
});

describe('semitonesFromRoot', () => {
  it('converts note names to offsets, deduped and sorted', () => {
    // Root-position Emaj7 from root E → [0,4,7,11].
    expect(semitonesFromRoot('E', ['E', 'G#', 'B', 'D#'])).toEqual([0, 4, 7, 11]);
  });

  it('folds octaves and drops duplicates', () => {
    expect(semitonesFromRoot('C', ['C', 'E', 'G', 'E', 'C'])).toEqual([0, 4, 7]);
  });

  it('ignores unrecognised note names', () => {
    expect(semitonesFromRoot('C', ['C', 'wat', 'G'])).toEqual([0, 7]);
  });

  it('returns empty for an unknown root', () => {
    expect(semitonesFromRoot('H', ['C', 'E'])).toEqual([]);
  });
});

describe('notesFromVoicing', () => {
  it('renders offsets back to note names with sharp spelling', () => {
    // Natural root, key prefers sharps → G#/D#.
    expect(notesFromVoicing('E', [0, 4, 7, 11], false)).toEqual([
      'E', 'G#', 'B', 'D#',
    ]);
  });

  it('renders offsets with flats for a flat root', () => {
    // Same maj7 offsets, root Eb → Eb G Bb D (flat default).
    expect(notesFromVoicing('Eb', [0, 4, 7, 11])).toEqual(['Eb', 'G', 'Bb', 'D']);
  });

  it('transposes: identical offsets, different keys', () => {
    // A maj7 voicing [0,4,7,11] entered for 4maj7, spelled per key.
    const rootB = chordRootNote('B', '4'); // E (B prefers sharps)
    const rootBb = chordRootNote('Bb', '4'); // Eb (Bb prefers flats)
    expect(notesFromVoicing(rootB, [0, 4, 7, 11], false)).toEqual([
      'E', 'G#', 'B', 'D#',
    ]);
    expect(notesFromVoicing(rootBb, [0, 4, 7, 11], true)).toEqual([
      'Eb', 'G', 'Bb', 'D',
    ]);
  });

  it('folds octave-aware offsets (0–23) to note names', () => {
    // C root: offset 0 = C, offset 16 (= 4 + 12) = E an octave up → "E".
    expect(notesFromVoicing('C', [0, 16])).toEqual(['C', 'E']);
    // Octave 2 root (offset 12) still spells the root note.
    expect(notesFromVoicing('C', [12])).toEqual(['C']);
  });

  it('round-trips through semitonesFromRoot', () => {
    const root = 'C';
    const offsets = [0, 3, 7, 10]; // m7
    const names = notesFromVoicing(root, offsets);
    expect(semitonesFromRoot(root, names)).toEqual(offsets);
  });
});

describe('intervalColor', () => {
  it('maps each semitone interval to its color', () => {
    expect(intervalColor(0)).toBe('#0F6E56'); // root
    expect(intervalColor(1)).toBe('#E24B4A'); // b2/b9
    expect(intervalColor(2)).toBe('#D4537E'); // maj2/9
    expect(intervalColor(3)).toBe('#5DCAA5'); // min3/#9
    expect(intervalColor(4)).toBe('#97C459'); // maj3
    expect(intervalColor(5)).toBe('#534AB7'); // 4th/11th
    expect(intervalColor(6)).toBe('#E24B4A'); // tritone
    expect(intervalColor(7)).toBe('#888780'); // 5th
    expect(intervalColor(8)).toBe('#185FA5'); // #5/b6
    expect(intervalColor(9)).toBe('#378ADD'); // 6th/13th
    expect(intervalColor(10)).toBe('#BA7517'); // min7/dom7
    expect(intervalColor(11)).toBe('#FAC775'); // maj7
  });

  it('shares a color across enharmonic / octave equivalents', () => {
    // b2 ≡ b9, #4 ≡ b5, #5 ≡ b6, #9 ≡ m3, 4 ≡ 11, 6 ≡ 13 — all by
    // semitone class, so these are inherent to the 0–11 mapping.
    expect(intervalColor(1)).toBe(intervalColor(13)); // b9 wraps to b2
    expect(intervalColor(5)).toBe(intervalColor(17)); // 11th wraps to 4th
    expect(intervalColor(9)).toBe(intervalColor(21)); // 13th wraps to 6th
  });

  it('normalizes out-of-range and negative input', () => {
    expect(intervalColor(12)).toBe('#0F6E56'); // wraps to root
    expect(intervalColor(-1)).toBe('#FAC775'); // wraps to maj7
  });
});

describe('normalizeVoicing', () => {
  it('reads legacy plain-number offsets as right-hand tones', () => {
    expect(normalizeVoicing([0, 4, 7])).toEqual([
      { offset: 0, hand: 'R' },
      { offset: 4, hand: 'R' },
      { offset: 7, hand: 'R' },
    ]);
  });

  it('passes entry objects through unchanged', () => {
    const entries = [
      { offset: 0, hand: 'L' as const },
      { offset: 7, hand: 'R' as const },
    ];
    expect(normalizeVoicing(entries)).toEqual(entries);
  });

  it('handles a mix of legacy numbers and entries', () => {
    expect(normalizeVoicing([0, { offset: 4, hand: 'L' }])).toEqual([
      { offset: 0, hand: 'R' },
      { offset: 4, hand: 'L' },
    ]);
  });

  it('returns [] for undefined', () => {
    expect(normalizeVoicing(undefined)).toEqual([]);
  });
});

describe('degreeColor', () => {
  it('maps each diatonic degree to a hex color', () => {
    expect(degreeColor('1')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(degreeColor('5')).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('strips accidentals before lookup', () => {
    expect(degreeColor('b6')).toBe(degreeColor('6'));
    expect(degreeColor('#4')).toBe(degreeColor('4'));
  });

  it('falls back to neutral for unknown degrees', () => {
    expect(degreeColor('')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(degreeColor('9')).toBe(degreeColor('x'));
  });
});
