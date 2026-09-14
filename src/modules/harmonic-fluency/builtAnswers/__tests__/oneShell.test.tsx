// @vitest-environment jsdom
/**
 * One picker, one board, one player — and the whole list of what may
 * differ between families.
 *
 * =====================================================================
 * THE BRIEF'S CENTRAL CLAIM, ASSERTED RATHER THAN ANNOUNCED.
 *
 * "A single component, used by every family above… Per-family allowed
 * differences (this is the whole list; anything else is a bug)." A
 * second picker is the easiest thing in the world to grow: a family
 * needs one row the others do not, someone copies the file, and six
 * months later two boards disagree about what tapping a letter does.
 *
 * So this mounts every family's real surface and asserts which rows
 * each one shows — from the deck's own cards, not from fixtures — and
 * that all of them go through the same three components.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
// THE PANEL READS THE GLOBAL INSTRUMENT, so a surface that shows it
// has to be mounted inside the provider the app mounts it inside.
import { InstrumentProvider } from '../../../../lib/instrumentContext';
import { act } from 'react';
// The surfaces as TEXT. `?raw` rather than `readFileSync` because this
// file is type-checked by the app's own tsconfig, which has no node
// types — the same reason `approvedCopy.test.ts` reads its document
// this way — and because a bundler import fails loudly if a surface is
// ever moved.
import progressionSrc from '../ProgressionAnswer.tsx?raw';
import slashSrc from '../SlashAnswer.tsx?raw';
import scaleSrc from '../ScaleAnswer.tsx?raw';
import rootSrc from '../RootAnswer.tsx?raw';
import signatureSrc from '../SignatureAnswer.tsx?raw';

vi.mock('../../../../lib/audio', () => ({
  playSeqChords: () => Promise.resolve({ stop: () => {} }),
}));
vi.mock('../../../../lib/musicalPlayback', () => ({
  playBlocked: () => Promise.resolve({ stop: () => {} }),
}));
vi.mock('../../../../lib/userPrefs', () => ({
  getPref: (_k: string, d: unknown) => Promise.resolve(d),
  setPref: () => Promise.resolve(),
}));

const { FLASHCARDS } = await import('../../catalog');
const BuiltAnswer = (await import('../BuiltAnswer')).default;
const { builtTargetFor } = await import('../cardTargets');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/** One live card per family, by the shape of its built answer. */
const CARDS = {
  progression: 'pr-prog-2-5-1-Bb',
  slash: 'sc-slash-5-7-C',
  scaleNotes: 'pent-notes-major-Eb',
  scaleLick: 'pent-lick-Ab',
  relative: 'ks-relminor-Ab',
  signature: 'ks-count-G',
} as const;

let host: HTMLDivElement;
let root: Root;

function mount(id: string, answered = false) {
  const card = FLASHCARDS.find(c => c.id === id)!;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <InstrumentProvider>
        <BuiltAnswer card={card} answered={answered} answer={() => {}} />,
      </InstrumentProvider>,
    );
  });
}

const has = (id: string) => host.querySelector(`[data-testid="${id}"]`) !== null;

beforeEach(() => { /* fresh host per mount */ });
afterEach(() => { act(() => { root.unmount(); }); host.remove(); });

describe('every family that builds an answer goes through one board', () => {
  it('draws the same board, F1 to C6, on all of them', () => {
    for (const id of Object.values(CARDS)) {
      // The count card is the one with no board before Submit, and it
      // draws the same one after.
      mount(id, id === CARDS.signature);
      const board = host.querySelector('[data-testid="built-answer-keyboard"]')!;
      expect(board, id).not.toBeNull();
      // F1 to C6 (Silas's spec of 12 Sep 2026, §2): 29 to 84 and not a
      // key past either end.
      expect(board.querySelectorAll('rect[data-midi="28"]'), id).toHaveLength(0);
      expect(board.querySelectorAll('rect[data-midi="29"]'), id).toHaveLength(1);
      expect(board.querySelectorAll('rect[data-midi="84"]'), id).toHaveLength(1);
      expect(board.querySelectorAll('rect[data-midi="85"]'), id).toHaveLength(0);
      // AND EVERY C SAYS WHICH C IT IS, so middle C is findable.
      expect([...board.querySelectorAll('text[data-testid^="key-label-"]')]
        .map(t => t.textContent), id)
        .toEqual(['C2', 'C3', 'C4', 'C5', 'C6']);
      act(() => { root.unmount(); });
      host.remove();
      mount(id, id === CARDS.signature);
    }
  });
});

