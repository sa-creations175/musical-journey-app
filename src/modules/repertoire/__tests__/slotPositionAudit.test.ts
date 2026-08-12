import { describe, expect, it } from 'vitest';
import type { ChordFunction, Phrase, Song, SongSection } from '../../../lib/db';
import { materializeChordPlacements } from '../barGrid';
import { EIGHTHS_DURATION_VERSION } from '../eighthsMigration';
import { auditSectionPositions, auditSongPositions } from '../slotPositionAudit';
import { BASIC_ARRANGEMENT_ID } from '../beatsModel';

const BEATS_PER_BAR = 4;
const song = { id: 'song-1', title: 'Test', timeSignature: '4/4' } as Song;

function cf(fn: string, beats: number): ChordFunction {
  return { function: fn, quality: '', beats };
}

function phraseWithChords(chords: ChordFunction[]): Phrase {
  const beats = chords.map((_, i) => ({ id: `b${i}`, type: 'word' as const, text: '' }));
  const placements: Record<string, ChordFunction> = {};
  chords.forEach((c, i) => {
    placements[beats[i].id] = c;
  });
  return { id: 'p1', beats, chordsByArrangement: { [BASIC_ARRANGEMENT_ID]: placements } };
}

/** A legacy section: chords in phrase data, no stored placements. */
function legacy(overrides: Partial<SongSection> = {}): SongSection {
  return {
    id: 'sec-1',
    songId: 'song-1',
    name: 'Verse',
    order: 0,
    lyrics: '',
    // 4 + 2 + 1 + 3 beats — the audit's real distribution, and enough
    // to put chords at beats 0, 0, 2, 3 across two bars.
    phrases: [phraseWithChords([cf('1', 4), cf('4', 2), cf('5', 1), cf('6', 3)])],
    ...overrides,
  } as SongSection;
}

/** Correctly materialised on the eighths path (post-12.5). */
function healthy(): SongSection {
  return legacy({
    chordPlacements: materializeChordPlacements(legacy(), BEATS_PER_BAR, true),
    eighthsDurationVersion: EIGHTHS_DURATION_VERSION,
  });
}

/**
 * What 12.3 actually wrote: the packer's SLOT index copied straight
 * into `beatPos`. Legacy durations are doubled before packing so every
 * start slot is even, which makes the damaged value exactly twice the
 * correct one.
 */
function damaged(): SongSection {
  const correct = materializeChordPlacements(legacy(), BEATS_PER_BAR, true);
  return legacy({
    chordPlacements: correct.map(p => ({ ...p, beatPos: p.beatPos * 2 })),
    eighthsDurationVersion: EIGHTHS_DURATION_VERSION,
  });
}

describe('auditSectionPositions — telling damage from legitimate data', () => {
  it('says nothing about a section with no stored placements', () => {
    expect(auditSectionPositions(song, legacy())).toBeNull();
  });

  it('reports a correctly materialised section as clean', () => {
    const f = auditSectionPositions(song, healthy())!;
    expect(f.damaged).toEqual([]);
    expect(f.diverged).toEqual([]);
    expect(f.invisible).toEqual([]);
    expect(f.doubleDoubled).toEqual([]);
    expect(f.barsNow).toBe(f.barsIfRepaired);
  });

  it('catches slot-encoded positions and gives the correct value', () => {
    const f = auditSectionPositions(song, damaged())!;
    expect(f.damaged.length).toBeGreaterThan(0);
    for (const p of f.damaged) {
      expect(p.position).toBe('slot-encoded');
      // The fingerprint: stored is exactly twice the truth.
      expect(p.storedBeatPos).toBe(p.expectedBeatPos * 2);
    }
  });

  it('flags the chords the grid is currently dropping', () => {
    const f = auditSectionPositions(song, damaged())!;
    // Anything pushed to slot >= 4 is filtered out by the renderer.
    expect(f.invisible.length).toBeGreaterThan(0);
    for (const p of f.invisible) expect(p.storedBeatPos).toBeGreaterThanOrEqual(BEATS_PER_BAR);
  });

  it('reports a bar the section has lost', () => {
    // A dropped placement only shrinks the bar count when it is the
    // ONLY thing anchoring the final bar — the grid sizes a section
    // from the highest surviving barIndex. Here a 6-beat chord ties
    // across into bar 1 (leaving no placement there) and the next
    // chord starts at slot 4 of bar 1, so dropping it takes bar 1
    // with it.
    const spanning = legacy({ phrases: [phraseWithChords([cf('1', 6), cf('4', 2)])] });
    const correct = materializeChordPlacements(spanning, BEATS_PER_BAR, true);
    expect(correct.map(p => p.beatPos)).toEqual([0, 2]);

    const broken = {
      ...spanning,
      chordPlacements: correct.map(p => ({ ...p, beatPos: p.beatPos * 2 })),
    } as SongSection;
    const f = auditSectionPositions(song, broken)!;
    expect(f.barsNow).toBe(1);
    expect(f.barsIfRepaired).toBe(2);
  });

  it('does not claim a lost bar when the damage leaves the last bar anchored', () => {
    // The commoner case: the dropped chord shares its bar with a
    // surviving one, so the bar count is unaffected even though the
    // chord is invisible. Reporting a loss here would be a lie.
    const f = auditSectionPositions(song, damaged())!;
    expect(f.invisible.length).toBeGreaterThan(0);
    expect(f.barsIfRepaired).toBe(f.barsNow);
  });

  it('does NOT call a user edit damage', () => {
    // A chord genuinely dragged to another beat — not the fingerprint.
    const moved = healthy();
    moved.chordPlacements = moved.chordPlacements!.map((p, i) =>
      i === 0 ? { ...p, beatPos: 3 } : p,
    );
    const f = auditSectionPositions(song, moved)!;
    expect(f.damaged).toEqual([]);
    expect(f.diverged).toHaveLength(1);
    expect(f.diverged[0].position).toBe('diverged');
  });

  it('skips hand-added placements — they were never materialised', () => {
    const withAdded = healthy();
    withAdded.chordPlacements = [
      ...withAdded.chordPlacements!,
      {
        id: 'a-random-uuid',
        arrangementId: BASIC_ARRANGEMENT_ID,
        barIndex: 0,
        beatPos: 6,
        beats: 2,
        chord: cf('2', 1),
      },
    ];
    const f = auditSectionPositions(song, withAdded)!;
    expect(f.handAdded).toBe(1);
    expect(f.damaged).toEqual([]);
  });

  it('admits the beatPos 0 blind spot rather than reporting a false clean', () => {
    // Slot 0 and beat 0 are the same number, so a damaged first chord
    // is indistinguishable — and harmless, the value is right anyway.
    const f = auditSectionPositions(song, damaged())!;
    const atZero = f.damaged.filter(p => p.expectedBeatPos === 0);
    expect(atZero).toEqual([]);
  });
});

