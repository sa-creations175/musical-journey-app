// @vitest-environment jsdom
/**
 * The preview shows what the modes DO, by doing it.
 *
 * =====================================================================
 * WHAT THIS PROVES, AND WHAT IT CANNOT.
 *
 * It proves the cells come from the same `renderVisualAid` the session
 * renders with, once per mode, with that mode's id — so a mode cannot
 * be advertised as drawing something the session would not draw. It
 * proves `text` comes out empty and that a card with nothing to draw
 * gets no control at all.
 *
 * It cannot say anything about how the three cells LOOK side by side.
 * jsdom has no layout engine. That needs Silas's eye.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import FlashcardSession from '../FlashcardSession';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const CARD = {
  id: 'card-1',
  category: 'testing',
  categoryName: 'Testing',
  question: 'which one',
  correctAnswer: 'rosewood',
  decoys: ['ranger', 'rondo', 'zither'],
};

const MODES = [
  { id: 'text', label: 'text' },
  { id: 'number-grid', label: 'grid' },
  { id: 'keyboard', label: 'keyboard' },
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
});

/** `draws` decides, per mode, whether this fixture has anything to
 *  render — standing in for a card that carries a visual hint. */
function render(draws: (mode: string) => boolean) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <FlashcardSession
        queue={[CARD]}
        timerMode="off"
        onExit={() => {}}
        onCardAnswered={() => {}}
        visualMode="number-grid"
        visualModes={MODES}
        onVisualModeChange={() => {}}
        renderVisualAid={({ mode }) => (
          draws(mode) ? <span data-testid="aid" data-drawn-mode={mode} /> : null
        )}
      />,
    );
  });
}

const toggle = () =>
  host!.querySelector('[data-testid="visual-mode-preview-toggle"]') as HTMLButtonElement | null;

const open = () => act(() => { toggle()!.click(); });

describe('the preview control', () => {
  it('is absent when no mode would draw anything on this card', () => {
    // Three empty boxes are a worse answer than no button.
    render(() => false);
    expect(toggle()).toBeNull();
  });

  it('is present as soon as one mode draws', () => {
    render(mode => mode === 'keyboard');
    expect(toggle()).not.toBeNull();
    // And nothing is open until it is pressed.
    expect(host!.querySelector('[data-testid="visual-mode-preview"]')).toBeNull();
  });
});

describe('the preview panel', () => {
  it('gives one cell per mode, in the order the toggle offers them', () => {
    render(() => true);
    open();
    const cells = [...host!.querySelectorAll('[data-testid="visual-mode-preview-cell"]')];
    expect(cells.map(c => c.getAttribute('data-mode'))).toEqual(MODES.map(m => m.id));
    // Named by the same labels the toggle uses — not a second copy.
    for (const [i, cell] of cells.entries()) {
      expect(cell.textContent).toContain(MODES[i].label);
    }
  });

  it('renders each cell THROUGH the mode it is showing', () => {
    // The aid is stamped with the mode it was asked for, so a panel
    // that rendered the current mode three times fails here.
    render(() => true);
    open();
    const drawn = [...host!.querySelectorAll('[data-drawn-mode]')]
      .map(el => el.getAttribute('data-drawn-mode'));
    expect(drawn).toContain('number-grid');
    expect(drawn).toContain('keyboard');
  });

  it('leaves the text cell empty, because that is what text draws', () => {
    render(() => true);
    open();
    const textCell = host!.querySelector('[data-mode="text"]')!;
    expect(textCell.querySelector('[data-testid="aid"]')).toBeNull();
    // The other two are not empty, so the emptiness means something.
    expect(host!.querySelector('[data-mode="keyboard"] [data-testid="aid"]'))
      .not.toBeNull();
  });

  it('closes again on a second press', () => {
    render(() => true);
    open();
    expect(host!.querySelector('[data-testid="visual-mode-preview"]')).not.toBeNull();
    open();
    expect(host!.querySelector('[data-testid="visual-mode-preview"]')).toBeNull();
  });
});
