/**
 * Persistence, and what it refuses to let through.
 */
import { describe, expect, it } from 'vitest';
import { cleanPartial, resolveForNode, settingsForCard } from '../store';

describe('everything is re-validated on read', () => {
  it('drops a ceiling that would make a card unreachable', () => {
    expect(cleanPartial({ maintaining: { perBand: { fluent: { ceilingDays: 0 } } } }))
      .toEqual({});
    expect(cleanPartial({ maintaining: { perBand: { fluent: { ceilingDays: -5 } } } }))
      .toEqual({});
  });

  it('drops a growth factor that never grows', () => {
    // A factor of 1 or less gives a sequence with no end — the wait
    // would sit still or shrink forever.
    const at1 = cleanPartial({
      maintaining: { perBand: { fluent: { growth: { kind: 'multiply', factor: 1 } } } },
    });
    expect(at1).toEqual({});
    const ok = cleanPartial({
      maintaining: { perBand: { fluent: { growth: { kind: 'multiply', factor: 1.7 } } } },
    });
    expect(ok.maintaining?.perBand?.fluent?.growth).toEqual({ kind: 'multiply', factor: 1.7 });
  });

  it('keeps back-to-first, which is not a multiplier', () => {
    const p = cleanPartial({
      maintaining: { perBand: { 'needs-work': { growth: { kind: 'back-to-first' } } } },
    });
    expect(p.maintaining?.perBand?.['needs-work']?.growth).toEqual({ kind: 'back-to-first' });
  });

  it('rejects a tally of the wrong length or the wrong type', () => {
    expect(cleanPartial({ acquiring: { tally: [1, 2, 3] } })).toEqual({});
    expect(cleanPartial({ acquiring: { tally: 'nope' } })).toEqual({});
    const mixed = cleanPartial({ acquiring: { tally: [2, 'x', -1, 1, 0, 1] } });
    expect(mixed.acquiring?.tally).toEqual([2, 0, 0, 1, 0, 1]);
  });

  it('rejects an unknown miss policy rather than storing it', () => {
    expect(cleanPartial({ acquiring: { onWrong: 'explode' } })).toEqual({});
    expect(cleanPartial({ maintaining: { onWrong: 'explode' } })).toEqual({});
  });

  it('survives junk from another device without throwing', () => {
    expect(cleanPartial(null)).toEqual({});
    expect(cleanPartial(42)).toEqual({});
    expect(cleanPartial({ maintaining: null, acquiring: 7 })).toEqual({});
  });
});

describe('resolution through the tree', () => {
  it('gives a card its module settings when nothing is overridden', () => {
    const s = settingsForCard('harmonic-fluency', 'ks-4', {});
    expect(s.maintaining.firstWaitDays).toBe(2);
    expect(s.acquiring.tally).toEqual([2, 1, 0, 1, 0, 1]);
  });

  it('lets a submodule override reach only its own cards', () => {
    const overrides = {
      'reading.sig': { maintaining: { firstWaitDays: 9 } },
    };
    expect(settingsForCard('reading', 'sig:1s:major:name', overrides)
      .maintaining.firstWaitDays).toBe(9);
    expect(settingsForCard('reading', 'note:treble:3', overrides)
      .maintaining.firstWaitDays).toBe(2);
  });

  it('carries a module override down to every child', () => {
    const overrides = { 'ear-training': { stale: { graceDays: 21 } } };
    expect(settingsForCard('intervals', 'm3', overrides).stale.graceDays).toBe(21);
    expect(settingsForCard('chord-recognition', 'cmaj7', overrides).stale.graceDays).toBe(21);
  });
});

describe('the in-schedule switch reaches the scheduler', () => {
  it('turns a card off when its module is off', () => {
    const overrides = { 'ear-training': { inSchedule: false } };
    expect(settingsForCard('intervals', 'm3', overrides).inSchedule).toBe(false);
  });

  it('cannot be re-enabled by a child', () => {
    const overrides = {
      'ear-training': { inSchedule: false },
      'ear-training.intervals': { inSchedule: true },
    };
    expect(settingsForCard('intervals', 'm3', overrides).inSchedule).toBe(false);
    expect(resolveForNode('ear-training.intervals', overrides).inSchedule).toBe(false);
  });

  it('leaves siblings alone when one child opts out', () => {
    const overrides = { 'reading.sig': { inSchedule: false } };
    expect(settingsForCard('reading', 'sig:1s:major:name', overrides).inSchedule).toBe(false);
    expect(settingsForCard('reading', 'note:treble:3', overrides).inSchedule).toBe(true);
  });
});

describe('what the settings screen reads', () => {
  it('names the level each value came from', () => {
    const overrides = {
      'ear-training': { maintaining: { firstWaitDays: 3 } },
      'ear-training.chord-recognition': { stale: { graceDays: 14 } },
    };
    const r = resolveForNode('ear-training.chord-recognition', overrides);
    expect(r.sourceByPath['maintaining.firstWaitDays']?.id).toBe('ear-training');
    expect(r.sourceByPath['stale.graceDays']?.id).toBe('ear-training.chord-recognition');
    expect(r.sourceByPath['maintaining.minimumDays']).toBeNull();
  });
});
