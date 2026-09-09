// @vitest-environment jsdom
/**
 * A song set to sharps used to keep its lead sheet in flats.
 *
 * =====================================================================
 * THE 6 SEP FINDING, CLOSED. `Song.spelling` reached the song's detail
 * page and its matrix — four screens — while twenty-seven files read
 * the GLOBAL setting directly, the grid among them. So the one surface
 * where a chord name is actually read all day ignored the override that
 * exists to change it.
 *
 * Ruling 23 fixes it in the grid rather than at each call site: the
 * HOST resolves the spelling, because "whose opinion wins" is a fact
 * about the thing being drawn, not about the grid. The same change
 * lands for a movement, which is why it is one change and not two.
 *
 * THE ASSERTION NEEDS CONCRETE NOTATION, because that is the mode in
 * which a chord has a note name at all — in numbers the cell reads
 * `b5maj` in either spelling, and a test that passed in numbers mode
 * would be testing nothing.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { DndContext } from '@dnd-kit/core';
import type { ChordPlacement, Song, SongSection } from '../../../lib/db';
import BarGridView from '../BarGridView';
import { db } from '../../../lib/db';
import { setPref } from '../../../lib/userPrefs';
import { NOTATION_PREF_KEY } from '../../../lib/notationPref';
import { SPELLING_PREF_KEY } from '../../../lib/spellingPref';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(async () => {
  await db.userPrefs.clear();
  // Concrete notation, so a chord has a note name to spell.
  await setPref(NOTATION_PREF_KEY, 'concrete');
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  container = null; root = null;
});

const SONG = {
  id: 'song-1', title: 'Test', key: 'C', timeSignature: '4/4',
} as Song;

/** One chord whose name differs between the two spellings. */
const SECTION = {
  id: 'sec-1', songId: 'song-1', name: 'Verse', order: 0, lyrics: '',
  chordPlacements: [{
    id: 'p1', arrangementId: 'basic', barIndex: 0, beatPos: 0, beats: 4,
    chord: { function: 'b5', quality: '' },
  } as ChordPlacement],
} as SongSection;

async function renderWith(spelling?: 'flat' | 'sharp') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <DndContext>
        <BarGridView
          song={SONG}
          section={SECTION}
          activeArrangementId="basic"
          spelling={spelling}
        />
      </DndContext>,
    );
  });
  for (let i = 0; i < 6; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return container!.querySelector('[data-placement-id="p1"]')!.textContent ?? '';
}

describe('BarGridView — the spelling its host resolved', () => {
  it('draws in flats when the host says flats', async () => {
    expect(await renderWith('flat')).toContain('♭');
  });

  it('draws in sharps when the host says sharps', async () => {
    // The assertion the old grid could not pass: a song's own override,
    // honoured on its lead sheet.
    const text = await renderWith('sharp');
    expect(text).toContain('♯');
    expect(text).not.toContain('♭');
  });

  it('falls back to the global when the host has no opinion', async () => {
    // A caller not yet updated reads exactly as it did.
    await setPref(SPELLING_PREF_KEY, 'sharp');
    expect(await renderWith(undefined)).toContain('♯');
  });

  it('and the host beats the global, which is the whole point', async () => {
    await setPref(SPELLING_PREF_KEY, 'sharp');
    expect(await renderWith('flat')).toContain('♭');
  });
});