describe('auditSectionPositions — durations', () => {
  it('classifies correct slot units as slots, not damage', () => {
    const f = auditSectionPositions(song, healthy())!;
    for (const s of f.damaged.concat(f.diverged)) expect(s.duration).not.toBe('double-doubled');
  });

  it('catches a duration doubled twice', () => {
    const twice = healthy();
    twice.chordPlacements = twice.chordPlacements!.map(p => ({ ...p, beats: p.beats * 2 }));
    const f = auditSectionPositions(song, twice)!;
    expect(f.doubleDoubled.length).toBe(twice.chordPlacements!.length);
    for (const p of f.doubleDoubled) expect(p.storedBeats).toBe(p.expectedBeats * 4);
  });

  it('calls an odd hand-set duration user-set, not damage', () => {
    // The "5 beats" shape: only the stepper can produce an odd value.
    const odd = healthy();
    odd.chordPlacements = odd.chordPlacements!.map((p, i) =>
      i === 0 ? { ...p, beats: 5 } : p,
    );
    const f = auditSectionPositions(song, odd)!;
    expect(f.doubleDoubled).toEqual([]);
    const row = f.diverged.find(p => p.storedBeats === 5);
    // Position is untouched, so it is not reported as a position
    // finding at all — the duration simply isn't a mechanical multiple.
    expect(row).toBeUndefined();
    expect(f.damaged).toEqual([]);
  });
});

describe('auditSongPositions — lyric anchors', () => {
  const withAnchor = (sectionId: string, barIndex: number): Song =>
    ({
      ...song,
      eighths: true,
      lyricLines: [
        {
          id: 'l1',
          kind: 'lyric',
          text: 'oh',
          syllables: [{ id: 'sy1', text: 'oh', anchor: { sectionId, barIndex, beatPos: 0 } }],
        },
      ],
    }) as Song;

  it('counts anchors sitting in a damaged section', () => {
    const f = auditSongPositions(withAnchor('sec-1', 0), [damaged()]);
    expect(f.damagedPlacements).toBeGreaterThan(0);
    expect(f.anchorsInDamagedSections).toBe(1);
  });

  it('reports an anchor orphaned past the last rendered bar', () => {
    const sec = damaged();
    const f = auditSongPositions(withAnchor('sec-1', 5), [sec]);
    expect(f.orphanedAnchors).toHaveLength(1);
    expect(f.orphanedAnchors[0]).toMatchObject({ sectionId: 'sec-1', barIndex: 5 });
  });

  it('reports no orphans and no damage for a healthy song', () => {
    const f = auditSongPositions(withAnchor('sec-1', 0), [healthy()]);
    expect(f.damagedPlacements).toBe(0);
    expect(f.orphanedAnchors).toEqual([]);
    expect(f.barsLost).toBe(0);
  });
});
