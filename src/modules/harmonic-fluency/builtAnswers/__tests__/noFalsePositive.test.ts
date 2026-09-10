/**
 * A wrong answer must never read as the right one.
 *
 * =====================================================================
 * THE SHELL JUDGES ONE STRING, WHICH IS THE WHOLE HAZARD.
 *
 * A built surface grades locally and then hands `FlashcardSession`
 * either the card's own `correctAnswer` or a description of what was
 * really built. That description is compared against `correctAnswer`
 * by the shell, so a description that HAPPENS to equal it turns a wrong
 * answer into a right one — silently, and in the reader's favour,
 * which is the direction nobody notices.
 *
 * It has already happened once: the count cards answer with a bare
 * number, so "one flat" in the key of G major described itself as "1"
 * and the shell marked it correct. This is the guard that found it.
 *
 * =====================================================================
 * IT WALKS THE DECK RATHER THAN A HANDFUL OF EXAMPLES.
 *
 * Every card with a built answer, every family, and for each one a set
 * of wrong builds derived from the right one. A family added later gets
 * covered by the switch below or fails the exhaustiveness check.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../../catalog';
import { builtTargetFor, type BuiltTarget } from '../cardTargets';
import {
  gradeProgression, gradeRoot, gradeScale, gradeSignature, gradeSlash,
  type BuiltChord,
} from '../grade';
import { QUALITIES } from '../../../../lib/builtAnswers/chordShapes';

/** Every wrong build worth trying against one card. */
function wrongGrades(target: BuiltTarget): Array<{ built: string; correct: boolean }> {
  switch (target.kind) {
    case 'progression': {
      const right: BuiltChord[] = target.chords.map(c => ({
        rootPc: c.rootPc, quality: c.quality,
      }));
      const out: Array<{ built: string; correct: boolean }> = [];
      // Every chord, wrong on the root; and every chord, wrong on the
      // family.
      for (let i = 0; i < right.length; i += 1) {
        for (let shift = 1; shift < 12; shift += 1) {
          const bad = right.map((c, j) => (j === i
            ? { ...c, rootPc: ((c.rootPc ?? 0) + shift) % 12 } : c));
          out.push(gradeProgression(target, bad));
        }
        for (const q of QUALITIES) {
          const bad = right.map((c, j) => (j === i ? { ...c, quality: q.id } : c));
          out.push(gradeProgression(target, bad));
        }
      }
      return out;
    }
    case 'slash': {
      const out: Array<{ built: string; correct: boolean }> = [];
      for (let shift = 0; shift < 12; shift += 1) {
        for (let bassShift = 0; bassShift < 12; bassShift += 1) {
          out.push(gradeSlash(target, {
            chord: {
              rootPc: (target.chordRootPc + shift) % 12,
              quality: target.quality,
            },
            bassPc: (target.bassPc + bassShift) % 12,
          }));
        }
      }
      for (const q of QUALITIES) {
        out.push(gradeSlash(target, {
          chord: { rootPc: target.chordRootPc, quality: q.id },
          bassPc: target.bassPc,
        }));
      }
      return out;
    }
    case 'scale': {
      const out: Array<{ built: string; correct: boolean }> = [];
      // One note swapped for each note not in the scale.
      for (let pc = 0; pc < 12; pc += 1) {
        if (target.pcs.includes(pc)) continue;
        out.push(gradeScale(target, [...target.pcs.slice(1), pc]));
      }
      // And the right notes from every wrong first tap.
      for (const first of target.pcs) {
        out.push(gradeScale(target, [
          first, ...target.pcs.filter(p => p !== first),
        ]));
      }
      return out;
    }
    case 'root': {
      const out: Array<{ built: string; correct: boolean }> = [];
      for (let pc = 0; pc < 12; pc += 1) out.push(gradeRoot(target, pc));
      out.push(gradeRoot(target, null));
      return out;
    }
    case 'signature': {
      const out: Array<{ built: string; correct: boolean }> = [];
      for (let count = 0; count <= 6; count += 1) {
        for (const direction of ['sharps', 'flats', null] as const) {
          out.push(gradeSignature(target, { count, direction }));
        }
      }
      out.push(gradeSignature(target, { count: null, direction: null }));
      return out;
    }
  }
}

const built = FLASHCARDS
  .map(card => ({ card, target: builtTargetFor(card) }))
  .filter((x): x is { card: typeof FLASHCARDS[number]; target: BuiltTarget } =>
    x.target !== null);

describe('no wrong build can read as the right answer', () => {
  it('covers every card that builds its answer', () => {
    expect(built).toHaveLength(272);
  });

  it('never describes a wrong answer as the card\'s own answer', () => {
    const offenders: string[] = [];
    for (const { card, target } of built) {
      for (const grade of wrongGrades(target)) {
        if (grade.correct) continue;
        if (grade.built === card.correctAnswer) {
          offenders.push(`${card.id}: "${grade.built}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('and really did try wrong builds, on every family', () => {
    // Guards the test above: a generator that produced no wrong builds
    // would pass it by checking nothing.
    const tried = new Map<string, number>();
    for (const { target } of built) {
      const wrong = wrongGrades(target).filter(g => !g.correct);
      tried.set(target.kind, (tried.get(target.kind) ?? 0) + wrong.length);
    }
    expect([...tried.keys()].sort())
      .toEqual(['progression', 'root', 'scale', 'signature', 'slash']);
    for (const [kind, n] of tried) {
      expect(n, kind).toBeGreaterThan(0);
    }
  });
});
