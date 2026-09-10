/**
 * The shared list, and the voicing it plays.
 *
 * =====================================================================
 * THE CARD MUST PLAY WHAT THE GRID DRILLS, NOTE FOR NOTE.
 *
 * That is the whole claim of this surface: "which position was that"
 * is only a real question if the positions are the ones on Chord
 * Movements & Passes. So the extended rung is checked against Silas's
 * own notes, spelled back out, the same way `extendedVoicings.test.ts`
 * checks the table itself.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  LIST_RUNGS, SHARED_PROGRESSIONS, SHARED_PROGRESSION_BY_ID,
  fullProgressionItemId, positionsOf,
} from '../sharedList';
import { voiceEntry } from '../passVoicing';
import { VOICE_LEADING_PATTERNS } from '../../../shapes-and-patterns/catalog';
import {
  EXTENDED_QUALITY_OF, extendedShape,
} from '../../../../lib/extendedVoicings';
import { voicingDistance } from '../../../../lib/builtAnswers/voiceLeading';

const NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const spell = (m: number) => NAMES[((m % 12) + 12) % 12];

/** One entry voiced, as `bass | hand` per chord. */
function played(
  id: string, rung: 'guide' | 'seventh' | 'full', position: number, keyPc: number,
): string[] {
  const entry = SHARED_PROGRESSION_BY_ID.get(id)!;
  return voiceEntry(entry, keyPc, rung, position)
    .map(c => `${c.bass === null ? '-' : spell(c.bass)} | ${c.hand.map(spell).join(' ')}`);
}

describe('the list is the grid, plus the doors into one loop', () => {
  it('has one entry per row and three for the 1 5 6 4', () => {
    expect(SHARED_PROGRESSIONS).toHaveLength(VOICE_LEADING_PATTERNS.length + 2);
    expect(SHARED_PROGRESSIONS.filter(p => p.patternId === '1-5-6-4').map(p => p.id))
      .toEqual(['1-5-6-4', '6-4-1-5', '4-1-5-6']);
  });

  it('rotates the chords of each door rather than renaming one', () => {
    const one = SHARED_PROGRESSION_BY_ID.get('1-5-6-4')!;
    const six = SHARED_PROGRESSION_BY_ID.get('6-4-1-5')!;
    expect(one.chords.map(c => c.degree)).toEqual(['1', '5', '6', '4']);
    expect(six.chords.map(c => c.degree)).toEqual(['6', '4', '1', '5']);
  });

  it('gives each pass the one rung it is', () => {
    // A pass is a voicing, not a progression played thicker or thinner.
    expect(SHARED_PROGRESSION_BY_ID.get('minor-aba')!.rungs).toEqual(['full']);
    expect(SHARED_PROGRESSION_BY_ID.get('dom7b9')!.rungs).toEqual(['full']);
    expect(SHARED_PROGRESSION_BY_ID.get('dim7')!.rungs).toEqual(['seventh']);
    expect(SHARED_PROGRESSION_BY_ID.get('diatonic-cycle')!.rungs).toEqual(['seventh']);
  });

  it('counts positions off the grid, not off a list of its own', () => {
    const major = SHARED_PROGRESSION_BY_ID.get('major-251')!;
    expect(positionsOf(major, 'guide')).toEqual([1, 2]);
    expect(positionsOf(major, 'seventh')).toEqual([1, 2, 3]);
    expect(positionsOf(major, 'full')).toEqual([1, 2]);
    expect(positionsOf(SHARED_PROGRESSION_BY_ID.get('dom7b9')!, 'full'))
      .toEqual([1, 2, 3, 4]);
  });

  it('offers the surprise landing only on the two dark-tension passes', () => {
    expect(SHARED_PROGRESSIONS.filter(p => p.otherLanding !== null).map(p => p.id))
      .toEqual(['minor-aba', 'dom7b9']);
  });

  it('files a card under its entry and its position', () => {
    expect(fullProgressionItemId('major-251', 2))
      .toBe('full-progression:major-251:pos2');
  });

  it('voices every card the list can deal', () => {
    // A SWEEP. Every entry, every rung it offers, every position of
    // that rung, in three keys — none of them may come back silent.
    for (const entry of SHARED_PROGRESSIONS) {
      for (const rung of LIST_RUNGS) {
        for (const position of positionsOf(entry, rung)) {
          for (const keyPc of [0, 5, 10]) {
            const chords = voiceEntry(entry, keyPc, rung, position);
            const where = `${entry.id} ${rung} P${position} key ${keyPc}`;
            expect(chords, where).toHaveLength(entry.chords.length);
            for (const c of chords) {
              expect(c.hand.length, where).toBeGreaterThan(0);
              expect([...c.hand].sort((a, b) => a - b), where).toEqual(c.hand);
            }
          }
        }
      }
    }
  });
});

