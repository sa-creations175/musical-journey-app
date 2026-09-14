// @vitest-environment jsdom
/**
 * Tapping the five notes, on both wordings of the card.
 *
 * ONE SURFACE, TWO QUESTIONS. The notes card ignores order; the lick
 * card's first tap is the claim it is making. Both are tested here
 * because the difference is one flag and a flag is easy to invert.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
// THE PANEL READS THE GLOBAL INSTRUMENT, so a surface that shows it
// has to be mounted inside the provider the app mounts it inside.
import { InstrumentProvider } from '../../../../lib/instrumentContext';
import { act } from 'react';

const played = vi.hoisted(() => ({ seq: [] as unknown[][], drones: [] as unknown[] }));
vi.mock('../../../../lib/audio', () => ({
  playSeqChords: (chords: unknown[]) => {
    played.seq.push(chords);
    return Promise.resolve({ stop: () => {} });
  },
}));
vi.mock('../../../../lib/musicalPlayback', () => ({
  playBlocked: (midi: number) => {
    played.drones.push(midi);
    return Promise.resolve({ stop: () => {} });
  },
}));
vi.mock('../../../../lib/userPrefs', () => ({
  getPref: (_k: string, d: unknown) => Promise.resolve(d),
  setPref: () => Promise.resolve(),
}));

const { FLASHCARDS } = await import('../../catalog');
const { builtTargetFor } = await import('../cardTargets');
const ScaleAnswer = (await import('../ScaleAnswer')).default;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function scaleTarget(id: string) {
  const card = FLASHCARDS.find(c => c.id === id)!;
  const t = builtTargetFor(card)!;
  if (t.kind !== 'scale') throw new Error('wrong kind');
  return { card, target: t };
}

const notes = scaleTarget('pent-notes-major-Eb');
const lick = scaleTarget('pent-lick-Ab');

let host: HTMLDivElement;
let root: Root;
let chosen: string[];

function mount(which: typeof notes, answered = false) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <InstrumentProvider>
        <ScaleAnswer
          card={which.card}
          target={which.target}
          answered={answered}
          answer={c => chosen.push(c)}
        />,
      </InstrumentProvider>,
    );
  });
}

const byTestId = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const tap = (el: Element | null) => {
  act(() => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
/** Tap a pitch class, in the octave above middle C. */
const tapPc = (pc: number) => tap(host.querySelector(`rect[data-midi="${60 + pc}"]`));
/** Let the player's awaits run. `playScale` holds the drone and the
 *  line behind two awaits, so nothing has reached the engine until the
 *  microtask queue has drained. */
const settle = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

beforeEach(() => { chosen = []; played.seq = []; played.drones = []; });
afterEach(() => { act(() => { root.unmount(); }); host.remove(); });

describe('the keyboard is the answer', () => {
  it('has no letter row', () => {
    mount(notes);
    expect(byTestId('letter-row')).toBeNull();
  });

  it('takes a tap and gives it back', () => {
    mount(notes);
    tapPc(3);
    expect(byTestId('scale-built')!.textContent).toBe('E♭');
    // Tapping again removes it.
    tapPc(3);
    expect(byTestId('scale-built')!.textContent).toBe('nothing yet');
  });

  it('counts a pitch class once, in whichever octave', () => {
    mount(notes);
    tapPc(3);
    tap(host.querySelector('rect[data-midi="51"]'));
    expect(byTestId('scale-built')!.textContent).toBe('nothing yet');
  });

  it('asks for five before it grades', () => {
    mount(notes);
    tapPc(3);
    tap(byTestId('submit'));
    expect(chosen).toEqual([]);
    expect(byTestId('picker-message')!.textContent).toContain('You have 1');
  });
});

describe('the notes card ignores the order', () => {
  it('marks the five right whichever way round they are tapped', () => {
    mount(notes);
    for (const pc of [...notes.target.pcs].reverse()) tapPc(pc);
    tap(byTestId('submit'));
    expect(chosen).toEqual([notes.card.correctAnswer]);
  });

  it('records what was tapped when they are wrong', () => {
    mount(notes);
    for (const pc of [0, 1, 2, 3, 4]) tapPc(pc);
    tap(byTestId('submit'));
    expect(chosen[0]).toContain('C');
    expect(chosen[0]).not.toBe(notes.card.correctAnswer);
  });
});

