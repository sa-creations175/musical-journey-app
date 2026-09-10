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
    expect(byTestId('hands-both')).toBeNull();
    expect(byTestId('listen-both')).toBeNull();
  });

  it('shows them where there is', () => {
    mount();
    expect(byTestId('hands-both')).not.toBeNull();
    expect(byTestId('listen-bass')).not.toBeNull();
  });

  it('adds Chord sounds only where a surface asks for it', () => {
    mount();
    expect(byTestId('attack-blocked')).toBeNull();
    act(() => { root.unmount(); });
    host.remove();
    mount({ attack: { value: 'blocked', onChange: () => {} } });
    expect(byTestId('attack-blocked')).not.toBeNull();
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
