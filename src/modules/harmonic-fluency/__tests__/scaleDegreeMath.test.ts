/**
 * The scale-degree-math explanations teach the method.
 *
 * ---------------------------------------------------------------
 * THE ASSERTION THAT MATTERS IS THAT THE ARITHMETIC RESOLVES.
 *
 * These 84 lines are the only place in the app where an explanation
 * does a calculation the reader is expected to follow. A hand-written
 * one can drift from the answer beside it, and a wrong sum in a line
 * whose entire job is to teach the sum is worse than no line — the
 * reader learns the error and trusts it.
 *
 * So the test PARSES each explanation's arithmetic back out and checks
 * it lands on that card's own correctAnswer, for all 84. Checking the
 * shape of the text, or spot-checking two cards, would pass on a
 * builder that computed the wrong number consistently.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';

const CARDS = FLASHCARDS.filter(c => c.category === 'scale-degree-math');
/** Operators and negatives both use U+2212, never an ASCII hyphen. */
const MINUS = '−';

/** Evaluate one "a − b = c" / "a + b = c" line and return its parts. */
function parseOp(line: string): { left: number; op: string; right: number; result: number } | null {
  const m = line.match(
    new RegExp(`^(${MINUS}?\\d+) ([+${MINUS}]) (\\d+) = (${MINUS}?\\d+)$`),
  );
  if (!m) return null;
  const n = (s: string) => Number(s.replace(MINUS, '-'));
  return { left: n(m[1]), op: m[2], right: n(m[3]), result: n(m[4]) };
}

describe('every card, all 84', () => {
  it('has the expected count', () => {
    expect(CARDS).toHaveLength(84);
  });

  it('states arithmetic that RESOLVES to its own answer', () => {
    for (const card of CARDS) {
      const lines = (card.explanation ?? '').split('\n');
      const ops = lines.map(parseOp).filter((o): o is NonNullable<typeof o> => o !== null);
      expect(ops.length, `${card.id} has no arithmetic`).toBeGreaterThan(0);

      // Each operation must be internally correct...
      for (const o of ops) {
        const expected = o.op === '+' ? o.left + o.right : o.left - o.right;
        expect(expected, `${card.id}: ${o.left} ${o.op} ${o.right}`).toBe(o.result);
      }
      // ...and the MAIN chain (before the shortcut) must land on the
      // card's answer. The shortcut is a second route to the same
      // place and is checked separately below.
      const shortcutAt = lines.findIndex(l => l.startsWith('Shortcut:'));
      const mainOps = lines
        .slice(0, shortcutAt)
        .map(parseOp)
        .filter((o): o is NonNullable<typeof o> => o !== null);
      expect(String(mainOps.at(-1)!.result), card.id).toBe(card.correctAnswer);
    }
  });

  it('derives the step count as n − 1 on every card', () => {
    for (const card of CARDS) {
      const m = (card.explanation ?? '').match(/a (\d)(?:nd|rd|th) = (\d) steps? \((\d) − 1\)/);
      expect(m, card.id).not.toBeNull();
      const [, nameOrdinal, steps, shownOrdinal] = m!;
      expect(shownOrdinal, card.id).toBe(nameOrdinal);
      expect(Number(steps), card.id).toBe(Number(nameOrdinal) - 1);
    }
  });

  it('lands the shortcut on the same answer, where it shows the sum', () => {
    // Descending cards work the inversion through. When they do, it
    // has to agree with the main chain — two routes, one destination.
    for (const card of CARDS.filter(c => c.id.includes('-down-'))) {
      const lines = (card.explanation ?? '').split('\n');
      const at = lines.findIndex(l => l.startsWith('Shortcut:'));
      const after = lines.slice(at).join('\n');
      const results = [...after.matchAll(new RegExp(`= (${MINUS}?\\d+)`, 'g'))]
        .map(m => m[1]);
      expect(results.at(-1), card.id).toBe(card.correctAnswer);
    }
  });
});

