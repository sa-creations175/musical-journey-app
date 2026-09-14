// @vitest-environment jsdom
/**
 * The play chips on Chord Recognition (Silas, 14 Sep 2026; walked in
 * `play-as-chips-prototype.html`).
 *
 * =====================================================================
 * WHAT IS PINNED, AND WHY IT IS BEHAVIOUR RATHER THAN MARKUP.
 *
 *   · The question has ♪ Together · ♪ Up · ♪ Down · ♪ Up and Down where
 *     Play again was, with the line about the aid under them, and the Aids
 *     drawer has no Play as.
 *   · A tap on a run counts as that aid for the answer's rating, exactly
 *     as the Play as setting did — read off the attempt written.
 *   · Every new card plays Together and the aid does not carry: the next
 *     card, answered with no tap, is rated as a first listen.
 *   · A sus card's reveal has no Compare row (the quiz never asks a sus
 *     chord in inversion) and has ♪ Resolved to major in its play row.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { InstrumentProvider } from '../../../../lib/instrumentContext';
import ChordRecognitionQuiz from '../ChordRecognitionQuiz';
import { CHORD_SEEDS } from '../seed';
import { db, type ChordData } from '../../../../lib/db';
import { heardFeel } from '../../../../lib/earTraining/heardFeel';
import { PLAY_AS_AID_LINE } from '../../../../lib/player/settings';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no Web Audio: every player is a stub, counted.
const played = vi.hoisted(() => ({ blocked: 0, runs: 0 }));
vi.mock('../../../../lib/audio', () => ({
  playChordBlocked: async () => { played.blocked += 1; },
  playSeqChords: async () => { played.runs += 1; return { stop: () => {} }; },
  BROKEN_STEP_BEATS: 0.75,
  CHORD_RING_BEATS: 3,
  chordBlockedAnswerableMs: () => 50,
  chordBrokenAnswerableMs: () => 1_250,
  // THE INSTRUMENT PROVIDER the reveal's player needs reads these.
  setInstrument: () => {},
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const chords: ChordData[] = CHORD_SEEDS.map(seed => ({ ...seed, correct: 0, total: 0 }));

const settle = async (ticks = 12) => {
  for (let i = 0; i < ticks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
};

/** The quiz focused on Sus4 alone: one chord, never asked in inversion. */
async function render(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <InstrumentProvider>
        <MemoryRouter>
          <ChordRecognitionQuiz chords={chords} attempts={[]} initialFocusKeys={['sus4']} />
        </MemoryRouter>
      </InstrumentProvider>,
    );
  });
  await settle();
  return container;
}

const byId = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);

async function click(target: Element | null): Promise<void> {
  if (target === null) throw new Error('nothing to click');
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await settle(4);
}

async function answerSus4(el: HTMLElement): Promise<void> {
  const sus4 = [...el.querySelectorAll('[data-testid="chord-answer"]')]
    .find(b => b.textContent?.trim() === 'Sus4');
  await click(sus4 ?? null);
  await settle();
}

const attempts = () => db.attempts.orderBy('timestamp').toArray();

beforeEach(async () => {
  played.blocked = 0;
  played.runs = 0;
  await db.attempts.clear();
});

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  container = null;
  root = null;
});

describe('the question', () => {
  it('puts the play chips where Play again was, with the line under them', async () => {
    const el = await render();
    await click(byId(el, 'play-chord'));
    expect(byId(el, 'play-again')).toBeNull();
    for (const mode of ['together', 'up', 'down', 'upDown']) {
      expect(byId(el, `question-play-${mode}`), mode).not.toBeNull();
    }
    expect(byId(el, 'question-play-together')?.getAttribute('aria-pressed')).toBe('true');
    expect(byId(el, 'question-play-aid-line')?.textContent).toBe(PLAY_AS_AID_LINE);
  });

  it('has no Play as in the Aids drawer', async () => {
    const el = await render();
    expect(byId(el, 'aids-fold')).not.toBeNull();
    expect(el.querySelector('[data-testid^="aid-play-as"]')).toBeNull();
  });

  it('plays at once in the mode tapped, and lights it', async () => {
    const el = await render();
    await click(byId(el, 'play-chord'));
    const runsBefore = played.runs;
    await click(byId(el, 'question-play-down'));
    expect(played.runs).toBe(runsBefore + 1);
    expect(byId(el, 'question-play-down')?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the rating', () => {
  it('counts a tapped run as the aid for this card\'s answer', async () => {
    const el = await render();
    await click(byId(el, 'play-chord'));
    await click(byId(el, 'question-play-up'));
    await answerSus4(el);
    const [row] = await attempts();
    expect(row.correct).toBe(true);
    expect(row.aided).toBe(true);
    expect(row.feelRating).toBe(heardFeel({ firstRight: true, secondRight: true, replays: 1, aided: true }));
  });

  it('keeps the aid when Together is tapped after the run: the run was heard', async () => {
    const el = await render();
    await click(byId(el, 'play-chord'));
    await click(byId(el, 'question-play-upDown'));
    await click(byId(el, 'question-play-together'));
    await answerSus4(el);
    const [row] = await attempts();
    expect(row.aided).toBe(true);
  });

  it('starts the next card on Together, and does not carry the aid to it', async () => {
    const el = await render();
    await click(byId(el, 'play-chord'));
    await click(byId(el, 'question-play-up'));
    await answerSus4(el);
    await click(byId(el, 'next-card'));
    expect(byId(el, 'question-play-together')?.getAttribute('aria-pressed')).toBe('true');
    expect(byId(el, 'question-play-up')?.getAttribute('aria-pressed')).toBe('false');
    await answerSus4(el);
    const rows = await attempts();
    expect(rows).toHaveLength(2);
    expect(rows[0].aided).toBe(true);
    expect(rows[1].aided).toBeUndefined();
    expect(rows[1].feelRating).toBe(heardFeel({ firstRight: true, secondRight: true, replays: 0, aided: false }));
  });
});

describe('a sus card\'s reveal', () => {
  it('has no Compare row, and plays Resolved to major from the play row', async () => {
    const el = await render();
    await click(byId(el, 'play-chord'));
    await answerSus4(el);
    const player = byId(el, 'shared-player');
    expect(player).not.toBeNull();
    expect(byId(el, 'compare-inversions')).toBeNull();
    expect(byId(el, 'player-hear')).toBeNull();
    const resolved = byId(el, 'play-resolved-major');
    expect(resolved?.textContent).toContain('Resolved to major');
    expect(resolved?.closest('[data-testid="player-play-chips"]')).not.toBeNull();
    const runsBefore = played.runs;
    await click(resolved);
    expect(played.runs).toBe(runsBefore + 1);
    expect(resolved?.getAttribute('aria-pressed')).toBe('true');
  });
});
