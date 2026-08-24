// @vitest-environment jsdom
/**
 * The cell panel reads the song's spelling.
 *
 * ---------------------------------------------------------------
 * THIS IS THE ASSERTION THAT CATCHES A SILENT LOSS.
 *
 * `CellPanel` replaces `CellInteractionModal`, which carried spelling
 * wiring from the spelling workstream's step 5. A replacement that
 * forgets it breaks NOTHING: the panel renders, the timer runs, the
 * save works — it just shows F# to someone who reads in flats, and
 * nobody notices for weeks. There is no crash to catch and no test
 * that fails on its own.
 *
 * So the assertion is made on the RENDERED TEXT, and in both
 * directions. Asserting only that G♭ appears would pass on a panel
 * that spelled the identity at its source — which would look perfect
 * and quietly rewrite the stored key name everywhere it was used as a
 * lookup. Asserting F# is ABSENT is the half that catches it.
 * ---------------------------------------------------------------
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { Song, SongCell, SongKey, SongMatrixSection } from '../../../../lib/db';
import CellPanel from '../CellPanel';

const NOW = 1_760_000_000_000;

const cell = (): SongCell => ({
  id: 'cell-1', songId: 's1', songKeyId: 'sk-C', sectionId: 'sec-1',
  cellState: 'learning', comfortableAt: null, consecutiveCleanCount: 0,
  lastRunAt: null, lastRunWasClean: null, notes: null,
  lastEngagedAt: null, createdAt: 0, updatedAt: 0,
});

function song(): Song {
  return {
    id: 's1', title: 'Superstar', addedDate: 0, updatedAt: 0, tempo: 100,
  } as Song;
}

/** The identity form, which is what `songKeys.keyName` stores. */
function songKey(): SongKey {
  return {
    id: 'sk-F#', songId: 's1', keyName: 'F#', isOriginalKey: false,
    keyState: 'comfortable', solidAt: null, solidDecayState: null,
    lastDecayCheckAt: null, livedWithSessionCount: 0,
    livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
    isRetestRecommended: false, lastEngagedAt: NOW, createdAt: 0, updatedAt: 0,
  };
}

function section(): SongMatrixSection {
  return {
    id: 'sec-1', songId: 's1', name: 'Chorus', displayOrder: 0,
    isArchived: false, splitFromSectionId: null, createdAt: 0, updatedAt: 0,
  };
}

function render(spelling: 'flat' | 'sharp') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <CellPanel
        song={song()} cell={cell()} siblingCells={[cell()]}
        songKey={songKey()}
        section={section()}
        sections={[section()]}
        spelling={spelling}
        layout="full"
        onLayoutChange={() => {}}
        onClose={() => {}}
        onFinished={() => {}}
      />,
    );
  });
  return {
    text: () => container.textContent ?? '',
    unmount() { act(() => { root.unmount(); }); container.remove(); },
  };
}

beforeEach(() => { localStorage.clear(); });

describe('the panel spells the key it was given', () => {
  it('renders G♭ under a flats spelling, and never the stored F#', () => {
    const r = render('flat');
    expect(r.text()).toContain('G♭');
    // The half that catches a panel spelling its identity at the
    // source rather than at the label.
    expect(r.text()).not.toContain('F#');
    r.unmount();
  });

  it('renders F♯ under a sharps spelling', () => {
    // Guard the guard: a panel that hard-coded G♭ would pass the test
    // above and fail here, and a panel that rendered the raw identity
    // would fail above and pass here for the wrong reason — the ASCII
    // 'F#' is not the sharp sign.
    const r = render('sharp');
    expect(r.text()).toContain('F♯');
    expect(r.text()).not.toContain('G♭');
    r.unmount();
  });
});
