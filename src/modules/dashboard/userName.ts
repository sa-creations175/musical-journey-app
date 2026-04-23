import { useEffect, useState } from 'react';
import { getPref, setPref } from '../../lib/userPrefs';

export const PREF_USER_NAME = 'userName';
/** Default name shown on the dashboard greeting until the user changes
 *  it. Hard-coded to the app's primary user for now; can still be
 *  overridden via the settings panel. */
export const DEFAULT_USER_NAME = 'Silas';

/**
 * Read + write the user's display name via userPrefs. Returns a
 * setter that also updates local state, so the Dashboard greeting
 * reflects the change immediately without a re-fetch. Seeds the pref
 * with DEFAULT_USER_NAME on first read so the greeting never falls
 * back to a generic placeholder.
 */
export function useUserName(): [string, (next: string) => Promise<void>, boolean] {
  const [name, setName] = useState(DEFAULT_USER_NAME);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const stored = await getPref<string>(PREF_USER_NAME, DEFAULT_USER_NAME);
      setName(typeof stored === 'string' && stored.trim() !== '' ? stored : DEFAULT_USER_NAME);
      setLoaded(true);
    })();
  }, []);

  const save = async (next: string) => {
    const trimmed = next.trim();
    const value = trimmed === '' ? DEFAULT_USER_NAME : trimmed;
    setName(value);
    await setPref(PREF_USER_NAME, value);
  };

  return [name, save, loaded];
}
