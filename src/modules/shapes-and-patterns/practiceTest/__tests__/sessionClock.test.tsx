// @vitest-environment jsdom
/**
 * The session clock, and the one surface whose clock outlives it.
 *
 * A drill session begins when the panel opens and ends when it closes,
 * so a ref is exactly as durable as the thing it measures. A song
 * session is a persisted record that survives navigation, reload and a
 * paused afternoon — counting it from mount would show a session that
 * had restarted, while the record that actually gets logged said
 * otherwise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { formatClock, useSessionClock } from '../sessionClock';

function render(running: boolean, reader?: (() => number) | null) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let seen = -1;
  function Probe() {
    seen = useSessionClock(running, reader);
    return null;
  }
  act(() => { root.render(<Probe />); });
  return {
    get seconds() { return seen; },
    tick(ms: number) { act(() => { vi.advanceTimersByTime(ms); }); },
    unmount() { act(() => { root.unmount(); }); container.remove(); },
  };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('without a reader — the clock it owns', () => {
  it('counts from mount', () => {
    const h = render(true);
    h.tick(3_000);
    expect(h.seconds).toBe(3);
    h.unmount();
  });

  it('does not run before a mode is picked', () => {
    const h = render(false);
    h.tick(3_000);
    expect(h.seconds).toBe(0);
    h.unmount();
  });
});

describe('with a reader — the clock the surface owns', () => {
  it('reports what the reader says, not time since mount', () => {
    // Two hours already on the record. Mount adds nothing to it.
    const h = render(true, () => 2 * 60 * 60 * 1000);
    expect(h.seconds).toBe(7200);
    h.unmount();
  });

  it('shows the stored value IMMEDIATELY, not after the first tick', () => {
    // A quarter second of 00:00 on a session that is hours old reads as
    // a session that restarted.
    const h = render(true, () => 90_000);
    expect(h.seconds).toBe(90);
    h.unmount();
  });

  it('follows the reader as it moves', () => {
    let ms = 60_000;
    const h = render(true, () => ms);
    expect(h.seconds).toBe(60);
    ms = 125_000;
    h.tick(250);
    expect(h.seconds).toBe(125);
    h.unmount();
  });

  it('a paused record holds its value while the clock keeps ticking', () => {
    // The record stops accruing; the interval does not stop running.
    // The number must come from the record either way.
    const h = render(true, () => 45_000);
    h.tick(5_000);
    expect(h.seconds).toBe(45);
    h.unmount();
  });

  it('ignores time since mount entirely', () => {
    const h = render(true, () => 10_000);
    h.tick(60_000);
    // Sixty seconds of wall clock, and the record still says ten.
    expect(h.seconds).toBe(10);
    h.unmount();
  });
});

describe('formatClock', () => {
  it('adds the hour only once there is one', () => {
    expect(formatClock(59)).toBe('00:59');
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(3600)).toBe('1:00:00');
    // The shape a stuck song clock would have shown.
    expect(formatClock(124 * 3600)).toBe('124:00:00');
  });
});
