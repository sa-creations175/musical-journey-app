// @vitest-environment jsdom
/**
 * Song Repertoire in the nav reaches the module home from a song page.
 *
 * =====================================================================
 * WHAT THIS PROVES, AND WHY IT IS THE WHOLE POINT.
 *
 * Every other module name in the nav lands on that module's cards from
 * anywhere, because every other module home is a route. This one's
 * three views are component state on ONE route, so from a song page the
 * link points at the URL already on screen and there is no route change
 * for anything to notice — the reader pressed the way out and stayed
 * where they were.
 *
 * The nav's own marker is what carries the request, so the test presses
 * a link built the way `SidebarNav` builds its module names: the same
 * `to`, the same `MODULE_HOME_STATE`. Rebuilding the marker by hand
 * here would let the nav stop sending it without this failing.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, NavLink } from 'react-router-dom';
import Repertoire from '../Repertoire';
import { MODULE_HOME_STATE } from '../../../lib/useEndOnModuleHome';
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

/** Long enough for the page's async pref reads and Dexie queries to
 *  land — the same wait `repertoireHome` uses. */
async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
}

async function render() {
  await db.songs.bulkPut(SONGS);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={['/repertoire']}>
        {/* The nav's module name, exactly as `SidebarNav` writes it. */}
        <NavLink to="/repertoire" state={MODULE_HOME_STATE} data-testid="nav-repertoire">
          song repertoire
        </NavLink>
        <Repertoire />
      </MemoryRouter>,
    );
  });
  await settle();
  return container!;
}

const songCards = () => [...container!.querySelectorAll('[data-song-id]')];

async function openSong(title: string) {
  const card = songCards().find(a => (a.textContent ?? '').includes(title))!;
  const open = card.querySelector('[data-testid="song-card-open"]') as HTMLButtonElement;
  await act(async () => { open.click(); });
  await settle();
}

async function pressNav() {
  const link = container!.querySelector('[data-testid="nav-repertoire"]') as HTMLElement;
  await act(async () => { link.click(); });
  await settle();
}

describe('the Song Repertoire nav item', () => {
  it('reaches the module home from a song detail page', async () => {
    const el = await render();
    await openSong('No Weapon');
    // On the song's own page: the other song's card is gone.
    expect(
      songCards().some(a => (a.textContent ?? '').includes('Never Would Have Made It')),
      'the song page opened',
    ).toBe(false);

    await pressNav();

    // Back on the cards — every song, and the way in to add one.
    expect(el.querySelector('[data-testid="add-song"]'), 'the cards are back')
      .not.toBeNull();
    for (const song of SONGS) {
      expect(
        songCards().some(a => (a.textContent ?? '').includes(song.title)),
        song.title,
      ).toBe(true);
    }
  });

  it('presses twice from the same song and lands both times', async () => {
    // A link to the URL already on screen is a replace, so the second
    // arrival has no new pathname either. It still has to land.
    await render();
    await openSong('No Weapon');
    await pressNav();
    await openSong('No Weapon');
    await pressNav();
    expect(
      songCards().some(a => (a.textContent ?? '').includes('Never Would Have Made It')),
    ).toBe(true);
  });

  it('is not undone by the remembered view', async () => {
    // The stored tab is read asynchronously and lands AFTER the press
    // has been honoured. Without the mount guard it restores 'detail'
    // over the top, which looks exactly like the original bug.
    await db.userPrefs.put({ key: 'repertoireActiveTab', value: 'detail' });
    await db.userPrefs.put({ key: 'repertoireSelectedSongId', value: 'song-a' });
    await db.songs.bulkPut(SONGS);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <MemoryRouter
          initialEntries={[{ pathname: '/repertoire', state: MODULE_HOME_STATE }]}
        >
          <Repertoire />
        </MemoryRouter>,
      );
    });
    await settle();

    expect(container!.querySelector('[data-testid="add-song"]'), 'landed on the cards')
      .not.toBeNull();
    expect(
      songCards().some(a => (a.textContent ?? '').includes('Never Would Have Made It')),
    ).toBe(true);
  });

  it('still restores the remembered song page when the nav did not ask', async () => {
    // The guard must not delete the restore — arriving any other way
    // still opens what was last open.
    await db.userPrefs.put({ key: 'repertoireActiveTab', value: 'detail' });
    await db.userPrefs.put({ key: 'repertoireSelectedSongId', value: 'song-a' });
    const el = await render();
    expect(el.textContent).toContain('No Weapon');
    expect(
      songCards().some(a => (a.textContent ?? '').includes('Never Would Have Made It')),
      'not on the cards',
    ).toBe(false);
  });
});
