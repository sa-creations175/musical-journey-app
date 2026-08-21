// @vitest-environment jsdom
/**
 * The seam between the URL and the quiz.
 *
 * `ChordRecognitionQuiz` is tested with the prop handed to it directly,
 * which proves the pool filter and proves nothing about whether
 * anything reads `?focus=`. That gap is exactly what hid the dashboard
 * dead tap: two correct units and nothing asserting the call between
 * them. Deleting the query-string read would leave every other test in
 * this module green.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import ChordRecognition from '../ChordRecognition';
import { CHORD_SEEDS } from '../seed';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderAt(entry: string): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[entry]}>
        <ChordRecognition />
      </MemoryRouter>,
    );
  });
  // The chord list arrives through a seeded Dexie live query.
  for (let i = 0; i < 20; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    if (container.querySelector('[data-testid="chord-answer"]')) break;
  }
  return container;
}

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

describe('?focus= reaches the quiz', () => {
  it('opens on the whole catalog with no param', async () => {
    // Guard the guard: without this, a narrowed pool below could be
    // the module failing to load rather than the param working.
    const el = await renderAt('/ear-training/chord-recognition');
    expect(answerNames(el).length).toBe(CHORD_SEEDS.length);
    expect(el.textContent).not.toContain('focused practice');
  });

  it('opens focused on the chords the dashboard named', async () => {
    const el = await renderAt('/ear-training/chord-recognition?focus=maj7,min7');
    expect(answerNames(el).sort()).toEqual(['Major 7', 'Minor 7']);
    expect(el.textContent).toContain('2 chords selected');
  });

  it('carries focus protection in from the URL', async () => {
    // A one-chord pool is a one-chord pool however it was chosen.
    const el = await renderAt('/ear-training/chord-recognition?focus=maj7');
    expect(protectionNotice(el)).not.toBeNull();
  });

  it('ignores an empty param rather than focusing on nothing', async () => {
    const el = await renderAt('/ear-training/chord-recognition?focus=');
    expect(answerNames(el).length).toBe(CHORD_SEEDS.length);
    expect(el.textContent).not.toContain('focused practice');
  });
});
