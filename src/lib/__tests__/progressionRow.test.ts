/**
 * One formatter, and every way Silas can ask it to write a row.
 *
 * =====================================================================
 * THE SPELLING IS A SETTING, SO THE TEST IS A MATRIX.
 *
 * Three separators × three quality modes × two half-diminished names ×
 * two = thirty-six combinations, and the rung doubles the ones a
 * half-diminished appears in. Checking one of them proves nothing about
 * the others, and the way this goes wrong is a combination nobody
 * looked at — "only on spelled loops" with qualities off, say, or the
 * backdoor's borrowed 4 under a mode that drops qualities.
 *
 * So the matrix is walked, and five progressions are walked through it:
 * a bare loop, both 2 5 1s, the backdoor and the diatonic cycle. The
 * defaults are pinned separately, in the exact strings the ruling
 * names.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  CHORD_SEPARATOR, chordInRow, joinRow, progressionRow, qualitySuffix,
  respellRow, separatorFor,
} from '../progressionRow';
import {
  DEFAULT_PROGRESSION_SPELLING, SEPARATOR_TEXT,
  type ChordSeparator, type HalfDimSeventh, type HalfDimTriad,
  type ProgressionSpelling, type QualityDisplay,
} from '../progressionSpelling';
import { ROW_NAME_BY_ID } from '../../modules/shapes-and-patterns/catalog';
import type { Thickness } from '../builtAnswers/chordShapes';

const SEPARATORS: ChordSeparator[] = ['dot', 'hyphen', 'space'];
const QUALITIES: QualityDisplay[] = ['all', 'spelled', 'off'];
const HD_TRIADS: HalfDimTriad[] = ['°', 'dim'];
const HD_SEVENTHS: HalfDimSeventh[] = ['ø', 'm7♭5'];

/** Every combination the four controls can be in. */
function everySetting(): ProgressionSpelling[] {
  const out: ProgressionSpelling[] = [];
  for (const separator of SEPARATORS) {
    for (const qualities of QUALITIES) {
      for (const halfDimTriad of HD_TRIADS) {
        for (const halfDimSeventh of HD_SEVENTHS) {
          out.push({ separator, qualities, halfDimTriad, halfDimSeventh });
        }
      }
    }
  }
  return out;
}

/** One catalog row, written under these settings. */
function rowOf(
  id: string, settings?: ProgressionSpelling, rung?: Thickness,
): string {
  const name = ROW_NAME_BY_ID.get(id)!;
  return progressionRow(name.chords, {
    ...(settings ? { settings } : {}),
    ...(rung ? { rung } : {}),
    named: name.prefix !== '' || name.suffix !== '',
    ...(name.keepQualityAt ? { keepQualityAt: name.keepQualityAt } : {}),
  });
}

const WALKED = ['1-5-6-4', 'major-251', 'minor-251', 'backdoor', 'diatonic-cycle'];

describe('what the app opens at', () => {
  it('is hyphens, every quality, and the two symbols', () => {
    expect(DEFAULT_PROGRESSION_SPELLING).toEqual({
      separator: 'hyphen',
      qualities: 'all',
      halfDimTriad: '°',
      halfDimSeventh: 'ø',
    });
  });

  it('writes the five rows exactly as the ruling names them', () => {
    // SILAS'S OWN SNAPSHOT, 10 Sep 2026.
    expect(rowOf('1-5-6-4')).toBe('1-5-6m-4');
    expect(rowOf('major-251')).toBe('2m-5-1');
    // NO RUNG IS THE TRIAD NAME; the sevenths rung is the other one.
    expect(rowOf('minor-251')).toBe('2°-5-1m');
    expect(rowOf('minor-251', undefined, 'seventh')).toBe('2ø-5-1m');
    expect(rowOf('backdoor')).toBe('4m-♭7-1');
    expect(rowOf('diatonic-cycle')).toBe('1-4-7°-3m-6m-2m-5-1');
  });

  it('names the rows with their words, as the grid draws them', () => {
    // The row LABEL is the name plus the row, and the label takes no
    // rung — it names the row rather than a rung of it.
    const label = (id: string) => {
      const n = ROW_NAME_BY_ID.get(id)!;
      return `${n.prefix}${rowOf(id)}${n.suffix}`;
    };
    expect(label('major-251')).toBe('Major 2m-5-1');
    expect(label('minor-251')).toBe('Minor 2°-5-1m');
    expect(label('backdoor')).toBe('4m-♭7-1 (backdoor)');
    expect(label('diatonic-cycle'))
      .toBe('Diatonic Cycle (1-4-7°-3m-6m-2m-5-1)');
  });
});

