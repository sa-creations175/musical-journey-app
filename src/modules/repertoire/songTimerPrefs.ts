import { getPref, setPref } from '../../lib/userPrefs';

/**
 * How long the app can see nothing before the song timer goes amber.
 *
 * ---------------------------------------------------------------
 * A SETTING, NOT A CONSTANT, AND IT SHIPS WITH THE FEATURE.
 *
 * At five minutes the return question may fire on almost every
 * session — someone practising at a keyboard touches the device
 * rarely, and forty minutes of real work looks exactly like forty
 * minutes of absence. The fix for that is raising the threshold, not
 * learning to dismiss the question. Which only works if the control
 * exists on day one; shipping the prompt first and the dial later
 * would mean weeks of training yourself to ignore it.
 * ---------------------------------------------------------------
 *
 * In `userPrefs` (Dexie, synced) rather than localStorage, unlike the
 * timer record itself. This is a preference and belongs on every
 * device; the running timer is device state and must not replicate.
 */
export const PREF_SONG_TIMER_AMBER_MIN = 'songTimerAmberMinutes';

export const AMBER_DEFAULT_MIN = 5;

/** Offered choices. `null` is "never" — an escape hatch for someone
 *  who finds the whole mechanism more trouble than the time it
 *  recovers, which is a legitimate answer. */
export const AMBER_CHOICES: ReadonlyArray<number | null> = [
  5, 10, 15, 20, 30, 45, 60, null,
];

export async function getAmberMinutes(): Promise<number | null> {
  const raw = await getPref<number | null>(
    PREF_SONG_TIMER_AMBER_MIN, AMBER_DEFAULT_MIN,
  );
  if (raw === null) return null;
  // A stored value outside the offered set is coerced rather than
  // trusted: this crosses a sync boundary and could arrive from an
  // older or newer build.
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0
    ? raw
    : AMBER_DEFAULT_MIN;
}

export async function setAmberMinutes(value: number | null): Promise<void> {
  await setPref(PREF_SONG_TIMER_AMBER_MIN, value);
}
