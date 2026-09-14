/**
 * A diary progression card as the loop builder's slots (spec §7).
 *
 * The card and the builder are one sound only if every slot reads back
 * as the chord the card was built from, so every catalog entry is held.
 */
import { describe, expect, it } from 'vitest';
import { motionChordsById, progressionChordsById, slotOf } from '../diaryPlayback';
import { PROGRESSIONS } from '../catalog';
import { parseSlot } from '../../../../lib/player/slotChord';

describe('a card as loop-builder slots', () => {
  it('writes a numeral and its quality as a degree and the seventh chord it sounds', () => {
    expect(slotOf('ii', 'minor')).toBe('2m7');
    expect(slotOf('V', 'dominant')).toBe('57');
    expect(slotOf('I', 'major')).toBe('1maj7');
    expect(slotOf('bVII', 'major')).toBe('b7maj7');
  });

  it('gives every catalog progression one slot a chord, each on the root it sounds', () => {
    for (const p of PROGRESSIONS) {
      const built = progressionChordsById(p.id)!;
      expect(built.slots, p.id).toHaveLength(built.chords.length);
      built.slots.forEach((text, i) => {
        const parsed = parseSlot(text, built.keyPc);
        expect(parsed, `${p.id} ${text}`).not.toBeNull();
        expect(parsed!.rootPc, `${p.id} ${text}`).toBe(built.chords[i].rootPc);
      });
    }
  });

  it('a motion card names its direction; a deceptive one names none', () => {
    expect(motionChordsById('1-to-5-asc')!.bassDirection).toBe('up');
    expect(motionChordsById('5-to-1-desc')!.bassDirection).toBe('down');
    expect(motionChordsById('5-to-6m-deceptive')!.bassDirection).toBeUndefined();
    expect(motionChordsById('2-to-5-asc')!.slots).toEqual(['2m7', '57']);
  });
});