describe('the separator', () => {
  it('is whichever one is set, and nothing else', () => {
    for (const separator of SEPARATORS) {
      const settings = { ...DEFAULT_PROGRESSION_SPELLING, separator };
      expect(separatorFor(settings)).toBe(SEPARATOR_TEXT[separator]);
      expect(rowOf('1-5-6-4', settings))
        .toBe(['1', '5', '6m', '4'].join(SEPARATOR_TEXT[separator]));
      expect(joinRow(['C', 'G', 'Am', 'F'], settings))
        .toBe(['C', 'G', 'Am', 'F'].join(SEPARATOR_TEXT[separator]));
    }
  });

  it('is never an arrow, whatever is set', () => {
    // The arrow means RESOLUTION and belongs to the passes.
    for (const settings of everySetting()) {
      for (const id of WALKED) expect(rowOf(id, settings)).not.toContain('→');
    }
  });

  it('keeps the canonical middle dot for the answer key', () => {
    // The Harmonic Fluency deck is baked in this and graded against it;
    // the setting reaches it through `respellRow` at render.
    expect(CHORD_SEPARATOR).toBe(' · ');
    for (const separator of SEPARATORS) {
      const settings = { ...DEFAULT_PROGRESSION_SPELLING, separator };
      expect(respellRow('F · C · Dm · B♭', settings))
        .toBe(['F', 'C', 'Dm', 'B♭'].join(SEPARATOR_TEXT[separator]));
    }
  });
});

describe('which chords show their quality', () => {
  it('shows every one on "all"', () => {
    const settings = { ...DEFAULT_PROGRESSION_SPELLING, qualities: 'all' as const };
    expect(rowOf('1-5-6-4', settings)).toBe('1-5-6m-4');
    expect(rowOf('major-251', settings)).toBe('2m-5-1');
    expect(rowOf('backdoor', settings)).toBe('4m-♭7-1');
  });

  it('shows none on "off", named or not', () => {
    const settings = { ...DEFAULT_PROGRESSION_SPELLING, qualities: 'off' as const };
    expect(rowOf('1-5-6-4', settings)).toBe('1-5-6-4');
    expect(rowOf('major-251', settings)).toBe('2-5-1');
    expect(rowOf('minor-251', settings)).toBe('2-5-1');
    expect(rowOf('diatonic-cycle', settings)).toBe('1-4-7-3-6-2-5-1');
    // THE BACKDOOR'S 4 LOSES ITS m HERE and only here: off means
    // numbers, and a reader who asked for numbers asked for all of them.
    expect(rowOf('backdoor', settings)).toBe('4-♭7-1');
  });

  it('spells a bare loop and leaves a named row to its name', () => {
    const settings = { ...DEFAULT_PROGRESSION_SPELLING, qualities: 'spelled' as const };
    // No name of its own — the qualities are the only thing saying
    // what it is.
    expect(rowOf('1-5-6-4', settings)).toBe('1-5-6m-4');
    expect(rowOf('1-6-2-5', settings)).toBe('1-6m-2m-5');
    // Named — "Major" and "Minor" are already saying it.
    expect(rowOf('major-251', settings)).toBe('2-5-1');
    expect(rowOf('minor-251', settings)).toBe('2-5-1');
    expect(rowOf('diatonic-cycle', settings)).toBe('1-4-7-3-6-2-5-1');
    // EXCEPT THE BACKDOOR'S 4, which is borrowed: a major 4 is not a
    // backdoor, so its m survives a mode that drops the others.
    expect(rowOf('backdoor', settings)).toBe('4m-♭7-1');
  });
});

