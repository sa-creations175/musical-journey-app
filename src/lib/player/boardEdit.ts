/**
 * Building a chord by hand on the shared board.
 *
 * =====================================================================
 * ANY KEY CAN BE LIT OR UNLIT, AND THE LIT KEYS ARE WHAT PLAYS. Silas's
 * spec of 12 Sep 2026, §5, everywhere the shared board is drawn.
 *
 * A tap edits the chord the board is showing — on a surface with more
 * than one chord, the one selected (Silas, 14 Sep 2026). What is lit is
 * then the chord: the lowest lit note is its bass when it sits below
 * middle C, the rest is the hand, and the reader names it (§3).
 *
 * RINGS ARE A GROUP. Tap again (the default): an unlit key lights, a lit
 * key gets a ring, a ringed key unlights. Press and hold: a tap lights
 * and unlights, and holding a lit key rings it. ↓ octave and ↑ octave
 * move the ringed notes, or every lit note when nothing is ringed, and a
 * note that would leave the board is dropped.
 *
 * UNDO STEPS BACK ONE CHANGE AT A TIME, fifty kept. `History` is the
 * stack; a surface with rows of its own (the diary's Root, Colour and
 * Inversion) keeps those in the same stack, so one Undo walks back
 * through both.
 * =====================================================================
 *
 * Pure: nothing here knows about React, sound, or which surface it is.
 */
import { onBoard } from '../builtAnswers/board';
import type { ProgressionSpelling } from '../progressionSpellingShape';
import type { Spelling } from '../spelling';
import { readNotes, type Reading } from './reader';
import type { PlayerChord } from './voices';

/** How a lit key gets a ring. */
export type SelectNotesBy = 'tap' | 'hold';

/** The Select notes by row, in Silas's words. */
export const SELECT_NOTES_BY_OPTIONS: ReadonlyArray<{ id: SelectNotesBy; label: string }> = [
  { id: 'tap', label: 'Tap again' },
  { id: 'hold', label: 'Press and hold' },
];

/** How long a press is before it rings a key, in milliseconds. */
export const HOLD_MS = 450;

/** Middle C. A lowest lit note below it is the bass. */
export const MIDDLE_C = 60;

/** What has been built by hand, over the chords a surface was given. */
export interface BoardEdit {
  /** The lit notes of each chord built by hand, by index. A chord not
   *  in here is the surface's own. */
  built: Readonly<Record<number, ReadonlyArray<number>>>;
  /** The ringed keys. */
  rings: ReadonlyArray<number>;
  /** Which chord the rings are on. */
  ringsOn: number | null;
}

export const NO_EDIT: BoardEdit = { built: {}, rings: [], ringsOn: null };

/** Whether anything has been built or ringed. */
export function isEdited(edit: BoardEdit): boolean {
  return Object.keys(edit.built).length > 0;
}

/** The rings on one chord — none, where they are on another. */
export function ringsOf(edit: BoardEdit, index: number): number[] {
  return edit.ringsOn === index ? [...edit.rings] : [];
}

const uniqueSorted = (notes: ReadonlyArray<number>) =>
  [...new Set(notes)].sort((a, b) => a - b);

function withBuilt(edit: BoardEdit, index: number, notes: ReadonlyArray<number>, rings: ReadonlyArray<number>): BoardEdit {
  const lit = uniqueSorted(notes.filter(onBoard));
  return {
    built: { ...edit.built, [index]: lit },
    rings: rings.filter(m => lit.includes(m)),
    ringsOn: index,
  };
}

/**
 * A tap on a key.
 *
 * `lit` is what the chord at `index` has lit now — the surface's own
 * notes until it has been built by hand. Returns the next edit and
 * whether the lit notes changed (a ring alone changes nothing that
 * sounds).
 */
export function tapKey(
  edit: BoardEdit,
  index: number,
  lit: ReadonlyArray<number>,
  midi: number,
  by: SelectNotesBy,
): { edit: BoardEdit; litChanged: boolean } {
  const rings = ringsOf(edit, index);
  if (!lit.includes(midi)) {
    return { edit: withBuilt(edit, index, [...lit, midi], rings), litChanged: true };
  }
  if (by === 'tap' && !rings.includes(midi)) {
    return { edit: { ...edit, rings: [...rings, midi], ringsOn: index }, litChanged: false };
  }
  return {
    edit: withBuilt(edit, index, lit.filter(m => m !== midi), rings.filter(m => m !== midi)),
    litChanged: true,
  };
}

/** A press held on a key: a lit key's ring goes on or off. */
export function holdKey(
  edit: BoardEdit,
  index: number,
  lit: ReadonlyArray<number>,
  midi: number,
): BoardEdit {
  if (!lit.includes(midi)) return edit;
  const rings = ringsOf(edit, index);
  return {
    ...edit,
    rings: rings.includes(midi) ? rings.filter(m => m !== midi) : [...rings, midi],
    ringsOn: index,
  };
}

/**
 * ↓ octave or ↑ octave: the ringed notes, or every lit note. The rings
 * travel with their notes; a note that would leave the board is dropped.
 */
export function shiftOctave(
  edit: BoardEdit,
  index: number,
  lit: ReadonlyArray<number>,
  by: 12 | -12,
): BoardEdit {
  const rings = ringsOf(edit, index);
  const group = rings.length > 0 ? rings : [...lit];
  const moved = lit.map(m => (group.includes(m) ? m + by : m));
  return withBuilt(edit, index, moved, rings.map(m => m + by));
}

/** Clear rings. */
export function clearRings(edit: BoardEdit): BoardEdit {
  return edit.rings.length === 0 ? edit : { ...edit, rings: [], ringsOn: null };
}

/**
 * What a set of lit keys is, as a chord the player sounds.
 *
 * THE BASS IS THE LOWEST LIT NOTE WHEN IT SITS BELOW MIDDLE C; otherwise
 * the hand has no bass (spec §5). The reader names it and gives it its
 * root, so the board colours each key by its interval from that root.
 * Marked `byHand`, so no rule moves a note of it: Hear it plays exactly
 * what is lit.
 */
export function builtChord(
  notes: ReadonlyArray<number>,
  opts: { spelling?: Spelling; progression?: ProgressionSpelling } = {},
): { chord: PlayerChord; reading: Reading } {
  const lit = uniqueSorted(notes);
  const bass = lit.length > 0 && lit[0] < MIDDLE_C ? lit[0] : null;
  const reading = readNotes(lit, opts);
  const rootPc = reading.best?.rootPc
    ?? (lit.length > 0 ? ((lit[0] % 12) + 12) % 12 : 0);
  return {
    chord: {
      hand: bass === null ? lit : lit.slice(1),
      bass,
      rootPc,
      name: reading.name,
      byHand: true,
    },
    reading,
  };
}

/** An undo stack: the present, and up to fifty steps behind it. */
export interface History<T> {
  present: T;
  past: ReadonlyArray<T>;
}

/** How many steps Undo keeps. */
export const UNDO_STEPS = 50;

export function historyOf<T>(present: T): History<T> {
  return { present, past: [] };
}

/** A change, recorded so Undo can step back over it. */
export function record<T>(history: History<T>, next: T): History<T> {
  return { present: next, past: [...history.past, history.present].slice(-UNDO_STEPS) };
}

/** One step back, or the same history where there is none. */
export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  return { present: history.past[history.past.length - 1], past: history.past.slice(0, -1) };
}
