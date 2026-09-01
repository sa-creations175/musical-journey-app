// @vitest-environment jsdom
/**
 * Taking a target out of the score in every key at once.
 *
 * =====================================================================
 * SEVENTY-TWO CLICKS.
 *
 * Left-hand second inversion is not something you are going for in ANY
 * key, and saying so one cell at a time is six qualities × twelve keys.
 * The wider gesture spreads the change along the ONE axis the grids lay
 * out horizontally — the key — and stops at the row you are in: major
 * sevens in twelve keys, not minor sevens, not the other inversions,
 * not the other hands.
 *
 * =====================================================================
 * IT IS A BULK ACTION, NOT A RULE.
 *
 * It writes exactly what twelve clicks would have written, into the set
 * every counting surface already reads. So afterwards it is per cell
 * again and one key can be put back on its own — and a key added to the
 * catalog later would not inherit it, which is the cost.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ChordShapeDrills from '../ChordShapeDrills';
import ScaleDrills from '../ScaleDrills';
import { db, type SpacingState } from '../../../lib/db';
import {
  chordCellTargets, targetKey, targetsAcrossKeys,
} from '../cellTargets';
import { CHORD_QUALITIES, KEYS_CIRCLE_OF_FOURTHS } from '../catalog';
import { SCALE_CELLS } from '../scaleSkills';

vi.mock('../../../lib/userPrefs', () => ({
  getPref: async (_k: string, d: unknown) => d,
  setPref: async () => {},
}));

const Q = CHORD_QUALITIES[0].id;
const K = KEYS_CIRCLE_OF_FOURTHS[0];

let root: Root | null = null;
let host: HTMLElement | null = null;

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

const settle = async () => {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
};

const text = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');
const buttons = () => [...document.body.querySelectorAll('button')];
const targetRows = () => [...document.body.querySelectorAll('[data-testid="detail-target"]')];
const rowFor = (key: string) =>
  targetRows().find(r => r.getAttribute('data-target') === key)!;

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  await settle();
};

const press = async (label: string) => {
  const b = buttons().find(x => (x.textContent ?? '').trim() === label);
  if (!b) throw new Error(`no button "${label}"`);
  await click(b);
};

const applyOffer = () =>
  document.body.querySelector('[data-testid="apply-to-every-key"]');

async function renderChords() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ChordShapeDrills scope="all" onScopeChange={() => {}} />);
  });
  await settle();
}

async function renderScales() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<ScaleDrills />); });
  await settle();
}

const chordCells = () =>
  [...document.body.querySelectorAll('[data-testid="chord-shape-cell"]')];

/**
 * The grid cell for one quality × key, BY POSITION.
 *
 * KEY-MAJOR, QUALITY-MINOR — the default layout is keys down the left,
 * so a row is a key and a column is a quality. Matching on the title
 * would match on a spelled key ("B♭" for `Bb`), which is a display
 * concern and not the identity.
 */
const chordCellFor = (quality: string, keyName: string) => {
  const qi = CHORD_QUALITIES.findIndex(q => q.id === quality);
  const ki = (KEYS_CIRCLE_OF_FOURTHS as readonly string[]).indexOf(keyName);
  return chordCells()[ki * CHORD_QUALITIES.length + qi];
};

// ---------------------------------------------------------------------
// The axis, decided once and shared
// ---------------------------------------------------------------------

describe('the key is the axis and the row is the limit', () => {
  it('a chord target reaches its own quality and state in twelve keys', () => {
    const t = chordCellTargets(Q, K)[0]; // Root position · Left
    const siblings = targetsAcrossKeys(targetKey(t.itemRef, t.hand));
    expect(siblings).toHaveLength(12);
    // Same quality, same inversion state, same hand — every key once.
    for (const s of siblings) {
      expect(s).toContain(`chord-shape:${Q}:`);
      expect(s.endsWith(` ${t.hand}`)).toBe(true);
      expect(s).toContain(':root ');
    }
    expect(new Set(siblings).size).toBe(12);
    expect(siblings).toContain(targetKey(t.itemRef, t.hand));
  });

  it('and NOT other qualities, other states or other hands', () => {
    const t = chordCellTargets(Q, K)[0];
    const siblings = new Set(targetsAcrossKeys(targetKey(t.itemRef, t.hand)));
    const other = CHORD_QUALITIES.find(q => q.id !== Q)!.id;
    expect(siblings.has(targetKey(`chord-shape:${other}:${K}:root`, 'left'))).toBe(false);
    expect(siblings.has(targetKey(`chord-shape:${Q}:${K}:inv1`, 'left'))).toBe(false);
    expect(siblings.has(targetKey(`chord-shape:${Q}:${K}:root`, 'right'))).toBe(false);
  });

  it('a scale target reaches its own kind and starting point', () => {
    const pent = SCALE_CELLS.find(c => c.kind === 'major-pentatonic')!;
    const siblings = targetsAcrossKeys(targetKey(pent.itemRef, 'left'));
    expect(siblings).toHaveLength(12);
    for (const s of siblings) expect(s).toContain(`:${pent.startingPoint}:`);
    // Not the other starting points of the same kind.
    const otherSp = SCALE_CELLS.find(
      c => c.kind === 'major-pentatonic' && c.startingPoint !== pent.startingPoint,
    )!;
    expect(siblings).not.toContain(targetKey(otherSp.itemRef, 'left'));
  });

  it('and a voice-leading target reaches only itself', () => {
    // One target per cell, no Edit what counts — nothing can ask, and
    // "just this one" is the honest answer rather than an error.
    expect(targetsAcrossKeys(targetKey('vl:major-251:guide-tones:A:C', 'both')))
      .toEqual([targetKey('vl:major-251:guide-tones:A:C', 'both')]);
  });
});

