// @vitest-environment jsdom
/**
 * Unit tests for splitRepertoireAllocation — pins the 3:1 ratio,
 * the 15-min spotlight floor, the post-split maintenance-under-5-
 * min drop, and the TBD/missing-candidate edge cases. Ratio
 * shifted 2/3 → 3/4 in the May 2026 rebalance so a 60-min
 * Repertoire allocation lands at the design intent of 45 min
 * spotlight + 15 min maintenance.
 */
import { describe, expect, it } from 'vitest';
import {
  splitRepertoireAllocation,
  type RepertoireSplitContext,
} from '../repertoireSplit';
import type { QueueSlot } from '../../repertoire/songOfMonth';
import type { Song } from '../../../lib/db';

function specificSpotlight(songId = 'spotlight-song', title = 'Spotlight'): QueueSlot {
  return {
    slotIndex: 1,
    kind: 'song',
    refId: songId,
    goalId: 'g-1',
    displayTitle: title,
  };
}
function tbdSpotlight(): QueueSlot {
  return {
    slotIndex: 1,
    kind: 'tbd',
    refId: null,
    goalId: 'g-1',
    displayTitle: 'TBD',
  };
}
function maint(songId = 'maint-song', title = 'Maint'): Song {
  return {
    id: songId,
    title,
    artist: '',
    stage: 'learning',
    audioLinks: [],
    addedDate: 0,
    learningOrder: 2,
  };
}

/** Build a complete RepertoireSplitContext from a partial. The
 *  time-allocation tests below default readiness to 'needs-chords'
 *  so each half produces a single practice block — that's the
 *  baseline the legacy split math was written against. Readiness-
 *  driven behavior (setup blocks, chord-quiz prepend) has its own
 *  describe block below with explicit readiness values. */
function splitCtx(
  partial: Pick<RepertoireSplitContext, 'spotlight' | 'maintenanceSong'>,
): RepertoireSplitContext {
  return {
    spotlight: partial.spotlight,
    spotlightSong: null,
    spotlightReadiness: partial.spotlight && partial.spotlight.kind === 'song'
      ? 'needs-chords' : null,
    spotlightPostComfortable: null,
    maintenanceSong: partial.maintenanceSong,
    maintenanceReadiness: partial.maintenanceSong ? 'needs-chords' : null,
    maintenancePostComfortable: null,
    context: 'mixed',
  };
}

