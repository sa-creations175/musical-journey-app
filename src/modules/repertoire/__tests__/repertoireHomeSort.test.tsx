// @vitest-environment jsdom
/**
 * The songs module home already orders its cards, and by both of the
 * things the other four were given controls for.
 *
 * =====================================================================
 * WHY THIS EXISTS SEPARATELY.
 *
 * Harmonic fluency, ear training, reading and Shapes & Patterns got a
 * shared sort control in this build. Song Repertoire is the fifth
 * module home with cards and did NOT get it: it has ordered its own
 * cards since long before, through a control with six orders and its
 * own remembered choice, and two controls for one question on one page
 * is the thing that must not ship.
 *
 * So this pins what it already does — a status order that runs in the
 * song ladder, and a last-practised order — so that "all five sort by
 * status and by last practised" is a checked claim rather than an
 * assumption, and so that retiring either order later has to be
 * deliberate.
 *
 * THE LADDER IS READ FROM `STAGES`, never listed here.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import Repertoire from '../Repertoire';
import { STAGES } from '../stage';
import { db, type Song, type SongPracticeLog, type SongSection } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

/** CHARTED, so the ladder walks it up off the bottom rung: a section
 *  with chords on it is what takes a song from Not Started to Started.
 *  Practised long ago. */
const CHARTED: Song = {
  id: 'song-charted', title: 'Charted Song', artist: 'A',
  addedDate: NOW - 10 * DAY, learningOrder: 1,
} as Song;

/** Nothing charted — the bottom rung — and practised today. So the two
 *  orders disagree, and neither can pass by accident. */
const BARE: Song = {
  id: 'song-bare', title: 'Bare Song', artist: 'B',
  addedDate: NOW - 9 * DAY, learningOrder: 2,
} as Song;

const SECTION: SongSection = {
  id: 'sec-1', songId: CHARTED.id, name: 'Verse 1', order: 0,
  lyrics: '', basicChords: 'C F G',
} as SongSection;

const LOGS: SongPracticeLog[] = [
  {
    id: 'log-old', songId: CHARTED.id, timestamp: NOW - 60 * DAY,
    durationMin: 10, sectionIds: [], keys: ['C'],
  } as SongPracticeLog,
  {
    id: 'log-new', songId: BARE.id, timestamp: NOW - 1 * DAY,
    durationMin: 10, sectionIds: [], keys: ['C'],
  } as SongPracticeLog,
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.songs.clear();
  await db.songSections.clear();
  await db.songPracticeLog.clear();
  await db.userPrefs.clear();
});

async function settle() {
  for (let i = 0; i < 12; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
}

async function render() {
  await db.songs.bulkPut([CHARTED, BARE]);
  await db.songSections.bulkPut([SECTION]);
  await db.songPracticeLog.bulkPut(LOGS);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<MemoryRouter initialEntries={['/repertoire']}><Repertoire /></MemoryRouter>);
  });
  await settle();
  return container!;
}

const sortSelect = () =>
  container!.querySelector('select') as HTMLSelectElement;

const titles = () =>
  [...container!.querySelectorAll('[data-song-id]')]
    .map(a => (a.textContent ?? ''))
    .filter(t => t.includes('Song'))
    .map(t => (t.includes('Charted Song') ? CHARTED.id : BARE.id));

async function choose(value: string) {
  const sel = sortSelect();
  await act(async () => {
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

describe('the songs module home', () => {
  it('offers a status order and a last-practised order', async () => {
    const el = await render();
    const values = [...el.querySelectorAll('option')].map(o => (o as HTMLOptionElement).value);
    expect(values, 'by status').toContain('by-stage');
    expect(values, 'by last practiced').toContain('recent-practice');
    expect(values, 'by last practiced, the other way').toContain('by-freshness');
  });

  it('sorts by status in the song ladder order', async () => {
    // The charted song stands one rung above the bare one, and the
    // order runs up the ladder — so the bare one leads.
    await render();
    await choose('by-stage');
    expect(STAGES.indexOf('not_started')).toBeLessThan(STAGES.indexOf('started'));
    expect(titles()).toEqual([BARE.id, CHARTED.id]);
  });

  it('sorts by last practiced, both ways round', async () => {
    await render();
    await choose('recent-practice');
    expect(titles(), 'most recent first').toEqual([BARE.id, CHARTED.id]);

    await choose('by-freshness');
    expect(titles(), 'stalest first').toEqual([CHARTED.id, BARE.id]);
  });

  it('carries no second sort control', async () => {
    // The shared one the other four module homes got would be a second
    // way to order one page, and a second remembered choice with it.
    const el = await render();
    expect(el.querySelector('[data-testid="card-sort-status"]')).toBeNull();
    expect(el.querySelector('[data-testid="card-sort-last-practiced"]')).toBeNull();
    expect(el.querySelectorAll('select')).toHaveLength(1);
  });
});
