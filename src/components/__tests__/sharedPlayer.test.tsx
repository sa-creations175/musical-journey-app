// @vitest-environment jsdom
/**
 * The panel's own two rules: nothing autoplays, and Pause is not Stop.
 *
 * =====================================================================
 * NOTHING AUTOPLAYS, AND A GREP IS THE RIGHT TOOL FOR HALF OF IT.
 *
 * A render that happens to be silent proves nothing about the next
 * effect somebody adds. So this checks both: the panel mounted and left
 * alone makes no sound, AND the component's source contains no effect
 * that starts one. The second is what fails the day the rule is
 * relaxed for convenience.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import playerSrc from '../SharedPlayer.tsx?raw';

/** Every call the engine was asked to make. */
const calls: Array<{ bpm: number; opts: Record<string, unknown> }> = [];
let stops = 0;

vi.mock('../../lib/audio', () => ({
  playSeqChords: (
    _chords: unknown, _root: number, bpm: number, opts: Record<string, unknown>,
  ) => {
    calls.push({ bpm, opts });
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

const CHORDS = [
  { hand: [60, 64, 67], bass: 48, rootPc: 0, name: 'Cmaj7' },
  { hand: [59, 62, 65], bass: 43, rootPc: 7, name: 'G7' },
];

function mount(props: Record<string, unknown> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <InstrumentProvider>
        <SharedPlayer
          chords={CHORDS}
          orientPc={0}
          settings={DEFAULT_PLAYER_SETTINGS}
          onSettings={() => {}}
          {...props}
        />
      </InstrumentProvider>,
    );
  });
}

const byTestId = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const tap = (el: HTMLElement | null) => act(() => { el?.click(); });
/** Tap and let the player's promise resolve, so the handle is held. */
const tapAndSettle = async (el: HTMLElement | null) => {
  await act(async () => { el?.click(); await Promise.resolve(); });
};

beforeEach(() => { calls.length = 0; stops = 0; });
afterEach(() => { act(() => { root.unmount(); }); host.remove(); });

describe('nothing autoplays', () => {
  it('makes no sound on mount', () => {
    mount();
    expect(calls).toHaveLength(0);
  });

  it('has no effect in its source that starts audio', () => {
    // THE GREP IS THE REAL GUARD. `useEffect` appears in the file — it
    // stops what is sounding on unmount — and none of them may START
    // anything. Every play in this component hangs off a click.
    const effects = playerSrc.match(/useEffect\([\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
    for (const effect of effects) {
      expect(effect, effect).not.toMatch(/playPanel|\bplay\(/);
    }
  });

  it('sounds when Hear it is tapped, and not before', () => {
    mount();
    expect(calls).toHaveLength(0);
    tap(byTestId('player-hear'));
    expect(calls).toHaveLength(1);
  });
});

describe('Pause stops where it is and Resume picks up from there', () => {
  it('starts at the top on Hear it', () => {
    mount();
    tap(byTestId('player-hear'));
    expect(calls[0].opts.startAtBeat).toBeUndefined();
  });

  it('resumes with a beat offset rather than from the top', async () => {
    vi.useFakeTimers();
    try {
      mount();
      await tapAndSettle(byTestId('player-hear'));
      // Two seconds at 50 bpm is a beat and two thirds.
      vi.setSystemTime(Date.now() + 2000);
      tap(byTestId('player-pause'));
      expect(byTestId('player-pause')!.textContent).toBe('Resume');
      // WHAT WAS SOUNDING IS STOPPED. Pause is not a mute: the notes
      // already scheduled have to go, or Resume would play over them.
      expect(stops).toBeGreaterThan(0);
      tap(byTestId('player-pause'));
      expect(calls).toHaveLength(2);
      const at = calls[1].opts.startAtBeat as number;
      expect(at).toBeGreaterThan(1);
      expect(at).toBeLessThan(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts over on Hear it even after a pause', async () => {
    vi.useFakeTimers();
    try {
      mount();
      await tapAndSettle(byTestId('player-hear'));
      vi.setSystemTime(Date.now() + 2000);
      tap(byTestId('player-pause'));
      tap(byTestId('player-hear'));
      expect(calls[1].opts.startAtBeat).toBeUndefined();
      expect(byTestId('player-pause')!.textContent).toBe('Pause');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cannot be paused before anything is playing', () => {
    mount();
    expect((byTestId('player-pause') as HTMLButtonElement).disabled).toBe(true);
  });

  it('says what Pause and Resume do, on the screen', async () => {
    vi.useFakeTimers();
    try {
      mount();
      await tapAndSettle(byTestId('player-hear'));
      tap(byTestId('player-pause'));
      expect(byTestId('player-paused-note')!.textContent)
        .toContain('Resume picks up from here; Hear it starts over.');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the caller can take every control away', () => {
  it('shows nothing of its own when controls are off', () => {
    // A quiz before the answer drives the sound from its own Play
    // button; a panel offering a second one would let a reader hear the
    // answer laid out beside the question.
    mount({ controls: false, board: false });
    expect(byTestId('player-hear')).toBeNull();
    expect(byTestId('player-settings')).toBeNull();
    expect(byTestId('thickness-triads')).toBeNull();
    expect(byTestId('hear-one-0')).toBeNull();
  });

  it('hides the board when it is told to', () => {
    mount({ board: false });
    expect(byTestId('built-answer-keyboard')).toBeNull();
  });

  it('draws its own board otherwise, four octaves with the Cs named', () => {
    mount();
    const labels = [...host.querySelectorAll('[data-testid^="key-label-"]')]
      .map(t => t.textContent);
    expect(labels).toEqual(['C2', 'C3', 'C4', 'C5', 'C6']);
  });
});

describe('the rows a surface may drop', () => {
  it('hides Hands and Listen to where there is no bass to separate', () => {
    mount({ chords: [{ hand: [60, 64, 67], bass: null, rootPc: 0, name: 'C' }] });
    expect(byTestId('hands-rootless')).toBeNull();
    expect(byTestId('listen-both')).toBeNull();
  });

  it('shows them where there is', () => {
    mount();
    expect(byTestId('hands-rootless')).not.toBeNull();
    // TWO RIGHT-HAND VOICINGS, never one hand alone.
    expect(byTestId('hands-rootless')!.textContent).toBe('Rootless right hand');
    expect(byTestId('hands-root')!.textContent).toBe('Root in the right hand');
    expect(host.textContent).not.toContain('One, root in the chord');
    expect(byTestId('listen-bass')).not.toBeNull();
  });

  it('ends Settings with Play as, on every surface', () => {
    // SILAS'S RULING OF 12 SEP 2026, placed on 13 Sep: one row, every
    // surface, in the spot Chord sounds had.
    mount();
    expect([...byTestId('play-as-chips')!.children].map(c => c.textContent))
      .toEqual(['Together', 'Up', 'Down', 'Up and Down']);
    const fold = byTestId('player-settings')!.querySelector('.space-y-3')!;
    expect(fold.lastElementChild).toBe(byTestId('play-as-row'));
    expect(host.textContent).not.toContain('Chord sounds');
    expect(byTestId('play-as-together')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('says a run is an aid only where the surface says so', () => {
    mount();
    expect(byTestId('play-as-aid-note')).toBeNull();
    act(() => { root.unmount(); });
    host.remove();
    mount({ playAsIsAid: true });
    expect(byTestId('play-as-aid-note')!.textContent).toBe(
      'Listening modes matter: Up, Down, and Up and Down are an aid, with a lower rating.',
    );
  });

  it('leaves the row out where the surface draws it in a place of its own', () => {
    mount({ playAsRow: false });
    expect(byTestId('play-as-row')).toBeNull();
  });

  it('puts Bass directly under Listen to, on every surface with a bass', () => {
    // FREE, NOT AN AID, and it sits with the other "how do I want to
    // hear this" rows rather than in the aids fold.
    mount();
    expect(byTestId('bass-forward')).not.toBeNull();
    expect(byTestId('bass-blended')).not.toBeNull();
    const listen = byTestId('listen-both')!.closest('.space-y-1\\.5');
    const bass = byTestId('bass-forward')!.closest('.space-y-1\\.5');
    expect(listen!.nextElementSibling).toBe(bass);
  });

  it('hands a run to the player when Up is chosen', async () => {
    // THE ROW DOES SOMETHING, not only draws. A progression's chords
    // each carry their run inside their own bar.
    let settings = DEFAULT_PLAYER_SETTINGS;
    mount({ onSettings: (next: typeof settings) => { settings = next; } });
    tap(byTestId('play-as-up'));
    expect(settings.playAs).toBe('up');
  });

  it('locks the ladder to one rung beside a drill', () => {
    mount({
      thickness: { value: 'seventh', onChange: () => {}, locked: true },
    });
    expect((byTestId('thickness-seventh') as HTMLButtonElement).disabled).toBe(false);
    expect((byTestId('thickness-triads') as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers no Bass only rung on the ladder', () => {
    mount({ thickness: { value: 'seventh', onChange: () => {} } });
    expect(byTestId('thickness-bass')).toBeNull();
    expect(byTestId('listen-bass')).not.toBeNull();
  });
});

describe('one chord at a time', () => {
  it('gives every chord a chip that plays it alone', () => {
    mount();
    expect(byTestId('hear-one-0')!.textContent).toBe('Cmaj7');
    expect(byTestId('hear-one-1')!.textContent).toBe('G7');
    tap(byTestId('hear-one-1'));
    expect(calls).toHaveLength(1);
    // ONE CHORD, NO TONIC IN FRONT OF IT. The lead-in orients a
    // progression; a single chord has nothing to be oriented against.
    expect(calls[0].opts.loop).toBe(1);
  });
});

describe('Visual timing, in the panel’s Settings', () => {
  afterEach(() => { window.localStorage.removeItem('playerVisualTiming'); });

  it('is a dial from −600 to +600 ms in 10 ms steps, inside Settings', () => {
    mount();
    const dial = byTestId('visual-timing') as HTMLInputElement;
    expect(dial).not.toBeNull();
    expect(dial.closest('[data-testid="player-settings"]')).not.toBeNull();
    expect([dial.min, dial.max, dial.step]).toEqual(['-600', '600', '10']);
    expect(byTestId('visual-timing-value')!.textContent).toBe('0');
  });

  it('remembers a move on the device, and shows it', () => {
    mount();
    const dial = byTestId('visual-timing') as HTMLInputElement;
    // React listens for `input`; set the value the way a drag would.
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value',
    )!.set!;
    act(() => {
      setter.call(dial, '-250');
      dial.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(window.localStorage.getItem('playerVisualTiming')).toBe('-250');
    expect(byTestId('visual-timing-value')!.textContent).toBe('-250');
  });
});

describe('Visual timing says which way to slide', () => {
  it('carries Silas’s sentence under the dial', () => {
    mount();
    expect(byTestId('visual-timing-help')!.textContent).toBe(
      'If the keys light up before you hear the chord, slide left until they match. '
      + 'If they light up after, slide right.',
    );
  });

  it('keeps the sentence true: left is negative, and negative delays the repaint', async () => {
    mount();
    const dial = byTestId('visual-timing') as HTMLInputElement;
    // A range input's left end is its min.
    expect(Number(dial.min)).toBeLessThan(0);
    expect(Number(dial.max)).toBeGreaterThan(0);
    // And negative holds the paint back: the paint loop's own hold is
    // the reported latency MINUS the dial, so −250 adds 250 ms. The
    // timing itself is proved against a fake clock in visualTiming.test.
    const { visualTimingSeconds, writeVisualTiming } = await import('../../lib/player/visualTiming');
    writeVisualTiming(-250);
    expect(0 - visualTimingSeconds()).toBeCloseTo(0.25);
    writeVisualTiming(0);
  });
});
