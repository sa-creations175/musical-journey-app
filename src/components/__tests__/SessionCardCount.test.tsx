// @vitest-environment jsdom
/**
 * "cards this session": what it counts, and that every drill draws the
 * one line rather than its own.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import SessionCardCount from '../SessionCardCount';
import { db, type AttemptRecord } from '../../lib/db';
import { addAttempt } from '../../lib/practiceWrites';
import { defaultDailyGoal } from '../../lib/goalConfig';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(async () => { await db.attempts.clear(); });
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

async function mount(el: React.ReactElement) {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(el));
}

const text = () => container!.querySelector('[data-testid="cards-this-session"]')!.textContent;

async function until(expected: string) {
  for (let i = 0; i < 100 && text() !== expected; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  }
  expect(text()).toBe(expected);
}

const attempt = (moduleId: string, timestamp: number) => addAttempt({
  moduleId, itemId: 'x', correct: true, timestamp,
} as AttemptRecord);

describe('the count', () => {
  it('draws a flashcard session s count and queue as it always did', async () => {
    await mount(<SessionCardCount count={3} total={12} />);
    expect(text()).toBe('cards this session: 3 / 12');
  });

  it('counts only this module s cards answered since the drill started', async () => {
    const before = Date.now() - 60_000;
    await attempt('intervals', before);
    await mount(<SessionCardCount moduleId="intervals" />);
    await until('cards this session: 0');

    await act(async () => {
      await attempt('intervals', Date.now());
      await attempt('intervals', Date.now());
      await attempt('reading', Date.now());
    });
    await until('cards this session: 2');
  });

  it('starts from zero on the next run', async () => {
    await mount(<SessionCardCount moduleId="reading" since={Date.now()} />);
    await act(async () => { await attempt('reading', Date.now()); });
    await until('cards this session: 1');

    await new Promise(r => setTimeout(r, 5));
    await mount(<SessionCardCount moduleId="reading" since={Date.now()} />);
    await until('cards this session: 0');
  });
});

// ---------------------------------------------------------------------

const SOURCES = import.meta.glob(
  ['../../modules/**/*.tsx', '../../lib/**/*.tsx', '!**/__tests__/**'],
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;
const source = (path: string) => {
  const found = SOURCES[`../../${path}`];
  expect(found, path).toBeDefined();
  return found!;
};

describe('one line, on every drill', () => {
  const DRILLS = [
    'lib/flashcards/FlashcardSession.tsx',
    'modules/ear-training/chord-recognition/ChordRecognitionQuiz.tsx',
    'modules/ear-training/intervals/IntervalsQuiz.tsx',
    'modules/ear-training/scales-modes/HearScaleTab.tsx',
    'modules/ear-training/scales-modes/SitInsideTab.tsx',
    'modules/ear-training/chord-progressions/KeyDetectionTab.tsx',
    'modules/ear-training/chord-progressions/ChordMotionTab.tsx',
    'modules/ear-training/chord-progressions/FullProgressionCard.tsx',
    'modules/reading/ReadingDrill.tsx',
  ];

  it('is drawn by each drill', () => {
    for (const path of DRILLS) expect(source(path), path).toContain('<SessionCardCount');
  });

  it('is written nowhere else', () => {
    for (const [path, body] of Object.entries(SOURCES)) {
      expect(body.includes('cards this session:'), path).toBe(false);
    }
  });
});

describe('Reading s Today bar', () => {
  it('is the shared bar, on the drill, with harmonic fluency s default', () => {
    expect(source('modules/reading/ReadingDrill.tsx')).toContain('<DailyGoalBar');
    expect(defaultDailyGoal('reading')).toBe(defaultDailyGoal('harmonic-fluency'));
  });
});
