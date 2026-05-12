import { describe, expect, it } from 'vitest';
import type { ChordFunction, Phrase } from '../../../lib/db';
import {
  BASIC_ARRANGEMENT_ID,
  clonePhraseWithFreshIds,
  phraseFromLyricsPreserveChords,
} from '../beatsModel';

/**
 * Tests for the edit-as-text round-trip + the duplicate-line clone.
 * Both helpers exist so the lead-sheet UI can manipulate phrases
 * without losing chord placements where they still apply.
 */

function chord(degree: string, quality = ''): ChordFunction {
  return { function: degree, quality };
}

function mkPhrase(words: string[], chords: Record<number, ChordFunction>): Phrase {
  const beats = words.map((text, i) => ({ id: `b-${i}`, type: 'word' as const, text }));
  const placements: Record<string, ChordFunction> = {};
  for (const [idxStr, cf] of Object.entries(chords)) {
    const i = Number(idxStr);
    placements[beats[i].id] = cf;
  }
  return {
    id: 'p-source',
    beats,
    chordsByArrangement: {
      [BASIC_ARRANGEMENT_ID]: placements,
    },
  };
}

describe('phraseFromLyricsPreserveChords', () => {
  it('round-trips identical text — every chord placement preserved at the same position', () => {
    const original = mkPhrase(
      ['Amazing', 'grace', 'how', 'sweet', 'the', 'sound'],
      { 0: chord('1'), 2: chord('4'), 4: chord('5') },
    );
    const next = phraseFromLyricsPreserveChords(
      'Amazing grace how sweet the sound',
      original,
    );
    expect(next.beats?.map(b => b.text)).toEqual(
      ['Amazing', 'grace', 'how', 'sweet', 'the', 'sound'],
    );
    const placements = next.chordsByArrangement?.[BASIC_ARRANGEMENT_ID] ?? {};
    const beats = next.beats ?? [];
    expect(placements[beats[0].id]).toEqual(chord('1'));
    expect(placements[beats[2].id]).toEqual(chord('4'));
    expect(placements[beats[4].id]).toEqual(chord('5'));
    expect(Object.keys(placements)).toHaveLength(3);
  });

  it('keeps the phrase id stable across the round-trip', () => {
    const original = mkPhrase(['a', 'b'], {});
    const next = phraseFromLyricsPreserveChords('a b', original);
    expect(next.id).toBe(original.id);
  });

  it('drops chord placements where the word at that position changes', () => {
    const original = mkPhrase(
      ['Amazing', 'grace', 'how', 'sweet'],
      { 0: chord('1'), 1: chord('4'), 2: chord('5'), 3: chord('1') },
    );
    // Change position 1: "grace" → "wonderful". Chord at position 1
    // is dropped; positions 0, 2, 3 still match → preserved.
    const next = phraseFromLyricsPreserveChords(
      'Amazing wonderful how sweet',
      original,
    );
    const placements = next.chordsByArrangement?.[BASIC_ARRANGEMENT_ID] ?? {};
    const beats = next.beats ?? [];
    expect(placements[beats[0].id]).toEqual(chord('1'));
    // The new beat at position 1 has no chord.
    expect(placements[beats[1].id]).toBeUndefined();
    expect(placements[beats[2].id]).toEqual(chord('5'));
    expect(placements[beats[3].id]).toEqual(chord('1'));
  });

  it('drops every chord when the user clears the lyrics entirely', () => {
    const original = mkPhrase(['Amazing', 'grace'], { 0: chord('1'), 1: chord('4') });
    const next = phraseFromLyricsPreserveChords('', original);
    expect(next.beats).toHaveLength(1);
    expect(next.beats?.[0].type).toBe('blank');
    const placements = next.chordsByArrangement?.[BASIC_ARRANGEMENT_ID] ?? {};
    expect(Object.keys(placements)).toHaveLength(0);
  });

  it('appending new words leaves a tail of empty chord slots', () => {
    const original = mkPhrase(['one', 'two'], { 0: chord('1'), 1: chord('5') });
    const next = phraseFromLyricsPreserveChords('one two three four', original);
    expect(next.beats?.map(b => b.text)).toEqual(['one', 'two', 'three', 'four']);
    const placements = next.chordsByArrangement?.[BASIC_ARRANGEMENT_ID] ?? {};
    const beats = next.beats ?? [];
    expect(placements[beats[0].id]).toEqual(chord('1'));
    expect(placements[beats[1].id]).toEqual(chord('5'));
    expect(placements[beats[2].id]).toBeUndefined();
    expect(placements[beats[3].id]).toBeUndefined();
  });

  it('truncating drops chords whose old position no longer exists', () => {
    const original = mkPhrase(
      ['one', 'two', 'three', 'four'],
      { 0: chord('1'), 1: chord('4'), 2: chord('5'), 3: chord('6') },
    );
    const next = phraseFromLyricsPreserveChords('one two', original);
    const placements = next.chordsByArrangement?.[BASIC_ARRANGEMENT_ID] ?? {};
    expect(Object.keys(placements)).toHaveLength(2);
  });

  it('preserves chords on multiple arrangements simultaneously', () => {
    const original: Phrase = {
      id: 'p-src',
      beats: [
        { id: 'b1', type: 'word', text: 'A' },
        { id: 'b2', type: 'word', text: 'B' },
      ],
      chordsByArrangement: {
        [BASIC_ARRANGEMENT_ID]: { b1: chord('1'), b2: chord('5') },
        alternates: { b1: chord('1maj7'), b2: chord('5sus') },
      },
    };
    const next = phraseFromLyricsPreserveChords('A B', original);
    const beats = next.beats ?? [];
    expect(next.chordsByArrangement?.[BASIC_ARRANGEMENT_ID]?.[beats[0].id]).toEqual(chord('1'));
    expect(next.chordsByArrangement?.['alternates']?.[beats[0].id]).toEqual(chord('1maj7'));
    expect(next.chordsByArrangement?.['alternates']?.[beats[1].id]).toEqual(chord('5sus'));
  });
});

