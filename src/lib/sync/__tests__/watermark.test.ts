// @vitest-environment jsdom
/**
 * Tests for the incremental-pull watermarks.
 *
 * The invariant under test throughout: a watermark may lag, never lead.
 * Lagging re-pulls rows the device already has; leading skips rows it
 * has never seen, and nothing later corrects that. So the assertions
 * below are mostly about which way each edge case resolves.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SWEEP_INTERVAL_MS,
  SWEEP_KEY_PREFIX,
  WATERMARK_KEY_PREFIX,
  WATERMARK_OVERLAP_MS,
  advanceWatermark,
  applyOverlap,
  clearAllWatermarks,
  isSweepDue,
  laterTimestamp,
  parseTimestamp,
  pullSince,
  readWatermark,
  recordSweepAt,
  sweepKey,
  watermarkKey,
} from '../watermark';

const USER = 'user-1';
const OTHER_USER = 'user-2';
const TABLE = 'attempts';

/** Postgres timestamptz as PostgREST actually renders it — microsecond
 *  precision and a numeric offset, not a `Z`. */
const PG_TS = '2026-08-13T10:23:45.123456+00:00';

beforeEach(() => {
  localStorage.clear();
});

describe('parseTimestamp', () => {
  it('parses the microsecond-precision offset form Postgres returns', () => {
    // Truncates to ms — that is expected and harmless (the overlap
    // window is 60s), but it must not fail to parse.
    expect(parseTimestamp(PG_TS)).toBe(Date.UTC(2026, 7, 13, 10, 23, 45, 123));
  });

  it('returns null for absent or unparseable values', () => {
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('not a timestamp')).toBeNull();
  });
});

describe('laterTimestamp', () => {
  it('orders by parsed instant, NOT by string comparison', () => {
    // The trap this guards: an offset-bearing string can sort AFTER a
    // UTC string lexicographically while representing an EARLIER
    // instant. Here `earlier` is 08:00Z and `later` is 09:00Z, but
    // 'T10:00:00+02:00' > 'T09:00:00Z' as plain strings.
    const earlier = '2026-08-13T10:00:00+02:00'; // 08:00:00Z
    const later = '2026-08-13T09:00:00Z'; // 09:00:00Z
    expect(earlier > later).toBe(true); // the wrong answer, confirmed
    expect(parseTimestamp(earlier)! < parseTimestamp(later)!).toBe(true);
    expect(laterTimestamp(earlier, later)).toBe(later);
    expect(laterTimestamp(later, earlier)).toBe(later);
  });

  it('prefers whichever side parses when the other does not', () => {
    expect(laterTimestamp(null, PG_TS)).toBe(PG_TS);
    expect(laterTimestamp(PG_TS, 'garbage')).toBe(PG_TS);
    expect(laterTimestamp('garbage', PG_TS)).toBe(PG_TS);
  });

  it('returns null only when neither side parses', () => {
    expect(laterTimestamp(null, undefined)).toBeNull();
    expect(laterTimestamp('garbage', '')).toBeNull();
  });

  it('keeps the incumbent on an exact tie', () => {
    // Same instant, two spellings. Either is correct; what matters is
    // that it does not thrash between them on every pull.
    const a = '2026-08-13T09:00:00Z';
    const b = '2026-08-13T11:00:00+02:00';
    expect(parseTimestamp(a)).toBe(parseTimestamp(b));
    expect(laterTimestamp(a, b)).toBe(a);
  });
});

describe('applyOverlap', () => {
  it('rewinds by exactly the overlap window', () => {
    const out = applyOverlap(PG_TS);
    expect(parseTimestamp(out)).toBe(parseTimestamp(PG_TS)! - WATERMARK_OVERLAP_MS);
  });

  it('emits a form Postgres can consume in a .gt() filter', () => {
    // toISOString(), i.e. UTC with a Z suffix — round-trips through
    // Date.parse, which is the property the pull path depends on.
    const out = applyOverlap(PG_TS)!;
    expect(out.endsWith('Z')).toBe(true);
    expect(Number.isNaN(Date.parse(out))).toBe(false);
  });

  it('returns null for unparseable input, so the caller pulls everything', () => {
    expect(applyOverlap(null)).toBeNull();
    expect(applyOverlap('garbage')).toBeNull();
  });
});

