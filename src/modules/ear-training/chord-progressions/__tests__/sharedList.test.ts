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
