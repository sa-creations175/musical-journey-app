/**
 * Tests for getSongReadiness — the practice-readiness classifier
 * that drives Setup / Chord-quiz / Practice block selection in the
 * session generator.
 */
import { describe, expect, it } from 'vitest';
import { getSongReadiness } from '../songReadiness';
import type { Song, SongSection } from '../../../lib/db';

const NOW = 1_700_000_000_000;

function mkSong(): Song {
  return {
    id: 'song-1',
    title: 'Test Song',
    artist: 'Test Artist',
    addedDate: NOW,
    updatedAt: NOW,
    audioLinks: [],
    learningOrder: 1,
  } as Song;
}

function mkSection(overrides: Partial<SongSection> = {}): SongSection {
  return {
    id: 'sec-1',
    songId: 'song-1',
    name: 'Verse',
    order: 0,
    lyrics: '',
    ...overrides,
  };
}

describe('getSongReadiness — needs-setup', () => {
  it('returns needs-setup when songSections is empty', () => {
    expect(getSongReadiness(mkSong(), [], [])).toBe('needs-setup');
  });
});

describe('getSongReadiness — needs-chords', () => {
  it('returns needs-chords when sections exist but no chord data', () => {
    const sections = [mkSection(), mkSection({ id: 'sec-2', name: 'Chorus' })];
    expect(getSongReadiness(mkSong(), [], sections)).toBe('needs-chords');
  });

  it('treats empty / whitespace-only basicChords as no-chords', () => {
    const sections = [mkSection({ basicChords: '   ' })];
    expect(getSongReadiness(mkSong(), [], sections)).toBe('needs-chords');
  });

  it('treats empty phrases array as no-chords', () => {
    const sections = [mkSection({ phrases: [] })];
    expect(getSongReadiness(mkSong(), [], sections)).toBe('needs-chords');
  });

  it('treats phrases with empty chordsByArrangement as no-chords', () => {
    const sections = [mkSection({
      phrases: [{ id: 'p1', beats: [], chordsByArrangement: {} }],
    })];
    expect(getSongReadiness(mkSong(), [], sections)).toBe('needs-chords');
  });

  it('treats phrases with arrangement key but empty placements as no-chords', () => {
    const sections = [mkSection({
      phrases: [{ id: 'p1', beats: [], chordsByArrangement: { basic: {} } }],
    })];
    expect(getSongReadiness(mkSong(), [], sections)).toBe('needs-chords');
  });
});

describe('getSongReadiness — ready', () => {
  it('returns ready when any section has non-empty basicChords', () => {
    const sections = [
      mkSection(),
      mkSection({ id: 'sec-2', name: 'Chorus', basicChords: 'C G Am F' }),
    ];
    expect(getSongReadiness(mkSong(), [], sections)).toBe('ready');
  });

  it('returns ready when any section has non-empty alternateChords', () => {
    const sections = [mkSection({ alternateChords: 'Em Bm Am D' })];
    expect(getSongReadiness(mkSong(), [], sections)).toBe('ready');
  });

  it('returns ready when a phrase carries a legacy chords string', () => {
    const sections = [mkSection({
      phrases: [{ id: 'p1', chords: 'C G Am F' }],
    })];
    expect(getSongReadiness(mkSong(), [], sections)).toBe('ready');
  });

  it('returns ready when chordsByArrangement carries at least one placement', () => {
    const sections = [mkSection({
      phrases: [{
        id: 'p1',
        beats: [{ id: 'b1', type: 'word', text: 'Hello' }],
        chordsByArrangement: {
          basic: { b1: { function: '1', quality: '' } },
        },
      }],
    })];
    expect(getSongReadiness(mkSong(), [], sections)).toBe('ready');
  });

  it('only needs ONE section with chords to flip to ready', () => {
    const sections = [
      mkSection({ id: 's1', basicChords: '' }),
      mkSection({ id: 's2' }),
      mkSection({ id: 's3', basicChords: 'C' }),
    ];
    expect(getSongReadiness(mkSong(), [], sections)).toBe('ready');
  });
});
