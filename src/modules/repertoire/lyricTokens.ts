// Lyric staging tokenizer (Lead Sheet Redesign step 5, May 2026 —
// docs/LEAD_SHEET_REDESIGN.md). Pasted lyric text is split into
// individual word tokens that live in component-local state until
// the user drops them onto beat positions in step 6.
//
// A staged token does NOT yet have a bar/beat position (that's what
// makes it staged). The persistent `LyricToken` interface in db.ts
// requires those positions, so staging uses a deliberately smaller
// shape and the step-6 drop handler will widen it to a LyricToken
// when the token gets anchored.

export interface StagedLyricToken {
  id: string;
  text: string;
  /** Always false in step 5; reserved for step 7 (phrase grouping
   *  where adjacent word tokens merge into a single phrase token
   *  that moves as one). */
  isPhrase: boolean;
}

/**
 * Split a string of lyric text into staged tokens. Whitespace
 * (including newlines) separates tokens; punctuation attached to a
 * word stays attached ("yeah,", "don't", "(verse" all stay as one
 * token); empty results are dropped.
 *
 * Each token gets a fresh `crypto.randomUUID()` id so two calls with
 * the same text still produce distinguishable tokens.
 */
export function tokenizeLyrics(text: string): StagedLyricToken[] {
  if (!text) return [];
  return text
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .map(t => ({
      id: crypto.randomUUID(),
      text: t,
      isPhrase: false,
    }));
}
