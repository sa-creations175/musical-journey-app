// @vitest-environment jsdom
/**
 * Building a slash chord, top then bottom.
 *
 * The claims worth a test are the ones that are invisible: that the
 * hand shape does not fail an answer, that the low octave means the
 * bass and the upper two mean the chord, and that nothing sounds
 * without a tap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
// THE PANEL READS THE GLOBAL INSTRUMENT, so a surface that shows it
// has to be mounted inside the provider the app mounts it inside.
import { InstrumentProvider } from '../../../../lib/instrumentContext';
import { act } from 'react';

const played = vi.hoisted(() => ({ seq: [] as unknown[][] }));
vi.mock('../../../../lib/audio', () => ({
  playSeqChords: (chords: unknown[]) => {
    played.seq.push(chords);
    return Promise.resolve({ stop: () => {} });
  },
}));
vi.mock('../../../../lib/musicalPlayback', () => ({
  playBlocked: () => Promise.resolve({ stop: () => {} }),
}));

const { FLASHCARDS } = await import('../../catalog');
const { builtTargetFor } = await import('../cardTargets');
const SlashAnswer = (await import('../SlashAnswer')).default;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const card = FLASHCARDS.find(c => c.id === 'sc-slash-5-7-C')!;
const found = builtTargetFor(card)!;
if (found.kind !== 'slash') throw new Error('wrong kind');
const target = found;

let host: HTMLDivElement;
let root: Root;
let chosen: string[];

function mount(answered = false) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <InstrumentProvider>
        <SlashAnswer
          card={card}
          target={target}
          answered={answered}
          answer={c => chosen.push(c)}
        />,
      </InstrumentProvider>,
    );
  });
}

const q = (sel: string) => host.querySelector(sel);
const byTestId = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const tap = (el: Element | null) => {
  act(() => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

beforeEach(() => { chosen = []; played.seq = []; });
afterEach(() => { act(() => { root.unmount(); }); host.remove(); });

describe('the top chord comes first', () => {
  it('starts on major, so the chord lights from one tap', () => {
    mount();
    expect(byTestId('quality-major')!.getAttribute('aria-pressed')).toBe('true');
    tap(byTestId('letter-G'));
    expect(byTestId('slash-built')!.textContent).toBe('G/bass');
  });

  it('hides the bottom row until there is a chord to sit under', () => {
    mount();
    expect(byTestId('bass-row')).toBeNull();
    tap(byTestId('letter-G'));
    expect(byTestId('bass-row')).not.toBeNull();
  });

  it('ignores a tap in the low octave until the chord is set', () => {
    mount();
    tap(q('rect[data-midi="47"]'));
    expect(byTestId('slash-built')!.textContent).toBe('chord/bass');
  });
});

describe('the board says which half of the fraction', () => {
  it('sets the chord from the upper octaves and the note from the low one', () => {
    mount();
    tap(q('rect[data-midi="55"]'));       // G above middle C
    expect(byTestId('slash-built')!.textContent).toBe('G/bass');
    tap(q('rect[data-midi="47"]'));       // B in the bass octave
    expect(byTestId('slash-built')!.textContent).toBe('G/B');
  });

  it('bands the bass key rather than only filling it', () => {
    mount();
    tap(byTestId('letter-G'));
    tap(q('rect[data-midi="47"]'));
    expect(byTestId('bass-band-47')).not.toBeNull();
  });
});

describe('what is graded', () => {
  it('marks the chord over the note right', () => {
    mount();
    tap(byTestId('letter-G'));
    tap(q('rect[data-midi="47"]'));
    tap(byTestId('submit'));
    expect(chosen).toEqual([card.correctAnswer]);
  });

  it('accepts any hand shape, because the card does not ask', () => {
    mount();
    tap(byTestId('letter-G'));
    tap(byTestId('inversion-2'));
    tap(q('rect[data-midi="47"]'));
    tap(byTestId('submit'));
    expect(chosen).toEqual([card.correctAnswer]);
  });

  it('records what was built when the bottom note is wrong', () => {
    mount();
    tap(byTestId('letter-G'));
    tap(q('rect[data-midi="43"]'));
    tap(byTestId('submit'));
    expect(chosen).toEqual(['G/G']);
  });

  it('asks for the bottom note rather than grading half an answer', () => {
    mount();
    tap(byTestId('letter-G'));
    tap(byTestId('submit'));
    expect(chosen).toEqual([]);
    expect(byTestId('picker-message')!.textContent).toContain('bottom note');
  });
});

describe('nothing sounds until it is tapped', () => {
  it('plays nothing on mount, on a tap, or on Submit', () => {
    mount();
    expect(played.seq).toHaveLength(0);
    tap(byTestId('letter-G'));
    tap(q('rect[data-midi="47"]'));
    expect(played.seq).toHaveLength(0);
    tap(byTestId('submit'));
    expect(played.seq).toHaveLength(0);
  });

  it('plays the chord alone from Hear chord', () => {
    mount();
    tap(byTestId('letter-G'));
    tap(byTestId('hear-chord'));
    expect(played.seq).toHaveLength(1);
    expect(played.seq[0]).toHaveLength(1);
  });
});

describe('the reveal plays it in context', () => {
  it('opens on the phrase rather than the chord alone', () => {
    mount(true);
    expect(byTestId('context-down')!.getAttribute('aria-pressed')).toBe('true');
    expect(byTestId('context-alone')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('plays the tonic and the phrase, in order', () => {
    mount(true);
    tap(byTestId('player-hear'));
    // 1 · 5/7 · 6m, with a low tonic in front of it.
    expect(played.seq[0]).toHaveLength(4);
  });

  it('plays the chord alone when that is chosen', () => {
    mount(true);
    tap(byTestId('context-alone'));
    tap(byTestId('player-hear'));
    expect(played.seq[0]).toHaveLength(2);
  });

  it('drops the hand for bass only, and keeps the bass', () => {
    // BASS ONLY IS THE PANEL'S NOW, not two buttons of this surface's.
    // One row asks it, on every screen that sounds a bass line.
    mount(true);
    tap(byTestId('listen-bass'));
    tap(byTestId('player-hear'));
    const steps = played.seq[0] as Array<{ intervals: number[] }>;
    // The tonic, then three steps each of one note.
    for (const step of steps.slice(1)) expect(step.intervals).toHaveLength(1);
  });

  it('shows no picker rows and no Submit', () => {
    mount(true);
    expect(byTestId('letter-row')).toBeNull();
    expect(byTestId('submit')).toBeNull();
    expect(byTestId('slash-built')!.textContent).toBe(card.correctAnswer);
  });
});
