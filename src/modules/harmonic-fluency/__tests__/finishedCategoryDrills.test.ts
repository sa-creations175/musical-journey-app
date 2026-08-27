// @vitest-environment jsdom
/**
 * A FINISHED CATEGORY IS STILL DRILLABLE.
 *
 * =====================================================================
 * THE BUG THIS PINS.
 *
 * `buildSession` drew from two pools — cards DUE and cards NEVER SEEN —
 * and reported `allCaughtUp` when both were empty. Completing a
 * category empties both by definition: every card has been answered, so
 * none is new, and every one is scheduled into the future, so none is
 * due. Tritone Pairs at 12/12 therefore produced an empty queue, the
 * page's `startWith` returned early, and "drill category" did nothing
 * visible — the only notice lived beside the Start button inside a
 * collapsed settings panel, far below the card that had been tapped.
 *
 * Finishing something took it away from you. These tests fail against
 * that build and pass against the fallback.
 * =====================================================================
 *
 * CATEGORY-LEVEL, NOT TRITONE-LEVEL. The fixture completes an arbitrary
 * category and the assertions name none of the fifteen specifically —
 * the emptiness is a property of the builder, and so is the fix.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, type SpacingState } from '../../../lib/db';
import { FLASHCARDS, type FlashcardCategory } from '../catalog';
import { buildSession, practiceAheadNotice } from '../spacedRepetition';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const FINISHED: FlashcardCategory = 'tritone-pairs';
const OTHER: FlashcardCategory = 'named-notes';

const cardsIn = (category: FlashcardCategory) =>
  FLASHCARDS.filter(c => c.category === category);

/** A spacing row for a card that HAS been answered — stage past `new`,
 *  which is what `isCardSeen` reads. */
function state(itemRef: string, nextDueAt: number): SpacingState {
  return {
    id: `sp-${itemRef}`,
    itemRef,
    moduleRef: 'harmonic-fluency',
    hand: 'both',
    style: 'solid',
    memoryType: 'declarative',
    acquisitionStage: 'acquired',
    currentIntervalDays: 10,
    lastEngagedAt: NOW - DAY,
    nextDueAt,
    performanceHistory: [],
  };
}

/** Every card in `category` seen and scheduled into the future. */
async function finish(category: FlashcardCategory, at = NOW + 10 * DAY) {
  await db.spacingState.bulkPut(cardsIn(category).map(c => state(c.id, at)));
}

/** Every card in `category` seen and due right now. */
async function makeDue(category: FlashcardCategory) {
  await db.spacingState.bulkPut(cardsIn(category).map(c => state(c.id, NOW - DAY)));
}

beforeEach(async () => {
  await db.spacingState.clear();
});

/**
 * LEAVE THE TABLE AS IT WAS FOUND.
 *
 * `spacingState` is shared across test files in a worker, and
 * `harmonicFluencyPage` clears only `db.attempts`. Rows left behind
 * here would turn that file's result into a function of test ORDER —
 * its drill-category test asserts a session starts, which depends on
 * whether these fixtures have made the category due, finished, or
 * untouched. Cleaning up after is cheaper than every other file
 * defending itself.
 */
afterEach(async () => {
  await db.spacingState.clear();
});

