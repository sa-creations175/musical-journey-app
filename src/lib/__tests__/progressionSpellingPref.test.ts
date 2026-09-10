// @vitest-environment jsdom
/**
 * The setting itself — what it opens at, and what it does with a value
 * it does not recognise.
 *
 * =====================================================================
 * A STORED SETTING IS READ BACK FIELD BY FIELD.
 *
 * The row syncs, so a build that adds a fifth control will meet rows
 * written without it, and a build that removes one will meet rows that
 * still have it. Throwing the whole object away on either would reset a
 * reader's choice for a reason they cannot see, so each field falls
 * back on its own.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SPELLING, DEFAULT_PROGRESSION_SPELLING, SEPARATOR_TEXT,
  coerceSpelling,
} from '../progressionSpelling';

describe('what it opens at', () => {
  it('is hyphens, every quality, and the two symbols', () => {
    expect(DEFAULT_PROGRESSION_SPELLING).toEqual({
      separator: 'hyphen',
      qualities: 'all',
      halfDimTriad: '°',
      halfDimSeventh: 'ø',
    });
  });

  it('keeps the answer key on the middle dot, whatever the default is', () => {
    // THEY ARE ALLOWED TO DIFFER AND DO. The key is graded by equality
    // and written to attempt rows; the default is what a reader sees.
    expect(CANONICAL_SPELLING.separator).toBe('dot');
    expect(SEPARATOR_TEXT[CANONICAL_SPELLING.separator]).toBe(' · ');
    expect(DEFAULT_PROGRESSION_SPELLING.separator).toBe('hyphen');
  });
});

describe('reading a stored value back', () => {
  it('takes a whole valid setting as it stands', () => {
    const stored = {
      separator: 'dot', qualities: 'off',
      halfDimTriad: 'dim', halfDimSeventh: 'm7♭5',
    };
    expect(coerceSpelling(stored)).toEqual(stored);
  });

  it('keeps the fields it knows and defaults the ones it does not', () => {
    // A row from a build that spelled a value differently, or one that
    // never had the field: the reader's OTHER choices survive.
    expect(coerceSpelling({ separator: 'space', qualities: 'nonsense' }))
      .toEqual({
        separator: 'space',
        qualities: 'all',
        halfDimTriad: '°',
        halfDimSeventh: 'ø',
      });
  });

  it('reads nothing at all as the defaults', () => {
    for (const junk of [undefined, null, 'hyphen', 42, []]) {
      expect(coerceSpelling(junk)).toEqual(DEFAULT_PROGRESSION_SPELLING);
    }
  });

  it('does not let a triad name into the seventh slot, or the reverse', () => {
    // The two halves are separate controls with separate vocabularies;
    // "2ø" on a triad is a chord the reader is not playing.
    expect(coerceSpelling({ halfDimTriad: 'ø' }).halfDimTriad).toBe('°');
    expect(coerceSpelling({ halfDimSeventh: 'dim' }).halfDimSeventh).toBe('ø');
  });
});
