// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { DndContext } from '@dnd-kit/core';
import type { SongLyricLine } from '../../../lib/db';
import { SongPendingTray } from '../BarGridView';

// The tray must offer everything the drawer does, plus drag. These
// cover the parity and the grouped reveal; a DndContext wrapper is
// needed because tray rows are draggable.

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<DndContext>{ui}</DndContext>));
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
const bodies = () =>
  Array.from(container!.querySelectorAll('[data-line-body]')) as HTMLElement[];
const byText = (text: string) =>
  Array.from(container!.querySelectorAll('button')).find(b =>
    b.textContent?.includes(text),
  ) as HTMLElement | undefined;

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

const LINES: SongLyricLine[] = [
  lyric('done1', 'all of it', 3),
  lyric('part', 'Christ the Lord', 2),
  lyric('none', 'not yet', 0),
  lyric('done2', 'also done', 2),
];

const open = (props: Record<string, unknown> = {}) =>
  render(
    <SongPendingTray
      lines={LINES}
      collapsed={false}
      onToggle={() => {}}
      onArmLine={vi.fn()}
      onArmWord={vi.fn()}
      {...props}
    />,
  );

describe('tray — grouped reveal of placed lines', () => {
  it('lists only unfinished lines by default', () => {
    open();
    expect(bodies()).toHaveLength(2);
    expect(container!.textContent).toContain('Christ the Lord');
    expect(container!.textContent).not.toContain('all of it');
  });

  it('offers ONE control for all the finished ones', () => {
    open();
    expect(byText('2 placed lines')).toBeDefined();
  });

  it('reveals them all at once, dimmed', () => {
    open();
    act(() => byText('2 placed lines')!.click());
    expect(bodies()).toHaveLength(4);
    const revealed = bodies().find(b => b.textContent?.includes('all of it'))!;
    expect(revealed.className).toContain('opacity-55');
  });

  it('starts collapsed — the compactness that justified hiding them', () => {
    open();
    expect(container!.textContent).not.toContain('also done');
  });

  it('offers no group control when nothing is finished', () => {
    render(
      <SongPendingTray
        lines={[lyric('a', 'x y', 0)]}
        collapsed={false}
        onToggle={() => {}}
      />,
    );
    expect(byText('placed line')).toBeUndefined();
  });

  it('counts only unfinished lines in the header badge', () => {
    open();
    expect(container!.textContent).toContain('(2)');
  });
});

describe('tray — parity with the drawer', () => {
  it('a PARTIAL row picks words rather than arming the line', () => {
    const onArmLine = vi.fn();
    open({ onArmLine });
    const row = bodies().find(b => b.textContent?.includes('Christ'))!;
    act(() => row.click());
    expect(onArmLine).not.toHaveBeenCalled();
    expect(byLabel('place "Lord"')).toBeDefined();
  });

  it('an UNPLACED row still arms the two-part gesture', () => {
    const onArmLine = vi.fn();
    open({ onArmLine });
    const row = bodies().find(b => b.textContent?.includes('not yet'))!;
    act(() => row.click());
    expect(onArmLine).toHaveBeenCalledWith('none');
  });

  it('a revealed FINISHED row picks too, offering moves', () => {
    open();
    act(() => byText('2 placed lines')!.click());
    const row = bodies().find(b => b.textContent?.includes('all of it'))!;
    act(() => row.click());
    expect(byLabel('move "all"')).toBeDefined();
  });

  it('arms a word from the tray', () => {
    const onArmWord = vi.fn();
    open({ onArmWord });
    act(() => bodies().find(b => b.textContent?.includes('Christ'))!.click());
    act(() => byLabel('place "Lord"')!.click());
    expect(onArmWord).toHaveBeenCalledWith('part-2');
  });

  it('keeps its drag handles', () => {
    open();
    expect(container!.textContent).toContain('≡');
  });
});