describe('the inverted interval is derived from 9 − n', () => {
  it('pairs 2↔7, 3↔6, 4↔5 on every card', () => {
    const ORDINAL: Readonly<Record<string, number>> = {
      '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, '6th': 6, '7th': 7,
    };
    for (const card of CARDS) {
      const own = card.question.match(/a (\dnd|\drd|\dth) = \?/)![1];
      const shortcut = (card.explanation ?? '')
        .match(/Shortcut: (?:up|down) a \S+ = (?:up|down) a (\dnd|\drd|\dth)/)![1];
      expect(ORDINAL[shortcut], card.id).toBe(9 - ORDINAL[own]);
    }
  });
});

describe('formatting the method depends on', () => {
  it('puts one operation per line', () => {
    // Chaining with arrows is what made an earlier draft unreadable.
    for (const card of CARDS) {
      for (const line of (card.explanation ?? '').split('\n')) {
        if (parseOp(line) === null) continue;
        expect((line.match(/=/g) ?? []).length, `${card.id}: ${line}`).toBe(1);
      }
    }
  });

  it('shows a wrap line ONLY when the sum leaves 1–7', () => {
    // A no-op wrap on a card that never left the octave would teach a
    // step that did not happen.
    for (const card of CARDS) {
      const lines = (card.explanation ?? '').split('\n');
      const at = lines.findIndex(l => l.startsWith('Shortcut:'));
      const main = lines.slice(0, at).map(parseOp)
        .filter((o): o is NonNullable<typeof o> => o !== null);
      const firstResult = main[0].result;
      const wrapped = main.length > 1;
      expect(wrapped, card.id).toBe(firstResult > 7 || firstResult < 1);
    }
  });

  it('uses the minus sign for negatives, never an ASCII hyphen', () => {
    // "4 − 6 = -2" would put two different characters for one
    // operation on one line.
    for (const card of CARDS) {
      expect((card.explanation ?? '').includes('-'), card.id).toBe(false);
    }
  });

  it('agrees in number: 1 step, 2 steps', () => {
    const second = CARDS.find(c => c.id === 'sdm-7-down-2nd')!;
    expect(second.explanation).toContain('1 step (2 − 1)');
    const third = CARDS.find(c => c.id === 'sdm-1-down-3rd')!;
    expect(third.explanation).toContain('2 steps (3 − 1)');
  });

  it('carries the shared rule on all 84, identically', () => {
    const rules = new Set(
      CARDS.map(c => (c.explanation ?? '').split('\n').at(-1)),
    );
    expect(rules.size).toBe(1);
    expect([...rules][0]).toContain('Pairs add to 9: 2↔7, 3↔6, 4↔5');
  });

  it('carries a shortcut line on all 84, including where it saves nothing', () => {
    // Seeing the pairing every time is how it gets learned.
    for (const card of CARDS) {
      expect(card.explanation, card.id).toContain('Shortcut:');
    }
    expect(CARDS.find(c => c.id === 'sdm-3-up-2nd')!.explanation)
      .toContain('Shortcut: up a 2nd = down a 7th');
  });
});

describe('the two approved examples, verbatim', () => {
  it('renders 3 up a 4th exactly as specified', () => {
    expect(FLASHCARDS.find(c => c.id === 'sdm-3-up-4th')!.explanation)
      .toBe([
        '3 up a 4th = 6',
        '',
        'a 4th = 3 steps (4 − 1)',
        '3 + 3 = 6',
        '',
        'Shortcut: up a 4th = down a 5th → same distance either way.',
        '',
        'Intervals move n − 1 steps — one less, because you count the degree you '
        + 'start on. Outside 1–7, add or subtract 7. Pairs add to 9: 2↔7, 3↔6, 4↔5. '
        + 'The shortcut is worth it on 6ths and 7ths, where it turns a long count '
        + 'into a short one.',
      ].join('\n'));
  });

  it('renders 4 down a 7th exactly as specified', () => {
    const e = FLASHCARDS.find(c => c.id === 'sdm-4-down-7th')!.explanation!;
    expect(e.split('\n').slice(0, 7)).toEqual([
      '4 down a 7th = 5',
      '',
      'a 7th = 6 steps (7 − 1)',
      '4 − 6 = −2',
      '−2 + 7 = 5',
      '',
      'Shortcut: down a 7th = up a 2nd → 4 + 1 = 5',
    ]);
  });
});
