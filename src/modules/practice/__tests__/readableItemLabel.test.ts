import { describe, it, expect } from 'vitest';
import { readableItemRefLabel } from '../readableItemLabel';
import { cardById } from '../../harmonic-fluency/catalog';
import { lessonById } from '../../production/content/lessons';

describe('readableItemRefLabel', () => {
  it('chord-recognition → chord name (no :inversion)', () => {
    expect(readableItemRefLabel('chord-recognition', 'min:0')).toBe('Minor');
    expect(readableItemRefLabel('chord-recognition', 'maj7:1')).toBe('Major 7 · 1st inversion');
  });

  it('intervals → name + direction', () => {
    expect(readableItemRefLabel('intervals', 'P5:asc')).toBe('Perfect 5th (ascending)');
    expect(readableItemRefLabel('intervals', 'm3:desc')).toBe('Minor 3rd (descending)');
  });

  it('harmonic-fluency → the card question', () => {
    expect(readableItemRefLabel('harmonic-fluency', 'fh-1')).toBe(cardById('fh-1')!.question);
  });

  it('production → the lesson title (the resume-modal use case)', () => {
    const id = 'wf-01';
    expect(readableItemRefLabel('production', id)).toBe(lessonById(id)!.title);
  });

  it('falls back to the raw ref for unresolvable refs (e.g. repertoire songIds)', () => {
    // No sync labeler for repertoire songIds — returns the raw ref so the
    // caller can detect "didn't resolve" and use the block label instead.
    expect(readableItemRefLabel('repertoire', 'song-abc-123')).toBe('song-abc-123');
    expect(readableItemRefLabel(undefined, 'whatever')).toBe('whatever');
  });
});
