// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ProgressionDrawer from '../ProgressionDrawer';
import type { ProgressionSection } from '../progressionOutline';

// jsdom does no layout, so docking offset and the half-height panel
// can't be verified here — those need eyes. What is covered is what
// the drawer IS: which chords it lists under which headings, that
// hidden ones are absent until revealed and tappable once they are,
// that editing is off by default, that patterns start collapsed, and
// that it declares itself bottom chrome while excluding both drawers
// from its own measurement.

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

function token(sectionId: string, id: string, fn: string, hidden = false) {
  return {
    key: `${sectionId}:${id}`,
    sectionId,
    placementId: id,
    chord: { function: fn, quality: 'maj' },
    barIndex: 0,
    hidden,
  };
}

function sec(
  sectionId: string,
  heading: string,
  tokens: ReturnType<typeof token>[],
  overrides: Partial<ProgressionSection> = {},
): ProgressionSection {
  return {
    sectionId,
    heading,
    arrangementId: 'basic',
    phrases: [{ tokens, endKind: 'end' }],
    order: tokens.map(t => t.placementId),
    patterns: [],
    hiddenCount: tokens.filter(t => t.hidden).length,
    ...overrides,
  };
}

const noop = () => {};
const base = {
  songKey: 'C',
  onSetBreak: noop,
  onRemoveBreak: noop,
  onSetPhraseNote: noop,
  onToggleHidden: noop,
};

describe('ProgressionDrawer — what it lists', () => {
  it('shows each section under its own heading, in order', () => {
    const el = render(
      <ProgressionDrawer
        {...base}
        open
        onOpenChange={noop}
        sections={[
          sec('v', 'verse', [token('v', 'a', '1'), token('v', 'b', '5')]),
          sec('r', 'refrain', [token('r', 'c', '4')]),
        ]}
      />,
    );
    const headings = [...el.querySelectorAll('h3')].map(h => h.textContent);
    expect(headings).toEqual(['verse', 'refrain']);
  });

  it('renders nothing but the strip header when collapsed', () => {
    const el = render(
      <ProgressionDrawer
        {...base}
        open={false}
        onOpenChange={noop}
        sections={[sec('v', 'verse', [token('v', 'a', '1')])]}
      />,
    );
    expect(el.querySelectorAll('h3')).toHaveLength(0);
    expect(el.textContent).toContain('progressions');
  });

  it('counts chords and hidden ones in the header', () => {
    const el = render(
      <ProgressionDrawer
        {...base}
        open={false}
        onOpenChange={noop}
        sections={[
          sec('v', 'verse', [
            token('v', 'a', '1'),
            token('v', 'b', '5', true),
          ]),
        ]}
      />,
    );
    expect(el.textContent).toContain('2 chords, 1 hidden');
  });

  it('says so when there is nothing yet', () => {
    const el = render(
      <ProgressionDrawer {...base} open onOpenChange={noop} sections={[]} />,
    );
    expect(el.textContent).toContain('no chords yet');
  });
});

describe('hidden chords', () => {
  const withHidden = () => [
    sec('v', 'verse', [
      token('v', 'a', '1'),
      token('v', 'b', '5', true),
      token('v', 'c', '4'),
    ]),
  ];

  it('is clean by default — a hidden chord is absent', () => {
    const el = render(
      <ProgressionDrawer
        {...base}
        open
        onOpenChange={noop}
        sections={withHidden()}
      />,
    );
    const labels = [...el.querySelectorAll('button[aria-label]')].map(b =>
      b.getAttribute('aria-label'),
    );
    expect(labels).not.toContain('5maj');
    expect(labels.some(l => l?.includes('hidden'))).toBe(false);
  });

  it('reveals hidden chords greyed, in place, when toggled', () => {
    const el = render(
      <ProgressionDrawer
        {...base}
        open
        onOpenChange={noop}
        sections={withHidden()}
      />,
    );
    const reveal = [...el.querySelectorAll('button')].find(b =>
      b.textContent?.includes('show hidden'),
    )!;
    act(() => reveal.click());
    const hiddenBtn = [...el.querySelectorAll('button[aria-label]')].find(b =>
      b.getAttribute('aria-label')?.includes('hidden, tap to show'),
    )!;
    expect(hiddenBtn).toBeTruthy();
    expect(hiddenBtn.className).toContain('line-through');
  });

  it('tapping a revealed chord unhides it — no edit mode needed', () => {
    const onToggleHidden = vi.fn();
    const el = render(
      <ProgressionDrawer
        {...base}
        onToggleHidden={onToggleHidden}
        open
        onOpenChange={noop}
        sections={withHidden()}
      />,
    );
    act(() =>
      [...el.querySelectorAll('button')]
        .find(b => b.textContent?.includes('show hidden'))!
        .click(),
    );
    const hiddenBtn = [...el.querySelectorAll('button')].find(b =>
      b.getAttribute('aria-label')?.includes('hidden, tap to show'),
    )!;
    act(() => hiddenBtn.click());
    expect(onToggleHidden).toHaveBeenCalledWith('v', 'b');
  });

  it('offers no reveal toggle when nothing is hidden', () => {
    const el = render(
      <ProgressionDrawer
        {...base}
        open
        onOpenChange={noop}
        sections={[sec('v', 'verse', [token('v', 'a', '1')])]}
      />,
    );
    expect(
      [...el.querySelectorAll('button')].some(b =>
        b.textContent?.includes('show hidden'),
      ),
    ).toBe(false);
  });
});

