// @vitest-environment jsdom
/**
 * Classification for the song-key diagnostic.
 *
 * This exists to DIAGNOSE a bug, so its own correctness matters more
 * than usual: a misclassification would send the investigation the
 * wrong way, and there is no second instrument to catch it. Each
 * branch is pinned separately, and the ordering is pinned too —
 * grouping identical failures together is the thing that turns ten
 * rows into "one cause".
 */
import { describe, expect, it } from 'vitest';
import type { Song, SongKey, SongKeyState } from '../../../lib/db';
import {
  classifySongKeys,
  orderDiagnostics,
  type SongKeyDiagnostic,
} from '../keyDiagnostics';

const NOW = 1_700_000_000_000;

function song(key: string | undefined, title = 'Song', id = 's1'): Pick<Song, 'id' | 'title' | 'key'> {
  return { id, title, key } as Pick<Song, 'id' | 'title' | 'key'>;
}

function row(
  keyName: string,
  isOriginalKey: boolean,
  keyState: SongKeyState = 'not_started',
  updatedAt = NOW,
): SongKey {
  return {
    id: `songkey-s1-${keyName}`,
    songId: 's1',
    keyName,
    isOriginalKey,
    keyState,
    updatedAt,
    createdAt: NOW,
  } as SongKey;
}

describe('classifySongKeys', () => {
  it('reports no problem when the song key and the ★ row agree', () => {
    const out = classifySongKeys(song('Ab'), [row('Ab', true), row('C', false)]);
    expect(out.problem).toBeNull();
  });

  it('detects the reported symptom: original disagrees with song key', () => {
    // Song.key was edited to Ab; the matrix is still anchored to D.
    const out = classifySongKeys(song('Ab'), [row('D', true), row('Ab', false)]);
    expect(out.problem).toBe('original-mismatch');
  });

  it('detects no key rows at all', () => {
    expect(classifySongKeys(song('Ab'), []).problem).toBe('no-key-rows');
  });

  it('detects rows with no original among them', () => {
    expect(classifySongKeys(song('Ab'), [row('Ab', false)]).problem).toBe('no-original');
  });

  it('detects multiple originals', () => {
    // .find() would silently pick by array order, so this must not
    // read as a plain mismatch.
    const out = classifySongKeys(song('Ab'), [row('Ab', true), row('D', true)]);
    expect(out.problem).toBe('multiple-originals');
  });

  it('reports an unset song key ahead of any row disagreement', () => {
    // A mismatch against a value that was never set is a different bug
    // from a mismatch against a good one; reporting the row-level
    // symptom would point the investigation downstream of the cause.
    const out = classifySongKeys(song(undefined), [row('D', true)]);
    expect(out.problem).toBe('song-key-unset');
  });

  it('reports a non-canonical song key ahead of any row disagreement', () => {
    const out = classifySongKeys(song('A♭'), [row('D', true)]);
    expect(out.problem).toBe('song-key-non-canonical');
  });

  it('treats an empty-string key as unset, not as a mismatch', () => {
    expect(classifySongKeys(song(''), [row('D', true)]).problem).toBe('song-key-unset');
  });

  it('puts the original row first and carries its timestamp through', () => {
    // The timestamps are what distinguish "never written" from
    // "written then overwritten", so they must survive the sort.
    const out = classifySongKeys(song('Ab'), [
      row('C', false, 'not_started', NOW - 5_000),
      row('D', true, 'learning', NOW - 1_000),
    ]);
    expect(out.rows[0].keyName).toBe('D');
    expect(out.rows[0].isOriginalKey).toBe(true);
    expect(out.rows[0].updatedAt).toBe(NOW - 1_000);
    expect(out.rows[0].keyState).toBe('learning');
  });

  it('coerces a non-boolean isOriginalKey to false rather than trusting it', () => {
    // IndexedDB cannot index booleans, and legacy rows have been seen
    // with odd values; `=== true` keeps a truthy non-boolean from
    // masquerading as the anchor.
    const odd = { ...row('D', false), isOriginalKey: 'yes' } as unknown as SongKey;
    expect(classifySongKeys(song('Ab'), [odd]).problem).toBe('no-original');
  });
});

describe('orderDiagnostics', () => {
  const mk = (title: string, problem: SongKeyDiagnostic['problem']): SongKeyDiagnostic => ({
    songId: title, title, songKey: 'Ab', rows: [], problem,
  });

  it('lists problem songs before healthy ones', () => {
    const out = orderDiagnostics([mk('B', null), mk('A', 'original-mismatch')]);
    expect(out.map(r => r.title)).toEqual(['A', 'B']);
  });

  it('groups identical problems together', () => {
    // The whole diagnostic value: ten songs failing the same way must
    // read as one cause, not ten scattered rows.
    const out = orderDiagnostics([
      mk('one', 'original-mismatch'),
      mk('two', 'no-key-rows'),
      mk('three', 'original-mismatch'),
    ]);
    expect(out.map(r => r.problem)).toEqual([
      'no-key-rows', 'original-mismatch', 'original-mismatch',
    ]);
  });

  it('is alphabetical within a group and does not mutate its input', () => {
    const input = [mk('zed', null), mk('alpha', null)];
    const out = orderDiagnostics(input);
    expect(out.map(r => r.title)).toEqual(['alpha', 'zed']);
    expect(input.map(r => r.title)).toEqual(['zed', 'alpha']);
  });
});
