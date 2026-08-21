// @vitest-environment jsdom
/**
 * Stage-advancement suggestions, and the two rules that were written
 * against something nothing wrote.
 *
 * Comfortable → Internalized compared an average against a literal 4,
 * which was mid-scale on 1-5 and is the MAXIMUM on 1-4.
 *
 * Learning → Comfortable counted practice logs carrying
 * `atTargetTempo === true`, whose only writer was PracticeLogModal —
 * so matrix-logged sessions were already invisible to it, and
 * retiring that modal would have taken the writer count to zero.
 *
 * Both fail the same way: still compiles, still runs, quietly stops
 * suggesting. So these assert on whether each rule FIRES for
 * realistic input, never on a constant's value.
 */
import { describe, expect, it } from 'vitest';
import type { SongPracticeLog } from '../../../lib/db';
import type { Feel } from '../../../lib/fluencyScale';
import {
  evaluateAdvancement,
  type AdvancementInputs,
  type AdvancementRunThrough,
} from '../stage';

const DAY = 24 * 60 * 60 * 1000;

/** Performance tempo for the run-through fixtures. The gate floor is
 *  one-sided at (tempo - 10), so 90 is the lowest qualifying BPM. */
const TEMPO = 100;
const FLOOR = TEMPO - 10;

function run(wasClean: boolean, tempoBpm: number | null): AdvancementRunThrough {
  return { wasClean, tempoBpm };
}

/** `n` identical run-throughs. */
function runsOf(n: number, wasClean: boolean, tempoBpm: number | null): AdvancementRunThrough[] {
  return Array.from({ length: n }, () => run(wasClean, tempoBpm));
}

/** Inputs for the Learning → Comfortable rule, with the fields that
 *  rule does not read left empty so a pass can only come from the
 *  run-throughs. */
function learningInputs(over: Partial<AdvancementInputs> = {}): AdvancementInputs {
  return {
    currentStage: 'learning',
    logs: [],
    crossKeyPairs: [],
    runThroughs: [],
    performanceTempo: TEMPO,
    ...over,
  };
}

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
  it('fires on five clean run-throughs at performance tempo', () => {
    const out = evaluateAdvancement(learningInputs({
      runThroughs: runsOf(5, true, TEMPO),
    }));
    expect(out.suggest).toBe(true);
  });

  it('does not fire on four', () => {
    const out = evaluateAdvancement(learningInputs({
      runThroughs: runsOf(4, true, TEMPO),
    }));
    expect(out.suggest).toBe(false);
  });

  it('counts only the CLEAN runs out of a mixed pool', () => {
    // Guard the guard: the pool has to contain both kinds, or
    // "excludes not-clean" is indistinguishable from "excluded
    // nothing". Five clean would pass on its own, so the four
    // not-clean are what this is actually testing — and there are
    // nine runs total, enough to fire if the filter were dropped.
    const pool = [...runsOf(4, true, TEMPO), ...runsOf(5, false, TEMPO)];
    expect(pool.filter(r => r.wasClean)).toHaveLength(4);
    expect(pool.filter(r => !r.wasClean)).toHaveLength(5);
    expect(evaluateAdvancement(learningInputs({ runThroughs: pool })).suggest).toBe(false);
  });

  it('counts only the runs AT TEMPO out of a mixed pool', () => {
    // Same shape one axis over: four qualifying, five below the
    // floor, nine total. Firing here would mean the tempo filter is
    // not running.
    const pool = [...runsOf(4, true, TEMPO), ...runsOf(5, true, FLOOR - 1)];
    expect(pool.filter(r => (r.tempoBpm ?? 0) >= FLOOR)).toHaveLength(4);
    expect(pool.filter(r => (r.tempoBpm ?? 0) < FLOOR)).toHaveLength(5);
    expect(evaluateAdvancement(learningInputs({ runThroughs: pool })).suggest).toBe(false);
  });

  it('counts a run exactly at the floor, and one above tempo', () => {
    // The gate is one-sided: at-or-above (tempo - 10) qualifies and
    // there is no upper cap, so playing faster than performance tempo
    // is never penalised. Both boundaries in one fixture.
    const out = evaluateAdvancement(learningInputs({
      runThroughs: [
        ...runsOf(3, true, FLOOR),
        ...runsOf(2, true, TEMPO + 40),
      ],
    }));
    expect(out.suggest).toBe(true);
  });

  it('does NOT count run-throughs logged without a tempo', () => {
    // "Clean at a tempo you didn't state" is not an answer to "clean
    // at performance tempo" — step 2's reasoning, unchanged.
    const out = evaluateAdvancement(learningInputs({
      runThroughs: runsOf(6, true, null),
    }));
    expect(out.suggest).toBe(false);
  });

  it('withholds the suggestion entirely when the song has no tempo set', () => {
    // THE INHERITED DEFAULT. isInTempoRange returns TRUE when
    // performanceTempo is null — right for the cell gate, which
    // switches itself off rather than blocking a user who has not set
    // a tempo, and wrong here, where inheriting it would promote on
    // five clean runs at any speed. Same fixture as the passing case
    // above; only the tempo is removed.
    const out = evaluateAdvancement(learningInputs({
      runThroughs: runsOf(5, true, TEMPO),
      performanceTempo: null,
    }));
    expect(out.suggest).toBe(false);
  });

  it('does not promote on practice logs alone, however they are marked', () => {
    // THE REGRESSION THIS REWRITE EXISTS FOR. Five sessions carrying
    // atTargetTempo === true and a comfortable-or-better feel — the
    // exact input the old rule promoted on — with no run-throughs.
    // At tempo is a test fact now, and practice cannot supply it.
    const out = evaluateAdvancement(learningInputs({
      logs: logs([3, 3, 4, 3, 4]),
      runThroughs: [],
    }));
    expect(out.suggest).toBe(false);
  });

  it('names clean run-throughs in the reason, not sessions', () => {
    // The suggestion is the user's evidence for a promotion they are
    // being asked to confirm; it has to describe what was actually
    // counted.
    const out = evaluateAdvancement(learningInputs({
      runThroughs: runsOf(7, true, TEMPO),
    }));
    expect(out.reason).toContain('7 clean run-throughs at tempo');
  });
});

describe('Comfortable → Internalized', () => {
  it('FIRES on a realistic mostly-in-flow run', () => {
    // Three in flow, two comfortable. Under the old literal 4 this
    // averages 3.6 and would never have suggested anything again.
    const out = evaluateAdvancement({
      currentStage: 'comfortable',
      runThroughs: [],
      performanceTempo: TEMPO,
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
      runThroughs: [],
      performanceTempo: TEMPO,
      logs: logsAcrossWeeks([3, 3, 3, 3, 3]),
      crossKeyPairs: [],
    });
    expect(out.suggest).toBe(false);
  });

  it('requires five sessions before suggesting anything', () => {
    const out = evaluateAdvancement({
      currentStage: 'comfortable',
      runThroughs: [],
      performanceTempo: TEMPO,
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
      runThroughs: [],
      performanceTempo: TEMPO,
      logs: logs([4, 4, 4, 4, 4]),
      crossKeyPairs: [],
    });
    expect(out.suggest).toBe(false);
  });
});
