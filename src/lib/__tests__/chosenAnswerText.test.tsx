// @vitest-environment jsdom
/**
 * The value-level choice, and why it is a second field.
 *
 * =====================================================================
 * WHAT THIS CAN AND CANNOT PROVE.
 *
 * `chosenAnswerText` joins to nothing by design — there is no catalog
 * item on the other end of it — so there is no round trip to assert the
 * way `chosenItemId` has one. What CAN be proved is that the value is
 * the option the reader actually picked rather than the answer, the
 * index, or the card id, and that a correct answer records too.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import FlashcardSession, { type CardAnsweredArgs } from '../flashcards/FlashcardSession';
import { toPgRow } from '../sync/engine';
import { SYNC_TABLE_BY_DEXIE } from '../sync/tables';
import type { AttemptRecord } from '../db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ASYMMETRIC FIXTURE.
 *
 * The option the reader picks is `zither` — the THIRD decoy, not the
 * first, and its first character shares nothing with `rosewood`. So a
 * writer that recorded `decoys[0]`, or the correct answer, or an index,
 * produces a value distinguishable from the right one.
 */
const CARD = {
  id: 'card-42',
  category: 'testing',
  categoryName: 'Testing',
  question: 'which one',
  correctAnswer: 'rosewood',
  decoys: ['ranger', 'rondo', 'zither'],
};
const PICKED = 'zither';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
});

function render(onCardAnswered: (a: CardAnsweredArgs<typeof CARD>) => void) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <FlashcardSession
        queue={[CARD]}
        timerMode="off"
        onExit={() => {}}
        onCardAnswered={onCardAnswered}
      />,
    );
  });
}

/**
 * ASYNC ACT, AND IT IS LOAD-BEARING — see flashcardTiming.test.tsx.
 * `handleAnswer` awaits `onCardAnswered`, so the state update lands in
 * a microtask and a synchronous click returns before it runs.
 *
 * Matched by `includes` because the option button carries more than the
 * label. None of these four fixtures is a substring of another, so the
 * looser match cannot pick the wrong one.
 */
async function clickOption(label: string) {
  const btn = [...host!.querySelectorAll('button')]
    .find(b => (b.textContent ?? '').includes(label));
  expect(btn, `no option button labelled ${label}`).toBeDefined();
  await act(async () => { btn!.click(); });
}

describe('the shell reports the option that was picked', () => {
  it('has fixtures no substring match could confuse', () => {
    const all = [CARD.correctAnswer, ...CARD.decoys];
    for (const a of all) {
      for (const b of all) {
        if (a !== b) expect(b.includes(a), `${b} contains ${a}`).toBe(false);
      }
    }
    // And the picked option is the LAST decoy, not the first.
    expect(CARD.decoys.indexOf(PICKED)).toBe(CARD.decoys.length - 1);
    expect(PICKED[0]).not.toBe(CARD.correctAnswer[0]);
  });

  it('delivers the chosen text, not the answer and not an index', async () => {
    let seen: CardAnsweredArgs<typeof CARD> | null = null;
    render(a => { seen = a; });
    await clickOption(PICKED);

    const args = seen! as CardAnsweredArgs<typeof CARD>;
    expect(args.choice).toBe(PICKED);
    // The three things it must not be.
    expect(args.choice).not.toBe(CARD.correctAnswer);
    expect(args.choice).not.toBe(CARD.decoys[0]);
    expect(args.choice).not.toBe(CARD.id);
    expect(Number.isNaN(Number(args.choice))).toBe(true);
    // And the verdict is still wrong — recording the choice does not
    // change what the answer scored as.
    expect(args.correct).toBe(false);
  });

  it('reports a CORRECT choice too, as the correct option', async () => {
    let seen: CardAnsweredArgs<typeof CARD> | null = null;
    render(a => { seen = a; });
    await clickOption(CARD.correctAnswer);

    const args = seen! as CardAnsweredArgs<typeof CARD>;
    expect(args.choice).toBe(CARD.correctAnswer);
    expect(args.correct).toBe(true);
  });
});

