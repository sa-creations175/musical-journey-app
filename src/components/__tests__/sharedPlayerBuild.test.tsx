// @vitest-environment jsdom
/**
 * Building a chord by hand on the shared board: Silas's spec of 12 Sep
 * 2026, §5, and his answer of 14 Sep on a board with more than one chord.
 *
 * WHAT PLAYS IS READ FROM THE ENGINE'S OWN ARGUMENTS, so "Hear it plays
 * exactly what is lit" is checked against the notes the sequencer was
 * handed, not against a second copy of the rule.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const calls: Array<{ chords: Array<{ intervals: number[] }> }> = [];
let stops = 0;

vi.mock('../../lib/audio', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/audio')>()),
  playSeqChords: (chords: Array<{ intervals: number[] }>) => {
    calls.push({ chords });
    return Promise.resolve({ stop: () => { stops += 1; } });
  },
  setInstrument: () => {},
}));
vi.mock('../../lib/musicalPlayback', () => ({
  playBlocked: () => Promise.resolve({ stop: () => {} }),
}));
vi.mock('../../lib/userPrefs', () => ({
  getPref: (_k: string, d: unknown) => Promise.resolve(d),
  setPref: () => Promise.resolve(),
}));

const SharedPlayer = (await import('../SharedPlayer')).default;
const { InstrumentProvider } = await import('../../lib/instrumentContext');
const { DEFAULT_PLAYER_SETTINGS } = await import('../../lib/player/settings');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

/** Cmaj7: C under E G B. Forward and C2 to G3 put the bass on C2 (36). */
const CMAJ7 = { hand: [64, 67, 71], bass: 48, rootPc: 0, name: 'Cmaj7' };
const TWO = [CMAJ7, { hand: [65, 69, 72], bass: 53, rootPc: 5, name: 'Fmaj7' }];

function mount(props: Record<string, unknown> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <InstrumentProvider>
        <SharedPlayer
          chords={[CMAJ7]}
          settings={DEFAULT_PLAYER_SETTINGS}
          onSettings={() => {}}
          {...props}
        />
      </InstrumentProvider>,
    );
  });
}

