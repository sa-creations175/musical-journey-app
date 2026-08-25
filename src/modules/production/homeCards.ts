/**
 * Production's adapter: six paths and vocabulary → seven cards.
 *
 * =====================================================================
 * ONE GRID, TWO KINDS OF EVIDENCE — AND THE CARDS SAY WHICH.
 *
 * A PATH is a list of lessons the reader declares their own state on: a
 * five-step self-rating, `read it` through `mastered`. Nothing is
 * answered, so a path card has no tier and no bar.
 *
 * VOCABULARY is a flashcard drill. It writes ordinary `AttemptRecord`s
 * under `moduleId: 'production'` — the same rows harmonic fluency and
 * reading write — so its card carries the full reading, badge and bar
 * included.
 *
 * The result is a grid where one card has a bar and six do not. That is
 * the honest rendering of a module that measures two different things,
 * and it is why the accuracy half of the model is nullable rather than
 * defaulted.
 * =====================================================================
 *
 * COVERAGE STARTS AT "TRIED IT" (75), which is `isCovered` — the same
 * line the Production coverage goals count. Not at comprehension: the
 * scale exists to say you did the thing.
 */
import type { AttemptRecord, ProductionLesson } from '../../lib/db';
import {
  categoryCardStats,
  type CategoryCardModel,
} from '../../components/moduleHome/model';
import { PRODUCTION_PATHS } from './content/paths';
import { lessonsByPath } from './content/lessons';
import { GLOSSARY } from './content/glossary';
import { isCovered } from './lessonRating';
import { daysBetween, localDayKey } from '../../lib/dailyGoal';

/** Production writes its vocabulary attempts under this module id. */
export const PRODUCTION_MODULE_ID = 'production';

/** The one card that is not a path. */
export const VOCABULARY_CARD_KEY = 'vocabulary';

export function isProductionPathKey(key: string): boolean {
  return PRODUCTION_PATHS.some(p => p.id === key);
}

export function productionCards(
  lessonStates: readonly ProductionLesson[],
  attempts: readonly AttemptRecord[],
  now: number,
): CategoryCardModel[] {
  const stateById = new Map(lessonStates.map(s => [s.id, s]));

  const pathCards = PRODUCTION_PATHS.map<CategoryCardModel>(path => {
    const lessons = lessonsByPath(path.id);
    const covered = lessons.filter(l => isCovered(stateById.get(l.id)?.rating ?? 0)).length;
    const latestOpen = lessons.reduce<number | null>((max, l) => {
      const at = stateById.get(l.id)?.lastOpenedAt ?? null;
      return at !== null && (max === null || at > max) ? at : max;
    }, null);

    return {
      key: path.id,
      // The catalog's own title and subtitle — the words the path list
      // already showed, moved rather than rewritten.
      label: path.title,
      itemCount: lessons.length,
      countDetail: null,
      description: path.subtitle,
      // A declared rating, not an answer — see the header.
      accuracy: null,
      itemsSeen: covered,
      lastPracticedDaysAgo: latestOpen === null
        ? null
        : daysBetween(localDayKey(new Date(latestOpen)), localDayKey(new Date(now))),
    };
  });

  const vocabulary: CategoryCardModel = {
    key: VOCABULARY_CARD_KEY,
    label: 'vocabulary',
    itemCount: GLOSSARY.length,
    countDetail: null,
    description: null,
    // Real attempts, so the full reading. No spacing map: vocabulary
    // skips `recordEngagement`, so no tick carries its own interval and
    // the bar's fallback applies — see `spacingIntervalFor`.
    ...categoryCardStats(
      attempts.filter(a => a.moduleId === PRODUCTION_MODULE_ID),
      new Map(),
      now,
    ),
  };

  return [...pathCards, vocabulary];
}
