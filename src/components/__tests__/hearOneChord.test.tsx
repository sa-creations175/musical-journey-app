// @vitest-environment jsdom
/**
 * "Hear one chord" lights through the paint loop, so the dial holds there.
 *
 * =====================================================================
 * THE CHIP USED TO PAINT ON THE TAP.
 *
 * Hear it scheduled each chord and lit it when the audio clock got
 * there, held by the reported delay and the Visual timing dial. The
 * chord chip set the board the moment it was tapped and played after,
 * so on headphones that lag, the keys changed before the chord sounded
 * — whatever the dial said. This renders the real panel over the real
 * sequencer, with only the audio context faked, and times the paint.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

/** A context reporting NO delay, whose clock is the fake timers' clock. */
function fakeContext() {
  const param = () => ({
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
    value: 0,
  });
  const node = () => ({
    connect(next: unknown) { return next; },
    gain: param(),
    frequency: param(),
    detune: param(),
    type: 'sine',
    start() {},
    stop() {},
  });
  const base = Date.now();
  return {
    get currentTime() { return (Date.now() - base) / 1000; },
    outputLatency: 0,
    baseLatency: 0,
    state: 'running',
    sampleRate: 44100,
    destination: {},
    resume: () => Promise.resolve(),
    createBuffer: () => ({}),
    createBufferSource: () => ({ buffer: null, connect() {}, start() {} }),
    createGain: () => node(),
    createOscillator: () => node(),
    createBiquadFilter: () => node(),
  };
}

const context = fakeContext();
vi.stubGlobal('AudioContext', function AC() { return context; });

vi.mock('../../lib/userPrefs', () => ({
  getPref: (_k: string, d: unknown) => Promise.resolve(d),
  setPref: () => Promise.resolve(),
}));

const SharedPlayer = (await import('../SharedPlayer')).default;
const { InstrumentProvider } = await import('../../lib/instrumentContext');
const { DEFAULT_PLAYER_SETTINGS } = await import('../../lib/player/settings');
const { writeVisualTiming } = await import('../../lib/player/visualTiming');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const CHORDS = [
  { hand: [60, 64, 67], bass: 48, rootPc: 0, name: 'Cmaj7' },
  { hand: [59, 62, 65], bass: 43, rootPc: 7, name: 'G7' },
];

/** `playSeqChords` schedules its first step this far after the tap. */
const SCHEDULED_AT = 0.05;
const FRAME = 0.017;

let host: HTMLElement;
let root: Root;

async function mount(onStep: (i: number) => void) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <InstrumentProvider>
        <SharedPlayer
          chords={CHORDS}
          orientPc={0}
          settings={DEFAULT_PLAYER_SETTINGS}
          onSettings={() => {}}
          onStep={onStep}
        />
      </InstrumentProvider>,
    );
  });
}

const chip = (i: number) => host.querySelector<HTMLElement>(`[data-testid="hear-one-${i}"]`)!;

/** Tap chip 1 and report how long after the schedule time it lit. */
async function lateness(): Promise<{ late: number | null; litAtTap: string | null }> {
  let paintedAt: number | null = null;
  await mount(i => { if (i === 1) paintedAt ??= context.currentTime; });
  const tappedAt = context.currentTime;
  await act(async () => { chip(1).click(); });
  const litAtTap = chip(1).getAttribute('aria-pressed');
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  return {
    late: paintedAt === null ? null : paintedAt - tappedAt - SCHEDULED_AT,
    litAtTap,
  };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  writeVisualTiming(0);
});

describe('a chord chip, on a device that reports no delay', () => {
  it('at −250, paints 250 ms after the schedule time', async () => {
    writeVisualTiming(-250);
    const { late, litAtTap } = await lateness();
    // Not on the tap: the old chip lit here, before a note had sounded.
    expect(litAtTap).toBe('false');
    expect(late).not.toBeNull();
    expect(late!).toBeGreaterThanOrEqual(0.25 - 0.005);
    expect(late!).toBeLessThanOrEqual(0.25 + FRAME);
    expect(chip(1).getAttribute('aria-pressed')).toBe('true');
  });

  it('at 0, paints on the schedule time', async () => {
    // Guard the guard: the case above is late because of the dial.
    const { late } = await lateness();
    expect(late!).toBeGreaterThanOrEqual(-0.005);
    expect(late!).toBeLessThanOrEqual(FRAME);
  });
});
