/**
 * The lit pool is ONE value, and it lives in the URL.
 *
 * The defect these pin: the pool used to be `useState` seeded from the
 * route param, and React Router reuses one component instance across a
 * param change — so the initialiser never ran again and the chip row,
 * the cards and everything derived from them kept showing the category
 * the reader had navigated away from.
 */
import { describe, expect, it } from 'vitest';
import { litFrom, parseAlso } from '../useLitPool';

const VALID = (id: string) => ['a', 'b', 'c'].includes(id);

describe('what is lit', () => {
  it('always contains the page it is on', () => {
    // By construction, not by a rule about the last chip — an empty
    // pool is unreachable rather than guarded against.
    expect([...litFrom('a', null, VALID)]).toEqual(['a']);
    expect([...litFrom('a', '', VALID)]).toEqual(['a']);
    expect([...litFrom('a', 'b,c', VALID)]).toContain('a');
  });

  it('adds what the parameter names, and nothing else', () => {
    expect([...litFrom('a', 'b,c', VALID)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignores a slug that names nothing', () => {
    // A hand-edited URL must not put a column in a grid that no card
    // can land in.
    expect([...litFrom('a', 'b,zzz', VALID)].sort()).toEqual(['a', 'b']);
  });

  it('does not double-count the page itself', () => {
    expect([...litFrom('a', 'a,b', VALID)].sort()).toEqual(['a', 'b']);
  });

  it('survives the punctuation a hand-edited URL leaves behind', () => {
    expect(parseAlso(',b, ,c,')).toEqual(['b', 'c']);
    expect(parseAlso(null)).toEqual([]);
  });

  it('lights only the new category when the nav moves the page', () => {
    // A nav link carries no `?also`, so arriving at a category means
    // arriving at that category — whatever was lit on the last page.
    expect([...litFrom('c', null, VALID)]).toEqual(['c']);
  });
});
