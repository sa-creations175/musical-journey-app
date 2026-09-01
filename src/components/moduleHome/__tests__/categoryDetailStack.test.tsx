// @vitest-environment jsdom
/**
 * The detail block mirrors the chip row.
 *
 * =====================================================================
 * WHAT THIS PROVES: which categories have a block, which of them are
 * expanded, that expanding is per category and unbounded, and that a
 * category with no coordinates renders its flat list rather than an
 * invented grid.
 *
 * WHAT IT CANNOT: how a twenty-four-column table reads on a phone, or
 * whether a scroll lands somewhere useful. jsdom has no layout engine
 * and nothing here moves — that needs Silas's eye. What is asserted
 * here is WHICH block was asked for and WHAT WAS SUBTRACTED to get
 * there, which are the two parts that can be wrong.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import CategoryDetailStack, {
  detailAnchorId, type DetailEntry,
} from '../CategoryDetailStack';
import type { SkillRecord } from '../../../modules/skills/registry';
import type { GridSpec } from '../axis';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const record = (itemId: string, axis?: Record<string, string | number>): SkillRecord => ({
  skillId: `s:${itemId}`,
  moduleId: 'harmonic-fluency',
  moduleLabel: 'Harmonic Fluency',
  moduleRoute: '/harmonic-fluency',
  itemId,
  name: itemId,
  category: 'Alpha',
  skillType: 'flashcard',
  currentTier: null,
  freshness: 'fresh',
  daysSince: 0,
  lastPracticed: null,
  totalTime: 0,
  tags: [],
  window: [],
  ...(axis ? { axis } : {}),
} as unknown as SkillRecord);

const GRID: GridSpec = {
  columns: { field: 'col', label: 'col', views: [{ id: 'd', label: 'col', values: ['x', 'y'] }] },
};

const ENTRIES: DetailEntry[] = [
  { key: 'a', label: 'Alpha', grid: GRID, items: [record('a1', { col: 'x' })] },
  { key: 'b', label: 'Beta', grid: null, items: [record('b1'), record('b2')] },
  { key: 'c', label: 'Gamma', grid: GRID, items: [] },
];

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
});

function render(expanded: Set<string>, scrollTo: string | null = null) {
  const toggled: string[] = [];
  const scrolled: string[] = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const draw = (open: Set<string>) => {
    act(() => {
      root!.render(
        <CategoryDetailStack
          entries={ENTRIES}
          expanded={open}
          onToggle={k => { toggled.push(k); }}
          accentHex="#7a5aa8"
          now={Date.now()}
          viewFor={() => null}
          onViewChange={() => {}}
          scrollTo={scrollTo}
          onScrolled={() => { scrolled.push(scrollTo!); }}
        />,
      );
    });
  };
  draw(expanded);
  return { toggled, scrolled, draw };
}

const blocks = () =>
  [...host!.querySelectorAll('[data-testid="category-detail"]')];
const openKeys = () =>
  blocks().filter(b => b.getAttribute('data-expanded') === 'true')
    .map(b => b.getAttribute('data-detail-key'));

describe('the stack', () => {
  it('gives one block per lit category, in the order passed', () => {
    render(new Set(['a']));
    expect(blocks().map(b => b.getAttribute('data-detail-key')))
      .toEqual(['a', 'b', 'c']);
  });

  it('expands only what it is told to, and collapses the rest', () => {
    // The page's own category is expanded; everything else lit is a
    // collapsed header. Nothing renders fifteen grids uninvited.
    render(new Set(['a']));
    expect(openKeys()).toEqual(['a']);
    expect(host!.querySelectorAll('[data-testid="progress-grid"]')).toHaveLength(1);
    expect(host!.querySelectorAll('[data-testid="category-detail-toggle"]'))
      .toHaveLength(2);
  });

  it('holds any number open at once', () => {
    // Comparing two categories is what lighting a second chip is FOR;
    // an accordion that closed the last one would make it impossible.
    const { draw } = render(new Set(['a']));
    draw(new Set(['a', 'b', 'c']));
    expect(openKeys()).toEqual(['a', 'b', 'c']);
  });

  it('reports the category pressed, expanded or collapsed', () => {
    const { toggled } = render(new Set(['a']));
    act(() => {
      (host!.querySelector('[data-detail-key="b"] [data-testid="category-detail-toggle"]') as HTMLElement).click();
    });
    // And an expanded block's own close reads as collapse.
    act(() => {
      ([...host!.querySelectorAll('button')]
        .find(x => (x.textContent ?? '').trim() === 'Close') as HTMLElement).click();
    });
    expect(toggled).toEqual(['b', 'a']);
  });

  it('renders a flat list where the category has no coordinates', () => {
    // Three of the fifteen are hand-written and vary by nothing a grid
    // could show. That is the answer for them, not a gap.
    render(new Set(['b']));
    const flat = host!.querySelector('[data-detail-key="b"]')!;
    expect(flat.querySelector('[data-testid="progress-grid"]')).toBeNull();
    expect(flat.textContent).toContain('Beta');
  });

  it('asks for the block it was pointed at, once', () => {
    // The button expands AND scrolls in one press; the scroll runs
    // after the render that expanded it, so what it reaches for is the
    // grid rather than a collapsed header.
    const { scrolled } = render(new Set(['a', 'c']), 'c');
    expect(scrolled).toEqual(['c']);
  });

  it('asks for nothing when it is pointed at nothing', () => {
    const { scrolled } = render(new Set(['a']));
    expect(scrolled).toEqual([]);
  });

  it('anchors every block by a name both sides compute', () => {
    render(new Set(['a']));
    for (const key of ['a', 'b', 'c']) {
      expect(host!.querySelector(`#${detailAnchorId(key)}`), key).not.toBeNull();
    }
  });
});

// =====================================================================
// The scroll, and the room it needs
// =====================================================================

describe('landing on a block', () => {
  let scrolled: { top?: number } | null = null;
  let intoView = 0;

  function armWindow() {
    scrolled = null;
    intoView = 0;
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    window.scrollTo = ((opts: { top?: number }) => { scrolled = opts; }) as
      unknown as typeof window.scrollTo;
    Element.prototype.scrollIntoView = function scrollIntoViewStub() { intoView += 1; };
  }

  afterEach(() => {
    scrolled = null;
    intoView = 0;
  });

  it('uses the app\u2019s scroll, not the element\u2019s own', () => {
    // THE WHOLE COMPLAINT. `scrollIntoView({ block: "start" })` aligns
    // with the top of the scrollport, which is UNDERNEATH the sticky
    // header, so the block landed behind the chrome. The app\u2019s scroll
    // measures the header and moves the window clear of it — see
    // `scrollSectionToTop`, whose own test proves the subtraction.
    armWindow();
    render(new Set(['b']), 'b');
    expect(scrolled, 'it moved the window').not.toBeNull();
    expect(intoView, 'and did not fall back to scrollIntoView').toBe(0);
  });

  it('asks for nothing when nobody was sent here', () => {
    armWindow();
    render(new Set(['a']));
    expect(scrolled).toBeNull();
    expect(intoView).toBe(0);
  });

  it('reserves a screen of room below the stack once it has landed', () => {
    // A browser cannot scroll past the end of the document, so a block
    // near the bottom stops part way however it is asked.
    armWindow();
    render(new Set(['a']), 'a');
    expect(host!.querySelector('[data-testid="detail-scroll-room"]')).not.toBeNull();
  });

  it('reserves none on a page nobody was sent to', () => {
    // Nothing asked to be at the top, so a screen of blank under the
    // stack would be a hole.
    armWindow();
    render(new Set(['a']));
    expect(host!.querySelector('[data-testid="detail-scroll-room"]')).toBeNull();
  });

  it('keeps the room after the request that needed it is cleared', () => {
    // `scrollTo` is cleared the instant it is acted on so a later
    // re-render cannot scroll the reader back down — but the smooth
    // scroll is still travelling, and the document has to stay tall
    // enough for it to arrive.
    armWindow();
    const { draw } = render(new Set(['a']), 'a');
    expect(host!.querySelector('[data-testid="detail-scroll-room"]')).not.toBeNull();
    draw(new Set(['a', 'b']));
    expect(host!.querySelector('[data-testid="detail-scroll-room"]')).not.toBeNull();
  });

  it('puts the room AFTER every block, not around them', () => {
    // The block landed on may be the last one. A floor on the whole
    // stack would be satisfied by the blocks above it and leave the one
    // that matters short.
    armWindow();
    render(new Set(['a']), 'a');
    const children = [...host!.querySelector('[data-testid="category-detail-stack"]')!.children];
    expect(children[children.length - 1].getAttribute('data-testid'))
      .toBe('detail-scroll-room');
  });
});
