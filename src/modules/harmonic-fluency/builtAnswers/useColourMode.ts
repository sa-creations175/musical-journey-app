/**
 * Plain or by interval, remembered per device.
 *
 * PER DEVICE AND NOT PER USER, which is what "remembered per device"
 * means and why this is `userPrefs` rather than a synced row: it is a
 * statement about the screen being looked at, like the spelling
 * preference and the speed control beside it.
 *
 * DEFAULT IS BY INTERVAL. The colours are the teaching — a reader who
 * has not chosen sees each note's job — and Plain is there for the
 * moment that becomes noise.
 */
import { useEffect, useState } from 'react';
import { getPref, setPref } from '../../../lib/userPrefs';
import type { ColourMode } from '../../../lib/builtAnswers/marks';

export const PREF_COLOUR_MODE = 'builtAnswerColourMode';

export function useColourMode(): [ColourMode, (m: ColourMode) => void] {
  const [mode, setMode] = useState<ColourMode>('interval');
  useEffect(() => {
    let live = true;
    void getPref<ColourMode>(PREF_COLOUR_MODE, 'interval')
      // Swallowed: a failed pref read means the default, and an
      // uncaught rejection here would surface as an app-level error
      // for a colour toggle.
      .then(v => { if (live) setMode(v === 'plain' ? 'plain' : 'interval'); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return [mode, (m: ColourMode) => {
    setMode(m);
    void setPref(PREF_COLOUR_MODE, m).catch(() => {});
  }];
}
