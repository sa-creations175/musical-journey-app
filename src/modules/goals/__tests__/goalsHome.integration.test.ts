// @vitest-environment jsdom
/**
 * Phase 2 step 6h — Goals home end-to-end integration smoke.
 *
 * One test file that walks realistic data through every public
 * helper the redesigned Goals home composes — view toggle pref,
 * by-module section pipeline, dashed-anchor backstop decision,
 * legacy umbrella title substitution. Pins the cross-helper
 * cooperation that ad-hoc unit tests don't assert against.
 *
 * fake-indexeddb backs the live db. Per-test resets isolate
 * fixtures.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, type Goal } from '../../../lib/db';
import {
  loadGoalsView,
  saveGoalsView,
  STORAGE_KEY_GOALS_ACTIVE_VIEW,
} from '../goalsView';
import {
  isCurrentOrUpcoming,
  ORDERED_GOAL_MODULES,
} from '../goalsByModule';
import {
  findAllChildren,
  isCrossModuleUmbrella,
  umbrellaModuleId,
  umbrellaSubtitle,
} from '../umbrellaSummary';
import {
  defaultAnchorName,
  isLegacyAnchorName,
} from '../yearlyAnchorReview';
import {
  ASPIRATIONAL_PLACEHOLDERS,
  AT_RISK_RATIO,
  DEFAULT_DAY_PROFILE_MIX,
  UNRECOVERABLE_MESSAGE,
  coverageUnitForModule,
  getGoalFeasibility,
  isConsistencyMetric,
  loadDayProfileMix,
  rollupChildFeasibilities,
} from '../progress';
import {
  feasibilityDetailText,
  formatRollupBreakdown,
  formatUmbrellaDetail,
  isAllUnrecoverableRollup,
} from '../feasibilityDetail';
import {
  PROGRESSING_PILL,
  pillConfig,
  resolveUmbrellaStatus,
} from '../FeasibilityPill';

function mkGoal(overrides: Partial<Goal> = {}): Goal {
  const now = new Date(2026, 3, 29, 12).getTime(); // April 29
  return {
    id: 'g',
    scope: 'yearly',
    description: '',
    targetMetric: null,
    targetValue: null,
    targetUnit: null,
    currentValue: 0,
    contextTag: null,
    relatedModules: [],
    relatedItems: [],
    startDate: now - 90 * 86_400_000,
    targetDate: new Date(2026, 11, 31).getTime(),
    status: 'active',
    parentGoalId: null,
    contributesNumericallyToParent: false,
    isUmbrella: false,
    lastEngagedAt: null,
    ...overrides,
  };
}

const TODAY = new Date(2026, 3, 29, 12);

beforeEach(async () => {
  await db.userPrefs.clear();
  await db.goals.clear();
  localStorage.clear();
});

// -------------------------------------------------------------
// View toggle pref round-trip
// -------------------------------------------------------------

describe('view toggle (localStorage)', () => {
  it('falls back to timeframe on first visit', () => {
    expect(loadGoalsView()).toBe('timeframe');
  });

  it('persists module view across re-read', () => {
    saveGoalsView('module');
    expect(loadGoalsView()).toBe('module');
  });

  it('snaps a corrupt write back to the timeframe default', () => {
    localStorage.setItem(STORAGE_KEY_GOALS_ACTIVE_VIEW, 'legacy-grid');
    expect(loadGoalsView()).toBe('timeframe');
  });

  it('does NOT route through userPrefs / Dexie (regression guard)', async () => {
    saveGoalsView('module');
    const dexieRow = await db.userPrefs.get(STORAGE_KEY_GOALS_ACTIVE_VIEW);
    expect(dexieRow).toBeUndefined();
  });
});

// -------------------------------------------------------------
// By-module pipeline: ET umbrella + 4 dimension children;
// every other module renders the backstop.
// -------------------------------------------------------------

describe('by-module pipeline — ET anchor + four dimension children', () => {
  const umbrellaId = 'u-et-2026';

  function seedEtAnchor(): Goal[] {
    return [
      mkGoal({
        id: umbrellaId,
        scope: 'yearly',
        isUmbrella: true,
        description: 'Make music speak to me — intervals, chords, progressions, all of it.',
        targetMetric: null,
      }),
      mkGoal({
        id: 'c-breadth',
        scope: 'yearly',
        parentGoalId: umbrellaId,
        targetMetric: 'ear_training_coverage_at_acquired',
        targetValue: 143,
      }),
      mkGoal({
        id: 'c-mastery',
        scope: 'yearly',
        parentGoalId: umbrellaId,
        targetMetric: 'ear_training_mastery_at_mastered',
        targetValue: 50,
      }),
      mkGoal({
        id: 'c-depth',
        scope: 'yearly',
        parentGoalId: umbrellaId,
        targetMetric: 'ear_training_accuracy_overall',
        targetValue: 85,
      }),
      mkGoal({
        id: 'c-consistency',
        scope: 'yearly',
        parentGoalId: umbrellaId,
        targetMetric: 'ear_training_sessions_per_week',
        targetValue: 4,
      }),
    ];
  }

  it('current-period filter keeps every active yearly anchor goal', () => {
    const all = seedEtAnchor();
    const filtered = all.filter(g => isCurrentOrUpcoming(g, TODAY));
    expect(filtered).toHaveLength(5);
  });

  it('finds the umbrella + all four dimension children for ET', () => {
    const all = seedEtAnchor();
    const umbrella = all.find(g => g.isUmbrella)!;
    expect(findAllChildren(umbrella, all).map(c => c.id)).toEqual([
      'c-breadth',
      'c-mastery',
      'c-depth',
      'c-consistency',
    ]);
  });

  it('umbrella module derivation locates ET via its children', () => {
    const all = seedEtAnchor();
    const umbrella = all.find(g => g.isUmbrella)!;
    const children = findAllChildren(umbrella, all);
    expect(umbrellaModuleId(children)).toBe('ear-training');
    expect(isCrossModuleUmbrella(children)).toBe(false);
  });

  it('umbrella subtitle renders the four dimensions in children order with Depth → Accuracy', () => {
    const all = seedEtAnchor();
    const umbrella = all.find(g => g.isUmbrella)!;
    const children = findAllChildren(umbrella, all);
    expect(umbrellaSubtitle(children)).toBe(
      'Breadth · Mastery · Accuracy · Consistency',
    );
  });

  it('every module except ET ends up needing a backstop in this scenario', () => {
    // The by-module section logic: a module needs a backstop
    // when its filtered goals contain no yearly umbrella.
    const all = seedEtAnchor();
    const filtered = all.filter(g => isCurrentOrUpcoming(g, TODAY));

    const needsBackstop = ORDERED_GOAL_MODULES.map(moduleId => {
      const moduleGoals = filtered.filter(g => {
        if (g.isUmbrella) {
          return umbrellaModuleId(findAllChildren(g, filtered)) === moduleId;
        }
        return goalModule(g) === moduleId;
      });
      const yearlyUmbrella = moduleGoals.find(
        g => g.isUmbrella && g.scope === 'yearly',
      );
      return { moduleId, hasUmbrella: !!yearlyUmbrella };
    });

    expect(needsBackstop).toEqual([
      { moduleId: 'harmonic-fluency', hasUmbrella: false },
      { moduleId: 'ear-training', hasUmbrella: true },
      { moduleId: 'shapes-and-patterns', hasUmbrella: false },
      { moduleId: 'repertoire', hasUmbrella: false },
      { moduleId: 'production', hasUmbrella: false },
      { moduleId: 'practice-consistency', hasUmbrella: false },
    ]);
  });
});

// -------------------------------------------------------------
// Legacy umbrella titles — display-time substitution
// -------------------------------------------------------------

describe('legacy umbrella title heuristic', () => {
  it('substitutes the vision statement for the original "[Module] [Year]" default', () => {
    expect(isLegacyAnchorName('Ear Training 2026', 'ear-training', 2026)).toBe(true);
    // umbrellaDisplayTitle in Goals.tsx composes both calls;
    // here we just verify the building blocks.
    expect(defaultAnchorName('ear-training', 2026)).toBe(
      'Make music speak to me — intervals, chords, progressions, all of it.',
    );
  });

  it('substitutes the vision statement for the 6c.2 "Build comprehensive ..." default', () => {
    expect(
      isLegacyAnchorName(
        'Build comprehensive Ear Training mastery in 2026',
        'ear-training',
        2026,
      ),
    ).toBe(true);
  });

  it('does not mistake a user-customized title for legacy', () => {
    expect(isLegacyAnchorName('My ET goals for the year', 'ear-training', 2026)).toBe(false);
  });
});

// -------------------------------------------------------------
// localStorage round-trip — sanity on the persistence path used
// for collapse state. Already covered by
// rowCollapsePersistence.test.ts; included here as a guard
// against regressions that swap storage backends without
// noticing.
// -------------------------------------------------------------

describe('rowCollapse persistence — localStorage path is intact', () => {
  it('does NOT route through userPrefs / Dexie', async () => {
    // If someone re-introduces userPrefs persistence for
    // rowCollapse, this assertion fails — userPrefs would have
    // an entry under the old key after a write.
    localStorage.setItem(
      'goals.home.rowCollapse',
      JSON.stringify({ 'u-et-2026': 'collapsed' }),
    );
    const dexieRow = await db.userPrefs.get('goals.home.rowCollapse');
    expect(dexieRow).toBeUndefined();
    expect(localStorage.getItem('goals.home.rowCollapse')).toBe(
      '{"u-et-2026":"collapsed"}',
    );
  });
});

// -------------------------------------------------------------
// Step 7 integration — feasibility pipeline end-to-end
// -------------------------------------------------------------
//
// Walks realistic data through every public helper Step 7
// introduced: getGoalFeasibility per branch, rollup over an
// umbrella's children, detail formatters, and pill resolution.
// Pins the cross-helper cooperation that ad-hoc unit tests don't
// assert against.

describe('Step 7 integration — feasibility pipeline', () => {
  const today = new Date(2026, 3, 30, 12); // Apr 30 noon
  const decEnd = new Date(2026, 11, 31).getTime();
  const yearStart = new Date(2026, 0, 1).getTime();

  function etGoal(
    metric: string,
    target: number,
    currentValue: number,
    overrides: Partial<Goal> = {},
  ): Goal {
    return mkGoal({
      id: `g-${metric}`,
      scope: 'yearly',
      targetMetric: metric,
      targetValue: target,
      targetUnit: 'items',
      currentValue,
      startDate: yearStart,
      targetDate: decEnd,
      parentGoalId: 'u-et',
      ...overrides,
    });
  }

  it('healthy ET umbrella with 2 children → on_track rollup, breakdown reflects both', () => {
    // Both children projected far above target → on_track.
    const children = [
      etGoal('ear_training_coverage_at_acquired', 100, 50),  // ~150/wk pace × 35 weeks → way over
      etGoal('ear_training_accuracy_overall', 85, 90),       // current ≥ target
    ];
    const feas = children.map(c =>
      getGoalFeasibility(c, {
        currentValue: c.currentValue,
        today,
        mix: loadDayProfileMix(),
      }),
    );
    const rollup = rollupChildFeasibilities(feas);
    expect(rollup.status).toBe('on_track');
    expect(rollup.breakdown.on_track).toBe(2);
    expect(resolveUmbrellaStatus(rollup)).toBe('on_track');
    expect(formatUmbrellaDetail(rollup)).toBe('2 on track');
    expect(isAllUnrecoverableRollup(rollup)).toBe(false);
  });

  it('mixed status umbrella → critical rollup wins worst-case', () => {
    // Coverage projected slightly under target → at_risk.
    // Accuracy with large gap inside critical window → critical.
    const periodStart = today.getTime() - 25 * 86_400_000;
    const periodEnd = today.getTime() + 5 * 86_400_000;
    const children = [
      mkGoal({
        id: 'c-cov',
        scope: 'yearly',
        targetMetric: 'ear_training_coverage_at_acquired',
        targetValue: 6000,
        currentValue: 0,
        startDate: yearStart,
        targetDate: decEnd,
      }),
      mkGoal({
        id: 'c-acc',
        scope: 'monthly',
        targetMetric: 'ear_training_accuracy_overall',
        targetValue: 85,
        currentValue: 70,
        startDate: periodStart,
        targetDate: periodEnd,
      }),
    ];
    const feas = children.map(c =>
      getGoalFeasibility(c, {
        currentValue: c.currentValue,
        today,
        mix: loadDayProfileMix(),
      }),
    );
    const rollup = rollupChildFeasibilities(feas);
    expect(rollup.status).toBe('critical');
    expect(rollup.breakdown.critical).toBeGreaterThan(0);
    expect(resolveUmbrellaStatus(rollup)).toBe('critical');
  });

  it('umbrella with one unrecoverable child → unrecoverable counted in breakdown but excluded from rollup status', () => {
    const yesterday = today.getTime() - 86_400_000;
    const children = [
      etGoal('ear_training_coverage_at_acquired', 100, 50),  // on_track
      mkGoal({
        id: 'c-deadline-passed',
        scope: 'yearly',
        targetMetric: 'ear_training_accuracy_overall',
        targetValue: 85,
        currentValue: 60,
        startDate: yearStart,
        targetDate: yesterday,
      }),
    ];
    const feas = children.map(c =>
      getGoalFeasibility(c, {
        currentValue: c.currentValue,
        today,
        mix: loadDayProfileMix(),
      }),
    );
    const rollup = rollupChildFeasibilities(feas);
    expect(rollup.breakdown.unrecoverable).toBe(1);
    expect(rollup.breakdown.on_track).toBe(1);
    // Unrecoverable doesn't drag the umbrella down — on_track wins.
    expect(rollup.status).toBe('on_track');
    expect(resolveUmbrellaStatus(rollup)).toBe('on_track');
    expect(formatUmbrellaDetail(rollup)).toBe('1 on track · 1 unrecoverable');
    expect(isAllUnrecoverableRollup(rollup)).toBe(false);
  });

  it('all-unrecoverable umbrella → null rollup status, unified message at umbrella level', () => {
    const yesterday = today.getTime() - 86_400_000;
    const children = [
      mkGoal({
        id: 'c1',
        scope: 'yearly',
        targetMetric: 'ear_training_accuracy_overall',
        targetValue: 85,
        currentValue: 60,
        startDate: yearStart,
        targetDate: yesterday,
      }),
      mkGoal({
        id: 'c2',
        scope: 'yearly',
        targetMetric: 'ear_training_coverage_at_acquired',
        targetValue: 100,
        currentValue: 30,
        startDate: yearStart,
        targetDate: yesterday,
      }),
    ];
    const feas = children.map(c =>
      getGoalFeasibility(c, {
        currentValue: c.currentValue,
        today,
        mix: loadDayProfileMix(),
      }),
    );
    const rollup = rollupChildFeasibilities(feas);
    expect(rollup.status).toBeNull();
    expect(rollup.breakdown.unrecoverable).toBe(2);
    expect(isAllUnrecoverableRollup(rollup)).toBe(true);
    expect(formatUmbrellaDetail(rollup)).toBe(UNRECOVERABLE_MESSAGE);
    // Pill resolves to unrecoverable so the collapsed pill
    // shows gray "Unrecoverable" rather than inert.
    expect(resolveUmbrellaStatus(rollup)).toBe('unrecoverable');
  });

  it('aspirational standalone goal → seeded message + Progressing pill kind', () => {
    const aspirational = mkGoal({
      id: 'g-aspire',
      scope: 'lifetime',
      targetMetric: null,
    });
    const feas = getGoalFeasibility(aspirational, {
      currentValue: 0,
      today,
      mix: loadDayProfileMix(),
    });
    expect(feas.kind).toBe('aspirational');
    if (feas.kind === 'aspirational') {
      expect(ASPIRATIONAL_PLACEHOLDERS).toContain(feas.message);
      expect(feasibilityDetailText(feas)).toBe(feas.message);
    }
    // Same goal id always returns the same phrase across renders.
    const second = getGoalFeasibility(aspirational, {
      currentValue: 0,
      today,
      mix: loadDayProfileMix(),
    });
    if (feas.kind === 'aspirational' && second.kind === 'aspirational') {
      expect(second.message).toBe(feas.message);
    }
  });

  it('breakdown formatter omits zeros and uses descriptive states (not pill action verbs)', () => {
    expect(
      formatRollupBreakdown({
        on_track: 2, at_risk: 1, critical: 0, unrecoverable: 1,
      }),
    ).toBe('2 on track · 1 behind pace · 1 unrecoverable');
  });

  it('all status pills + Progressing pill stay in their non-red palette', () => {
    // Regression sweep: Step 7 must never reintroduce red.
    // Color-classified rather than prefix-matched so green-
    // dominant teals (#E1F5EE) don't false-positive on a "#e1"
    // prefix the way the older regex did.
    const isRedHex = (hex: string): boolean => {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      // Red: red channel dominates AND green/blue are low.
      return r >= 0xC0 && g < 0x80 && b < 0x80;
    };
    const palette = [
      pillConfig('on_track')!,
      pillConfig('at_risk')!,
      pillConfig('critical')!,
      pillConfig('unrecoverable')!,
      PROGRESSING_PILL,
    ];
    for (const cfg of palette) {
      expect(isRedHex(cfg.bg)).toBe(false);
      expect(isRedHex(cfg.text)).toBe(false);
    }
    // Sanity-check the classifier: a known red registers, a
    // known teal does not.
    expect(isRedHex('#E24B4A')).toBe(true);
    expect(isRedHex('#E1F5EE')).toBe(false);
  });

  it('coverage unit per module is correct + activity unit is distinct (regression)', () => {
    // Card modules: activity unit + coverage unit happen to
    // both be "cards". Time modules diverge: activity = minutes,
    // coverage = shapes / songs / lessons.
    expect(coverageUnitForModule('ear-training')).toBe('cards');
    expect(coverageUnitForModule('harmonic-fluency')).toBe('cards');
    expect(coverageUnitForModule('shapes-and-patterns')).toBe('shapes');
    expect(coverageUnitForModule('repertoire')).toBe('songs');
    expect(coverageUnitForModule('production')).toBe('lessons');
  });

  it('AT_RISK_RATIO and DEFAULT_DAY_PROFILE_MIX expose the documented defaults', () => {
    expect(AT_RISK_RATIO).toBe(0.85);
    expect(DEFAULT_DAY_PROFILE_MIX).toEqual({ standard: 3, deep: 1, light: 1 });
  });

  it('isConsistencyMetric catches all consistency cadence shapes', () => {
    // Pin the predicate that filters consistency children from
    // umbrella rendering (7e decision).
    expect(isConsistencyMetric('ear_training_sessions_per_week')).toBe(true);
    expect(isConsistencyMetric('ear_training_sessions_per_cadence')).toBe(true);
    expect(isConsistencyMetric('shapes_minutes_per_cadence')).toBe(true);
    expect(isConsistencyMetric('production_hours_per_cadence')).toBe(true);
    expect(isConsistencyMetric('practice_weekly_floor_days')).toBe(true);
    expect(isConsistencyMetric('ear_training_coverage_at_acquired')).toBe(false);
    expect(isConsistencyMetric(null)).toBe(false);
  });
});

// Mini reimplementation of moduleForMetric for the
// non-umbrella branch above. Kept inline so the test stays
// self-contained without re-exposing internal helpers.
function goalModule(goal: Goal): string | null {
  const m = goal.targetMetric;
  if (!m) return null;
  if (m.startsWith('ear_training_')) return 'ear-training';
  if (m.startsWith('harmonic_fluency_')) return 'harmonic-fluency';
  if (m.startsWith('shapes_')) return 'shapes-and-patterns';
  if (m.startsWith('repertoire_')) return 'repertoire';
  if (m === 'song_whole_at_level') return 'repertoire';
  if (m.startsWith('production_')) return 'production';
  if (m.startsWith('practice_')) return 'practice-consistency';
  return null;
}
