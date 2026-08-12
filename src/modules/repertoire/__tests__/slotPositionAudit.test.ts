import { describe, expect, it } from 'vitest';
import type { ChordFunction, Phrase, Song, SongSection } from '../../../lib/db';
import { materializeChordPlacements } from '../barGrid';
import { EIGHTHS_DURATION_VERSION } from '../eighthsMigration';
import { auditSectionPositions, auditSongPositions } from '../slotPositionAudit';
import { BASIC_ARRANGEMENT_ID } from '../beatsModel';

const BEATS_PER_BAR = 4;
const eighthsSong = {
  id: 'song-1',
  title: 'On Eighths',
  timeSignature: '4/4',
  eighths: true,
} as Song;
const beatsSong = {
  id: 'song-1',
  title: 'On Beats',
  timeSignature: '4/4',
  eighths: false,
} as Song;

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

function legacy(overrides: Partial<SongSection> = {}): SongSection {
  return {
    id: 'sec-1',
    songId: 'song-1',
    name: 'Verse',
    order: 0,
    lyrics: '',
    phrases: [phraseWithChords([cf('1', 4), cf('4', 2), cf('5', 1), cf('6', 3)])],
    ...overrides,
  } as SongSection;
}

/** Correctly materialised on the eighths path, stamped. */
function healthy(): SongSection {
  return legacy({
    chordPlacements: materializeChordPlacements(legacy(), BEATS_PER_BAR, true),
    eighthsDurationVersion: EIGHTHS_DURATION_VERSION,
  });
}

/** Four one-beat chords, so the reconstruction lands on beatPos
 *  0, 1, 2, 3 — the fixture above never produces a beat 1, which is
 *  the coordinate the ambiguous case needs. */
function legacyEven(overrides: Partial<SongSection> = {}): SongSection {
  return legacy({
    phrases: [phraseWithChords([cf('1', 1), cf('4', 1), cf('5', 1), cf('6', 1)])],
    ...overrides,
  });
}

function healthyEven(eighths: boolean): SongSection {
  const base = legacyEven();
  return legacyEven({
    chordPlacements: materializeChordPlacements(base, BEATS_PER_BAR, eighths),
    ...(eighths ? { eighthsDurationVersion: EIGHTHS_DURATION_VERSION } : {}),
  });
}

/** What 12.3 wrote: the packer's SLOT index copied into beatPos. */
function damaged(): SongSection {
  const correct = materializeChordPlacements(legacy(), BEATS_PER_BAR, true);
  return legacy({
    chordPlacements: correct.map(p => ({ ...p, beatPos: p.beatPos * 2 })),
    eighthsDurationVersion: EIGHTHS_DURATION_VERSION,
  });
}

// =====================================================================
// Fix 1 — the eighths gate
// =====================================================================

describe('the eighths gate', () => {
  it('does not assess a non-eighths song for damage', () => {
    const f = auditSectionPositions(beatsSong, damaged())!;
    expect(f.assessedForDamage).toBe(false);
    expect(f.damaged).toEqual([]);
    expect(f.ambiguous).toEqual([]);
  });

  it('assesses a song that is on eighths', () => {
    expect(auditSectionPositions(eighthsSong, damaged())!.assessedForDamage).toBe(true);
  });

  it('files the same rows as ordinary edits on a beats song', () => {
    // Identical data, opposite verdicts — the gate is doing the work.
    const onBeats = auditSectionPositions(beatsSong, damaged())!;
    const onEighths = auditSectionPositions(eighthsSong, damaged())!;
    expect(onBeats.edited.length).toBeGreaterThan(0);
    expect(onEighths.damaged.length).toBeGreaterThan(0);
    expect(onBeats.edited.length).toBe(
      onEighths.damaged.length + onEighths.ambiguous.length,
    );
  });
});

// =====================================================================
// Fix 2 — decisive vs ambiguous
// =====================================================================

