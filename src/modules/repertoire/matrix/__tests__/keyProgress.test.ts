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
import { DUE_SOON_DEFAULT_DAYS, GRACE_DEFAULT_DAYS, type DueWindows } from '../keySpacing';
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
const W: DueWindows = {
  dueSoonDays: DUE_SOON_DEFAULT_DAYS,
  graceDays: GRACE_DEFAULT_DAYS,
};
/** A due date far enough ahead that the key is comfortably held. */
const FAR = NOW + 90 * MS_PER_DAY;
/** Past due AND past grace. */
const LAPSED = NOW - (GRACE_DEFAULT_DAYS + 5) * MS_PER_DAY;

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
    expect(isHeld(songKey({ keyState: 'comfortable' }), NOW, FAR, W)).toBe(true);
  });

  it('does not hold a key below comfortable', () => {
    expect(isHeld(songKey({ keyState: 'learning' }), NOW, FAR, W)).toBe(false);
  });

  it('reads the DUE DATE, not the old decay column or lastEngagedAt', () => {
    // This replaces a test about live-deriving `solidDecayState`.
    // `isHeld` no longer consults that column OR `lastEngagedAt` — it
    // reads a due date that stretches with each pass. The old fields
    // survive on the row for other readers, so the property worth
    // protecting is that they no longer decide this.
    //
    // Fixture disagrees with itself on purpose: the column says solid,
    // the engagement is months old, and the due date is far ahead.
    // Only the due date is allowed to win.
    const contradictory = songKey({
      keyState: 'solid',
      solidDecayState: 'solid',
      lastEngagedAt: NOW - (DECAY_LAPSED_DAYS + 10) * MS_PER_DAY,
    });
    expect(contradictory.solidDecayState).toBe('solid');
    expect(isHeld(contradictory, NOW, FAR, W)).toBe(true);

    // And the reverse: a freshly-engaged key whose due date has passed
    // grace is NOT held, however recently it was touched. Engagement
    // is not proving.
    const engagedButOverdue = songKey({
      keyState: 'solid', solidDecayState: 'solid', lastEngagedAt: NOW,
    });
    expect(isHeld(engagedButOverdue, NOW, LAPSED, W)).toBe(false);
  });

  it('holds a solid key engaged recently', () => {
    const fresh = songKey({
      keyState: 'solid', solidDecayState: 'solid',
      lastEngagedAt: NOW - 2 * MS_PER_DAY,
    });
    expect(isHeld(fresh, NOW, FAR, W)).toBe(true);
  });

  it('still holds a FADING key — fading is a warning, not a loss', () => {
    const fading = songKey({
      keyState: 'solid', solidDecayState: 'solid',
      lastEngagedAt: NOW - (DECAY_LAPSED_DAYS - 5) * MS_PER_DAY,
    });
    expect(isHeld(fading, NOW, FAR, W)).toBe(true);
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