/**
 * The two modules that fold the shell's `choice` onto the row.
 *
 * Source-level for the reason given in chosenItemId.test.ts: reaching
 * `addAttempt` through either session component means driving SM-2,
 * Dexie and a whole session lifecycle to assert one string. What this
 * catches is the field being dropped, renamed, or written at a site
 * that has no business carrying it.
 */
const WRITERS = import.meta.glob(
  '/src/modules/{harmonic-fluency/HarmonicFluencySession,production/VocabularySession}.tsx',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const sourceFor = (name: string) =>
  Object.entries(WRITERS).find(([p]) => p.endsWith(`/${name}.tsx`))![1];

describe('both shell modules record the value', () => {
  it('finds both sources, so the sweep is not vacuously empty', () => {
    expect(Object.keys(WRITERS)).toHaveLength(2);
  });

  for (const name of ['HarmonicFluencySession', 'VocabularySession']) {
    it(`${name} folds choice onto the row and omits it on timeout`, () => {
      const src = sourceFor(name);
      expect(src).toContain('chosenAnswerText: choice');
      // Guarded, because the shell answers null when the countdown
      // expires and `timedOut` already records that.
      expect(src).toContain('choice !== null');
      // It must destructure `choice` rather than reading some other
      // value that happens to be in scope.
      expect(src).toMatch(/handleCardAnswered\(\{[^}]*\bchoice\b/s);
    });
  }
});

/**
 * THE INVARIANT: no attempt row carries both fields.
 *
 * Not a rule invented to be satisfiable — it falls out of which modules
 * write which. `chosenItemId` is written by intervals and chord
 * progressions; `chosenAnswerText` by harmonic fluency and production
 * vocabulary. The two sets are disjoint, so a reader holding a row can
 * always tell which kind of choice it records.
 */
const ALL_WRITE_SITES = import.meta.glob(
  '/src/modules/**/*.tsx',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

describe('the two fields never appear on one row', () => {
  it('is written by disjoint sets of files', () => {
    const withItemId = Object.entries(ALL_WRITE_SITES)
      .filter(([, s]) => s.includes('chosenItemId:')).map(([p]) => p);
    const withText = Object.entries(ALL_WRITE_SITES)
      .filter(([, s]) => s.includes('chosenAnswerText:')).map(([p]) => p);

    // Both halves are non-empty, or "disjoint" is vacuous. FOUR SINCE
    // 10 SEP 2026: the Full Progression card joined intervals, key
    // detection and chord motion — it records which progression and
    // position the reader chose, which is an item and not a sentence.
    expect(withItemId.length).toBe(4);
    expect(withText.length).toBe(2);
    expect(withItemId.filter(p => withText.includes(p))).toEqual([]);
  });

  it('has no single file writing both', () => {
    const both = Object.entries(ALL_WRITE_SITES)
      .filter(([, s]) => s.includes('chosenItemId:') && s.includes('chosenAnswerText:'))
      .map(([p]) => p);
    expect(both).toEqual([]);
  });
});

describe('the value survives the sync push unstripped', () => {
  it('carries chosenAnswerText into the data blob', () => {
    const cfg = SYNC_TABLE_BY_DEXIE.get('attempts')!;
    const row: AttemptRecord = {
      id: 'att-9', moduleId: 'harmonic-fluency', itemId: CARD.id,
      correct: false, timestamp: 7, chosenAnswerText: PICKED,
    };
    const pushed = toPgRow(cfg, row, 'user-1');
    expect((pushed.data as AttemptRecord).chosenAnswerText).toBe(PICKED);
  });

  it('adds no column, which is why no SQL migration is needed', () => {
    const cfg = SYNC_TABLE_BY_DEXIE.get('attempts')!;
    const pushed = toPgRow(cfg, {
      id: 'att-10', moduleId: 'production', itemId: 'x',
      correct: true, timestamp: 1, chosenAnswerText: 'anything',
    }, 'user-1');
    // The attempts table's indexed columns are module_id and TIMESTAMP
    // — not item_id, which rides in the blob like everything else.
    expect(Object.keys(pushed).sort())
      .toEqual(['data', 'id', 'module_id', 'timestamp', 'user_id']);
    expect(cfg.topLevel.map(c => c.pg)).toEqual(['module_id', 'timestamp']);
    expect(cfg.topLevel.map(c => c.dexie)).not.toContain('chosenAnswerText');
  });
});
