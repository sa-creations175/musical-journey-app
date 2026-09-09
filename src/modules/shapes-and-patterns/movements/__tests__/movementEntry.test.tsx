// @vitest-environment jsdom
/**
 * The walk-up, entered from nothing.
 *
 * =====================================================================
 * THIS IS THE ACCEPTANCE TEST FOR RULING 18, and it is the sequence the
 * entry prototype walks, in its order:
 *
 *   one empty bar · tap slot 1 · type `1` · Enter · it lands one long
 *   and opens in the editor · Length to 3 · tap slot 4 · `1` · Enter ·
 *   Paste voicing · + bar · 3dom7 · 2/#4 · #5dim · 6m · + bar · 6m
 *
 * Every gesture in it belongs to the lead sheet's own grid. Nothing on
 * the movement side parses a chord, positions a box, clamps a duration
 * or adds a bar — so what this really asserts is that hosting the grid
 * brought all of it across, which is the whole claim of the build.
 *
 * The wrong turns are here too, and they are the more useful half: a
 * length that cannot exceed the room a bar has, a chord deleted, an
 * empty bar deleted, and what happens with no key set.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MovementScreen from '../MovementScreen';
import { db } from '../../../../lib/db';
import { newMovement } from '../movementStore';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const ID = 'mv-entry';

beforeEach(async () => {
  await db.chordMovements.clear();
  await db.userPrefs.clear();
  vi.stubGlobal('AudioContext', function AC() {
    const p = () => ({
      setValueAtTime() {}, linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {}, setTargetAtTime() {}, value: 0,
    });
    const n = () => ({
      connect(x: unknown) { return x; }, gain: p(), frequency: p(),
      type: 'sine', start() {}, stop() {},
    });
    return {
      currentTime: 0, state: 'running', destination: {},
      resume: () => Promise.resolve(),
      createBuffer: () => ({}),
      createBufferSource: () => ({ buffer: null, connect() {}, start() {} }),
      createGain: n, createOscillator: n,
    };
  });
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  vi.unstubAllGlobals();
});

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });

/**
 * `null` means no key — NOT `undefined`, which JavaScript reads as
 * "argument omitted" and replaces with the default. Passing `undefined`
 * here silently opened a movement in C and the no-key case tested
 * nothing at all.
 */
async function open(key: string | null = 'C') {
  await db.chordMovements.add({
    ...newMovement('6/8'), id: ID, ...(key === null ? {} : { key }),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[`/shapes-and-patterns/movements/${ID}`]}>
        <Routes>
          <Route path="/shapes-and-patterns/movements/:movementId" element={<MovementScreen />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await settle();
}

const byTestId = (id: string) => container!.querySelector(`[data-testid="${id}"]`);
const cells = () => [...container!.querySelectorAll('[data-placement-id]')];
const emptySlots = () =>
  [...container!.querySelectorAll('[title="Tap to add chord here"]')];
const bars = () => [...container!.querySelectorAll('[aria-label^="delete bar"]')];

const click = async (el: Element | null | undefined) => {
  expect(el, 'nothing to click').toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); });
  await settle();
};

/** Type into a controlled input the way React hears it. */
async function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value',
  )!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

/**
 * The prototype's own gesture: tap an empty slot, type the chord in
 * numbers, press Enter.
 */
async function addChordAt(slotIndex: number, text: string) {
  await click(emptySlots()[slotIndex]);
  const input = container!.querySelector('input[placeholder^="e.g."]') as HTMLInputElement;
  expect(input, 'the add box opened').toBeTruthy();
  await typeInto(input, text);
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await settle();
}

const stored = () => db.chordMovements.get(ID);

