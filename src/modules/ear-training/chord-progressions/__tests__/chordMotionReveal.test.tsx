// @vitest-environment jsdom
/**
 * Chord Motion's reveal, read off the rendered card.
 *
 * THROUGH THE SEAM, NOT BESIDE IT. `motionResult` is a pure function and
 * has its own cases below, but the thing that can go wrong is what the
 * card hands it — a piano tap is a pitch class and has to arrive as a
 * degree, and a start that was given has to arrive as right. So the card
 * is rendered, answered, and the line is read off the screen.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { setPref } from '../../../../lib/userPrefs';
import { motionResult } from '../motionResult';

// NOTHING SOUNDS. The card plays on arrival; the test is about what it
// says afterwards.
vi.mock('../../../../lib/builtAnswers/play', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../lib/builtAnswers/play')>()),
  playPanel: vi.fn(async () => ({ stop() {} })),
}));

const { default: ChordMotionTab } = await import('../ChordMotionTab');
const { InstrumentProvider } = await import('../../../../lib/instrumentContext');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
}

/**
 * The card, dealt.
 *
 * ONE MOTION IN FOCUS AND `Math.random` AT ZERO, so the card is 1 → 4 in
 * the key of **C** every time: the pool has one entry and the key is the
 * first of `KEYS`.
 */
async function deal(motion = 'motion:1-4-asc'): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <InstrumentProvider>
        <MemoryRouter>
          <ChordMotionTab attempts={[]} initialFocusKeys={[motion]} />
        </MemoryRouter>
      </InstrumentProvider>,
    );
  });
  await settle();
  await click(container, 'play-motion');
  return container;
}

async function click(el: HTMLElement, testId: string) {
  const b = el.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  if (!b) throw new Error(`no ${testId}`);
  await act(async () => { b.click(); });
  await settle();
}

async function tap(el: HTMLElement, midi: number) {
  // A KEY IS AN SVG RECT, which has no `.click()` of its own.
  const k = el.querySelector(`[data-midi="${midi}"]`);
  if (!k) throw new Error(`no key ${midi}`);
  await act(async () => {
    k.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

function resultOf(el: HTMLElement): { text: string; tone: string } {
  const r = el.querySelector('[data-testid="motion-result"]');
  if (!r) throw new Error('no result line');
  return { text: r.textContent ?? '', tone: r.getAttribute('data-tone') ?? '' };
}

/** The status colour the box is drawn in, by its text class. */
function resultColour(el: HTMLElement): string {
  const cls = el.querySelector('[data-testid="motion-result"]')?.className ?? '';
  return ['developing', 'fluent', 'needswork'].find(c => cls.includes(`text-${c}`)) ?? 'none';
}

beforeEach(async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  await setPref('chordProgressionsMotionAnswerWith', 'degrees');
  await setPref('chordProgressionsMotionStartingNote', 'find');
  await setPref('chordProgressionsMotionNoteContext', 'diatonic');
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

describe('the result line, on its own', () => {
  const base = { start: '1', dest: '4' };

  it('says Right. when both halves are', () => {
    expect(motionResult({ ...base, startOk: true, destOk: true, yourStart: '1', yourDest: '4' }))
      .toEqual({ tone: 'right', text: 'Right.' });
  });

  it('names the start when only the start was right', () => {
    expect(motionResult({ ...base, startOk: true, destOk: false, yourStart: '1', yourDest: '5' }))
      .toEqual({
        tone: 'half',
        text: 'Starting chord right (1). It landed on the 4, not the 5.',
      });
  });

  it('names the landing when only the landing was right', () => {
    expect(motionResult({ ...base, startOk: false, destOk: true, yourStart: '3m', yourDest: '4' }))
      .toEqual({
        tone: 'half',
        text: 'Landing right (4). It started on the 1, not the 3m.',
      });
  });

  it('gives the whole move when neither was', () => {
    expect(motionResult({ ...base, startOk: false, destOk: false, yourStart: '2m', yourDest: '5' }))
      .toEqual({ tone: 'wrong', text: 'Not quite. 1 → 4.' });
  });
});

describe('the result line, on the card', () => {
  it('answered in degrees: start right, landing wrong, rated Working on it', async () => {
    const el = await deal();
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-5');
    await click(el, 'motion-submit');
    expect(resultOf(el)).toEqual({
      tone: 'half',
      text: 'Starting chord right (1). It landed on the 4, not the 5.',
    });
    expect(el.querySelector('[data-testid="motion-feel"]')?.textContent)
      .toBe('Working on it');
    // HALF RIGHT WEARS WORKING ON IT, the colour it rates.
    expect(resultColour(el)).toBe('developing');
  });

  it('answered in degrees: landing right, start wrong, in the chip’s own spelling', async () => {
    const el = await deal();
    await click(el, 'motion-start-3');
    await click(el, 'motion-dest-4');
    await click(el, 'motion-submit');
    // "3m", the chip — not "3", the degree, and not "E", the letter.
    expect(resultOf(el)).toEqual({
      tone: 'half',
      text: 'Landing right (4). It started on the 1, not the 3m.',
    });
  });

  it('answered in degrees: both right is Right.', async () => {
    const el = await deal();
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-4');
    await click(el, 'motion-submit');
    expect(resultOf(el)).toEqual({ tone: 'right', text: 'Right.' });
    expect(resultColour(el)).toBe('fluent');
  });

  it('answered in degrees: neither, rated Struggled', async () => {
    const el = await deal();
    await click(el, 'motion-start-2');
    await click(el, 'motion-dest-5');
    await click(el, 'motion-submit');
    expect(resultOf(el)).toEqual({ tone: 'wrong', text: 'Not quite. 1 → 4.' });
    expect(el.querySelector('[data-testid="motion-feel"]')?.textContent)
      .toBe('Struggled');
    expect(resultColour(el)).toBe('needswork');
  });

  it('answered on the piano: a tapped key is named as a degree, never a letter', async () => {
    const el = await deal();
    await click(el, 'motion-answer-piano');
    // Key of C. Middle C is the 1; the G above it is the 5.
    await tap(el, 60);
    await tap(el, 67);
    const { text, tone } = resultOf(el);
    expect(tone).toBe('half');
    expect(text).toBe('Starting chord right (1). It landed on the 4, not the 5.');
    expect(text).not.toMatch(/\b[A-G]\b/);
  });

  it('answered on the piano: a chromatic tap takes its chromatic chip', async () => {
    const el = await deal();
    await click(el, 'motion-answer-piano');
    // E♭ in the key of C is the ♭3; the F is the 4.
    await tap(el, 63);
    await tap(el, 65);
    expect(resultOf(el).text).toBe('Landing right (4). It started on the 1, not the ♭3.');
  });

  it('a given start is right, so a missed landing is half right', async () => {
    await setPref('chordProgressionsMotionStartingNote', 'given');
    const el = await deal();
    await click(el, 'motion-dest-6');
    await click(el, 'motion-submit');
    expect(resultOf(el)).toEqual({
      tone: 'half',
      text: 'Starting chord right (1). It landed on the 4, not the 6m.',
    });
  });
});
