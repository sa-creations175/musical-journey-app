// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ProgressionDrawer from '../ProgressionDrawer';
import { buildSongProgression, type ProgressionSection } from '../progressionOutline';
import { BASIC_ARRANGEMENT_ID } from '../beatsModel';

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
  // Positioning moved to LeadSheetDrawers; see its test for the
  // bottom-chrome contract. What matters here is that the drawer no
  // longer claims to be chrome in its own right — two self-declaring
  // drawers landing on one rectangle is exactly the bug that moved it.
  it('does not position itself or claim to be bottom chrome', () => {
    const el = render(
      <ProgressionDrawer {...base} open={false} onOpenChange={noop} sections={[]} />,
    );
    const drawer = el.querySelector('[data-progression-drawer]') as HTMLElement;
    expect(drawer.getAttribute('data-app-chrome')).toBeNull();
    expect(drawer.className).not.toContain('fixed');
  });
});

describe('reaching a line break', () => {
  /** A section split by a `row` break, as the intro was. */
  function withRowBreak() {
    const a = token('s1', 'p1', '2');
    const b = token('s1', 'p2', '6');
    return sec('s1', 'Intro', [], {
      phrases: [
        { tokens: [a], endKind: 'row', endsAfterPlacementId: 'p1' },
        { tokens: [b], endKind: 'end' },
      ],
      order: ['p1', 'p2'],
    });
  }

  function enterEditMode(el: HTMLElement) {
    const edit = [...el.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'edit',
    )!;
    act(() => edit.click());
  }

  it('offers a control for a row break — it used to have none', () => {
    // The only thing at the end of the line was the note field, so
    // tapping there edited the note and the break could not be
    // selected at all.
    const el = render(
      <ProgressionDrawer {...base} sections={[withRowBreak()]} open onOpenChange={noop} />,
    );
    enterEditMode(el);
    const control = el.querySelector('[aria-label="edit this line break"]');
    expect(control).not.toBeNull();
  });

  it('CONVERTS it to a separator in one tap, keeping the same anchor', () => {
    // The action the user actually wanted: not "delete this break" but
    // "stop it being a line break". Asserting on the callback, not on
    // what the row looks like — a test that found the chip would pass
    // on a build where tapping it did nothing.
    const calls: Array<[string, string, string]> = [];
    const el = render(
      <ProgressionDrawer
        {...base}
        sections={[withRowBreak()]}
        open
        onOpenChange={noop}
        onSetBreak={(sectionId, after, kind) => {
          calls.push([sectionId, after, kind]);
        }}
      />,
    );
    enterEditMode(el);
    act(() =>
      (el.querySelector('[aria-label="edit this line break"]') as HTMLElement).click(),
    );
    const convert = [...el.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'make it a separator',
    );
    expect(convert).toBeDefined();
    act(() => convert!.click());
    expect(calls).toEqual([['s1', 'p1', 'separator']]);
  });

  it('shows the kind already in place as current, not as an action', () => {
    // Offering "new row" on something that is already a row is a no-op
    // wearing an action's clothes.
    const el = render(
      <ProgressionDrawer {...base} sections={[withRowBreak()]} open onOpenChange={noop} />,
    );
    enterEditMode(el);
    act(() =>
      (el.querySelector('[aria-label="edit this line break"]') as HTMLElement).click(),
    );
    const asButton = [...el.querySelectorAll('button')].some(
      b => b.textContent?.trim() === 'new row',
    );
    expect(asButton).toBe(false);
  });

  it('can remove the break outright', () => {
    const removed: string[] = [];
    const el = render(
      <ProgressionDrawer
        {...base}
        sections={[withRowBreak()]}
        open
        onOpenChange={noop}
        onRemoveBreak={(_sectionId, after) => {
          removed.push(after);
        }}
      />,
    );
    enterEditMode(el);
    act(() =>
      (el.querySelector('[aria-label="edit this line break"]') as HTMLElement).click(),
    );
    const remove = [...el.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'remove break',
    )!;
    act(() => remove.click());
    expect(removed).toEqual(['p1']);
  });

  it('offers no break control outside edit mode', () => {
    const el = render(
      <ProgressionDrawer {...base} sections={[withRowBreak()]} open onOpenChange={noop} />,
    );
    expect(el.querySelector('[aria-label="edit this line break"]')).toBeNull();
  });
});