describe('readWatermark / pullSince', () => {
  it('returns null when no mark has been stored', () => {
    expect(readWatermark(USER, TABLE)).toBeNull();
    expect(pullSince(USER, TABLE)).toBeNull();
  });

  it('stores the Postgres string verbatim, and applies overlap on read', () => {
    advanceWatermark(USER, TABLE, PG_TS);
    // Raw read is byte-identical to what Postgres gave us...
    expect(readWatermark(USER, TABLE)).toBe(PG_TS);
    // ...while the pull-facing read is rewound.
    expect(parseTimestamp(pullSince(USER, TABLE))).toBe(
      parseTimestamp(PG_TS)! - WATERMARK_OVERLAP_MS,
    );
  });

  it('falls back to a full pull when storage throws', () => {
    advanceWatermark(USER, TABLE, PG_TS);
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    try {
      expect(readWatermark(USER, TABLE)).toBeNull();
      expect(pullSince(USER, TABLE)).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('scopes marks per user, so a second account cannot inherit one', () => {
    advanceWatermark(USER, TABLE, PG_TS);
    expect(readWatermark(OTHER_USER, TABLE)).toBeNull();
    expect(watermarkKey(USER, TABLE)).not.toBe(watermarkKey(OTHER_USER, TABLE));
  });

  it('scopes marks per table', () => {
    advanceWatermark(USER, TABLE, PG_TS);
    expect(readWatermark(USER, 'drill_sessions')).toBeNull();
  });
});

describe('advanceWatermark', () => {
  it('advances to a later candidate and persists it', () => {
    advanceWatermark(USER, TABLE, '2026-08-13T09:00:00Z');
    const returned = advanceWatermark(USER, TABLE, '2026-08-13T10:00:00Z');
    expect(returned).toBe('2026-08-13T10:00:00Z');
    expect(localStorage.getItem(watermarkKey(USER, TABLE))).toBe(
      '2026-08-13T10:00:00Z',
    );
  });

  it('REFUSES to move backwards on an older candidate', () => {
    // An out-of-order or replayed pull result must not rewind a mark
    // past rows already read — though note that rewinding is the safe
    // direction, so this is about stability, not correctness.
    advanceWatermark(USER, TABLE, '2026-08-13T10:00:00Z');
    const returned = advanceWatermark(USER, TABLE, '2026-08-13T09:00:00Z');
    expect(returned).toBe('2026-08-13T10:00:00Z');
    expect(localStorage.getItem(watermarkKey(USER, TABLE))).toBe(
      '2026-08-13T10:00:00Z',
    );
  });

  it('ignores an unparseable candidate rather than clobbering the mark', () => {
    advanceWatermark(USER, TABLE, PG_TS);
    expect(advanceWatermark(USER, TABLE, 'garbage')).toBe(PG_TS);
    expect(advanceWatermark(USER, TABLE, null)).toBe(PG_TS);
    expect(localStorage.getItem(watermarkKey(USER, TABLE))).toBe(PG_TS);
  });

  it('leaves no mark at all when the first candidate is unparseable', () => {
    expect(advanceWatermark(USER, TABLE, 'garbage')).toBeNull();
    expect(localStorage.getItem(watermarkKey(USER, TABLE))).toBeNull();
  });

  it('keeps the old mark when the write fails, rather than reporting a new one', () => {
    // A caller that believed the write landed would skip those rows on
    // the next pull. Reporting the value actually in force keeps the
    // failure on the lagging side.
    advanceWatermark(USER, TABLE, '2026-08-13T09:00:00Z');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    try {
      expect(advanceWatermark(USER, TABLE, '2026-08-13T10:00:00Z')).toBe(
        '2026-08-13T09:00:00Z',
      );
    } finally {
      spy.mockRestore();
    }
    expect(readWatermark(USER, TABLE)).toBe('2026-08-13T09:00:00Z');
  });
});

describe('clearAllWatermarks', () => {
  it('removes every watermark across users and tables', () => {
    advanceWatermark(USER, TABLE, PG_TS);
    advanceWatermark(USER, 'drill_sessions', PG_TS);
    advanceWatermark(OTHER_USER, TABLE, PG_TS);
    clearAllWatermarks();
    expect(readWatermark(USER, TABLE)).toBeNull();
    expect(readWatermark(USER, 'drill_sessions')).toBeNull();
    expect(readWatermark(OTHER_USER, TABLE)).toBeNull();
  });

  it('touches only prefixed keys', () => {
    localStorage.setItem('devMode', 'true');
    localStorage.setItem('unrelated', 'keep me');
    advanceWatermark(USER, TABLE, PG_TS);
    clearAllWatermarks();
    expect(localStorage.getItem('devMode')).toBe('true');
    expect(localStorage.getItem('unrelated')).toBe('keep me');
    expect(
      Object.keys(localStorage).filter(k => k.startsWith(WATERMARK_KEY_PREFIX)),
    ).toHaveLength(0);
  });

  it('clears sweep markers too, not just watermarks', () => {
    // Both describe local rows. A sweep marker outliving its rows would
    // suppress the next orphan check on a database that no longer has
    // the rows it was reasoning about.
    advanceWatermark(USER, TABLE, PG_TS);
    recordSweepAt(USER, TABLE, 1_000);
    clearAllWatermarks();
    expect(localStorage.getItem(sweepKey(USER, TABLE))).toBeNull();
    expect(
      Object.keys(localStorage).filter(k => k.startsWith(SWEEP_KEY_PREFIX)),
    ).toHaveLength(0);
  });
});

describe('orphan-sweep cadence', () => {
  const NOW = 1_700_000_000_000;

  it('is due when the table has never swept, regardless of the clock', () => {
    // The rollout property: first pull after this ships has no sweep
    // marker and no watermark, so it behaves exactly as pulls did
    // before — full content, full orphan check.
    //
    // The `now` values matter. Asserting only at a realistic epoch
    // would pass even without the explicit absent-marker branch, since
    // Number(null) is 0 and `hugeEpoch - 0 >= INTERVAL` is true by
    // accident. Pinning now=0 forces the branch to exist.
    expect(isSweepDue(USER, TABLE, NOW)).toBe(true);
    expect(isSweepDue(USER, TABLE, 0)).toBe(true);
    expect(isSweepDue(USER, TABLE, SWEEP_INTERVAL_MS - 1)).toBe(true);
  });

  it('is not due again immediately after a sweep', () => {
    recordSweepAt(USER, TABLE, NOW);
    expect(isSweepDue(USER, TABLE, NOW)).toBe(false);
    expect(isSweepDue(USER, TABLE, NOW + SWEEP_INTERVAL_MS - 1)).toBe(false);
  });

  it('comes due again once the interval has elapsed', () => {
    recordSweepAt(USER, TABLE, NOW);
    expect(isSweepDue(USER, TABLE, NOW + SWEEP_INTERVAL_MS)).toBe(true);
  });

  it('tracks cadence per table and per user', () => {
    recordSweepAt(USER, TABLE, NOW);
    expect(isSweepDue(USER, 'drill_sessions', NOW)).toBe(true);
    expect(isSweepDue(OTHER_USER, TABLE, NOW)).toBe(true);
  });

  it('sweeps when the marker is corrupt or storage is unreadable', () => {
    // Errs toward doing the work: a missed sweep leaves a remotely
    // deleted row in place indefinitely, which nothing else corrects.
    localStorage.setItem(sweepKey(USER, TABLE), 'not-a-number');
    expect(isSweepDue(USER, TABLE, NOW)).toBe(true);

    recordSweepAt(USER, TABLE, NOW);
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    try {
      expect(isSweepDue(USER, TABLE, NOW)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
