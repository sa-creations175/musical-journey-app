/**
 * Whose tempo the metronome remembers.
 *
 * =====================================================================
 * THE FAILURE THIS FIXES AND THE ONE IT COULD INTRODUCE ARE THE SAME
 * FAILURE POINTING OPPOSITE WAYS.
 *
 * Before: slow a song to 70 to get a passage under the fingers, and the
 * next chord-shape drill opens at 70. A song's tempo leaking into a
 * drill.
 *
 * After, if the restore is missed: open a song at 70, close it, and the
 * next drill STILL opens at 70. Identical symptom, and harder to spot,
 * because it looks like the fix working.
 *
 * So the restore is tested as hard as the claim, and so is the write
 * path — a scoped read with an unscoped write puts the song's tempo on
 * the app-wide key at the first tap of a stepper.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { PREF_BPM } from '../metronome';
import { getPref, setPref } from '../userPrefs';
import {
  __resetScopeForTests,
  claimScopeForSong,
  currentPrefKey,
  releaseScope,
  scopedSongId,
  songBpmPrefKey,
  writeScopedBpm,
} from '../metronomeScope';

const SONG = 'song-1';
const OTHER = 'song-2';

beforeEach(async () => {
  __resetScopeForTests();
  await db.userPrefs.clear();
});

describe('with no song open', () => {
  it('the app-wide key is what gets read and written', async () => {
    expect(currentPrefKey()).toBe(PREF_BPM);
    expect(scopedSongId()).toBeNull();
    await writeScopedBpm(96);
    expect(await getPref<number>(PREF_BPM, 0)).toBe(96);
  });

  it('releasing a scope that was never claimed is not an error', () => {
    // What an unmount after a navigation looks like.
    expect(releaseScope()).toBeNull();
  });
});

describe('a song takes the metronome over', () => {
  it('opens at its STATED tempo the first time', async () => {
    // The song's own tempo, not the app's — a song opens at the speed
    // it is written at before anyone has set one for it.
    const bpm = await claimScopeForSong({
      songId: SONG, songTempo: 104, currentBpm: 90,
    });
    expect(bpm).toBe(104);
  });

  it('opens at the tempo it was left at, once there is one', async () => {
    await setPref(songBpmPrefKey(SONG), 70);
    const bpm = await claimScopeForSong({
      songId: SONG, songTempo: 104, currentBpm: 90,
    });
    expect(bpm).toBe(70);
  });

  it('falls back to what is showing when the song has no tempo', async () => {
    const bpm = await claimScopeForSong({
      songId: SONG, songTempo: null, currentBpm: 90,
    });
    expect(bpm).toBe(90);
  });

  it('WRITES GO TO THE SONG, not to the app-wide key', async () => {
    // The half that would have been missed. A scoped read with an
    // unscoped write is the drill's tempo overwritten by a song at the
    // first tap of a stepper.
    await setPref(PREF_BPM, 90);
    await claimScopeForSong({ songId: SONG, songTempo: 104, currentBpm: 90 });
    await writeScopedBpm(70);
    expect(await getPref<number>(songBpmPrefKey(SONG), 0)).toBe(70);
    expect(await getPref<number>(PREF_BPM, 0)).toBe(90);
  });
});

describe('and gives it back', () => {
  it('THE APP-WIDE TEMPO COMES BACK on release', async () => {
    await setPref(PREF_BPM, 90);
    await claimScopeForSong({ songId: SONG, songTempo: 104, currentBpm: 90 });
    await writeScopedBpm(70);
    expect(releaseScope()).toBe(90);
    expect(currentPrefKey()).toBe(PREF_BPM);
  });

  it('the drill does not inherit the song, in either direction', async () => {
    // The whole point, stated as one sequence: app at 90, song slowed
    // to 70, song closed, app still 90 — and the song still remembers
    // 70 for next time.
    await setPref(PREF_BPM, 90);
    await claimScopeForSong({ songId: SONG, songTempo: 104, currentBpm: 90 });
    await writeScopedBpm(70);
    releaseScope();
    await writeScopedBpm(90);
    expect(await getPref<number>(PREF_BPM, 0)).toBe(90);
    expect(await getPref<number>(songBpmPrefKey(SONG), 0)).toBe(70);
  });

  it('a second song does not overwrite what the APP was at', async () => {
    // Opening another song without closing the first would otherwise
    // bank the first song's tempo as the app-wide one, and the restore
    // would hand a drill a song's number.
    await claimScopeForSong({ songId: SONG, songTempo: 104, currentBpm: 90 });
    await claimScopeForSong({ songId: OTHER, songTempo: 60, currentBpm: 104 });
    expect(releaseScope()).toBe(90);
  });

  it('two songs keep separate tempos', async () => {
    await claimScopeForSong({ songId: SONG, songTempo: 104, currentBpm: 90 });
    await writeScopedBpm(70);
    releaseScope();
    await claimScopeForSong({ songId: OTHER, songTempo: 60, currentBpm: 90 });
    await writeScopedBpm(58);
    releaseScope();
    expect(await getPref<number>(songBpmPrefKey(SONG), 0)).toBe(70);
    expect(await getPref<number>(songBpmPrefKey(OTHER), 0)).toBe(58);
  });
});
