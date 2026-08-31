// @vitest-environment jsdom
/**
 * The chord-shape grid, wearing the face the scales grid wears.
 *
 * =====================================================================
 * A CELL WAS A BLANK SQUARE SHADED BY TIME INVESTED.
 *
 * It told you something had happened without saying what: a cell with
 * one Mastered target and eleven untouched looked much like a cell with
 * twelve Developing ones. And clicking it opened a modal that drew the
 * same table Progress Details draws — two places, one job.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ChordShapeDrills from '../ChordShapeDrills';
import { db, type SpacingState } from '../../../lib/db';
import { chordCellTargets, targetKey } from '../cellTargets';
import { statusColour } from '../../../lib/spacing/statusColour';
import { CHORD_QUALITIES, KEYS_CIRCLE_OF_FOURTHS } from '../catalog';

/** The first cell on the grid: the first quality, in the first key. */
const Q = CHORD_QUALITIES[0].id;
const K = KEYS_CIRCLE_OF_FOURTHS[0];

let root: Root | null = null;
let host: HTMLElement | null = null;

/** A row whose HISTORY earns a band — three clean runs in one session,
 *  which is what the band rule reads. */
function tested(itemRef: string, hand: SpacingState['hand'], feel: number): SpacingState {
  const at = Date.now();
  return {
    id: `ss-${itemRef}-${hand}`,
    itemRef,
    moduleRef: 'shapes-and-patterns',
    hand,
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
  await db.drillTypes.clear();
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
  await act(async () => {
    root!.render(<ChordShapeDrills scope="all" onScopeChange={() => {}} />);
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return host;
}

const text = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');
const buttons = () => [...document.body.querySelectorAll('button')];
const cells = () => [...document.body.querySelectorAll('[data-testid="chord-shape-cell"]')];
const targetRows = () => [...document.body.querySelectorAll('[data-testid="detail-target"]')];

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
};

const press = async (label: string) => {
  const b = buttons().find(x => (x.textContent ?? '').trim() === label);
  if (!b) throw new Error(`no button "${label}"`);
  await click(b);
};

describe('a cell names its status', () => {
  it('prints one of the six words on every tile', async () => {
    await render();
    expect(cells().length).toBe(CHORD_QUALITIES.length * KEYS_CIRCLE_OF_FOURTHS.length);
    for (const c of cells().slice(0, 5)) {
      expect(c.textContent).toMatch(
        /Not Started|Started|Needs Work|Developing|Fluent|Mastered/,
      );
    }
  });

  it('and resolves its colour through statusColour', async () => {
    // Every target of ONE cell at Mastered.
    await db.spacingState.bulkAdd(
      chordCellTargets(Q, K).map(t => tested(t.itemRef, t.hand, 4)),
    );
    await render();
    const cell = cells()[0];
    expect(cell.textContent).toContain('Mastered');
    for (const cls of statusColour('mastered').fill.split(' ')) {
      expect(cell.className, cls).toContain(cls);
    }
  });

  it('THE HEAT SHADING IS GONE — nothing varies a colour by time', async () => {
    await render();
    for (const c of cells()) {
      // The old cell painted `rgba(29, 158, 117, α)` inline, where α
      // was hours invested × freshness.
      expect((c as HTMLElement).getAttribute('style') ?? '').not.toContain('rgba');
    }
    expect(text()).not.toContain('darken with time invested');
  });

  it('and the retired words appear nowhere', async () => {
    await render();
    expect(text()).not.toContain('Acquired');
    expect(text()).not.toContain('In Progress');
  });
});

describe('a cell rolls up its twelve targets', () => {
  const targets = () => chordCellTargets(Q, K);

  it('twelve of them — four inversion states across three hands', () => {
    expect(targets()).toHaveLength(12);
  });

  it('FURTHEST reads as high as its best, LOWEST as low as its weakest', async () => {
    // One target at Mastered, one at Fluent, ten untouched.
    const all = targets();
    await db.spacingState.bulkAdd([
      tested(all[0].itemRef, all[0].hand, 4),
      tested(all[1].itemRef, all[1].hand, 3),
    ]);
    await render();
    expect(cells()[0].textContent).toContain('Mastered');
    await press('Lowest');
    // Ten targets have no band, so the cell cannot report one — it is
    // Started, because something under it HAS been touched. That is
    // `rollUpVerdicts`' own floor, and it is why Furthest is the
    // default: a twelve-target square sits there for a long time.
    expect(cells()[0].textContent).toContain('Started');
    expect(cells()[0].textContent).not.toContain('Mastered');
    await press('Furthest');
    expect(cells()[0].textContent).toContain('Mastered');
  });

  it('and the count says how many are at least that far', async () => {
    const all = targets();
    await db.spacingState.bulkAdd(
      all.slice(0, 3).map(t => tested(t.itemRef, t.hand, 4)),
    );
    await render();
    // Three of twelve at Mastered; the cell reads Mastered (furthest)
    // and says so is three of the twelve.
    expect(cells()[0].textContent).toContain('3/12');
  });
});

describe('taking a target out of the score', () => {
  it('changes the ROLL-UP and the COUNT together', async () => {
    const all = chordCellTargets(Q, K);
    // One Mastered, the rest untouched — so Lowest reads Not Started
    // and the count is 1/12.
    await db.spacingState.add(tested(all[0].itemRef, all[0].hand, 4));
    await render();
    await click(cells()[0]);
    expect(cells()[0].textContent).toContain('1/12');

    await press('Edit what counts');
    // Take the Mastered one out: the cell loses its word AND its
    // numerator, and the denominator drops to eleven.
    const row = targetRows().find(
      r => r.getAttribute('data-target') === targetKey(all[0].itemRef, all[0].hand),
    )!;
    await click(row);
    expect(cells()[0].textContent).toContain('Not Started');
    expect(text()).toContain('1 taken out of this cell');
  });

  it('so 7 of 12 reads 7 of 9 when three come out', async () => {
    const all = chordCellTargets(Q, K);
    await db.spacingState.bulkAdd(
      all.slice(0, 7).map(t => tested(t.itemRef, t.hand, 4)),
    );
    await render();
    await click(cells()[0]);
    expect(cells()[0].textContent).toContain('7/12');

    await press('Edit what counts');
    // Three UNTOUCHED targets out — the seven Mastered ones stay.
    for (const t of all.slice(9)) {
      const row = targetRows().find(
        r => r.getAttribute('data-target') === targetKey(t.itemRef, t.hand),
      )!;
      await click(row);
    }
    expect(cells()[0].textContent).toContain('7/9');
  });

  it('NOTHING IS DELETED — the row stays, struck through and labelled', async () => {
    const all = chordCellTargets(Q, K);
    await render();
    await click(cells()[0]);
    await press('Edit what counts');
    const key = targetKey(all[0].itemRef, all[0].hand);
    await click(targetRows().find(r => r.getAttribute('data-target') === key)!);

    const row = targetRows().find(r => r.getAttribute('data-target') === key)!;
    expect(row.getAttribute('data-counted')).toBe('false');
    expect(row.innerHTML).toContain('line-through');
    expect(row.textContent).toContain('not counted');
    // And it is still one of the twelve rows on screen.
    expect(targetRows()).toHaveLength(12);
  });
});

describe('clicking a cell opens no modal', () => {
  it('it fills Progress Details, which lists the twelve', async () => {
    await render();
    expect(targetRows()).toHaveLength(0);
    await click(cells()[0]);
    expect(text()).toContain('Progress Details');
    expect(targetRows()).toHaveLength(12);
    // The old modal's own frame and its Close.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(buttons().some(b => (b.textContent ?? '').trim() === 'Close')).toBe(false);
  });

  it('and each row unfolds its logs with the Drill button above them', async () => {
    await render();
    await click(cells()[0]);
    await click(targetRows()[0]);
    const t = text();
    expect(t).toContain('Drill left hand');
    expect(t).toContain('Practice runs');
    expect(t).toContain('Test runs');
    expect(t.indexOf('Drill left hand')).toBeLessThan(t.indexOf('Practice runs'));
    expect(t.indexOf('Practice runs')).toBeLessThan(t.indexOf('Test runs'));
  });

  it('a row names its shape AND its hand', async () => {
    await render();
    await click(cells()[0]);
    expect(targetRows()[0].textContent).toContain('Root position · Left hand');
    expect(targetRows()[11].textContent).toContain('All inversions fluid · Both hands');
  });

  it('and Total time and Last practiced are on the row', async () => {
    await render();
    await click(cells()[0]);
    expect(text()).toContain('Total time');
  });
});
