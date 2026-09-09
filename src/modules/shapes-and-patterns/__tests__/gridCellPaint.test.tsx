// @vitest-environment jsdom
/**
 * Two things every grid has to get right about a cell: what it is
 * painted, and where it starts.
 *
 * =====================================================================
 * STARTED IS A STATUS, NOT AN IN-BETWEEN.
 *
 * It reported as bare — the word in plain dark text on no fill at all,
 * beside a Needs Work cell that was a solid red tile and a Not Started
 * cell that was a correct dashed outline. Every step from the roll-up
 * to the class name turns out to be right; what was wrong was one step
 * further out, and is written up in the report. These pin the part that
 * lives in code, so if a roll-up ever stops being able to SAY Started —
 * the failure the report was originally expected to find — it fails
 * here instead of painting nothing.
 *
 * =====================================================================
 * AND EVERY TILE STARTS AT THE SAME X.
 *
 * The key names down the left sat in a content-sized column, so `B♭`
 * pushed its row further right than `C` did and the grid's left edge
 * wobbled. Three grids had three answers — a content-sized table
 * column, a `minmax(160px, 200px)` range, and a longest-quality-name —
 * and now they have one.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { createRoot, type Root } from 'react-dom/client';
import ScaleDrills from '../ScaleDrills';
import ChordShapeDrills from '../ChordShapeDrills';
import VoiceLeadingDrills from '../VoiceLeadingDrills';
import { GRID_GUTTER } from '../BandCell';
import { db, type SpacingState } from '../../../lib/db';
import { statusColour } from '../../../lib/spacing/statusColour';
import { rollUpTargets, rollUpTargetsFurthest } from '../../../lib/spacing/rollup';
import { chordCellTargets, sectionCells } from '../cellTargets';
import { CHORD_QUALITIES, KEYS_CIRCLE_OF_FOURTHS } from '../catalog';
import { SCALE_CELLS } from '../scaleSkills';

vi.mock('../../../lib/userPrefs', () => ({
  getPref: async (_k: string, d: unknown) => d,
  setPref: async () => {},
}));
vi.mock('../../../components/Toaster', () => ({
  useToast: () => ({ toast: () => {} }),
}));

let root: Root | null = null;
let host: HTMLElement | null = null;

/**
 * A row that has been TOUCHED but has earned no band — one rating, and
 * the band rule wants three clean ones in a session. This is what makes
 * a cell read Started.
 */
function touched(itemRef: string, hand: SpacingState['hand']): SpacingState {
  return {
    id: `ss-${itemRef}-${hand}`,
    itemRef,
    moduleRef: 'shapes-and-patterns',
    hand,
    memoryType: 'procedural',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 3,
    lastEngagedAt: Date.now(),
    nextDueAt: null,
    performanceHistory: [{
      kind: 'rating', rating: 'cruising', feel: 3,
      fromTest: false, sessionId: 'ss-1', at: Date.now(),
    }],
  } as unknown as SpacingState;
}

beforeEach(async () => {
  await db.spacingState.clear();
  await db.drillSessions.clear();
  await db.drillSkills.clear();
  await db.drillTypes.clear();
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
});

async function render(node: React.ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  // THE PAGE ROUTES NOW — its add button opens a movement's own page —
  // so it needs a router around it. Rendering it bare threw where the
  // subject is the grid, which is not what these are about.
  await act(async () => { root!.render(<MemoryRouter>{node}</MemoryRouter>); });
  for (let i = 0; i < 10; i += 1) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return host;
}

const startedCells = () => [...document.body.querySelectorAll('button')]
  .filter(b => (b.textContent ?? '').trim().startsWith('Started'));

const gutters = () => [...document.body.querySelectorAll('[data-testid="grid-gutter"]')];

// ---------------------------------------------------------------------
// The roll-up can say Started
// ---------------------------------------------------------------------

describe('a roll-up can express Started, both ways round', () => {
  const started = touched('scale:major:C', 'left');

  it('FURTHEST says Started when nothing has earned a band', () => {
    // The rule that USED to be hand-rolled per grid. If it ever loses
    // the ability to report Started, a cell paints nothing — which is
    // the shape of failure this file exists for.
    expect(rollUpTargetsFurthest([started, undefined, undefined]))
      .toEqual({ kind: 'started', tries: 0 });
  });

  it('and LOWEST says the same', () => {
    expect(rollUpTargets([started, undefined, undefined]))
      .toEqual({ kind: 'started', tries: 0 });
  });

  it('with nothing touched at all it is Not Started, not Started', () => {
    expect(rollUpTargetsFurthest([undefined, undefined, undefined]).kind)
      .toBe('not-started');
    expect(rollUpTargets([undefined, undefined, undefined]).kind)
      .toBe('not-started');
  });
});

// ---------------------------------------------------------------------
// And every grid paints it
// ---------------------------------------------------------------------

/** Every class the palette says a Started fill is made of. */
const STARTED_FILL = statusColour('started').fill.split(' ');

