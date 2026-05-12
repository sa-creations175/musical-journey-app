// @vitest-environment jsdom
/**
 * Unit tests for splitRepertoireAllocation — pins the 2:1 ratio,
 * the 15-min spotlight floor, the < 15-min single-block collapse,
 * and the TBD/missing-candidate edge cases.
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
    maintenanceSong: partial.maintenanceSong,
    maintenanceReadiness: partial.maintenanceSong ? 'needs-chords' : null,
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

  it('45-min Repertoire → 30 min spotlight + 15 min maintenance (2:1)', () => {
    const ctx = splitCtx({
      spotlight: specificSpotlight(),
      maintenanceSong: maint(),
    });
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('spotlight');
    expect(out[0].plannedSeconds).toBe(30 * 60);
    expect(out[1].kind).toBe('maintenance');
    expect(out[1].plannedSeconds).toBe(15 * 60);
  });

  it('60-min Repertoire → 40/20 split', () => {
    const ctx = splitCtx({
      spotlight: specificSpotlight(),
      maintenanceSong: maint(),
    });
    const out = splitRepertoireAllocation(60 * 60, ctx);
    expect(out[0].plannedSeconds).toBe(40 * 60);
    expect(out[1].plannedSeconds).toBe(20 * 60);
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
    expect(out[0].label).toBe('Set up Mirror');
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
    expect(out[0].label).toBe('Set up Lift Up');
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
    expect(out[0].label).toBe('Chord Quiz — Mirror');
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
    // 60 min → 40 spotlight + 20 maint. Both halves ready on keys
    // → quiz + practice on each. 4 blocks total.
    expect(out).toHaveLength(4);
    expect(out.map(b => b.kind)).toEqual([
      'chord-quiz', 'spotlight', 'chord-quiz', 'maintenance',
    ]);
    expect(out[0].plannedSeconds).toBe(3 * 60);
    expect(out[1].plannedSeconds).toBe(40 * 60 - 3 * 60);
    expect(out[2].plannedSeconds).toBe(3 * 60);
    expect(out[3].plannedSeconds).toBe(20 * 60 - 3 * 60);
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
