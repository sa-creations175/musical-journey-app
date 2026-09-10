// @vitest-environment jsdom
/**
 * What a diary card offers to press.
 *
 * =====================================================================
 * TWO BUTTONS, NOT THREE, AND IT IS THE SAME TWO THE QUIZ OFFERS.
 *
 * The card used to draw ascending, blocked and descending, and the two
 * arrows ran a sequencer of the diary's own — a second broken mode,
 * spread across each chord's beat budget rather than rolled at a
 * tempo. Silas's ruling of 10 Sep 2026 leaves the app one broken mode,
 * so the card offers the choice the shared player offers and nothing
 * else.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import DiaryEntryCard from '../DiaryEntryCard';
import type { HarmonicDiaryEntry } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const ENTRY = {
  id: 'e1',
  skillId: 'chord-recognition:quality:maj7',
  userText: 'warm',
  claudeStarterText: '',
  emotion: 'warm',
  emotionalTags: [],
  genreTags: [],
  createdAt: 0,
  updatedAt: 0,
} as unknown as HarmonicDiaryEntry;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(entry: HarmonicDiaryEntry): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter>
        <DiaryEntryCard entry={entry} onEdit={() => {}} onPlay={() => {}} />
      </MemoryRouter>,
    );
  });
  return host;
}

const labels = (el: HTMLElement) =>
  [...el.querySelectorAll('button[aria-label^="Play"]')]
    .map(b => b.getAttribute('aria-label'));

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('a chord entry chooses how the chord arrives', () => {
  it('offers blocked and broken, and neither direction', () => {
    const el = mount(ENTRY);
    expect(labels(el)).toEqual(['Play Blocked', 'Play Broken']);
  });
});

describe('an interval entry keeps its one button', () => {
  it('does not offer the choice, because its direction is the skill', () => {
    // An ascending third and a descending third are two different
    // cards, so "which way" is not a way of listening here.
    const el = mount({ ...ENTRY, skillId: 'intervals:m3:asc' });
    expect(labels(el)).toEqual([]);
    expect(el.querySelector('button[aria-label="hear this element"]'))
      .not.toBeNull();
  });
});