describe('the walk-up, from nothing', () => {
  it('starts as one empty bar with nothing in it', async () => {
    await open();
    expect(cells()).toHaveLength(0);
    // Six positions, because a movement in 6/8 has six and no eighths
    // toggle doubling them.
    expect(emptySlots()).toHaveLength(6);
  });

  it('lands a chord one position long, selected, from typing a number', async () => {
    await open();
    await addChordAt(0, '1');

    const m = (await stored())!;
    expect(m.placements).toHaveLength(1);
    expect(m.placements[0]).toMatchObject({
      barIndex: 0, beatPos: 0, beats: 1, chord: { function: '1' },
    });
    // It opened in the editor — the Length control is reading it.
    expect(byTestId('length-value')!.textContent).toBe('1');
  });

  it('grows to three with the Length control, and no further than the bar', async () => {
    await open();
    await addChordAt(0, '1');
    await click(byTestId('length-inc'));
    await click(byTestId('length-inc'));
    expect(byTestId('length-value')!.textContent).toBe('3');
    expect((await stored())!.placements[0].beats).toBe(3);

    // THE WRONG TURN: a bar has six positions and the chord starts at
    // the first, so six is the ceiling. The clamp is the lead sheet's,
    // through `barGrid.ts` — nothing on this screen decides it.
    for (let i = 0; i < 10; i++) await click(byTestId('length-inc'));
    expect((await stored())!.placements[0].beats).toBe(6);
    expect(byTestId('length-inc')).toHaveProperty('disabled', true);
  });

  it('takes the whole walk-up, three bars, in the prototype’s order', async () => {
    await open();

    // Bar 1: two 1 chords, three positions each.
    await addChordAt(0, '1');
    await click(byTestId('length-inc'));
    await click(byTestId('length-inc'));
    // Slot 4 of the same bar — the first free position after a
    // three-long chord, which is what the grid now offers.
    await addChordAt(0, '1');
    await click(byTestId('length-inc'));
    await click(byTestId('length-inc'));

    await click(byTestId('add-bar'));
    await addChordAt(0, '3dom7');
    await addChordAt(0, '2/#4');
    // `#5dim`, EXACTLY AS THE PROTOTYPE SAYS TO TYPE IT. It used to
    // parse, store, and then have no root at all — `SEMI_BY_DEGREE`
    // knows `b6` and not `#5`. Ruling 22 folds it at entry, so what
    // lands is a `b6` and it can be voiced and played. The assertion
    // below reads `b6`, which is the whole point of the fold.
    await addChordAt(0, '#5dim');
    await addChordAt(0, '6m');
    await click(byTestId('length-inc'));
    await click(byTestId('length-inc'));

    await click(byTestId('add-bar'));
    await addChordAt(0, '6m');
    await click(byTestId('length-inc'));
    await click(byTestId('length-inc'));

    const m = (await stored())!;
    expect(m.placements).toHaveLength(7);
    // Read back in the order they sound.
    const inOrder = [...m.placements].sort(
      (a, b) => (a.barIndex - b.barIndex) || (a.beatPos - b.beatPos),
    );
    expect(inOrder.map(p => [p.barIndex, p.beatPos, p.beats])).toEqual([
      [0, 0, 3], [0, 3, 3],
      [1, 0, 1], [1, 1, 1], [1, 2, 1], [1, 3, 3],
      [2, 0, 3],
    ]);
    expect(inOrder.map(p => p.chord.function))
      .toEqual(['1', '1', '3', '2', 'b6', '6', '6']);
    // `2/#4` IS TYPED AS THE PROTOTYPE SAYS AND STORES AS `b5`
    // (ruling 31, reversing the exception ruling 22 made for it). One
    // stored degree; the spelling setting alone decides whether a
    // reader sees ♯4 or ♭5 — see `spellDegree`.
    expect(inOrder[3].chord.bass).toBe('b5');

    // And it plays: the transport turns over rather than refusing.
    await click(byTestId('movement-play'));
    expect(byTestId('movement-play')!.textContent).toBe('Stop');
  });
});

describe('the wrong turns', () => {
  it('adds a bar, and deletes an empty one', async () => {
    await open();
    expect(bars()).toHaveLength(1);
    await click(byTestId('add-bar'));
    expect(bars()).toHaveLength(2);
    expect((await stored())!.barLayout).toEqual(['empty', 'empty']);

    await click(bars()[1]);
    expect(bars()).toHaveLength(1);
    expect((await stored())!.barLayout).toEqual(['empty']);
  });

  it('deletes a chord, and the slot it was in comes back', async () => {
    await open();
    await addChordAt(0, '1');
    expect(cells()).toHaveLength(1);
    expect(emptySlots()).toHaveLength(5);

    await click(byTestId('delete-chord'));
    expect(cells()).toHaveLength(0);
    expect(emptySlots()).toHaveLength(6);
    expect((await stored())!.placements).toEqual([]);
  });

  it('with no key, the chord still lands and the screen says why it is silent', async () => {
    // A chord is a NUMBER and needs no key to be stored — the shared
    // add box parses one without a key and refusing would be a
    // restriction the lead sheet does not have. What a key IS needed
    // for is voicing it and hearing it, and that is what is explained.
    await open(null);
    await addChordAt(0, '1');
    expect((await stored())!.placements).toHaveLength(1);
    expect(byTestId('movement-no-key')!.textContent).toContain('Set a key first');
    // And the editor refuses the keyboard for the same reason.
    expect(byTestId('movement-editor')!.textContent)
      .toContain('set the song key to add a voicing');
  });
});
