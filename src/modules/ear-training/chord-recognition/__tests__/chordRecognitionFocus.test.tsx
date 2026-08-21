// @vitest-environment jsdom
/**
 * Chord recognition opening in focus mode from a dashboard row tap.
 *
 * The mechanism already existed and was wired to a modal; this pins
 * that a caller-supplied pool reaches it, and — the part that matters —
 * that focus protection is not bypassed on the way in.
 *
 * The keys arriving here are BARE CHORD IDS. The catalog is one row per
 * chord × inversion because that is what attempts store, so the
 * dashboard folds a chord row's four refs into the one chord the pool
 * filter matches. The count below is therefore chords, not rows, and
 * that is what the under-4 rule has to be measured against.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import ChordRecognitionQuiz from '../ChordRecognitionQuiz';
import { CHORD_SEEDS } from '../seed';
import type { AttemptRecord, ChordData } from '../../../../lib/db';
import { FLUENCY_POOL_RULE } from '../../../../lib/fluencyPool';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const chords: ChordData[] = CHORD_SEEDS.map(seed => ({
  ...seed, correct: 0, total: 0,
}));

async function render(
  initialFocusKeys?: string[],
  attempts: AttemptRecord[] = [],
): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <ChordRecognitionQuiz
          chords={chords}
          attempts={attempts}
          {...(initialFocusKeys ? { initialFocusKeys } : {})}
        />
      </MemoryRouter>,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container;
}

/** The chord buttons the quiz will accept as answers — the pool made
 *  visible. Asserting on this rather than on the status line is what
 *  makes these tests about the FILTER rather than about the wording. */
function answerNames(el: HTMLElement): string[] {
  return [...el.querySelectorAll('[data-testid="chord-answer"]')]
    .map(b => b.textContent ?? '');
}

/** The notice, by its own testid rather than by its words — the
 *  wording is one shared sentence and belongs to `lib/fluencyPool`,
 *  so matching on a phrase here would fail on a rewrite that changed
 *  nothing about whether the rule fired. */
function protectionNotice(el: HTMLElement): Element | null {
  return el.querySelector('[data-testid="fluency-protection-notice"]');
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('opening in focus mode', () => {
  it('starts unfocused with no keys', async () => {
    const el = await render();
    expect(el.textContent).not.toContain('focused practice');
    // Guard the guard: unfocused really does offer the whole catalog,
    // so a narrowed pool below is a difference rather than the default.
    expect(answerNames(el).length).toBe(CHORD_SEEDS.length);
  });

  it('restricts the pool to exactly the chords it was given', async () => {
    const el = await render(['maj7', 'min7']);
    expect(el.textContent).toContain('focused practice');
    expect(el.textContent).toContain('2 chords selected');
    expect(answerNames(el).sort()).toEqual(['Major 7', 'Minor 7']);
  });

  it('treats an empty list as no focus at all', async () => {
    const el = await render([]);
    expect(el.textContent).not.toContain('focused practice');
    expect(answerNames(el).length).toBe(CHORD_SEEDS.length);
  });

  it('ignores a key no chord answers to rather than serving it', async () => {
    // A stale ref should narrow to what it can match, not invent a
    // chord or silently widen back to everything.
    const el = await render(['maj7', 'not-a-chord']);
    expect(answerNames(el)).toEqual(['Major 7']);
  });
});

describe('focus protection is not bypassed', () => {
  it('warns on a pool the dashboard sent, exactly as on a hand-picked one', async () => {
    // THE RULE THIS PINS: excludeFromFluency is about how few items you
    // were choosing between, not about who chose them. Tapping
    // "Major 7" — a row of FOUR catalog items — and drilling one chord
    // must not move an accuracy number, and the screen has to say so.
    const el = await render(['maj7']);
    expect(el.textContent).toContain('1 chord selected');
    expect(protectionNotice(el)).not.toBeNull();
    // The third surface. The dashboard's legibility panel and the
    // under-4 row prompt state the same rule in the same words; three
    // phrasings of one rule read as three rules.
    expect(protectionNotice(el)!.textContent).toContain(FLUENCY_POOL_RULE);
  });

  it('does not warn once the pool is large enough', async () => {
    const el = await render(['maj7', 'min7', 'dom7', 'dim7']);
    expect(el.textContent).toContain('4 chords selected');
    expect(protectionNotice(el)).toBeNull();
  });

  it('counts chords, not the catalog rows they came from', async () => {
    // The bypass this forbids: `maj7` covers four inversions, so
    // sending its refs unfolded would read as a pool of four and skip
    // the warning while drilling one chord.
    const el = await render(['maj7', 'maj7', 'maj7', 'maj7']);
    expect(protectionNotice(el)).not.toBeNull();
    // And the line above it says one, not four — a status line that
    // disagreed with the protection would be the same lie, quieter.
    expect(el.textContent).toContain('1 chord selected');
    expect(answerNames(el)).toEqual(['Major 7']);
  });
});