describe("the extended rung is Silas's own shapes", () => {
  it('plays the major 2 5 1 as stage 9 writes both runs', () => {
    // ABA — D + [F, A, C, E] · G + [F, A, B, E] · C + [E, G, B, D]
    expect(played('major-251', 'full', 1, 0)).toEqual([
      'D | F A C E', 'G | F A B E', 'C | E G B D',
    ]);
    // BAB — D + [C, E, F, A] · G + [B, E, F, A] · C + [B, D, E, G]
    expect(played('major-251', 'full', 2, 0)).toEqual([
      'D | C E F A', 'G | B E F A', 'C | B D E G',
    ]);
  });

  it('plays the minor 2 5 1 as stage 10 writes both runs', () => {
    // The left hand's second note is part of the shape and sounds.
    expect(played('minor-251', 'full', 1, 2)).toEqual([
      'E | A B♭ D G', 'A | G D♭ F', 'D | F A C E',
    ]);
    expect(played('minor-251', 'full', 2, 2)).toEqual([
      'E | B♭ D G A', 'A | D♭ F G C', 'D | C E F A',
    ]);
  });

  it('plays 5 → 1 from the first chord, both ways round', () => {
    // =================================================================
    // POSITION 1 IS THE FIRST CHORD IN ITS A SHAPE, WHICH ON THIS PASS
    // IS THE DOMINANT.
    //
    // It used to be the other way round: the old rule made the dominant
    // take B in Position 1, which is Position 2's shape. Silas ruled on
    // 10 Sep 2026 that the position names the row's first chord.
    //
    // A of the dominant 9(13) is `3 13 ♭7 9`; B of the major 9 is
    // `7 9 3 5`. In the key of C: G + [B, E, F, A], then C + [B, D, E, G].
    // =================================================================
    expect(played('five-one', 'full', 1, 0)).toEqual([
      'G | B E F A', 'C | B D E G',
    ]);
    // Position 2 is the same two chords with the letters swapped.
    expect(played('five-one', 'full', 2, 0)).toEqual([
      'G | F A B E', 'C | E G B D',
    ]);
  });

  it("alternates the 7♯9♯5 pass's own two shapes", () => {
    // Stage 5: start with the A position, or start with the B. The
    // minor ninth it lands on takes the other letter so the two hands
    // still alternate — a derivation, and it is in the report.
    expect(played('minor-aba', 'full', 1, 0)).toEqual([
      'G | B E♭ F B♭', 'C | B♭ D E♭ G',
    ]);
    expect(played('minor-aba', 'full', 2, 0)).toEqual([
      'G | F B♭ B E♭', 'C | E♭ G B♭ D',
    ]);
  });

  it('gives the 7♭9 pass its own ninth and no other', () => {
    // A natural 9 a semitone off the ♭9 would be a chord nobody asked
    // for — the ruling `NINTH_OF` already states.
    const [dominant] = played('dom7b9', 'full', 1, 1);
    expect(dominant).toBe('A♭ | C E♭ G♭ A');
  });
});

describe('a loop takes the nearer shape, not the alternating one', () => {
  /**
   * =====================================================================
   * A CADENCE ALTERNATES; A LOOP GOES WHEREVER IS NEAREST.
   *
   * Silas's ruling of 10 Sep 2026. Going round a loop, a hand takes
   * whichever of the two shapes is the smaller move from the chord
   * before — which is not always the one alternation would pick.
   * =====================================================================
   */
  it('gives every chord after the first the nearer of its two shapes', () => {
    const entry = SHARED_PROGRESSION_BY_ID.get('1-5-6-4')!;
    const chords = voiceEntry(entry, 0, 'full', 1);
    expect(chords).toHaveLength(4);

    // Rebuild each chord's two candidate hands from Silas's table and
    // check the one that sounded is the nearer to the hand before it.
    for (let i = 1; i < chords.length; i += 1) {
      const previous = chords[i - 1].hand;
      const quality = EXTENDED_QUALITY_OF[entry.chords[i].quality]!;
      const rootPc = ((chords[i].rootPc % 12) + 12) % 12;
      const candidates: number[][] = [];
      for (const letter of ['A', 'B'] as const) {
        const shape = extendedShape(quality, letter);
        if (shape === null) continue;
        // The same fold and window `passVoicing` places with.
        const drop = Math.floor(shape.right[0] / 12) * 12;
        const tones = shape.right.map(t => t - drop);
        for (let root = rootPc; root + tones[0] <= 84; root += 12) {
          const placed = tones.map(t => root + t);
          if (placed[0] >= 50 && placed[placed.length - 1] <= 84) {
            candidates.push(placed);
          }
        }
      }
      const distances = candidates.map(v => voicingDistance(v, previous));
      const best = Math.min(...distances);
      expect(voicingDistance(chords[i].hand, previous), `chord ${i}`).toBe(best);
    }
  });

  it('still starts on the shape the position names', () => {
    // Only the chords AFTER the first are chosen by ear. The first is
    // what Position 1 and Position 2 mean.
    const entry = SHARED_PROGRESSION_BY_ID.get('1-5-6-4')!;
    const one = voiceEntry(entry, 0, 'full', 1)[0];
    const two = voiceEntry(entry, 0, 'full', 2)[0];
    // maj9 A is `3 5 7 9`; maj9 B is `7 9 3 5`.
    expect(one.hand.map(spell)).toEqual(['E', 'G', 'B', 'D']);
    expect(two.hand.map(spell)).toEqual(['B', 'D', 'E', 'G']);
  });

  it('names the first chord of a ROTATED loop, not the row\'s', () => {
    // "6 4 1 5" is the same row entered by a different door, so
    // Position 1 is the 6 minor in its A shape — `♭3 5 ♭7 9`.
    const six = voiceEntry(SHARED_PROGRESSION_BY_ID.get('6-4-1-5')!, 0, 'full', 1);
    expect(six[0].hand.map(spell)).toEqual(['C', 'E', 'G', 'B']);
  });
});

describe('the positions really differ', () => {
  it('gives every position of a rung a different first chord', () => {
    for (const entry of SHARED_PROGRESSIONS) {
      for (const rung of LIST_RUNGS) {
        const positions = positionsOf(entry, rung);
        if (positions.length < 2) continue;
        const firsts = positions.map(
          p => voiceEntry(entry, 0, rung, p)[0]?.hand.join(','),
        );
        expect(new Set(firsts).size, `${entry.id} ${rung}`).toBe(positions.length);
      }
    }
  });
});
