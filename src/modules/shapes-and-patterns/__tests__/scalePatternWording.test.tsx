// @vitest-environment jsdom
/**
 * The scales matrix names what it is counting.
 *
 * =====================================================================
 * "CELLS" WAS A WORD ABOUT THE GRID, not about the music. There are 48
 * scales here; the other 48 are the same pitch sets entered from a
 * different starting point, which is why they are separate patterns to
 * learn rather than repeats of ones already counted.
 *
 * THE COUNT IS THE CATALOG'S. It was typed as `96` in the header,
 * which is right today and silently wrong the first time a scale is
 * added — so this asserts against `SCALE_CELLS` rather than a number.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ScaleDrills from '../ScaleDrills';
import { SCALE_CELLS } from '../scaleSkills';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null; host = null;
});

async function render() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<ScaleDrills />); });
  for (let i = 0; i < 8; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return host!;
}

describe('what the matrix calls its contents', () => {
  it('says scale patterns, and says how many from the catalog', async () => {
    const el = await render();
    const text = el.textContent ?? '';
    expect(text).toContain(`${SCALE_CELLS.length} scale patterns`);
  });

  it('does not call them cells anywhere the reader can see', async () => {
    const el = await render();
    expect(el.textContent ?? '').not.toMatch(/\d+\s+cells/);
  });

  it('counts the same number in the summary as the catalog holds', async () => {
    // The Progress line's total and the header's count are the same
    // fact; a fixture where they differ is the bug this pins.
    const el = await render();
    const occurrences = (el.textContent ?? '')
      .match(new RegExp(`${SCALE_CELLS.length} scale patterns`, 'g')) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});
