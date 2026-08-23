// @vitest-environment jsdom
/**
 * One key, one row.
 *
 * ---------------------------------------------------------------
 * THE THING THAT LOOKS LIKE A GRID SHOULD BE THE GRID.
 *
 * A key used to take two rows: small squares under the section
 * headers, then a full-width strip carrying a state badge, a section
 * count, a date, and both actions. Everything with visual weight was
 * on the strip, so twelve keys read as a list of keys rather than as
 * a grid.
 *
 * These assert the structure that fixed it — one row, cells that are
 * real cells, actions that stayed reachable — because the failure
 * mode is entirely visual and nothing about it throws.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { SongCell, SongKey, SongMatrixSection } from '../../../../lib/db';
import KeyRow, { gridTemplate } from '../KeyRow';
import {
  DUE_SOON_DEFAULT_DAYS,
  GRACE_DEFAULT_DAYS,
  type DueWindows,
} from '../keySpacing';

const NOW = 1_760_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const W: DueWindows = {
  dueSoonDays: DUE_SOON_DEFAULT_DAYS,
  graceDays: GRACE_DEFAULT_DAYS,
};

const key = (over: Partial<SongKey> = {}): SongKey => ({
  id: 'sk-F#', songId: 's1', keyName: 'F#', isOriginalKey: false,
  keyState: 'comfortable', solidAt: null, solidDecayState: null,
  lastDecayCheckAt: null, livedWithSessionCount: 0,
  livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
  livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
  isRetestRecommended: false, lastEngagedAt: NOW, createdAt: 0, updatedAt: 0,
  ...over,
});

const section = (id: string, name: string): SongMatrixSection => ({
  id, songId: 's1', name, displayOrder: 0, isArchived: false,
  splitFromSectionId: null, createdAt: 0, updatedAt: 0,
});

const cell = (sectionId: string, over: Partial<SongCell> = {}): SongCell => ({
  id: `c-${sectionId}`, songId: 's1', sectionId, songKeyId: 'sk-F#',
  cellState: 'learning', comfortableAt: null, consecutiveCleanCount: 0,
  lastRunAt: NOW, lastRunWasClean: true, notes: null, lastEngagedAt: NOW,
  createdAt: 0, updatedAt: 0, ...over,
});

const SECTIONS = [section('sec-1', 'Intro'), section('sec-2', 'Chorus'), section('sec-3', 'Bridge')];

function render(over: Partial<Parameters<typeof KeyRow>[0]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const taps: string[] = [];
  const tests: string[] = [];
  const runs: string[] = [];
  act(() => {
    root.render(
      <KeyRow
        keyName="F#"
        spelling="flat"
        songKey={key()}
        sections={SECTIONS}
        cellsBySectionId={new Map([['sec-1', cell('sec-1')]])}
        isOriginal={false}
        now={NOW}
        dueWindows={W}
        onCellTap={id => taps.push(id)}
        onRunTest={id => tests.push(id)}
        onLogRun={id => runs.push(id)}
        {...over}
      />,
    );
  });
  return {
    container, taps, tests, runs,
    text: () => container.textContent ?? '',
    buttons: () => [...container.querySelectorAll('button')],
    unmount() { act(() => { root.unmount(); }); container.remove(); },
  };
}

describe('one row, cells that are cells', () => {
  it('renders one cell per section', () => {
    const r = render();
    // Three sections plus the two actions — and no strip.
    const cells = r.buttons().filter(b => b.className.includes('aspect-square'));
    expect(cells).toHaveLength(3);
    r.unmount();
  });

  it('every cell is square, which is what makes it read as a grid', () => {
    const r = render();
    const cells = r.buttons().filter(b => b.className.includes('aspect-square'));
    expect(cells.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('the strip that carried the state badge and counts is gone', () => {
    // Guard the guard: the row still renders SOMETHING, so this is not
    // passing on an empty render.
    const r = render();
    expect(r.text().length).toBeGreaterThan(0);
    for (const gone of ['Comfortable', 'sections', 'Tested', 'Untested']) {
      expect(r.text()).not.toContain(gone);
    }
    r.unmount();
  });

  it('taps a cell by its id', () => {
    const r = render();
    const cells = r.buttons().filter(b => b.className.includes('aspect-square'));
    act(() => { cells[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(r.taps).toEqual(['c-sec-1']);
    r.unmount();
  });

  it('a section with no cell row is not tappable', () => {
    // Nothing to log against yet. Firing a tap with no cell id would
    // mean inventing one.
    const r = render();
    const cells = r.buttons().filter(b => b.className.includes('aspect-square'));
    act(() => { cells[2].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(r.taps).toEqual([]);
    r.unmount();
  });
});

describe('the two key-level actions', () => {
  const label = (b: Element) => (b.textContent ?? '').replace(/\s+/g, ' ').trim();
  const find = (r: ReturnType<typeof render>, text: string) =>
    r.buttons().find(b => label(b) === text);

  it('name what they are, not a word you have to already know', () => {
    // "test" and "run" were two cryptic words doing very different
    // jobs — depth versus breadth — and neither said which. The count
    // beside each is the difference: three in a row versus one pass.
    // The FULL rule (at or above tempo minus 10, back to back, one
    // sitting) belongs in the modal, which has room to state it.
    const r = render({ runCounts: true });
    expect(find(r, 'test · 3 clean in a row')).toBeDefined();
    expect(find(r, 'run at tempo · 1 clean pass')).toBeDefined();
    r.unmount();
  });

  it('both are reachable and report the key', () => {
    // They are per-KEY. Putting them inside the panel a CELL opens
    // would mean picking an arbitrary section to reach something that
    // has nothing to do with sections.
    const r = render({ runCounts: true });
    const test = find(r, 'test · 3 clean in a row');
    const run = find(r, 'run at tempo · 1 clean pass');
    act(() => { test!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { run!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(r.tests).toEqual(['sk-F#']);
    expect(r.runs).toEqual(['sk-F#']);
    r.unmount();
  });

  it('says "test again" once the key is overdue', () => {
    const r = render({ nextDueAt: NOW - (GRACE_DEFAULT_DAYS + 5) * DAY });
    expect(find(r, 'test again · 3 clean in a row')).toBeDefined();
    r.unmount();
  });
});

describe('the run button appears only where a run counts', () => {
  const label = (b: Element) => (b.textContent ?? '').replace(/\s+/g, ' ').trim();
  const hasRun = (r: ReturnType<typeof render>) =>
    r.buttons().some(b => label(b).startsWith('run at tempo'));

  it('is absent when a clean run on this key advances nothing', () => {
    // THE LOAD-BEARING ONE. A single run advances exactly one
    // criterion in the whole ladder — the breadth half of Cross-key →
    // Internalized. Everywhere else its only honest label would be
    // "this doesn't count yet", and a control that needs that label
    // should not be on screen.
    const r = render();
    expect(hasRun(r)).toBe(false);
    r.unmount();
  });

  it('is present when it does', () => {
    const r = render({ runCounts: true });
    expect(hasRun(r)).toBe(true);
    r.unmount();
  });

  it('leaves the row with an action either way', () => {
    // Guard the guard: hiding "run" must not leave a row you cannot
    // act on. Before Cross-key every row still offers the test.
    const r = render();
    expect(r.buttons().some(b => label(b).startsWith('test'))).toBe(true);
    r.unmount();
  });

  it('defaults to hidden when the caller says nothing', () => {
    // A caller that has not worked out the answer gets no button,
    // rather than a button that may do nothing. The default is the
    // safe direction precisely because it is easy to forget to pass.
    const r = render({ runCounts: undefined });
    expect(hasRun(r)).toBe(false);
    r.unmount();
  });
});

describe('the lapse is marked on the key, not on its cells', () => {
  it('shows overdue on the row when the key is past grace', () => {
    const r = render({ nextDueAt: NOW - (GRACE_DEFAULT_DAYS + 5) * DAY });
    expect(r.text()).toContain('overdue');
    r.unmount();
  });

  it('warns before it bites', () => {
    const soon = render({ nextDueAt: NOW + 3 * DAY });
    expect(soon.text()).toContain('soon');
    soon.unmount();

    const due = render({ nextDueAt: NOW - DAY });
    expect(due.text()).toContain('due');
    due.unmount();
  });

  it('says nothing when the key is comfortably held', () => {
    const r = render({ nextDueAt: NOW + 90 * DAY });
    for (const word of ['overdue', 'soon']) {
      expect(r.text()).not.toContain(word);
    }
    r.unmount();
  });
});

describe('the key name', () => {
  it('is spelled, never the stored identity', () => {
    const r = render();
    expect(r.text()).toContain('G♭');
    expect(r.text()).not.toContain('F#');
    r.unmount();
  });

  it('marks the original key', () => {
    const r = render({ isOriginal: true });
    expect(r.text()).toContain('orig');
    r.unmount();
  });
});

describe('the column template', () => {
  /**
   * A CELL NEEDS A CEILING, NOT JUST A FLOOR.
   *
   * The cells were `flex-1 min-w-[36px]`: a tapping floor and nothing
   * above it, so on a wide card three sections split the row into
   * three ~400px slabs. The 36px was a minimum for the finger, never
   * a target for the eye. Shapes & Patterns' heat grid caps its cells
   * and lets the LABEL column absorb the slack; this now does the same.
   */
  it('caps the cell columns instead of letting them absorb the row', () => {
    const t = gridTemplate(3);
    expect(t).toContain('repeat(3, minmax(42px, 56px))');
    // The load-bearing half: a template written with `1fr` per cell —
    // or `minmax(42px, 1fr)` — passes a "cells have a minimum" test
    // and still stretches. The maximum is what fixed the bug.
    expect(t).not.toMatch(/repeat\(\d+, minmax\([^)]*1fr\)\)/);
  });

  it('gives the slack to a column that is allowed to grow', () => {
    // Something must absorb the leftover width or the capped cells
    // stretch again. Here it is the trailing 1fr, after the actions.
    expect(gridTemplate(3).trimEnd().endsWith('1fr')).toBe(true);
  });

  it('is the same template the header row uses', async () => {
    // Two column definitions that must agree are two definitions that
    // will not. Asserted at the source, because a header sitting over
    // the wrong section is a purely visual failure that never throws.
    const sources = import.meta.glob('../{KeyRow,MatrixGrid}.tsx', {
      eager: true, query: '?raw', import: 'default',
    }) as Record<string, string>;
    const grid = Object.entries(sources).find(([f]) => f.includes('MatrixGrid'))?.[1] ?? '';
    expect(grid).toContain('gridTemplate(sections.length)');
    // No second, hand-written definition anywhere in the pair.
    for (const [file, src] of Object.entries(sources)) {
      const literals = src.match(/gridTemplateColumns:\s*`/g) ?? [];
      expect(literals, file).toHaveLength(0);
    }
  });
});
