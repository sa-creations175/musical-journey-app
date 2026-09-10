/**
 * How this app writes a progression, as a setting.
 *
 * =====================================================================
 * ONE FORMATTER ALREADY; NOW IT HAS A DIAL.
 *
 * `lib/progressionRow.ts` made every surface spell a progression the
 * same way on 10 Sep 2026. What it could not settle is WHICH way — the
 * middle dot reads cleanly and the hyphen is what a chart says; the
 * quality on every chord is honest and on a named row it is noise; and
 * a half-diminished has two right names depending on how thick you are
 * playing it.
 *
 * Silas walked all of it on the "Progression Spelling" prototype and
 * ruled it a setting rather than a decision. So this holds the choices
 * and `progressionRow` reads them.
 *
 * =====================================================================
 * IT CHANGES NAMES AND NEVER DATA.
 *
 * The same promise `lib/spelling.ts` makes about the black keys. No id,
 * no itemRef, no stored answer and no card moves — a progression is the
 * same progression however it is written, and every surface here is
 * reading a row aloud rather than deciding what the row is.
 * =====================================================================
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getPref, setPref } from './userPrefs';

// THE SHAPE AND ITS DEFAULTS LIVE IN `progressionSpellingShape`, which
// imports nothing, so a read layer can format a chord row without
// pulling React and Dexie in behind this file's hooks. Re-exported here
// so every existing import keeps working.
export {
  CANONICAL_SPELLING, DEFAULT_PROGRESSION_SPELLING, SEPARATOR_TEXT,
  type ChordSeparator, type HalfDimSeventh, type HalfDimTriad,
  type ProgressionSpelling, type QualityDisplay,
} from './progressionSpellingShape';
import {
  DEFAULT_PROGRESSION_SPELLING, type ChordSeparator, type HalfDimSeventh,
  type HalfDimTriad, type ProgressionSpelling, type QualityDisplay,
} from './progressionSpellingShape';

/** The words the Settings rows use. */
export const SEPARATOR_LABEL: Readonly<Record<ChordSeparator, string>> = {
  dot: 'dots · ',
  hyphen: 'hyphens -',
  space: 'spaces',
};

export const QUALITY_LABEL: Readonly<Record<QualityDisplay, string>> = {
  all: 'on every chord',
  spelled: 'only on spelled loops',
  off: 'off',
};

export const PROGRESSION_SPELLING_PREF_KEY = 'progressionSpelling';

const SEPARATORS = new Set<ChordSeparator>(['dot', 'hyphen', 'space']);
const QUALITIES = new Set<QualityDisplay>(['all', 'spelled', 'off']);
const HD_TRIADS = new Set<HalfDimTriad>(['°', 'dim']);
const HD_SEVENTHS = new Set<HalfDimSeventh>(['ø', 'm7♭5']);

/**
 * A stored value read back as a setting.
 *
 * FIELD BY FIELD, so a row written by an older build — or a row a
 * future one adds a field to — still yields a usable setting instead
 * of throwing the whole thing away.
 */
export function coerceSpelling(value: unknown): ProgressionSpelling {
  const v = (typeof value === 'object' && value !== null)
    ? value as Partial<Record<keyof ProgressionSpelling, unknown>>
    : {};
  const pick = <T,>(raw: unknown, valid: ReadonlySet<T>, fallback: T): T =>
    valid.has(raw as T) ? raw as T : fallback;
  return {
    separator: pick(v.separator, SEPARATORS, DEFAULT_PROGRESSION_SPELLING.separator),
    qualities: pick(v.qualities, QUALITIES, DEFAULT_PROGRESSION_SPELLING.qualities),
    halfDimTriad: pick(v.halfDimTriad, HD_TRIADS, DEFAULT_PROGRESSION_SPELLING.halfDimTriad),
    halfDimSeventh: pick(
      v.halfDimSeventh, HD_SEVENTHS, DEFAULT_PROGRESSION_SPELLING.halfDimSeventh),
  };
}

/**
 * Reactive hook, shaped exactly like `useSpelling`.
 *
 * `useLiveQuery` so every consumer re-renders when the setting is
 * written — flipping it re-spells the open screen, which is the whole
 * point of the control — with a local echo so the tap lands before the
 * round trip.
 */
export function useProgressionSpelling():
[ProgressionSpelling, (next: ProgressionSpelling) => Promise<void>] {
  const stored = useLiveQuery(
    async () => getPref<unknown>(
      PROGRESSION_SPELLING_PREF_KEY, DEFAULT_PROGRESSION_SPELLING),
    [],
  );
  const settings = coerceSpelling(stored);

  // =====================================================================
  // THE ECHO IS ADJUSTED IN RENDER, NOT IN AN EFFECT.
  //
  // `useSpelling` next door can depend on its stored value directly
  // because that value is a STRING. This one is an object that
  // `coerceSpelling` rebuilds every render, so an effect depending on it
  // would fire on every pass and overwrite the tap it exists to make
  // land. Comparing the serialised value and adjusting during render is
  // React's own answer to that, and it needs no effect at all.
  // =====================================================================
  const key = JSON.stringify(settings);
  const [seen, setSeen] = useState(key);
  const [local, setLocal] = useState<ProgressionSpelling>(settings);
  if (key !== seen) {
    setSeen(key);
    setLocal(settings);
  }

  const set = async (next: ProgressionSpelling) => {
    setLocal(next);
    await setPref(PROGRESSION_SPELLING_PREF_KEY, next);
  };

  return [local, set];
}
