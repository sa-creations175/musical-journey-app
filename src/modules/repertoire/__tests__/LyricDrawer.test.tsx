// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { SongLyricLine } from '../../../lib/db';
import LyricDrawer from '../LyricDrawer';
import { lineMarkers, lineStatus } from '../lyricSyllables';

// jsdom does no layout, so the DOCKING offset and the half-height
// panel can't be verified here — those need eyes. What is covered is
// what the drawer IS: which lines it lists, what the counts say, that
// tapping a line arms it, and that it declares itself as bottom chrome
// while excluding itself from its own measurement.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

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
    // The anchored prompt owns that job. A second cancel CONTROL at the
    // bottom of the screen is the mistake this session corrected twice.
    //
    // Scoped to interactive elements rather than to all text, because
    // dnd-kit renders hidden screen-reader instructions that mention
    // pressing escape to cancel. Those are an accessibility aid for the
    // reorder drag, not a control the drawer built — narrowing to
    // buttons keeps what this was guarding and stops it tripping over
    // an unrelated string.
    render(<LyricDrawer lines={SONG} open onOpenChange={noop} onArmLine={noop} />);
    const controls = [...container!.querySelectorAll('button')].map(
      b => b.textContent ?? '',
    );
    expect(controls.some(t => t.toLowerCase().includes('cancel'))).toBe(false);
    expect(controls.some(t => t.includes('tap the beat'))).toBe(false);
  });
});

