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
  { id: 'h1', kind: 'header', text: 'VERSE 1' } as SongLyricLine,
  {
    id: 'l1',
    kind: 'lyric',
    text: 'O come all ye',
    // Fully placed — the case the old tray buried two levels down.
    syllables: [
      { id: 's1', text: 'O', anchor: { sectionId: 'sec-1', barIndex: 0, beatPos: 0 } },
      { id: 's2', text: 'come', anchor: { sectionId: 'sec-1', barIndex: 0, beatPos: 1 } },
    ],
  } as SongLyricLine,
  { id: 'h2', kind: 'header', text: 'REFRAIN' } as SongLyricLine,
  {
    id: 'l2',
    kind: 'lyric',
    text: 'Christ the Lord',
    syllables: [{ id: 's3', text: 'Christ' }],
  } as SongLyricLine,
];

/** `lyricTrayCollapsed` is a PROP owned by SongDetailView, not local
 *  state, so the list cannot be opened by clicking in isolation — it is
 *  passed in. Collapsed by default, matching the real default. */
function renderSection(playMode: boolean, trayCollapsed = true) {
  return render(
    <LeadSheetSection
      song={song}
      section={section}
      canMoveUp={false}
      canMoveDown={false}
      onChange={vi.fn()}
      songLyricLines={lyricLines}
      cellIndex={new Map()}
      // `songLyricsActive` is Boolean(cellIndex && onSongLyricsChange);
      // without the writer the list is not rendered at all.
      onSongLyricsChange={vi.fn()}
      playMode={playMode}
      lyricTrayCollapsed={trayCollapsed}
      onToggleLyricTray={vi.fn()}
    />,
  );
}

/** The lyric list's collapsed header. Identified by its summary —
 *  "1 of 2 placed" — which is the tray's own text and cannot collide
 *  with the add box's label the way the bare word "lyrics" does. */
const TRAY_SUMMARY = '1 of 2 placed';

function trayToggle(el: HTMLElement): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find(b =>
    (b.textContent ?? '').includes(TRAY_SUMMARY),
  );
}

/** Where a piece of text sits in the section, by document order. */
function positionOf(el: HTMLElement, text: string): number {
  const idx = (el.textContent ?? '').indexOf(text);
  return idx;
}

describe('LeadSheetSection — play mode hides editing chrome', () => {
  it('shows the lyric list while editing', () => {
    expect(trayToggle(renderSection(false))).toBeTruthy();
  });

  it('HIDES the lyric list in play mode', () => {
    // Play mode is for playing. A lyric list is editing chrome, and an
    // empty one is pure noise.
    expect(trayToggle(renderSection(true))).toBeUndefined();
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
    const tray = positionOf(el, TRAY_SUMMARY);
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
    const tray = positionOf(el, TRAY_SUMMARY);
    // `delete bar 1` is an aria-label, not text, so fall back to the
    // rendered chord when it is not in textContent.
    const gridMark = firstBar > -1 ? firstBar : positionOf(el, '1maj');
    expect(gridMark).toBeGreaterThan(-1);
    expect(gridMark).toBeLessThan(tray);
  });
});

