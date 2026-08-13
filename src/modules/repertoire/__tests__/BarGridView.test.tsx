// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { DndContext } from '@dnd-kit/core';
import type { ChordPlacement, Song, SongSection } from '../../../lib/db';
import BarGridView from '../BarGridView';

/**
 * THE ARITY TRAP, guarded.
 *
 * `onEmptyBeatClick` is typed (barIndex, beatPos, offbeat?) and the
 * call site passes all three, but the handler was written with TWO
 * parameters. A function with fewer parameters is assignable in
 * TypeScript, so the third was dropped in silence — `tsc` cannot see
 * it, and neither could any pure test, because the loss happens at a
 * prop boundary inside a component.
 *
 * The visible consequence was that an "and" slot could be tapped and
 * nothing would open, because the add box matched on a position whose
 * offbeat flag was always undefined. These tests tap an offbeat slot
 * and assert the box opens THERE — which fails on the old handler and
 * would fail again on any future signature that drops the flag.
 */

// jsdom has no matchMedia, and the grid reads it to pick one or two
// bars per row. Reports "not mobile" so the layout is deterministic.
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
  eighths: true,
} as Song;

/** One chord of 4 slots in an 8-slot bar, leaving the second half
 *  free — the exact shape that blocked adding a chord. */
function section(): SongSection {
  const placement: ChordPlacement = {
    id: 'p1',
    arrangementId: 'basic',
    barIndex: 0,
    beatPos: 0,
    beats: 4,
    chord: { function: '5', quality: 'maj' },
  } as ChordPlacement;
  return {
    id: 'sec-1',
    songId: 'song-1',
    name: 'Verse',
    order: 0,
    lyrics: '',
    chordPlacements: [placement],
  } as SongSection;
}

function renderGrid(onChordAdd = vi.fn()) {
  const el = render(
    <DndContext>
      <BarGridView
        song={song}
        section={section()}
        activeArrangementId="basic"
        onChordAdd={onChordAdd}
      />
    </DndContext>,
  );
  return { el, onChordAdd };
}

/** Free slots, in document order. The aria-label deliberately does NOT
 *  distinguish the "and", which is why they are taken positionally. */
function freeSlots(el: HTMLElement) {
  return [...el.querySelectorAll('[aria-label^="empty beat slot"]')] as HTMLElement[];
}

describe('BarGridView — free slots after shortening a chord', () => {
  it('offers a slot for every uncovered position, on the beat and off it', () => {
    const { el } = renderGrid();
    // 8 slots, 4 covered by the chord: beat 3, and-of-3, beat 4, and-of-4.
    expect(freeSlots(el)).toHaveLength(4);
  });

  it('makes every free slot a live target', () => {
    const { el } = renderGrid();
    for (const slot of freeSlots(el)) {
      expect(slot.getAttribute('role')).toBe('button');
    }
  });
});

describe('BarGridView — the add box opens on the slot that was tapped', () => {
  /** The add box marks its target slot with the accent fill.
   *  Matched as a WHOLE class: every clickable slot also carries
   *  `hover:bg-fluent/5`, so a substring test is true for all of them
   *  and would pass no matter what — which it did, until this. */
  const isTargeted = (slot: HTMLElement) =>
    /(?:^|\s)bg-fluent\/5(?:\s|$)/.test(slot.className);

  it('opens on an ON-BEAT slot', () => {
    const { el } = renderGrid();
    const slots = freeSlots(el);
    act(() => slots[0].click());
    expect(isTargeted(freeSlots(el)[0])).toBe(true);
  });

  it('opens on an OFFBEAT slot — the case the dropped parameter broke', () => {
    const { el } = renderGrid();
    const slots = freeSlots(el);
    // Index 1 is the "and" of the first free beat. Before the fix the
    // add box could never match it: the stored position carried no
    // offbeat flag, so the comparison was always false === true.
    act(() => slots[1].click());
    expect(isTargeted(freeSlots(el)[1])).toBe(true);
  });

  it('does NOT open on the on-beat neighbour when the "and" is tapped', () => {
    // The other half of the same bug: a dropped flag made the tap
    // land on the beat beside the slot the user actually touched.
    const { el } = renderGrid();
    act(() => freeSlots(el)[1].click());
    expect(isTargeted(freeSlots(el)[0])).toBe(false);
  });

  it('tapping the same slot again closes the box', () => {
    const { el } = renderGrid();
    act(() => freeSlots(el)[1].click());
    expect(isTargeted(freeSlots(el)[1])).toBe(true);
    act(() => freeSlots(el)[1].click());
    expect(isTargeted(freeSlots(el)[1])).toBe(false);
  });

  it('moves the box when a different slot is tapped', () => {
    const { el } = renderGrid();
    act(() => freeSlots(el)[1].click());
    act(() => freeSlots(el)[3].click());
    expect(isTargeted(freeSlots(el)[1])).toBe(false);
    expect(isTargeted(freeSlots(el)[3])).toBe(true);
  });
});
