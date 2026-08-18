// @vitest-environment jsdom
/**
 * Stage-advancement suggestions after the feel scale lost its fifth
 * step.
 *
 * The Comfortable → Internalized rule compared an average against a
 * literal 4, which was mid-scale on 1-5 and is the MAXIMUM on 1-4.
 * Left alone it would have kept compiling, kept running, and quietly
 * stopped suggesting anything — so these assert on whether the rule
 * fires for realistic input, not on the constant's value.
 */
import { describe, expect, it } from 'vitest';
import type { SongPracticeLog } from '../../../lib/db';
import type { Feel } from '../../../lib/fluencyScale';
import { evaluateAdvancement } from '../stage';

const DAY = 24 * 60 * 60 * 1000;

/** `n` sessions spread one per day, newest today. */
function logs(feels: number[], atTargetTempo = true): SongPracticeLog[] {
  const now = Date.now();
  return feels.map((f, i) => ({
    id: `l${i}`,
    songId: 's1',
    timestamp: now - i * DAY,
    durationMin: 20,
    sectionIds: [],
    keys: [],
    feelRating: f as Feel,
    atTargetTempo,
  }));
}

/** Sessions spread across `weeks` distinct weeks, so the
 *  three-weeks-of-practice half of the rule is satisfied. */
function logsAcrossWeeks(feels: number[]): SongPracticeLog[] {
  const now = Date.now();
  return feels.map((f, i) => ({
    id: `l${i}`,
    songId: 's1',
    timestamp: now - i * 5 * DAY,
    durationMin: 20,
    sectionIds: [],
    keys: [],
    feelRating: f as Feel,
    atTargetTempo: true,
  }));
}

describe('Learning → Comfortable', () => {
  it('counts comfortable-or-better at target tempo', () => {
    const out = evaluateAdvancement({
      currentStage: 'learning',
      logs: logs([3, 3, 4, 3, 4]),
      crossKeyPairs: [],
    });
    expect(out.suggest).toBe(true);
  });

  it('still counts a LEGACY 5 — normalisation keeps it in range', () => {
    // Written before the fifth step was dropped. A comparison written
    // for the current range must not silently exclude them.
    const out = evaluateAdvancement({
      currentStage: 'learning',
      logs: logs([5, 5, 5, 5, 5]),
      crossKeyPairs: [],
    });
    expect(out.suggest).toBe(true);
  });

  it('ignores sessions below comfortable', () => {
    const out = evaluateAdvancement({
      currentStage: 'learning',
      logs: logs([2, 2, 2, 2, 2]),
      crossKeyPairs: [],
    });
    expect(out.suggest).toBe(false);
  });

  it('ignores sessions not at target tempo', () => {
    const out = evaluateAdvancement({
      currentStage: 'learning',
      logs: logs([4, 4, 4, 4, 4], false),
      crossKeyPairs: [],
    });
    expect(out.suggest).toBe(false);
  });
});

describe('Comfortable → Internalized', () => {
  it('FIRES on a realistic mostly-in-flow run', () => {
    // Three in flow, two comfortable. Under the old literal 4 this
    // averages 3.6 and would never have suggested anything again.
    const out = evaluateAdvancement({
      currentStage: 'comfortable',
      logs: logsAcrossWeeks([4, 4, 4, 3, 3]),
      crossKeyPairs: [],
    });
    expect(out.suggest).toBe(true);
  });

  it('does NOT fire on five straight comfortables', () => {
    // The rule means "better than comfortable", so the floor has to
    // stay above it — a threshold low enough to fire here would
    // promote on steady-but-unremarkable practice.
    const out = evaluateAdvancement({
      currentStage: 'comfortable',
      logs: logsAcrossWeeks([3, 3, 3, 3, 3]),
      crossKeyPairs: [],
    });
    expect(out.suggest).toBe(false);
  });

  it('requires five sessions before suggesting anything', () => {
    const out = evaluateAdvancement({
      currentStage: 'comfortable',
      logs: logsAcrossWeeks([4, 4, 4]),
      crossKeyPairs: [],
    });
    expect(out.suggest).toBe(false);
  });

  it('requires practice spread across weeks, not one burst', () => {
    // Five in-flow sessions in five consecutive days is one good week,
    // not internalisation.
    const out = evaluateAdvancement({
      currentStage: 'comfortable',
      logs: logs([4, 4, 4, 4, 4]),
      crossKeyPairs: [],
    });
    expect(out.suggest).toBe(false);
  });
});
