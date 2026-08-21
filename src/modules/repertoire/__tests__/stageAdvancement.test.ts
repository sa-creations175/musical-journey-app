// @vitest-environment jsdom
/**
 * Stage-advancement suggestions.
 *
 * Two classes of bug live in this file's history and both were
 * silent. Rules written against a field nothing writes
 * (`atTargetTempo`, and `feelRating` after it) keep compiling and
 * quietly stop suggesting. And three of the four rules named a
 * destination the button beside them would not go to, because the
 * STAGES order changed in April 2026 and the switch was never
 * revised — one of them proposed moving back DOWN the ladder.
 *
 * So: assert that a rule FIRES for realistic input, never on a
 * constant's value; and assert that no rule names a destination of
 * its own choosing.
 */
import { describe, expect, it } from 'vitest';
import type { SongKey } from '../../../lib/db';
import { DECAY_LAPSED_DAYS, MS_PER_DAY } from '../matrix/solidDecay';
import { coveredQuadrants } from '../matrix/keyProgress';
import {
  STAGES,
  STAGE_LABEL,
  evaluateAdvancement,
  nextStage,
  normaliseStage,
  stageCriteria,
  type AdvancementInputs,
} from '../stage';
import { CIRCLE_OF_FOURTHS_KEYS } from '../matrix/keys';

const NOW = 1_760_000_000_000;

function key(keyName: string, over: Partial<SongKey> = {}): SongKey {
  return {
    id: `sk-${keyName}`, songId: 's1', keyName, isOriginalKey: false,
    keyState: 'comfortable', solidAt: null, solidDecayState: null,
    lastDecayCheckAt: null, livedWithSessionCount: 0,
    livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
    isRetestRecommended: false, lastEngagedAt: NOW, createdAt: 0, updatedAt: 0,
    ...over,
  };
}

const TEMPO = 100;

function inputs(over: Partial<AdvancementInputs> = {}): AdvancementInputs {
  return {
    currentStage: 'learning',
    songKeys: [],
    keyRunThroughs: [],
    performanceTempo: TEMPO,
    now: NOW,
    ...over,
  };
}

/** All twelve key rows, as `materialise` creates them. */
function allTwelve(over: (k: string) => Partial<SongKey> = () => ({})): SongKey[] {
  return CIRCLE_OF_FOURTHS_KEYS.map(k => key(k, over(k)));
}

/** A clean run at performance tempo in each of the named keys. */
function cleanRunsIn(keyNames: string[]) {
  return keyNames.map(k => ({
    songKeyId: `sk-${k}`, wasClean: true, tempoBpm: TEMPO,
  }));
}

/** One key per quadrant — the passing shape for Comfortable → Cross-key. */
const ONE_PER_QUADRANT = ['C', 'Eb', 'F#', 'A'];

// =====================================================================

describe('no rule names its own destination', () => {
  /** Inputs that make each stage's rule fire. */
  const firing: Partial<Record<string, AdvancementInputs>> = {
    learning: inputs({
      currentStage: 'learning',
      songKeys: [key('C', { isOriginalKey: true, wholeSongTestPassedAt: NOW })],
    }),
    comfortable: inputs({
      currentStage: 'comfortable',
      songKeys: ONE_PER_QUADRANT.map(k => key(k)),
    }),
    'cross-key': inputs({
      currentStage: 'cross-key',
      songKeys: allTwelve(k => ONE_PER_QUADRANT.includes(k)
        ? {}
        : { keyState: 'learning' }),
      keyRunThroughs: cleanRunsIn(
        CIRCLE_OF_FOURTHS_KEYS.filter(k => !ONE_PER_QUADRANT.includes(k)),
      ),
    }),
  };

  for (const stage of STAGES) {
    const next = nextStage(stage);
    if (next === null) continue;
    it(`${stage} names ${next}, the stage nextStage() goes to`, () => {
      const input = firing[stage];
      // Guard the guard: a rule that did not fire would make the
      // destination assertion vacuous.
      expect(input).toBeDefined();
      const out = evaluateAdvancement(input!);
      expect(out.suggest).toBe(true);
      expect(out.reason).toContain(`consider advancing to ${STAGE_LABEL[next]}.`);
    });
  }

  it('internalized is terminal — the top of the ladder suggests nothing', () => {
    expect(nextStage('internalized')).toBeNull();
    expect(evaluateAdvancement(inputs({ currentStage: 'internalized' })).suggest).toBe(false);
  });
});