describe('position verdicts', () => {
  it('calls a position past beatsPerBar decisive damage', () => {
    const f = auditSectionPositions(eighthsSong, damaged())!;
    expect(f.damaged.length).toBeGreaterThan(0);
    for (const p of f.damaged) {
      expect(p.storedBeatPos).toBeGreaterThanOrEqual(BEATS_PER_BAR);
      expect(p.storedBeatPos).toBe(p.expectedBeatPos * 2);
    }
  });

  it('calls beat 1 reading as 2 AMBIGUOUS, never damage', () => {
    // The exact shape of the single false positive the first version
    // of this detector reported as damage.
    const sec = healthyEven(true);
    expect(sec.chordPlacements!.map(p => p.beatPos)).toEqual([0, 1, 2, 3]);
    sec.chordPlacements = sec.chordPlacements!.map(p =>
      p.beatPos === 1 ? { ...p, beatPos: 2 } : p,
    );
    const f = auditSectionPositions(eighthsSong, sec)!;
    expect(f.damaged).toEqual([]);
    expect(f.ambiguous).toHaveLength(1);
    expect(f.ambiguous[0].position).toBe('ambiguous');
    expect(f.ambiguous[0].storedBeatPos).toBe(2);
    expect(f.ambiguous[0].expectedBeatPos).toBe(1);
  });

  it('reports a clean section as clean', () => {
    const f = auditSectionPositions(eighthsSong, healthy())!;
    expect(f.damaged).toEqual([]);
    expect(f.ambiguous).toEqual([]);
    expect(f.edited).toEqual([]);
    expect(f.invisible).toEqual([]);
  });

  it('cannot see a damaged chord at beatPos 0 — the stated blind spot', () => {
    const f = auditSectionPositions(eighthsSong, damaged())!;
    const atZero = [...f.damaged, ...f.ambiguous].filter(p => p.expectedBeatPos === 0);
    expect(atZero).toEqual([]);
  });
});

// =====================================================================
// Fix 3 — durations only where the multiples mean something
// =====================================================================

describe('duration classification', () => {
  it('is not assessed on a non-eighths song', () => {
    // The false-positive shape: original 1 beat, stepper set to 4.
    const sec = legacy({
      chordPlacements: materializeChordPlacements(legacy(), BEATS_PER_BAR, false).map(
        p => ({ ...p, beats: 4 }),
      ),
    });
    const f = auditSectionPositions(beatsSong, sec)!;
    expect(f.doubleDoubled).toEqual([]);
    for (const p of f.edited.concat(f.damaged)) {
      expect(p.duration).toBe('not-assessed');
    }
  });

  it('is not assessed on an unstamped section of an eighths song', () => {
    const sec = legacy({
      chordPlacements: materializeChordPlacements(legacy(), BEATS_PER_BAR, false).map(
        p => ({ ...p, beats: 4 }),
      ),
    });
    expect(auditSectionPositions(eighthsSong, sec)!.doubleDoubled).toEqual([]);
  });

  it('catches a genuine double-double on a stamped eighths section', () => {
    const twice = healthy();
    twice.chordPlacements = twice.chordPlacements!.map(p => ({ ...p, beats: p.beats * 2 }));
    const f = auditSectionPositions(eighthsSong, twice)!;
    expect(f.doubleDoubled).toHaveLength(twice.chordPlacements!.length);
    for (const p of f.doubleDoubled) expect(p.storedBeats).toBe(p.expectedBeats * 4);
  });

  it('calls an odd hand-set duration user-set, not damage', () => {
    const odd = healthy();
    odd.chordPlacements = odd.chordPlacements!.map((p, i) =>
      i === 0 ? { ...p, beats: 5 } : p,
    );
    const f = auditSectionPositions(eighthsSong, odd)!;
    expect(f.doubleDoubled).toEqual([]);
    expect(f.damaged).toEqual([]);
  });
});

// =====================================================================
// Fix 4 — the stamp, on every section
// =====================================================================

describe('stamp reporting', () => {
  it('reports the unit for a clean section', () => {
    expect(auditSectionPositions(eighthsSong, healthy())!.inSlotUnits).toBe(true);
    expect(auditSectionPositions(eighthsSong, healthy())!.stampMismatch).toBeNull();
  });

  it('flags a stamped section on a beats song as real drift', () => {
    const f = auditSectionPositions(beatsSong, healthy())!;
    expect(f.inSlotUnits).toBe(true);
    expect(f.stampMismatch).toBe('section-slots-song-beats');
  });

  it('flags an unstamped section on an eighths song more mildly', () => {
    const sec = legacy({
      chordPlacements: materializeChordPlacements(legacy(), BEATS_PER_BAR, false),
    });
    expect(auditSectionPositions(eighthsSong, sec)!.stampMismatch).toBe(
      'section-unstamped-song-eighths',
    );
  });

  it('reports agreement for an unstamped section on a beats song', () => {
    const sec = legacy({
      chordPlacements: materializeChordPlacements(legacy(), BEATS_PER_BAR, false),
    });
    expect(auditSectionPositions(beatsSong, sec)!.stampMismatch).toBeNull();
  });
});

// =====================================================================
// Fix 5 — edited, split by shape
// =====================================================================

