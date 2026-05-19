import { describe, expect, it } from 'vitest';
import { tokenizeLyrics } from '../lyricTokens';

describe('tokenizeLyrics', () => {
  it('splits on single spaces', () => {
    const tokens = tokenizeLyrics('I love you tonight');
    expect(tokens.map(t => t.text)).toEqual(['I', 'love', 'you', 'tonight']);
  });

  it('collapses multiple whitespace separators', () => {
    const tokens = tokenizeLyrics('I   love\t\tyou\n\ntonight');
    expect(tokens.map(t => t.text)).toEqual(['I', 'love', 'you', 'tonight']);
  });

  it('treats newlines as separators (multi-line paste)', () => {
    const tokens = tokenizeLyrics('verse one\nverse two');
    expect(tokens.map(t => t.text)).toEqual(['verse', 'one', 'verse', 'two']);
  });

  it('preserves punctuation attached to words', () => {
    const tokens = tokenizeLyrics("yeah, I'm gonna (almost) sing");
    expect(tokens.map(t => t.text)).toEqual([
      'yeah,',
      "I'm",
      'gonna',
      '(almost)',
      'sing',
    ]);
  });

  it('drops empty / whitespace-only input', () => {
    expect(tokenizeLyrics('')).toEqual([]);
    expect(tokenizeLyrics('   ')).toEqual([]);
    expect(tokenizeLyrics('\n\n\t')).toEqual([]);
  });

  it('assigns each token a unique id', () => {
    const tokens = tokenizeLyrics('one two three');
    const ids = new Set(tokens.map(t => t.id));
    expect(ids.size).toBe(3);
  });

  it('gives identical-text tokens distinct ids', () => {
    const tokens = tokenizeLyrics('yeah yeah yeah');
    expect(tokens).toHaveLength(3);
    const ids = new Set(tokens.map(t => t.id));
    expect(ids.size).toBe(3);
  });

  it('defaults isPhrase to false', () => {
    const tokens = tokenizeLyrics('one two');
    expect(tokens.every(t => t.isPhrase === false)).toBe(true);
  });
});