describe('splitRepertoireAllocation', () => {
  it('returns empty when there is neither spotlight nor maintenance', () => {
    expect(
      splitRepertoireAllocation(
        45 * 60,
        splitCtx({ spotlight: null, maintenanceSong: null }),
      ),
    ).toEqual([]);
  });

  it('60-min Repertoire → 45 min spotlight + 15 min maintenance (3:1)', () => {
    const ctx = splitCtx({
      spotlight: specificSpotlight(),
      maintenanceSong: maint(),
    });
    const out = splitRepertoireAllocation(60 * 60, ctx);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('spotlight');
    expect(out[0].plannedSeconds).toBe(45 * 60);
    expect(out[1].kind).toBe('maintenance');
    expect(out[1].plannedSeconds).toBe(15 * 60);
  });

  it('non-multiple-of-4 Repertoire splits via Math.round, not floor', () => {
    // 45 × 60 = 2700s. round(2700 × 0.75) = 2025s = 33m45s
    // (spotlight). maintenance = 2700 − 2025 = 675s = 11m15s.
    // Pinning the second-granularity result so a future tweak to
    // the split math (Math.floor / Math.ceil) doesn't silently
    // drift away from the design intent.
    const ctx = splitCtx({
      spotlight: specificSpotlight(),
      maintenanceSong: maint(),
    });
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out).toHaveLength(2);
    expect(out[0].plannedSeconds).toBe(2025);
    expect(out[1].plannedSeconds).toBe(675);
  });

  it('20-min Repertoire clamps spotlight at 15-min floor → 15/5', () => {
    // 2/3 of 20 = ~13.33 min, below floor. Floor kicks in.
    const ctx = splitCtx({
      spotlight: specificSpotlight(),
      maintenanceSong: maint(),
    });
    const out = splitRepertoireAllocation(20 * 60, ctx);
    expect(out[0].plannedSeconds).toBe(15 * 60);
    expect(out[1].plannedSeconds).toBe(5 * 60);
  });

  it('14-min Repertoire (under 15-min threshold) → single spotlight block', () => {
    const ctx = splitCtx({
      spotlight: specificSpotlight(),
      maintenanceSong: maint(),
    });
    const out = splitRepertoireAllocation(14 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('spotlight');
    expect(out[0].plannedSeconds).toBe(14 * 60);
  });

  it('TBD spotlight + maintenance → both blocks, spotlight labeled "TBD" and flagged', () => {
    const ctx = splitCtx({
      spotlight: tbdSpotlight(),
      maintenanceSong: maint(),
    });
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe('Song of the month: TBD');
    expect(out[0].isTbdSpotlight).toBe(true);
    expect(out[0].songId).toBeNull();
    expect(out[1].kind).toBe('maintenance');
  });

  it('Spotlight only (no maintenance) → full time to spotlight', () => {
    const ctx = splitCtx({
      spotlight: specificSpotlight(),
      maintenanceSong: null,
    });
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('spotlight');
    expect(out[0].plannedSeconds).toBe(45 * 60);
  });

  it('Maintenance only (no spotlight umbrella) → full time to maintenance', () => {
    const ctx = splitCtx({
      spotlight: null,
      maintenanceSong: maint(),
    });
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('maintenance');
    expect(out[0].plannedSeconds).toBe(45 * 60);
  });

  it('Spotlight label carries the song title for specific picks', () => {
    const ctx = splitCtx({
      spotlight: specificSpotlight('s1', 'Take Me to the King'),
      maintenanceSong: maint('s2', 'Lift Up Your Heads'),
    });
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out[0].label).toBe('Song of the month: Take Me to the King');
    expect(out[1].label).toBe('Maintenance: Lift Up Your Heads');
  });

  it('Split seconds always sum to the total', () => {
    const totals = [14, 15, 20, 30, 45, 60, 90].map(m => m * 60);
    const ctx = splitCtx({
      spotlight: specificSpotlight(),
      maintenanceSong: maint(),
    });
    for (const total of totals) {
      const out = splitRepertoireAllocation(total, ctx);
      const sum = out.reduce((s, b) => s + b.plannedSeconds, 0);
      expect(sum).toBe(total);
    }
  });
});

// -------------------------------------------------------------------
// Readiness-driven block selection
// -------------------------------------------------------------------

