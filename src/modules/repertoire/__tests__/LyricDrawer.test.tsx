// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { SongLyricLine } from '../../../lib/db';
import LyricDrawer from '../LyricDrawer';

// jsdom does no layout, so the DOCKING offset and the half-height
// panel can't be verified here — those need eyes. What is covered is
// what the drawer IS: which lines it lists, what the counts say, that
// tapping a line arms it, and that it declares itself as bottom chrome
// while excluding itself from its own measurement.

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

function lyric(id: string, text: string, placedWords = 0): SongLyricLine {
  const words = text.split(' ');
  return {
    id,
    kind: 'lyric',
    text,
    syllables: words.map((w, i) => ({
      id: `${id}-${i}`,
      text: w,
      ...(i < placedWords
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

const SONG: SongLyricLine[] = [
  header('h1', 'Verse 1'),
  lyric('l1', 'O come let us', 4), // fully placed
  lyric('l2', 'adore him now', 2), // partial
  header('h2', 'Chorus'),
  lyric('l3', 'Christ the Lord', 0), // unplaced
];

const noop = () => {};

describe('LyricDrawer — collapsed strip', () => {
  it('reports ONE overall line count, not a word count', () => {
    render(
      <LyricDrawer lines={SONG} open={false} onOpenChange={noop} onArmLine={noop} />,
    );
    // 1 of 3 lyric lines fully placed; headers are not lines to place.
    expect(container!.textContent).toContain('1 of 3 lines placed');
  });

  it('says so when there are no lyrics at all', () => {
    render(
      <LyricDrawer lines={[]} open={false} onOpenChange={noop} onArmLine={noop} />,
    );
    expect(container!.textContent).toContain('none yet');
  });

  it('lists nothing while collapsed', () => {
    render(
      <LyricDrawer lines={SONG} open={false} onOpenChange={noop} onArmLine={noop} />,
    );
    expect(container!.querySelectorAll('[data-line-body]')).toHaveLength(0);
  });

  it('opens when the strip is tapped', () => {
    const onOpenChange = vi.fn();
    render(
      <LyricDrawer
        lines={SONG}
        open={false}
        onOpenChange={onOpenChange}
        onArmLine={noop}
      />,
    );
    const strip = container!.querySelector('button') as HTMLElement;
    act(() => strip.click());
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});

describe('LyricDrawer — open list', () => {
  it('lists EVERY line including headers and fully placed ones', () => {
    // It doubles as the readable lyric sheet, so hiding finished lines
    // would break the read. The per-section tray filters instead.
    render(
      <LyricDrawer lines={SONG} open onOpenChange={noop} onArmLine={noop} />,
    );
    expect(container!.querySelectorAll('[data-line-body]')).toHaveLength(
      SONG.length,
    );
    expect(container!.textContent).toContain('Verse 1');
    expect(container!.textContent).toContain('Chorus');
    expect(container!.textContent).toContain('O come let us');
  });

  it('keeps song order', () => {
    render(
      <LyricDrawer lines={SONG} open onOpenChange={noop} onArmLine={noop} />,
    );
    const texts = Array.from(container!.querySelectorAll('[data-line-body]')).map(
      el => el.textContent ?? '',
    );
    expect(texts[0]).toContain('Verse 1');
    expect(texts[1]).toContain('O come let us');
    expect(texts[3]).toContain('Chorus');
  });

  it('dims fully placed lines but still shows them', () => {
    render(
      <LyricDrawer lines={SONG} open onOpenChange={noop} onArmLine={noop} />,
    );
    const bodies = Array.from(container!.querySelectorAll('[data-line-body]'));
    expect(bodies[1].className).toContain('opacity-55');
    expect(bodies[2].className).not.toContain('opacity-55');
  });

  it('shows each row its OWN word count — the second number', () => {
    render(
      <LyricDrawer lines={SONG} open onOpenChange={noop} onArmLine={noop} />,
    );
    expect(container!.textContent).toContain('2/3 placed');
  });
});

describe('LyricDrawer — arming', () => {
  it('arms the line when its row is tapped', () => {
    const onArmLine = vi.fn();
    render(<LyricDrawer lines={SONG} open onOpenChange={noop} onArmLine={onArmLine} />);
    const bodies = Array.from(container!.querySelectorAll('[data-line-body]'));
    act(() => (bodies[4] as HTMLElement).click());
    expect(onArmLine).toHaveBeenCalledWith('l3');
  });

  it('does NOT arm from a header row — headers are not placeable', () => {
    const onArmLine = vi.fn();
    render(<LyricDrawer lines={SONG} open onOpenChange={noop} onArmLine={onArmLine} />);
    const bodies = Array.from(container!.querySelectorAll('[data-line-body]'));
    act(() => (bodies[0] as HTMLElement).click());
    expect(onArmLine).not.toHaveBeenCalled();
  });

  it('builds no arming UI of its own', () => {
    // The anchored prompt owns that job. A second cancel control at the
    // bottom of the screen is the mistake this session corrected twice.
    render(<LyricDrawer lines={SONG} open onOpenChange={noop} onArmLine={noop} />);
    expect(container!.textContent).not.toContain('cancel');
    expect(container!.textContent).not.toContain('tap the beat');
  });
});

describe('LyricDrawer — chrome', () => {
  it('declares itself bottom chrome so overlays clear it', () => {
    render(<LyricDrawer lines={SONG} open={false} onOpenChange={noop} onArmLine={noop} />);
    const el = container!.querySelector('[data-lyric-drawer]') as HTMLElement;
    expect(el.getAttribute('data-app-chrome')).toBe('bottom');
  });

  it('carries a self-exclusion marker so it cannot measure itself', () => {
    // Without this the drawer measures its own height as bottom chrome
    // and pushes itself up by it, every frame.
    render(<LyricDrawer lines={SONG} open={false} onOpenChange={noop} onArmLine={noop} />);
    expect(container!.querySelector('[data-lyric-drawer]')).not.toBeNull();
  });

  it('sits below the cell-anchored overlays', () => {
    // Overlays are z-180/190; the drawer must never cover the prompt.
    render(<LyricDrawer lines={SONG} open={false} onOpenChange={noop} onArmLine={noop} />);
    const el = container!.querySelector('[data-lyric-drawer]') as HTMLElement;
    expect(el.className).toContain('z-40');
  });
});

describe('LyricDrawer — header correction', () => {
  const withMenu = (onSetLineKind = vi.fn()) => {
    render(
      <LyricDrawer
        lines={SONG}
        open
        onOpenChange={noop}
        onArmLine={noop}
        onSetLineKind={onSetLineKind}
      />,
    );
    return onSetLineKind;
  };

  it('shows a VISIBLE "…" control on every row', () => {
    // Long-press alone was rejected for the syllable popover for the
    // same reason: an invisible affordance is not an affordance.
    withMenu();
    const dots = container!.querySelectorAll('[aria-label^="row options"]');
    expect(dots).toHaveLength(SONG.length);
  });

  it('offers "make lyric line" on a header row', () => {
    withMenu();
    const dots = container!.querySelectorAll('[aria-label^="row options"]');
    act(() => (dots[0] as HTMLElement).click());
    expect(container!.textContent).toContain('make lyric line');
  });

  it('offers "make header" on an unplaced lyric row', () => {
    withMenu();
    const dots = container!.querySelectorAll('[aria-label^="row options"]');
    act(() => (dots[4] as HTMLElement).click()); // l3, nothing placed
    expect(container!.textContent).toContain('make header');
  });

  it('EXPLAINS instead of offering when words are placed', () => {
    // Offer-then-refuse would be a dead action; the menu says why.
    withMenu();
    const dots = container!.querySelectorAll('[aria-label^="row options"]');
    act(() => (dots[1] as HTMLElement).click()); // l1, fully placed
    expect(container!.textContent).toContain('un-place its words first');
    expect(container!.textContent).not.toContain('make header');
  });

  it('applies the correction', () => {
    const onSetLineKind = withMenu();
    const dots = container!.querySelectorAll('[aria-label^="row options"]');
    act(() => (dots[4] as HTMLElement).click());
    const btn = Array.from(container!.querySelectorAll('button')).find(b =>
      b.textContent === 'make header',
    ) as HTMLElement;
    act(() => btn.click());
    expect(onSetLineKind).toHaveBeenCalledWith('l3', 'header');
  });

  it('opens one menu at a time', () => {
    withMenu();
    const dots = container!.querySelectorAll('[aria-label^="row options"]');
    act(() => (dots[0] as HTMLElement).click());
    act(() => (dots[4] as HTMLElement).click());
    expect(container!.textContent).not.toContain('make lyric line');
    expect(container!.textContent).toContain('make header');
  });

  it('does not arm the line while its menu is open', () => {
    // The tap that dismisses a menu should not also start a placement.
    const onArmLine = vi.fn();
    render(
      <LyricDrawer
        lines={SONG}
        open
        onOpenChange={noop}
        onArmLine={onArmLine}
        onSetLineKind={vi.fn()}
      />,
    );
    const dots = container!.querySelectorAll('[aria-label^="row options"]');
    act(() => (dots[4] as HTMLElement).click());
    const bodies = Array.from(container!.querySelectorAll('[data-line-body]'));
    act(() => (bodies[4] as HTMLElement).click());
    expect(onArmLine).not.toHaveBeenCalled();
  });

  it('renders no "…" when correction is unavailable', () => {
    render(<LyricDrawer lines={SONG} open onOpenChange={noop} onArmLine={noop} />);
    expect(container!.querySelectorAll('[aria-label^="row options"]')).toHaveLength(0);
  });
});

describe('LyricDrawer — un-place', () => {
  it('gives every placed row a fast ⤺ arrow', () => {
    // The per-section tray had one and it was used constantly; the
    // drawer rows were missing it.
    const onLineUnplace = vi.fn();
    render(
      <LyricDrawer
        lines={SONG}
        open
        onOpenChange={noop}
        onArmLine={noop}
        onLineUnplace={onLineUnplace}
      />,
    );
    const arrows = container!.querySelectorAll(
      '[aria-label="un-place all words in this line"]',
    );
    // l1 (fully placed) and l2 (partial); not the unplaced line or headers.
    expect(arrows).toHaveLength(2);
  });

  it('un-places the line from the arrow', () => {
    const onLineUnplace = vi.fn();
    render(
      <LyricDrawer
        lines={SONG}
        open
        onOpenChange={noop}
        onArmLine={noop}
        onLineUnplace={onLineUnplace}
      />,
    );
    const arrow = container!.querySelector(
      '[aria-label="un-place all words in this line"]',
    ) as HTMLElement;
    act(() => arrow.click());
    expect(onLineUnplace).toHaveBeenCalledWith('l1');
  });

  it('ALSO offers it in the menu — discoverable path and fast path', () => {
    const onLineUnplace = vi.fn();
    render(
      <LyricDrawer
        lines={SONG}
        open
        onOpenChange={noop}
        onArmLine={noop}
        onSetLineKind={vi.fn()}
        onLineUnplace={onLineUnplace}
      />,
    );
    const dots = container!.querySelectorAll('[aria-label^="row options"]');
    act(() => (dots[1] as HTMLElement).click()); // l1, fully placed
    const btn = Array.from(container!.querySelectorAll('button')).find(
      b => b.textContent === 'un-place full line',
    ) as HTMLElement;
    act(() => btn.click());
    expect(onLineUnplace).toHaveBeenCalledWith('l1');
  });

  it('offers neither path on a line with nothing placed', () => {
    render(
      <LyricDrawer
        lines={[SONG[4]]}
        open
        onOpenChange={noop}
        onArmLine={noop}
        onSetLineKind={vi.fn()}
        onLineUnplace={vi.fn()}
      />,
    );
    expect(
      container!.querySelector('[aria-label="un-place all words in this line"]'),
    ).toBeNull();
    const dots = container!.querySelector('[aria-label^="row options"]') as HTMLElement;
    act(() => dots.click());
    expect(container!.textContent).not.toContain('un-place full line');
  });
});

describe('LyricDrawer — duplicate', () => {
  const withDup = (onDuplicateLine = vi.fn()) => {
    render(
      <LyricDrawer
        lines={SONG}
        open
        onOpenChange={noop}
        onArmLine={noop}
        onSetLineKind={vi.fn()}
        onDuplicateLine={onDuplicateLine}
      />,
    );
    return onDuplicateLine;
  };

  const openMenu = (i: number) => {
    const dots = container!.querySelectorAll('[aria-label^="row options"]');
    act(() => (dots[i] as HTMLElement).click());
  };

  it('offers duplicate on every row', () => {
    withDup();
    openMenu(4);
    expect(container!.textContent).toContain('duplicate');
  });

  it('duplicates the line', () => {
    const onDuplicateLine = withDup();
    openMenu(4);
    const btn = Array.from(container!.querySelectorAll('button')).find(
      b => b.textContent === 'duplicate',
    ) as HTMLElement;
    act(() => btn.click());
    expect(onDuplicateLine).toHaveBeenCalledWith('l3');
  });

  it('offers duplicate even on a fully placed line', () => {
    // The copy arrives unplaced regardless, so there is nothing to
    // refuse — a placed refrain is exactly what gets duplicated.
    withDup();
    openMenu(1);
    expect(container!.textContent).toContain('duplicate');
  });

  it('opens a menu for duplicate alone, without the kind toggle', () => {
    render(
      <LyricDrawer
        lines={SONG}
        open
        onOpenChange={noop}
        onArmLine={noop}
        onDuplicateLine={vi.fn()}
      />,
    );
    openMenu(4);
    expect(container!.textContent).toContain('duplicate');
    expect(container!.textContent).not.toContain('make header');
  });
});