// =====================================================================

describe('Learning → Comfortable', () => {
  it('fires when the whole-song test has passed in the ORIGINAL key', () => {
    const out = evaluateAdvancement(inputs({
      songKeys: [
        key('C', { isOriginalKey: true, wholeSongTestPassedAt: NOW }),
        key('F'),
      ],
    }));
    expect(out.suggest).toBe(true);
    expect(out.reason).toContain('Whole-song test passed in C');
  });

  it('does NOT fire when the test passed only in some OTHER key', () => {
    // The rule is about the song in the key it lives in. A song whose
    // original key is untested is not one you can play, however well
    // it goes somewhere else. Guard: the test IS passed somewhere, so
    // a rule reading "any key" would fire here.
    const songKeys = [
      key('C', { isOriginalKey: true, wholeSongTestPassedAt: null }),
      key('F', { wholeSongTestPassedAt: NOW }),
      key('Bb', { wholeSongTestPassedAt: NOW }),
    ];
    expect(songKeys.filter(k => k.wholeSongTestPassedAt !== null)).toHaveLength(2);
    expect(evaluateAdvancement(inputs({ songKeys })).suggest).toBe(false);
  });

  it('does not fire when the original key has not passed', () => {
    const out = evaluateAdvancement(inputs({
      songKeys: [key('C', { isOriginalKey: true, wholeSongTestPassedAt: null })],
    }));
    expect(out.suggest).toBe(false);
  });

  it('does not fire when no key is designated original', () => {
    const out = evaluateAdvancement(inputs({
      songKeys: [key('C', { wholeSongTestPassedAt: NOW })],
    }));
    expect(out.suggest).toBe(false);
  });
});

// =====================================================================

describe('Comfortable → Cross-key', () => {
  it('fires on four held keys, one from each quadrant', () => {
    const out = evaluateAdvancement(inputs({
      currentStage: 'comfortable',
      songKeys: ONE_PER_QUADRANT.map(k => key(k)),
    }));
    expect(out.suggest).toBe(true);
  });

  it('does NOT fire on four held keys bunched into two quadrants', () => {
    // SPREAD, NOT COUNT. Four keys — the same number that passes
    // above — but C/F/Bb are one quadrant and Eb is a second. A rule
    // checking `held.length >= 4` would fire here.
    const bunched = ['C', 'F', 'Bb', 'Eb'];
    expect(bunched).toHaveLength(ONE_PER_QUADRANT.length);
    expect(coveredQuadrants(bunched).size).toBe(2);
    expect(evaluateAdvancement(inputs({
      currentStage: 'comfortable',
      songKeys: bunched.map(k => key(k)),
    })).suggest).toBe(false);
  });

  it('counts the original key toward its own quadrant', () => {
    // A song in C is comfortable in C by definition, so this asks for
    // three more from the other three quadrants — not four besides.
    const out = evaluateAdvancement(inputs({
      currentStage: 'comfortable',
      songKeys: [
        key('C', { isOriginalKey: true }),
        key('Eb'), key('F#'), key('A'),
      ],
    }));
    expect(out.suggest).toBe(true);
  });

  it('does not count a key that has LAPSED', () => {
    // Cross-key is a claim about what you can play now. Guard: the
    // same four keys fire when A is fresh, so the lapse is what moves
    // this, not the shape of the fixture.
    const withLapsed = [
      key('C'), key('Eb'), key('F#'),
      key('A', {
        keyState: 'solid',
        solidDecayState: 'solid',
        lastEngagedAt: NOW - (DECAY_LAPSED_DAYS + 5) * MS_PER_DAY,
      }),
    ];
    expect(evaluateAdvancement(inputs({
      currentStage: 'comfortable', songKeys: ONE_PER_QUADRANT.map(k => key(k)),
    })).suggest).toBe(true);
    expect(evaluateAdvancement(inputs({
      currentStage: 'comfortable', songKeys: withLapsed,
    })).suggest).toBe(false);
  });

  it('does not count keys below comfortable', () => {
    const out = evaluateAdvancement(inputs({
      currentStage: 'comfortable',
      songKeys: ONE_PER_QUADRANT.map(k => key(k, { keyState: 'learning' })),
    }));
    expect(out.suggest).toBe(false);
  });

  it('does not read practice feel — there is none left to read', () => {
    // The rule this replaced averaged the last five feelRatings.
    // Practice carries no rating under the two-mode split, so a rule
    // built on feel would have gone quiet inside this same build.
    // Four quadrants held, nothing else supplied: it fires.
    const out = evaluateAdvancement(inputs({
      currentStage: 'comfortable',
      songKeys: ONE_PER_QUADRANT.map(k => key(k)),
    }));
    expect(out.suggest).toBe(true);
  });
});

