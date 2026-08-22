// @vitest-environment jsdom
/**
 * Noticing a derived stage move, and recording a fall.
 *
 * The property worth the most is that a demotion notice SURVIVES its
 * own cause being fixed. Re-prove the key that lapsed and the
 * criterion passes again — a derived explanation would vanish, leaving
 * a song that silently dropped a rung and silently got it back with
 * nothing on screen to say either happened.
 */
import { describe, expect, it } from 'vitest';
import type { Song } from '../../../lib/db';
import type { StageCriterion } from '../stage';
import {
  buildDemotion,
  movementBetween,
  stageReconciliation,
} from '../stageTransition';

const NOW = 1_760_000_000_000;

function song(over: Partial<Song> = {}): Song {
  return {
    id: 's1', title: 'Superstar', addedDate: 0, updatedAt: 0, ...over,
  } as Song;
}

const met = (label: string): StageCriterion =>
  ({ label, met: true, have: 1, need: 1 });
const unmet = (label: string, detail?: string): StageCriterion =>
  ({ label, met: false, have: 0, need: 1, ...(detail ? { detail } : {}) });
const unmetPrecondition = (label: string): StageCriterion =>
  ({ label, met: false, have: 0, need: 1, precondition: true });

describe('movement', () => {
  it('reads a fall as a demotion and a climb as a promotion', () => {
    expect(movementBetween('internalized', 'comfortable')).toBe('demotion');
    expect(movementBetween('learning', 'cross-key')).toBe('promotion');
  });

  it('reads no change as none', () => {
    expect(movementBetween('comfortable', 'comfortable')).toBe('none');
  });

  it('refuses to compare a stage that is not on the ladder', () => {
    // A stored 'maintenance' from before the rung was retired, or any
    // other stray value. Comparing it by index would rank it -1 and
    // report a false promotion out of nowhere.
    expect(movementBetween('maintenance' as never, 'comfortable')).toBe('none');
  });
});

describe('the record', () => {
  it('names the first substantive unmet criterion, not a precondition', () => {
    // "A performance tempo is set" is true of the song, not something
    // that lapsed. Naming it would send the user to the wrong place.
    const d = buildDemotion({
      from: 'internalized',
      to: 'comfortable',
      criteriaAtLanding: [
        unmetPrecondition('A performance tempo is set for this song'),
        unmet('Comfortable in 4 keys, one from each quadrant', 'Still to cover: A · D · G.'),
      ],
      now: NOW,
    });
    expect(d.criterionLabel).toContain('one from each quadrant');
    expect(d.detail).toContain('A · D · G');
  });

  it('falls back to a precondition when it is the ONLY thing unmet', () => {
    const d = buildDemotion({
      from: 'cross-key', to: 'comfortable',
      criteriaAtLanding: [unmetPrecondition('A performance tempo is set for this song')],
      now: NOW,
    });
    expect(d.criterionLabel).toContain('performance tempo');
  });

  it('records both endpoints of a two-rung fall', () => {
    // "Four quadrants held" is shared between comfortable → cross-key
    // and criterion 2 of cross-key → internalized, so one stale key
    // fails both at once. The notice has to say where it started.
    const d = buildDemotion({
      from: 'internalized', to: 'comfortable',
      criteriaAtLanding: [unmet('Comfortable in 4 keys, one from each quadrant')],
      now: NOW,
    });
    expect(d.from).toBe('internalized');
    expect(d.to).toBe('comfortable');
    expect(d.at).toBe(NOW);
  });

  it('still says something when every criterion somehow reads met', () => {
    const d = buildDemotion({
      from: 'cross-key', to: 'comfortable',
      criteriaAtLanding: [met('everything is fine')], now: NOW,
    });
    expect(d.criterionLabel.length).toBeGreaterThan(0);
  });
});

describe('reconciliation', () => {
  it('writes nothing when the stage has not moved', () => {
    expect(stageReconciliation({
      song: song({ stage: 'comfortable' }),
      previous: 'comfortable', derived: 'comfortable',
      criteriaAtDerived: [], now: NOW,
    })).toBeNull();
  });

  it('records the fall and moves the watermark', () => {
    const patch = stageReconciliation({
      song: song({ stage: 'internalized' }),
      previous: 'internalized', derived: 'comfortable',
      criteriaAtDerived: [unmet('Comfortable in 4 keys, one from each quadrant')],
      now: NOW,
    });
    expect(patch?.stage).toBe('comfortable');
    expect(patch?.stageDemotion?.from).toBe('internalized');
  });

  it('KEEPS the notice while the song is still short of where it fell from', () => {
    // THE LOAD-BEARING ONE. A two-rung fall that recovers one rung
    // must not erase the record — the user would be reading a page
    // saying nothing happened while still a rung short.
    const fell = {
      at: NOW - 1000, from: 'internalized' as const, to: 'comfortable' as const,
      criterionLabel: 'Comfortable in 4 keys, one from each quadrant',
    };
    const patch = stageReconciliation({
      song: song({ stage: 'comfortable', stageDemotion: fell }),
      previous: 'comfortable', derived: 'cross-key',
      criteriaAtDerived: [], now: NOW,
    });
    expect(patch?.stage).toBe('cross-key');
    // Not present in the patch at all — the stored notice stands.
    expect('stageDemotion' in (patch ?? {})).toBe(false);
  });

  it('clears the notice once the song is back at the rung it fell from', () => {
    const fell = {
      at: NOW - 1000, from: 'cross-key' as const, to: 'comfortable' as const,
      criterionLabel: 'Comfortable in 4 keys, one from each quadrant',
    };
    const patch = stageReconciliation({
      song: song({ stage: 'comfortable', stageDemotion: fell }),
      previous: 'comfortable', derived: 'cross-key',
      criteriaAtDerived: [], now: NOW,
    });
    expect('stageDemotion' in (patch ?? {})).toBe(true);
    expect(patch?.stageDemotion).toBeUndefined();
  });

  it('a promotion with no prior fall writes no notice field', () => {
    const patch = stageReconciliation({
      song: song({ stage: 'learning' }),
      previous: 'learning', derived: 'comfortable',
      criteriaAtDerived: [], now: NOW,
    });
    expect('stageDemotion' in (patch ?? {})).toBe(false);
  });

  it('the notice survives the criterion passing again', () => {
    // Re-prove the key: the criterion now reads met, and the notice is
    // still there because it is stored, not derived. This is the whole
    // reason it is a field.
    const fell = {
      at: NOW - 1000, from: 'internalized' as const, to: 'comfortable' as const,
      criterionLabel: 'Comfortable in 4 keys, one from each quadrant',
    };
    const s = song({ stage: 'comfortable', stageDemotion: fell });
    const patch = stageReconciliation({
      song: s, previous: 'comfortable', derived: 'comfortable',
      criteriaAtDerived: [met('Comfortable in 4 keys, one from each quadrant')],
      now: NOW,
    });
    expect(patch).toBeNull();
    expect(s.stageDemotion).toEqual(fell);
  });
});