describe('splitRepertoireAllocation — readiness routing', () => {
  it('needs-setup spotlight → setup block in place of practice', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('song-A', 'Mirror'),
        maintenanceSong: null,
      }),
      spotlightReadiness: 'needs-setup',
    };
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('setup');
    expect(out[0].label).toBe('Set up Mirror — add sections and chords to unlock practice');
    expect(out[0].songId).toBe('song-A');
    expect(out[0].plannedSeconds).toBe(45 * 60);
  });

  it('needs-setup maintenance → setup block, no chord quiz', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: null,
        maintenanceSong: maint('m1', 'Lift Up'),
      }),
      maintenanceReadiness: 'needs-setup',
    };
    const out = splitRepertoireAllocation(20 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('setup');
    expect(out[0].label).toBe('Set up Lift Up — add sections and chords to unlock practice');
  });

  it('ready spotlight on keys/mixed → chord-quiz (3min) + practice (rest)', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('s1', 'Mirror'),
        maintenanceSong: null,
      }),
      spotlightReadiness: 'ready',
      context: 'mixed',
    };
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('chord-quiz');
    expect(out[0].plannedSeconds).toBe(3 * 60);
    expect(out[0].label).toBe('Practice memorizing the chord progression — Mirror');
    expect(out[1].kind).toBe('spotlight');
    expect(out[1].plannedSeconds).toBe(45 * 60 - 3 * 60);
  });

  it('ready spotlight on laptop → chord-quiz only, full half', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('s1', 'Mirror'),
        maintenanceSong: null,
      }),
      spotlightReadiness: 'ready',
      context: 'laptop',
    };
    const out = splitRepertoireAllocation(20 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('chord-quiz');
    expect(out[0].plannedSeconds).toBe(20 * 60);
  });

  it('ready spotlight on phone → chord-quiz only', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('s1', 'Mirror'),
        maintenanceSong: null,
      }),
      spotlightReadiness: 'ready',
      context: 'phone',
    };
    const out = splitRepertoireAllocation(15 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('chord-quiz');
  });

  it('ready + tiny keys half (≤ 3min) → single practice block, no quiz', () => {
    // Chord-quiz seconds (180) consume the entire half; we'd be
    // left with zero practice time, which would be pointless.
    // Fall back to one practice block at the full half duration.
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: null,
        maintenanceSong: maint('m1', 'Tight'),
      }),
      maintenanceReadiness: 'ready',
      context: 'mixed',
    };
    const out = splitRepertoireAllocation(2 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('maintenance');
    expect(out[0].plannedSeconds).toBe(2 * 60);
  });

  it('ready spotlight + ready maintenance on keys → quiz/practice quartet', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('s1', 'Mirror'),
        maintenanceSong: maint('m1', 'Lift Up'),
      }),
      spotlightReadiness: 'ready',
      maintenanceReadiness: 'ready',
      context: 'keys',
    };
    const out = splitRepertoireAllocation(60 * 60, ctx);
    // 60 min → 45 spotlight + 15 maint (3/4 split). Both halves
    // ready on keys → 3-min quiz + practice on each. 4 blocks.
    expect(out).toHaveLength(4);
    expect(out.map(b => b.kind)).toEqual([
      'chord-quiz', 'spotlight', 'chord-quiz', 'maintenance',
    ]);
    expect(out[0].plannedSeconds).toBe(3 * 60);
    expect(out[1].plannedSeconds).toBe(45 * 60 - 3 * 60);
    expect(out[2].plannedSeconds).toBe(3 * 60);
    expect(out[3].plannedSeconds).toBe(15 * 60 - 3 * 60);
  });

  it('TBD spotlight ignores readiness (stays as TBD)', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: tbdSpotlight(),
        maintenanceSong: null,
      }),
      // Doesn't matter — TBD has no song to evaluate.
      spotlightReadiness: null,
    };
    const out = splitRepertoireAllocation(30 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('spotlight');
    expect(out[0].isTbdSpotlight).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Scale-prep blocks — primed-key warm-up before song practice
// ---------------------------------------------------------------------

describe('splitRepertoireAllocation — scale-prep injection', () => {
  function songWithKey(songId: string, title: string, key: string): Song {
    return { ...maint(songId, title), key };
  }

  it('injects a 90s scale-prep block before needs-chords spotlight on keys', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('s1', 'Mirror'),
        maintenanceSong: null,
      }),
      spotlightSong: songWithKey('s1', 'Mirror', 'Gb'),
      spotlightReadiness: 'needs-chords',
      context: 'keys',
    };
    const out = splitRepertoireAllocation(20 * 60, ctx);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('scale-prep');
    expect(out[0].plannedSeconds).toBe(90);
    expect(out[0].label).toBe('SCALES — prep for Mirror · Gb (major + major pent)');
    expect(out[0].why).toBe('Prime your hands and ears before playing in Gb');
    expect(out[1].kind).toBe('spotlight');
    expect(out[1].plannedSeconds).toBe(20 * 60 - 90);
  });

  it('scale-prep emits scale itemRefs for the song\'s key (major: major + major-pent sp1)', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('s1', 'Mirror'),
        maintenanceSong: null,
      }),
      spotlightSong: songWithKey('s1', 'Mirror', 'Gb'),
      spotlightReadiness: 'needs-chords',
      context: 'keys',
    };
    const out = splitRepertoireAllocation(20 * 60, ctx);
    const prep = out.find(b => b.kind === 'scale-prep')!;
    expect(prep.scaleItemRefs).toEqual([
      'scale:major:Gb',
      'scale:major-pentatonic:1:Gb',
    ]);
  });

  it('scale-prep emits scale itemRefs for minor-key songs (natural-minor + minor-pent sp1)', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('s1', 'Sade Tune'),
        maintenanceSong: null,
      }),
      spotlightSong: songWithKey('s1', 'Sade Tune', 'A minor'),
      spotlightReadiness: 'needs-chords',
      context: 'keys',
    };
    const out = splitRepertoireAllocation(20 * 60, ctx);
    const prep = out.find(b => b.kind === 'scale-prep')!;
    expect(prep.scaleItemRefs).toEqual([
      'scale:natural-minor:A',
      'scale:minor-pentatonic:1:A',
    ]);
  });

  it('inserts the prep AFTER chord-quiz on a ready-on-keys spotlight', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('s1', 'Mirror'),
        maintenanceSong: null,
      }),
      spotlightSong: songWithKey('s1', 'Mirror', 'B'),
      spotlightReadiness: 'ready',
      context: 'keys',
    };
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out.map(b => b.kind)).toEqual(['chord-quiz', 'scale-prep', 'spotlight']);
    // Chord-quiz keeps its 180s; prep takes 90s; spotlight gets the rest.
    expect(out[0].plannedSeconds).toBe(180);
    expect(out[1].plannedSeconds).toBe(90);
    expect(out[2].plannedSeconds).toBe(45 * 60 - 180 - 90);
  });

  it('uses minor-key scales when the song key parses as minor (defensive fallback)', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('s1', 'Sade Tune'),
        maintenanceSong: null,
      }),
      spotlightSong: songWithKey('s1', 'Sade Tune', 'A minor'),
      spotlightReadiness: 'needs-chords',
      context: 'keys',
    };
    const out = splitRepertoireAllocation(20 * 60, ctx);
    const prep = out.find(b => b.kind === 'scale-prep');
    expect(prep).toBeDefined();
    expect(prep!.label).toBe(
      'SCALES — prep for Sade Tune · A (natural minor + minor pent)',
    );
  });

  it('skips prep on laptop/phone (no piano)', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('s1', 'Mirror'),
        maintenanceSong: null,
      }),
      spotlightSong: songWithKey('s1', 'Mirror', 'B'),
      spotlightReadiness: 'needs-chords',
      context: 'laptop',
    };
    const out = splitRepertoireAllocation(20 * 60, ctx);
    expect(out.some(b => b.kind === 'scale-prep')).toBe(false);
  });

  it('skips prep when allocation is below the 4-min floor', () => {
    // 3 min spotlight + nothing else. Prep would dominate; we'd
    // rather give the user a single short practice block.
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('s1', 'Mirror'),
        maintenanceSong: null,
      }),
      spotlightSong: songWithKey('s1', 'Mirror', 'B'),
      spotlightReadiness: 'needs-chords',
      context: 'keys',
    };
    const out = splitRepertoireAllocation(3 * 60, ctx);
    expect(out.some(b => b.kind === 'scale-prep')).toBe(false);
  });

  it('skips prep on setup blocks (no song-playing block follows)', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('s1', 'Mirror'),
        maintenanceSong: null,
      }),
      spotlightSong: songWithKey('s1', 'Mirror', 'B'),
      spotlightReadiness: 'needs-setup',
      context: 'keys',
    };
    const out = splitRepertoireAllocation(20 * 60, ctx);
    expect(out.map(b => b.kind)).toEqual(['setup']);
  });

  it('skips prep when the song has no canonical key', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: specificSpotlight('s1', 'Mirror'),
        maintenanceSong: null,
      }),
      // Song.key is null → prep can't pin a tonality, falls through
      // to a single practice block.
      spotlightSong: maint('s1', 'Mirror'),
      spotlightReadiness: 'needs-chords',
      context: 'keys',
    };
    const out = splitRepertoireAllocation(20 * 60, ctx);
    expect(out.map(b => b.kind)).toEqual(['spotlight']);
  });

  it('injects prep before maintenance song practice too', () => {
    const ctx: RepertoireSplitContext = {
      ...splitCtx({
        spotlight: null,
        maintenanceSong: songWithKey('m1', 'Lift Up', 'F'),
      }),
      maintenanceReadiness: 'needs-chords',
      context: 'mixed',
    };
    const out = splitRepertoireAllocation(15 * 60, ctx);
    expect(out.map(b => b.kind)).toEqual(['scale-prep', 'maintenance']);
    expect(out[0].label).toBe('SCALES — prep for Lift Up · F (major + major pent)');
  });
});