// =====================================================================

describe('Cross-key → Internalized', () => {
  /** The four quadrant keys held; the other eight run clean at tempo. */
  function passing(): Partial<AdvancementInputs> {
    return {
      currentStage: 'cross-key',
      songKeys: allTwelve(k => ONE_PER_QUADRANT.includes(k) ? {} : { keyState: 'learning' }),
      keyRunThroughs: cleanRunsIn(
        CIRCLE_OF_FOURTHS_KEYS.filter(k => !ONE_PER_QUADRANT.includes(k)),
      ),
    };
  }

  it('fires on four held plus a clean at-tempo run in the other eight', () => {
    // Guard the guard: the fixture really is four held and eight not,
    // so neither half of the rule is vacuous.
    const input = inputs(passing());
    expect(input.songKeys.filter(k => k.keyState === 'comfortable')).toHaveLength(4);
    expect(input.keyRunThroughs).toHaveLength(8);
    expect(evaluateAdvancement(input).suggest).toBe(true);
  });

  it('does NOT fire when one of the eight has no run', () => {
    const base = passing();
    const input = inputs({
      ...base,
      keyRunThroughs: base.keyRunThroughs!.slice(1),
    });
    expect(input.keyRunThroughs).toHaveLength(7);
    expect(evaluateAdvancement(input).suggest).toBe(false);
  });

  it('does NOT count a run that was not clean', () => {
    const base = passing();
    const runs = base.keyRunThroughs!.map((r, i) => i === 0 ? { ...r, wasClean: false } : r);
    // Guard: still eight runs, so a rule counting rows rather than
    // clean rows would fire.
    expect(runs).toHaveLength(8);
    expect(evaluateAdvancement(inputs({ ...base, keyRunThroughs: runs })).suggest).toBe(false);
  });

  it('does NOT count a run below the tempo floor', () => {
    const base = passing();
    const runs = base.keyRunThroughs!.map((r, i) => i === 0 ? { ...r, tempoBpm: TEMPO - 30 } : r);
    expect(runs).toHaveLength(8);
    expect(evaluateAdvancement(inputs({ ...base, keyRunThroughs: runs })).suggest).toBe(false);
  });

  it('does NOT fire when the four no longer cover every quadrant', () => {
    // Depth has to still be there. Four keys held, but bunched into
    // two quadrants — and all eight remaining keys run clean, so the
    // breadth half alone would pass.
    const bunched = ['C', 'F', 'Bb', 'Eb'];
    const input = inputs({
      currentStage: 'cross-key',
      songKeys: allTwelve(k => bunched.includes(k) ? {} : { keyState: 'learning' }),
      keyRunThroughs: cleanRunsIn(CIRCLE_OF_FOURTHS_KEYS.filter(k => !bunched.includes(k))),
    });
    expect(input.keyRunThroughs).toHaveLength(8);
    expect(evaluateAdvancement(input).suggest).toBe(false);
  });

  it('accepts a HELD key in place of a run — held satisfies it by being held', () => {
    // Six held keys covering all four quadrants, six runs. Holding
    // more than four is not penalised.
    const held = ['C', 'F', 'Eb', 'F#', 'A', 'D'];
    const input = inputs({
      currentStage: 'cross-key',
      songKeys: allTwelve(k => held.includes(k) ? {} : { keyState: 'learning' }),
      keyRunThroughs: cleanRunsIn(CIRCLE_OF_FOURTHS_KEYS.filter(k => !held.includes(k))),
    });
    expect(evaluateAdvancement(input).suggest).toBe(true);
  });

  it('withholds entirely when the song has no performance tempo', () => {
    expect(evaluateAdvancement(inputs({ ...passing(), performanceTempo: null })).suggest).toBe(false);
  });
});

