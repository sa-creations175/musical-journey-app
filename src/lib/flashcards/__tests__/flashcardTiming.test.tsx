// @vitest-environment jsdom
/**
 * The shell's clock runs with the countdown off.
 *
 * =====================================================================
 * THE SAMPLE, NOT THE FEATURE, IS WHAT THIS PROTECTS.
 *
 * Before this the shell had no clock at all when `timerMode` was
 * 'off'. So a measurement would only have existed for readers who had
 * opted INTO speed pressure — the worst possible sample for deciding
 * where fast ends, because the pressure changes the number being
 * measured. A test that answers a card with the timer running would
 * pass on that broken version, so this one runs with it off.
 * =====================================================================
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import FlashcardSession, { type CardAnsweredArgs } from '../FlashcardSession';
import { elapsedFields } from '../../attemptTiming';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const CARD = {
  id: 'test-1',
  category: 'testing',
  categoryName: 'Testing',
  question: 'the question',
  correctAnswer: 'right',
  decoys: ['wrong-a', 'wrong-b', 'wrong-c'],
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null;
  host = null;
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
 * ASYNC ACT, AND IT IS LOAD-BEARING.
 *
 * `handleAnswer` awaits `onCardAnswered` before it commits the
 * outcome, so the state update lands in a microtask. A synchronous
 * `act(() => button.click())` returns before that microtask runs,
 * which leaves `hasAnswered` false and the "next" button disabled —
 * so a two-card test silently answers the FIRST card twice and every
 * assertion about the second card is really about the first. That is
 * how the first version of the clock test below passed against a
 * mount-scoped clock.
 */
async function clickButton(match: (text: string) => boolean, what: string) {
  const button = [...host!.querySelectorAll('button')]
    .find(b => match(b.textContent ?? ''));
  expect(button, `no button for ${what}`).toBeDefined();
  await act(async () => { button!.click(); });
}

const clickChoice = (label: string) =>
  clickButton(text => text.includes(label), `choice "${label}"`);

describe('with the countdown OFF', () => {
  it('still reports when the card became answerable', async () => {
    const seen: CardAnsweredArgs<typeof CARD>[] = [];
    render(a => { seen.push(a); });
    await clickChoice('right');
    expect(seen).toHaveLength(1);
    expect(seen[0].shownAt).not.toBeNull();
    expect(typeof seen[0].shownAt).toBe('number');
  });

  it('reports no countdown cap, because none was chosen', async () => {
    // The two measurements stay separate: `targetSeconds` is the cap
    // the reader asked for, `shownAt` is what they actually took.
    const seen: CardAnsweredArgs<typeof CARD>[] = [];
    render(a => { seen.push(a); });
    await clickChoice('right');
    expect(Object.hasOwn(seen[0], 'targetSeconds')).toBe(false);
  });

  it('yields a real elapsed measurement through the ceiling helper', async () => {
    const seen: CardAnsweredArgs<typeof CARD>[] = [];
    render(a => { seen.push(a); });
    await clickChoice('wrong-a');
    const fields = elapsedFields(seen[0].shownAt, seen[0].timestamp);
    expect(Object.hasOwn(fields, 'elapsedMs')).toBe(true);
    expect(fields.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('reports timedOut false for a card the reader answered', async () => {
    const seen: CardAnsweredArgs<typeof CARD>[] = [];
    render(a => { seen.push(a); });
    await clickChoice('right');
    expect(seen[0].timedOut).toBe(false);
  });
});

describe('the clock starts at the card, not at the mount', () => {
  it('restarts on the next card rather than measuring the whole session', async () => {
    // A CONTROLLED CLOCK, because the obvious version of this test is
    // useless. Comparing real `Date.now()` readings across two clicks
    // in the same test passes on a mount-only clock too: everything
    // happens inside one millisecond, so "later" and "the same" are
    // indistinguishable. Stepping the clock by a visible amount is
    // what makes a mount-scoped ref fail.
    let now = 1_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const seen: CardAnsweredArgs<typeof CARD>[] = [];
      const second = { ...CARD, id: 'test-2', question: 'the second question' };
      host = document.createElement('div');
      document.body.appendChild(host);
      root = createRoot(host);
      act(() => {
        root!.render(
          <FlashcardSession
            queue={[CARD, second]}
            timerMode="off"
            onExit={() => {}}
            onCardAnswered={a => { seen.push(a); }}
          />,
        );
      });
      const mountedAt = now;

      now += 4_000;            // four seconds reading the first card
      await clickChoice('right');

      now += 30_000;           // half a minute before moving on
      await clickButton(t => /next/i.test(t), 'next');

      now += 2_000;            // two seconds on the second card
      await clickChoice('right');

      expect(seen).toHaveLength(2);
      expect(seen[0].shownAt).toBe(mountedAt);
      // The second card's clock started when IT appeared — not at
      // mount, which is what a session-long clock would report.
      expect(seen[1].shownAt).toBe(mountedAt + 34_000);
      expect(seen[1].shownAt).not.toBe(mountedAt);

      // And the measurement is the time on THAT card, not on the app.
      expect(elapsedFields(seen[0].shownAt, seen[0].timestamp).elapsedMs).toBe(4_000);
      expect(elapsedFields(seen[1].shownAt, seen[1].timestamp).elapsedMs).toBe(2_000);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('a timeout is reported as such', () => {
  it('scores wrong AND says it ran out of time', () => {
    vi.useFakeTimers();
    const seen: CardAnsweredArgs<typeof CARD>[] = [];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <FlashcardSession
          queue={[CARD]}
          timerMode="5"
          onExit={() => {}}
          onCardAnswered={a => { seen.push(a); }}
        />,
      );
    });
    // One second at a time. The countdown re-renders on each tick and
    // schedules the next from that render, so a single 6-second jump
    // fires one timer and stops.
    for (let i = 0; i < 6; i++) {
      act(() => { vi.advanceTimersByTime(1000); });
    }
    vi.useRealTimers();
    expect(seen).toHaveLength(1);
    expect(seen[0].correct).toBe(false);
    expect(seen[0].timedOut).toBe(true);
    expect(seen[0].choice).toBeNull();
    // And the cap it was measured against travels with it.
    expect(seen[0].targetSeconds).toBe(5);
  });
});
