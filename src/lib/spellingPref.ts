import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getPref, setPref } from './userPrefs';
import { DEFAULT_SPELLING, type Spelling } from './spelling';

// Global enharmonic-spelling preference — whether the app names the
// five black keys with flats (Db Eb Gb Ab Bb) or sharps (C# D# F# G# A#).
// Stored in userPrefs so it persists across reloads and covers every
// module that displays a key or note name.
//
// Default: flats. That is what gospel / R&B / soul charts read in, and
// it means the identity vocabulary's F# never reaches a screen unless
// the user asks for it.
//
// This is the GLOBAL setting. A per-song override lands later and wins
// over it for that song's own surfaces; catalog labels with no song in
// context (the S&P grids, harmonic fluency cards) always read this one.
//
// Shape deliberately mirrors notationPref.ts — same userPrefs row, same
// useLiveQuery + local-echo pattern. Two global display settings that
// behave differently would be two things to learn.

export const SPELLING_PREF_KEY = 'enharmonicSpelling';

export const SPELLING_LABEL: Record<Spelling, string> = {
  flat:  'flats (Db, Eb, Gb, Ab, Bb)',
  sharp: 'sharps (C#, D#, F#, G#, A#)',
};

const VALID = new Set<Spelling>(['flat', 'sharp']);

function coerce(v: unknown): Spelling {
  return typeof v === 'string' && VALID.has(v as Spelling)
    ? (v as Spelling)
    : DEFAULT_SPELLING;
}

/**
 * Reactive hook. Returns the current spelling and a setter. Uses
 * `useLiveQuery` so every consumer re-renders when any one of them
 * writes — flipping the setting re-spells the open screen, which is the
 * whole point of the control.
 */
export function useSpelling(): [Spelling, (next: Spelling) => Promise<void>] {
  const stored = useLiveQuery(
    async () => getPref<Spelling>(SPELLING_PREF_KEY, DEFAULT_SPELLING),
    [],
  );
  const spelling = coerce(stored);
  const [local, setLocal] = useState<Spelling>(spelling);

  useEffect(() => { setLocal(spelling); }, [spelling]);

  const set = async (next: Spelling) => {
    setLocal(next);
    await setPref(SPELLING_PREF_KEY, next);
  };

  return [local, set];
}
