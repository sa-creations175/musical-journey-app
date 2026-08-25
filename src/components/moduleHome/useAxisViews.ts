/**
 * Which ordering each axis is shown in, remembered between visits.
 *
 * Same shape as the criteria panel's open state: a display preference
 * that survives a reload because re-choosing it every time is the kind
 * of small friction that makes a view stop being used.
 *
 * KEYED PER AXIS FIELD, not per category. "Show me keys in fourths" is
 * a fact about how the reader reads keys, so a second category with a
 * key axis inherits the choice rather than asking again.
 *
 * The stored value is only ever a HINT. `resolveView` falls back to the
 * first view when the remembered id no longer exists, so renaming or
 * removing a view cannot leave a grid unable to render.
 */
import { useCallback, useEffect, useState } from 'react';
import { getPref, setPref } from '../../lib/userPrefs';

const PREF_KEY = 'moduleHome.axisViews';

export interface AxisViews {
  viewFor: (field: string) => string | null;
  setView: (field: string, viewId: string) => void;
  /** False until the stored value has loaded. A grid rendered before
   *  then would flash the default and then jump. */
  loaded: boolean;
}

export function useAxisViews(): AxisViews {
  const [views, setViews] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const stored = await getPref<Record<string, string>>(PREF_KEY, {});
      if (live) { setViews(stored); setLoaded(true); }
    })();
    return () => { live = false; };
  }, []);

  const setView = useCallback((field: string, viewId: string) => {
    setViews(prev => {
      const next = { ...prev, [field]: viewId };
      // Written on change rather than on unmount: a reader who taps the
      // toggle and closes the page immediately still gets remembered.
      void setPref(PREF_KEY, next);
      return next;
    });
  }, []);

  const viewFor = useCallback(
    (field: string) => views[field] ?? null,
    [views],
  );

  return { viewFor, setView, loaded };
}