describe('a Started cell is painted, not bare', () => {
  it('on the scales grid', async () => {
    await db.spacingState.add(touched(SCALE_CELLS[0].itemRef, 'left'));
    await render(<ScaleDrills />);
    const cells = startedCells();
    expect(cells.length).toBeGreaterThan(0);
    for (const cls of STARTED_FILL) {
      expect(cells[0].className, cls).toContain(cls);
    }
    // A FILL, and specifically the palette's own — not a bare tile and
    // not Not Started's dashed one.
    expect(cells[0].className).toContain('bg-started');
    expect(cells[0].className).not.toContain('border-dashed');
  });

  it('on the chord-shape grid', async () => {
    const t = chordCellTargets(CHORD_QUALITIES[0].id, KEYS_CIRCLE_OF_FOURTHS[0])[0];
    await db.spacingState.add(touched(t.itemRef, t.hand));
    await render(<ChordShapeDrills scope="all" onScopeChange={() => {}} />);
    const cells = startedCells();
    expect(cells.length).toBeGreaterThan(0);
    for (const cls of STARTED_FILL) {
      expect(cells[0].className, cls).toContain(cls);
    }
    expect(cells[0].className).not.toContain('border-dashed');
  });

  it('on the voice-leading grid', async () => {
    const first = sectionCells('voice-leading')[0][0];
    await db.spacingState.add(touched(first.itemRef, 'both'));
    await render(<VoiceLeadingDrills />);
    const cells = startedCells();
    expect(cells.length).toBeGreaterThan(0);
    for (const cls of STARTED_FILL) {
      expect(cells[0].className, cls).toContain(cls);
    }
    expect(cells[0].className).not.toContain('border-dashed');
  });

  it('and it is the same fill on all three, because it is one source', () => {
    expect(statusColour('started').fill).toBe('bg-started text-neutral-800');
  });
});

// ---------------------------------------------------------------------
// Every token the palette names is declared
// ---------------------------------------------------------------------

describe('every colour the palette names exists in the config', () => {
  /**
   * THE GUARD THAT WAS MISSING.
   *
   * `statusColour` names Tailwind tokens as strings. A token that is
   * renamed or dropped from the config does not fail a build, a type
   * check or any other test — the class is simply emitted and resolves
   * to nothing, and the cell paints bare. Which is exactly what a
   * Started cell was reported doing.
   */
  const TOKENS = ['needswork', 'developing', 'fluent', 'mastered', 'started'];

  /**
   * The config read as TEXT, not imported.
   *
   * `tailwind.config.js` is plain JS with no declaration file, and it
   * is the build's input rather than the app's — pulling it into the
   * type graph to read five key names would be the wrong direction.
   * Vite's own glob gives its source.
   */
  const CONFIG = (import.meta.glob('/tailwind.config.js', {
    eager: true, query: '?raw', import: 'default',
  }) as Record<string, string>)['/tailwind.config.js'];

  /** The colour tokens the config declares, by name. */
  const declaredTokens = () => new Set(
    [...CONFIG.matchAll(/^\s{8}([a-z][a-z-]*):\s*'#[0-9A-Fa-f]{6}',/gm)]
      .map(m => m[1]),
  );

  it('the config declares each of them', () => {
    const declared = declaredTokens();
    for (const token of TOKENS) {
      expect([...declared], token).toContain(token);
    }
  });

  it('and the palette names no token the config has not got', () => {
    const declared = declaredTokens();
    const named = new Set<string>();
    for (const key of ['not-started', 'started', 'needs-work', 'developing', 'fluent', 'mastered'] as const) {
      const c = statusColour(key);
      for (const cls of [c.fill, c.badge, c.bar, c.swatch, c.text, c.outline].join(' ').split(' ')) {
        const m = /^(?:dark:)?(?:bg|text|border)-([a-z-]+)(?:\/\d+)?$/.exec(cls);
        // Tailwind's own scales (neutral-400, white) are not ours to
        // declare; only the bare status tokens are.
        if (m && TOKENS.includes(m[1])) named.add(m[1]);
      }
    }
    for (const token of named) expect(declared, token).toContain(token);
  });
});

// ---------------------------------------------------------------------
// One gutter, everywhere
// ---------------------------------------------------------------------

describe('every tile starts at the same x', () => {
  const allSameWidth = () => {
    const widths = new Set(gutters().map(g => (g as HTMLElement).style.width));
    expect(gutters().length).toBeGreaterThan(0);
    expect([...widths]).toEqual([GRID_GUTTER]);
  };

  it('across every block on the scales page', async () => {
    await render(<ScaleDrills />);
    // Four groups, each its own table, each with a header cell and
    // twelve key cells.
    expect(gutters().length).toBeGreaterThan(12);
    allSameWidth();
  });

  it('and a two-character key name does not push its row over', async () => {
    await render(<ScaleDrills />);
    const flats = gutters().filter(g => (g.textContent ?? '').includes('♭'));
    expect(flats.length).toBeGreaterThan(0);
    for (const g of flats) {
      expect((g as HTMLElement).style.width).toBe(GRID_GUTTER);
    }
  });

  it('on the chord-shape grid', async () => {
    await render(<ChordShapeDrills scope="all" onScopeChange={() => {}} />);
    allSameWidth();
  });

  it('on the voice-leading grid', async () => {
    await render(<VoiceLeadingDrills />);
    allSameWidth();
  });

  it('and it is ONE constant, so the three pages line up with each other', () => {
    // The value itself is asserted rather than compared between two
    // renders: a shared constant is the thing that makes them equal,
    // and a test that only compared them would pass on two copies.
    expect(GRID_GUTTER).toBe('10rem');
  });
});