// ---------------------------------------------------------------------
// Post-comfortable progression — whole-song-run + expand-keys blocks
// ---------------------------------------------------------------------

describe('splitRepertoireAllocation — post-comfortable progression', () => {
  it('deepen path → whole-song-run block (NOT a cell/practice block)', () => {
    const ctx: RepertoireSplitContext = {
      spotlight: specificSpotlight('s-deep', 'Mirror'),
      spotlightSong: maint('s-deep', 'Mirror'),
      spotlightReadiness: 'ready',
      spotlightPostComfortable: { kind: 'whole-song-run', keyName: 'C' },
      maintenanceSong: null,
      maintenanceReadiness: null,
      maintenancePostComfortable: null,
      context: 'mixed',
    };
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('whole-song-run');
    expect(out[0].label).toBe('Run through Mirror');
    expect(out[0].why).toContain('C');
    expect(out[0].songId).toBe('s-deep');
    // Specifically — NOT a chord-quiz + practice combo (that's the
    // pre-comfortable ready path on keys/mixed).
    expect(out.some(b => b.kind === 'chord-quiz')).toBe(false);
    expect(out.some(b => b.kind === 'spotlight')).toBe(false);
  });

  it('expand-keys with un-mastered next key → cell-drill block on the new key', () => {
    // The prep is keyed off the expansion key (decision.keyName), so
    // it surfaces here even though the song's home key isn't set —
    // a fresh expansion in F gets a prep in F regardless of what
    // home-key state the song record carries. The practice block
    // labels itself with the expansion target.
    const ctx: RepertoireSplitContext = {
      spotlight: specificSpotlight('s-exp', 'Alpha & Omega'),
      spotlightSong: maint('s-exp', 'Alpha & Omega'),
      spotlightReadiness: 'ready',
      spotlightPostComfortable: { kind: 'cell-drill-expansion', keyName: 'F' },
      maintenanceSong: null,
      maintenanceReadiness: null,
      maintenancePostComfortable: null,
      context: 'mixed',
    };
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out.map(b => b.kind)).toEqual(['scale-prep', 'maintenance']);
    expect(out[1].label).toContain('Expand to F');
    expect(out[1].label).toContain('Alpha & Omega');
  });

  it('expand-keys scale-prep uses the EXPANSION key (decision.keyName), not the song\'s home key', () => {
    // Song's home key is C (already mastered — that's how it
    // reached expand-keys mode). The next un-mastered key in the
    // walk is F. The prep block must drill F scales, not C scales:
    // the user is about to play the song in F.
    const ctx: RepertoireSplitContext = {
      spotlight: specificSpotlight('s-exp', 'Alpha & Omega'),
      spotlightSong: { ...maint('s-exp', 'Alpha & Omega'), key: 'C' },
      spotlightReadiness: 'ready',
      spotlightPostComfortable: { kind: 'cell-drill-expansion', keyName: 'F' },
      maintenanceSong: null,
      maintenanceReadiness: null,
      maintenancePostComfortable: null,
      context: 'keys',
    };
    const out = splitRepertoireAllocation(45 * 60, ctx);
    const prep = out.find(b => b.kind === 'scale-prep');
    expect(prep).toBeDefined();
    expect(prep!.label).toBe(
      'SCALES — prep for Alpha & Omega · F (major + major pent)',
    );
    expect(prep!.scaleItemRefs).toEqual([
      'scale:major:F',
      'scale:major-pentatonic:1:F',
    ]);
    // Defensive: NOT keyed off the home key (C).
    expect(prep!.scaleItemRefs).not.toContain('scale:major:C');
  });

  it('expand-keys whole-song-run scale-prep STILL uses the home key (deepen-style fallback)', () => {
    // A finished circle-of-4ths walk degrades cell-drill-expansion
    // to whole-song-run in the original key (per songProgression).
    // Prep should match the practice key — the song's home key — so
    // this branch keeps its songKey-driven prep.
    const ctx: RepertoireSplitContext = {
      spotlight: specificSpotlight('s-exp', 'Alpha & Omega'),
      spotlightSong: { ...maint('s-exp', 'Alpha & Omega'), key: 'C' },
      spotlightReadiness: 'ready',
      spotlightPostComfortable: { kind: 'whole-song-run', keyName: 'C' },
      maintenanceSong: null,
      maintenanceReadiness: null,
      maintenancePostComfortable: null,
      context: 'keys',
    };
    const out = splitRepertoireAllocation(45 * 60, ctx);
    const prep = out.find(b => b.kind === 'scale-prep');
    expect(prep).toBeDefined();
    expect(prep!.scaleItemRefs).toEqual([
      'scale:major:C',
      'scale:major-pentatonic:1:C',
    ]);
  });

  it('maintenance path that decided "skip" returns no slot blocks (caller falls back)', () => {
    // A maintenance slot whose decision is 'skip' means the song
    // is on the maintenance path and within the 7-day floor —
    // splitRepertoireAllocation passes the slot through the
    // readiness fallback, which produces the standard practice
    // block. The KEY behavior pinned here is that the slot is NOT
    // treated as a whole-song-run. (The picker in
    // loadRepertoireSplitContext is what truly suppresses skipped
    // songs end-to-end; splitRepertoireAllocation is exercised in
    // isolation here.)
    const song = maint('s-maint', 'No Weapon');
    const ctx: RepertoireSplitContext = {
      spotlight: null,
      spotlightSong: null,
      spotlightReadiness: null,
      spotlightPostComfortable: null,
      maintenanceSong: song,
      maintenanceReadiness: 'needs-chords',
      maintenancePostComfortable: { kind: 'skip' },
      context: 'mixed',
    };
    const out = splitRepertoireAllocation(20 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('maintenance');
    expect(out[0].kind).not.toBe('whole-song-run');
  });

  it('maintenance path that decided whole-song-run → whole-song-run block (weekly floor met)', () => {
    const ctx: RepertoireSplitContext = {
      spotlight: null,
      spotlightSong: null,
      spotlightReadiness: null,
      spotlightPostComfortable: null,
      maintenanceSong: maint('s-maint', 'How Great'),
      maintenanceReadiness: 'ready',
      maintenancePostComfortable: { kind: 'whole-song-run', keyName: 'G' },
      context: 'mixed',
    };
    const out = splitRepertoireAllocation(20 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('whole-song-run');
    expect(out[0].label).toBe('Run through How Great');
    expect(out[0].why).toContain('G');
  });

  it('post-comfortable spotlight + post-comfortable maintenance → both whole-song-run blocks', () => {
    const ctx: RepertoireSplitContext = {
      spotlight: specificSpotlight('s-1', 'Song One'),
      spotlightSong: maint('s-1', 'Song One'),
      spotlightReadiness: 'ready',
      spotlightPostComfortable: { kind: 'whole-song-run', keyName: 'C' },
      maintenanceSong: maint('s-2', 'Song Two'),
      maintenanceReadiness: 'ready',
      maintenancePostComfortable: { kind: 'whole-song-run', keyName: 'D' },
      context: 'mixed',
    };
    const out = splitRepertoireAllocation(60 * 60, ctx);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('whole-song-run');
    expect(out[0].label).toBe('Run through Song One');
    expect(out[1].kind).toBe('whole-song-run');
    expect(out[1].label).toBe('Run through Song Two');
    // Time split preserved: 3/4 to spotlight, 1/4 to maintenance.
    expect(out[0].plannedSeconds).toBe(45 * 60);
    expect(out[1].plannedSeconds).toBe(15 * 60);
  });
});
