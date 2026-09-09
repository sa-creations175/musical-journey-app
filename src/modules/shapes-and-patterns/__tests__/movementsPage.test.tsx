// @vitest-environment jsdom
/**
 * The page is Chord Movements & Passes now.
 *
 * =====================================================================
 * RULING 19 IS A RENAME PLUS A MERGE, and the merge is the risky half.
 * There used to be two ways in — a card called "voice-leading" and a
 * link bar to a separate movements list — and one of them has gone.
 * What is asserted here is that nothing was left behind: the words, the
 * add button at both ends, the movements themselves on the page, and
 * the way to remove one, which used to live on the list page that no
 * longer exists.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoiceLeadingDrills from '../VoiceLeadingDrills';
import { db } from '../../../lib/db';
import { newMovement } from '../movements/movementStore';
import { SECTION_TIME_SIGNATURE_PRESETS } from '../../repertoire/barGrid';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(async () => {
  await db.chordMovements.clear();
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
    root!.render(
      <MemoryRouter initialEntries={['/shapes-and-patterns/movements']}>
        <Routes>
          <Route path="/shapes-and-patterns/movements" element={<VoiceLeadingDrills />} />
          <Route
            path="/shapes-and-patterns/movements/:id"
            element={<span data-testid="a-movement" />}
          />
        </Routes>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 6; i++) await settle();
  return container!;
}

const byTestId = (id: string) => container!.querySelector(`[data-testid="${id}"]`);
const click = async (el: Element | null) => {
  expect(el, 'nothing to click').toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); });
  await settle();
};

describe('the words', () => {
  it('says nothing about voice leading anywhere on it', async () => {
    // Ruling 19 retires the phrase from what a reader sees. The
    // internal ids keep it, which is why this reads the RENDERED text
    // rather than the source.
    const el = await open();
    expect(el.textContent!.toLowerCase()).not.toContain('voice leading');
    expect(el.textContent!.toLowerCase()).not.toContain('voice-leading');
  });

  it('offers the add button at the top and at the bottom', async () => {
    // The library grows, and a control only at the end of a growing
    // list is one that gets further away every time it is used.
    const el = await open();
    const adds = [...el.querySelectorAll('button')]
      .filter(b => b.textContent === '+ Add movement');
    expect(adds).toHaveLength(2);
  });
});

describe('making one', () => {
  it('asks only for a time signature, from the presets a section uses', async () => {
    await open();
    await click([...container!.querySelectorAll('button')]
      .find(b => b.textContent === '+ Add movement')!);
    for (const preset of SECTION_TIME_SIGNATURE_PRESETS) {
      expect(byTestId(`new-movement-${preset}`), preset).not.toBeNull();
    }
  });

  it('creates it unnamed and opens its own page', async () => {
    await open();
    await click([...container!.querySelectorAll('button')]
      .find(b => b.textContent === '+ Add movement')!);
    await click(byTestId('new-movement-6/8'));

    const made = (await db.chordMovements.toArray())[0];
    expect(made.timeSignature).toBe('6/8');
    expect(made.name).toBe('');
    expect(byTestId('a-movement')).not.toBeNull();
  });
});

describe('what is on the page', () => {
  it('shows a movement, unnamed as unnamed', async () => {
    await db.chordMovements.add({ ...newMovement('6/8'), id: 'm1' });
    await open();
    expect(byTestId('movement-section-m1')).not.toBeNull();
    expect(byTestId('open-movement-m1')!.textContent).toBe('Unnamed movement');
  });

  it('opens it by its name', async () => {
    await db.chordMovements.add({ ...newMovement('6/8'), id: 'm1', name: 'Walk-up' });
    await open();
    expect(byTestId('open-movement-m1')!.textContent).toBe('Walk-up');
    await click(byTestId('open-movement-m1'));
    expect(byTestId('a-movement')).not.toBeNull();
  });

  it('still shows the patterns that shipped', async () => {
    // They ARE movements now (ruling 19). Nothing about them changed,
    // and this is the assertion that says the rename did not take them
    // with it.
    const el = await open();
    expect(el.textContent).toContain('Diatonic Cycle');
  });
});

describe('removing one', () => {
  it('asks first, where the page already removes a row', async () => {
    // The list page that used to carry this is gone. Remove sits where
    // a custom pattern's Remove sits, and confirms — a movement is
    // nothing but work pressed in by hand and there is no undo toast
    // here to be the second net.
    await db.chordMovements.add({ ...newMovement('6/8'), id: 'm1', name: 'Walk-up' });
    await open();
    await click(byTestId('remove-movement-m1'));
    expect(document.body.textContent).toContain('Remove this movement?');
    expect(document.body.textContent).toContain('Walk-up');
    expect(await db.chordMovements.count()).toBe(1);
  });

  it('backing out leaves it, confirming removes it', async () => {
    await db.chordMovements.add({ ...newMovement('6/8'), id: 'm1' });
    await open();
    await click(byTestId('remove-movement-m1'));
    await click([...document.querySelectorAll('button')]
      .find(b => b.textContent === 'Cancel')!);
    expect(await db.chordMovements.count()).toBe(1);

    await click(byTestId('remove-movement-m1'));
    await click([...document.querySelectorAll('button')]
      .find(b => b.textContent === 'Remove movement')!);
    expect(await db.chordMovements.count()).toBe(0);
    expect(byTestId('movement-section-m1')).toBeNull();
  });
});
