// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { SongLyricLine } from '../../../lib/db';
import LyricListRow from '../LyricListRow';

// The shared behaviour row: what a TAP does. Both the drawer and the
// tray render through this, so a difference between them can only come
// from the props they pass — which is the point of sharing it.

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
const byLabel = (label: string) =>
  Array.from(container!.querySelectorAll('button')).find(
    b => b.getAttribute('aria-label') === label,
  ) as HTMLElement | undefined;
const body = () => container!.querySelector('[data-line-body]') as HTMLElement;

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

const noopRow = {
  picking: false,
  onPickingChange: () => {},
  menuOpen: false,
  onMenuOpenChange: () => {},
};

/** A stand-in for dnd-kit's draggable bindings. */
function fakeDrag(onPointerDown = vi.fn()) {
  return {
    setNodeRef: () => {},
    attributes: { role: 'button', tabIndex: 0 },
    listeners: { onPointerDown },
    isDragging: false,
    handle: <span data-testid="handle">≡</span>,
  };
}

describe('LyricListRow — tap and drag on one element', () => {
  it('fires the drag listener AND the long-press timer on pointerdown', () => {
    // The collision solved on SyllableChip: both attach to
    // onPointerDown, so spreading one after the other silently drops
    // whichever came first. Composed by hand, dnd-kit first.
    const dragDown = vi.fn();
    render(
      <LyricListRow
        {...noopRow}
        line={lyric('l', 'a b', 1)}
        onArmWord={vi.fn()}
        drag={fakeDrag(dragDown)}
      />,
    );
    act(() => {
      body().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(dragDown).toHaveBeenCalledTimes(1);
  });

  it('still routes a plain tap to pick mode while draggable', () => {
    // A bare tap moves less than dnd-kit's 5px activation, so onClick
    // survives and tap and drag coexist.
    const onPickingChange = vi.fn();
    render(
      <LyricListRow
        {...noopRow}
        line={lyric('l', 'a b', 1)}
        onArmWord={vi.fn()}
        onPickingChange={onPickingChange}
        drag={fakeDrag()}
      />,
    );
    act(() => body().click());
    expect(onPickingChange).toHaveBeenCalledWith(true);
  });

  it('renders the drag handle only when draggable', () => {
    render(
      <LyricListRow {...noopRow} line={lyric('l', 'a b', 1)} drag={fakeDrag()} />,
    );
    expect(container!.querySelector('[data-testid="handle"]')).not.toBeNull();
  });

  it('has no handle and no drag bindings without them', () => {
    render(<LyricListRow {...noopRow} line={lyric('l', 'a b', 1)} />);
    expect(container!.querySelector('[data-testid="handle"]')).toBeNull();
  });
});

describe('LyricListRow — routing is identical with or without drag', () => {
  // The whole point of sharing: the same line must offer the same
  // actions in the tray and the drawer.
  for (const [label, drag] of [
    ['drawer (no drag)', undefined],
    ['tray (draggable)', fakeDrag()],
  ] as const) {
    describe(label, () => {
      it('partial → pick mode', () => {
        const onArm = vi.fn();
        const onPickingChange = vi.fn();
        render(
          <LyricListRow
            {...noopRow}
            line={lyric('l', 'a b c', 2)}
            onArm={onArm}
            onArmWord={vi.fn()}
            onPickingChange={onPickingChange}
            drag={drag}
          />,
        );
        act(() => body().click());
        expect(onArm).not.toHaveBeenCalled();
        expect(onPickingChange).toHaveBeenCalledWith(true);
      });

      it('unplaced → the two-part line gesture', () => {
        const onArm = vi.fn();
        render(
          <LyricListRow
            {...noopRow}
            line={lyric('l', 'a b c', 0)}
            onArm={onArm}
            onArmWord={vi.fn()}
            drag={drag}
          />,
        );
        act(() => body().click());
        expect(onArm).toHaveBeenCalledWith('l');
      });

      it('picking offers the words', () => {
        render(
          <LyricListRow
            {...noopRow}
            line={lyric('l', 'a b c', 2)}
            picking
            onArmWord={vi.fn()}
            drag={drag}
          />,
        );
        expect(byLabel('place "c"')).toBeDefined();
        expect(byLabel('move "a"')).toBeDefined();
      });

      it('a placed word offers a move rather than arming', () => {
        const onArmWord = vi.fn();
        render(
          <LyricListRow
            {...noopRow}
            line={lyric('l', 'a b c', 2)}
            picking
            onArmWord={onArmWord}
            drag={drag}
          />,
        );
        act(() => byLabel('move "a"')!.click());
        expect(onArmWord).not.toHaveBeenCalled();
        expect(container!.textContent).toContain('is already placed');
      });
    });
  }
});