// ---------------------------------------------------------------------
// Through the REAL pipeline.
//
// The cases above hand-build a ProgressionSection, which proves the
// component works on the shape it is given but not that the shape it
// actually receives is that one. This builds a stored SongSection with
// a `row` break in its sequenceView and runs it through
// buildSongProgression — the same call SongDetailView makes.
// ---------------------------------------------------------------------

describe('a row break from stored data', () => {
  const realSong = {
    id: 's1', title: 'Can We Talk', timeSignature: '4/4', key: 'F',
    eighths: false,
  } as unknown as Parameters<typeof buildSongProgression>[0];

  function placement(id: string, barIndex: number, fn: string) {
    return {
      id,
      arrangementId: BASIC_ARRANGEMENT_ID,
      barIndex,
      beatPos: 0,
      beats: 4,
      chord: { function: fn, quality: 'min7' },
    };
  }

  /** Intro: 3min7 6min 2min7 | 6min7, split by a ROW break after the
   *  third chord — the shape reported as unreachable. */
  function storedSections() {
    return [{
      id: 'intro',
      songId: 's1',
      name: 'Intro',
      order: 0,
      lyrics: '',
      chordPlacements: [
        placement('c1', 0, '3'),
        placement('c2', 1, '6'),
        placement('c3', 2, '2'),
        placement('c4', 3, '6'),
      ],
      sequenceView: {
        breaks: [{ afterPlacementId: 'c3', kind: 'row' as const }],
        hidden: [],
      },
    }] as unknown as Parameters<typeof buildSongProgression>[1];
  }

  it('produces a row-ended phrase with an anchor the control can use', () => {
    const built = buildSongProgression(realSong, storedSections());
    const rowPhrase = built[0].phrases.find(p => p.endKind === 'row');
    expect(rowPhrase).toBeDefined();
    expect(rowPhrase!.endsAfterPlacementId).toBe('c3');
  });

  it('renders the control and opens the choices row on tap', () => {
    const built = buildSongProgression(realSong, storedSections());
    const el = render(
      <ProgressionDrawer {...base} sections={built} open onOpenChange={noop} />,
    );
    const edit = [...el.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'edit',
    )!;
    act(() => edit.click());

    const control = el.querySelector('[aria-label="edit this line break"]');
    expect(control).not.toBeNull();

    act(() => (control as HTMLElement).click());
    const convert = [...el.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'make it a separator',
    );
    expect(convert).toBeDefined();
  });
});

describe('where the break control sits', () => {
  /**
   * jsdom does no layout, so nothing here can prove the control is
   * VISIBLE. What it can prove is DOM ORDER, and order is the mechanism
   * that displaced it: PhraseNote is `basis-full` in edit mode, so in a
   * wrapping row every sibling after it is pushed onto a line of its
   * own. The control shipped after the note field and therefore landed
   * two lines below the break it marks, with an empty textarea sitting
   * where the user actually taps.
   *
   * Every other test in this file clicked the control by aria-label and
   * passed regardless of where it was — which is exactly how this got
   * out.
   */
  function rowSection() {
    const a = token('s1', 'p1', '2');
    const b = token('s1', 'p2', '6');
    return sec('s1', 'Intro', [], {
      phrases: [
        { tokens: [a], endKind: 'row', endsAfterPlacementId: 'p1' },
        { tokens: [b], endKind: 'end' },
      ],
      order: ['p1', 'p2'],
    });
  }

  function editing(el: HTMLElement) {
    const edit = [...el.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'edit',
    )!;
    act(() => edit.click());
  }

  it('comes BEFORE the note field, not after it', () => {
    const el = render(
      <ProgressionDrawer {...base} sections={[rowSection()]} open onOpenChange={noop} />,
    );
    editing(el);
    const control = el.querySelector('[aria-label="edit this line break"]')!;
    const note = el.querySelector('textarea')!;
    expect(control).not.toBeNull();
    expect(note).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING === the note comes after the control.
    expect(
      control.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('is a sibling of the chords it follows', () => {
    // Same wrapping row as the tokens, so it renders at the break
    // rather than in a block of its own.
    const el = render(
      <ProgressionDrawer {...base} sections={[rowSection()]} open onOpenChange={noop} />,
    );
    editing(el);
    const control = el.querySelector('[aria-label="edit this line break"]')!;
    expect(control.parentElement?.className).toContain('flex-wrap');
  });
});
