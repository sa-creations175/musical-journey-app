// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import KeyRow from '../KeyRow';
import { FLAT_SIGN, SHARP_SIGN, type Spelling } from '../../../../lib/spelling';
import type { SongKey, SongMatrixSection } from '../../../../lib/db';

/**
 * The matrix reads a spelling, and keeps its identities (step 5).
 *
 * WHY THIS IS A RENDER TEST. Everywhere else in this workstream the
 * risk was a string builder, which a unit test covers. Here the risk is
 * structural: `KeyRow` receives ONE string and has to use it two ways —
 * as the identity behind lookups and React keys, and as a label to be
 * re-spelled. Getting that backwards gives you a grid that looks
 * perfect and addresses the wrong rows. Only rendering shows which
 * happened.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(ui: React.ReactElement): HTMLDivElement {
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

const NOW = 1_700_000_000_000;

function songKey(keyName: string): SongKey {
  return {
    id: 'sk-1',
    songId: 'song-1',
    keyName,
    isOriginalKey: false,
    keyState: 'learning',
    solidAt: null,
    solidDecayState: null,
    lastDecayCheckAt: null,
    livedWithSessionCount: 0,
    livedWithFirstSessionAt: null,
    livedWithWindowStartAt: null,
    livedWithSessionsInWindow: 0,
    wholeSongTestPassedAt: null,
    isRetestRecommended: false,
    lastEngagedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const NO_SECTIONS: SongMatrixSection[] = [];

function renderRow(spelling: Spelling, keyName: string, key = songKey(keyName)) {
  return render(
    <KeyRow
      keyName={keyName}
      spelling={spelling}
      songKey={key}
      sections={NO_SECTIONS}
      cellsBySectionId={new Map()}
      isOriginal={false}
      now={NOW}
    />,
  );
}

describe('the key column reads the spelling', () => {
  it('renders the stored F# as G♭ under the flats default', () => {
    const el = renderRow('flat', 'F#');
    expect(el.textContent).toContain(`G${FLAT_SIGN}`);
    expect(el.textContent).not.toContain('F#');
  });

  it('renders it as F♯ under sharps — the sign, not the ASCII hash', () => {
    const el = renderRow('sharp', 'F#');
    expect(el.textContent).toContain(`F${SHARP_SIGN}`);
    expect(el.textContent).not.toContain('F#');
  });

  it('leaves a natural key alone in both spellings', () => {
    for (const spelling of ['flat', 'sharp'] as Spelling[]) {
      const el = renderRow(spelling, 'C');
      expect(el.textContent, spelling).toContain('C');
      act(() => root?.unmount());
      container?.remove();
    }
  });

  it('puts no ASCII accidental on screen, for any black key, either way', () => {
    // The uppercase transform that turned 'Bb' into 'BB' is gone from
    // the grids. This is the property that made removing it safe,
    // rather than a comment promising it stays gone.
    for (const spelling of ['flat', 'sharp'] as Spelling[]) {
      for (const k of ['Db', 'Eb', 'F#', 'Ab', 'Bb']) {
        const el = renderRow(spelling, k);
        expect(el.textContent, `${k} under ${spelling}`).not.toMatch(/[A-G][b#]/);
        act(() => root?.unmount());
        container?.remove();
      }
    }
  });
});

/**
 * THE HALF THAT MUST NOT MOVE.
 *
 * `keyName` is a lookup value — `songKeysByName.get(keyName)` upstream
 * in MatrixGrid, the row's React key, and the id every cell hangs off.
 * A "fix" that re-spelled it at the source rather than at the label
 * would satisfy every assertion above and quietly address other rows.
 */
describe('the identity does not move', () => {
  it('shows two different names for one unchanged stored row', () => {
    const key = songKey('Bb');

    const flat = renderRow('flat', 'Bb', key);
    expect(flat.textContent).toContain(`B${FLAT_SIGN}`);
    act(() => root?.unmount());
    container?.remove();

    const sharp = renderRow('sharp', 'Bb', key);
    expect(sharp.textContent).toContain(`A${SHARP_SIGN}`);

    // Same object, rendered twice, two readings — and the stored name
    // is what it always was.
    expect(key.keyName, 'rendering rewrote the stored key name').toBe('Bb');
    expect(key.id).toBe('sk-1');
  });
});
