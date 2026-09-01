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
 * IT ALSO HOLDS WHICH WAY UP EACH GRID IS DRAWN, under keys no axis
 * field can collide with — see `orientationField` in `axis.ts`. That is
 * the same kind of value: a remembered, display-only choice about one
 * grid, loaded once per page. A second store would be a second thing to
 * wait for and a second thing to go stale.
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
    })()
      // A DISPLAY CHOICE THAT CANNOT BE READ IS THE DEFAULT ONE, not an
      // error thrown into the page. `loaded` stays false, `viewFor`
      // keeps answering null, and every caller already falls back —
      // `resolveView` and `resolveCardSort` both take the stored value
      // as a hint. Caught rather than left to reject because this hook
      // now runs on module homes, where the grid it decorates is the
      // page's whole content.
      .catch(err => { console.warn('[axisViews] could not be read', err); });
    return () => { live = false; };
  }, []);

  const setView = useCallback((field: string, viewId: string) => {
    setViews(prev => {
      const next = { ...prev, [field]: viewId };
      // Written on change rather than on unmount: a reader who taps the
      // toggle and closes the page immediately still gets remembered.
      // A failed write loses the memory of one press, which is not
      // worth throwing over — see the read above.
      void setPref(PREF_KEY, next)
        .catch(err => { console.warn('[axisViews] could not be saved', err); });
      return next;
    });
  }, []);

  const viewFor = useCallback(
    (field: string) => views[field] ?? null,
    [views],
  );

  return { viewFor, setView, loaded };
}