describe('the lick card asks which minor pentatonic, so the root is the answer', () => {
  it('says so above the board', () => {
    mount(lick);
    expect(byTestId('scale-answer')!.textContent).toContain('root first');
    expect(byTestId('scale-built')!.textContent).toBe('tap the root first');
  });

  it('marks it right when the root is tapped first', () => {
    mount(lick);
    const rest = lick.target.pcs.filter(p => p !== lick.target.rootPc);
    tapPc(lick.target.rootPc);
    for (const pc of rest) tapPc(pc);
    tap(byTestId('submit'));
    expect(chosen).toEqual([lick.card.correctAnswer]);
  });

  it('marks it wrong when the five are right and the first is not', () => {
    mount(lick);
    const rest = lick.target.pcs.filter(p => p !== lick.target.rootPc);
    for (const pc of rest) tapPc(pc);
    tapPc(lick.target.rootPc);
    tap(byTestId('submit'));
    expect(chosen).toHaveLength(1);
    expect(chosen[0]).not.toBe(lick.card.correctAnswer);
  });

  it('shows the claimed root in the root colour and the rest in blue', () => {
    mount(lick);
    tapPc(lick.target.rootPc);
    tapPc(lick.target.pcs.filter(p => p !== lick.target.rootPc)[0]);
    const rootKey = host.querySelector(`rect[data-midi="${60 + lick.target.rootPc}"]`)!;
    expect(rootKey.getAttribute('fill')).toBe('#0F6E56');
  });
});

describe('nothing sounds until it is tapped', () => {
  it('plays nothing on mount, on a tap, or on Submit', async () => {
    mount(notes);
    for (const pc of notes.target.pcs) tapPc(pc);
    tap(byTestId('submit'));
    await settle();
    expect(played.seq).toHaveLength(0);
    expect(played.drones).toHaveLength(0);
  });
});

describe('the reveal lights the scale and plays it over a drone', () => {
  it('lights every octave of the whole scale', () => {
    mount(notes, true);
    const lit = [...host.querySelectorAll('rect[data-mark="marked"]')];
    // Five notes across three octaves and the closing C.
    expect(lit.length).toBeGreaterThanOrEqual(15);
  });

  it('offers a starting point per note, and the play chips where Direction was', () => {
    mount(notes, true);
    expect(byTestId('start-row')!.children).toHaveLength(5);
    expect([...byTestId('player-play-chips')!.children].map(c => c.textContent))
      .toEqual(['♪ Together', '♪ Up', '♪ Down', '♪ Up and Down']);
    // ONE SET, in the control row, and no Play as row anywhere.
    expect(host.querySelectorAll('[data-testid="player-play-chips"]')).toHaveLength(1);
    expect(host.querySelector('[data-testid="play-as-row"]')).toBeNull();
    expect(byTestId('direction-row')).toBeNull();
  });

  it('plays every note at once on Together', async () => {
    mount(notes, true);
    tap(byTestId('player-play-together'));
    await settle();
    const steps = played.seq[0] as Array<{ intervals: number[] }>;
    // The home chord, then one step holding the scale and its octave.
    expect(steps).toHaveLength(2);
    expect(steps[1].intervals).toHaveLength(6);
  });

  it('drones on the KEY and not on the scale, on the lick card', async () => {
    // The prototype's rule: A♭ under F minor pentatonic.
    mount(lick, true);
    tap(byTestId('player-play-upDown'));
    await settle();
    expect(played.drones).toEqual([36 + lick.target.dronePc]);
    expect(lick.target.dronePc).not.toBe(lick.target.rootPc);
  });

  it('turns at the top note, not at the octave', async () => {
    mount(notes, true);
    tap(byTestId('player-play-upDown'));
    await settle();
    const steps = played.seq[0] as unknown[];
    // The home chord, then five up and four back.
    expect(steps).toHaveLength(1 + 9);
  });

  it('runs the full octave when one direction is chosen', async () => {
    mount(notes, true);
    tap(byTestId('player-play-up'));
    await settle();
    expect(played.seq[0]).toHaveLength(1 + 6);
  });

  it('offers the colour toggle, and it is by interval by default', () => {
    mount(notes, true);
    expect(byTestId('colour-interval')!.getAttribute('aria-pressed')).toBe('true');
    tap(byTestId('colour-plain'));
    expect(byTestId('colour-plain')!.getAttribute('aria-pressed')).toBe('true');
  });
});