const byTestId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const key = (midi: number) => host.querySelector<SVGRectElement>(`rect[data-midi="${midi}"]`)!;
const tap = (el: Element | null) => act(() => {
  el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
const lit = () => [...host.querySelectorAll('rect[data-mark="marked"]')]
  .map(r => Number(r.getAttribute('data-midi')));
const ringedKeys = () => [...host.querySelectorAll('[data-testid^="selection-ring-"]')]
  .map(r => Number(r.getAttribute('data-testid')!.replace('selection-ring-', '')));

beforeEach(() => { calls.length = 0; stops = 0; });
afterEach(() => { act(() => { root.unmount(); }); host.remove(); });

describe('any key can be lit or unlit (Tap again)', () => {
  it('a tap lights a key, and what plays is exactly what is lit', () => {
    mount();
    expect(lit()).toEqual([36, 64, 67, 71]);
    tap(key(74));
    expect(lit()).toEqual([36, 64, 67, 71, 74]);
    expect(calls).toHaveLength(1);
    expect(calls[0].chords[0].intervals).toEqual([36, 64, 67, 71, 74]);
  });

  it('no rule moves a note that was lit by hand: the register leaves its bass where it is', () => {
    // ON C1 TO G2, Forward puts the card's C3 bass on C2. Lit by hand,
    // that C2 stays C2 — a second pass of the register would take it to
    // C1, which is not what the board shows.
    mount({ settings: { ...DEFAULT_PLAYER_SETTINGS, bassRegister: 'c1' } });
    expect(lit()).toEqual([36, 64, 67, 71]);
    tap(key(74));
    expect(calls[0].chords[0].intervals[0]).toBe(36);
    expect(lit()).toEqual([36, 64, 67, 71, 74]);
  });

  it('a lit key tapped gets a ring and nothing sounds; tapped again it unlights', () => {
    mount();
    tap(key(71));
    expect(ringedKeys()).toEqual([71]);
    expect(calls).toHaveLength(0);
    tap(key(71));
    expect(lit()).toEqual([36, 64, 67]);
    expect(ringedKeys()).toEqual([]);
  });

  it('names the reader\'s other readings under the transport', () => {
    mount({ chords: [{ ...CMAJ7, bass: null }] });
    tap(key(74));
    expect(byTestId('player-also')!.textContent).toBe('also: G6/E · Cmaj9 rootless');
  });
});

describe('↓ octave, ↑ octave, Undo and Clear rings', () => {
  it('↓ octave moves the ringed note, the ring goes with it, and Undo steps back', () => {
    mount();
    tap(key(71));
    tap(byTestId('player-octave-down'));
    expect(lit()).toEqual([36, 59, 64, 67]);
    expect(ringedKeys()).toEqual([59]);
    tap(byTestId('player-undo'));
    expect(lit()).toEqual([36, 64, 67, 71]);
    expect(ringedKeys()).toEqual([71]);
    tap(byTestId('player-undo'));
    expect(ringedKeys()).toEqual([]);
    expect((byTestId('player-undo') as HTMLButtonElement).disabled).toBe(true);
  });

  it('with nothing ringed moves every lit note, and drops one that leaves the board', () => {
    mount();
    tap(byTestId('player-octave-down'));
    // C2 would fall to C1, under the board's F1, and goes.
    expect(lit()).toEqual([52, 55, 59]);
  });

  it('Clear rings, and a tap on empty space in the panel, drop every ring', () => {
    mount();
    tap(key(71));
    tap(key(67));
    expect(ringedKeys()).toEqual([67, 71]);
    tap(byTestId('player-clear-rings'));
    expect(ringedKeys()).toEqual([]);
    tap(key(71));
    tap(byTestId('shared-player'));
    expect(ringedKeys()).toEqual([]);
    expect(lit()).toEqual([36, 64, 67, 71]);
  });
});

describe('Select notes by', () => {
  it('opens on Tap again', () => {
    mount();
    expect(byTestId('select-by-tap')!.getAttribute('aria-pressed')).toBe('true');
    expect(byTestId('select-by-hold')!.textContent).toBe('Press and hold');
  });

  it('Press and hold: a tap unlights, and holding a lit key rings it', () => {
    vi.useFakeTimers();
    try {
      mount({ settings: { ...DEFAULT_PLAYER_SETTINGS, selectNotesBy: 'hold' } });
      act(() => { key(71).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
      act(() => { vi.advanceTimersByTime(450); });
      act(() => { key(71).dispatchEvent(new MouseEvent('pointerup', { bubbles: true })); });
      // The tap that ends a hold is not also a tap.
      tap(key(71));
      expect(ringedKeys()).toEqual([71]);
      expect(lit()).toContain(71);
      tap(key(67));
      expect(lit()).not.toContain(67);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a board with more than one chord (Silas, 14 Sep 2026)', () => {
  it('a tap stops what is playing and edits the chord the board shows, without playing', async () => {
    mount({ chords: TWO });
    await act(async () => { byTestId('player-hear')!.click(); await Promise.resolve(); });
    expect(calls).toHaveLength(1);
    tap(key(74));
    expect(stops).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
    expect(byTestId('hear-one-0')!.textContent).toBe('Cmaj9');
    expect(byTestId('hear-one-1')!.textContent).toBe('Fmaj7');
  });
});

describe('where the board is not the panel\'s', () => {
  it('a surface with its own board has no building by hand', () => {
    mount({ board: <div /> });
    expect(byTestId('player-octave-down')).toBeNull();
    expect(byTestId('select-by-tap')).toBeNull();
  });

  it('nor does a quiz before the answer, whose board is hidden', () => {
    mount({ board: false });
    expect(byTestId('player-undo')).toBeNull();
  });
});