describe('LyricDrawer — chrome', () => {
  // The docking assertions that lived here moved to
  // LeadSheetDrawers.test.tsx when the drawer stopped positioning
  // itself: bottom-chrome declaration, self-exclusion and z-index are
  // now the container's contract, not this component's. What stays
  // here is the marker the dismiss-on-outside handler keys on.
  it('carries its identifying marker, which dismiss-on-outside keeps', () => {
    render(<LyricDrawer lines={SONG} open={false} onOpenChange={noop} onArmLine={noop} />);
    expect(container!.querySelector('[data-lyric-drawer]')).not.toBeNull();
  });

  it('no longer positions itself — the container owns that', () => {
    render(<LyricDrawer lines={SONG} open={false} onOpenChange={noop} onArmLine={noop} />);
    const el = container!.querySelector('[data-lyric-drawer]') as HTMLElement;
    expect(el.className).not.toContain('fixed');
    expect(el.getAttribute('data-app-chrome')).toBeNull();
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

describe('LyricDrawer — pick mode', () => {
  const byLabel = (label: string) =>
    Array.from(container!.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label') === label,
    ) as HTMLElement | undefined;

  const withPick = (onArmWord = vi.fn(), onArmLine = vi.fn()) => {
    render(
      <LyricDrawer
        lines={SONG}
        open
        onOpenChange={noop}
        onArmLine={onArmLine}
        onArmWord={onArmWord}
      />,
    );
    return { onArmWord, onArmLine };
  };

  const bodies = () =>
    Array.from(container!.querySelectorAll('[data-line-body]')) as HTMLElement[];

  // SONG: [header, l1 fully placed, l2 partial, header, l3 unplaced]
  const PARTIAL = 2;
  const PLACED = 1;
  const UNPLACED = 4;

  it('a PARTIAL row enters pick mode instead of arming the line', () => {
    // The gap this closes: un-place one word of a finished line and it
    // exists only in the drawer, where nothing could place it.
    const { onArmLine } = withPick();
    act(() => bodies()[PARTIAL].click());
    expect(onArmLine).not.toHaveBeenCalled();
    expect(byLabel('place "now"')).toBeDefined();
  });

  it('a FULLY PLACED row picks too, every word offering a move', () => {
    const { onArmLine } = withPick();
    act(() => bodies()[PLACED].click());
    expect(onArmLine).not.toHaveBeenCalled();
    expect(byLabel('move "O"')).toBeDefined();
  });

  it('an UNPLACED row still arms the two-part line gesture', () => {
    const { onArmLine, onArmWord } = withPick();
    act(() => bodies()[UNPLACED].click());
    expect(onArmLine).toHaveBeenCalledWith('l3');
    expect(onArmWord).not.toHaveBeenCalled();
  });

  it('a HEADER row does nothing', () => {
    const { onArmLine } = withPick();
    act(() => bodies()[0].click());
    expect(onArmLine).not.toHaveBeenCalled();
  });

  it('shows the picker even when only ONE word is unplaced', () => {
    // No auto-arming the single candidate: behaviour should not change
    // shape depending on state.
    const oneLeft: SongLyricLine[] = [lyric('l', 'a b c', 2)];
    render(
      <LyricDrawer
        lines={oneLeft}
        open
        onOpenChange={noop}
        onArmLine={noop}
        onArmWord={vi.fn()}
      />,
    );
    act(() => bodies()[0].click());
    expect(byLabel('place "c"')).toBeDefined();
  });

  it('arms an unplaced word directly', () => {
    const { onArmWord } = withPick();
    act(() => bodies()[PARTIAL].click());
    act(() => byLabel('place "now"')!.click());
    expect(onArmWord).toHaveBeenCalledWith('l2-2');
  });

  it('a PLACED word offers a move rather than refusing', () => {
    const { onArmWord } = withPick();
    act(() => bodies()[PARTIAL].click());
    act(() => byLabel('move "adore"')!.click());
    expect(onArmWord).not.toHaveBeenCalled();
    expect(container!.textContent).toContain('is already placed');
  });

  it('confirming the move arms it — one gesture, no un-place step', () => {
    const { onArmWord } = withPick();
    act(() => bodies()[PARTIAL].click());
    act(() => byLabel('move "adore"')!.click());
    const go = Array.from(container!.querySelectorAll('button')).find(
      b => b.textContent === 'move it',
    ) as HTMLElement;
    act(() => go.click());
    expect(onArmWord).toHaveBeenCalledWith('l2-0');
  });

  it('cancelling the move arms nothing — no write to undo', () => {
    const { onArmWord } = withPick();
    act(() => bodies()[PARTIAL].click());
    act(() => byLabel('move "adore"')!.click());
    const cancel = Array.from(container!.querySelectorAll('button')).find(
      b => b.textContent === 'cancel',
    ) as HTMLElement;
    act(() => cancel.click());
    expect(onArmWord).not.toHaveBeenCalled();
    expect(container!.textContent).not.toContain('is already placed');
  });

  it('re-tapping the row leaves pick mode', () => {
    withPick();
    act(() => bodies()[PARTIAL].click());
    expect(byLabel('place "now"')).toBeDefined();
    act(() => bodies()[PARTIAL].click());
    expect(byLabel('place "now"')).toBeUndefined();
  });

  it('only one row picks at a time', () => {
    withPick();
    act(() => bodies()[PARTIAL].click());
    act(() => bodies()[PLACED].click());
    expect(byLabel('place "now"')).toBeUndefined();
    expect(byLabel('move "O"')).toBeDefined();
  });

  it('rows stay at rest when no word handler is supplied', () => {
    // Guards the tray, which shares this row and must never pick.
    render(<LyricDrawer lines={SONG} open onOpenChange={noop} onArmLine={noop} />);
    act(() => bodies()[PARTIAL].click());
    expect(container!.querySelectorAll('[data-line-body] button')).toHaveLength(0);
  });
});

describe('routing a partially-placed line — the reported failure', () => {
  const byLabel = (label: string) =>
    Array.from(container!.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label') === label,
    ) as HTMLElement | undefined;

  // "Christ the Lord" at 2/3: the first two words down, the last not.
  // lineMarkers emits BOTH a start and an end marker for this, the end
  // sitting on "the" — the last PLACED word rather than the last word.
  const CHRIST = (): SongLyricLine[] => [lyric('l', 'Christ the Lord', 2)];

  it('lineStatus reports partial, and markers do not enter into it', () => {
    // The hypothesis was that a line carrying both markers reads as
    // complete. lineStatus counts anchors and never looks at markers.
    const line = CHRIST()[0];
    expect(lineStatus(line)).toMatchObject({ status: 'partial', placed: 2, total: 3 });
    expect(lineMarkers([line]).map(m => m.edge).sort()).toEqual(['end', 'start']);
  });

  it('routes to PICK MODE, not the line gesture', () => {
    const onArmLine = vi.fn();
    render(
      <LyricDrawer
        lines={CHRIST()}
        open
        onOpenChange={noop}
        onArmLine={onArmLine}
        onArmWord={vi.fn()}
      />,
    );
    const body = container!.querySelector('[data-line-body]') as HTMLElement;
    act(() => body.click());
    expect(onArmLine).not.toHaveBeenCalled();
    expect(byLabel('place "Lord"')).toBeDefined();
  });

  it('markers are not a variable at all — every partial line has both', () => {
    // The hypothesis needed lines that differ in whether an end marker
    // exists. They do not: lineMarkers emits BOTH edges for any line
    // with at least one placed word and more than one word, so a 1/3
    // line carries the same markers as a 2/3 one.
    for (const placed of [1, 2]) {
      const l = lyric('l', 'Christ the Lord', placed);
      expect(lineMarkers([l]).map(m => m.edge).sort()).toEqual(['end', 'start']);
      expect(lineStatus(l).status).toBe('partial');
    }
  });

  it('routes to pick mode at any partial count', () => {
    const oneDown: SongLyricLine[] = [lyric('l', 'Christ the Lord', 1)];
    const onArmLine = vi.fn();
    render(
      <LyricDrawer
        lines={oneDown}
        open
        onOpenChange={noop}
        onArmLine={onArmLine}
        onArmWord={vi.fn()}
      />,
    );
    act(() => (container!.querySelector('[data-line-body]') as HTMLElement).click());
    expect(onArmLine).not.toHaveBeenCalled();
    expect(byLabel('place "the"')).toBeDefined();
  });

  it('the BADGE and the ROUTING read the same call, so they cannot disagree', () => {
    // The reported clue was a correct "2/3 placed" badge beside wrong
    // routing. Both derive from lineStatus, and the badge only renders
    // for 'partial' — which is exactly the status that picks. If the
    // badge shows, pick mode is reachable.
    render(
      <LyricDrawer
        lines={CHRIST()}
        open
        onOpenChange={noop}
        onArmLine={vi.fn()}
        onArmWord={vi.fn()}
      />,
    );
    expect(container!.textContent).toContain('2/3 placed');
    const body = container!.querySelector('[data-line-body]') as HTMLElement;
    expect(body.getAttribute('aria-label')).toBe('choose a word from "Christ the Lord"');
  });

  it('falls back to the line gesture only when no word handler exists', () => {
    // The one code path that produces the reported symptom.
    const onArmLine = vi.fn();
    render(
      <LyricDrawer lines={CHRIST()} open onOpenChange={noop} onArmLine={onArmLine} />,
    );
    act(() => (container!.querySelector('[data-line-body]') as HTMLElement).click());
    expect(onArmLine).toHaveBeenCalledWith('l');
  });
});

// ---------------------------------------------------------------------
// Drag to reorder (13.13)
// ---------------------------------------------------------------------

describe('LyricDrawer — reordering', () => {
  const header = (id: string, text: string): SongLyricLine =>
    ({ id, kind: 'header', text }) as SongLyricLine;

  it('makes EVERY row draggable, headers included', () => {
    // The per-section tray withholds the handle from headers. Here a
    // header must move: created by the paste box, it lands at the
    // bottom, and without this there is no way to get it to the
    // section it names.
    //
    // Counted rather than "at least one", because lyric rows are
    // draggable either way — a version that excluded only headers
    // passed a >0 check.
    const lines = [header('h', 'VERSE 1'), ...SONG];
    render(
      <LyricDrawer
        lines={lines}
        open
        onOpenChange={noop}
        onArmLine={noop}
        onReorder={noop}
      />,
    );
    expect(container!.querySelectorAll('.cursor-grab')).toHaveLength(
      lines.length,
    );
  });

  it('offers no drag affordance when the caller cannot reorder', () => {
    render(
      <LyricDrawer
        lines={[header('h', 'VERSE 1'), ...SONG]}
        open
        onOpenChange={noop}
        onArmLine={noop}
      />,
    );
    expect(container!.querySelectorAll('.cursor-grab')).toHaveLength(0);
  });
});
