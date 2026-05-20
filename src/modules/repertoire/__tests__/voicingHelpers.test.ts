import { describe, expect, it } from 'vitest';
import {
  chordRootNote,
  degreeColor,
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

  it('round-trips through semitonesFromRoot', () => {
    const root = 'C';
    const offsets = [0, 3, 7, 10]; // m7
    const names = notesFromVoicing(root, offsets);
    expect(semitonesFromRoot(root, names)).toEqual(offsets);
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