describe('what a half-diminished is called', () => {
  it('takes the triad name with no rung and on triads', () => {
    for (const halfDimTriad of HD_TRIADS) {
      const settings = { ...DEFAULT_PROGRESSION_SPELLING, halfDimTriad };
      expect(rowOf('minor-251', settings)).toBe(`2${halfDimTriad}-5-1m`);
      expect(rowOf('minor-251', settings, 'triads')).toBe(`2${halfDimTriad}-5-1m`);
      expect(rowOf('diatonic-cycle', settings))
        .toBe(`1-4-7${halfDimTriad}-3m-6m-2m-5-1`);
    }
  });

  it('takes the seventh name on every rung above triads', () => {
    // GUIDE TONES ARE THE 3rd AND THE 7th, so they are a seventh-chord
    // reading like the two rungs above them.
    for (const halfDimSeventh of HD_SEVENTHS) {
      const settings = { ...DEFAULT_PROGRESSION_SPELLING, halfDimSeventh };
      for (const rung of ['guide', 'seventh', 'full'] as const) {
        expect(rowOf('minor-251', settings, rung), rung)
          .toBe(`2${halfDimSeventh}-5-1m`);
        expect(rowOf('diatonic-cycle', settings, rung), rung)
          .toBe(`1-4-7${halfDimSeventh}-3m-6m-2m-5-1`);
      }
    }
  });

  it('leaves every other family alone, on every rung', () => {
    for (const settings of everySetting()) {
      for (const rung of [undefined, 'triads', 'seventh'] as const) {
        const opts = { settings, ...(rung ? { rung } : {}) };
        for (const q of ['', 'maj7', 'maj9', '7', '9', '7b9', '7#9#5']) {
          expect(qualitySuffix(q, opts), q).toBe('');
        }
        for (const q of ['m', 'm7', 'm9']) {
          expect(qualitySuffix(q, opts), q).toBe('m');
        }
      }
    }
  });

  it('shows an unknown quality rather than swallowing it', () => {
    // A chord the app cannot classify reads as odd, which is better
    // than a bare number that says something false.
    expect(qualitySuffix('sus4')).toBe('sus4');
  });

  it('writes a flat degree as a glyph, whatever else is set', () => {
    for (const settings of everySetting()) {
      expect(chordInRow({ degree: 'b7', quality: '7' }, { settings })).toBe('♭7');
      expect(chordInRow({ degree: '#4', quality: '' }, { settings })).toBe('♯4');
    }
  });
});

describe('the whole matrix holds together', () => {
  it('writes every row under every combination without losing a chord', () => {
    // THE SHAPE OF THE ROW IS AN INVARIANT even when its spelling is
    // not: three chords stay three chords under all thirty-six
    // settings and both rungs, which is what catches a separator that
    // eats a chord or a quality that swallows a degree.
    for (const settings of everySetting()) {
      for (const rung of [undefined, 'triads', 'seventh'] as const) {
        for (const id of WALKED) {
          const name = ROW_NAME_BY_ID.get(id)!;
          const text = rowOf(id, settings, rung);
          const sep = SEPARATOR_TEXT[settings.separator];
          expect(text.split(sep), `${id} ${JSON.stringify(settings)} ${rung}`)
            .toHaveLength(name.chords.length);
          expect(text).not.toBe('');
        }
      }
    }
  });

  it('never writes an empty quality suffix into the middle of a row', () => {
    // A separator of a single space and a dropped quality is the
    // combination that could produce "1  5"; it does not.
    for (const settings of everySetting()) {
      for (const id of WALKED) {
        expect(rowOf(id, settings)).not.toContain('  ');
      }
    }
  });
});
