/**
 * Building a chord by hand: Silas's spec of 12 Sep 2026, §5.
 */
import { describe, expect, it } from 'vitest';
import {
  NO_EDIT, UNDO_STEPS, builtChord, clearRings, historyOf, holdKey, record, ringsOf,
  shiftOctave, tapKey, undo, type BoardEdit,
} from '../boardEdit';
import { KEYBOARD_HIGH_MIDI } from '../../builtAnswers/board';

/** Cmaj7 over C: C3 under E4 G4 B4. */
const LIT = [48, 64, 67, 71];
const litOf = (edit: BoardEdit) => edit.built[0] ?? LIT;

describe('Tap again (the default)', () => {
  it('an unlit key lights, a lit key gets a ring, a ringed key unlights', () => {
    let { edit, litChanged } = tapKey(NO_EDIT, 0, LIT, 74, 'tap');
    expect(litChanged).toBe(true);
    expect(litOf(edit)).toEqual([48, 64, 67, 71, 74]);

    ({ edit, litChanged } = tapKey(edit, 0, litOf(edit), 74, 'tap'));
    expect(litChanged).toBe(false);
    expect(ringsOf(edit, 0)).toEqual([74]);
    expect(litOf(edit)).toContain(74);

    ({ edit, litChanged } = tapKey(edit, 0, litOf(edit), 74, 'tap'));
    expect(litChanged).toBe(true);
    expect(litOf(edit)).not.toContain(74);
    expect(ringsOf(edit, 0)).toEqual([]);
  });

  it('the bass can be unlit like any key', () => {
    const { edit } = tapKey({ ...NO_EDIT, rings: [48], ringsOn: 0 }, 0, LIT, 48, 'tap');
    expect(litOf(edit)).toEqual([64, 67, 71]);
  });
});

describe('Press and hold', () => {
  it('a tap lights and unlights; holding a lit key rings it', () => {
    let { edit } = tapKey(NO_EDIT, 0, LIT, 67, 'hold');
    expect(litOf(edit)).toEqual([48, 64, 71]);
    ({ edit } = tapKey(edit, 0, litOf(edit), 67, 'hold'));
    expect(litOf(edit)).toEqual([48, 64, 67, 71]);
    edit = holdKey(edit, 0, litOf(edit), 67);
    expect(ringsOf(edit, 0)).toEqual([67]);
    // An unlit key held does nothing.
    expect(holdKey(edit, 0, litOf(edit), 62)).toBe(edit);
    edit = holdKey(edit, 0, litOf(edit), 67);
    expect(ringsOf(edit, 0)).toEqual([]);
  });
});

describe('↓ octave and ↑ octave', () => {
  it('move the ringed notes, and the rings travel with them', () => {
    const ringed = holdKey(NO_EDIT, 0, LIT, 71);
    const edit = shiftOctave(ringed, 0, LIT, -12);
    expect(litOf(edit)).toEqual([48, 59, 64, 67]);
    expect(ringsOf(edit, 0)).toEqual([59]);
  });

  it('move every lit note when nothing is ringed', () => {
    expect(litOf(shiftOctave(NO_EDIT, 0, LIT, 12))).toEqual([60, 76, 79, 83]);
  });

  it('drop a note that would leave the board', () => {
    // C3, E5 and C6 up an octave: C4 stays on the board, E6 and C7 do not.
    const top = [48, 76, KEYBOARD_HIGH_MIDI];
    const edit = shiftOctave(NO_EDIT, 0, top, 12);
    expect(edit.built[0]).toEqual([60]);
  });
});

describe('Clear rings', () => {
  it('drops every ring and nothing else', () => {
    const ringed = holdKey(holdKey(NO_EDIT, 0, LIT, 64), 0, LIT, 67);
    const cleared = clearRings(ringed);
    expect(cleared.rings).toEqual([]);
    expect(cleared.built).toEqual(ringed.built);
    expect(clearRings(NO_EDIT)).toBe(NO_EDIT);
  });

  it('rings are on one chord: another chord has none', () => {
    const ringed = holdKey(NO_EDIT, 1, LIT, 64);
    expect(ringsOf(ringed, 1)).toEqual([64]);
    expect(ringsOf(ringed, 0)).toEqual([]);
  });
});

describe('what is lit is the chord', () => {
  it('the lowest lit note below middle C is the bass, and the reader names it', () => {
    const { chord, reading } = builtChord([48, 64, 67, 71, 74]);
    expect(chord.bass).toBe(48);
    expect(chord.hand).toEqual([64, 67, 71, 74]);
    expect(chord.byHand).toBe(true);
    expect(reading.name).toBe('Cmaj9');
    expect(chord.name).toBe('Cmaj9');
    expect(chord.rootPc).toBe(0);
  });

  it('with nothing below middle C there is no bass, and the root is the reader\'s', () => {
    const { chord, reading } = builtChord([64, 67, 71, 74]);
    expect(chord.bass).toBeNull();
    expect(reading.name).toBe('Em7');
    expect(reading.alts).toEqual(['G6/E', 'Cmaj9 rootless']);
    expect(chord.rootPc).toBe(4);
  });
});

describe('Undo', () => {
  it('steps back one change at a time, fifty kept', () => {
    let h = historyOf(0);
    for (let i = 1; i <= 60; i += 1) h = record(h, i);
    expect(h.past).toHaveLength(UNDO_STEPS);
    h = undo(h);
    expect(h.present).toBe(59);
    for (let i = 0; i < 100; i += 1) h = undo(h);
    expect(h.present).toBe(10);
    expect(undo(h)).toBe(h);
  });
});
