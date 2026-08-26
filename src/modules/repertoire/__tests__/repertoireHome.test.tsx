// @vitest-environment jsdom
/**
 * The module home opens on its songs.
 *
 * =====================================================================
 * WHAT THIS PROVES: that the page a reader lands on is a card per song,
 * that no ribbon and no card stands between them and it, and that
 * opening one goes to that song.
 *
 * WHAT IT CANNOT: how the cards sit at any width, or whether a drag
 * actually moves one. jsdom has no layout engine and no pointer — both
 * need Silas's eye.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import Repertoire from '../Repertoire';
import { db, type Song } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const SONGS: Song[] = [
  {
    id: 'song-a', title: 'No Weapon', artist: 'Fred Hammond',
    addedDate: Date.now(), learningOrder: 1,
  } as Song,
  {
    id: 'song-b', title: 'Never Would Have Made It', artist: 'Marvin Sapp',
    addedDate: Date.now(), learningOrder: 2,
  } as Song,
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.songs.clear();
  await db.userPrefs.clear();
});

async function render() {
  await db.songs.bulkPut(SONGS);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<MemoryRouter initialEntries={['/repertoire']}><Repertoire /></MemoryRouter>);
  });
  for (let i = 0; i < 10; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return container!;
}

const titles = () =>
  [...container!.querySelectorAll('article')]
    .map(a => a.querySelector('.font-medium')?.textContent);

describe('the repertoire home', () => {
  it('opens on a card per song', async () => {
    const el = await render();
    const cards = el.querySelectorAll('article');
    expect(cards.length).toBeGreaterThanOrEqual(SONGS.length);
    for (const song of SONGS) {
      expect(titles(), song.title).toContain(song.title);
    }
  });

  it('shows no tab ribbon', async () => {
    // The strip named three things and only one of them was a place.
    const el = await render();
    expect(el.querySelector('[aria-label="repertoire view"]')).toBeNull();
  });

  it('names no card after a view', async () => {
    // The song cards do that work; a card called "Active Repertoire"
    // would be a second name for the page it sits on.
    const el = await render();
    const text = (el.textContent ?? '').toLowerCase();
    for (const heading of ['song detail']) {
      expect(text, heading).not.toContain(heading);
    }
    expect(el.querySelectorAll('[data-card-key]')).toHaveLength(0);
  });

  it('carries the song count in the header', async () => {
    const el = await render();
    expect(el.textContent).toContain(String(SONGS.length));
    expect(el.textContent).toContain('songs');
  });

  it('offers exactly two ways to add a song', async () => {
    // "Want to Learn" stopped being a tab; the backlog is where a song
    // comes FROM, so it is offered at the moment one is being added.
    const el = await render();
    expect(el.querySelector('[data-testid="add-song-menu"]'), 'closed on arrival')
      .toBeNull();

    await act(async () => {
      (el.querySelector('[data-testid="add-song"]') as HTMLElement).click();
    });

    const menu = el.querySelector('[data-testid="add-song-menu"]')!;
    const items = [...menu.querySelectorAll('[role="menuitem"]')]
      .map(b => (b.textContent ?? '').trim());
    expect(items).toEqual(['Add from Want to Learn List', 'Add New Song']);
  });

  it('reaches the want-to-learn list through that button, and comes back', async () => {
    // The list is not deleted, only re-homed — and a page reached from
    // a button needs a way out now that the ribbon is gone.
    const el = await render();
    await act(async () => {
      (el.querySelector('[data-testid="add-song"]') as HTMLElement).click();
    });
    await act(async () => {
      (el.querySelector('[data-testid="add-song-from-backlog"]') as HTMLElement).click();
    });
    for (let i = 0; i < 10; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    }
    const back = el.querySelector('[data-testid="want-to-learn-back"]');
    expect(back, 'the backlog opened').not.toBeNull();

    await act(async () => { (back as HTMLElement).click(); });
    for (let i = 0; i < 10; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    }
    expect(el.querySelector('[data-testid="add-song"]'), 'the cards are back')
      .not.toBeNull();
  });

  it('opens a song from its card', async () => {
    const el = await render();
    const card = [...el.querySelectorAll('article')]
      .find(a => (a.textContent ?? '').includes('No Weapon'))!;
    const open = [...card.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').trim() === 'open')!;
    await act(async () => { open.click(); });
    for (let i = 0; i < 10; i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    }
    // The cards are replaced by the song's own page.
    expect(el.textContent).toContain('No Weapon');
    expect([...el.querySelectorAll('article')]
      .some(a => (a.textContent ?? '').includes('Never Would Have Made It'))).toBe(false);
  });
});
