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
import { coveredQuadrants } from '../matrix/keyProgress';
import {
  STAGES,
  STAGE_LABEL,
  evaluateAdvancement,
  nextStage,
  deriveStage,
  normaliseStage,
  stageCriteria,
  keysWhereRunCounts,
  ladderCriteria,
  type AdvancementInputs,
} from '../stage';
import { CIRCLE_OF_FOURTHS_KEYS } from '../matrix/keys';
import {
  DUE_SOON_DEFAULT_DAYS,
  GRACE_DEFAULT_DAYS,
  type DueWindows,
} from '../matrix/keySpacing';

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
/** These rules no longer consult solidDecay at all — the day constant
 *  is local rather than imported from a module they stopped reading. */
const DAY = 24 * 60 * 60 * 1000;
const WINDOWS: DueWindows = {
  dueSoonDays: DUE_SOON_DEFAULT_DAYS,
  graceDays: GRACE_DEFAULT_DAYS,
};
/** Every key due far enough ahead to be held. The rules under test are
 *  about quadrants and runs, not about decay — a fixture where keys
 *  were silently overdue would make every held-key assertion pass or
 *  fail for the wrong reason. */
const ALL_HELD: ReadonlyMap<string, number | null> = new Map();

function inputs(over: Partial<AdvancementInputs> = {}): AdvancementInputs {
  return {
    currentStage: 'learning',
    songKeys: [],
    keyRunThroughs: [],
    performanceTempo: TEMPO,
    now: NOW,
    dueByKeyId: ALL_HELD,
    dueWindows: WINDOWS,
    spelling: 'flat' as const,
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
    // A key always carries "key" or "keys" in prose — a bare letter at
    // the start of a clause reads as a word, not a key.
    expect(out.reason).toContain('Whole-song test passed in the key of C');
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

  it('does not count a key that is OVERDUE', () => {
    // Cross-key is a claim about what you can play now, and "now" is
    // a due date that stretches with each pass rather than a flat 30
    // days since anything was touched.
    //
    // Guard: the SAME four keys fire when nothing is overdue, so the
    // due date is what moves this and not the shape of the fixture.
    const keys = ONE_PER_QUADRANT.map(k => key(k));
    const overdue: ReadonlyMap<string, number | null> = new Map([
      ['sk-A', NOW - (GRACE_DEFAULT_DAYS + 5) * DAY],
    ]);

    expect(evaluateAdvancement(inputs({
      currentStage: 'comfortable', songKeys: keys,
    })).suggest).toBe(true);
    expect(evaluateAdvancement(inputs({
      currentStage: 'comfortable', songKeys: keys, dueByKeyId: overdue,
    })).suggest).toBe(false);
  });

  it('still counts a key that is merely DUE, not yet past grace', () => {
    // Due is a warning with time left on it. A rule that dropped the
    // rung the moment a key came due would leave nothing to act on.
    const keys = ONE_PER_QUADRANT.map(k => key(k));
    const justDue: ReadonlyMap<string, number | null> = new Map([
      ['sk-A', NOW - 1 * DAY],
    ]);
    expect(evaluateAdvancement(inputs({
      currentStage: 'comfortable', songKeys: keys, dueByKeyId: justDue,
    })).suggest).toBe(true);
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

// =====================================================================

describe('deriveStage — play it, prove it, three times', () => {
  /** Every key held, one per quadrant. */
  const quadrantKeys = () =>
    allTwelve(k => ONE_PER_QUADRANT.includes(k) ? {} : { keyState: 'learning' });

  it('a song with nothing proven is learning', () => {
    expect(deriveStage(inputs({ songKeys: allTwelve(() => ({ keyState: 'not_started' })) })))
      .toBe('learning');
  });

  it('climbs to comfortable on a passed whole-song test in the original key', () => {
    const keys = allTwelve(k => k === 'C'
      ? { isOriginalKey: true, wholeSongTestPassedAt: NOW }
      : { keyState: 'not_started' });
    expect(deriveStage(inputs({ songKeys: keys }))).toBe('comfortable');
  });

  it('climbs to cross-key when four quadrants are held', () => {
    const keys = quadrantKeys().map(k =>
      k.keyName === 'C' ? { ...k, isOriginalKey: true, wholeSongTestPassedAt: NOW } : k);
    expect(deriveStage(inputs({ songKeys: keys }))).toBe('cross-key');
  });

  it('climbs to internalized when the other eight have clean at-tempo runs', () => {
    const keys = quadrantKeys().map(k =>
      k.keyName === 'C' ? { ...k, isOriginalKey: true, wholeSongTestPassedAt: NOW } : k);
    expect(deriveStage(inputs({
      songKeys: keys,
      keyRunThroughs: cleanRunsIn(
        CIRCLE_OF_FOURTHS_KEYS.filter(k => !ONE_PER_QUADRANT.includes(k)),
      ),
    }))).toBe('internalized');
  });

  it('stops at the top rather than walking off the ladder', () => {
    // TWO GUARDS PRODUCE THIS and neither reverses alone: the
    // empty-criteria check, and `nextStage() === null`. `[].every()`
    // is true, so the empty list reads as satisfied and the null check
    // is what actually stops the walk today. Removing either leaves
    // this green; removing both returns a value that is not on the
    // ladder, which is what the first assertion catches.
    const keys = quadrantKeys().map(k =>
      k.keyName === 'C' ? { ...k, isOriginalKey: true, wholeSongTestPassedAt: NOW } : k);
    const derived = deriveStage(inputs({
      songKeys: keys,
      keyRunThroughs: cleanRunsIn(
        CIRCLE_OF_FOURTHS_KEYS.filter(k => !ONE_PER_QUADRANT.includes(k)),
      ),
    }));
    expect(STAGES).toContain(derived);
    expect(nextStage(derived)).toBeNull();
  });
});

describe('deriveStage — a rung can be lost, not only earned', () => {
  const provenTwelve = () =>
    allTwelve(k => ONE_PER_QUADRANT.includes(k)
      ? (k === 'C' ? { isOriginalKey: true, wholeSongTestPassedAt: NOW } : {})
      : { keyState: 'learning' });
  const allEightRun = () => cleanRunsIn(
    CIRCLE_OF_FOURTHS_KEYS.filter(k => !ONE_PER_QUADRANT.includes(k)),
  );

  it('ONE OVERDUE QUADRANT KEY DROPS TWO RUNGS, and that is correct', () => {
    // "Four quadrants held" is the whole of comfortable → cross-key AND
    // criterion 2 of cross-key → internalized, so one stale key fails
    // both. Guard the guard: the same song is internalized when
    // nothing is overdue, so the due date is what moves this.
    const base = { songKeys: provenTwelve(), keyRunThroughs: allEightRun() };
    expect(deriveStage(inputs(base))).toBe('internalized');

    const overdue: ReadonlyMap<string, number | null> = new Map([
      ['sk-A', NOW - (GRACE_DEFAULT_DAYS + 5) * DAY],
    ]);
    expect(deriveStage(inputs({ ...base, dueByKeyId: overdue }))).toBe('comfortable');
  });

  it('does not drop while a key is merely due', () => {
    const base = { songKeys: provenTwelve(), keyRunThroughs: allEightRun() };
    const justDue: ReadonlyMap<string, number | null> = new Map([['sk-A', NOW - DAY]]);
    expect(deriveStage(inputs({ ...base, dueByKeyId: justDue }))).toBe('internalized');
  });

  it('keeps comfortable when the original key stays proven', () => {
    // The breadth runs are historical events and do not decay, so a
    // song that loses its quadrants keeps the rung its whole-song test
    // earned. Only the four depth keys can lapse.
    const overdueAll: ReadonlyMap<string, number | null> = new Map(
      CIRCLE_OF_FOURTHS_KEYS.map(k => [`sk-${k}`, NOW - (GRACE_DEFAULT_DAYS + 5) * DAY]),
    );
    expect(deriveStage(inputs({
      songKeys: provenTwelve(), keyRunThroughs: allEightRun(), dueByKeyId: overdueAll,
    }))).toBe('comfortable');
  });
});

// =====================================================================

describe('keysWhereRunCounts — the button and the rule are one reading', () => {
  /** A song at Cross-key: four quadrant keys held, eight not. */
  const atCrossKey = (over: Partial<AdvancementInputs> = {}) => inputs({
    currentStage: 'cross-key',
    songKeys: allTwelve(),
    dueByKeyId: new Map(
      // Only the four quadrant keys are held; the rest lapsed long ago,
      // which is the ordinary shape of a song that has just arrived at
      // Cross-key.
      CIRCLE_OF_FOURTHS_KEYS.map(k => [
        `sk-${k}`,
        ONE_PER_QUADRANT.includes(k) ? NOW + 90 * DAY : NOW - 90 * DAY,
      ]),
    ),
    ...over,
  });

  it('is EXACTLY the keys the criterion is still asking for', () => {
    // THE LOAD-BEARING ASSERTION. A button offered on a key the
    // criterion does not count is a control whose only honest label is
    // "this doesn't count"; a key the criterion counts with no button
    // is a criterion you cannot satisfy. Both are ruled out by
    // deriving the two from one reading — and this is what would fail
    // if someone re-derived either side independently.
    const input = atCrossKey();
    const offered = keysWhereRunCounts(input);
    const breadth = stageCriteria(input).find(
      c => c.label === 'Every other key run clean at tempo, at least once',
    )!;
    expect(breadth.need - breadth.have).toBe(offered.size);
    // And the identities, not just the count.
    const stillShort = new Set(
      CIRCLE_OF_FOURTHS_KEYS.filter(k => !ONE_PER_QUADRANT.includes(k)).map(k => `sk-${k}`),
    );
    expect(offered).toEqual(stillShort);
  });

  it('offers nothing below Cross-key, however good the song looks', () => {
    // A single run does not promote a key — logSingleKeyRun submits
    // one attempt and promotion needs three — so at Learning and at
    // Comfortable it moves nothing at all. Same songKeys, same runs,
    // same tempo: only the rung differs.
    for (const stage of ['learning', 'comfortable'] as const) {
      expect(keysWhereRunCounts(atCrossKey({ currentStage: stage })).size).toBe(0);
    }
    // Guard the guard: the fixture DOES offer keys at Cross-key, so
    // the two above are empty for the rung and not for the fixture.
    expect(keysWhereRunCounts(atCrossKey()).size).toBeGreaterThan(0);
  });

  it('offers nothing when no performance tempo is set', () => {
    // Without one there is no tempo for a run to be clean AT, so no
    // run can qualify — the criterion says exactly this, and a button
    // that cannot be satisfied is worse than no button.
    expect(keysWhereRunCounts(atCrossKey({ performanceTempo: null })).size).toBe(0);
  });

  it('drops a key once one clean at-tempo run has landed on it', () => {
    // A second run adds nothing, so the button goes.
    const before = keysWhereRunCounts(atCrossKey());
    expect(before.has('sk-Bb')).toBe(true);
    const after = keysWhereRunCounts(atCrossKey({ keyRunThroughs: cleanRunsIn(['Bb']) }));
    expect(after.has('sk-Bb')).toBe(false);
    expect(after.size).toBe(before.size - 1);
  });

  it('offers a QUADRANT key that is not itself held', () => {
    // The correction that matters: `short` is every key not currently
    // held, NOT a fixed set of eight and NOT "the non-quadrant keys" —
    // all twelve keys are in a quadrant. A quadrant is covered by ANY
    // one held key in it, which leaves its other two still short. Here
    // C holds quadrant 0 and F and Bb, its quadrant-mates, are offered.
    const offered = keysWhereRunCounts(atCrossKey());
    expect(offered.has('sk-C')).toBe(false);   // held, covers quadrant 0
    expect(offered.has('sk-F')).toBe(true);    // same quadrant, still short
    expect(offered.has('sk-Bb')).toBe(true);
  });

  it('shrinks as more keys are held, rather than staying at eight', () => {
    // Six held keys leaves six short, not eight.
    const sixHeld = ['C', 'F', 'Eb', 'F#', 'A', 'D'];
    const offered = keysWhereRunCounts(atCrossKey({
      dueByKeyId: new Map(CIRCLE_OF_FOURTHS_KEYS.map(k => [
        `sk-${k}`, sixHeld.includes(k) ? NOW + 90 * DAY : NOW - 90 * DAY,
      ])),
    }));
    expect(offered.size).toBe(6);
  });
});

// =====================================================================

describe('ladderCriteria — the panel accumulates', () => {
  const atComfortable = inputs({
    currentStage: 'comfortable',
    songKeys: [
      key('C', { isOriginalKey: true, wholeSongTestPassedAt: NOW }),
      ...ONE_PER_QUADRANT.filter(k => k !== 'C').map(k => key(k)),
    ],
  });

  it('shows the rung you already earned, still ticked', () => {
    // THE WHOLE POINT. The panel used to swap wholesale, so the
    // criterion vanished the moment you satisfied it — what you had
    // done became invisible exactly when it became true.
    const groups = ladderCriteria(atComfortable);
    const earned = groups.filter(g => g.status === 'earned');
    expect(earned).toHaveLength(1);
    expect(earned[0].earns).toBe('comfortable');
    expect(earned[0].criteria.every(c => c.met)).toBe(true);
  });

  it('names the rung each group EARNS, never the rung you stand on', () => {
    // A group headed "Comfortable" is the work that earns Comfortable.
    // Heading it with the rung whose criteria they are would label the
    // first group "Learning", which reads as the goal being to learn.
    const groups = ladderCriteria(atComfortable);
    expect(groups.map(g => g.earns))
      .toEqual(['comfortable', 'cross-key', 'internalized']);
    expect(groups.map(g => g.status))
      .toEqual(['earned', 'current', 'ahead']);
  });

  it('omits the terminal rung, which earns nothing', () => {
    const groups = ladderCriteria(inputs({ currentStage: 'internalized' }));
    expect(groups.every(g => g.earns !== 'learning')).toBe(true);
    expect(groups.some(g => g.status === 'current')).toBe(false);
  });

  it('is about six criteria across the whole ladder, not dozens', () => {
    // The reason it can accumulate at all. If this grows, the
    // collapse-the-far-ones decision needs revisiting rather than the
    // number quietly getting worse.
    const total = ladderCriteria(atComfortable)
      .reduce((n, g) => n + g.criteria.length, 0);
    expect(total).toBeLessThanOrEqual(8);
    expect(total).toBeGreaterThanOrEqual(4);
  });

  it('un-ticks an earned rung when the key behind it lapses', () => {
    // A tick is a live reading, not a record. This is the behaviour
    // the panel's copy has to admit to — and it is why earned groups
    // are recomputed rather than assumed met.
    const lapsed = ladderCriteria(inputs({
      currentStage: 'cross-key',
      songKeys: [
        key('C', { isOriginalKey: true, wholeSongTestPassedAt: NOW }),
        ...ONE_PER_QUADRANT.filter(k => k !== 'C').map(k => key(k)),
      ],
      // Eb is past due AND past grace, so its quadrant stops counting.
      dueByKeyId: new Map([['sk-Eb', NOW - (GRACE_DEFAULT_DAYS + 5) * DAY]]),
    }));
    const crossKey = lapsed.find(g => g.earns === 'cross-key')!;
    expect(crossKey.criteria.every(c => c.met)).toBe(false);
  });

  it('agrees criterion-for-criterion with stageCriteria at every rung', () => {
    // Guard against the ladder becoming a second definition. It is the
    // same call in a loop; if it ever stops being that, this fails.
    for (const stage of STAGES) {
      const group = ladderCriteria(inputs({ ...atComfortable, currentStage: stage }))
        .find(g => g.status === 'current');
      const direct = stageCriteria({ ...atComfortable, currentStage: stage });
      expect(group?.criteria ?? []).toEqual(direct);
    }
  });
});

// =====================================================================

describe('the counts describe the work', () => {
  /** Four quadrant keys held, eight not — a song newly at Cross-key. */
  const held = (keys: string[]) => new Map(
    CIRCLE_OF_FOURTHS_KEYS.map(k => [
      `sk-${k}`, keys.includes(k) ? NOW + 90 * DAY : NOW - 90 * DAY,
    ]),
  );
  const at = (stage: AdvancementInputs['currentStage'], over: Partial<AdvancementInputs> = {}) =>
    inputs({
      currentStage: stage,
      songKeys: allTwelve(),
      dueByKeyId: held(ONE_PER_QUADRANT),
      ...over,
    });

  const headline = (input: AdvancementInputs, earns: string) =>
    ladderCriteria(input).find(g => g.earns === earns)!.headline;

  it('counts quadrants for Cross-key, not keys', () => {
    // ANY key inside a quadrant covers it, so "of 12 keys" would name
    // three specific ones per quadrant that the rule does not ask for.
    const h = headline(at('comfortable'), 'cross-key');
    expect(h.need).toBe(4);
    expect(h.unit).toBe('quadrants');
  });

  it('counts the keys still needing a run for Internalized, not all twelve', () => {
    // A held key satisfies the criterion by BEING held, so counting it
    // in the denominator counts work nobody is asking for. Four held
    // leaves eight.
    const h = headline(at('cross-key'), 'internalized');
    expect(h.have).toBe(0);
    expect(h.need).toBe(8);
    expect(h.unit).toBe('keys run clean');
  });

  it('shrinks that denominator as another key is held', () => {
    const h = headline(at('cross-key', { dueByKeyId: held([...ONE_PER_QUADRANT, 'F']) }), 'internalized');
    expect(h.need).toBe(7);
  });

  it('never headlines a rung with a precondition', () => {
    // "0 of 1 performance tempo" measures the setup, not the climb.
    for (const stage of STAGES) {
      for (const g of ladderCriteria(at(stage))) {
        if (g.criteria.some(c => !c.precondition)) {
          expect(g.headline.precondition, g.earns).toBeFalsy();
        }
      }
    }
  });

  it('headlines with a criterion the group actually contains', () => {
    // The whole point of deriving it: the heading cannot show numbers
    // or a unit that no rule in that group produced.
    for (const stage of STAGES) {
      for (const g of ladderCriteria(at(stage))) {
        expect(g.criteria).toContain(g.headline);
      }
    }
  });

  it('MOVES BOTH COUNTS TOGETHER WHEN A QUADRANT KEY LAPSES', () => {
    // THE LOAD-BEARING ONE. Cross-key's covered count and
    // Internalized's denominator are two readings of one `held` set.
    // Computed from separate snapshots they would disagree — the
    // panel showing four quadrants covered while eight keys still
    // needed runs, on a song where a key had just gone overdue.
    const before = ladderCriteria(at('cross-key'));
    expect(before.find(g => g.earns === 'cross-key')!.headline.have).toBe(4);
    expect(before.find(g => g.earns === 'internalized')!.headline.need).toBe(8);

    // Eb goes overdue: its quadrant loses its only holder.
    const after = ladderCriteria(at('cross-key', {
      dueByKeyId: held(ONE_PER_QUADRANT.filter(k => k !== 'Eb')),
    }));
    expect(after.find(g => g.earns === 'cross-key')!.headline.have).toBe(3);
    expect(after.find(g => g.earns === 'internalized')!.headline.need).toBe(9);
  });

  it('counts a run against the same set the denominator names', () => {
    // Guard the guard: a numerator that counted runs on HELD keys too
    // could exceed its own denominator.
    const h = headline(at('cross-key', { keyRunThroughs: cleanRunsIn(['Bb', 'C']) }), 'internalized');
    expect(h.have).toBe(1);      // Bb only — C is held, and not counted twice
    expect(h.need).toBe(8);
    expect(h.have).toBeLessThanOrEqual(h.need);
  });
});
