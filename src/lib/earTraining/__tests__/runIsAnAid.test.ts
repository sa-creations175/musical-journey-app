/**
 * A run is a listening aid on every Ear Training quiz.
 *
 * =====================================================================
 * THE THREE QUIZZES, NAMED, BECAUSE THE RULE LIVES AT EACH CALL SITE.
 *
 * `isAided` only counts Play as where a surface asks it to. Silas's
 * answer of 13 Sep 2026 is that all three Ear Training quizzes ask — so
 * a quiz that stopped passing the flag would quietly rate a run as a
 * first listen, and no behaviour test on the other two would notice.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';

const SOURCES: Record<string, string> = import.meta.glob(
  [
    '../../../modules/ear-training/chord-recognition/ChordRecognitionQuiz.tsx',
    '../../../modules/ear-training/chord-progressions/ChordMotionTab.tsx',
    '../../../modules/ear-training/chord-progressions/FullProgressionCard.tsx',
    '../../../components/AidsFold.tsx',
  ],
  { eager: true, query: '?raw', import: 'default' },
);
const source = (suffix: string) => Object.entries(SOURCES).find(([p]) => p.endsWith(suffix))![1];

describe('every Ear Training quiz counts a run', () => {
  for (const file of ['ChordRecognitionQuiz.tsx', 'ChordMotionTab.tsx', 'FullProgressionCard.tsx']) {
    it(`${file} grades with Play as as an aid, and says so under the row`, () => {
      const src = source(file);
      expect(src).toMatch(/isAided\([^)]*\{ playAsIsAid: true \}\)/);
      expect(src).not.toMatch(/isAided\((settings|settingsRef\.current)\)/);
      expect(src).toMatch(/playAsIsAid\s*(\n|\/>|[a-zA-Z])/);
    });
  }

  it('says it in the aids fold, in Silas\'s words', () => {
    expect(source('AidsFold.tsx')).toContain(
      'Tempo and octave are free. Bass only, Up, Down and Up and Down count, with a lower rating.',
    );
  });
});
