import { describe, expect, it } from 'vitest';
import { splitRootSuffix, splitSlashChord } from '../chordGlyph';

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

/**
 * splitRootSuffix breaks one chord part (a string with no slash —
 * numerator or bass) into a leading root + suffix so the renderer
 * can size them differently. Root is the leading 1–7 digit run;
 * everything after is the suffix.
 */
describe('splitRootSuffix', () => {
  describe('numbers notation (with leading 1–7 digit)', () => {
    it('returns root + empty suffix for a bare digit', () => {
      expect(splitRootSuffix('5')).toEqual({ root: '5', suffix: '' });
      expect(splitRootSuffix('1')).toEqual({ root: '1', suffix: '' });
      expect(splitRootSuffix('7')).toEqual({ root: '7', suffix: '' });
    });

    it('splits a single-character quality suffix', () => {
      // "6m" → 6 bold, m smaller (the canonical minor case).
      expect(splitRootSuffix('6m')).toEqual({ root: '6', suffix: 'm' });
    });

    it('splits a multi-character suffix', () => {
      expect(splitRootSuffix('4maj7')).toEqual({ root: '4', suffix: 'maj7' });
      expect(splitRootSuffix('1maj7')).toEqual({ root: '1', suffix: 'maj7' });
      expect(splitRootSuffix('2sus4')).toEqual({ root: '2', suffix: 'sus4' });
    });

    it('keeps non-digit punctuation inside the suffix', () => {
      // Parens, sharps, flats all live in the suffix; only the
      // leading 1–7 digits go into root.
      expect(splitRootSuffix('3(#9#5)')).toEqual({ root: '3', suffix: '(#9#5)' });
      expect(splitRootSuffix('5b9')).toEqual({ root: '5', suffix: 'b9' });
      expect(splitRootSuffix('4#11')).toEqual({ root: '4', suffix: '#11' });
    });

    it('captures multi-digit runs of 1–7 as the root', () => {
      // Music-theoretically unusual but the rule is "leading 1–7
      // digit run" — "11add9" lands with "11" as root, "add9" as
      // suffix. Predictable.
      expect(splitRootSuffix('11add9')).toEqual({ root: '11', suffix: 'add9' });
    });
  });

  describe('non-numbers notation (no leading 1–7 digit)', () => {
    it('treats the whole input as root when it starts with a Roman numeral', () => {
      // Roman mode renders "Vmaj7", "vii°", etc. — no leading digit,
      // so the suffix split doesn't trigger. The whole part stays
      // as one bold glyph at the call site.
      expect(splitRootSuffix('Vmaj7')).toEqual({ root: 'Vmaj7', suffix: '' });
      expect(splitRootSuffix('iim7')).toEqual({ root: 'iim7', suffix: '' });
    });

    it('treats the whole input as root when it starts with a note letter', () => {
      // Concrete mode renders "Gmaj7", "F#m", etc. — no leading
      // digit, so again no split.
      expect(splitRootSuffix('Gmaj7')).toEqual({ root: 'Gmaj7', suffix: '' });
      expect(splitRootSuffix('Bbm7')).toEqual({ root: 'Bbm7', suffix: '' });
    });

    it('treats the whole input as root when it starts with an accidental', () => {
      // Altered roots like "b7" or "#4" don't have a leading 1–7
      // digit either — no split.
      expect(splitRootSuffix('b7')).toEqual({ root: 'b7', suffix: '' });
      expect(splitRootSuffix('#4')).toEqual({ root: '#4', suffix: '' });
    });

    it('returns an empty result for empty input', () => {
      expect(splitRootSuffix('')).toEqual({ root: '', suffix: '' });
    });
  });

  describe('integration with splitSlashChord', () => {
    it('produces the four parts of "5maj7/3" when composed', () => {
      // The renderer calls splitSlashChord first, then
      // splitRootSuffix on each side. Document the expected
      // breakdown end-to-end so a future refactor preserves it.
      const slash = splitSlashChord('5maj7/3');
      expect(slash).toEqual({ numerator: '5maj7', bass: '3' });
      const num = splitRootSuffix(slash.numerator);
      const bass = splitRootSuffix(slash.bass ?? '');
      expect(num).toEqual({ root: '5', suffix: 'maj7' });
      expect(bass).toEqual({ root: '3', suffix: '' });
    });

    it('produces "5" + slash + "7" with no suffixes for "5/7"', () => {
      const slash = splitSlashChord('5/7');
      const num = splitRootSuffix(slash.numerator);
      const bass = splitRootSuffix(slash.bass ?? '');
      expect(num).toEqual({ root: '5', suffix: '' });
      expect(bass).toEqual({ root: '7', suffix: '' });
    });
  });
});
