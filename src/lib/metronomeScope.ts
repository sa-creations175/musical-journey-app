import { PREF_BPM } from './metronome';
import { getPref, setPref } from './userPrefs';

/**
 * Whose tempo the metronome is currently showing.
 *
 * =====================================================================
 * ONE METRONOME, ONE AUDIBLE SPEED, SEVERAL THINGS THAT OWN A NUMBER.
 *
 * `lib/metronome` is a singleton with a single `bpm`. That is correct
 * and is not what changes here: there is one metronome in the room and
 * it is going at one speed. What changes is WHERE THAT NUMBER IS
 * REMEMBERED between visits.
 *
 * It was remembered in exactly one place — `metronomeBpm` — shared by
 * the app header, the shapes drills and the global session banner. So
 * slowing a song down to 70 to get a passage under the fingers left the
 * next chord-shape drill at 70, and nothing said why. A song's tempo is
 * a property of the song; a drill's is a property of the drill.
 *
 * =====================================================================
 * THREE QUESTIONS THE PROTOTYPE COULD NOT ANSWER, because it has one
 * `bpm` and no header. Answered here so nobody has to re-derive them.
 *
 * 1. WHILE A SONG SCOPE IS OPEN, THE HEADER'S METRONOME READS THE
 *    SONG'S TEMPO. Not a bug and not a leak — it is the same metronome,
 *    and it is audibly at that speed. A header showing 90 while the
 *    room hears 70 would be the actual error.
 *
 * 2. ON CLOSE, THE APP-WIDE VALUE COMES BACK. `releaseScope` restores
 *    it. Without that, the next drill opens at the song's tempo, which
 *    is the same failure as before with the direction reversed — and
 *    harder to notice, because it looks like the fix working.
 *
 * 3. WRITES FOLLOW THE SCOPE. `currentPrefKey` is what the control
 *    persists to, so the first tap of a stepper inside a song writes
 *    the song's key, not `metronomeBpm`. A scope-blind write is how the
 *    song's tempo would overwrite the drill's before anyone noticed the
 *    read was scoped.
 *
 * =====================================================================
 * A NEW KEY IN AN EXISTING KEY/VALUE TABLE — NO SCHEMA CHANGE.
 *
 * `userPrefs` is `{ key, value }` and already syncs. A per-song tempo
 * is a row with a different key, needing no column, no table and no
 * migration. Putting it on the `songs` row instead WOULD have been a
 * schema change, which is why it is not there.
 *
 * =====================================================================
 * `matrix/ModalMetronome.tsx` ARGUED AGAINST THIS and was right at the
 * time. Its header said a modal that quietly restored the BPM "would
 * mean the app had two ideas about what tempo you are working at" — a
 * fair objection to a modal doing it silently and locally.
 *
 * What makes this different is that the scope is explicit and named:
 * the song owns a remembered tempo, the app owns another, and which one
 * is loaded is a stated fact rather than a side effect of a component
 * mounting. That file had no callers and is deleted in the same commit
 * rather than left sitting there contradicting this one.
 * =====================================================================
 */

/** The pref key a song's remembered tempo lives under. */
export function songBpmPrefKey(songId: string): string {
  return `${PREF_BPM}:song:${songId}`;
}

/**
 * The scope in force, module-level because the metronome is.
 *
 * A React context would be the instinct and would be wrong: the thing
 * being scoped is a singleton outside React, and the header's control
 * is not a descendant of whatever opened the song.
 */
let currentScope: { songId: string } | null = null;
/** What the app-wide tempo was when a song scope took over. */
let appWideBpm: number | null = null;

/** The pref key the metronome's tempo should be written to right now. */
export function currentPrefKey(): string {
  return currentScope === null ? PREF_BPM : songBpmPrefKey(currentScope.songId);
}

/** Whether a song currently owns the metronome's tempo. */
export function scopedSongId(): string | null {
  return currentScope?.songId ?? null;
}

/**
 * A song takes over the metronome's tempo, and says what it should be.
 *
 * Returns the bpm to load: the song's remembered tempo if it has one,
 * otherwise its stated tempo, otherwise whatever was already showing.
 * The song's STATED tempo is the fallback rather than the app's, so a
 * song opens at the speed it is written at the first time.
 *
 * @param currentBpm what the metronome is at now, banked for the
 *   restore. Passed in rather than read, so this stays testable without
 *   reaching into the singleton.
 */
export async function claimScopeForSong(args: {
  songId: string;
  songTempo: number | null;
  currentBpm: number;
}): Promise<number> {
  // Banked only on the FIRST claim. Opening a second song without
  // closing the first must not overwrite the app-wide value with the
  // first song's tempo — the thing being remembered is what the app was
  // at before any song took over.
  if (currentScope === null) appWideBpm = args.currentBpm;
  currentScope = { songId: args.songId };

  const remembered = await getPref<number | null>(
    songBpmPrefKey(args.songId), null,
  );
  if (typeof remembered === 'number' && Number.isFinite(remembered)) {
    return remembered;
  }
  return args.songTempo ?? args.currentBpm;
}

/**
 * The song lets go, and the app-wide tempo comes back.
 *
 * Returns the bpm to restore, or null when there was no scope to
 * release — calling this twice is not an error, it is what an unmount
 * after a navigation looks like.
 */
export function releaseScope(): number | null {
  if (currentScope === null) return null;
  currentScope = null;
  const restore = appWideBpm;
  appWideBpm = null;
  return restore;
}

/** Persist the tempo to whichever scope owns it. */
export async function writeScopedBpm(bpm: number): Promise<void> {
  await setPref(currentPrefKey(), bpm);
}

/** Test seam. Never call from app code — a scope is released by the
 *  thing that claimed it. */
export function __resetScopeForTests(): void {
  currentScope = null;
  appWideBpm = null;
}
