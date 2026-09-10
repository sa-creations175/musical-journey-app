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

/** Both hands with the root underneath, or one hand with it in the
 *  chord. */
export type Hands = 'both' | 'one';

/** Plain highlight, or coloured by each note's interval from the
 *  sounding chord's root. */
export type Colours = 'plain' | 'interval';

/** Chord recognition's own row: struck together, or rolled. */
export type ChordAttack = 'blocked' | 'up' | 'down';

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
  /** Chord recognition only; ignored where the row is not shown. */
  attack: ChordAttack;
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
  hands: 'both',
  listen: 'both',
  colours: 'interval',
  loop: 1,
  attack: 'blocked',
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
