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
import { vexLinesForItem } from '../MnemonicStaff';

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

  it('THE OCTAVE RANGE IS PER-CLEF, not a shared span', () => {
    // No longer an answer set — it is what the reveal's keyboard
    // brackets. Still per-clef, and still worth pinning: the two do
    // not overlap the way a single hardcoded span would suggest.
    expect(octavesForClef('treble')).toEqual([3, 4, 5, 6]);
    expect(octavesForClef('bass')).toEqual([2, 3, 4]);
    expect(octavesForClef('treble')).not.toEqual(octavesForClef('bass'));
  });

  it('the octave range is DERIVED — it is exactly what the catalog reaches', () => {
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

  it('every note item has its answer on offer', () => {
    for (const ref of enumerateNoteItems()) {
      const p = parseReadingItemRef(ref);
      if (p?.skill !== 'note') continue;
      const pitch = pitchAtStaffPosition(p.clef, p.position);
      expect(letterOptions().map(o => o.id), ref).toContain(pitch.letter);
    }
  });

  it('THE ANSWER IS THE LETTER — the octave is not judged', () => {
    // note:treble:0 is E4, and note:treble:7 is E5. The same letter at
    // a different octave is the same answer; the verdict must not
    // reach for a numbering convention the question never asked for.
    expect(judgeNote('treble', 0, 'E')).toEqual({ letterCorrect: true, correct: true });
    expect(judgeNote('treble', 7, 'E')).toEqual({ letterCorrect: true, correct: true });

    const letterMiss = judgeNote('treble', 0, 'F');
    expect(letterMiss.correct).toBe(false);
    expect(letterMiss.letterCorrect).toBe(false);
  });

  it('an unanswered card is not silently correct', () => {
    expect(judgeNote('treble', 0, null).correct).toBe(false);
  });
});

describe('mnemonics', () => {
  it('names the right rhyme for each clef and line/space', () => {
    // treble position 0 is the bottom LINE (E), 1 is the first space (F).
    expect(mnemonicFor('treble', 0).phrase).toContain('Every Good Boy');
    expect(mnemonicFor('treble', 1).phrase).toContain('F A C E');
    expect(mnemonicFor('bass', 0).phrase).toContain('Good Boys Do Fine');
    expect(mnemonicFor('bass', 1).phrase).toContain('All Cows Eat Grass');
  });

  it('SAYS WHICH STAFF AND WHICH RUN IT IS FOR', () => {
    // There are four of these. A bare rhyme does not say when it
    // applies, which makes it unusable on the next card.
    expect(mnemonicFor('treble', 0).label).toBe('treble clef · staff lines');
    expect(mnemonicFor('treble', 1).label).toBe('treble clef · staff spaces');
    expect(mnemonicFor('bass', 0).label).toBe('bass clef · staff lines');
    expect(mnemonicFor('bass', 1).label).toBe('bass clef · staff spaces');
    // All four labels distinct — the point is telling them apart.
    const labels = new Set([
      mnemonicFor('treble', 0).label, mnemonicFor('treble', 1).label,
      mnemonicFor('bass', 0).label, mnemonicFor('bass', 1).label,
    ]);
    expect(labels.size).toBe(4);
  });

  it('items run BOTTOM TO TOP and match the staff they name', () => {
    // The ordering contract the diagram relies on: item 0 is drawn on
    // the bottom line. Reversed, every mnemonic would be upside down
    // and still look plausible.
    for (const clef of ['treble', 'bass'] as const) {
      for (const kind of [0, 1]) {
        const m = mnemonicFor(clef, kind);
        // Lines are positions 0,2,4,6,8; spaces are 1,3,5,7.
        const positions = m.kind === 'line' ? [0, 2, 4, 6, 8] : [1, 3, 5, 7];
        expect(m.items, `${clef}/${m.kind}`).toHaveLength(positions.length);
        m.items.forEach((item, i) => {
          const actual = pitchAtStaffPosition(clef, positions[i]).letter;
          expect(item.letter, `${clef}/${m.kind}[${i}]`).toBe(actual);
        });
      }
    }
  });

  it('VexFlow line indices invert bottom-to-top correctly', () => {
    // items run BOTTOM to TOP; VexFlow counts lines TOP-DOWN, so the
    // bottom line is index 4. Getting this backwards draws every
    // mnemonic upside down and looks entirely plausible.
    expect(vexLinesForItem('line', 0)).toEqual([4]);   // bottom line
    expect(vexLinesForItem('line', 4)).toEqual([0]);   // top line
    // A space sits between the two lines either side of it.
    expect(vexLinesForItem('space', 0)).toEqual([4, 3]); // bottom space
    expect(vexLinesForItem('space', 3)).toEqual([1, 0]); // top space
  });

  it('every mnemonic item maps to a line index on the staff', () => {
    // Five lines are indices 0-4. Anything outside would draw off the
    // staff entirely.
    for (const clef of ['treble', 'bass'] as const) {
      for (const kind of [0, 1]) {
        const m = mnemonicFor(clef, kind);
        m.items.forEach((_, i) => {
          for (const line of vexLinesForItem(m.kind, i)) {
            expect(line, `${clef}/${m.kind}[${i}]`).toBeGreaterThanOrEqual(0);
            expect(line, `${clef}/${m.kind}[${i}]`).toBeLessThanOrEqual(4);
          }
        });
      }
    }
  });

  it('each word starts with the letter it stands for', () => {
    for (const clef of ['treble', 'bass'] as const) {
      for (const kind of [0, 1]) {
        for (const item of mnemonicFor(clef, kind).items) {
          if (!item.word) continue;
          expect(item.word[0].toUpperCase(), item.word).toBe(item.letter);
        }
      }
    }
  });

  it('every note item resolves to a mnemonic', () => {
    for (const ref of enumerateNoteItems()) {
      const p = parseReadingItemRef(ref);
      if (p?.skill !== 'note') continue;
      expect(mnemonicFor(p.clef, p.position).items.length, ref)
        .toBeGreaterThan(0);
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
    // ...and the RIGHT number rides along, so the correction can be
    // shown before the tapping starts. Rehearsing four flats while
    // still believing there are three practises the wrong count.
    expect(countStageAfterPick('6f', '3f')).toEqual({
      stage: 'sequence', kind: 'flat', countCorrect: false, actualCount: 6,
    });
    expect(countStageAfterPick('4f', '3f')).toEqual({
      stage: 'sequence', kind: 'flat', countCorrect: false, actualCount: 4,
    });
    expect(countStageAfterPick('2s', '5s')).toEqual({
      stage: 'sequence', kind: 'sharp', countCorrect: false, actualCount: 2,
    });
  });

  it('the right kind enters the sequence stage on the kind PICKED', () => {
    expect(countStageAfterPick('3s', '3s')).toEqual({
      stage: 'sequence', kind: 'sharp', countCorrect: true, actualCount: 3,
    });
    expect(countStageAfterPick('2f', '2f')).toEqual({
      stage: 'sequence', kind: 'flat', countCorrect: true, actualCount: 2,
    });
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
