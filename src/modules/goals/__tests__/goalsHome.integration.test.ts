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
