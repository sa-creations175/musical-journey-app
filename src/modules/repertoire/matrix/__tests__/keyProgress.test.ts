// @vitest-environment jsdom
/**
 * Quadrant membership and key-hold predicates.
 *
 * The property worth protecting here is that the quadrants are
 * DERIVED from the matrix's own key cycle. Written out by hand from
 * the design's spelling ("G♭") they would match nothing, because
 * `songKeys.keyName` spells that key F# — a rule silently dead on a
 * twelfth of the keyboard, with nothing on screen to show for it.
 * So the first test asserts the derivation itself, not the contents.
 */
import { describe, expect, it } from 'vitest';
import type { SongKey, SongKeyState } from '../../../../lib/db';
import { CIRCLE_OF_FOURTHS_KEYS } from '../keys';
import { DECAY_LAPSED_DAYS, MS_PER_DAY } from '../solidDecay';
import {
  KEY_QUADRANTS,
  QUADRANT_COUNT,
  QUADRANT_SIZE,
  coveredQuadrants,
  isComfortableOrBetter,
  isHeld,
  quadrantLabel,
  quadrantOf,
} from '../keyProgress';

const NOW = 1_760_000_000_000;

function songKey(over: Partial<SongKey> = {}): SongKey {
  return {
    id: 'sk1', songId: 's1', keyName: 'C', isOriginalKey: false,
    keyState: 'comfortable', solidAt: null, solidDecayState: null,
    lastDecayCheckAt: null, livedWithSessionCount: 0,
    livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
    isRetestRecommended: false, lastEngagedAt: NOW, createdAt: 0, updatedAt: 0,
    ...over,
  };
}

describe('quadrants are derived from the matrix key cycle', () => {
  it('flatten back to the cycle, in order', () => {
    // THE LOAD-BEARING ASSERTION. Any hand-written table — including
    // one spelled the way the design states it, with G♭ — stops
    // equalling the cycle and fails here. Contents are checked below
    // as well, but this is the one that catches a rewrite.
    expect(KEY_QUADRANTS.flat()).toEqual([...CIRCLE_OF_FOURTHS_KEYS]);
  });

  it('are four groups of three covering all twelve keys exactly once', () => {
    expect(QUADRANT_COUNT).toBe(4);
    expect(KEY_QUADRANTS).toHaveLength(4);
    for (const q of KEY_QUADRANTS) expect(q).toHaveLength(QUADRANT_SIZE);
    expect(new Set(KEY_QUADRANTS.flat()).size).toBe(12);
  });

  it('group the keys the design asked for', () => {
    // Same grouping as the spec, in the matrix's spelling. Stated
    // positively rather than as "not the Gb version" — an inequality
    // would pass for reasons that have nothing to do with the split.
    expect(KEY_QUADRANTS).toEqual([
      ['C', 'F', 'Bb'],
      ['Eb', 'Ab', 'Db'],
      ['F#', 'B', 'E'],
      ['A', 'D', 'G'],
    ]);
  });

  it('agree with quadrantOf for every key in the cycle', () => {
    for (const [i, quadrant] of KEY_QUADRANTS.entries()) {
      for (const key of quadrant) expect(quadrantOf(key)).toBe(i);
    }
  });
});

describe('quadrantOf', () => {
  it('places F#, the spelling songKeys actually stores', () => {
    expect(quadrantOf('F#')).toBe(2);
  });

  it('does NOT place Gb, the spelling the other circle module uses', () => {
    // repertoire/circleOfFourths.ts spells this key Gb and its
    // canonicaliseKey maps F# → Gb, i.e. into the vocabulary the
    // matrix does not use. A caller handing us that spelling has a
    // bug; returning null lets it show up as an uncovered quadrant
    // rather than being filed under quadrant 0.
    expect(quadrantOf('Gb')).toBeNull();
  });

  it('returns null for a non-canonical key, which materialise can leave behind', () => {
    expect(quadrantOf('D minor')).toBeNull();
  });
});

describe('coveredQuadrants', () => {
  it('collapses several keys from one quadrant to a single entry', () => {
    // Guard the guard: these three are all quadrant 0, so a function
    // that counted keys instead of quadrants would return 3 here.
    expect(KEY_QUADRANTS[0]).toEqual(['C', 'F', 'Bb']);
    expect(coveredQuadrants(['C', 'F', 'Bb'])).toEqual(new Set([0]));
  });

  it('counts one key from each quadrant as full coverage', () => {
    expect(coveredQuadrants(['C', 'Ab', 'B', 'D'])).toEqual(new Set([0, 1, 2, 3]));
  });

  it('ignores spellings it cannot place rather than throwing', () => {
    expect(coveredQuadrants(['C', 'Gb', 'nonsense'])).toEqual(new Set([0]));
  });
});

describe('isComfortableOrBetter', () => {
  it('counts solid, which is comfortable plus a passed whole-song test', () => {
    expect(isComfortableOrBetter('solid')).toBe(true);
  });

  it('counts comfortable', () => {
    expect(isComfortableOrBetter('comfortable')).toBe(true);
  });

  it('excludes the states below it', () => {
    const below: SongKeyState[] = ['not_started', 'learning'];
    for (const s of below) expect(isComfortableOrBetter(s)).toBe(false);
  });
});

describe('isHeld', () => {
  it('holds a comfortable key', () => {
    expect(isHeld(songKey({ keyState: 'comfortable' }), NOW)).toBe(true);
  });

  it('does not hold a key below comfortable', () => {
    expect(isHeld(songKey({ keyState: 'learning' }), NOW)).toBe(false);
  });

  it('LIVE-DERIVES the lapse instead of trusting the stored column', () => {
    // The column is a snapshot written on save and goes stale by
    // design: a key that drifts solid → lapsed while the song sits
    // unopened still reads 'solid' until the next engagement. Reading
    // it would mean a key untouched for months counted as held.
    const stale = songKey({
      keyState: 'solid',
      // Guard the guard: the fixture's column must genuinely disagree
      // with reality, or this cannot tell derive from read.
      solidDecayState: 'solid',
      lastEngagedAt: NOW - (DECAY_LAPSED_DAYS + 10) * MS_PER_DAY,
    });
    expect(stale.solidDecayState).toBe('solid');
    expect(isHeld(stale, NOW)).toBe(false);
  });

  it('holds a solid key engaged recently', () => {
    const fresh = songKey({
      keyState: 'solid', solidDecayState: 'solid',
      lastEngagedAt: NOW - 2 * MS_PER_DAY,
    });
    expect(isHeld(fresh, NOW)).toBe(true);
  });

  it('still holds a FADING key — fading is a warning, not a loss', () => {
    const fading = songKey({
      keyState: 'solid', solidDecayState: 'solid',
      lastEngagedAt: NOW - (DECAY_LAPSED_DAYS - 5) * MS_PER_DAY,
    });
    expect(isHeld(fading, NOW)).toBe(true);
  });
});

describe('quadrantLabel', () => {
  it('names the quadrant from its own members', () => {
    // The quadrant holds the IDENTITY names; the label reads them in the
    // user's spelling. Both assertions matter: the membership is F#, the
    // reading is G♭.
    expect(quadrantLabel(2, 'flat')).toBe('G\u266D · B · E');
    expect(quadrantLabel(2, 'sharp')).toBe('F\u266F · B · E');
    expect(KEY_QUADRANTS[2]).toContain('F#');
  });

  it('is empty for a quadrant that does not exist', () => {
    expect(quadrantLabel(9, 'flat')).toBe('');
  });
});