describe('drilling a category with nothing due', () => {
  it('still returns a queue', async () => {
    await finish(FINISHED);

    const session = await buildSession({
      categories: [FINISHED], target: 20, now: NOW,
    });

    // The reversal: on the old builder this is [] and allCaughtUp.
    expect(session.cards.length).toBeGreaterThan(0);
    expect(session.allCaughtUp).toBe(false);
    expect(session.practiceAhead).toBe(true);
  });

  it('serves only that category, nearest-due first', async () => {
    await finish(FINISHED);

    const session = await buildSession({
      categories: [FINISHED], target: 20, now: NOW,
    });
    expect(session.cards.every(c => c.category === FINISHED)).toBe(true);
    expect(session.cards).toHaveLength(cardsIn(FINISHED).length);
  });

  it('hands back ordinary catalog cards — no ahead-of-schedule marking', async () => {
    // "The reps count normally." Nothing wraps or tags a practice-ahead
    // card, so the session and `recordAttempt` cannot treat it as a
    // lesser answer even if someone later wanted them to.
    await finish(FINISHED);
    const session = await buildSession({
      categories: [FINISHED], target: 20, now: NOW,
    });
    for (const card of session.cards) {
      expect(FLASHCARDS.includes(card)).toBe(true);
    }
  });

  it('counts what is due everywhere else', async () => {
    await finish(FINISHED);
    await makeDue(OTHER);

    const session = await buildSession({
      categories: [FINISHED], target: 20, now: NOW,
    });
    expect(session.practiceAhead).toBe(true);
    expect(session.dueElsewhere).toBe(cardsIn(OTHER).length);
    // Derived from OUTSIDE the selection — the finished category's own
    // cards are not due and must not be counted either way.
    expect(session.dueElsewhere).not.toBe(0);
  });

  it('reports nothing due elsewhere when nothing is', async () => {
    await finish(FINISHED);
    const session = await buildSession({
      categories: [FINISHED], target: 20, now: NOW,
    });
    expect(session.dueElsewhere).toBe(0);
  });

  it('does not count an elsewhere for a session that will not show one', async () => {
    await finish(FINISHED);
    await makeDue(OTHER);
    const session = await buildSession({ categories: [], target: 20, now: NOW });
    // The wide selection has real work in it, so this is not a
    // practice-ahead run. `null`, not 0 — nothing asked the question,
    // and a 0 here would read as "nothing else is due" when plenty is.
    expect(session.practiceAhead).toBe(false);
    expect(session.dueElsewhere).toBeNull();
  });

  it('has no elsewhere to report when every category is the selection', async () => {
    // Every category selected AND every one of them finished: a
    // practice-ahead run over the whole catalog, where "other
    // categories" is empty by construction.
    for (const category of new Set(FLASHCARDS.map(c => c.category))) {
      await finish(category);
    }
    const session = await buildSession({ categories: [], target: 20, now: NOW });
    expect(session.practiceAhead).toBe(true);
    expect(session.dueElsewhere).toBe(0);
    expect(practiceAheadNotice(session.dueElsewhere ?? 0))
      .toBe('Nothing due here — you just finished these.');
  });
});

describe('the ordinary paths are untouched', () => {
  it('a due card still comes back as due, not as practice-ahead', async () => {
    await makeDue(FINISHED);
    const session = await buildSession({
      categories: [FINISHED], target: 20, now: NOW,
    });
    expect(session.practiceAhead).toBe(false);
    expect(session.dueCount).toBe(cardsIn(FINISHED).length);
    expect(session.allCaughtUp).toBe(false);
  });

  it('an unseen category still introduces new cards', async () => {
    const session = await buildSession({
      categories: [FINISHED], target: 20, now: NOW,
    });
    expect(session.practiceAhead).toBe(false);
    expect(session.newCount).toBe(cardsIn(FINISHED).length);
  });

  it('flagged-only with no flags is still caught up', async () => {
    // The early return survives for the case it was written for. A
    // reader who asked for flagged cards must not be handed unflagged
    // ones because the flag set was empty.
    await finish(FINISHED);
    const session = await buildSession({
      categories: [FINISHED], target: 20, flaggedOnly: true, now: NOW,
    });
    expect(session.cards).toHaveLength(0);
    expect(session.allCaughtUp).toBe(true);
    expect(session.practiceAhead).toBe(false);
  });
});

describe('what the session says about itself', () => {
  it('names where the due work is', () => {
    expect(practiceAheadNotice(47)).toBe(
      'Nothing due here — you just finished these. 47 cards are due in other categories.',
    );
  });

  it('drops the second sentence entirely when nothing else is due', () => {
    const notice = practiceAheadNotice(0);
    expect(notice).toBe('Nothing due here — you just finished these.');
    // Not "0 cards" — gone.
    expect(notice).not.toContain('0');
    expect(notice).not.toContain('other categories');
  });

  it('agrees with itself in the singular', () => {
    expect(practiceAheadNotice(1)).toContain('1 card is due in other categories.');
  });
});
