/**
 * What the shared player is set to, and what it opens at.
 *
 * =====================================================================
 * ONE SETTINGS SHAPE FOR EVERY SURFACE, WHICH IS THE POINT OF THE
 * PANEL.
 *
 * The playback audit of 9 Sep found the same knob under six names: four
 * surfaces with a speed MULTIPLIER and two with a tempo in bpm, three
 * different bass boosts, two ways of orienting on the tonic. Every one
 * of those is a fact about how this app plays music, and a reader who
 * learns it on one screen should not have to learn it again on the
 * next.
 *
 * So the settings live here, in one type with one set of defaults. A
 * surface chooses which ROWS to show — that is the allowed-differences
 * list — and never what a row means.
 *
 * =====================================================================
 * BEATS PER MINUTE, EVERYWHERE. The speed multipliers retire: 0.5× is
 * not a tempo, it is a tempo relative to a number nobody was ever
 * shown.
 * =====================================================================
 */

import type { Thickness } from '../builtAnswers/chordShapes';

/** Bass and chords, or the bass line alone. */
export type ListenTo = 'both' | 'bass';

/**
 * What the right hand plays over the bass.
 *
 * =====================================================================
 * TWO RIGHT-HAND VOICINGS, NEVER ONE HAND ALONE. Silas's ruling of 10
 * Sep 2026. The left hand always plays the bass and always carries the
 * bass line's movement; this row only chooses whether the right hand's
 * voicing carries the root too.
 *
 *   rootless   the rung's voicing as written — in the key of C, Cmaj7
 *              at Seventh Chords is C under E G B
 *   root       the same voicing with the root in it — C under C E G B,
 *              inverted as voice leading needs
 *
 * "One, root in the chord" — no left hand — is retired. Triads and
 * Guide Tones are what they are: a triad already has its root, and
 * guide tones are the 3rd and the 7th by definition.
 * =====================================================================
 */
export type Hands = 'rootless' | 'root';

/**
 * A Hands value from anywhere, including the retired one.
 *
 * `'one'` — "One, root in the chord" — reads as Root in the right hand,
 * the setting nearest to what it asked for: the root inside the chord.
 * `'both'` was the rootless right hand. Anything else is the default.
 */
/**
 * The Hands row's two names — one table, read by the shared player and
 * by Harmonic Fluency's answer-builder layout row, so the two rows cannot
 * come to call the same voicing two things.
 */
export const HANDS_LABEL: Readonly<Record<Hands, string>> = {
  rootless: 'Rootless right hand',
  root: 'Root in the right hand',
};

export function handsFrom(value: unknown): Hands {
  return value === 'root' || value === 'one' ? 'root' : 'rootless';
}

/** Plain highlight, or coloured by each note's interval from the
 *  sounding chord's root. */
export type Colours = 'plain' | 'interval';

/**
 * How the notes are sounded: struck at once, or one at a time.
 *
 * =====================================================================
 * FOUR WAYS, ONE ROW, EVERY SURFACE. Silas's ruling of 12 Sep 2026,
 * confirmed 13 Sep.
 *
 * Together strikes the notes at once. Up plays them one at a time from
 * the bottom; Down from the top; Up and Down goes up and comes back
 * without striking the top note twice. On a scale, Together is every
 * note at once and the other three are the scale in that direction; in
 * a progression each chord plays its run inside its own bar.
 *
 * This reopens the 10 Sep ruling that left the app one broken mode
 * (up). The row replaces "Chord sounds: Blocked / Broken" wherever that
 * stood.
 * =====================================================================
 */
export type PlayAs = 'together' | 'up' | 'down' | 'upDown';

/** The row, in its order and in Silas's words. */
export const PLAY_AS_OPTIONS: ReadonlyArray<{ id: PlayAs; label: string }> = [
  { id: 'together', label: 'Together' },
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
  { id: 'upDown', label: 'Up and Down' },
];

/** The line under the row on the Chord Recognition quiz. Silas's
 *  words, 13 Sep 2026. */
export const PLAY_AS_AID_NOTE =
  'Listening modes matter: Up, Down, and Up and Down are an aid, with a lower rating.';

/**
 * A Play as value from anywhere, including what was stored before it.
 *
 * AN OLD "BROKEN" READS AS UP. Silas's answer of 13 Sep 2026: up is the
 * one direction the app played from 10 Sep until this row. `'up'` and
 * `'down'`, stored before 10 Sep, are the row's own words and read as
 * themselves. `'blocked'` is Together, and so is anything unknown.
 */
export function playAsFrom(value: unknown): PlayAs {
  if (value === 'up' || value === 'broken') return 'up';
  if (value === 'down') return 'down';
  if (value === 'upDown') return 'upDown';
  return 'together';
}

/**
 * What an attempt records, which has not changed.
 *
 * NO NEW STORED VALUE. `playStyle` stays `blocked | broken`, Silas's
 * answer of 13 Sep 2026: it exists to keep answer times from being
 * pooled across a chord heard at once and a chord heard in turn, and
 * every run is the second kind.
 */
export function playStyleOf(playAs: PlayAs): 'blocked' | 'broken' {
  return playAs === 'together' ? 'blocked' : 'broken';
}

