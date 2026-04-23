import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getPref, setPref } from './userPrefs';

// Global chord-notation preference. Stored in userPrefs so it
// persists across reloads and covers every module that displays
// chord functions (Song Repertoire, Chord Progressions, Chord
// Motion, Harmonic Fluency).
//
//   'numbers'  — number notation with quality flags: "4maj7", "2m7"
//   'roman'    — Roman numerals: "IVmaj7", "iim7"
//   'stacked'  — number primary, Roman subscript beneath
//   'concrete' — derived chord names: "Fmaj7", "Dm7" (requires key)
//
// Default for new users: 'numbers'. Matches the spec's functional-
// first ethos and keeps the display stable across key changes.

export type NotationMode = 'numbers' | 'roman' | 'stacked' | 'concrete';

export const NOTATION_PREF_KEY = 'chordNotationMode';
export const DEFAULT_NOTATION_MODE: NotationMode = 'numbers';

export const NOTATION_LABEL: Record<NotationMode, string> = {
  numbers:  'numbers (4maj7)',
  roman:    'roman numerals (IVmaj7)',
  stacked:  'stacked (numbers + roman)',
  concrete: 'concrete chord names (Fmaj7)',
};

const VALID = new Set<NotationMode>(['numbers', 'roman', 'stacked', 'concrete']);

function coerce(v: unknown): NotationMode {
  return typeof v === 'string' && VALID.has(v as NotationMode)
    ? (v as NotationMode)
    : DEFAULT_NOTATION_MODE;
}

/**
 * Reactive hook. Returns the current notation mode and a setter.
 * Uses `useLiveQuery` so every consumer updates automatically when
 * any one of them writes the preference.
 */
export function useNotationMode(): [NotationMode, (next: NotationMode) => Promise<void>] {
  const stored = useLiveQuery(
    async () => getPref<NotationMode>(NOTATION_PREF_KEY, DEFAULT_NOTATION_MODE),
    [],
  );
  const mode = coerce(stored);
  const [local, setLocal] = useState<NotationMode>(mode);

  useEffect(() => { setLocal(mode); }, [mode]);

  const set = async (next: NotationMode) => {
    setLocal(next);
    await setPref(NOTATION_PREF_KEY, next);
  };

  return [local, set];
}