describe('the rows each family shows — the whole allowed list', () => {
  const expected: Record<keyof typeof CARDS, {
    letters: boolean; bass: boolean; quality: boolean;
    layout: boolean; inversion: boolean;
  }> = {
    // Quality, layout and inversion; one picker per chord.
    progression: { letters: true, bass: false, quality: true, layout: true, inversion: true },
    // Two letter rows, quality, hand shape — and no layout row.
    slash: { letters: true, bass: false, quality: true, layout: false, inversion: true },
    // The board IS the answer.
    scaleNotes: { letters: false, bass: false, quality: false, layout: false, inversion: false },
    scaleLick: { letters: false, bass: false, quality: false, layout: false, inversion: false },
    // One tap.
    relative: { letters: true, bass: false, quality: false, layout: false, inversion: false },
    // No picker at all.
    signature: { letters: false, bass: false, quality: false, layout: false, inversion: false },
  };

  for (const [family, id] of Object.entries(CARDS)) {
    it(`${family} shows exactly the rows it is allowed`, () => {
      mount(id);
      const want = expected[family as keyof typeof CARDS];
      expect(has('letter-row'), 'letter row').toBe(want.letters);
      expect(has('bass-row'), 'bass row').toBe(want.bass);
      expect(has('quality-row'), 'quality row').toBe(want.quality);
      expect(has('layout-row'), 'layout row').toBe(want.layout);
      expect(has('inversion-row'), 'inversion row').toBe(want.inversion);
    });
  }

  it('grows the slash card\'s second letter row only once there is a chord', () => {
    // The one row that appears mid-answer, and the only reason it is
    // not in the table above.
    mount(CARDS.slash);
    expect(has('bass-row')).toBe(false);
    act(() => {
      host.querySelector('[data-testid="letter-G"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(has('bass-row')).toBe(true);
  });
});

describe('the player is one component, on every family that has one', () => {
  it('appears on the reveal and nowhere else', () => {
    for (const id of Object.values(CARDS)) {
      mount(id);
      expect(has('shared-player'), `${id} before`).toBe(false);
      act(() => { root.unmount(); });
      host.remove();
      mount(id, true);
      expect(has('shared-player'), `${id} after`).toBe(true);
      // Tempo and hand are the panel's own and are on all of them.
      expect(has('tempo'), id).toBe(true);
      expect(has('hand-up'), id).toBe(true);
    }
  });

  it('shows the thickness ladder on the chord cards and nowhere else', () => {
    // The brief's own per-family line: chord cards only.
    //
    // "BASS ONLY" IS NOT A RUNG ANY MORE — it moved to the Listen to
    // row on 10 Sep, because how thick a chord is and whether you are
    // listening to the bass are two questions. So the ladder is checked
    // on its lowest real rung.
    for (const [family, id] of Object.entries(CARDS)) {
      mount(id, true);
      expect(has('thickness-triads'), family).toBe(family === 'progression');
      act(() => { root.unmount(); });
      host.remove();
      mount(id, true);
    }
  });

  it('shows starting points on the pentatonic cards and nowhere else', () => {
    // A seven-note scale from another note is a mode, and the Modes
    // family already plays those.
    for (const [family, id] of Object.entries(CARDS)) {
      mount(id, true);
      expect(has('start-row'), family)
        .toBe(family === 'scaleNotes' || family === 'scaleLick');
      act(() => { root.unmount(); });
      host.remove();
      mount(id, true);
    }
  });
});

describe('there is one picker in the tree, and one player', () => {
  it('has no second copy of either component', () => {
    // A SECOND FILE IS THE FAILURE THIS GUARDS. Grep is the right tool:
    // the claim is about the repository, not about one render.
    const files = [
      progressionSrc, slashSrc, scaleSrc, rootSrc, signatureSrc,
    ];
    for (const src of files) {
      // Every surface draws the board through one of the two shared
      // components and never rolls its own.
      expect(/ChordPicker|BuiltAnswerKeyboard/.test(src)).toBe(true);
      expect(/<svg/.test(src)).toBe(false);
    }
    // And every player is the shared panel.
    const withPlayer = files.filter(s => /SharedPlayer/.test(s));
    expect(withPlayer).toHaveLength(5);
  });

  it('lets no card outside the six reach a built surface', () => {
    const built = FLASHCARDS.filter(c => builtTargetFor(c) !== null);
    const categories = new Set(built.map(c => c.category));
    expect([...categories].sort()).toEqual([
      // `modes` is Scales & Modes' pentatonic cards, and only those.
      'chord-construction', 'key-signatures', 'modes', 'progressions', 'slash-chords',
    ]);
    expect(FLASHCARDS).toHaveLength(1680);
  });
});
