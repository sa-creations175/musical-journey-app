// @vitest-environment jsdom
/**
 * The voice-leading page IS the movements page, and nothing about it
 * changed.
 *
 * =====================================================================
 * A PAGE THAT MOVES IS A PAGE SOMEBODY HAS BOOKMARKED. Ruling 19 makes
 * the 1 4 7 3 6 2 5 1 grid one of Chord Movements & Passes; the
 * requirement attached to it is "no behaviour change", and the risk in
 * a move like this is entirely in what is left behind — an address in
 * someone's history, a link written somewhere that was not updated.
 *
 * There are TWO old addresses now: the original `/voice-leading`, and
 * the one it wore for a few hours under `/movements/voice-leading`.
 * Both still land, and `shapesSectionPath` is still the only thing that
 * knows which address is current.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ShapesAndPatternsSection from '../../ShapesAndPatternsSection';
import { MOVEMENTS_PATH, shapesSectionPath } from '../../sectionRoutes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

function Probe() {
  return <span data-testid="at" data-path={useLocation().pathname} />;
}

/** The routes exactly as `App.tsx` declares them, in the same order. */
async function renderAt(path: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <Routes>
          <Route
            path="/shapes-and-patterns/movements"
            element={<ShapesAndPatternsSection section="voice-leading" />}
          />
          <Route
            path="/shapes-and-patterns/movements/voice-leading"
            element={<Navigate to="/shapes-and-patterns/movements" replace />}
          />
          <Route
            path="/shapes-and-patterns/movements/:movementId"
            element={<span data-testid="a-movement" />}
          />
          <Route
            path="/shapes-and-patterns/voice-leading"
            element={<Navigate to="/shapes-and-patterns/movements" replace />}
          />
          <Route path="/shapes-and-patterns" element={<span data-testid="module-home" />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 12; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return container!;
}

const at = () =>
  container!.querySelector('[data-testid="at"]')!.getAttribute('data-path');

describe('where voice leading lives now', () => {
  it('is one address, and only `shapesSectionPath` knows it', () => {
    expect(shapesSectionPath('voice-leading')).toBe(MOVEMENTS_PATH);
    // The other three did not move.
    expect(shapesSectionPath('scales')).toBe('/shapes-and-patterns/scales');
    expect(shapesSectionPath('mental-viz')).toBe('/shapes-and-patterns/mental-viz');
  });

  it('renders the same section page it always did', async () => {
    const el = await renderAt(MOVEMENTS_PATH);
    expect(el.querySelector('[data-testid="shapes-section-page"]')!
      .getAttribute('data-section')).toBe('voice-leading');
  });

  it('is not read as a movement id', async () => {
    // The static segment is declared above `:movementId`. Without that
    // ordering, opening the grid would open an empty movement instead.
    const el = await renderAt(`${MOVEMENTS_PATH}/voice-leading`);
    expect(el.querySelector('[data-testid="a-movement"]')).toBeNull();
  });

  it('still lands from both addresses it used to have', async () => {
    for (const old of [
      '/shapes-and-patterns/voice-leading',
      `${MOVEMENTS_PATH}/voice-leading`,
    ]) {
      const el = await renderAt(old);
      expect(at(), old).toBe(MOVEMENTS_PATH);
      expect(el.querySelector('[data-testid="shapes-section-page"]')!
        .getAttribute('data-section')).toBe('voice-leading');
      await act(async () => root!.unmount());
      container!.remove();
      root = null; container = null;
    }
  });
});
