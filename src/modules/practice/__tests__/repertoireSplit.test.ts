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

describe('splitRepertoireAllocation', () => {
  it('returns empty when there is neither spotlight nor maintenance', () => {
    expect(
      splitRepertoireAllocation(45 * 60, {
        spotlight: null,
        maintenanceSong: null,
      }),
    ).toEqual([]);
  });

  it('45-min Repertoire → 30 min spotlight + 15 min maintenance (2:1)', () => {
    const ctx: RepertoireSplitContext = {
      spotlight: specificSpotlight(),
      maintenanceSong: maint(),
    };
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('spotlight');
    expect(out[0].plannedSeconds).toBe(30 * 60);
    expect(out[1].kind).toBe('maintenance');
    expect(out[1].plannedSeconds).toBe(15 * 60);
  });

  it('60-min Repertoire → 40/20 split', () => {
    const ctx: RepertoireSplitContext = {
      spotlight: specificSpotlight(),
      maintenanceSong: maint(),
    };
    const out = splitRepertoireAllocation(60 * 60, ctx);
    expect(out[0].plannedSeconds).toBe(40 * 60);
    expect(out[1].plannedSeconds).toBe(20 * 60);
  });

  it('20-min Repertoire clamps spotlight at 15-min floor → 15/5', () => {
    // 2/3 of 20 = ~13.33 min, below floor. Floor kicks in.
    const ctx: RepertoireSplitContext = {
      spotlight: specificSpotlight(),
      maintenanceSong: maint(),
    };
    const out = splitRepertoireAllocation(20 * 60, ctx);
    expect(out[0].plannedSeconds).toBe(15 * 60);
    expect(out[1].plannedSeconds).toBe(5 * 60);
  });

  it('14-min Repertoire (under 15-min threshold) → single spotlight block', () => {
    const ctx: RepertoireSplitContext = {
      spotlight: specificSpotlight(),
      maintenanceSong: maint(),
    };
    const out = splitRepertoireAllocation(14 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('spotlight');
    expect(out[0].plannedSeconds).toBe(14 * 60);
  });

  it('TBD spotlight + maintenance → both blocks, spotlight labeled "TBD" and flagged', () => {
    const ctx: RepertoireSplitContext = {
      spotlight: tbdSpotlight(),
      maintenanceSong: maint(),
    };
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe('Song of the month: TBD');
    expect(out[0].isTbdSpotlight).toBe(true);
    expect(out[0].songId).toBeNull();
    expect(out[1].kind).toBe('maintenance');
  });

  it('Spotlight only (no maintenance) → full time to spotlight', () => {
    const ctx: RepertoireSplitContext = {
      spotlight: specificSpotlight(),
      maintenanceSong: null,
    };
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('spotlight');
    expect(out[0].plannedSeconds).toBe(45 * 60);
  });

  it('Maintenance only (no spotlight umbrella) → full time to maintenance', () => {
    const ctx: RepertoireSplitContext = {
      spotlight: null,
      maintenanceSong: maint(),
    };
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('maintenance');
    expect(out[0].plannedSeconds).toBe(45 * 60);
  });

  it('Spotlight label carries the song title for specific picks', () => {
    const ctx: RepertoireSplitContext = {
      spotlight: specificSpotlight('s1', 'Take Me to the King'),
      maintenanceSong: maint('s2', 'Lift Up Your Heads'),
    };
    const out = splitRepertoireAllocation(45 * 60, ctx);
    expect(out[0].label).toBe('Song of the month: Take Me to the King');
    expect(out[1].label).toBe('Maintenance: Lift Up Your Heads');
  });

  it('Split seconds always sum to the total', () => {
    const totals = [14, 15, 20, 30, 45, 60, 90].map(m => m * 60);
    const ctx: RepertoireSplitContext = {
      spotlight: specificSpotlight(),
      maintenanceSong: maint(),
    };
    for (const total of totals) {
      const out = splitRepertoireAllocation(total, ctx);
      const sum = out.reduce((s, b) => s + b.plannedSeconds, 0);
      expect(sum).toBe(total);
    }
  });
});
