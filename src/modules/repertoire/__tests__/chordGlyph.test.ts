import { describe, expect, it } from 'vitest';
import { splitSlashChord } from '../chordGlyph';

/**
 * splitSlashChord is the parser that decides which part of a chord
 * glyph is the bass note (denominator) and which part is the chord
 * above the slash (numerator). It's intentionally simple: split on
 * the first `/`, no music-theory knowledge.
 *
 * Visual hierarchy in the lead sheet hinges on this output, so the
 * contract needs to be precise about edge cases.
 */
describe('splitSlashChord', () => {
  describe('root-position chords (no slash)', () => {
    it('returns the input as numerator and null bass', () => {
      expect(splitSlashChord('5')).toEqual({ numerator: '5', bass: null });
      expect(splitSlashChord('6m')).toEqual({ numerator: '6m', bass: null });
      expect(splitSlashChord('1maj7')).toEqual({ numerator: '1maj7', bass: null });
      expect(splitSlashChord('4#9#5')).toEqual({ numerator: '4#9#5', bass: null });
    });

    it('returns an empty result for empty input', () => {
      expect(splitSlashChord('')).toEqual({ numerator: '', bass: null });
    });
  });

  describe('slash chords', () => {
    it('splits at the first slash', () => {
      expect(splitSlashChord('5/7')).toEqual({ numerator: '5', bass: '7' });
      expect(splitSlashChord('1/3')).toEqual({ numerator: '1', bass: '3' });
      expect(splitSlashChord('4maj7/6')).toEqual({ numerator: '4maj7', bass: '6' });
    });

    it('only splits at the FIRST slash when multiple are present', () => {
      // Documenting the rule: subsequent slashes are part of the bass
      // and stay together. Users typing "5/7/9" get "5" small, "7/9"
      // bold — predictable even if rarely useful musically.
      expect(splitSlashChord('5/7/9')).toEqual({ numerator: '5', bass: '7/9' });
    });

    it('handles a leading slash (empty numerator)', () => {
      // The bare "/" suffix button starts a slash chord; the user
      // may then type a bass note directly. Mid-edit state.
      expect(splitSlashChord('/3')).toEqual({ numerator: '', bass: '3' });
    });

    it('handles a trailing slash (empty bass)', () => {
      // User tapped a number, then a "/", but hasn't typed the bass
      // note yet. Still mid-edit — render the slash + numerator.
      expect(splitSlashChord('5/')).toEqual({ numerator: '5', bass: '' });
    });

    it('renders the extension "6/9" as a slash chord per the visual rule', () => {
      // Documenting an edge case: the rule is purely visual ("split
      // on first slash"), not music-theoretic. "6/9" — an extension
      // in the suffix palette — renders as a slash chord. Users
      // picking it accept this consequence; it's the price of the
      // simpler rule.
      expect(splitSlashChord('6/9')).toEqual({ numerator: '6', bass: '9' });
    });
  });
});
