/**
 * The two saved settings a harmonic-fluency drill runs under.
 *
 * SHARED BECAUSE TWO SURFACES NOW READ THEM. The settings panel writes
 * them on the module home; `FluencyDrill` reads them wherever a drill
 * is started — the module home, a category page, or a Level-3
 * auto-start. Two copies of the hydrate-then-persist dance would be two
 * chances to write a transient default over a saved value, which is the
 * failure the `loaded` flag exists to prevent.
 *
 * `flaggedOnly` is NOT here: it is not persisted, and it belongs to the
 * launcher that offers it rather than to the module.
 */
import { useEffect, useState } from 'react';
import { getPref, setPref } from '../../lib/userPrefs';
import type { DisplayMode, TimerMode } from './HarmonicFluencySession';

export const PREF_DISPLAY_MODE = 'harmonicFluencyDisplayMode';
export const PREF_TIMER = 'harmonicFluencyTimerMode';

/** Below this many attempts a new reader gets the grid rather than
 *  bare text — the module's own onboarding default. */
const GRID_UNTIL_ATTEMPTS = 100;

export interface FluencyPrefs {
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;
  timerMode: TimerMode;
  setTimerMode: (mode: TimerMode) => void;
  /** False until the stored values have arrived. Nothing persists
   *  before it flips, so a default cannot overwrite a saved value. */
  loaded: boolean;
}

export function useFluencyPrefs(totalAttempts: number): FluencyPrefs {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('number-grid');
  const [timerMode, setTimerMode] = useState<TimerMode>('off');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const stored = await getPref<DisplayMode | null>(PREF_DISPLAY_MODE, null);
      const timer = await getPref<TimerMode>(PREF_TIMER, 'off');
      if (!live) return;
      setDisplayMode(stored ?? (totalAttempts < GRID_UNTIL_ATTEMPTS ? 'number-grid' : 'text'));
      setTimerMode(timer);
      setLoaded(true);
    })();
    return () => { live = false; };
    // `totalAttempts` is read once, on first load, and deliberately not
    // a dep — it arrives from a live query and would re-hydrate the
    // prefs every time the count moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded) return;
    void setPref(PREF_DISPLAY_MODE, displayMode);
  }, [displayMode, loaded]);
  useEffect(() => {
    if (!loaded) return;
    void setPref(PREF_TIMER, timerMode);
  }, [timerMode, loaded]);

  return { displayMode, setDisplayMode, timerMode, setTimerMode, loaded };
}
