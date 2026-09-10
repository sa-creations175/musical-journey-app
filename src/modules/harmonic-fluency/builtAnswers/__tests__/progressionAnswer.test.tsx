// @vitest-environment jsdom
/**
 * Building a progression, and the four things that must not happen.
 *
 * =====================================================================
 * IT MUST NOT MARK A RIGHT ANSWER WRONG. A built answer can express an
 * inversion, an octave and an extension, none of which the card asks
 * about — so the test that matters is that none of them fails a build.
 *
 * IT MUST NOT SOUND BEFORE IT IS TAPPED. Silas's rule of 9 Sep. The
 * audio engine is stubbed and every call to it is counted, so a mount
 * or a tap that plays something shows up as a number.
 *
 * IT MUST NOT HAND THE SHELL A GESTURE. The shell judges one string;
 * the surface owes it either the card's own answer or a description of
 * what was really built.
 *
 * IT MUST NOT SHOW THE READER'S ANSWER AS THE REVEAL. Once the card is
 * answered the slots read the card's chords, so coming back with
 * Previous shows the right answer rather than a half-remembered
 * attempt.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

/** The engine, stubbed and counted. Nothing here should reach it
 *  without a tap. */
const played = vi.hoisted(() => ({ seq: [] as unknown[][], blocked: 0 }));
vi.mock('../../../../lib/audio', () => ({
  playSeqChords: (chords: unknown[]) => {
    played.seq.push(chords);
    return Promise.resolve({ stop: () => {} });
  },
}));
vi.mock('../../../../lib/musicalPlayback', () => ({
  playBlocked: () => { played.blocked += 1; return Promise.resolve({ stop: () => {} }); },
}));

const { FLASHCARDS } = await import('../../catalog');
const { builtTargetFor } = await import('../cardTargets');
const ProgressionAnswer = (await import('../ProgressionAnswer')).default;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const card = FLASHCARDS.find(c => c.id === 'pr-prog-2-5-1-Bb')!;
const found = builtTargetFor(card)!;
if (found.kind !== 'progression') throw new Error('wrong kind');
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
      <ProgressionAnswer
        card={card}
        target={target}
        answered={answered}
        answer={c => chosen.push(c)}
      />,
    );
  });
}

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const all = (sel: string) => [...host.querySelectorAll(sel)] as HTMLElement[];
/** A tap, dispatched rather than `.click()`ed: an SVG key is an
 *  `SVGElement` and has no `click` method in jsdom. */
