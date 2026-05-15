// @vitest-environment jsdom
/**
 * Phase B Step 9a Part B — algo spacing demand tests.
 *
 * Pure-function tests over `computeAlgoSpacingDemandSeconds`. The
 * helper reads no DB — callers pass pre-loaded spacingState rows —
 * so tests construct fixtures inline. jsdom env is required because
 * progress.ts (transitively imported via the HF/SHAPES/ET constants)
 * touches `window` at module load under a DEV-only guard.
 */
import { describe, expect, it } from 'vitest';
import type { SpacingState } from '../../db';
import {
  computeAlgoSpacingDemandMinutes,
  computeAlgoSpacingDemandSeconds,
} from '../algoSpacingDemand';

const NOW = 1_700_000_000_000;
const PAST = NOW - 1000;
const FUTURE = NOW + 1000;

function row(
  itemRef: string,
  moduleRef: string,
  nextDueAt: number | null,
): SpacingState {
  return {
    id: `row-${itemRef}-${moduleRef}`,
    itemRef,
    moduleRef,
    memoryType: 'declarative',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 0,
    lastEngagedAt: nextDueAt,
    nextDueAt,
    performanceHistory: [],
  };
}

// ---------------------------------------------------------------------
// HF + ET — flat 30s seed, count due rows
// ---------------------------------------------------------------------

describe('computeAlgoSpacingDemandSeconds — harmonic-fluency', () => {
  it('counts only HF rows with nextDueAt ≤ asOf × 30 s seed', () => {
    const rows: SpacingState[] = [
      row('c1', 'harmonic-fluency', PAST),
      row('c2', 'harmonic-fluency', NOW), // <= asOf, counted
      row('c3', 'harmonic-fluency', FUTURE), // not due yet
      row('c4', 'harmonic-fluency', null),   // unscheduled, skipped
      row('x1', 'intervals',        PAST),   // wrong module
    ];
    // 2 due HF rows × 30 s = 60 s.
    expect(computeAlgoSpacingDemandSeconds('harmonic-fluency', rows, NOW))
      .toBe(60);
  });

  it('10 due HF items → 300 s (5 min), matching the design-doc example', () => {
    const rows: SpacingState[] = Array.from({ length: 10 }, (_, i) =>
      row(`c${i}`, 'harmonic-fluency', PAST),
    );
    expect(computeAlgoSpacingDemandSeconds('harmonic-fluency', rows, NOW))
      .toBe(10 * 30);
    expect(computeAlgoSpacingDemandMinutes('harmonic-fluency', rows, NOW))
      .toBe(5);
  });

  it('returns 0 when no rows are due', () => {
    const rows: SpacingState[] = [
      row('c1', 'harmonic-fluency', FUTURE),
      row('c2', 'harmonic-fluency', null),
    ];
    expect(computeAlgoSpacingDemandSeconds('harmonic-fluency', rows, NOW))
      .toBe(0);
  });
});

describe('computeAlgoSpacingDemandSeconds — ear-training', () => {
  it('counts due rows across every ET_MODULE_REFS submodule × 30 s', () => {
    const rows: SpacingState[] = [
      row('M3:asc', 'intervals',          PAST),
      row('maj',   'chord-recognition',   PAST),
      row('ii-V',  'chord-progressions',  PAST),
      row('dor',   'scales-modes',        PAST),
      row('mix',   'scales-modes',        FUTURE),     // not yet due
      row('c1',    'harmonic-fluency',    PAST),       // wrong module
    ];
    // 4 due ET rows × 30 = 120 s.
    expect(computeAlgoSpacingDemandSeconds('ear-training', rows, NOW))
      .toBe(120);
  });

  it('null nextDueAt does not count as due (skips unscheduled rows)', () => {
    const rows: SpacingState[] = [
      row('M3:asc', 'intervals', null),
      row('P5:asc', 'intervals', null),
    ];
    expect(computeAlgoSpacingDemandSeconds('ear-training', rows, NOW))
      .toBe(0);
  });
});

// ---------------------------------------------------------------------
// S&P — per-item-shape seeds
// ---------------------------------------------------------------------

