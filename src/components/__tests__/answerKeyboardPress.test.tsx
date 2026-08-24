// @vitest-environment jsdom
/**
 * What the keyboard EMITS, pressed key by pressed key.
 *
 * ---------------------------------------------------------------
 * PINS THE PAIRING, NOT THE ACCEPTED SET.
 *
 * A test that asserts `accepted` contains {pc: 6, octave: 1} stays
 * green if the set gets repointed at a different subject — the set is
 * still the right shape, it is simply about another card now. So each
 * case here presses a SPECIFIC key and asserts the SPECIFIC value that
 * came out, and the verdict is computed the way a card would compute
 * it: by comparing the emission against accepted.
 *
 * The keyboard never judges. These tests do the judging, exactly as a
 * card would, which is the point — if judgement ever moved inside the
 * component, the emission would stop being sufficient to reproduce it.
 * ---------------------------------------------------------------
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import AnswerKeyboard from '../AnswerKeyboard';

// React needs telling it is under test before `act` will run, the same
// way homeRoute.test.tsx and readingFocus.test.tsx do it.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;
import {
  BH, BW, WH, WW, blackKeys, samePosition, viewBoxWidth, whiteKeys,
  type KeyPosition,
} from '../../lib/answerKeyboard';

/** Presses land through the SVG's client rect, so it needs a size. */
function stubRect(svg: SVGSVGElement, octaves: 1 | 2) {
  const w = viewBoxWidth(octaves);
  svg.getBoundingClientRect = () => ({
    left: 0, top: 0, width: w, height: WH,
    right: w, bottom: WH, x: 0, y: 0, toJSON: () => ({}),
  }) as DOMRect;
}

function mount(opts: {
  subject: KeyPosition;
  accepted: ReadonlyArray<KeyPosition>;
  octaves: 1 | 2;
}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const presses: KeyPosition[] = [];
  act(() => {
    root.render(
      <AnswerKeyboard
        subject={opts.subject}
        accepted={opts.accepted}
        pressed={null}
        revealed={false}
        onPress={k => presses.push(k)}
        octavesOverride={opts.octaves}
      />,
    );
  });
  const svg = container.querySelector('svg')!;
  stubRect(svg, opts.octaves);
  const pressAt = (x: number, y: number) => {
    act(() => {
      svg.dispatchEvent(new MouseEvent('click', {
        bubbles: true, clientX: x, clientY: y,
      }));
    });
  };
  const shiftOctave = (dir: 'up' | 'down') => {
    const label = dir === 'up' ? 'Show the octave above' : 'Show the octave below';
    const btn = [...container.querySelectorAll('button')]
      .find(b => b.getAttribute('aria-label') === label);
    if (!btn) throw new Error(`no ${dir} control — one-octave mode only`);
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  };
  return {
    presses,
    pressAt,
    shiftOctave,
    /** Press the middle of a white key by index across the board. */
    pressWhite: (i: number) => pressAt(i * WW + WW / 2, WH - 5),
    /** Press a black key by its index across the board. */
    pressBlack: (i: number) => {
      const k = blackKeys(opts.octaves)[i];
      pressAt(k.x + BW / 2, 5);
    },
    unmount: () => { act(() => { root.unmount(); }); container.remove(); },
  };
}

beforeEach(() => { vi.stubGlobal('ResizeObserver', class {
  observe() {} unobserve() {} disconnect() {}
}); });

describe('a tritone card: either octave accepted', () => {
  // "Tritone of C" — the subject is C in the lower octave, and F♯ is
  // right whether it is above or below. That rule lives HERE, in the
  // card's accepted set, never in the keyboard.
  const subject: KeyPosition = { pc: 0, octave: 0 };
  const accepted: ReadonlyArray<KeyPosition> = [
    { pc: 6, octave: 0 }, { pc: 6, octave: 1 },
  ];
  const verdict = (k: KeyPosition) => accepted.some(a => samePosition(a, k));

  it('accepts F♯ in the lower octave', () => {
    const h = mount({ subject, accepted, octaves: 2 });
    h.pressBlack(2);                       // F♯, lower octave
    expect(h.presses).toEqual([{ pc: 6, octave: 0 }]);
    expect(verdict(h.presses[0])).toBe(true);
    h.unmount();
  });

  it('accepts F♯ in the upper octave', () => {
    const h = mount({ subject, accepted, octaves: 2 });
    h.pressBlack(7);                       // F♯, upper octave
    expect(h.presses).toEqual([{ pc: 6, octave: 1 }]);
    expect(verdict(h.presses[0])).toBe(true);
    h.unmount();
  });

  it('rejects the neighbouring key, in either octave', () => {
    const h = mount({ subject, accepted, octaves: 2 });
    h.pressBlack(3);                       // G♯, lower
    h.pressBlack(8);                       // G♯, upper
    expect(h.presses).toEqual([{ pc: 8, octave: 0 }, { pc: 8, octave: 1 }]);
    expect(h.presses.map(verdict)).toEqual([false, false]);
    h.unmount();
  });
});