const tap = (el: Element | null) => {
  act(() => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const byTestId = (id: string) => q(`[data-testid="${id}"]`);

/** Build one chord into the slot the picker is on. */
function buildChord(letter: string, acc: '' | 'flat' | 'sharp', quality: string) {
  if (acc !== '') tap(byTestId(`accidental-${acc}`));
  tap(byTestId(`letter-${letter}`));
  tap(byTestId(`quality-${quality}`));
}

beforeEach(() => { chosen = []; played.seq = []; played.blocked = 0; });
afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

describe('the answer is built, not picked', () => {
  it('offers one slot per chord and starts on the first', () => {
    mount();
    expect(all('[data-testid^="slot-"]')).toHaveLength(3);
    expect(byTestId('slot-0')!.getAttribute('aria-current')).toBe('true');
    expect(byTestId('slot-0')!.textContent).toBe('chord 1');
  });

  it('hands the shell the card\'s own answer when the chords are right', () => {
    mount();
    buildChord('C', '', 'm7');
    tap(byTestId('slot-1'));
    buildChord('F', '', '7');
    tap(byTestId('slot-2'));
    buildChord('B', 'flat', 'maj7');
    tap(byTestId('submit'));
    expect(chosen).toEqual([card.correctAnswer]);
  });

  it('hands it what was really built when they are not', () => {
    mount();
    buildChord('C', '', 'm7');
    tap(byTestId('slot-1'));
    buildChord('F', '', 'm7');
    tap(byTestId('slot-2'));
    buildChord('B', 'flat', 'maj7');
    tap(byTestId('submit'));
    expect(chosen).toEqual(['Cm7 - Fm7 - B♭maj7']);
  });

  it('accepts a triad where the card names a seventh', () => {
    // EXTENSIONS NEVER FAIL AN ANSWER, and neither does their absence
    // where the family is the same.
    mount();
    buildChord('C', '', 'm');
    tap(byTestId('slot-1'));
    buildChord('F', '', 'major');
    tap(byTestId('slot-2'));
    buildChord('B', 'flat', 'major');
    tap(byTestId('submit'));
    expect(chosen).toEqual([card.correctAnswer]);
  });

  it('accepts any inversion, because the card does not ask about one', () => {
    mount();
    buildChord('C', '', 'm7');
    tap(byTestId('inversion-2'));
    tap(byTestId('slot-1'));
    buildChord('F', '', '7');
    tap(byTestId('slot-2'));
    buildChord('B', 'flat', 'maj7');
    tap(byTestId('submit'));
    expect(chosen).toEqual([card.correctAnswer]);
  });

  it('refuses to submit an unfinished chord, and says which', () => {
    mount();
    buildChord('C', '', 'm7');
    tap(byTestId('submit'));
    expect(chosen).toEqual([]);
    expect(byTestId('picker-message')!.textContent).toContain('Chord 2');
  });

  it('lets any earlier chord be edited before Submit', () => {
    mount();
    buildChord('C', '', 'm7');
    tap(byTestId('slot-1'));
    buildChord('F', '', '7');
    // Back to the first and change it.
    tap(byTestId('slot-0'));
    tap(byTestId('letter-D'));
    expect(byTestId('slot-0')!.textContent).toBe('Dm7');
  });

  it('sets the root from a tap on the keyboard, spelled by the key', () => {
    // The key of B♭ major is a flat key, so one black key is B♭ and
    // never A♯.
    mount();
    tap(q('rect[data-midi="58"]'));
    expect(byTestId('slot-0')!.textContent).toBe('B♭');
  });
});

describe('nothing sounds until it is tapped', () => {
  it('plays nothing on mount', () => {
    mount();
    expect(played.seq).toHaveLength(0);
    expect(played.blocked).toBe(0);
  });

  it('plays nothing when a note or a quality is tapped', () => {
    mount();
    buildChord('C', '', 'm7');
    tap(q('rect[data-midi="60"]'));
    expect(played.seq).toHaveLength(0);
  });

  it('plays nothing on Submit', () => {
    mount();
    buildChord('C', '', 'm7');
    tap(byTestId('slot-1'));
    buildChord('F', '', '7');
    tap(byTestId('slot-2'));
    buildChord('B', 'flat', 'maj7');
    tap(byTestId('submit'));
    expect(played.seq).toHaveLength(0);
  });

  it('plays one chord from Hear chord, and the sequence from Hear all', () => {
    mount();
    buildChord('C', '', 'm7');
    tap(byTestId('hear-chord'));
    expect(played.seq).toHaveLength(1);
    expect(played.seq[0]).toHaveLength(1);
    tap(byTestId('slot-1'));
    buildChord('F', '', '7');
    tap(byTestId('slot-2'));
    buildChord('B', 'flat', 'maj7');
    tap(byTestId('hear-all'));
    // The orienting low tonic, then the three chords.
    expect(played.seq[1]).toHaveLength(4);
  });

  it('will not hear all until every slot is filled', () => {
    mount();
    buildChord('C', '', 'm7');
    expect((byTestId('hear-all') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the reveal is the card\'s progression', () => {
  it('reads the card\'s chords in the slots, not the reader\'s', () => {
    mount(true);
    expect(all('[data-testid^="slot-"]').map(s => s.textContent))
      .toEqual(['Cm7', 'F7', 'B♭maj7']);
  });

  it('offers the player, and no picker rows', () => {
    mount(true);
    expect(byTestId('play-it-panel')).not.toBeNull();
    expect(byTestId('quality-row')).toBeNull();
    expect(byTestId('letter-row')).toBeNull();
    expect(byTestId('submit')).toBeNull();
  });

  it('changes the chord names with the thickness, one rung at a time', () => {
    mount(true);
    expect(byTestId('play-it-names')!.textContent).toBe('Cm7 - F7 - B♭maj7');
    tap(byTestId('thickness-triads'));
    expect(byTestId('play-it-names')!.textContent).toBe('Cm - F - B♭');
    tap(byTestId('thickness-full'));
    expect(byTestId('play-it-names')!.textContent).toBe('Cm9 - F9 - B♭maj9');
    tap(byTestId('thickness-bass'));
    expect(byTestId('play-it-names')!.textContent).toBe('C - F - B♭');
  });

  it('still plays nothing until Hear it is tapped', () => {
    mount(true);
    expect(played.seq).toHaveLength(0);
    tap(byTestId('thickness-triads'));
    expect(played.seq).toHaveLength(0);
    tap(byTestId('play-it-hear'));
    expect(played.seq).toHaveLength(1);
  });
});
