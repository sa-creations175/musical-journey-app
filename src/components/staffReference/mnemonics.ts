/**
 * The mnemonics, stored once for every surface that shows them.
 *
 * =====================================================================
 * ONE COPY, CENTRALLY, BESIDE THE OTHER SETTINGS.
 *
 * The reference page and the reading reveal panel draw the same staff,
 * so an edit made on one has to be the edit the other reads. Two stores
 * — or a store plus a hardcoded fallback list rendered somewhere else —
 * is how the panel comes to explain a note with words the reference no
 * longer uses.
 *
 * So: one `userPrefs` row holding position id → words, read through
 * `useMnemonics`, and `defaultMnemonics()` underneath it for the
 * standard sets. A stored value wins; anything absent falls through to
 * the default; anything defaulted-empty stays empty until a person
 * types something.
 * =====================================================================
 */
import { useCallback, useEffect, useState } from 'react';
import { getPref, setPref } from '../../lib/userPrefs';
import { defaultMnemonics } from './staffLadder';

/** The one pref row. */
export const MNEMONICS_PREF_KEY = 'staffMnemonics';

export type MnemonicMap = Readonly<Record<string, string>>;

/**
 * Stored values over the shipped ones.
 *
 * AN EMPTY STRING IS A REAL VALUE, not a missing one: clearing a
 * mnemonic has to survive a reload rather than springing back to the
 * default it was cleared from. So the merge is key-by-key over what is
 * stored, and only keys never touched fall through.
 */
export function mergeMnemonics(stored: unknown): MnemonicMap {
  const base: Record<string, string> = { ...defaultMnemonics() };
  if (typeof stored !== 'object' || stored === null) return base;
  for (const [id, value] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof value === 'string') base[id] = value;
  }
  return base;
}

export interface MnemonicsHandle {
  mnemonics: MnemonicMap;
  /** Persisted immediately — there is no save button to forget. */
  set: (id: string, value: string) => void;
  loaded: boolean;
}

export function useMnemonics(): MnemonicsHandle {
  const [stored, setStored] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    void getPref<Record<string, string>>(MNEMONICS_PREF_KEY, {})
      .then(v => { if (live) { setStored(v ?? {}); setLoaded(true); } })
      .catch(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, []);

  const set = useCallback((id: string, value: string) => {
    setStored(prev => {
      const next = { ...prev, [id]: value };
      void setPref(MNEMONICS_PREF_KEY, next);
      return next;
    });
  }, []);

  return { mnemonics: mergeMnemonics(stored), set, loaded };
}
