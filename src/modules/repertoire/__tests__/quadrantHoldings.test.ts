// @vitest-environment jsdom
/**
 * The snapshot the demotion notice reads.
 *
 * Showing what still holds beside what fell is the point — a list of
 * absences alone does not say where the song is. So the property that
 * matters is that every quadrant reports something, including the
 * empty ones.
 */
import { describe, expect, it } from 'vitest';
import type { SongKey } from '../../../lib/db';
import { KEY_QUADRANTS, quadrantHoldings } from '../matrix/keyProgress';
import {
  DUE_SOON_DEFAULT_DAYS,
  GRACE_DEFAULT_DAYS,
  type DueWindows,
} from '../matrix/keySpacing';

const NOW = 1_760_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const W: DueWindows = {
  dueSoonDays: DUE_SOON_DEFAULT_DAYS,
  graceDays: GRACE_DEFAULT_DAYS,
};
const FAR = NOW + 90 * DAY;
const OVERDUE = NOW - (GRACE_DEFAULT_DAYS + 5) * DAY;

function key(keyName: string, over: Partial<SongKey> = {}): SongKey {
  return {
    id: `sk-${keyName}`, songId: 's1', keyName, isOriginalKey: false,
    keyState: 'comfortable', solidAt: null, solidDecayState: null,
    lastDecayCheckAt: null, livedWithSessionCount: 0,
    livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
    isRetestRecommended: false, lastEngagedAt: NOW, createdAt: 0, updatedAt: 0,
    ...over,
  };
}

const allFar = (names: string[]): ReadonlyMap<string, number | null> =>
  new Map(names.map(n => [`sk-${n}`, FAR]));

describe('the snapshot', () => {
  it('reports one holder per quadrant, and null for the rest', () => {
    const keys = ['C', 'Eb'].map(k => key(k));
    const out = quadrantHoldings(keys, NOW, allFar(['C', 'Eb']), W);
    expect(out.heldByQuadrant).toHaveLength(KEY_QUADRANTS.length);
    expect(out.heldByQuadrant[0]).toBe('C');
    expect(out.heldByQuadrant[1]).toBe('Eb');
    expect(out.heldByQuadrant[2]).toBeNull();
    expect(out.heldByQuadrant[3]).toBeNull();
  });

  it('names only ONE key per quadrant even when several qualify', () => {
    // The rule asks for one key per quadrant, so a second adds nothing
    // to the claim — and naming three where one is required would
    // imply the others were also lost when one lapses.
    const keys = ['C', 'F', 'Bb'].map(k => key(k));
    const out = quadrantHoldings(keys, NOW, allFar(['C', 'F', 'Bb']), W);
    expect(KEY_QUADRANTS[0]).toEqual(['C', 'F', 'Bb']);
    expect(out.heldByQuadrant[0]).toBe('C');
  });

  it('an overdue key holds nothing and is reported as lapsed', () => {
    // Guard the guard: the same key holds its quadrant when not
    // overdue, so the due date is what moves this.
    const keys = [key('A')];
    expect(quadrantHoldings(keys, NOW, allFar(['A']), W).heldByQuadrant[3]).toBe('A');

    const out = quadrantHoldings(keys, NOW, new Map([['sk-A', OVERDUE]]), W);
    expect(out.heldByQuadrant[3]).toBeNull();
    expect(out.lapsedKeys).toEqual(['A']);
  });

  it('ignores keys below comfortable entirely', () => {
    // A key at learning has nothing to lose. It is neither a holder
    // nor a lapse, and reporting it as lapsed would name a key that
    // never held anything.
    const out = quadrantHoldings([key('A', { keyState: 'learning' })], NOW, new Map(), W);
    expect(out.heldByQuadrant[3]).toBeNull();
    expect(out.lapsedKeys).toEqual([]);
  });

  it('a never-proven comfortable key still holds its quadrant', () => {
    // No due date means nothing is overdue — a key cannot lose a rung
    // it has never been asked to re-prove.
    const out = quadrantHoldings([key('A')], NOW, new Map(), W);
    expect(out.heldByQuadrant[3]).toBe('A');
    expect(out.lapsedKeys).toEqual([]);
  });
});