/**
 * How much room the bass line gets.
 *
 * =====================================================================
 * FORWARD MOVES THE WHOLE LINE OR NONE OF IT.
 *
 * Silas's ruling of 10 Sep 2026, and the "whole line" is the load-
 * bearing half. The bass rule chooses where each root goes RELATIVE to
 * the one before it — up a fourth here, down a fifth there — and
 * dropping one note of that line by an octave would replace the move it
 * chose with a different one. So Forward drops every bass of the
 * sequence together, and only when every one of them still fits above
 * the board's floor.
 *
 * FREE, NOT AN AID. It changes how much of the bass you hear, not how
 * much of the question is given away — the same reasoning tempo and the
 * octave lift already follow.
 * =====================================================================
 */
export type BassLevel = 'forward' | 'blended';

/**
 * The window the bass line lives in.
 *
 * =====================================================================
 * AN OCTAVE AND A HALF, AND THE BASS NEVER LEAVES IT. Silas's answers of
 * 14 Sep 2026, on every surface that plays a bass.
 *
 * Where a card or the reader names the bass's direction, the whole line
 * moves into the window as one block, so no jump is ever flipped: on
 * Forward the lowest octave that fits, on Blended the highest. Where
 * nothing names it, each bass is placed as the bass rule places it, and
 * Forward drops each one an octave unless that takes it below the
 * window. A bass outside the window goes an octave back inside. See
 * `placeBass`.
 * =====================================================================
 */
export type BassRegister = 'c1' | 'c2' | 'c3';

/** The row, in Silas's words, with each window's lowest MIDI note. */
export const BASS_REGISTER_OPTIONS: ReadonlyArray<{ id: BassRegister; label: string; low: number }> = [
  { id: 'c1', label: 'C1 to G2', low: 24 },
  { id: 'c2', label: 'C2 to G3', low: 36 },
  { id: 'c3', label: 'C3 to G4', low: 48 },
];

/** A register's lowest and highest note: C to the G an octave and a
 *  fifth above it. */
export function bassWindow(register: BassRegister): { low: number; high: number } {
  const low = BASS_REGISTER_OPTIONS.find(o => o.id === register)?.low ?? 36;
  return { low, high: low + 19 };
}

/** How many times through. */
export type LoopCount = 1 | 2 | 4 | 'untilStopped';

export interface PlayerSettings {
  /** Beats per minute. */
  bpm: number;
  /** The right hand as voiced, or lifted an octave. */
  octaveUp: boolean;
  hands: Hands;
  listen: ListenTo;
  colours: Colours;
  loop: LoopCount;
  /** How the notes are sounded — see `PlayAs`. On every surface. */
  playAs: PlayAs;
  /** How much room the bass gets — see `BassLevel`. */
  bass: BassLevel;
  /** Where the bass line lives — see `BassRegister`. */
  bassRegister: BassRegister;
}

/**
 * The tempo range, and where it opens.
 *
 * THIRTY TO A HUNDRED AND FORTY, DEFAULT FIFTY — the prototype's
 * numbers. Fifty is slow: the panel is for hearing what a voicing does,
 * and the drill sets its own tempo from the metronome.
 */
export const BPM_MIN = 30;
export const BPM_MAX = 140;
export const DEFAULT_BPM = 50;

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  bpm: DEFAULT_BPM,
  octaveUp: false,
  hands: 'rootless',
  listen: 'both',
  colours: 'interval',
  loop: 1,
  playAs: 'together',
  // FORWARD BY DEFAULT. The bass is what a progression is doing, and
  // the reader arrives at a card to hear it move.
  bass: 'forward',
  // C2 TO G3 BY DEFAULT (Silas, 14 Sep 2026), which leaves today's
  // single chords where they were.
  bassRegister: 'c2',
};

/** The Loop row, in the prototype's order. */
export const LOOP_OPTIONS: ReadonlyArray<{ id: LoopCount; label: string }> = [
  { id: 1, label: 'Once' },
  { id: 2, label: 'Twice' },
  { id: 4, label: '4 times' },
  { id: 'untilStopped', label: 'Until stopped' },
];

/**
 * The thickness ladder, without "Bass only".
 *
 * THE BASS RUNG MOVED TO "LISTEN TO", where it belongs: how much of a
 * chord you play and whether you are listening to the bass or the whole
 * thing are two different questions, and one control answering both
 * made "bass only" a thinness rather than a way of listening. Silas's
 * brief of 10 Sep 2026.
 */
export const LADDER_RUNGS: ReadonlyArray<Thickness> =
  ['triads', 'guide', 'seventh', 'full'];

/** The bpm a typed box is allowed to produce. */
export function clampBpm(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BPM;
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(value)));
}

/**
 * Whether the Settings fold opens, remembered per device.
 *
 * PER DEVICE AND NOT PER USER. It is where a fold was left, not a
 * preference about music — the same reasoning the colour toggle
 * already follows — so it lives in `localStorage` and a browser that
 * refuses to answer simply gets the default.
 */
const SETTINGS_OPEN_KEY = 'playerSettingsOpen';

export function readSettingsOpen(): boolean {
  try {
    return window.localStorage.getItem(SETTINGS_OPEN_KEY) !== 'closed';
  } catch {
    return true;
  }
}

export function writeSettingsOpen(open: boolean): void {
  try {
    window.localStorage.setItem(SETTINGS_OPEN_KEY, open ? 'open' : 'closed');
  } catch {
    // A browser that will not store it still plays; the fold simply
    // opens where it always does next time.
  }
}