describe('editing', () => {
  it('is off by default — a visible chord is not a live control', () => {
    const el = render(
      <ProgressionDrawer
        {...base}
        open
        onOpenChange={noop}
        sections={[sec('v', 'verse', [token('v', 'a', '1')])]}
      />,
    );
    const chord = [...el.querySelectorAll('button')].find(
      b => b.getAttribute('aria-label') === '1maj',
    )! as HTMLButtonElement;
    expect(chord.disabled).toBe(true);
  });

  it('opens the choices row for a chord once editing', () => {
    const el = render(
      <ProgressionDrawer
        {...base}
        open
        onOpenChange={noop}
        sections={[sec('v', 'verse', [token('v', 'a', '1'), token('v', 'b', '5')])]}
      />,
    );
    act(() =>
      [...el.querySelectorAll('button')]
        .find(b => b.textContent === 'edit')!
        .click(),
    );
    const chord = [...el.querySelectorAll('button')].find(
      b => b.getAttribute('aria-label') === '1maj',
    )!;
    act(() => chord.click());
    expect(el.textContent).toContain('hide from progression');
  });

  it('adds a break from the gap between two chords', () => {
    const onSetBreak = vi.fn();
    const el = render(
      <ProgressionDrawer
        {...base}
        onSetBreak={onSetBreak}
        open
        onOpenChange={noop}
        sections={[sec('v', 'verse', [token('v', 'a', '1'), token('v', 'b', '5')])]}
      />,
    );
    act(() =>
      [...el.querySelectorAll('button')]
        .find(b => b.textContent === 'edit')!
        .click(),
    );
    act(() =>
      [...el.querySelectorAll('button')]
        .find(b => b.getAttribute('aria-label') === 'break after 1maj')!
        .click(),
    );
    act(() =>
      [...el.querySelectorAll('button')]
        .find(b => b.textContent === 'separator')!
        .click(),
    );
    expect(onSetBreak).toHaveBeenCalledWith('v', 'a', 'separator');
  });

  it('leaving edit mode closes an open choices row', () => {
    const el = render(
      <ProgressionDrawer
        {...base}
        open
        onOpenChange={noop}
        sections={[sec('v', 'verse', [token('v', 'a', '1')])]}
      />,
    );
    const editBtn = [...el.querySelectorAll('button')].find(
      b => b.textContent === 'edit',
    )!;
    act(() => editBtn.click());
    act(() =>
      [...el.querySelectorAll('button')]
        .find(b => b.getAttribute('aria-label') === '1maj')!
        .click(),
    );
    expect(el.textContent).toContain('hide from progression');
    act(() =>
      [...el.querySelectorAll('button')]
        .find(b => b.textContent === 'done')!
        .click(),
    );
    expect(el.textContent).not.toContain('hide from progression');
  });
});

describe('patterns list', () => {
  const withPattern = () =>
    sec('v', 'verse', [token('v', 'a', '2'), token('v', 'b', '5')], {
      patterns: [
        {
          patternId: 'ii-V',
          numerals: ['ii', 'V'],
          matchIndex: 0,
          matchLength: 2,
          startBar: 0,
          endBar: 1,
          deviations: [],
        },
      ],
    });

  it('is present but COLLAPSED by default', () => {
    const el = render(
      <ProgressionDrawer
        {...base}
        open
        onOpenChange={noop}
        sections={[withPattern()]}
      />,
    );
    const toggle = [...el.querySelectorAll('button')].find(b =>
      b.textContent?.includes('patterns'),
    )!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelectorAll('ul')).toHaveLength(0);
  });

  it('expands on tap', () => {
    const el = render(
      <ProgressionDrawer
        {...base}
        open
        onOpenChange={noop}
        sections={[withPattern()]}
      />,
    );
    act(() =>
      [...el.querySelectorAll('button')]
        .find(b => b.textContent?.includes('patterns'))!
        .click(),
    );
    expect(el.querySelectorAll('ul')).toHaveLength(1);
    expect(el.textContent).toContain('bars 1–2');
  });
});

describe('docking', () => {
  it('declares itself bottom chrome and identifies itself', () => {
    const el = render(
      <ProgressionDrawer {...base} open={false} onOpenChange={noop} sections={[]} />,
    );
    const drawer = el.querySelector('[data-progression-drawer]')!;
    expect(drawer.getAttribute('data-app-chrome')).toBe('bottom');
  });
});
