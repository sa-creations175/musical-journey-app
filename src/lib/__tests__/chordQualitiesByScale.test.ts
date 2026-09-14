/**
 * The chart's cells and words, against the decision and the prototype.
 *
 * =====================================================================
 * THE MODES ARE CHECKED AS THE MAJOR ROW SHIFTED, NOT AS A SECOND TABLE.
 *
 * That is what the chart's own heading says they are, and it is a claim
 * a typed-out grid could get wrong in one cell without anyone noticing.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  MAIN_ROWS, MODE_ROWS, SEED_MARKS, cardTitle, cellLabel, exampleLine, inCLabel,
  parseCellKey, seventhOn, whyLine, type ScaleId,
} from '../chordQualitiesByScale';

const row = (scale: ScaleId) => [1, 2, 3, 4, 5, 6, 7].map(d => seventhOn(scale, d).symbol);

describe('the cells', () => {
  it('has major and the three minors as the decision of 13 Sep 2026 writes them', () => {
    expect(row('major')).toEqual(['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'ø']);
    expect(row('natural')).toEqual(['m7', 'ø', 'maj7', 'm7', 'm7', 'maj7', '7']);
    expect(row('harmonic')).toEqual(['mMaj7', 'ø', '+maj7', 'm7', '7', 'maj7', '°7']);
    expect(row('melodic')).toEqual(['mMaj7', 'm7', '+maj7', '7', '7', 'ø', 'ø']);
  });

  it('has every other mode as the major row, shifted along', () => {
    const major = row('major');
    const start: Readonly<Record<string, number>> = {
      dorian: 1, phrygian: 2, lydian: 3, mixolydian: 4, locrian: 6,
    };
    for (const r of MODE_ROWS) {
      const s = start[r.id];
      expect(row(r.id), r.id).toEqual([...major.slice(s), ...major.slice(0, s)]);
    }
    // Natural minor is the same claim from the 6.
    expect(row('natural')).toEqual([...major.slice(5), ...major.slice(0, 5)]);
  });

  it('keeps the prototype\'s rows, in its order', () => {
    expect(MAIN_ROWS.map(r => r.name)).toEqual(['Major', 'Natural minor', 'Harmonic minor', 'Melodic minor']);
    expect(MODE_ROWS.map(r => r.name)).toEqual(['Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian']);
  });
});

describe('the card at the top', () => {
  it('writes the brief\'s own example', () => {
    expect(cardTitle('harmonic', 7)).toBe('In harmonic minor, the 7 chord is diminished 7');
    expect(inCLabel('harmonic')).toBe('In C harmonic minor:');
    expect(exampleLine('harmonic', 7)).toBe('B°7 · B D F A♭');
  });

  it('spells the flat side with flats and major and Lydian with sharps', () => {
    expect(exampleLine('phrygian', 2)).toBe('D♭maj7 · D♭ F A♭ C');
    expect(exampleLine('lydian', 4)).toBe('F♯ø · F♯ A C E');
    expect(exampleLine('major', 5)).toBe('G7 · G B D F');
  });

  it('says what the scale did to make the chord', () => {
    expect(whyLine('harmonic', 7)).toBe('Natural minor has dominant 7 here; raising the 7 turns it into diminished 7.');
    expect(whyLine('melodic', 4)).toBe('Natural minor has minor 7 here; raising the 6 and 7 turns it into dominant 7.');
    expect(whyLine('harmonic', 4)).toBe('Same as natural minor: the raised note is not in this chord.');
    expect(whyLine('dorian', 4)).toBe("Dorian is the major scale started on its 2, so this is major's 5 chord.");
    expect(whyLine('natural', 1)).toBe("Natural minor is the relative major started on its 6, so this is major's 6 chord.");
    expect(whyLine('major', 1)).toBe('');
  });

  it('names a dotted cell the way the list writes it', () => {
    expect(cellLabel('harmonic', 7)).toBe('harmonic minor · 7 · °7');
  });
});

describe('the seed', () => {
  it('is the prototype\'s twenty marks, every one a real cell', () => {
    expect(Object.keys(SEED_MARKS)).toHaveLength(20);
    for (const key of Object.keys(SEED_MARKS)) expect(parseCellKey(key), key).not.toBeNull();
  });
});
