// @vitest-environment jsdom
import 'fake-indexeddb/auto';
/**
 * Setting Note & Progression Spelling — the preview, and the word on it.
 *
 * =====================================================================
 * THE PREVIEW IS THE SECTION. "Only on spelled loops" cannot be
 * evaluated from the words, so six real places the spelling lands sit
 * above the controls and change as they are tapped.
 *
 * Every one is built by the app's own formatter, which is what these
 * assertions protect: a preview that re-implemented the rules would be
 * a seventh place they live and the one place a reader checks them.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import SpellingSection from '../SpellingSection';
import { db } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

async function render() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<SpellingSection />); });
  await settle();
}

const byTestId = (id: string) =>
  document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

const click = async (id: string) => {
  await act(async () => {
    byTestId(id)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await settle();
};

/** The "Reads as" column, row by row. */
const preview = (): string[] =>
  [...host!.querySelectorAll('[data-testid="spelling-preview-cell"]')]
    .map(td => td.textContent!.trim());

beforeEach(async () => {
  await db.userPrefs.clear();
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0); return 0;
  };
  window.cancelAnimationFrame = () => {};
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('the preview comes first and shows six places', () => {
  it('names every one of them', async () => {
    await render();
    const wheres = [...host!.querySelectorAll('[data-testid="spelling-preview"] tbody tr')]
      .map(tr => tr.querySelector('td')!.textContent);
    expect(wheres).toEqual([
      'A drill grid row',
      'The Minor 2 5 1 row on the drill grid',
      'The title above the drill player, at Seventh chords thickness',
      'A flashcard question and answer',
      'The rotate button on a flashcard',
      'A key name',
    ]);
  });

  it('reads at the defaults exactly as the app writes them', async () => {
    await render();
    expect(preview()).toEqual([
      '1-5-6m-4',
      'Minor 2°-5-1m',
      'Minor 2ø-5-1m · Seventh chords · Position 2 · the key of B♭ major',
      'The 1-5-6m-4 in the key of F major is F-C-Dm-B♭',
      '↻1-5-6m-4',
      'the key of E♭ major',
    ]);
  });

  it('shows the seventh-chord name at Seventh chords thickness and the triad name above it', async () => {
    // THE ROW LABEL TAKES NO THICKNESS and the drill title does — one
    // degree, two chords under the hand, two true names.
    await render();
    expect(preview()[1]).toContain('2°');
    expect(preview()[2]).toContain('2ø');
  });
});

describe('every control moves the preview', () => {
  it('follows the separator', async () => {
    await render();
    await click('spelling-sep-dot');
    expect(preview()[0]).toBe('1 · 5 · 6m · 4');
    await click('spelling-sep-space');
    expect(preview()[0]).toBe('1 5 6m 4');
  });

  it('follows the qualities, and the named row keeps its word', async () => {
    await render();
    await click('spelling-qual-spelled');
    expect(preview()[0]).toBe('1-5-6m-4');
    expect(preview()[1]).toBe('Minor 2-5-1');
    await click('spelling-qual-off');
    expect(preview()[0]).toBe('1-5-6-4');
  });

  it('follows the two half-diminished names', async () => {
    await render();
    await click('spelling-hd3-dim');
    expect(preview()[1]).toBe('Minor 2dim-5-1m');
    await click('spelling-hd7-m7♭5');
    expect(preview()[2]).toContain('Minor 2m7♭5-5-1m');
  });

  it('follows the note names, in every row that has one', async () => {
    await render();
    await click('spelling-notes-sharp');
    expect(preview()[2]).toContain('the key of A♯ major');
    expect(preview()[3]).toContain('A♯');
    expect(preview()[5]).toBe('the key of D♯ major');
  });
});

describe('the sub-choices belong to the choice above them', () => {
  it('greys out when qualities are off, rather than vanishing', async () => {
    await render();
    expect(byTestId('spelling-qual-sub')!.getAttribute('data-disabled')).toBe('false');
    await click('spelling-qual-off');
    expect(byTestId('spelling-qual-sub')!.getAttribute('data-disabled')).toBe('true');
    expect((byTestId('spelling-hd3-dim') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('a cell that changed flashes', () => {
  it('flashes the row that moved and leaves the rest alone', async () => {
    await render();
    // The half-diminished touches the minor 2 5 1 rows and nothing else.
    await click('spelling-hd3-dim');
    const flashed = [...host!.querySelectorAll('[data-testid="spelling-preview-cell"]')]
      .map(td => td.getAttribute('data-flash'));
    expect(flashed[1]).toBe('true');
    expect(flashed[0]).toBe('false');
    expect(flashed[5]).toBe('false');
  });
});

describe('the word on screen', () => {
  it('is thickness, and never rung', async () => {
    await render();
    const text = host!.textContent!.toLowerCase();
    expect(text).toContain('thickness');
    expect(text).not.toContain('rung');
  });
});
