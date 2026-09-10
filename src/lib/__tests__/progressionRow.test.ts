/**
 * One formatter, and the five rows Silas wrote out.
 *
 * =====================================================================
 * THE RULING GAVE FIVE WORKED EXAMPLES, AND THEY ARE THE TEST.
 *
 * "1 · 5 · 6m · 4, 1 · 6m · 2m · 5, 1 · 4 · 5, 1 · 4 · 7dim · 3m · 6m ·
 * 2m · 5 · 1, 4m · ♭7 · 1" — 10 Sep 2026. Each one is checked against
 * the progression's own chord data, so the formatter is proved against
 * what he wrote rather than against itself.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  CHORD_SEPARATOR, chordInRow, joinRow, progressionRow, qualitySuffix,
} from '../progressionRow';
import { VOICE_LEADING_PATTERN_BY_ID } from '../../modules/shapes-and-patterns/catalog';

const rowOf = (id: string) =>
  progressionRow(VOICE_LEADING_PATTERN_BY_ID.get(id)!.chords);

describe("the five rows Silas wrote out", () => {
  it('writes them exactly', () => {
    expect(rowOf('1-5-6-4')).toBe('1 · 5 · 6m · 4');
    expect(rowOf('1-6-2-5')).toBe('1 · 6m · 2m · 5');
    expect(rowOf('diatonic-cycle'))
      .toBe('1 · 4 · 7dim · 3m · 6m · 2m · 5 · 1');
    expect(rowOf('backdoor')).toBe('4m · ♭7 · 1');
    // THE 1 4 5 ROW RETURNS TO ITS 1, which its chord data has always
    // said. The ruling's own "1 · 4 · 5" is the Harmonic Fluency card's
    // three-chord shape; this row has four.
    expect(rowOf('1-4-5')).toBe('1 · 4 · 5 · 1');
    expect(progressionRow([
      { degree: '1', quality: '' }, { degree: '4', quality: '' },
      { degree: '5', quality: '' },
    ])).toBe('1 · 4 · 5');
  });
});

describe('the quality is the family', () => {
  it('leaves major and dominant bare', () => {
    // What a reader needs from a row is which chords it is made of, not
    // how thick to play them — the thickness is a row of its own.
    for (const q of ['', 'maj7', 'maj9', '7', '9', '7b9', '7#9#5']) {
      expect(qualitySuffix(q), q).toBe('');
    }
  });

  it('marks a minor with m', () => {
    for (const q of ['m', 'm7', 'm9']) expect(qualitySuffix(q), q).toBe('m');
  });

  it('marks a diminished and a half-diminished alike, with dim', () => {
    // Silas's own rendering: the 7 of a major scale is a m7♭5 and the
    // diatonic cycle's row reads "7dim".
    expect(qualitySuffix('dim7')).toBe('dim');
    expect(qualitySuffix('m7b5')).toBe('dim');
  });

  it('shows an unknown quality rather than swallowing it', () => {
    // A chord the app cannot classify reads as odd, which is better
    // than a bare number that says something false.
    expect(qualitySuffix('sus4')).toBe('sus4');
  });

  it('writes a flat degree as a glyph', () => {
    expect(chordInRow({ degree: 'b7', quality: '7' })).toBe('♭7');
    expect(chordInRow({ degree: '#4', quality: '' })).toBe('♯4');
  });
});

describe('the separator', () => {
  it('is a middle dot with a space either side', () => {
    expect(CHORD_SEPARATOR).toBe(' · ');
    expect(joinRow(['C', 'G', 'Am', 'F'])).toBe('C · G · Am · F');
  });

  it('is never a hyphen, an arrow or a bare space', () => {
    const row = joinRow(['C', 'G']);
    expect(row).not.toContain(' - ');
    expect(row).not.toContain(' → ');
    expect(row).not.toBe('C G');
  });
});
