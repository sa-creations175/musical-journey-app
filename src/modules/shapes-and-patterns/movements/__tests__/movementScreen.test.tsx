// @vitest-environment jsdom
/**
 * The movement screen, walked in the prototype's own order.
 *
 * =====================================================================
 * THE PROTOTYPE IS THE SPEC AND ITS NUMBERED STEPS ARE THE TESTS. Its
 * "walk it in this order" list is what Silas signed off, so the
 * assertions follow it: the first chord opens selected, Play becomes
 * Stop, the key moves the sound and the spelling does not, Loop runs
 * on, the bass toggle and the BPM stay with the movement, a chord with
 * nothing pressed says so, and playing with no key explains itself
 * rather than guessing.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MovementScreen from '../MovementScreen';
import { db, type ChordPlacement } from '../../../../lib/db';
import { newMovement } from '../movementStore';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no matchMedia, and the lead sheet's grid reads it to pick
// one or two bars per row. Reports "not mobile" so the layout is
// deterministic — the same stub `BarGridView.test.tsx` uses.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

const L = (offset: number) => ({ offset, hand: 'L' as const });
const R = (offset: number) => ({ offset, hand: 'R' as const });

function at(
  id: string, barIndex: number, beatPos: number, beats: number,
  chord: ChordPlacement['chord'], voicing?: ChordPlacement['voicing'],
): ChordPlacement {
  return { id, arrangementId: 'movement', barIndex, beatPos, beats, chord, voicing };
}

/** The prototype's walk-up. */
const WALK_UP: ChordPlacement[] = [
  at('c1', 0, 0, 3, { function: '1', quality: '' }, [L(-12), R(7), R(12), R(16)]),
  at('c2', 0, 3, 3, { function: '1', quality: '' }, [L(-12), R(7), R(12), R(16)]),
  at('e7', 1, 0, 1, { function: '3', quality: '7' }, [L(-12), R(7), R(10), R(16)]),
  at('dfs', 1, 1, 1, { function: '2', quality: '', bass: '#4' }),
  at('gsdim', 1, 2, 1, { function: 'b6', quality: 'dim' }, [L(-12), R(6), R(9), R(15)]),
  at('am1', 1, 3, 3, { function: '6', quality: 'm' }, [L(-12), R(7), R(12), R(15)]),
  at('am2', 2, 0, 3, { function: '6', quality: 'm' }, [L(-12), R(7), R(12), R(15)]),
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const MOVEMENT_ID = 'mv-1';

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

async function open(over: Partial<ReturnType<typeof newMovement>> = {}) {
  await db.chordMovements.add({
    ...newMovement('6/8'), id: MOVEMENT_ID, key: 'C', placements: WALK_UP, ...over,
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[`/shapes-and-patterns/movements/${MOVEMENT_ID}`]}>
        <Routes>
          <Route path="/shapes-and-patterns/movements/:movementId" element={<MovementScreen />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await settle();
}

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });
const byTestId = (id: string) => container!.querySelector(`[data-testid="${id}"]`);
/** A chord box in the lead sheet's grid, found by the placement it
 *  draws. The cells are the grid's own now — see ruling 18. */
const chordCell = (placementId: string) =>
  container!.querySelector(`[data-placement-id="${placementId}"]`);
/** The scale-degree line the cell leads with (ruling 14). */
const degreeLine = (placementId: string) =>
  chordCell(placementId)!.querySelector('[data-testid="chord-cell-lead"]')!.textContent;
const click = async (el: Element | null) => {
  expect(el).not.toBeNull();
  await act(async () => { (el as HTMLElement).click(); });
  await settle();
};
const stored = () => db.chordMovements.get(MOVEMENT_ID);

/**
 * Type into a controlled input the way React hears it.
 *
 * Assigning `.value` and firing `change` does nothing: React listens on
 * `input` and tracks the last value it set, so the native setter has to
 * be used or the event is discarded as a no-op.
 */
async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value',
  )!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

describe('step 1 — the name, the description, and the first chord', () => {
  it('shows what Silas typed and never fills either in', async () => {
    await open({ name: '', description: '' });
    expect((byTestId('movement-name') as HTMLInputElement).value).toBe('');
    expect((byTestId('movement-description') as HTMLTextAreaElement).value).toBe('');
    expect((byTestId('movement-name') as HTMLInputElement).placeholder)
      .toBe('Name this movement');
  });

  it('opens with the first chord already selected', async () => {
    // Ruling 16, and the panel is there on the first frame rather than
    // arriving after one.
    await open();
    expect(byTestId('movement-editor')).not.toBeNull();
    // The editor is showing the first chord's own voicing.
    expect(byTestId('length-value')!.textContent).toBe('3');
  });

  it('reads the number first and the chord name under it', async () => {
    // Ruling 14. The walk-up reads 1, 1, 3⁷, 2/♭5, ♭6°, 6m, 6m.
    await open();
    const degrees = ['c1', 'c2', 'e7', 'dfs', 'gsdim', 'am1', 'am2'].map(degreeLine);
    expect(degrees).toEqual(['1', '1', '37', '2/♭5', '♭6°', '6m', '6m']);
  });
});

