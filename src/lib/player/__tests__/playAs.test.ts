/**
 * Play as, and what was stored before it.
 *
 * =====================================================================
 * SILAS'S ANSWERS OF 13 SEP 2026, AS WRITTEN.
 *
 * An old "broken" preference reads as Up. Each attempt keeps recording
 * blocked or broken, with no new stored value. The row reads Together ·
 * Up · Down · Up and Down, with a capital D. And a run lets each note go
 * just after the next one sounds.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { seqSchedule } from '../../audio';
import {
  DEFAULT_PLAYER_SETTINGS, PLAY_AS_OPTIONS, playAsFrom, playStyleOf,
} from '../settings';

describe('what was stored reads as Play as', () => {
  it('reads an old broken as Up, and an old blocked as Together', () => {
    expect(playAsFrom('broken')).toBe('up');
    expect(playAsFrom('blocked')).toBe('together');
  });

  it('reads its own four values as themselves', () => {
    for (const { id } of PLAY_AS_OPTIONS) expect(playAsFrom(id)).toBe(id);
  });

  it('reads anything else as Together', () => {
    expect(playAsFrom(undefined)).toBe('together');
    expect(playAsFrom('sideways')).toBe('together');
  });
});

describe('an attempt still records blocked or broken', () => {
  it('records Together as blocked and every run as broken', () => {
    expect(playStyleOf('together')).toBe('blocked');
    expect(playStyleOf('up')).toBe('broken');
    expect(playStyleOf('down')).toBe('broken');
    expect(playStyleOf('upDown')).toBe('broken');
  });
});

describe('the row', () => {
  it('is Silas\'s four words in his order, opening on Together', () => {
    expect(PLAY_AS_OPTIONS.map(o => o.label))
      .toEqual(['Together', 'Up', 'Down', 'Up and Down']);
    expect(DEFAULT_PLAYER_SETTINGS.playAs).toBe('together');
  });
});

describe('a run lets go just after the next note', () => {
  // One beat a second, so the numbers read as seconds.
  const SEC_PER_BEAT = 1;

  it('rings each note of a run for its release, not for the whole slot', () => {
    // "Notes in a run release just after the next one sounds; no long
    // bleed." A three-note run half a beat apart, each held 0.6.
    const { steps } = seqSchedule(
      [{ intervals: [60, 64, 67], beats: 2, roll: 0.5, release: 0.6 }],
      0, SEC_PER_BEAT, 0,
    );
    expect(steps[0].notes.map(n => n.duration)).toEqual([0.6, 0.6, 0.6]);
    expect(steps[0].notes.map(n => n.at)).toEqual([0, 0.5, 1]);
  });

  it('leaves a struck chord ringing for its slot', () => {
    const { steps } = seqSchedule(
      [{ intervals: [60, 64, 67], beats: 2 }],
      0, SEC_PER_BEAT, 0,
    );
    for (const note of steps[0].notes) expect(note.duration).toBeCloseTo(1.9, 10);
  });
});
