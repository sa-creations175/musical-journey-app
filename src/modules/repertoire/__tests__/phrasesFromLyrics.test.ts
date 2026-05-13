import { describe, expect, it } from 'vitest';
import { phrasesFromLyrics } from '../beatsModel';

/**
 * phrasesFromLyrics is the multi-phrase variant used by the lead
 * sheet's "+ add phrase line" flow. It must:
 *   · return exactly one phrase when no cap is supplied (desktop
 *     passthrough — same shape as phraseFromLyrics)
 *   · respect a per-line word cap on mobile and split only at word
 *     boundaries, never mid-token
 *   · honour explicit `\n` line breaks before applying the cap, so a
 *     user who paste-formats lyrics line-by-line keeps that structure
 *   · always return at least one phrase (empty input → single empty
 *     phrase, matching the singular helper's fallback)
 */
describe('phrasesFromLyrics', () => {
  describe('desktop passthrough (no cap)', () => {
    it('returns a single phrase for a long line when no cap is set', () => {
      const phrases = phrasesFromLyrics(
        'Amazing grace how sweet the sound that saved a wretch like me',
      );
      expect(phrases).toHaveLength(1);
      expect(phrases[0].beats).toHaveLength(12);
    });

    it('treats explicit newlines as whitespace when no cap is set', () => {
      const phrases = phrasesFromLyrics('amazing grace\nhow sweet the sound');
      // Desktop: legacy behaviour — flatten the whole input into one phrase.
      expect(phrases).toHaveLength(1);
      expect(phrases[0].beats).toHaveLength(6);
    });

    it('passes a zero or negative cap through to desktop behaviour', () => {
      const zero = phrasesFromLyrics('one two three four five six seven', 0);
      expect(zero).toHaveLength(1);
      const negative = phrasesFromLyrics('one two three four five six seven', -3);
      expect(negative).toHaveLength(1);
    });
  });

  describe('mobile auto-break (with cap)', () => {
    it('caps a long single line at maxWordsPerLine', () => {
      const phrases = phrasesFromLyrics(
        'amazing grace how sweet the sound that saved a wretch like me',
        6,
      );
      expect(phrases).toHaveLength(2);
      expect(phrases[0].beats?.map(b => b.text)).toEqual([
        'amazing', 'grace', 'how', 'sweet', 'the', 'sound',
      ]);
      expect(phrases[1].beats?.map(b => b.text)).toEqual([
        'that', 'saved', 'a', 'wretch', 'like', 'me',
      ]);
    });

    it('only breaks at word boundaries — never mid-token', () => {
      const phrases = phrasesFromLyrics(
        "don't stop believin' hold on to that feelin'",
        4,
      );
      // Tokens with apostrophes survive intact; the cap only counts whole tokens.
      const allWords = phrases.flatMap(p => p.beats?.map(b => b.text) ?? []);
      expect(allWords).toEqual([
        "don't", 'stop', "believin'", 'hold', 'on', 'to', 'that', "feelin'",
      ]);
      expect(phrases).toHaveLength(2);
    });

    it('honours explicit \\n line breaks before applying the cap', () => {
      const phrases = phrasesFromLyrics('amazing grace\nhow sweet the sound', 6);
      // Even though the total word count (6) is under the cap, the \n
      // forces a phrase split. User-provided line breaks survive.
      expect(phrases).toHaveLength(2);
      expect(phrases[0].beats?.map(b => b.text)).toEqual(['amazing', 'grace']);
      expect(phrases[1].beats?.map(b => b.text)).toEqual([
        'how', 'sweet', 'the', 'sound',
      ]);
    });

    it('splits a multi-line paste line-by-line and caps each line', () => {
      const phrases = phrasesFromLyrics(
        'amazing grace how sweet the sound that saved a wretch\nverse two starts here with more words than the cap allows',
        6,
      );
      // Line 1: 10 words → 6 + 4
      // Line 2: 11 words → 6 + 5
      expect(phrases).toHaveLength(4);
      expect(phrases[0].beats?.map(b => b.text)).toEqual([
        'amazing', 'grace', 'how', 'sweet', 'the', 'sound',
      ]);
      expect(phrases[1].beats?.map(b => b.text)).toEqual([
        'that', 'saved', 'a', 'wretch',
      ]);
      expect(phrases[2].beats?.map(b => b.text)).toEqual([
        'verse', 'two', 'starts', 'here', 'with', 'more',
      ]);
      expect(phrases[3].beats?.map(b => b.text)).toEqual([
        'words', 'than', 'the', 'cap', 'allows',
      ]);
    });

    it('returns a single phrase when the line fits within the cap', () => {
      const phrases = phrasesFromLyrics('short line here', 6);
      expect(phrases).toHaveLength(1);
      expect(phrases[0].beats?.map(b => b.text)).toEqual([
        'short', 'line', 'here',
      ]);
    });

    it('falls back to a single empty phrase on empty input', () => {
      const phrases = phrasesFromLyrics('', 6);
      expect(phrases).toHaveLength(1);
      expect(phrases[0].beats?.[0].type).toBe('blank');
    });

    it('falls back to a single empty phrase on whitespace-only input', () => {
      const phrases = phrasesFromLyrics('   \n  \n   ', 6);
      expect(phrases).toHaveLength(1);
      expect(phrases[0].beats?.[0].type).toBe('blank');
    });
  });
});