describe('step 2 — play and stop', () => {
  it('becomes Stop while it runs and Play again when stopped', async () => {
    await open();
    expect(byTestId('movement-play')!.textContent).toBe('Play');
    await click(byTestId('movement-play'));
    expect(byTestId('movement-play')!.textContent).toBe('Stop');
    await click(byTestId('movement-play'));
    expect(byTestId('movement-play')!.textContent).toBe('Play');
  });
});

describe('step 3 — the key moves the sound, the spelling does not', () => {
  it('stores the key it is played in', async () => {
    await open();
    const select = byTestId('movement-key') as HTMLSelectElement;
    await act(async () => {
      select.value = 'Db';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect((await stored())!.key).toBe('Db');
  });

  it('re-spells the numbers as well as the names', async () => {
    // The half of ruling 14 a screen would get wrong: ♭6 and ♯5 are one
    // chord, and showing the name in sharps beside a number in flats is
    // showing it two ways at once.
    await open();
    expect(degreeLine('gsdim')).toBe('♭6°');
    await click(byTestId('spelling-sharp'));
    expect(degreeLine('gsdim')).toBe('♯5°');
  });

  it('the spelling control is the global setting, not a movement’s own', async () => {
    await open();
    await click(byTestId('spelling-sharp'));
    expect(await db.userPrefs.get('enharmonicSpelling')).toMatchObject({ value: 'sharp' });
    expect(Object.keys((await stored())!)).not.toContain('spelling');
  });
});

describe('steps 4 and 5 — loop, and the bass balance', () => {
  it('says Loop off until it is turned on', async () => {
    await open();
    expect(byTestId('movement-loop')!.textContent).toBe('Loop off');
    await click(byTestId('movement-loop'));
    expect(byTestId('movement-loop')!.textContent).toBe('Loop on');
  });

  it('remembers the bass balance and the BPM on the movement', async () => {
    // Ruling 8 and 12 — both are the movement's own, not a global.
    await open();
    await click(byTestId('bass-even'));
    expect((await stored())!.bassBalance).toBe('even');

    await type(byTestId('bpm-number') as HTMLInputElement, '96');
    expect((await stored())!.playbackBpm).toBe(96);
  });
});

describe('step 7 — the chord with nothing pressed', () => {
  it('is marked on the grid and says so in the editor', async () => {
    // Ruling 11. It is about to be PLAYED as a guess, so it discloses.
    await open();
    expect(chordCell('dfs')!.getAttribute('data-derived')).toBe('true');
    expect(chordCell('e7')!.getAttribute('data-derived')).toBe('false');
    expect(chordCell('dfs')!.textContent).toContain('filled in');

    await click(chordCell('dfs'));
    expect(byTestId('voicing-derived-note')!.textContent)
      .toBe('Filled in from the chord symbol');
  });

  it('and a press makes it his, immediately', async () => {
    await open();
    await click(chordCell('dfs'));
    // The panel commits on press; there is no Save to forget.
    expect([...container!.querySelectorAll('button')]
      .some(b => b.textContent === 'Save')).toBe(false);
  });
});

describe('step 8 — playing with no key', () => {
  it('explains why rather than guessing a key', async () => {
    // Ruling 10.
    await open({ key: undefined });
    expect(byTestId('movement-no-key')).toBeNull();
    await click(byTestId('movement-play'));
    expect(byTestId('movement-no-key')!.textContent)
      .toContain('Set a key first');
    // And it did not start.
    expect(byTestId('movement-play')!.textContent).toBe('Play');
  });
});

describe('step 9 — copy and paste a voicing', () => {
  it('offers both, with paste inert until something is copied', async () => {
    await open();
    expect(byTestId('voicing-copy')).not.toBeNull();
    expect(byTestId('voicing-paste')).toHaveProperty('disabled', true);
    await click(byTestId('voicing-copy'));
    expect(byTestId('voicing-paste')).toHaveProperty('disabled', false);
  });

  it('rebuilds the voicing on the target chord’s own quality', async () => {
    // Ruling 13: a C shape pasted onto the A minor comes out minor.
    await open();
    await click(byTestId('voicing-copy'));
    await click(chordCell('am1'));
    await click(byTestId('voicing-paste'));
    const am = (await stored())!.placements.find(p => p.id === 'am1')!;
    // The C voicing's major third became a minor third.
    expect(am.voicing).toEqual([
      { offset: -12, hand: 'L' }, { offset: 7, hand: 'R' },
      { offset: 12, hand: 'R' }, { offset: 15, hand: 'R' },
    ]);
  });
});