describe('an ascending-interval card: one octave only', () => {
  // The same component, a different accepted set — an ASCENDING major
  // 7th from C accepts B above and nothing else. If the tritone's
  // either-octave rule had leaked into the keyboard, the lower B would
  // come back accepted here.
  const subject: KeyPosition = { pc: 0, octave: 0 };
  const accepted: ReadonlyArray<KeyPosition> = [{ pc: 11, octave: 0 }];
  const verdict = (k: KeyPosition) => accepted.some(a => samePosition(a, k));

  it('accepts B in the subject’s own octave', () => {
    const h = mount({ subject, accepted, octaves: 2 });
    h.pressWhite(6);                       // B, lower octave
    expect(h.presses).toEqual([{ pc: 11, octave: 0 }]);
    expect(verdict(h.presses[0])).toBe(true);
    h.unmount();
  });

  it('REJECTS the same pitch class an octave up', () => {
    // The load-bearing case. Same pc, different octave, different
    // verdict — only possible because the emission carries the octave.
    const h = mount({ subject, accepted, octaves: 2 });
    h.pressWhite(13);                      // B, upper octave
    expect(h.presses).toEqual([{ pc: 11, octave: 1 }]);
    expect(verdict(h.presses[0])).toBe(false);
    h.unmount();
  });
});

describe('the overlap, through a real press', () => {
  const subject: KeyPosition = { pc: 0, octave: 0 };

  it('registers the black key when the tap is over its body', () => {
    const h = mount({ subject, accepted: [], octaves: 2 });
    h.pressAt(WW, 10);                     // C♯'s centre, high up
    expect(h.presses).toEqual([{ pc: 1, octave: 0 }]);
    h.unmount();
  });

  it('registers the white key below the black key’s foot', () => {
    const h = mount({ subject, accepted: [], octaves: 2 });
    h.pressAt(WW, BH + 10);                // same x, below C♯
    expect(h.presses).toEqual([{ pc: 2, octave: 0 }]);
    h.unmount();
  });
});

describe('mode switching preserves what a key MEANS', () => {
  it('emits the same pitch class and octave in one-octave mode', () => {
    // Asserted on the emission, not on what is rendered. The board
    // narrows; the identity of the key the finger landed on does not.
    const subject: KeyPosition = { pc: 0, octave: 0 };

    const two = mount({ subject, accepted: [], octaves: 2 });
    two.pressBlack(2);                     // F♯, lower octave
    const fromTwo = two.presses[0];
    two.unmount();

    const one = mount({ subject, accepted: [], octaves: 1 });
    one.pressBlack(2);                     // the same F♯
    const fromOne = one.presses[0];
    one.unmount();

    expect(fromOne).toEqual(fromTwo);
    expect(fromOne).toEqual({ pc: 6, octave: 0 });
  });

  it('emits the SHIFTED octave after the octave control is used', () => {
    // THE CASE THE OTHER MODE TESTS CANNOT REACH. With the subject in
    // octave 0 and no shift, the board octave and the emitted octave
    // coincide, so the correction is a no-op and a test that only
    // presses at rest stays green without it. Shifting is what makes
    // the two differ — and the shift control is the only way a
    // one-octave board can answer an octave away from the subject at
    // all, which is exactly what a tritone card needs.
    const subject: KeyPosition = { pc: 0, octave: 0 };
    const h = mount({ subject, accepted: [], octaves: 1 });

    h.pressBlack(2);                      // F♯, at rest
    expect(h.presses[0]).toEqual({ pc: 6, octave: 0 });

    h.shiftOctave('up');
    h.pressBlack(2);                      // the same key, an octave up
    expect(h.presses[1]).toEqual({ pc: 6, octave: 1 });

    h.shiftOctave('down');
    h.shiftOctave('down');
    h.pressBlack(2);                      // and an octave below
    expect(h.presses[2]).toEqual({ pc: 6, octave: -1 });
    h.unmount();
  });

  it('offers no octave control in two-octave mode', () => {
    // Both octaves are on screen; a shift would move the window away
    // from the subject for no reason.
    const h = mount({ subject: { pc: 0, octave: 0 }, accepted: [], octaves: 2 });
    expect(() => h.shiftOctave('up')).toThrow();
    h.unmount();
  });

  it('emits every white key identically in both modes', () => {
    const subject: KeyPosition = { pc: 0, octave: 0 };
    for (let i = 0; i < whiteKeys(1).length; i++) {
      const two = mount({ subject, accepted: [], octaves: 2 });
      two.pressWhite(i);
      const a = two.presses[0];
      two.unmount();

      const one = mount({ subject, accepted: [], octaves: 1 });
      one.pressWhite(i);
      const b = one.presses[0];
      one.unmount();

      expect(b).toEqual(a);
    }
  });
});

describe('nothing narrows the answer before submission', () => {
  it('marks the subject and nothing else', () => {
    // Four buttons print the spelling; the keyboard exists to make you
    // find the note. Any candidate marking hands that back.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <AnswerKeyboard
          subject={{ pc: 0, octave: 0 }}
          accepted={[{ pc: 6, octave: 0 }, { pc: 6, octave: 1 }]}
          pressed={null}
          revealed={false}
          onPress={() => {}}
          octavesOverride={2}
        />,
      );
    });
    const fills = [...container.querySelectorAll('rect')]
      .map(r => r.getAttribute('fill'));
    // Only white and black key fills — no accent colour anywhere.
    expect(new Set(fills)).toEqual(new Set(['#ffffff', '#171717']));
    act(() => { root.unmount(); });
    container.remove();
  });

  it('marks the accepted keys once revealed', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <AnswerKeyboard
          subject={{ pc: 0, octave: 0 }}
          accepted={[{ pc: 6, octave: 0 }]}
          pressed={{ pc: 8, octave: 0 }}
          revealed
          onPress={() => {}}
          octavesOverride={2}
        />,
      );
    });
    const fills = [...container.querySelectorAll('rect')]
      .map(r => r.getAttribute('fill'));
    expect(fills).toContain('#0F6E56');   // the accepted key
    expect(fills).toContain('#E24B4A');   // what was pressed
    act(() => { root.unmount(); });
    container.remove();
  });
});
