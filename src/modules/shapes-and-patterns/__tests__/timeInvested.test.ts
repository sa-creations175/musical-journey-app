/**
 * Time invested, per sub-module.
 *
 * =====================================================================
 * TWO KINDS OF `skillId`, AND BOTH HAVE TO LAND. Scales, voice leading
 * and mental visualisation stand their canonical itemRef in for the
 * skill id, so a session names its own section. Chord shapes store a
 * `DrillSkill` row id, which says nothing until it is looked up — and
 * a sum that only handled the first kind would report chord shapes as
 * zero while every other section was right, which reads as "I have not
 * done any" rather than as a missing join.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import type { DrillSession, DrillSkill } from '../../../lib/db';
import { sectionForSession, shapesTimeInvested } from '../timeInvested';

const session = (skillId: string, durationSeconds: number): DrillSession => ({
  id: `dses-${skillId}-${durationSeconds}`,
  drillTypeId: skillId,
  skillId,
  hand: 'both',
  style: 'solid',
  durationSeconds,
  feelRating: 3,
  timestamp: 1_800_000_000_000,
});

const skill = (id: string, kind: DrillSkill['kind']): DrillSkill => ({
  id, kind, createdAt: 1,
} as DrillSkill);

describe('which section a session belongs to', () => {
  const kinds = new Map([['skill-1', 'chord-shape' as const]]);

  it('reads a self-naming itemRef straight off its prefix', () => {
    expect(sectionForSession('scale:major:C', kinds)).toBe('scales');
    expect(sectionForSession('vl:aba-251:Bb', kinds)).toBe('voice-leading');
    expect(sectionForSession('mv:seventh:maj7:root:C', kinds)).toBe('mental-viz');
  });

  it('joins a DrillSkill id back through the skills table', () => {
    expect(sectionForSession('skill-1', kinds)).toBe('chord-shapes');
  });

  it('drops a session whose skill is gone rather than guessing', () => {
    // A cleanup pass deletes skills and leaves sessions behind; adding
    // those into whichever section came first would invent time.
    expect(sectionForSession('skill-vanished', kinds)).toBeNull();
  });
});

describe('the sum', () => {
  it('adds each section’s own seconds, and nobody else’s', () => {
    const time = shapesTimeInvested(
      [
        session('scale:major:C', 90),
        session('scale:major:G', 30),
        session('vl:aba-251:Bb', 60),
        session('skill-1', 120),
        session('skill-1', 45),
        session('mv:seventh:maj7:root:C', 15),
      ],
      [skill('skill-1', 'chord-shape')],
    );
    expect(time.get('scales')).toBe(120);
    expect(time.get('voice-leading')).toBe(60);
    expect(time.get('chord-shapes')).toBe(165);
    expect(time.get('mental-viz')).toBe(15);
  });

  it('leaves a section with nothing logged ABSENT, not zero', () => {
    // A card shows a time it has measured or shows none; `0s` is a
    // measurement, and the wrong one.
    const time = shapesTimeInvested([session('scale:major:C', 60)], []);
    expect(time.has('scales')).toBe(true);
    expect(time.has('voice-leading')).toBe(false);
    expect(time.get('voice-leading')).toBeUndefined();
  });

  it('drops an orphaned session from every total', () => {
    const time = shapesTimeInvested([session('skill-gone', 999)], []);
    expect([...time.values()]).toEqual([]);
  });
});

describe('mental visualisation now writes a row to sum', () => {
  it('maps its three-way rating so it round-trips', async () => {
    // The drill rates flying / cruising / crawling; `DrillSession`
    // stores a four-point feel. The mapping has to come back out as
    // the rating the reader gave, or the spacing signal and the
    // session row would describe different reps.
    const { feelToRating } = await import('../drillModel');
    expect(feelToRating(4)).toBe('flying');
    expect(feelToRating(3)).toBe('cruising');
    expect(feelToRating(2)).toBe('crawling');
  });
});
