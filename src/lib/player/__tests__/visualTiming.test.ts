// @vitest-environment jsdom
/**
 * The Visual timing dial moves the repaint, and it moves it the right way.
 *
 * =====================================================================
 * THE CASE THAT MADE IT: HEADPHONES THAT REPORT NO DELAY.
 *
 * On Silas's headphones `outputLatency` reads 0, so the law that holds
 * each repaint by the reported delay holds it by nothing, and the tonic
 * lights well before it sounds. The dial is his correction, and the
 * prototype's formula is `now = currentTime + offset/1000 − latency`: a
 * NEGATIVE value delays the paint. So the fixture is a context reporting
 * zero and a dial at −250, and the paint must land 250 ms after the
 * step was scheduled — not at it, and not 250 ms before it.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A context whose clock is the fake timers' clock. */
function fakeAudio(latency: { output?: number; base?: number } = {}) {
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
    type: 'sine',
    start() {},
    stop() {},
  });
  const base = Date.now();
  const context = {
    get currentTime() { return (Date.now() - base) / 1000; },
    outputLatency: latency.output ?? 0,
    baseLatency: latency.base ?? 0,
    state: 'running',
    destination: {},
    resume: () => Promise.resolve(),
    createBuffer: () => ({}),
    createBufferSource: () => ({ buffer: null, connect() {}, start() {} }),
    createGain: () => node(),
    createOscillator: () => node(),
  };
  vi.stubGlobal('AudioContext', function AC() { return context; });
  return context;
}

/**
 * A fresh registry, so the stubbed context and a fresh dial cache are
 * the ones in use. The dial is read from storage on first ask, which is
 * how a device that set it yesterday gets it back today.
 */
async function load(latency: { output?: number; base?: number } = {}) {
  vi.resetModules();
  const context = fakeAudio(latency);
  const audio = await import('../../audio');
  const dial = await import('../visualTiming');
  return { context, play: audio.playSeqChords, dial };
}

/** The step is scheduled this far after `play` is called. */
const SCHEDULED_AT = 0.05;
/** One frame, the granularity the paint loop checks at. */
const FRAME = 0.017;

/** Play one chord and report the audio time its paint fired at. */
async function paintMoment(
  env: Awaited<ReturnType<typeof load>>,
  ms = 1000,
): Promise<number | null> {
  let paintedAt: number | null = null;
  await env.play([{ intervals: [0, 4, 7], beats: 1 }], 60, 60, {
    onStep: () => { paintedAt ??= env.context.currentTime; },
  });
  await vi.advanceTimersByTimeAsync(ms);
  return paintedAt;
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('the dial on a device that reports no delay', () => {
  it('at −250, paints 250 ms after the step was scheduled', async () => {
    window.localStorage.setItem('playerVisualTiming', '-250');
    const env = await load({ output: 0, base: 0 });
    const at = await paintMoment(env);
    expect(at).not.toBeNull();
    const late = at! - SCHEDULED_AT;
    expect(late).toBeGreaterThanOrEqual(0.25 - 0.005);
    expect(late).toBeLessThanOrEqual(0.25 + FRAME);
  });

  it('at −250, has not painted 200 ms after the schedule time', async () => {
    window.localStorage.setItem('playerVisualTiming', '-250');
    const env = await load({ output: 0, base: 0 });
    const onStep = vi.fn();
    await env.play([{ intervals: [0, 4, 7], beats: 1 }], 60, 60, { onStep });
    await vi.advanceTimersByTimeAsync((SCHEDULED_AT + 0.2) * 1000);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('at 0, paints on the schedule time, as it did before the dial', async () => {
    // GUARD THE GUARD: the −250 cases above are late BECAUSE of the
    // dial, not because this fixture paints late anyway.
    const env = await load({ output: 0, base: 0 });
    const late = (await paintMoment(env))! - SCHEDULED_AT;
    expect(late).toBeGreaterThanOrEqual(-0.005);
    expect(late).toBeLessThanOrEqual(FRAME);
  });
});

describe('the dial on top of the reported delay', () => {
  it('a positive value brings a Bluetooth hold forward', async () => {
    // 200 ms reported, dial +100: the paint is held 100 ms, not 200.
    window.localStorage.setItem('playerVisualTiming', '100');
    const env = await load({ output: 0.18, base: 0.02 });
    const late = (await paintMoment(env))! - SCHEDULED_AT;
    expect(late).toBeGreaterThanOrEqual(0.1 - 0.005);
    expect(late).toBeLessThanOrEqual(0.1 + FRAME);
  });

  it('moving the dial while a sequence plays moves the next repaint', async () => {
    const env = await load({ output: 0, base: 0 });
    env.dial.writeVisualTiming(-600);
    const late = (await paintMoment(env))! - SCHEDULED_AT;
    expect(late).toBeGreaterThanOrEqual(0.6 - 0.005);
    expect(late).toBeLessThanOrEqual(0.6 + FRAME);
  });
});

describe('what the dial can hold, and where it is kept', () => {
  it('runs −600 to +600 in 10 ms steps', async () => {
    const { dial } = await load();
    expect(dial.clampVisualTiming(-900)).toBe(-600);
    expect(dial.clampVisualTiming(900)).toBe(600);
    expect(dial.clampVisualTiming(-253)).toBe(-250);
    expect(dial.clampVisualTiming(Number.NaN)).toBe(0);
  });

  it('is remembered on the device, in localStorage', async () => {
    const { dial } = await load();
    dial.writeVisualTiming(-250);
    expect(window.localStorage.getItem('playerVisualTiming')).toBe('-250');
  });

  it('opens at zero on a device that never set it', async () => {
    const { dial } = await load();
    expect(dial.readVisualTiming()).toBe(0);
  });
});
