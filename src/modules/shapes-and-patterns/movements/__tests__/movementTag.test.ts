/**
 * What a movement is an example of, and what the modes drill has.
 *
 * =====================================================================
 * THIS IS THE WHOLE OF WHAT SIT INSIDE HAS TO PLAY.
 *
 * The built-in mode vamps retired on 10 Sep 2026. A mode sounds only
 * once Silas has recorded something and tagged it with that mode, so
 * the tag is not a label — it is the drill's entire catalogue.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  movementTagLabel, movementTagOptions, movementTagValue, movementsTagged,
  parseMovementTag,
} from '../movementTag';
import { MODES } from '../../../ear-training/scales-modes/catalog';
import { SHARED_PROGRESSIONS } from '../../../ear-training/chord-progressions/sharedList';
import type { ChordMovement } from '../../../../lib/db';

const movement = (id: string, tag?: string): ChordMovement => ({
  id, name: id, description: '', timeSignature: '4/4', placements: [],
  playbackBpm: 72, bassBalance: 'forward', createdAt: 0, updatedAt: 0,
  ...(tag === undefined ? {} : { tag }),
});

describe('the tag', () => {
  it('reads a mode and a progression, and nothing else', () => {
    expect(parseMovementTag('mode:dorian')).toEqual({ kind: 'mode', id: 'dorian' });
    expect(parseMovementTag('progression:major-251'))
      .toEqual({ kind: 'progression', id: 'major-251' });
  });

  it('reads absent, empty and unreadable all as untagged', () => {
    // A MODE OR A PROGRESSION CAN BE RETIRED while a movement still
    // names it. A drill that crashed over that would be worse than one
    // that quietly has nothing to play.
    expect(parseMovementTag(undefined)).toBeNull();
    expect(parseMovementTag('')).toBeNull();
    expect(parseMovementTag('dorian')).toBeNull();
    expect(parseMovementTag('mode:not-a-mode')).toBeNull();
    expect(parseMovementTag('progression:gone')).toBeNull();
  });

  it('round-trips through its stored string', () => {
    for (const mode of MODES) {
      const value = movementTagValue({ kind: 'mode', id: mode.id });
      expect(parseMovementTag(value)).toEqual({ kind: 'mode', id: mode.id });
      expect(movementTagLabel({ kind: 'mode', id: mode.id })).toBe(mode.name);
    }
    for (const p of SHARED_PROGRESSIONS) {
      const value = movementTagValue({ kind: 'progression', id: p.id });
      expect(parseMovementTag(value)).toEqual({ kind: 'progression', id: p.id });
    }
  });

  it('offers every mode and every entry of the shared list', () => {
    const options = movementTagOptions();
    expect(options.filter(o => o.group === 'Mode')).toHaveLength(MODES.length);
    expect(options.filter(o => o.group === 'Progression'))
      .toHaveLength(SHARED_PROGRESSIONS.length);
  });

  it('finds every movement tagged with one thing, not the first', () => {
    // A mode Silas has recorded three times has three things to sit
    // inside, and always playing the oldest would waste two.
    const all = [
      movement('a', 'mode:dorian'),
      movement('b'),
      movement('c', 'mode:dorian'),
      movement('d', 'mode:lydian'),
    ];
    expect(movementsTagged(all, { kind: 'mode', id: 'dorian' }).map(m => m.id))
      .toEqual(['a', 'c']);
    expect(movementsTagged(all, { kind: 'mode', id: 'locrian' })).toEqual([]);
  });
});

describe('the modes have no vamps left', () => {
  it('carries no built-in loop on any of them', () => {
    // Ruled 10 Sep 2026. Nine loops the app wrote, retired: the point
    // of sitting inside a mode is to sit inside a sound you know from a
    // song.
    for (const mode of MODES) {
      expect(mode, mode.id).not.toHaveProperty('vamp');
    }
  });

  it('leaves every mode a live item, so nothing is orphaned', () => {
    // The modes themselves did not go; only their loops did. The
    // ear-training sweep keys on the mode id and finds all nine.
    expect(MODES).toHaveLength(9);
  });
});
