// @vitest-environment jsdom
/**
 * Reading answer sets and verdicts.
 *
 * The property that matters throughout: A PICKER MUST NEVER OMIT THE
 * RIGHT ANSWER, and must never offer one the card could not have.
 * Both directions are checked across the whole catalog rather than on
 * examples, because either failure is invisible in the UI — a missing
 * option looks like a hard question, and a surplus one looks like a
 * generous drill.
 */
import { describe, expect, it } from 'vitest';
import {
  CHORD_ROOTS,
  OPEN_SHAPE_ANSWER,
  accidentalCountOptions,
  accidentalNameOptions,
  correctAccidentalSequence,
  countStageAfterPick,
  inversionAnswerFor,
  inversionOptions,
  judgeChord,
  judgeNote,
  judgeSignatureCount,
  keyNameOptions,
  letterOptions,
  mnemonicFor,
  octaveOptions,
  octavesForClef,
  qualityOptions,
  rootId,
  rootOptions,
  shapeOptions,
} from '../answerModels';
import {
  CHORD_QUALITIES,
  SIGNATURES,
  enumerateChordItems,
  enumerateNoteItems,
  enumerateShapeItems,
  parseReadingItemRef,
} from '../catalog';
import { pitchAtStaffPosition } from '../pitch';

// =====================================================================
// Note recognition
// =====================================================================

