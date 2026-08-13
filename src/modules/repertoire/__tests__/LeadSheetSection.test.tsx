// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { Song, SongLyricLine, SongSection } from '../../../lib/db';
import LeadSheetSection from '../LeadSheetSection';

/**
 * Section LAYOUT and play-mode gating.
 *
 * Asserted on document ORDER and on presence in the DOM — the
 * mechanism — rather than on any class, because a class can be applied
 * to a block that is not there and to one that is.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

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

const song = {
  id: 'song-1',
  title: 'Test',
  key: 'C',
  timeSignature: '4/4',
} as Song;

const section = {
  id: 'sec-1',
  songId: 'song-1',
  name: 'Verse',
  order: 0,
  lyrics: '',
  chordPlacements: [
    {
      id: 'p1',
      arrangementId: 'basic',
      barIndex: 0,
      beatPos: 0,
      beats: 4,
      chord: { function: '1', quality: 'maj' },
    },
  ],
} as SongSection;

const lyricLines: SongLyricLine[] = [
  {
    id: 'l1',
    kind: 'lyric',
    text: 'O come all ye',
    syllables: [
      { id: 's1', text: 'O' },
      { id: 's2', text: 'come' },
    ],
  } as SongLyricLine,
];

function renderSection(playMode: boolean) {
  return render(
    <LeadSheetSection
      song={song}
      section={section}
      canMoveUp={false}
      canMoveDown={false}
      onChange={vi.fn()}
      songLyricLines={lyricLines}
      cellIndex={new Map()}
      playMode={playMode}
    />,
  );
}

/** Where a piece of text sits in the section, by document order. */
function positionOf(el: HTMLElement, text: string): number {
  const idx = (el.textContent ?? '').indexOf(text);
  return idx;
}

describe('LeadSheetSection — play mode hides editing chrome', () => {
  it('shows the unplaced-lyrics tray while editing', () => {
    const el = renderSection(false);
    expect(el.textContent).toContain('unplaced lyrics');
  });

  it('HIDES the unplaced-lyrics tray in play mode', () => {
    // Play mode is for playing. An unplaced-lyrics tray is editing
    // chrome, and an empty one is pure noise.
    const el = renderSection(true);
    expect(el.textContent).not.toContain('unplaced lyrics');
  });

  it('hides the add box in play mode too', () => {
    expect(renderSection(false).textContent).toContain('add lyrics or section header');
    expect(renderSection(true).textContent).not.toContain(
      'add lyrics or section header',
    );
  });
});

describe('LeadSheetSection — the lyric controls sit below the grid, together', () => {
  it('orders add box, then tray, then progression patterns', () => {
    // They do the same job and used to be split either side of the
    // grid. Add box then list also matches the lyrics drawer, so the
    // two surfaces read the same way.
    const el = renderSection(false);
    const addBox = positionOf(el, 'add lyrics or section header');
    const tray = positionOf(el, 'unplaced lyrics');
    const patterns = positionOf(el, 'progression patterns');

    expect(addBox).toBeGreaterThan(-1);
    expect(tray).toBeGreaterThan(-1);
    expect(patterns).toBeGreaterThan(-1);
    expect(addBox).toBeLessThan(tray);
    expect(tray).toBeLessThan(patterns);
  });

  it('puts nothing above the bar grid', () => {
    // The grid is the body of the section. The tray used to render
    // above it, which is what split the lyric controls in two.
    const el = renderSection(false);
    const firstBar = positionOf(el, 'delete bar 1');
    const tray = positionOf(el, 'unplaced lyrics');
    // `delete bar 1` is an aria-label, not text, so fall back to the
    // rendered chord when it is not in textContent.
    const gridMark = firstBar > -1 ? firstBar : positionOf(el, '1maj');
    expect(gridMark).toBeGreaterThan(-1);
    expect(gridMark).toBeLessThan(tray);
  });
});
