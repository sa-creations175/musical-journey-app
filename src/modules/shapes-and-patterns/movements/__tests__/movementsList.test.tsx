// @vitest-environment jsdom
/**
 * The list, and the one gesture that makes a movement.
 *
 * =====================================================================
 * THIS PAGE IS NOT IN THE PROTOTYPE. What is asserted here is therefore
 * mostly that it stayed plain: a list, and the app's existing
 * section-setup gesture — the same six time-signature presets a song
 * section offers — rather than a creation screen nobody has walked.
 *
 * And that it does not count anything. Ruling 1 keeps a movement out of
 * everywhere songs are counted; the module home reaches it as a LINK
 * rather than as a card, because a card carries a fraction of a target
 * and a movement has no target.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MovementsList from '../MovementsList';
import { db } from '../../../../lib/db';
import { newMovement } from '../movementStore';
import { SECTION_TIME_SIGNATURE_PRESETS } from '../../../repertoire/barGrid';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(async () => { await db.chordMovements.clear(); });
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

async function open() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={['/shapes-and-patterns/movements']}>
        <Routes>
          <Route path="/shapes-and-patterns/movements" element={<MovementsList />} />
          {/* Stands in for the movement screen, so what is asserted
              is that the press NAVIGATED — not what that screen draws,
              which has its own tests. */}
          <Route
            path="/shapes-and-patterns/movements/:id"
            element={<span data-testid="landed" />}
          />
        </Routes>
      </MemoryRouter>,
    );
  });
  await settle();
}

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });
const byTestId = (id: string) => container!.querySelector(`[data-testid="${id}"]`);

describe('the list', () => {
  it('says so plainly when there is nothing captured', async () => {
    await open();
    expect(byTestId('movements-empty')).not.toBeNull();
    expect(byTestId('movements-list')).toBeNull();
  });

  it('shows an unnamed movement as unnamed rather than naming it', async () => {
    // Ruling 4: the app never fills the name in, and a list is exactly
    // where it would be tempting to.
    const m = { ...newMovement('6/8'), id: 'm1' };
    await db.chordMovements.add(m);
    await open();
    expect(byTestId('movement-row-m1')!.textContent).toContain('Unnamed movement');
    expect(byTestId('movement-row-m1')!.textContent).toContain('6/8');
    expect(byTestId('movement-row-m1')!.textContent).toContain('no key');
  });

  it('puts the most recently touched first', async () => {
    await db.chordMovements.bulkAdd([
      { ...newMovement('4/4'), id: 'old', name: 'older', updatedAt: 1 },
      { ...newMovement('6/8'), id: 'new', name: 'newer', updatedAt: 2 },
    ]);
    await open();
    const rows = [...container!.querySelectorAll('[data-testid^="movement-row-"]')];
    expect(rows.map(r => r.getAttribute('data-testid')))
      .toEqual(['movement-row-new', 'movement-row-old']);
  });
});

describe('making one', () => {
  it('asks only for a time signature, from the presets a section uses', async () => {
    // Ruling 6, and the reason there is one list: `barGrid.ts` owns it
    // now, and both the section picker and this read it.
    await open();
    for (const preset of SECTION_TIME_SIGNATURE_PRESETS) {
      expect(byTestId(`new-movement-${preset}`), preset).not.toBeNull();
    }
    // And nothing else is asked. No name field, no key, no description.
    expect(container!.querySelectorAll('input')).toHaveLength(0);
  });

  it('creates it with the signature pressed and nothing filled in', async () => {
    await open();
    await act(async () => { (byTestId('new-movement-6/8') as HTMLElement).click(); });
    await settle();
    const made = (await db.chordMovements.toArray())[0];
    expect(made.timeSignature).toBe('6/8');
    expect(made.name).toBe('');
    expect(made.key).toBeUndefined();
    expect(made.placements).toEqual([]);
  });

  it('opens the movement it just made', async () => {
    await open();
    await act(async () => { (byTestId('new-movement-4/4') as HTMLElement).click(); });
    await settle();
    const made = (await db.chordMovements.toArray())[0];
    // The list is gone and the movement screen's route is what rendered.
    expect(byTestId('movements-empty')).toBeNull();
    expect(byTestId('landed')).not.toBeNull();
    expect(made.timeSignature).toBe('4/4');
  });
});
