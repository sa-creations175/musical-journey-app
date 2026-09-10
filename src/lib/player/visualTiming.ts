/**
 * Visual timing: how far to hold the board's repaints, by hand.
 *
 * =====================================================================
 * FOR THE HEADPHONES THE BROWSER CANNOT SEE.
 *
 * The player already holds every repaint by the delay the browser
 * reports (`outputLatency + baseLatency`), so on most Bluetooth
 * headphones the keys change when the sound arrives. Some headphones
 * report nothing: Silas's read 0, and on his machine the tonic lights
 * well before it sounds and each chord repaints before it is heard. The
 * law cannot help when the number it reads is zero, so this dial is the
 * reader's own correction on top of it.
 *
 * THE PROTOTYPE'S FORMULA, EXACTLY:
 *
 *   now = currentTime + visualOffset/1000 − (outputLatency + baseLatency)
 *
 * and a step paints once `now` reaches its scheduled time. So a NEGATIVE
 * value delays the repaint — at −250 a step paints 250 ms after it was
 * scheduled, on a device reporting no delay — and a positive one brings
 * it forward.
 *
 * =====================================================================
 * PER DEVICE, NOT PER ACCOUNT. It is a property of the headphones, not
 * of the reader: the same person on a wired laptop and on Bluetooth
 * needs two different numbers. So `localStorage`, the line the
 * Settings fold and the legend fold already draw.
 *
 * FREE, NOT AN AID. It moves the lights, not the question.
 * =====================================================================
 */

/** The dial's range and step, in milliseconds. */
export const VISUAL_TIMING_MIN = -600;
export const VISUAL_TIMING_MAX = 600;
export const VISUAL_TIMING_STEP = 10;

const KEY = 'playerVisualTiming';

/** A value the dial can hold: in range, on a 10 ms step. */
export function clampVisualTiming(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  const stepped = Math.round(ms / VISUAL_TIMING_STEP) * VISUAL_TIMING_STEP;
  return Math.max(VISUAL_TIMING_MIN, Math.min(VISUAL_TIMING_MAX, stepped));
}

/**
 * HELD IN MEMORY AS WELL AS STORED, because the paint loop reads it on
 * every animation frame and a storage read sixty times a second is a
 * cost for nothing. Read from storage once, on first ask; every write
 * goes to both.
 */
let cached: number | null = null;

export function readVisualTiming(): number {
  if (cached !== null) return cached;
  try {
    const raw = window.localStorage.getItem(KEY);
    cached = raw === null ? 0 : clampVisualTiming(Number(raw));
  } catch {
    cached = 0;
  }
  return cached;
}

export function writeVisualTiming(ms: number): void {
  cached = clampVisualTiming(ms);
  try {
    window.localStorage.setItem(KEY, String(cached));
  } catch {
    // A browser that will not store it keeps the value for this visit
    // and opens at zero next time — the behaviour before the dial.
  }
}

/**
 * The dial in seconds, for the paint loop. Zero where there is no
 * window to ask — a render on the server, a test with no DOM.
 */
export function visualTimingSeconds(): number {
  if (typeof window === 'undefined') return 0;
  return readVisualTiming() / 1000;
}
