// @vitest-environment jsdom
/**
 * A movement is rated like everything else.
 *
 * =====================================================================
 * RULING 20 IS A CLAIM ABOUT ITEMREFS MORE THAN ABOUT SCREENS. Twelve
 * keys, the same four ratings, the same spacing engine, the same
 * Progress Details, the same place in the schedule — all of that is
 * downstream of one thing: a movement's cell is a `vl:` ref, and
 * everything below the grid treats the rest as opaque.
 *
 * So the assertions are the boring ones on purpose: the row is there,
 * it has twelve cells, tapping one fills the standing Progress Details
 * section, and the shape of the ref is the one that round-trips through
 * the drill model. Nothing about the drill flow was invented — it takes
 * an itemRef and two labels and needs no positions, no voicing and no
 * catalog entry, which is why a one-column movement fits it unchanged.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import VoiceLeadingDrills from '../VoiceLeadingDrills';
import { db } from '../../../lib/db';
import { newMovement } from '../movements/movementStore';
import {
  movementCellLabel, movementCellRefs, movementGridRows, movementIdForRef,
  movementItemRef,
} from '../movements/movementCells';
import { itemRefForSkill, parseShapesItemRef } from '../drillModel';
import { itemCellTargets, sectionTargetCount } from '../cellTargets';
import { shapesCards } from '../homeCards';
import { parseVoiceLeadingItemRef } from '../catalog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const MOVEMENT = { ...newMovement('6/8'), id: 'mv-walkup', name: 'Walk-up' };

// =====================================================================
// The ref
// =====================================================================

describe('a movement’s cell is an ordinary Shapes itemRef', () => {
  it('round-trips through the drill model unchanged', () => {
    // THE REASON IT IS THREE SEGMENTS. `parseShapesItemRef` reads a
    // `vl:` ref as {patternId, keyName} with the key last, and
    // `itemRefFor` rebuilds it — a four-segment shape would lose its
    // middle, because the descriptor has nowhere to keep it.
    const ref = movementItemRef('mv-walkup', 'Eb');
    const desc = parseShapesItemRef(ref)!;
    expect(desc.kind).toBe('voice-leading');
    if (desc.kind !== 'voice-leading') throw new Error('unreachable');
    expect(desc.patternId).toBe('mv-walkup');
    expect(desc.keyName).toBe('Eb');
    expect(itemRefForSkill({
      id: 'x', kind: 'voice-leading',
      patternId: desc.patternId, keyName: desc.keyName,
      label: '', createdAt: 0, updatedAt: 0,
    } as never)).toBe(ref);
  });

  it('has one target, on both hands together', () => {
    // Voice leading is two-handed by nature and a movement is too —
    // `handsFor` is prefix-based, so nothing had to learn about
    // movements for this to be true.
    const targets = itemCellTargets(movementItemRef('mv-walkup', 'C'));
    expect(targets).toHaveLength(1);
    expect(targets[0].hand).toBe('both');
  });

  it('is not read as a catalog sub-cell, because it has none', () => {
    // ONE COLUMN (ruling 20). No starting position, no voicing type, no
    // inversion — so `parseVoiceLeadingItemRef` correctly declines it.
    expect(parseVoiceLeadingItemRef(movementItemRef('mv-walkup', 'C'))).toBeNull();
  });

  it('is told from a pattern’s ref by membership, not by shape', () => {
    const known = new Set(['mv-walkup']);
    expect(movementIdForRef('vl:mv-walkup:C', known)).toBe('mv-walkup');
    // A legacy pattern-level ref wears the same three-segment shape.
    expect(movementIdForRef('vl:diatonic-cycle:C', known)).toBeNull();
    // And a sub-cell ref is four or five.
    expect(movementIdForRef('vl:five-one:guide-tones:posA:Eb', known)).toBeNull();
  });

  it('is one row across twelve keys', () => {
    expect(movementGridRows(MOVEMENT)).toHaveLength(1);
    expect(movementCellRefs('mv-walkup')).toHaveLength(12);
    expect(new Set(movementCellRefs('mv-walkup')).size).toBe(12);
  });

  it('names its cell the way a pattern names one', () => {
    expect(movementCellLabel(MOVEMENT, 'Eb', 'flat')).toBe('Walk-up in E♭');
    expect(movementCellLabel(MOVEMENT, 'F#', 'sharp')).toBe('Walk-up in F♯');
    expect(movementCellLabel({ ...MOVEMENT, name: '' }, 'C', 'flat'))
      .toBe('Unnamed movement in C');
  });
});

// =====================================================================
// The counts
// =====================================================================

describe('a movement counts where the patterns count', () => {
  it('adds twelve to the section’s targets', () => {
    const without = sectionTargetCount('voice-leading');
    expect(sectionTargetCount('voice-leading', undefined, ['mv-walkup']))
      .toBe(without + 12);
  });

  it('and to the card, which is the same enumeration', () => {
    const card = (ids: string[]) => shapesCards([], [], Date.now(), new Map(), undefined, ids)
      .find(c => c.key === 'voice-leading')!;
    expect(card(['mv-walkup']).itemCount).toBe(card([]).itemCount + 12);
  });

  it('a caller with no movements gets exactly the old answer', () => {
    // Every pure caller of these — the goals encoder, the coverage
    // denominators — passes nothing and is unchanged.
    expect(sectionTargetCount('voice-leading', undefined, []))
      .toBe(sectionTargetCount('voice-leading'));
  });
});

// =====================================================================
// On the page
// =====================================================================

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(async () => {
  await db.chordMovements.clear();
  await db.spacingState.clear();
  await db.userPrefs.clear();
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });

async function open() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<MemoryRouter><VoiceLeadingDrills /></MemoryRouter>);
  });
  for (let i = 0; i < 6; i++) await settle();
  return container!;
}

describe('the movement on the page', () => {
  it('draws one row of thirteen cells, like a pattern with one position', async () => {
    await db.chordMovements.add(MOVEMENT);
    const el = await open();
    const section = el.querySelector('[data-testid="movement-section-mv-walkup"]')!;
    const cells = section.querySelectorAll('[data-testid="band-cell"]');
    // The twelve keys and the Circle of 4ths cell (Silas, 13 Sep 2026).
    expect(cells).toHaveLength(13);
  });

  it('fills Progress Details when a cell is tapped', async () => {
    // The standing section every other grid on this page fills. A
    // movement's cell is not a special case of it.
    await db.chordMovements.add(MOVEMENT);
    const el = await open();
    const section = el.querySelector('[data-testid="movement-section-mv-walkup"]')!;
    const cell = section.querySelector('[data-testid="band-cell"]')!;
    await act(async () => { (cell as HTMLElement).click(); });
    await settle();
    expect(el.textContent).toContain('Walk-up in ');
  });

  it('says Not Started before anything is drilled', async () => {
    await db.chordMovements.add(MOVEMENT);
    const el = await open();
    const section = el.querySelector('[data-testid="movement-section-mv-walkup"]')!;
    expect(section.textContent!.toLowerCase()).toContain('not started');
  });
});
