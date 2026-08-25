/**
 * The ladder, and the five notes the whole reference exists for.
 *
 * =====================================================================
 * THE JOIN IS THE THING UNDER TEST.
 *
 * Bass top line A3, then B3, then middle C, then D4, then treble bottom
 * line E4 are five CONSECUTIVE positions. A grand staff drawn as two
 * separate grids skips whatever falls in the gap, and the reader who
 * has been told "nothing is skipped" is then wrong about the one
 * question they came to answer.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { enumerateNoteItems, parseReadingItemRef } from '../../../modules/reading/catalog';
import { pitchAtStaffPosition } from '../../../modules/reading/pitch';
import {
  BASS_LINES,
  LEDGER_LINES,
  MIDDLE_C,
  TREBLE_LINES,
  buildLadder,
  defaultMnemonics,
} from '../staffLadder';

const ladder = buildLadder();
const ids = ladder.map(p => p.id);
const at = (id: string) => ladder.find(p => p.id === id)!;

describe('the join between the staves', () => {
  it('runs A3 · B3 · C4 · D4 · E4 with nothing skipped', () => {
    const from = ids.indexOf('A3');
    expect(ids.slice(from, from + 5)).toEqual(['A3', 'B3', 'C4', 'D4', 'E4']);
  });

  it('makes middle C a line of its own, between the staves', () => {
    const c = at(MIDDLE_C);
    expect(c.kind).toBe('line');
    expect(c.isLedgerLine).toBe(true);
    expect(c.isMiddleC).toBe(true);
    expect(c.region).toBe('middle');
  });

  it('puts it exactly one ledger from each staff', () => {
    // One below treble and one above bass is what makes it shared: two
    // steps from E4 and two from A3, which is one line either way.
    expect(at('E4').index - at(MIDDLE_C).index).toBe(2);
    expect(at(MIDDLE_C).index - at('A3').index).toBe(2);
  });
});

describe('lines and spaces alternate all the way', () => {
  it('never repeats a kind', () => {
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i].kind, `${ladder[i - 1].id} → ${ladder[i].id}`)
        .not.toBe(ladder[i - 1].kind);
    }
  });

  it('lands the ten staff lines on lines', () => {
    for (const id of [...TREBLE_LINES, ...BASS_LINES]) {
      expect(at(id).kind, id).toBe('line');
      expect(at(id).isLedgerLine, id).toBe(false);
    }
  });

  it('knows a staff space from a ledger', () => {
    expect(at('F4').kind).toBe('space');
    expect(at('F4').region).toBe('treble');
    expect(at('B3').kind).toBe('space');
    expect(at('B3').region).toBe('middle');
  });
});

describe('three ledgers each way', () => {
  it('reaches E6 above and A1 below', () => {
    expect(ids[ids.length - 1]).toBe('E6');
    expect(ids[0]).toBe('A1');
  });

  it('draws exactly that many ledger lines beyond each staff', () => {
    const above = ladder.filter(p => p.region === 'ledger-above' && p.kind === 'line');
    const below = ladder.filter(p => p.region === 'ledger-below' && p.kind === 'line');
    expect(above.map(p => p.id)).toEqual(['A5', 'C6', 'E6']);
    expect(below.map(p => p.id)).toEqual(['A1', 'C2', 'E2']);
    expect(above).toHaveLength(LEDGER_LINES);
    expect(below).toHaveLength(LEDGER_LINES);
  });

  it('is generated from the count, not from a list', () => {
    // The range knob is a number, so the ladder's length follows from
    // it: ten staff positions plus the middle three plus two ledger
    // runs of (2 × count) steps.
    const staffSpan = ladder.filter(p => p.region !== 'ledger-above' && p.region !== 'ledger-below');
    expect(ladder).toHaveLength(staffSpan.length + 2 * (2 * LEDGER_LINES));
  });
});

describe('the mnemonics that ship', () => {
  const defaults = defaultMnemonics();

  it('give the treble lines their sentence, bottom to top', () => {
    expect(TREBLE_LINES.map(id => defaults[id]))
      .toEqual(['Every', 'Good', 'Boy', 'Does', 'Fine']);
  });

  it('give the bass lines theirs', () => {
    expect(BASS_LINES.map(id => defaults[id]))
      .toEqual(['Good', 'Boys', 'Deserve', 'Fudge', 'Always']);
  });

  it('give the bass spaces theirs, in ladder order', () => {
    const spaces = ladder
      .filter(p => p.region === 'bass' && p.kind === 'space')
      .map(p => p.id);
    expect(spaces).toEqual(['A2', 'C3', 'E3', 'G3']);
    expect(spaces.map(id => defaults[id])).toEqual(['All', 'Cows', 'Eat', 'Grass']);
  });

  it('leave the treble spaces wordless — they spell FACE', () => {
    const spaces = ladder.filter(p => p.spellsFace);
    // Bottom to top, the four ARE the mnemonic.
    expect(spaces.map(p => p.id)).toEqual(['F4', 'A4', 'C5', 'E5']);
    expect(spaces.map(p => p.letter).join('')).toBe('FACE');
    for (const p of spaces) expect(defaults[p.id]).toBeUndefined();
  });

  it('flag those four and nothing else as spelling it', () => {
    const flagged = ladder.filter(p => p.spellsFace);
    expect(flagged).toHaveLength(4);
    for (const p of flagged) {
      expect(p.region).toBe('treble');
      expect(p.kind).toBe('space');
    }
  });

  it('leave EVERY ledger position empty', () => {
    // There is no standard mnemonic for a ledger note, and one invented
    // here would be a made-up fact in the place facts are checked.
    for (const pos of ladder) {
      if (pos.region === 'ledger-above' || pos.region === 'ledger-below' || pos.region === 'middle') {
        expect(defaults[pos.id], pos.id).toBeUndefined();
      }
    }
    expect(defaults[MIDDLE_C]).toBeUndefined();
  });
});


/**
 * MIGRATED FROM `answerModels.test.ts`, where they guarded the
 * four-set mnemonic panel that this ladder replaced.
 *
 * The panel is deleted; these two rules are not about the panel. One is
 * about the words themselves, and the other is the coverage claim whose
 * failure was the whole reason for the replacement — a drillable note
 * the reference does not draw is a note the reveal cannot explain.
 */
describe('rules kept from the panel that was replaced', () => {
  it('starts every mnemonic word with the letter it stands for', () => {
    const defaults = defaultMnemonics();
    const byId = new Map(buildLadder().map(p => [p.id, p]));
    for (const [id, word] of Object.entries(defaults)) {
      if (word === '') continue;
      expect(word[0].toUpperCase(), `${id} → ${word}`).toBe(byId.get(id)!.letter);
    }
  });

  it('draws every note the reading drill can ask about', () => {
    // The defect the ladder fixed: a ledger note belonged to none of
    // the four sets, so the panel could not contain the answer.
    const drawn = new Set(buildLadder().map(p => p.id));
    let checked = 0;
    for (const ref of enumerateNoteItems()) {
      const parsed = parseReadingItemRef(ref);
      if (parsed?.skill !== 'note') continue;
      const pitch = pitchAtStaffPosition(parsed.clef, parsed.position);
      expect(drawn.has(`${pitch.letter}${pitch.octave}`), ref).toBe(true);
      checked += 1;
    }
    // Guard the guard: an empty enumeration would pass vacuously.
    expect(checked).toBeGreaterThan(0);
  });
});
