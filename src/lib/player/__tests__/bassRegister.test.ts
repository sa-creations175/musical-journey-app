/**
 * The Bass register: a direction someone named is never flipped.
 *
 * Silas's answers of 14 Sep 2026. Chord Motion's own cards are held by
 * `motionBassMove` and `chordMotionBoard`; these are the other lines that
 * name a move — the Full Progression card's coin-flipped first move, and
 * the diary's ascending and descending motion cards.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYER_SETTINGS, bassWindow, type PlayerSettings } from '../settings';
import { placeBass, type PlayerChord } from '../voices';
import { voiceEntry } from '../../../modules/ear-training/chord-progressions/passVoicing';
import { SHARED_PROGRESSIONS } from '../../../modules/ear-training/chord-progressions/sharedList';
import { motionChordsById } from '../../../modules/ear-training/chord-progressions/diaryPlayback';

const EVERY: PlayerSettings[] = (['c1', 'c2', 'c3'] as const).flatMap(bassRegister =>
  (['forward', 'blended'] as const).map(bass => ({ ...DEFAULT_PLAYER_SETTINGS, bass, bassRegister })));

const jumps = (chords: ReadonlyArray<PlayerChord>) =>
  chords.slice(1).map((c, i) => (c.bass as number) - (chords[i].bass as number));

describe('a line whose bass move was set keeps every jump', () => {
  it('on the Full Progression card, in every key, on every register and bass setting', () => {
    let lines = 0;
    for (const entry of SHARED_PROGRESSIONS) {
      for (let key = 0; key < 12; key += 1) {
        for (const first of ['up', 'down'] as const) {
          const moves = entry.chords.map((_, i) => (i === 0 ? first : 'auto' as const));
          const chords = voiceEntry(entry, key, entry.rungs[0], 1, { bassMoves: moves });
          expect(chords[1]?.namesMove, entry.id).toBe(true);
          for (const settings of EVERY) {
            expect(jumps(placeBass(chords, settings)), `${entry.id} ${key} ${settings.bassRegister} ${settings.bass}`)
              .toEqual(jumps(chords));
          }
          lines += 1;
        }
      }
    }
    expect(lines).toBe(SHARED_PROGRESSIONS.length * 24);
  });

  it('on the diary’s ascending and descending motion cards', () => {
    const named = motionChordsById('1-to-6m-desc')!.chords;
    const deceptive = motionChordsById('5-to-6m-deceptive')!.chords;
    expect(named[1].namesMove).toBe(true);
    expect(deceptive[1].namesMove).toBeUndefined();
    for (const settings of EVERY) {
      const placed = placeBass(named, settings);
      expect(jumps(placed)).toEqual(jumps(named));
      const { low, high } = bassWindow(settings.bassRegister);
      for (const c of placed) {
        expect(c.bass as number).toBeGreaterThanOrEqual(low);
        expect(c.bass as number).toBeLessThanOrEqual(high);
      }
    }
  });
});
