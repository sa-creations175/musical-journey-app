import { describe, expect, it } from 'vitest';
import { BASIC_ARRANGEMENT_ID, phraseFromLyrics } from '../beatsModel';

/**
 * phraseFromLyrics is the entry point for the lyric-entry textbox.
 * It must:
 *   · split a non-empty input on whitespace → one word beat per token
 *   · fall back to a single blank beat when the input is empty (the
 *     instrumental-line case — the user opened the entry box but
 *     wanted a chord-only line)
 *   · seed an empty chord placements record on the Basic arrangement
 *     so the editor renders a chord row immediately above the beats
 */
describe('phraseFromLyrics', () => {
  it('splits a single space-separated line into word beats', () => {
    const phrase = phraseFromLyrics('Amazing grace how sweet the sound');
    expect(phrase.beats).toHaveLength(6);
    expect(phrase.beats?.map(b => b.text)).toEqual([
      'Amazing', 'grace', 'how', 'sweet', 'the', 'sound',
    ]);
    expect(phrase.beats?.every(b => b.type === 'word')).toBe(true);
  });

  it('collapses runs of whitespace + ignores leading/trailing whitespace', () => {
    const phrase = phraseFromLyrics('   how  sweet   the sound   ');
    expect(phrase.beats?.map(b => b.text)).toEqual([
      'how', 'sweet', 'the', 'sound',
    ]);
  });

  it('returns a single blank beat for an empty input (instrumental fallback)', () => {
    const phrase = phraseFromLyrics('');
    expect(phrase.beats).toHaveLength(1);
    expect(phrase.beats?.[0].type).toBe('blank');
    expect(phrase.beats?.[0].text).toBeUndefined();
  });

  it('returns a single blank beat for whitespace-only input', () => {
    const phrase = phraseFromLyrics('   \t\n   ');
    expect(phrase.beats).toHaveLength(1);
    expect(phrase.beats?.[0].type).toBe('blank');
  });

  it('seeds an empty chord-placements record on the Basic arrangement', () => {
    const phrase = phraseFromLyrics('one two');
    expect(phrase.chordsByArrangement).toBeDefined();
    expect(phrase.chordsByArrangement?.[BASIC_ARRANGEMENT_ID]).toEqual({});
  });

  it('assigns fresh ids — repeated calls do not collide', () => {
    const a = phraseFromLyrics('hello');
    const b = phraseFromLyrics('hello');
    expect(a.id).not.toBe(b.id);
    expect(a.beats?.[0].id).not.toBe(b.beats?.[0].id);
  });

  it('preserves punctuation inside tokens (treats them as part of the word)', () => {
    const phrase = phraseFromLyrics("don't stop believin'");
    expect(phrase.beats?.map(b => b.text)).toEqual([
      "don't", 'stop', "believin'",
    ]);
  });
});