describe('LeadSheetSection — the lyric list is the drawer\'s list', () => {
  it('has NO unplaced-lyrics wrapper', () => {
    // The old tray made `unplaced lyrics (0)` the visible wrapper, so a
    // fully placed song showed a zero you had to expand to see
    // anything. It led with the count of the thing you cared least
    // about; the header now leads with what IS placed.
    const el = renderSection(false, false);
    expect(el.textContent).not.toContain('unplaced lyrics');
  });

  it('does NOT nest placed lines behind a second toggle', () => {
    // They were two levels deep behind a "N placed lines" sub-toggle,
    // when they are the ones worth looking at.
    const el = renderSection(false, false);
    expect(el.textContent).not.toContain('placed lines');
  });

  it('shows every line, headers included, in ONE flat list', () => {
    const el = renderSection(false, false);
    expect(el.querySelectorAll('[data-line-body]')).toHaveLength(
      lyricLines.length,
    );
  });

  it('keeps headers INLINE, in song order, not floated to the top', () => {
    // The old tray grouped by placement state, which detached VERSE 1
    // and REFRAIN from the lines they head.
    const el = renderSection(false, false);
    const texts = [...el.querySelectorAll('[data-line-body]')].map(
      b => b.textContent ?? '',
    );
    const order = texts.map(t =>
      t.includes('VERSE 1') ? 'h1'
      : t.includes('O come') ? 'l1'
      : t.includes('REFRAIN') ? 'h2'
      : t.includes('Christ') ? 'l2'
      : '?',
    );
    expect(order).toEqual(['h1', 'l1', 'h2', 'l2']);
  });

  it('makes every row draggable, headers included', () => {
    // Same wiring assertion the drawer uses — the attribute exists only
    // if the drag props were actually spread, unlike a cursor class.
    const el = renderSection(false, false);
    const bodies = el.querySelectorAll('[data-line-body]');
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body.getAttribute('aria-roledescription')).toBe('sortable');
    }
  });
});

describe('LeadSheetSection — where the sequence choices row opens', () => {
  /**
   * The per-section strip had the SAME bug as the Progressions drawer,
   * because both render the same component: one choices row per
   * section, emitted after every phrase, so tapping a break in the
   * first line opened a menu below the last one. Fixing only the
   * drawer would have left the strip broken in a way that reads as the
   * fix not having shipped.
   *
   * Asserted on containment and document order — jsdom has no layout,
   * but order is the mechanism that displaced it.
   */
  const twoChords = {
    ...section,
    chordPlacements: [
      section.chordPlacements![0],
      {
        id: 'p2',
        arrangementId: 'basic',
        barIndex: 1,
        beatPos: 0,
        beats: 4,
        chord: { function: '5', quality: 'maj' },
      },
    ],
    // A stored line break after the first chord — the case that could
    // not be reached at all until the ⏎ control existed.
    sequenceView: {
      breaks: [{ afterPlacementId: 'p1', kind: 'row' as const }],
      hidden: [],
    },
  } as SongSection;

  function openAtTheBreak() {
    const el = render(
      <LeadSheetSection
        song={song}
        section={twoChords}
        canMoveUp={false}
        canMoveDown={false}
        onChange={vi.fn()}
        songLyricLines={lyricLines}
        cellIndex={new Map()}
        onSongLyricsChange={vi.fn()}
        playMode={false}
        lyricTrayCollapsed
        onToggleLyricTray={vi.fn()}
        patternsCollapsed={false}
      />,
    );
    act(() =>
      [...el.querySelectorAll('button')]
        .find(b => b.textContent?.trim() === 'edit')!
        .click(),
    );
    const control = el.querySelector(
      '[aria-label="edit this line break"]',
    ) as HTMLElement;
    const strip = control.closest('.font-mono')!;
    // Captured BEFORE opening: the row adds buttons of its own.
    const laterChord = [...strip.querySelectorAll('button')].pop()!;
    act(() => control.click());
    return { el, control, laterChord, menu: el.querySelector('[data-sequence-choices]')! };
  }

  it('offers a control at a stored line break at all', () => {
    const { control } = openAtTheBreak();
    expect(control).not.toBeNull();
  });

  it('opens inside the anchor of the control that was TAPPED', () => {
    const { control, menu } = openAtTheBreak();
    expect(menu).not.toBeNull();
    expect(control.parentElement!.contains(menu)).toBe(true);
  });

  it('opens BEFORE the chords that follow — not at the foot of the strip', () => {
    const { laterChord, menu } = openAtTheBreak();
    expect(
      menu.compareDocumentPosition(laterChord) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('is taken out of flow, so opening it does not shove the chords', () => {
    expect(openAtTheBreak().menu.className).toContain('absolute');
  });

  it('opens exactly one row for the whole strip', () => {
    const { el } = openAtTheBreak();
    expect(el.querySelectorAll('[data-sequence-choices]')).toHaveLength(1);
  });
});
