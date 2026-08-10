// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { SongLyricLine } from '../../../lib/db';
import LyricLineRow from '../LyricLineRow';

// jsdom does no layout, so these assert structure, text and handlers —
// what a row IS, not how it looks. Appearance still needs eyes.

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(ui));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const SEC = 'sec-a';

function line(
  id: string,
  words: Array<{ id: string; text: string; placed?: boolean }>,
): SongLyricLine {
  return {
    id,
    kind: 'lyric',
    text: words.map(w => w.text).join(' '),
    syllables: words.map((w, i) => ({
      id: w.id,
      text: w.text,
      ...(w.placed
        ? { anchor: { sectionId: SEC, barIndex: i, beatPos: 0 } }
        : {}),
    })),
  };
}

const header = (id: string, text: string): SongLyricLine => ({
  id,
  kind: 'header',
  text,
});

describe('LyricLineRow — content', () => {
  it('renders every word of the line', () => {
    render(
      <LyricLineRow
        line={line('l1', [
          { id: 'a', text: 'Christ' },
          { id: 'b', text: 'the' },
          { id: 'c', text: 'Lord' },
        ])}
      />,
    );
    expect(container!.textContent).toContain('Christ the Lord');
  });

  it('distinguishes placed from unplaced words', () => {
    render(
      <LyricLineRow
        line={line('l1', [
          { id: 'a', text: 'placed', placed: true },
          { id: 'b', text: 'pending' },
        ])}
      />,
    );
    const spans = Array.from(container!.querySelectorAll('span span'));
    const pending = spans.find(s => s.textContent?.includes('pending'))!;
    const placed = spans.find(s => s.textContent?.includes('placed'))!;
    expect(pending.className).toContain('italic');
    expect(placed.className).toBe('');
  });

  it('shows a WORDS progress badge only while partly placed', () => {
    const partial = line('l1', [
      { id: 'a', text: 'a', placed: true },
      { id: 'b', text: 'b' },
    ]);
    render(<LyricLineRow line={partial} />);
    expect(container!.textContent).toContain('1/2 placed');
  });

  it('shows no badge when nothing or everything is placed', () => {
    render(<LyricLineRow line={line('l1', [{ id: 'a', text: 'a' }])} />);
    expect(container!.textContent).not.toContain('placed');
  });

  it('renders a header row as its plain text', () => {
    render(<LyricLineRow line={header('h', 'Chorus')} />);
    expect(container!.textContent).toContain('Chorus');
  });
});

describe('LyricLineRow — caller-supplied body', () => {
  it('attaches body handlers, so drag and tap can both use it', () => {
    const onClick = vi.fn();
    render(
      <LyricLineRow
        line={line('l1', [{ id: 'a', text: 'x' }])}
        bodyProps={{ onClick }}
      />,
    );
    const body = container!.querySelector('[data-line-body]') as HTMLElement;
    act(() => body.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('never activates a HEADER body — headers are not placeable', () => {
    const onClick = vi.fn();
    render(<LyricLineRow line={header('h', 'Verse 1')} bodyProps={{ onClick }} />);
    const body = container!.querySelector('[data-line-body]') as HTMLElement;
    act(() => body.click());
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a handle only for lyric rows', () => {
    render(
      <LyricLineRow
        line={line('l1', [{ id: 'a', text: 'x' }])}
        handle={<span data-testid="handle">≡</span>}
      />,
    );
    expect(container!.querySelector('[data-testid="handle"]')).not.toBeNull();
  });

  it('omits the handle on a header row', () => {
    render(
      <LyricLineRow
        line={header('h', 'Verse 1')}
        handle={<span data-testid="handle">≡</span>}
      />,
    );
    expect(container!.querySelector('[data-testid="handle"]')).toBeNull();
  });
});

describe('LyricLineRow — actions', () => {
  it('offers un-place only when something is placed', () => {
    const onUnplace = vi.fn();
    render(
      <LyricLineRow
        line={line('l1', [{ id: 'a', text: 'x' }])}
        onUnplace={onUnplace}
      />,
    );
    expect(
      container!.querySelector('[aria-label="un-place all words in this line"]'),
    ).toBeNull();
  });

  it('un-places the whole line when tapped', () => {
    const onUnplace = vi.fn();
    render(
      <LyricLineRow
        line={line('l1', [{ id: 'a', text: 'x', placed: true }])}
        onUnplace={onUnplace}
      />,
    );
    const btn = container!.querySelector(
      '[aria-label="un-place all words in this line"]',
    ) as HTMLElement;
    act(() => btn.click());
    expect(onUnplace).toHaveBeenCalledWith('l1');
  });

  it('deletes when tapped', () => {
    const onDelete = vi.fn();
    render(
      <LyricLineRow
        line={line('l1', [{ id: 'a', text: 'x' }])}
        onDelete={onDelete}
      />,
    );
    const btn = container!.querySelector(
      '[aria-label="delete lyric line"]',
    ) as HTMLElement;
    act(() => btn.click());
    expect(onDelete).toHaveBeenCalledWith('l1');
  });
});

describe('LyricLineRow — dimPlaced', () => {
  // The drawer lists every line so it reads as the whole lyric sheet;
  // the tray filters to unfinished ones. Dimming is what keeps a full
  // list legible without hiding anything.
  const done = line('l1', [{ id: 'a', text: 'x', placed: true }]);

  it('dims a fully placed line when asked', () => {
    render(<LyricLineRow line={done} dimPlaced />);
    const body = container!.querySelector('[data-line-body]') as HTMLElement;
    expect(body.className).toContain('opacity-55');
  });

  it('does not dim by default — the tray never wants it', () => {
    render(<LyricLineRow line={done} />);
    const body = container!.querySelector('[data-line-body]') as HTMLElement;
    expect(body.className).not.toContain('opacity-55');
  });

  it('does not dim a partially placed line', () => {
    render(
      <LyricLineRow
        line={line('l1', [
          { id: 'a', text: 'a', placed: true },
          { id: 'b', text: 'b' },
        ])}
        dimPlaced
      />,
    );
    const body = container!.querySelector('[data-line-body]') as HTMLElement;
    expect(body.className).not.toContain('opacity-55');
  });
});
