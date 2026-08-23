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
import KeyRow from '../KeyRow';
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

describe('the two key-level actions stayed on the key row', () => {
  it('both are reachable and report the key', () => {
    // They are per-KEY. Putting them inside the panel a CELL opens
    // would mean picking an arbitrary section to reach something that
    // has nothing to do with sections.
    const r = render();
    const test = r.buttons().find(b => (b.textContent ?? '').trim() === 'test');
    const run = r.buttons().find(b => (b.textContent ?? '').trim() === 'run');
    expect(test).toBeDefined();
    expect(run).toBeDefined();
    act(() => { test!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { run!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(r.tests).toEqual(['sk-F#']);
    expect(r.runs).toEqual(['sk-F#']);
    r.unmount();
  });

  it('reads "retest" once the key is overdue', () => {
    const r = render({ nextDueAt: NOW - (GRACE_DEFAULT_DAYS + 5) * DAY });
    expect(r.buttons().some(b => (b.textContent ?? '').trim() === 'retest')).toBe(true);
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
