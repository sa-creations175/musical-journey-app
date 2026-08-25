/**
 * Production's seven cards — six paths and vocabulary.
 *
 * THE MIXED GRID IS THE THING UNDER TEST. A path is a declared rating
 * and carries no bar; vocabulary is a drill that writes real attempts
 * and carries the full reading. A change that gave the paths an empty
 * window would put six measured-looking badges on a module that never
 * measured them.
 */
import { describe, expect, it } from 'vitest';
import type { AttemptRecord, ProductionLesson } from '../../../lib/db';
import { PRODUCTION_PATHS } from '../content/paths';
import { lessonsByPath } from '../content/lessons';
import { GLOSSARY } from '../content/glossary';
import {
  PRODUCTION_MODULE_ID,
  VOCABULARY_CARD_KEY,
  isProductionPathKey,
  productionCards,
} from '../homeCards';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const FIRST_PATH = PRODUCTION_PATHS[0];

function lesson(
  id: string, pathId: string, rating: number, lastOpenedAt: number | null = null,
): ProductionLesson {
  return {
    id, pathId, order: 0, rating, revisitCount: 0, lastOpenedAt,
  } as ProductionLesson;
}

function attempt(correct: boolean, timestamp: number, itemId = 'term-1'): AttemptRecord {
  return { id: `a-${timestamp}`, moduleId: PRODUCTION_MODULE_ID, itemId, correct, timestamp };
}

const byKey = (states: ProductionLesson[] = [], attempts: AttemptRecord[] = []) =>
  new Map(productionCards(states, attempts, NOW).map(c => [c.key, c]));

describe('the seven cards', () => {
  it('are the six paths, then vocabulary', () => {
    const cards = productionCards([], [], NOW);
    expect(cards).toHaveLength(PRODUCTION_PATHS.length + 1);
    expect(cards.slice(0, -1).map(c => c.key)).toEqual(PRODUCTION_PATHS.map(p => p.id));
    expect(cards[cards.length - 1].key).toBe(VOCABULARY_CARD_KEY);
  });

  it('take their words from the catalog', () => {
    const cards = byKey();
    expect(cards.get(FIRST_PATH.id)!.label).toBe(FIRST_PATH.title);
    expect(cards.get(FIRST_PATH.id)!.description).toBe(FIRST_PATH.subtitle);
  });
});

describe('a path card', () => {
  it('carries no accuracy — the rating is declared, not answered', () => {
    for (const path of PRODUCTION_PATHS) {
      expect(byKey().get(path.id)!.accuracy).toBeNull();
    }
  });

  it('counts its lessons off the catalog', () => {
    expect(byKey().get(FIRST_PATH.id)!.itemCount).toBe(lessonsByPath(FIRST_PATH.id).length);
  });

  it('counts covered at "tried it", not at "read it"', () => {
    // 75 is the coverage line the Production goals use; 50 is still
    // reading about it.
    const lessons = lessonsByPath(FIRST_PATH.id);
    const cards = byKey([
      lesson(lessons[0].id, FIRST_PATH.id, 75),
      lesson(lessons[1].id, FIRST_PATH.id, 50),
    ]);
    expect(cards.get(FIRST_PATH.id)!.itemsSeen).toBe(1);
  });

  it('reports the most recently opened lesson in the path', () => {
    const lessons = lessonsByPath(FIRST_PATH.id);
    const cards = byKey([
      lesson(lessons[0].id, FIRST_PATH.id, 0, NOW - 6 * DAY),
      lesson(lessons[1].id, FIRST_PATH.id, 0, NOW - 2 * DAY),
    ]);
    expect(cards.get(FIRST_PATH.id)!.lastPracticedDaysAgo).toBe(2);
  });

  it('says nothing rather than zero when nothing has been opened', () => {
    expect(byKey().get(FIRST_PATH.id)!.lastPracticedDaysAgo).toBeNull();
  });
});

describe('the vocabulary card', () => {
  it('carries the full reading, because it writes real attempts', () => {
    const cards = byKey([], [
      attempt(true, NOW - 3000),
      attempt(false, NOW - 2000),
      attempt(true, NOW - 1000),
    ]);
    const vocab = cards.get(VOCABULARY_CARD_KEY)!;
    expect(vocab.accuracy).not.toBeNull();
    expect(vocab.accuracy!.rollingTotal).toBe(3);
    expect(vocab.accuracy!.rollingCorrect).toBe(2);
  });

  it('denominates against the glossary', () => {
    expect(byKey().get(VOCABULARY_CARD_KEY)!.itemCount).toBe(GLOSSARY.length);
  });

  it('ignores attempts from other modules', () => {
    const foreign: AttemptRecord = {
      ...attempt(true, NOW - 1000), moduleId: 'harmonic-fluency',
    };
    expect(byKey([], [foreign]).get(VOCABULARY_CARD_KEY)!.accuracy!.rollingTotal).toBe(0);
  });
});

describe('the keys route', () => {
  it('tells a path from the vocabulary card', () => {
    for (const path of PRODUCTION_PATHS) expect(isProductionPathKey(path.id)).toBe(true);
    expect(isProductionPathKey(VOCABULARY_CARD_KEY)).toBe(false);
  });
});
