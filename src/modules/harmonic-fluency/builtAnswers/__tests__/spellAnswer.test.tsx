// @vitest-environment jsdom
/**
 * Spell the chord: tap its notes, Check (Silas, 14 Sep 2026; walked on tab
 * 2 of `hf-restructure-walk.html`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { InstrumentProvider } from '../../../../lib/instrumentContext';

vi.mock('../../../../lib/audio', () => ({
  playSeqChords: () => Promise.resolve({ stop: () => {} }),
  setInstrument: () => {},
  BROKEN_STEP_BEATS: 0.75,
  CHORD_RING_BEATS: 3,
}));
vi.mock('../../../../lib/userPrefs', () => ({
  getPref: (_k: string, d: unknown) => Promise.resolve(d),
  setPref: () => Promise.resolve(),
}));

const { FLASHCARDS } = await import('../../catalog');
const { builtTargetFor } = await import('../cardTargets');
const SpellAnswer = (await import('../SpellAnswer')).default;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const card = FLASHCARDS.find(c => c.id === 'cc-spell-major-C-1')!;
const target = builtTargetFor(card)!;
if (target.kind !== 'spell') throw new Error('wrong kind');

let host: HTMLDivElement;
let root: Root;
let chosen: string[];

function draw(answered: boolean) {
  act(() => {
    root.render(
      <InstrumentProvider>
        <SpellAnswer card={card} target={target as never} answered={answered} answer={c => chosen.push(c)} />
      </InstrumentProvider>,
    );
  });
}

const byTestId = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const key = (midi: number) => host.querySelector(`rect[data-midi="${midi}"]`)!;
const tap = (el: Element | null) => {
  act(() => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

beforeEach(() => {
  chosen = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => { root.unmount(); }); host.remove(); });

describe('the card', () => {
  it('builds with the keyboard and the answer surface for Chord Construction', () => {
    expect(target).toMatchObject({ kind: 'spell', name: 'Cmaj7', pcs: [0, 4, 7, 11] });
  });
});

describe('building', () => {
  it('says what to do, then names the notes tapped', () => {
    draw(false);
    expect(byTestId('spell-picked')!.textContent).toBe("Tap the chord's notes, lowest first or in any order.");
    tap(key(64));
    tap(key(60));
    expect(byTestId('spell-picked')!.textContent).toBe('C · E');
  });

  it('marks it right in any order and any octave, with nothing extra', () => {
    draw(false);
    for (const m of [71, 55, 64, 48]) tap(key(m));
    tap(byTestId('submit'));
    expect(chosen).toEqual([card.correctAnswer]);
  });

  it('marks an extra note wrong', () => {
    draw(false);
    for (const m of [60, 64, 67, 71, 62]) tap(key(m));
    tap(byTestId('submit'));
    expect(chosen).toHaveLength(1);
    expect(chosen[0]).not.toBe(card.correctAnswer);
  });
});

describe('a wrong answer shows its own mistake', () => {
  it('greens the right notes, reds the wrong one, and lights the missed one amber', () => {
    draw(false);
    for (const m of [60, 64, 67, 70]) tap(key(m));
    tap(byTestId('submit'));
    // The tap is named the way the key of C spells its black keys.
    expect(chosen[0]).toBe('C E G A♯');
    draw(true);
    expect(key(60).getAttribute('fill')).toBe('#1D9E75');
    expect(key(64).getAttribute('fill')).toBe('#1D9E75');
    expect(key(70).getAttribute('fill')).toBe('#C4503F');
    expect(key(71).getAttribute('fill')).toBe('#B98A1E');
  });

  it('plays the chord from the shared player\'s chips on the reveal', () => {
    draw(true);
    expect(byTestId('player-play-together')).not.toBeNull();
    expect(byTestId('submit')).toBeNull();
  });
});
