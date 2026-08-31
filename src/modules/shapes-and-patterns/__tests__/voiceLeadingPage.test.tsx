// @vitest-environment jsdom
/**
 * The voice-leading grid, wearing the same face — and it is the
 * simplest case.
 *
 * =====================================================================
 * A CELL HOLDS ONE TARGET.
 *
 * Voice leading is two-handed by nature and only ever writes `both`, so
 * a cell IS its target. There is no roll-up to make — a Furthest /
 * Lowest control over one thing cannot change anything — and no Edit
 * what counts, because taking the only target out would leave the cell
 * with no status at all.
 *
 * Every other step is the scales page's, unchanged. This grid was the
 * last one where clicking a square opened the session panel and took
 * over the screen; it fills Progress Details now.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import VoiceLeadingDrills from '../VoiceLeadingDrills';
import { db, type SpacingState } from '../../../lib/db';
import { sectionCells } from '../cellTargets';
import { statusColour } from '../../../lib/spacing/statusColour';

vi.mock('../../../lib/userPrefs', () => ({
  getPref: async (_k: string, d: unknown) => d,
  setPref: async () => {},
}));

vi.mock('../../../components/Toaster', () => ({
  useToast: () => ({ toast: () => {} }),
}));

/** The first voice-leading cell in the catalog, and its one target. */
const FIRST = sectionCells('voice-leading')[0][0];

let root: Root | null = null;
let host: HTMLElement | null = null;

function tested(itemRef: string, feel: number): SpacingState {
  const at = Date.now();
  return {
    id: `ss-${itemRef}`,
    itemRef,
    moduleRef: 'shapes-and-patterns',
    hand: 'both',
    memoryType: 'procedural',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 3,
    lastEngagedAt: at,
    nextDueAt: null,
    performanceHistory: [1, 2, 3].map(() => ({
      kind: 'rating', rating: feel >= 4 ? 'flying' : 'cruising', feel,
      fromTest: true, sessionId: 'ss-1', at,
    })),
  } as unknown as SpacingState;
}

beforeEach(async () => {
  await db.spacingState.clear();
  await db.drillSessions.clear();
  await db.drillSkills.clear();
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
});

async function render() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<VoiceLeadingDrills />); });
  for (let i = 0; i < 10; i += 1) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return host;
}

const text = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');
const buttons = () => [...document.body.querySelectorAll('button')];
const targetRows = () => [...document.body.querySelectorAll('[data-testid="detail-target"]')];
/** A grid square: it names one of the six words and is pressable. */
const cells = () => buttons().filter(
  b => /^(Not Started|Started|Needs Work|Developing|Fluent|Mastered)$/
    .test((b.textContent ?? '').trim()),
);

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
};

describe('a cell reads its one target', () => {
  it('names a status in the six words', async () => {
    await render();
    expect(cells().length).toBeGreaterThan(0);
    expect(cells()[0].textContent).toMatch(
      /Not Started|Started|Needs Work|Developing|Fluent|Mastered/,
    );
  });

  it('directly — no roll-up between the cell and its row', async () => {
    await db.spacingState.add(tested(FIRST.itemRef, 4));
    await render();
    const cell = cells().find(c => (c.getAttribute('title') ?? '').includes('Mastered'));
    expect(cell).toBeDefined();
    for (const cls of statusColour('mastered').fill.split(' ')) {
      expect(cell!.className, cls).toContain(cls);
    }
  });

  it('NO ROLL-UP CONTROL IS OFFERED', async () => {
    await render();
    const labels = buttons().map(b => (b.textContent ?? '').trim());
    expect(labels).not.toContain('Furthest');
    expect(labels).not.toContain('Lowest');
  });

  it('and NO EDIT WHAT COUNTS', async () => {
    await render();
    await click(cells()[0]);
    expect(buttons().map(b => (b.textContent ?? '').trim()))
      .not.toContain('Edit what counts');
    expect(text()).not.toContain('not counted');
  });

  it('so the roll-up sentence explains no choice nobody made', async () => {
    await render();
    await click(cells()[0]);
    // "Reads Not Started. Total time …" — no "the furthest of".
    expect(text()).toContain('Reads');
    expect(text()).not.toContain('the furthest of');
    expect(text()).not.toContain('the lowest of');
  });
});

describe('clicking a cell opens no modal', () => {
  it('it fills Progress Details with the cell’s one target', async () => {
    await render();
    expect(targetRows()).toHaveLength(0);
    await click(cells()[0]);
    expect(text()).toContain('Progress Details');
    expect(targetRows()).toHaveLength(1);
    expect(targetRows()[0].textContent).toContain('Both hands');
  });

  it('and the target unfolds its logs with the Drill button above them', async () => {
    await render();
    await click(cells()[0]);
    await click(targetRows()[0]);
    const t = text();
    expect(t).toContain('Drill both hands');
    expect(t).toContain('Practice runs');
    expect(t).toContain('Test runs');
    expect(t.indexOf('Drill both hands')).toBeLessThan(t.indexOf('Practice runs'));
  });

  it('THE SESSION PANEL NO LONGER OPENS ON THE SQUARE ITSELF', async () => {
    await render();
    await click(cells()[0]);
    // The panel's own first question. It arrives from the target
    // inside the detail, not from the grid.
    expect(buttons().map(b => (b.textContent ?? '').trim().startsWith('Practice')))
      .not.toContain(true);
  });
});

describe('the heat shading is gone', () => {
  it('nothing on the grid varies a colour by time', async () => {
    await render();
    for (const c of cells()) {
      expect((c as HTMLElement).getAttribute('style') ?? '').not.toContain('rgba');
    }
  });

  it('and the retired words appear nowhere', async () => {
    await render();
    expect(text()).not.toContain('Acquired');
    expect(text()).not.toContain('In Progress');
  });
});
