/**
 * The Harmonic Diary plays the right chord for every entry.
 *
 * =====================================================================
 * ELEVEN CHORDS USED TO SOUND AS C E G. The diary looked chord
 * recognition's ids up in a different table and fell back to a major
 * triad on every miss. Silas: "the major 9(13), the dom7sus4, the
 * dom9(13) all sound the exact same." 10 Sep 2026.
 *
 * So every chord-recognition card is read through `cardSound`, and what
 * the player panel would sound for it is compared with the seed Chord
 * Recognition itself plays from.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { CHORD_SEEDS } from '../../ear-training/chord-recognition/seed';
import { CHORD_QUALITIES, QUALITY_INTERVALS } from '../../shapes-and-patterns/catalog';
import { placeBass, soundingNotes } from '../../../lib/player/voices';
import { DEFAULT_PLAYER_SETTINGS } from '../../../lib/player/settings';
import { cardSound, diaryChordShape } from '../cardSound';

const pcs = (notes: readonly number[]) =>
  [...new Set(notes.map(n => ((n % 12) + 12) % 12))].sort((a, b) => a - b);

/** WHAT THE PANEL WOULD SOUND for a chord card, Forward bass and all. */
function chordNotes(skillId: string): number[] | null {
  const sound = cardSound(skillId);
  if (sound === null || sound.kind !== 'chord') return null;
  const s = DEFAULT_PLAYER_SETTINGS;
  return soundingNotes(placeBass([sound.chord], s)[0], s).notes;
}

function playCR(id: string): number[] {
  const notes = chordNotes(`chord-recognition:item:${id}`);
  expect(notes, id).not.toBeNull();
  return notes!;
}

describe('chord-recognition entries play their own chord', () => {
  it('every item sounds the seed’s notes — or, where Silas’s shape voices it, the shape’s', () => {
    const SHAPED: Record<string, number[] | 'exact'> = {
      dim7: 'exact', 'dom7#9#5': 'exact', maj9: 'exact', min9: 'exact', min6_9: 'exact',
      // The two 13 chords are played with the 5th left out (11 Sep
      // 2026), so what sounds is his hand rather than the seed's stack:
      // 1 3 13 ♭7 9 on the dominant, 1 3 13 7 9 on the major.
      dom13: [0, 4, 9, 10, 14],
      maj13: [0, 4, 9, 11, 14],
    };
    for (const seed of CHORD_SEEDS) {
      const notes = playCR(seed.id);
      const shaped = SHAPED[seed.id];
      const want = shaped === undefined || shaped === 'exact' ? seed.intervals : shaped;
      expect(pcs(notes), seed.id).toEqual(pcs(want));
      // Never more than the chord: every sounding note is one of the seed's.
      for (const pc of pcs(notes)) expect(pcs(seed.intervals), seed.id).toContain(pc);
    }
  });

  it('no two items with different intervals sound the same', () => {
    const byItem = new Map<string, string>();
    // THE NOTES AS PLAYED, not their pitch classes: an add2 and an add9
    // share theirs and still sound different — the 2 is inside the
    // chord, the 9 an octave up.
    for (const seed of CHORD_SEEDS) {
      byItem.set(seed.id, [...playCR(seed.id)].sort((a, b) => a - b).join(','));
    }
    for (const a of CHORD_SEEDS) {
      for (const b of CHORD_SEEDS) {
        if (a.id >= b.id || a.intervals.join() === b.intervals.join()) continue;
        expect(byItem.get(a.id), `${a.id} vs ${b.id}`).not.toBe(byItem.get(b.id));
      }
    }
    // Guard: the three Silas named are three different sounds. Two of
    // those cards were retired on 11 Sep 2026, so this is the chord
    // each of them folded into.
    const named = ['maj13', 'dom7sus4', 'dom13'].map(id => byItem.get(id));
    expect(new Set(named).size).toBe(3);
    expect(pcs((byItem.get('dom7sus4') ?? '').split(',').map(Number)))
      .not.toEqual(pcs(QUALITY_INTERVALS.maj));
  });

  it('an id the seed does not have has nothing to hear, not a major triad', () => {
    expect(cardSound('chord-recognition:item:not-a-chord')).toBeNull();
  });
});

describe('shapes-and-patterns chord-shape entries read the id, not the name', () => {
  it('every catalog quality resolves — an unknown one is a failure here, never a major triad', () => {
    for (const q of CHORD_QUALITIES) {
      const shape = diaryChordShape(`${q.id}:C`);
      expect(shape, q.id).not.toBeNull();
      expect(shape!.intervals, q.id).toEqual(QUALITY_INTERVALS[q.id]);
    }
    expect(diaryChordShape('not-a-quality:C')).toBeNull();
  });

  it('a renamed entry still plays its own chord, in its own key', () => {
    expect(pcs(chordNotes('shapes-and-patterns:chord-shape:min7:F')!)).toEqual(pcs([5, 8, 12, 15]));
  });
});

describe('every diary chord through the shared player, in one register', () => {
  it('a shaped and a stacked entry on the same root share their bass note', () => {
    // maj9 is voiced by Silas's shape, min11 by the seed's stack.
    const shaped = playCR('maj9');
    const stacked = playCR('min11');
    expect(shaped[0]).toBe(stacked[0]);
    // And the bass is the root: C.
    expect(shaped[0] % 12).toBe(0);
    // Every stacked entry takes that same bass, whatever its thickness.
    for (const id of ['maj', 'dom7sus4', 'add2', 'min11', 'dom7b9']) {
      expect(playCR(id)[0], id).toBe(shaped[0]);
    }
  });

  it('the bass sits under the hand on every item', () => {
    for (const seed of CHORD_SEEDS) {
      const [bass, ...hand] = playCR(seed.id);
      expect(Math.min(...hand), seed.id).toBeGreaterThan(bass);
    }
  });
});