// ---------------------------------------------------------------------
// The chord grid
// ---------------------------------------------------------------------

describe('taking a target out in every key', () => {
  it('removes it from the score in all twelve, and nowhere else', async () => {
    const all = chordCellTargets(Q, K);
    const other = CHORD_QUALITIES.find(q => q.id !== Q)!.id;
    // Every target of every key at Mastered, in TWO qualities, so a
    // cell's count is 12/12 until something comes out — and the second
    // quality is there to show the change stops at the row.
    await db.spacingState.bulkAdd(
      [Q, other].flatMap(q => KEYS_CIRCLE_OF_FOURTHS.flatMap(
        k => chordCellTargets(q, k).map(t => tested(t.itemRef, t.hand, 4)),
      )),
    );
    await renderChords();
    expect(chordCellFor(Q, K).textContent).toContain('12/12');
    expect(chordCellFor(other, K).textContent).toContain('12/12');

    await click(chordCellFor(Q, K));
    await press('Edit what counts');
    await click(rowFor(targetKey(all[0].itemRef, all[0].hand)));
    await click(applyOffer()!);

    // THE COUNT FOLLOWS IN EVERY AFFECTED CELL.
    for (const k of KEYS_CIRCLE_OF_FOURTHS) {
      expect(chordCellFor(Q, k).textContent, k).toContain('11/11');
    }
    // And nowhere else: the other quality's whole row is untouched.
    for (const k of KEYS_CIRCLE_OF_FOURTHS) {
      expect(chordCellFor(other, k).textContent, k).toContain('12/12');
    }
  });

  it('THE ROLL-UP FOLLOWS TOO', async () => {
    const all = chordCellTargets(Q, K);
    // One target Mastered in every key, the other eleven untouched.
    await db.spacingState.bulkAdd(
      KEYS_CIRCLE_OF_FOURTHS.map(k => {
        const t = chordCellTargets(Q, k)[0];
        return tested(t.itemRef, t.hand, 4);
      }),
    );
    await renderChords();
    for (const k of KEYS_CIRCLE_OF_FOURTHS) {
      expect(chordCellFor(Q, k).textContent, k).toContain('Mastered');
    }

    await click(chordCellFor(Q, K));
    await press('Edit what counts');
    await click(rowFor(targetKey(all[0].itemRef, all[0].hand)));
    await click(applyOffer()!);

    // The only banded target is out everywhere, so every cell in the
    // row drops to Not Started.
    for (const k of KEYS_CIRCLE_OF_FOURTHS) {
      expect(chordCellFor(Q, k).textContent, k).toContain('Not Started');
    }
  });

  it('and PUTTING IT BACK restores all twelve', async () => {
    const all = chordCellTargets(Q, K);
    await db.spacingState.bulkAdd(
      KEYS_CIRCLE_OF_FOURTHS.flatMap(
        k => chordCellTargets(Q, k).map(t => tested(t.itemRef, t.hand, 4)),
      ),
    );
    await renderChords();
    await click(chordCellFor(Q, K));
    await press('Edit what counts');
    const key = targetKey(all[0].itemRef, all[0].hand);

    await click(rowFor(key));
    await click(applyOffer()!);
    expect(chordCellFor(Q, KEYS_CIRCLE_OF_FOURTHS[5]).textContent).toContain('11/11');

    // THE GESTURE IS REVERSIBLE THE SAME WAY IT WAS MADE.
    await click(rowFor(key));
    await click(applyOffer()!);
    for (const k of KEYS_CIRCLE_OF_FOURTHS) {
      expect(chordCellFor(Q, k).textContent, k).toContain('12/12');
    }
  });

  it('A SINGLE-CELL CHANGE STILL BEHAVES AS BEFORE', async () => {
    const all = chordCellTargets(Q, K);
    await db.spacingState.bulkAdd(
      KEYS_CIRCLE_OF_FOURTHS.flatMap(
        k => chordCellTargets(Q, k).map(t => tested(t.itemRef, t.hand, 4)),
      ),
    );
    await renderChords();
    await click(chordCellFor(Q, K));
    await press('Edit what counts');
    // Toggle, and DO NOT take the offer.
    await click(rowFor(targetKey(all[0].itemRef, all[0].hand)));

    expect(chordCellFor(Q, K).textContent).toContain('11/11');
    for (const k of KEYS_CIRCLE_OF_FOURTHS.slice(1)) {
      expect(chordCellFor(Q, k).textContent, k).toContain('12/12');
    }
  });

  it('and afterwards it is per cell again — one key can be put back', async () => {
    // The bulk action's whole advantage over a rule.
    const all = chordCellTargets(Q, K);
    await db.spacingState.bulkAdd(
      KEYS_CIRCLE_OF_FOURTHS.flatMap(
        k => chordCellTargets(Q, k).map(t => tested(t.itemRef, t.hand, 4)),
      ),
    );
    await renderChords();
    await click(chordCellFor(Q, K));
    await press('Edit what counts');
    await click(rowFor(targetKey(all[0].itemRef, all[0].hand)));
    await click(applyOffer()!);

    // Put THIS key's target back on its own, leaving the other eleven.
    await click(rowFor(targetKey(all[0].itemRef, all[0].hand)));
    expect(chordCellFor(Q, K).textContent).toContain('12/12');
    expect(chordCellFor(Q, KEYS_CIRCLE_OF_FOURTHS[1]).textContent).toContain('11/11');
  });

  it('NOTHING IS DELETED — every row is still on screen and drillable', async () => {
    const all = chordCellTargets(Q, K);
    await renderChords();
    await click(chordCellFor(Q, K));
    await press('Edit what counts');
    await click(rowFor(targetKey(all[0].itemRef, all[0].hand)));
    await click(applyOffer()!);

    expect(targetRows()).toHaveLength(12);
    const row = rowFor(targetKey(all[0].itemRef, all[0].hand));
    expect(row.getAttribute('data-counted')).toBe('false');
    expect(row.textContent).toContain('not counted');
    // And the catalog is untouched.
    expect(chordCellTargets(Q, K)).toHaveLength(12);
    expect(chordCellTargets(Q, KEYS_CIRCLE_OF_FOURTHS[4])).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------
// The offer itself
// ---------------------------------------------------------------------

describe('the offer follows a change rather than preceding it', () => {
  it('there is none until a target is toggled', async () => {
    await renderChords();
    await click(chordCellFor(Q, K));
    expect(applyOffer()).toBeNull();
    await press('Edit what counts');
    expect(applyOffer()).toBeNull();
  });

  it('and it goes once taken', async () => {
    const all = chordCellTargets(Q, K);
    await renderChords();
    await click(chordCellFor(Q, K));
    await press('Edit what counts');
    await click(rowFor(targetKey(all[0].itemRef, all[0].hand)));
    expect(applyOffer()).not.toBeNull();
    await click(applyOffer()!);
    expect(applyOffer()).toBeNull();
  });

  it('leaving edit mode clears it', async () => {
    const all = chordCellTargets(Q, K);
    await renderChords();
    await click(chordCellFor(Q, K));
    await press('Edit what counts');
    await click(rowFor(targetKey(all[0].itemRef, all[0].hand)));
    await press('Done');
    expect(applyOffer()).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------

describe('the scales grid offers it too', () => {
  it('a hand out of every key of its row', async () => {
    await renderScales();
    const cells = buttons().filter(b => b.hasAttribute('aria-pressed')
      && /Not Started/.test(b.textContent ?? ''));
    await click(cells[0]);
    await press('Edit what counts');

    const first = SCALE_CELLS.find(c => c.kind === 'major')!;
    const key = targetKey(first.itemRef, 'left');
    await click(rowFor(key));
    await click(applyOffer()!);

    // The whole major row is one hand lighter: 96 cells × 3 hands is
    // 288 drills, less the twelve left hands of the major row.
    expect(text()).toContain('of 276 Fluent+');
  });
});

// ---------------------------------------------------------------------
// Voice leading
// ---------------------------------------------------------------------

describe('voice leading is untouched', () => {
  it('it has no Edit what counts, so there is nothing to offer', async () => {
    // Asserted at the source rather than by rendering: the page has no
    // `onToggleCounted`, so the control never appears — see the
    // voice-leading page's own test.
    expect(targetsAcrossKeys(targetKey('vl:five-one:pos1:C', 'both')))
      .toHaveLength(1);
  });
});
