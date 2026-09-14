/**
 * The reader, against the spec's worked examples.
 *
 * =====================================================================
 * THE MAIN NAME FOR EVERY WORKED EXAMPLE; THE "ALSO" LIST FOR THE THREE
 * THE SPEC GIVES. Silas's answer of 13 Sep 2026, in those words.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { readNotes } from '../reader';
import { DEFAULT_PROGRESSION_SPELLING } from '../../progressionSpellingShape';

const read = (m: number[]) => readNotes(m);

describe('the worked examples in spec §3', () => {
  it('reads E G B D over C as Cmaj9', () => {
    expect(read([48, 64, 67, 71, 74]).name).toBe('Cmaj9');
  });

  it('reads E G B D alone as Em7, also G6/E · Cmaj9 rootless', () => {
    const r = read([64, 67, 71, 74]);
    expect(r.name).toBe('Em7');
    expect(r.alts).toEqual(['G6/E', 'Cmaj9 rootless']);
  });

  it('reads A♭ E♭ G♭ as A♭7 (no 3rd), also A♭m7 (no 3rd) · B6 rootless', () => {
    const r = read([56, 63, 66]);
    expect(r.name).toBe('A♭7 (no 3rd)');
    expect(r.alts).toEqual(['A♭m7 (no 3rd)', 'B6 rootless']);
  });

  it('reads E G A as C6 rootless, because a reading with its 3rd outranks one without', () => {
    const r = read([64, 67, 69]);
    expect(r.name).toBe('C6 rootless');
    // Silas, 13 Sep: "show all the options". The no-3rd readings stay.
    expect(r.alts.some(a => a.startsWith('A7') && a.endsWith('(no 3rd)'))).toBe(true);
  });

  it('reads C E G as C, with no alternatives', () => {
    const r = read([60, 64, 67]);
    expect(r.name).toBe('C');
    expect(r.alts).toEqual([]);
  });

  it('reads E G C as C/E', () => {
    expect(read([64, 67, 72]).name).toBe('C/E');
  });

  it('reads C E G A D as C6/9, and Cmaj13 once B is added', () => {
    expect(read([60, 64, 67, 69, 74]).name).toBe('C6/9');
    expect(read([60, 64, 67, 69, 71, 74]).name).toBe('Cmaj13');
  });
});

describe('fewer than three notes', () => {
  it('names one note, doubled or not', () => {
    expect(read([60]).name).toBe('C');
    expect(read([48, 60, 72]).name).toBe('C');
  });

  it('names two notes and the interval between them, lowest first', () => {
    expect(read([60, 63]).name).toBe('C E♭ · minor 3rd');
    expect(read([67, 72]).name).toBe('G C · perfect 4th');
  });

  it('reads nothing lit as nothing', () => {
    expect(read([]).kind).toBe('none');
  });
});

describe('the rules under the examples', () => {
  it('never offers a ♯9 chord "with no 3rd" when the ♯9 is sounding', () => {
    expect(read([64, 67, 71, 74]).alts.join(' ')).not.toContain('7♯9');
  });

  it('never writes a slash on a rootless reading', () => {
    for (const a of read([64, 67, 71, 74]).alts.filter(x => x.includes('rootless'))) {
      expect(a).not.toContain('/');
    }
  });

  it('means dominant by a bare number', () => {
    expect(read([60, 64, 67, 70, 74]).name).toBe('C9');
    expect(read([60, 63, 67, 70, 74]).name).toBe('Cm9');
  });

  it('follows the note-name setting', () => {
    expect(readNotes([61, 65, 68], { spelling: 'sharp' }).name).toBe('C♯');
    expect(readNotes([61, 65, 68], { spelling: 'flat' }).name).toBe('D♭');
  });

  it('follows the half-diminished setting', () => {
    expect(read([59, 62, 65, 69]).name).toBe('Bø');
    expect(readNotes([59, 62, 65, 69], {
      progression: { ...DEFAULT_PROGRESSION_SPELLING, halfDimSeventh: 'm7♭5' },
    }).name).toBe('Bm7♭5');
  });

  it('hands back the winning reading for the panel\'s rows to read', () => {
    const best = read([64, 67, 71, 74]).best!;
    expect(best.rootPc).toBe(4);
    expect(best.quality.id).toBe('min7');
    expect(best.quality.family).toBe('minor');
    expect(best.omission).toBe('none');
  });
});
