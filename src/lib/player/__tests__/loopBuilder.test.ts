/**
 * The loop builder's slots and chords: Silas's spec of 12 Sep 2026, §7.
 */
import { describe, expect, it } from 'vitest';
import { parseSlot } from '../slotChord';
import { loopChords, loopHandTones } from '../loopBuilder';
import { DEFAULT_PLAYER_SETTINGS } from '../settings';
import { placeBass } from '../voices';
import { allVoicings, voicingDistance } from '../../builtAnswers/voiceLeading';

const C = 0;
const F = 5;

describe('a slot is a name or a degree', () => {
  it('reads chord names the way the reader writes them, and the usual other spellings', () => {
    expect(parseSlot('Cmaj7', C)).toMatchObject({ rootPc: 0, qualityId: 'maj7' });
    expect(parseSlot('G7', C)).toMatchObject({ rootPc: 7, qualityId: 'dom7' });
    expect(parseSlot('Dm7', C)).toMatchObject({ rootPc: 2, qualityId: 'min7' });
    expect(parseSlot('F#m7b5', C)).toMatchObject({ rootPc: 6, qualityId: 'm7b5' });
    expect(parseSlot('B♭13', C)).toMatchObject({ rootPc: 10, qualityId: 'dom13' });
    expect(parseSlot('Ebmaj9', C)).toMatchObject({ rootPc: 3, qualityId: 'maj9' });
    expect(parseSlot('A-7', C)).toMatchObject({ rootPc: 9, qualityId: 'min7' });
    expect(parseSlot('C', C)).toMatchObject({ rootPc: 0, qualityId: 'maj' });
  });

  it('reads degrees in the key, a bare degree taking its diatonic quality', () => {
    expect(parseSlot('1', F)).toMatchObject({ rootPc: 5, qualityId: 'maj' });
    expect(parseSlot('2', F)).toMatchObject({ rootPc: 7, qualityId: 'min' });
    expect(parseSlot('5', F)).toMatchObject({ rootPc: 0, qualityId: 'maj' });
    expect(parseSlot('6m', F)).toMatchObject({ rootPc: 2, qualityId: 'min' });
    expect(parseSlot('7', C)).toMatchObject({ rootPc: 11, qualityId: 'dim' });
    expect(parseSlot('57', C)).toMatchObject({ rootPc: 7, qualityId: 'dom7' });
    expect(parseSlot('1maj7', C)).toMatchObject({ rootPc: 0, qualityId: 'maj7' });
  });

  it('a bare raised or lowered degree is major: ♭7 is the ♭VII', () => {
    expect(parseSlot('b7', C)).toMatchObject({ rootPc: 10, qualityId: 'maj' });
    expect(parseSlot('♭6', C)).toMatchObject({ rootPc: 8, qualityId: 'maj' });
    expect(parseSlot('b3m7', C)).toMatchObject({ rootPc: 3, qualityId: 'min7' });
  });

  it('does not parse what it cannot read', () => {
    expect(parseSlot('', C)).toBeNull();
    expect(parseSlot('H7', C)).toBeNull();
    expect(parseSlot('Cfoo', C)).toBeNull();
    expect(parseSlot('8', C)).toBeNull();
  });
});

describe('thickness', () => {
  const maj9 = parseSlot('Cmaj9', C)!.intervals;
  it('thins each chord, the root left to the bass', () => {
    expect(loopHandTones(maj9, 'triads')).toEqual([4, 7]);
    expect(loopHandTones(maj9, 'guide')).toEqual([4, 11]);
    expect(loopHandTones(maj9, 'seventh')).toEqual([4, 7, 11]);
    expect(loopHandTones(maj9, 'full')).toEqual([4, 7, 11, 14]);
  });
});

describe('the loop', () => {
  const opts = {
    startingPosition: 0, thickness: 'seventh' as const, bassDirection: 'nearest' as const, spelling: 'flat' as const,
  };
  const twoFiveOne = ['2m7', '57', '1maj7'].map(s => parseSlot(s, F));

  it('names each chord, and leaves a slot that does not parse out of what sounds', () => {
    const chords = loopChords([...['2', '5', '1'].map(s => parseSlot(s, F)), null], opts);
    expect(chords.map(c => c.name)).toEqual(['Gm', 'C', 'F']);
  });

  it('every chord after the first takes the hand nearest the one before', () => {
    const chords = loopChords(twoFiveOne, opts);
    chords.slice(1).forEach((chord, i) => {
      const pcs = [...new Set(chord.hand.map(m => m % 12))];
      const best = Math.min(...allVoicings(pcs).map(v => voicingDistance(v, chords[i].hand)));
      expect(voicingDistance(chord.hand, chords[i].hand)).toBe(best);
    });
  });

  it('the starting position puts a different note at the bottom of the first hand', () => {
    const at = (p: number) => loopChords(twoFiveOne, { ...opts, startingPosition: p })[0].hand[0] % 12;
    expect(new Set([0, 1, 2].map(at)).size).toBe(3);
  });

  it('Up and Down name the move, so the register keeps every jump; Nearest does not', () => {
    for (const bassDirection of ['up', 'down'] as const) {
      const chords = loopChords(twoFiveOne, { ...opts, bassDirection });
      expect(chords.slice(1).every(c => c.namesMove === true)).toBe(true);
      const jumps = (cs: typeof chords) => cs.slice(1).map((c, i) => (c.bass as number) - (cs[i].bass as number));
      for (const bassRegister of ['c1', 'c2', 'c3'] as const) {
        const placed = placeBass(chords, { ...DEFAULT_PLAYER_SETTINGS, bassRegister });
        expect(jumps(placed)).toEqual(jumps(chords));
        for (const j of jumps(chords)) expect(bassDirection === 'up' ? j > 0 : j < 0).toBe(true);
      }
    }
    expect(loopChords(twoFiveOne, opts).some(c => c.namesMove === true)).toBe(false);
  });
});