describe('edited — split by shape', () => {
  it('calls a bar reorder bar-only', () => {
    const sec = healthy();
    sec.chordPlacements = sec.chordPlacements!.map(p => ({
      ...p,
      barIndex: p.barIndex + 1,
    }));
    const f = auditSectionPositions(eighthsSong, sec)!;
    expect(f.edited.length).toBe(sec.chordPlacements!.length);
    for (const p of f.edited) expect(p.editShape).toBe('bar-only');
  });

  it('calls an in-bar drag beat-only', () => {
    const sec = healthy();
    sec.chordPlacements = sec.chordPlacements!.map((p, i) =>
      i === 0 ? { ...p, beatPos: 3 } : p,
    );
    const f = auditSectionPositions(eighthsSong, sec)!;
    expect(f.edited).toHaveLength(1);
    expect(f.edited[0].editShape).toBe('beat-only');
  });

  it('calls a move across bars both', () => {
    const sec = healthy();
    sec.chordPlacements = sec.chordPlacements!.map((p, i) =>
      i === 0 ? { ...p, barIndex: p.barIndex + 2, beatPos: 3 } : p,
    );
    const f = auditSectionPositions(eighthsSong, sec)!;
    expect(f.edited).toHaveLength(1);
    expect(f.edited[0].editShape).toBe('both');
  });

  it('skips hand-added placements entirely', () => {
    const sec = healthy();
    sec.chordPlacements = [
      ...sec.chordPlacements!,
      {
        id: 'a-random-uuid',
        arrangementId: BASIC_ARRANGEMENT_ID,
        barIndex: 0,
        beatPos: 3,
        beats: 2,
        chord: cf('2', 1),
      },
    ];
    const f = auditSectionPositions(eighthsSong, sec)!;
    expect(f.handAdded).toBe(1);
    expect(f.edited).toEqual([]);
  });
});

// =====================================================================
// Bars, and the whole-song view
// =====================================================================

describe('bar accounting', () => {
  it('reports a bar the section has lost', () => {
    const spanning = legacy({ phrases: [phraseWithChords([cf('1', 6), cf('4', 2)])] });
    const correct = materializeChordPlacements(spanning, BEATS_PER_BAR, true);
    expect(correct.map(p => p.beatPos)).toEqual([0, 2]);
    const broken = {
      ...spanning,
      chordPlacements: correct.map(p => ({ ...p, beatPos: p.beatPos * 2 })),
      eighthsDurationVersion: EIGHTHS_DURATION_VERSION,
    } as SongSection;
    const f = auditSectionPositions(eighthsSong, broken)!;
    expect(f.barsNow).toBe(1);
    expect(f.barsIfRepaired).toBe(2);
  });

  it('does not claim a lost bar when the last bar stays anchored', () => {
    const f = auditSectionPositions(eighthsSong, damaged())!;
    expect(f.invisible.length).toBeGreaterThan(0);
    expect(f.barsIfRepaired).toBe(f.barsNow);
  });
});

describe('auditSongPositions', () => {
  const withAnchor = (song: Song, sectionId: string, barIndex: number): Song =>
    ({
      ...song,
      lyricLines: [
        {
          id: 'l1',
          kind: 'lyric',
          text: 'oh',
          syllables: [{ id: 'sy1', text: 'oh', anchor: { sectionId, barIndex, beatPos: 0 } }],
        },
      ],
    }) as Song;

  it('counts anchors in a damaged section', () => {
    const f = auditSongPositions(withAnchor(eighthsSong, 'sec-1', 0), [damaged()]);
    expect(f.damagedPlacements).toBeGreaterThan(0);
    expect(f.anchorsInDamagedSections).toBe(1);
  });

  it('reports an orphaned anchor', () => {
    const f = auditSongPositions(withAnchor(eighthsSong, 'sec-1', 5), [damaged()]);
    expect(f.orphanedAnchors).toHaveLength(1);
  });

  it('reports a healthy eighths song as entirely clean', () => {
    const f = auditSongPositions(withAnchor(eighthsSong, 'sec-1', 0), [healthy()]);
    expect(f.damagedPlacements).toBe(0);
    expect(f.ambiguousPlacements).toBe(0);
    expect(f.editedPlacements).toBe(0);
    expect(f.stampMismatches).toBe(0);
    expect(f.orphanedAnchors).toEqual([]);
    expect(f.barsLost).toBe(0);
  });

  it('REGRESSION — a beats song with stepper edits reports zero damage', () => {
    // Reproduces the five false positives the first detector produced:
    // a song never on eighths, with durations set to 2 and 4 by hand
    // and a chord dragged from beat 1 to beat 2.
    const sec = healthyEven(false);
    sec.chordPlacements = sec.chordPlacements!.map((p, i) => ({
      ...p,
      beats: i === 0 ? 4 : 2,
      beatPos: p.beatPos === 1 ? 2 : p.beatPos,
    }));
    const f = auditSongPositions(beatsSong, [sec]);
    expect(f.damagedPlacements).toBe(0);
    expect(f.ambiguousPlacements).toBe(0);
    expect(f.doubleDoubledPlacements).toBe(0);
    expect(f.stampMismatches).toBe(0);
    // The edits are still visible — as edits.
    expect(f.editedPlacements).toBeGreaterThan(0);
  });
});