describe('computeAlgoSpacingDemandSeconds — shapes-and-patterns', () => {
  it('chord-shape (non-fluid) → 90 s per due cell', () => {
    const rows: SpacingState[] = [
      row('chord-shape:maj7:C:root', 'shapes-and-patterns', PAST),
      row('chord-shape:min7:G:root', 'shapes-and-patterns', PAST),
      row('chord-shape:dim:D:root',  'shapes-and-patterns', FUTURE),
    ];
    expect(computeAlgoSpacingDemandSeconds('shapes-and-patterns', rows, NOW))
      .toBe(2 * 90);
  });

  it('chord-shape fluid → 120 s', () => {
    const rows: SpacingState[] = [
      row('chord-shape:maj7:C:fluid', 'shapes-and-patterns', PAST),
      row('chord-shape:min7:G:root',  'shapes-and-patterns', PAST),
    ];
    expect(computeAlgoSpacingDemandSeconds('shapes-and-patterns', rows, NOW))
      .toBe(120 + 90);
  });

  it('scale rows use SCALE_KIND_SECONDS (major 30, natural-minor 90, pents 30)', () => {
    const rows: SpacingState[] = [
      row('scale:major:C',                   'shapes-and-patterns', PAST),
      row('scale:natural-minor:A',           'shapes-and-patterns', PAST),
      row('scale:major-pentatonic:1:C',      'shapes-and-patterns', PAST),
      row('scale:minor-pentatonic:1:A',      'shapes-and-patterns', PAST),
    ];
    expect(computeAlgoSpacingDemandSeconds('shapes-and-patterns', rows, NOW))
      .toBe(30 + 90 + 30 + 30);
  });

  it('voice-leading ABA-251 levels 1–2 → 90 s, level 3 → 120 s', () => {
    const rows: SpacingState[] = [
      row('vl:aba-251:level1:A:C', 'shapes-and-patterns', PAST), // 90
      row('vl:aba-251:level2:B:F', 'shapes-and-patterns', PAST), // 90
      row('vl:aba-251:level3:A:G', 'shapes-and-patterns', PAST), // 120
    ];
    expect(computeAlgoSpacingDemandSeconds('shapes-and-patterns', rows, NOW))
      .toBe(90 + 90 + 120);
  });

  it('voice-leading diatonic-cycle → 180 s', () => {
    const rows: SpacingState[] = [
      row('vl:diatonic-cycle:pos1:C',  'shapes-and-patterns', PAST),
      row('vl:diatonic-cycle:pos3:Bb', 'shapes-and-patterns', PAST),
    ];
    expect(computeAlgoSpacingDemandSeconds('shapes-and-patterns', rows, NOW))
      .toBe(2 * 180);
  });

  it('voice-leading dom-altered + dim7 patterns → 90 s each', () => {
    const rows: SpacingState[] = [
      row('vl:dom-sharp9sharp5:A:min9:C', 'shapes-and-patterns', PAST),
      row('vl:dom7b9:B:min7:Eb',          'shapes-and-patterns', PAST),
      row('vl:dim7:up:min9:G',            'shapes-and-patterns', PAST),
      row('vl:dim7:down:mintriad:A',      'shapes-and-patterns', PAST),
    ];
    expect(computeAlgoSpacingDemandSeconds('shapes-and-patterns', rows, NOW))
      .toBe(4 * 90);
  });

  it('legacy 3-part `vl:patternId:key` falls back to the modal 90 s baseline', () => {
    // Pre-Phase-1 itemRefs (e.g. user-typed customs or rows from
    // before the sub-cell fan-out) won't parse against the strict
    // new catalog. We fall back to the modal cell seed rather than
    // dropping the row.
    const rows: SpacingState[] = [
      row('vl:aba-251:C',  'shapes-and-patterns', PAST),
      row('vl:1736251:Bb', 'shapes-and-patterns', PAST),
    ];
    expect(computeAlgoSpacingDemandSeconds('shapes-and-patterns', rows, NOW))
      .toBe(2 * 90);
  });

  it('unknown / unparseable itemRefs fall back to default cell seed (defensive)', () => {
    const rows: SpacingState[] = [
      row('mystery-future-shape:foo', 'shapes-and-patterns', PAST),
    ];
    expect(computeAlgoSpacingDemandSeconds('shapes-and-patterns', rows, NOW))
      .toBe(90);
  });
});

// ---------------------------------------------------------------------
// Repertoire + Production — no due-today concept → 0
// ---------------------------------------------------------------------

describe('computeAlgoSpacingDemandSeconds — repertoire / production', () => {
  it('repertoire returns 0 even when rows look due', () => {
    // Repertoire scheduling is user-driven (no nextDueAt concept).
    // Any spacingState rows under moduleRef='repertoire' (if seeded)
    // are intentionally ignored — the over-practice slice falls
    // through to the Part A target with no expansion.
    const rows: SpacingState[] = [
      row('song:bag-lady:chorus', 'repertoire', PAST),
      row('song:bag-lady:verse',  'repertoire', PAST),
    ];
    expect(computeAlgoSpacingDemandSeconds('repertoire', rows, NOW))
      .toBe(0);
  });

  it('production returns 0 (mastery-state progression, no due dates)', () => {
    const rows: SpacingState[] = [
      row('wf-01',   'production', PAST),
      row('lang-01', 'production', PAST),
    ];
    expect(computeAlgoSpacingDemandSeconds('production', rows, NOW))
      .toBe(0);
  });

  it('practice-consistency returns 0 (defensive — not a coverage module)', () => {
    expect(computeAlgoSpacingDemandSeconds('practice-consistency', [], NOW))
      .toBe(0);
  });
});

// ---------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------

describe('computeAlgoSpacingDemandSeconds — edge cases', () => {
  it('empty rows returns 0 across every module', () => {
    const modules = [
      'harmonic-fluency',
      'ear-training',
      'shapes-and-patterns',
      'repertoire',
      'production',
      'practice-consistency',
    ] as const;
    for (const m of modules) {
      expect(computeAlgoSpacingDemandSeconds(m, [], NOW)).toBe(0);
    }
  });

  it('nextDueAt exactly equal to asOf counts as due (boundary inclusive)', () => {
    const rows: SpacingState[] = [
      row('c1', 'harmonic-fluency', NOW),
    ];
    expect(computeAlgoSpacingDemandSeconds('harmonic-fluency', rows, NOW))
      .toBe(30);
  });
});