describe('note answer sets', () => {
  it('the letter set is the seven letters, no accidentals', () => {
    // Note cards render no accidentals by design, so anything with one
    // here would be an answer no card can have.
    expect(letterOptions()).toHaveLength(7);
    expect(letterOptions().map(o => o.id)).toEqual(['C','D','E','F','G','A','B']);
    for (const o of letterOptions()) expect(o.label).not.toMatch(/[#b♯♭]/);
  });

  it('THE OCTAVE SET IS PER-CLEF, not a shared row', () => {
    // Easy to assume fixed and wrong. A shared row would offer octaves
    // the clef cannot reach, which is a free elimination hint.
    expect(octavesForClef('treble')).toEqual([3, 4, 5, 6]);
    expect(octavesForClef('bass')).toEqual([2, 3, 4]);
    expect(octavesForClef('treble')).not.toEqual(octavesForClef('bass'));
  });

  it('the octave set is DERIVED — it is exactly what the catalog reaches', () => {
    for (const clef of ['treble', 'bass'] as const) {
      const walked = new Set(
        enumerateNoteItems()
          .map(ref => parseReadingItemRef(ref))
          .filter(p => p?.skill === 'note' && p.clef === clef)
          .map(p => pitchAtStaffPosition(clef, (p as { position: number }).position).octave),
      );
      expect([...walked].sort((a, b) => a - b)).toEqual(octavesForClef(clef));
    }
  });

  it('every note item has BOTH its halves on offer', () => {
    for (const ref of enumerateNoteItems()) {
      const p = parseReadingItemRef(ref);
      if (p?.skill !== 'note') continue;
      const pitch = pitchAtStaffPosition(p.clef, p.position);
      expect(letterOptions().map(o => o.id), ref).toContain(pitch.letter);
      expect(octaveOptions(p.clef).map(o => o.id), ref).toContain(String(pitch.octave));
    }
  });

  it('one half right is still WRONG, and the miss is attributable', () => {
    // note:treble:0 is E4.
    const both = judgeNote('treble', 0, 'E', '4');
    expect(both).toEqual({ letterCorrect: true, octaveCorrect: true, correct: true });

    const octaveMiss = judgeNote('treble', 0, 'E', '5');
    expect(octaveMiss.correct).toBe(false);
    expect(octaveMiss.letterCorrect).toBe(true);
    expect(octaveMiss.octaveCorrect).toBe(false);

    const letterMiss = judgeNote('treble', 0, 'F', '4');
    expect(letterMiss.correct).toBe(false);
    expect(letterMiss.letterCorrect).toBe(false);
    expect(letterMiss.octaveCorrect).toBe(true);
  });

  it('an unanswered half is not silently correct', () => {
    expect(judgeNote('treble', 0, 'E', null).correct).toBe(false);
    expect(judgeNote('treble', 0, null, '4').correct).toBe(false);
  });
});

describe('mnemonics', () => {
  it('names the right rhyme for each clef and line/space', () => {
    // treble position 0 is the bottom LINE (E), 1 is the first space (F).
    expect(mnemonicFor('treble', 0)).toContain('Every Good Boy');
    expect(mnemonicFor('treble', 1)).toContain('F A C E');
    expect(mnemonicFor('bass', 0)).toContain('Good Boys Do Fine');
    expect(mnemonicFor('bass', 1)).toContain('All Cows Eat Grass');
  });

  it('every note item resolves to a mnemonic', () => {
    for (const ref of enumerateNoteItems()) {
      const p = parseReadingItemRef(ref);
      if (p?.skill !== 'note') continue;
      expect(mnemonicFor(p.clef, p.position), ref).toBeTruthy();
    }
  });
});

// =====================================================================
// Notation shapes
// =====================================================================

describe('shape answer set', () => {
  it('the option ids ARE the itemRefs', () => {
    // Judging is then an equality check on identity. A parallel
    // encoding would be a second source of truth that could drift.
    expect(shapeOptions().map(o => o.id)).toEqual(enumerateShapeItems());
    expect(shapeOptions()).toHaveLength(7);
  });

  it('every label is distinct — seven answers, seven words', () => {
    expect(new Set(shapeOptions().map(o => o.label)).size).toBe(7);
  });
});

// =====================================================================
// Key signatures
// =====================================================================

describe('signature answer sets', () => {
  it('the name direction offers thirteen tonics for the asked mode', () => {
    expect(keyNameOptions('major')).toHaveLength(13);
    expect(keyNameOptions('major').find(o => o.id === '2s')?.label).toBe('D');
    expect(keyNameOptions('minor').find(o => o.id === '2s')?.label).toBe('B');
    // Glyphs, not ASCII — the staff and the buttons share a vocabulary.
    expect(keyNameOptions('major').find(o => o.id === '6f')?.label).toBe('G♭');
  });

  it('the empty signature reads "none", not "0 sharps"', () => {
    expect(accidentalCountOptions().find(o => o.id === '0')?.label).toBe('none');
    expect(accidentalCountOptions().find(o => o.id === '1s')?.label).toBe('1 sharp');
    expect(accidentalCountOptions().find(o => o.id === '6f')?.label).toBe('6 flats');
  });

  it('the accidental sequence is the ordered prefix of the written order', () => {
    expect(correctAccidentalSequence('3s')).toEqual(['F#', 'C#', 'G#']);
    expect(correctAccidentalSequence('2f')).toEqual(['Bb', 'Eb']);
    expect(correctAccidentalSequence('0')).toEqual([]);
  });

  it('every signature sequence is answerable from the seven buttons', () => {
    for (const sig of SIGNATURES) {
      if (sig.accidental === null) continue;
      const offered = new Set(accidentalNameOptions(sig.accidental).map(o => o.id));
      for (const a of correctAccidentalSequence(sig.id)) {
        expect(offered.has(a), `${sig.id} / ${a}`).toBe(true);
      }
    }
  });

  it('a WRONG KIND settles the attempt instead of asking for six taps', () => {
    // G-flat major is flats. Picking sharps is a category error, not a
    // near miss — the spelling is in the key name. Finishing it would
    // rehearse the sharp order against a card that names flats.
    expect(countStageAfterPick('6f', '6s')).toEqual({
      stage: 'settled', reason: 'wrong-kind',
    });
    expect(countStageAfterPick('6f', '3s')).toEqual({
      stage: 'settled', reason: 'wrong-kind',
    });
    // "none" against a card that has accidentals is also a wrong kind.
    expect(countStageAfterPick('2s', '0')).toEqual({
      stage: 'settled', reason: 'wrong-kind',
    });
    expect(countStageAfterPick('0', '2s')).toEqual({
      stage: 'settled', reason: 'wrong-kind',
    });
  });

  it('a wrong COUNT with the right kind still asks for the sequence', () => {
    // Naming the flats in written order is the right rehearsal; only
    // the number is off. That is a near miss and worth finishing.
    expect(countStageAfterPick('6f', '3f')).toEqual({ stage: 'sequence', kind: 'flat' });
    expect(countStageAfterPick('2s', '5s')).toEqual({ stage: 'sequence', kind: 'sharp' });
  });

  it('the right kind enters the sequence stage on the kind PICKED', () => {
    expect(countStageAfterPick('3s', '3s')).toEqual({ stage: 'sequence', kind: 'sharp' });
    expect(countStageAfterPick('2f', '2f')).toEqual({ stage: 'sequence', kind: 'flat' });
  });

  it('the empty signature settles — there is nothing to name', () => {
    expect(countStageAfterPick('0', '0')).toEqual({
      stage: 'settled', reason: 'no-accidentals',
    });
    // ...and settling it correct is what the verdict says, with no
    // sequence ever entered.
    expect(judgeSignatureCount('0', '0', []).correct).toBe(true);
  });

  it('a settled wrong-kind attempt judges wrong with an empty sequence', () => {
    // The UI submits immediately, so the sequence never gets filled.
    // The verdict has to be wrong on that alone.
    const v = judgeSignatureCount('6f', '6s', []);
    expect(v.countCorrect).toBe(false);
    expect(v.whichCorrect).toBe(false);
    expect(v.correct).toBe(false);
  });

  it('ORDER MATTERS — the right accidentals in the wrong order is wrong', () => {
    // "name them, in order" is the question; a set-equality check
    // would quietly accept a different question.
    expect(judgeSignatureCount('3s', '3s', ['F#', 'C#', 'G#']).correct).toBe(true);
    expect(judgeSignatureCount('3s', '3s', ['C#', 'F#', 'G#']).correct).toBe(false);
  });

  it('both parts must be right — one attempt, two halves', () => {
    const rightCountWrongWhich = judgeSignatureCount('3s', '3s', ['F#', 'C#']);
    expect(rightCountWrongWhich.countCorrect).toBe(true);
    expect(rightCountWrongWhich.whichCorrect).toBe(false);
    expect(rightCountWrongWhich.correct).toBe(false);

    const wrongCountRightWhich = judgeSignatureCount('3s', '2s', ['F#', 'C#', 'G#']);
    expect(wrongCountRightWhich.countCorrect).toBe(false);
    expect(wrongCountRightWhich.whichCorrect).toBe(true);
    expect(wrongCountRightWhich.correct).toBe(false);
  });
});

// =====================================================================
// Chord identification
// =====================================================================

describe('chord answer sets', () => {
  it('is 5 + 12 + 14 buttons, split rather than flat', () => {
    // Flat, the answer space is ~168. None of these exceeds what ET
    // already puts on screen. Five, not four: "open shape" is a real
    // answer, not a missing inversion.
    expect(inversionOptions()).toHaveLength(5);
    expect(rootOptions()).toHaveLength(12);
    expect(qualityOptions()).toHaveLength(CHORD_QUALITIES.length);
    expect(qualityOptions()).toHaveLength(14);
  });

  it('the twelve roots are one spelling each — no enharmonic pair', () => {
    // Two spellings of one pitch would let a card be drawn on a root
    // that no button names.
    expect(new Set(rootOptions().map(o => o.id)).size).toBe(12);
    expect(rootOptions().map(o => o.id)).toEqual(
      CHORD_ROOTS.map(r => rootId(r.letter, r.accidental)),
    );
  });

  it('every quality is offered, including the open shapes', () => {
    const offered = new Set(qualityOptions().map(o => o.id));
    for (const q of CHORD_QUALITIES) expect(offered.has(q.id), q.id).toBe(true);
  });

  it('THE PICKER IS IDENTICAL ON EVERY CHORD CARD', () => {
    // The property that makes this leak nothing. If the option list
    // varied with the card — hidden for open shapes, say — the layout
    // would announce which kind of card it is before the staff had
    // been read. One list, every card.
    const list = JSON.stringify(inversionOptions());
    for (const ref of enumerateChordItems()) {
      expect(JSON.stringify(inversionOptions()), ref).toBe(list);
    }
    expect(inversionOptions().map(o => o.id))
      .toEqual(['root', 'inv1', 'inv2', 'inv3', OPEN_SHAPE_ANSWER]);
  });

  it('open shapes answer "open shape"; everything else answers its position', () => {
    // An octave or a tenth IS a voicing — asking which inversion it is
    // has no meaning, so the answer names what it actually is.
    expect(inversionAnswerFor('octave', 'root')).toBe(OPEN_SHAPE_ANSWER);
    expect(inversionAnswerFor('r10', 'root')).toBe(OPEN_SHAPE_ANSWER);
    expect(inversionAnswerFor('r5', 'root')).toBe(OPEN_SHAPE_ANSWER);
    expect(inversionAnswerFor('maj', 'root')).toBe('root');
    expect(inversionAnswerFor('dom7', 'inv3')).toBe('inv3');
  });

  it('every chord item has its inversion answer on the picker', () => {
    const offered = new Set(inversionOptions().map(o => o.id));
    for (const ref of enumerateChordItems()) {
      const p = parseReadingItemRef(ref);
      if (p?.skill !== 'chord') continue;
      const answer = inversionAnswerFor(p.qualityId, p.position);
      expect(offered.has(answer), `${ref} → ${answer}`).toBe(true);
    }
  });

  it('an open shape answered "root position" is WRONG', () => {
    // The whole point of the fourth option: 'root' is no longer a free
    // pass on a voicing.
    const expected = {
      position: inversionAnswerFor('octave', 'root'),
      rootId: 'C',
      qualityId: 'octave',
    };
    expect(judgeChord(expected, { position: 'root', rootId: 'C', qualityId: 'octave' }).correct)
      .toBe(false);
    expect(judgeChord(expected, { position: OPEN_SHAPE_ANSWER, rootId: 'C', qualityId: 'octave' }).correct)
      .toBe(true);
  });

  it('a triad answered "open shape" is WRONG', () => {
    const expected = { position: inversionAnswerFor('maj', 'inv1'), rootId: 'C', qualityId: 'maj' };
    expect(judgeChord(expected, { position: OPEN_SHAPE_ANSWER, rootId: 'C', qualityId: 'maj' }).correct)
      .toBe(false);
  });

  it('all three picks must be right', () => {
    const expected = { position: 'inv1' as const, rootId: 'C', qualityId: 'maj' };
    expect(judgeChord(expected, { position: 'inv1', rootId: 'C', qualityId: 'maj' }).correct)
      .toBe(true);
    expect(judgeChord(expected, { position: 'root', rootId: 'C', qualityId: 'maj' }).correct)
      .toBe(false);
    expect(judgeChord(expected, { position: 'inv1', rootId: 'D', qualityId: 'maj' }).correct)
      .toBe(false);
    expect(judgeChord(expected, { position: 'inv1', rootId: 'C', qualityId: 'min' }).correct)
      .toBe(false);
  });

  it('an unanswered pick is not silently correct', () => {
    const expected = { position: 'root' as const, rootId: 'C', qualityId: 'maj' };
    expect(judgeChord(expected, { position: null, rootId: 'C', qualityId: 'maj' }).correct)
      .toBe(false);
    expect(judgeChord(expected, { position: 'root', rootId: null, qualityId: 'maj' }).correct)
      .toBe(false);
  });
});