// =====================================================================

describe('normaliseStage', () => {
  it('collapses the retired maintenance rung onto internalized', () => {
    // Maintenance sat directly above internalized and was reachable
    // only from it, so this narrows onto the state it was entered
    // from rather than demoting anything.
    expect(normaliseStage('maintenance')).toBe('internalized');
  });

  it('passes every live stage through untouched', () => {
    for (const stage of STAGES) expect(normaliseStage(stage)).toBe(stage);
  });

  it('falls back to learning for unset and unrecognised values', () => {
    expect(normaliseStage(undefined)).toBe('learning');
    expect(normaliseStage(null)).toBe('learning');
    expect(normaliseStage('nonsense')).toBe('learning');
  });

  it('STAGES no longer carries maintenance', () => {
    expect(STAGES).toEqual(['learning', 'comfortable', 'cross-key', 'internalized']);
  });
});

// =====================================================================

describe('the panel and the rule cannot disagree', () => {
  /**
   * `evaluateAdvancement` is derived from `stageCriteria`, so this
   * identity should hold by construction. It is asserted anyway,
   * across a spread that includes every stage and both sides of every
   * criterion, because the failure it guards is the one the user
   * cannot detect from outside: a panel reading "3 of 3" beside a
   * rule that never fires gives them no way to tell which half lied.
   */
  const cases: Array<[string, AdvancementInputs]> = [
    ['learning, no keys at all', inputs({ songKeys: [] })],
    ['learning, no original key designated', inputs({
      songKeys: [key('C', { wholeSongTestPassedAt: NOW })],
    })],
    ['learning, original key untested', inputs({
      songKeys: [key('C', { isOriginalKey: true })],
    })],
    ['learning, original key tested', inputs({
      songKeys: [key('C', { isOriginalKey: true, wholeSongTestPassedAt: NOW })],
    })],
    ['comfortable, nothing held', inputs({
      currentStage: 'comfortable',
      songKeys: allTwelve(() => ({ keyState: 'learning' })),
    })],
    ['comfortable, two quadrants', inputs({
      currentStage: 'comfortable',
      songKeys: allTwelve(k => ['C', 'Eb'].includes(k) ? {} : { keyState: 'learning' }),
    })],
    ['comfortable, all four quadrants', inputs({
      currentStage: 'comfortable',
      songKeys: allTwelve(k => ONE_PER_QUADRANT.includes(k) ? {} : { keyState: 'learning' }),
    })],
    ['cross-key, no tempo set', inputs({
      currentStage: 'cross-key',
      performanceTempo: null,
      songKeys: allTwelve(k => ONE_PER_QUADRANT.includes(k) ? {} : { keyState: 'learning' }),
      keyRunThroughs: cleanRunsIn(CIRCLE_OF_FOURTHS_KEYS.filter(k => !ONE_PER_QUADRANT.includes(k))),
    })],
    ['cross-key, quadrants short', inputs({
      currentStage: 'cross-key',
      songKeys: allTwelve(k => ['C', 'F'].includes(k) ? {} : { keyState: 'learning' }),
      keyRunThroughs: cleanRunsIn(CIRCLE_OF_FOURTHS_KEYS.filter(k => !['C', 'F'].includes(k))),
    })],
    ['cross-key, one key still unrun', inputs({
      currentStage: 'cross-key',
      songKeys: allTwelve(k => ONE_PER_QUADRANT.includes(k) ? {} : { keyState: 'learning' }),
      keyRunThroughs: cleanRunsIn(
        CIRCLE_OF_FOURTHS_KEYS.filter(k => !ONE_PER_QUADRANT.includes(k)).slice(1),
      ),
    })],
    ['cross-key, everything satisfied', inputs({
      currentStage: 'cross-key',
      songKeys: allTwelve(k => ONE_PER_QUADRANT.includes(k) ? {} : { keyState: 'learning' }),
      keyRunThroughs: cleanRunsIn(CIRCLE_OF_FOURTHS_KEYS.filter(k => !ONE_PER_QUADRANT.includes(k))),
    })],
    ['internalized, terminal', inputs({ currentStage: 'internalized' })],
  ];

  it('the spread genuinely covers both outcomes', () => {
    // Guard the guard: an identity asserted only over failing cases
    // would pass on a rule that never fires at all.
    const results = cases.map(([, i]) => evaluateAdvancement(i).suggest);
    expect(results.filter(Boolean).length).toBeGreaterThan(0);
    expect(results.filter(r => !r).length).toBeGreaterThan(0);
  });

  for (const [name, input] of cases) {
    it(`holds for ${name}`, () => {
      const criteria = stageCriteria(input);
      const allMet = criteria.length > 0 && criteria.every(c => c.met);
      expect(evaluateAdvancement(input).suggest).toBe(allMet);
    });
  }

  it('every unmet criterion reports progress short of its target', () => {
    for (const [, input] of cases) {
      for (const c of stageCriteria(input)) {
        if (!c.met) expect(c.have).toBeLessThan(c.need);
        else expect(c.have).toBeGreaterThanOrEqual(c.need);
      }
    }
  });

  it('a terminal stage suggests nothing, and names nothing', () => {
    // TWO GUARDS PRODUCE THIS and neither reverses alone: `[].every()`
    // is true, so the empty criteria list reads as satisfied, and what
    // stops it is nextStage() === null. The length check is belt for a
    // future non-terminal stage with no criteria. Removing either
    // alone leaves this green; removing both makes the reason name
    // `undefined`, which is what the second assertion catches.
    expect(stageCriteria(inputs({ currentStage: 'internalized' }))).toEqual([]);
    const out = evaluateAdvancement(inputs({ currentStage: 'internalized' }));
    expect(out.suggest).toBe(false);
    expect(out.reason).toBeUndefined();
  });

  it('preconditions are listed in the panel but kept out of the banner', () => {
    const passing = inputs({
      currentStage: 'cross-key',
      songKeys: allTwelve(k => ONE_PER_QUADRANT.includes(k) ? {} : { keyState: 'learning' }),
      keyRunThroughs: cleanRunsIn(CIRCLE_OF_FOURTHS_KEYS.filter(k => !ONE_PER_QUADRANT.includes(k))),
    });
    const criteria = stageCriteria(passing);
    expect(criteria.some(c => c.precondition)).toBe(true);
    // The banner says what you DID; having a tempo set is not that.
    expect(evaluateAdvancement(passing).reason).not.toContain('performance tempo is set');
    expect(evaluateAdvancement(passing).reason).toContain('All four quadrants still held');
  });
});
