// @vitest-environment jsdom
/**
 * Naming a key, and counting its accidentals.
 *
 * =====================================================================
 * THE THING THAT MUST NOT HAPPEN IS THE ANSWER APPEARING EARLY.
 *
 * Both of these cards are about a key, and both reveal that key's scale
 * — seven notes a reader can count the black ones of. Lighting the
 * scale of whatever has been TAPPED would hand the answer back: try
 * roots until something familiar appears. So the tests assert what is
 * lit before Submit as carefully as what is lit after.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
// THE PANEL READS THE GLOBAL INSTRUMENT, so a surface that shows it
// has to be mounted inside the provider the app mounts it inside.
import { InstrumentProvider } from '../../../../lib/instrumentContext';
import { act } from 'react';

const played = vi.hoisted(() => ({ seq: [] as unknown[][], drones: [] as number[] }));
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
const RootAnswer = (await import('../RootAnswer')).default;
const SignatureAnswer = (await import('../SignatureAnswer')).default;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function rootCard(id: string) {
  const card = FLASHCARDS.find(c => c.id === id)!;
  const t = builtTargetFor(card)!;
  if (t.kind !== 'root') throw new Error(`${id} is ${t.kind}`);
  return { card, target: t };
}

function signatureCard(id: string) {
  const card = FLASHCARDS.find(c => c.id === id)!;
  const t = builtTargetFor(card)!;
  if (t.kind !== 'signature') throw new Error(`${id} is ${t.kind}`);
  return { card, target: t };
}

const relMinor = rootCard('ks-relminor-Ab');
const relMajor = rootCard('ks-relmajor-Ab');
const sigKey = rootCard('ks-sig-major-Eb');
const countG = signatureCard('ks-count-G');
const countC = signatureCard('ks-count-C');

let host: HTMLDivElement;
let root: Root;
let chosen: string[];

function mountRoot(which: typeof relMinor, answered = false) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <InstrumentProvider>
        <RootAnswer
          card={which.card}
          target={which.target}
          answered={answered}
          answer={c => chosen.push(c)}
        />,
      </InstrumentProvider>,
    );
  });
}

function mountSignature(which: typeof countG, answered = false) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <InstrumentProvider>
        <SignatureAnswer
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
const lit = () => host.querySelectorAll('rect[data-mark="marked"]').length;
const settle = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

beforeEach(() => { chosen = []; played.seq = []; played.drones = []; });
afterEach(() => { act(() => { root.unmount(); }); host.remove(); });

describe('the relative key is one tap', () => {
  it('answers from the letter row', () => {
    mountRoot(relMinor);
    tap(byTestId('letter-F'));
    expect(byTestId('root-built')!.textContent).toBe('F minor');
    tap(byTestId('submit'));
    expect(chosen).toEqual([relMinor.card.correctAnswer]);
  });

  it('answers from the board, and the two mirror each other', () => {
    mountRoot(relMinor);
    tap(host.querySelector('rect[data-midi="53"]'));
    expect(byTestId('root-built')!.textContent).toBe('F minor');
    tap(byTestId('submit'));
    expect(chosen).toEqual([relMinor.card.correctAnswer]);
  });

  it('lights only the key a finger landed on, before Submit', () => {
    // The failure this guards: a reader trying roots until seven
    // familiar notes appear.
    mountRoot(relMinor);
    tap(host.querySelector('rect[data-midi="53"]'));
    expect(lit()).toBe(1);
  });

  it('records the key that was built when it is wrong', () => {
    mountRoot(relMinor);
    tap(byTestId('letter-A'));
    tap(byTestId('accidental-flat'));
    tap(byTestId('submit'));
    expect(chosen).toEqual(['A♭ minor']);
  });

  it('asks for a root rather than grading nothing', () => {
    mountRoot(relMinor);
    tap(byTestId('submit'));
    expect(chosen).toEqual([]);
    expect(byTestId('picker-message')).not.toBeNull();
  });

  it('reads the twin as a major key', () => {
    mountRoot(relMajor);
    tap(byTestId('letter-A'));
    tap(byTestId('accidental-flat'));
    expect(byTestId('root-built')!.textContent).toBe('A♭ major');
    tap(byTestId('submit'));
    expect(chosen).toEqual([relMajor.card.correctAnswer]);
  });

  it('serves the count-to-key cards too', () => {
    mountRoot(sigKey);
    tap(byTestId('letter-E'));
    tap(byTestId('accidental-flat'));
    tap(byTestId('submit'));
    expect(chosen).toEqual([sigKey.card.correctAnswer]);
  });
});

describe('the relative key reveals its scale', () => {
  it('lights all seven notes across the board', () => {
    mountRoot(relMinor, true);
    // Seven pitch classes over three octaves and a closing C.
    expect(lit()).toBeGreaterThanOrEqual(21);
  });

  it('runs to the octave and back, with no starting points', () => {
    mountRoot(relMinor, true);
    expect(byTestId('start-row')).toBeNull();
    // THE PLAY CHIPS, WHERE DIRECTION WAS (13 and 14 Sep 2026).
    expect(byTestId('player-play-chips')).not.toBeNull();
    expect(byTestId('direction-row')).toBeNull();
  });

  it('plays the home chord, then the scale over its own root', async () => {
    mountRoot(relMinor, true);
    tap(byTestId('player-play-upDown'));
    await settle();
    // The home chord, then fifteen notes: seven up, the octave, seven
    // back.
    expect(played.seq[0]).toHaveLength(1 + 15);
    expect(played.drones).toEqual([36 + relMinor.target.rootPc]);
  });

  it('plays nothing until a play chip is tapped', async () => {
    mountRoot(relMinor, true);
    await settle();
    expect(played.seq).toHaveLength(0);
  });
});

describe('the count card has no board and no sound before Submit', () => {
  it('offers a count and a direction, and nothing else', () => {
    mountSignature(countG);
    expect(byTestId('count-row')!.children).toHaveLength(7);
    expect(byTestId('direction-row')!.children).toHaveLength(2);
    expect(host.querySelector('[data-testid="built-answer-keyboard"]')).toBeNull();
  });

  it('grades the count and the direction together', () => {
    mountSignature(countG);
    tap(byTestId('count-1'));
    tap(byTestId('direction-sharps'));
    tap(byTestId('submit'));
    expect(chosen).toEqual([countG.card.correctAnswer]);
  });

  it('marks the right count in the wrong direction wrong, and says so', () => {
    // THE DIRECTION HAS TO BE IN THE STRING. The card's own answer is
    // the bare count "1", so handing the shell "1" for "one flat" in
    // the key of G major would be marked RIGHT by its one comparison.
    mountSignature(countG);
    tap(byTestId('count-1'));
    tap(byTestId('direction-flats'));
    tap(byTestId('submit'));
    expect(chosen).toEqual(['1 flats']);
    expect(chosen[0]).not.toBe(countG.card.correctAnswer);
  });

  it('needs a direction unless the answer is zero', () => {
    mountSignature(countG);
    tap(byTestId('count-1'));
    tap(byTestId('submit'));
    expect(chosen).toEqual([]);
    expect(byTestId('picker-message')!.textContent).toContain('sharps or flats');
  });

  it('lets zero answer with no direction at all', () => {
    mountSignature(countC);
    tap(byTestId('count-0'));
    tap(byTestId('submit'));
    expect(chosen).toEqual([countC.card.correctAnswer]);
  });

  it('plays nothing and lights nothing before Submit', async () => {
    mountSignature(countG);
    tap(byTestId('count-1'));
    tap(byTestId('direction-sharps'));
    tap(byTestId('submit'));
    await settle();
    expect(played.seq).toHaveLength(0);
  });
});

describe('the count card reveals the key it was about', () => {
  it('draws the scale, so the accidentals are countable', () => {
    mountSignature(countG, true);
    expect(host.querySelector('[data-testid="built-answer-keyboard"]')).not.toBeNull();
    expect(lit()).toBeGreaterThanOrEqual(28);
    // One black key in the key of G major, F♯, on every F♯ the board has:
    // F♯1 to F♯5 on the F1 to C6 board.
    const blackLit = [...host.querySelectorAll('rect[data-mark="marked"]')]
      .filter(r => [1, 3, 6, 8, 10].includes(Number(r.getAttribute('data-midi')) % 12));
    expect(blackLit).toHaveLength(5);
  });

  it('says the count in words under the panel', () => {
    mountSignature(countG, true);
    expect(byTestId('play-it-names')!.textContent).toBe('G major — 1 sharp');
    mountSignature(countC, true);
    expect(byTestId('play-it-names')!.textContent)
      .toBe('C major — no sharps and no flats');
  });
});
