/**
 * The tally underneath both sweeps, tested without a database.
 *
 * =====================================================================
 * THE RULE IS ARITHMETIC; THE DATABASE IS THE CALLER'S PROBLEM.
 *
 * Reading tables is where the cost and the indexes live. Deciding what
 * is orphaned, what merges with what, and what the line says is not,
 * and keeping the two apart is what lets the part that could be wrong
 * be checked directly rather than through eight `bulkPut`s.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  authoredOnCuration,
  collectOrphans,
  describeAuthored,
  describeCounts,
} from '../orphanSweep';

const live = (...refs: string[]) => (ref: string) => refs.includes(ref);

describe('collectOrphans', () => {
  it('says nothing when every row is live', () => {
    const r = collectOrphans([{
      scope: 'the deck',
      tables: ['attempts'],
      rows: [{ ref: 'a', table: 'attempts' }, { ref: 'b', table: 'attempts' }],
      isLive: live('a', 'b'),
    }]);
    expect(r.orphans).toEqual([]);
  });

  it('counts every table the scope reads, zero included', () => {
    const r = collectOrphans([{
      scope: 'the deck',
      tables: ['attempts', 'spacing', 'diary'],
      rows: [
        { ref: 'gone', table: 'attempts' },
        { ref: 'gone', table: 'attempts' },
        { ref: 'gone', table: 'spacing' },
      ],
      isLive: live('here'),
    }]);
    expect(r.orphans).toHaveLength(1);
    expect(r.orphans[0].counts).toEqual({ attempts: 2, spacing: 1, diary: 0 });
  });

  it('joins scopes that share a name, and their tables with them', () => {
    // One item space supplied in pieces: the rows live in tables with
    // different keys, and the item is still one item.
    const r = collectOrphans([
      {
        scope: 'chord progressions',
        tables: ['attempts'],
        rows: [{ ref: 'gone', table: 'attempts' }],
        isLive: live('here'),
      },
      {
        scope: 'chord progressions',
        tables: ['association'],
        rows: [{ ref: 'gone', table: 'association' }],
        isLive: live('here'),
      },
    ]);
    expect(r.orphans).toHaveLength(1);
    expect(r.orphans[0].counts).toEqual({ attempts: 1, association: 1 });
  });

  it('keeps different scopes apart, so neither hides behind the other', () => {
    // The same string can name a live progression and a dead chord.
    const r = collectOrphans([
      {
        scope: 'chord progressions',
        tables: ['attempts'],
        rows: [{ ref: '2-5-1', table: 'attempts' }],
        isLive: live('2-5-1'),
      },
      {
        scope: 'chord recognition',
        tables: ['attempts'],
        rows: [{ ref: '2-5-1', table: 'attempts' }],
        isLive: live('maj7'),
      },
    ]);
    expect(r.orphans).toHaveLength(1);
    expect(r.orphans[0].scope).toBe('chord recognition');
  });

  it('merges what a reader wrote, once each, sorted', () => {
    const r = collectOrphans([{
      scope: 's',
      tables: ['spacing'],
      rows: [
        { ref: 'gone', table: 'spacing', authored: ['studyLater'] },
        { ref: 'gone', table: 'spacing', authored: ['studyLater', 'note'] },
      ],
      isLive: () => false,
    }]);
    expect(r.orphans[0].authored).toEqual(['note', 'studyLater']);
  });

  it('orders by scope, then by ref', () => {
    const r = collectOrphans([{
      scope: 'b',
      tables: ['t'],
      rows: [{ ref: 'z', table: 't' }, { ref: 'a', table: 't' }],
      isLive: () => false,
    }, {
      scope: 'a',
      tables: ['t'],
      rows: [{ ref: 'm', table: 't' }],
      isLive: () => false,
    }]);
    expect(r.orphans.map(o => `${o.scope}/${o.ref}`))
      .toEqual(['a/m', 'b/a', 'b/z']);
  });

  it('refuses a row from a table its scope never declared', () => {
    // A silent extra key would make one orphan's line read differently
    // from its neighbour's for no reason a reader could see.
    expect(() => collectOrphans([{
      scope: 'the deck',
      tables: ['attempts'],
      rows: [{ ref: 'gone', table: 'diary' }],
      isLive: () => false,
    }])).toThrow(/does not declare table "diary"/);
  });
});

describe('the line', () => {
  it('leaves out the tables that hold nothing', () => {
    expect(describeCounts(
      { attempts: 2, spacing: 0, diary: 1 },
      { attempts: 'attempt(s)', spacing: 'spacing row(s)', diary: 'diary entr(ies)' },
    )).toBe('2 attempt(s), 1 diary entr(ies)');
  });

  it('falls back to the table name rather than printing undefined', () => {
    expect(describeCounts({ mystery: 1 }, {})).toBe('1 mystery');
  });

  it('says nothing about hand-written fields when there are none', () => {
    expect(describeAuthored([])).toBe('');
    expect(describeAuthored(['note', 'tags']))
      .toBe(' — and note, tags written by hand');
  });
});

describe('what counts as written by hand on a curation row', () => {
  it('calls an empty row nothing', () => {
    expect(authoredOnCuration({})).toEqual([]);
    expect(authoredOnCuration({ customLabel: '', flagged: false, flagNote: '' }))
      .toEqual([]);
  });

  it('names the four fields a reader can fill', () => {
    expect(authoredOnCuration({
      customLabel: 'my name', flagged: true, flagNote: 'why', hidden: true,
    })).toEqual(['customLabel', 'flagged', 'flagNote', 'hidden']);
  });
});
