// @vitest-environment jsdom
/**
 * What a diary card offers to press.
 *
 * =====================================================================
 * ONE ▶, WHERE THE ▤ ↑ PAIR WAS. Silas's spec of 12 Sep 2026, §1.
 *
 * The card used to choose how its sound arrived and play it itself.
 * That choice is the player panel's Play as row now, so every card with
 * something to hear has one round Hear it that opens the panel, and a
 * card with nothing to hear has none.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import DiaryEntryCard from '../DiaryEntryCard';
import type { HarmonicDiaryEntry } from '../../../lib/db';
import { cardSound } from '../cardSound';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const ENTRY = {
  id: 'e1',
  skillId: 'chord-recognition:item:maj7',
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

function mount(props: { onHear?: () => void; hearing?: boolean } = {}): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter>
        <DiaryEntryCard entry={ENTRY} onEdit={() => {}} {...props} />
      </MemoryRouter>,
    );
  });
  return host;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('a card with something to hear', () => {
  it('has one round Hear it, and neither ▤ nor ↑', () => {
    let heard = 0;
    const el = mount({ onHear: () => { heard += 1; } });
    const buttons = [...el.querySelectorAll('button[aria-label="Hear it"]')];
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('▶');
    expect(el.querySelector('button[aria-label^="Play"]')).toBeNull();
    act(() => { (buttons[0] as HTMLButtonElement).click(); });
    expect(heard).toBe(1);
  });

  it('marks its ▶ so a tap on it switches the panel rather than closing it', () => {
    const el = mount({ onHear: () => {} });
    expect(el.querySelector('button[aria-label="Hear it"]')!.hasAttribute('data-diary-hear')).toBe(true);
  });

  it('keeps a thin outline in the accent colour while it is the card being heard', () => {
    const on = mount({ onHear: () => {}, hearing: true }).querySelector('article')!;
    expect(on.style.outline).toContain('var(--diary-accent)');
    act(() => root!.unmount());
    host!.remove();
    const off = mount({ onHear: () => {}, hearing: false }).querySelector('article')!;
    expect(off.style.outline).not.toContain('var(--diary-accent)');
  });
});

describe('a card with nothing to hear', () => {
  it('has no ▶ at all', () => {
    const el = mount();
    expect(el.querySelector('button[aria-label="Hear it"]')).toBeNull();
  });

  it('is every card the diary cannot sound: songs, drills, fluency cards', () => {
    // The page puts a ▶ only where `cardSound` answers.
    for (const id of ['repertoire:song:s1', 'harmonic-fluency:card:c1', 'shapes-and-patterns:mental-viz:x']) {
      expect(cardSound(id), id).toBeNull();
    }
    for (const id of [
      'chord-recognition:item:maj9', 'shapes-and-patterns:chord-shape:maj7:F',
      'scales-modes:mode:dorian', 'intervals:asc:m3',
    ]) {
      expect(cardSound(id), id).not.toBeNull();
    }
  });
});