describe('clonePhraseWithFreshIds', () => {
  it('produces a deep copy with new phrase + beat ids', () => {
    const src = mkPhrase(['one', 'two', 'three'], { 0: chord('1'), 2: chord('5') });
    const copy = clonePhraseWithFreshIds(src);
    expect(copy.id).not.toBe(src.id);
    expect(copy.beats?.length).toBe(3);
    for (let i = 0; i < (copy.beats?.length ?? 0); i++) {
      expect(copy.beats?.[i].id).not.toBe(src.beats?.[i].id);
      expect(copy.beats?.[i].text).toBe(src.beats?.[i].text);
    }
  });

  it('remaps chord-placement keys to the new beat ids while preserving the chord values', () => {
    const src = mkPhrase(['A', 'B'], { 0: chord('1maj7'), 1: chord('5') });
    const copy = clonePhraseWithFreshIds(src);
    const copyBeats = copy.beats ?? [];
    const placements = copy.chordsByArrangement?.[BASIC_ARRANGEMENT_ID] ?? {};
    expect(placements[copyBeats[0].id]).toEqual(chord('1maj7'));
    expect(placements[copyBeats[1].id]).toEqual(chord('5'));
    // Source beat ids should NOT appear in the copy's placements.
    expect(placements[src.beats?.[0].id ?? '']).toBeUndefined();
  });

  it('keeps every arrangement when cloning', () => {
    const src: Phrase = {
      id: 'p1',
      beats: [{ id: 'b1', type: 'word', text: 'A' }],
      chordsByArrangement: {
        [BASIC_ARRANGEMENT_ID]: { b1: chord('1') },
        alternates: { b1: chord('1maj7') },
      },
    };
    const copy = clonePhraseWithFreshIds(src);
    const copyBeats = copy.beats ?? [];
    expect(copy.chordsByArrangement?.[BASIC_ARRANGEMENT_ID]?.[copyBeats[0].id])
      .toEqual(chord('1'));
    expect(copy.chordsByArrangement?.alternates?.[copyBeats[0].id])
      .toEqual(chord('1maj7'));
  });

  it('two consecutive clones share no ids', () => {
    const src = mkPhrase(['one'], { 0: chord('1') });
    const a = clonePhraseWithFreshIds(src);
    const b = clonePhraseWithFreshIds(src);
    expect(a.id).not.toBe(b.id);
    expect(a.beats?.[0].id).not.toBe(b.beats?.[0].id);
  });
});
