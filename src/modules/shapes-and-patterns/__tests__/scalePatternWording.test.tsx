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
  it('says what the grid is, in the approved sentence', async () => {
    // The old header led with a count — "96 scale patterns across…" —
    // and the count moved to the Progress line, which is the one place
    // a total belongs. The sentence now says what a cell NAMES, which
    // is the change the page is about.
    const el = await render();
    expect(el.textContent ?? '').toContain(
      'Scale patterns across major, natural minor and the two pentatonics. '
      + 'Every cell names where that pattern stands in that key, across left '
      + 'hand, right hand and both hands.',
    );
  });

  it('does not call them cells anywhere the reader can see', async () => {
    const el = await render();
    expect(el.textContent ?? '').not.toMatch(/\d+\s+cells/);
  });

  it('THE TOTAL IS THE CATALOG\'S, AND IS SAID ONCE', async () => {
    // It used to appear twice — in the header and in the summary —
    // which is two places to be wrong. The Progress line carries it,
    // and the trailing "scale patterns" count went with the header.
    //
    // THE SHAPE IS THE APPROVED ONE and the NUMBER moved inside it:
    // both halves count drills, so it is 288 (96 cells × 3 hands)
    // rather than 96. A denominator counting cells under a numerator
    // counting drills is the bug this closes.
    const el = await render();
    const text = el.textContent ?? '';
    const drills = SCALE_CELLS.length * 3;
    expect(text).toMatch(new RegExp(`Progress — \\d+ of ${drills} Fluent\\+`));
    expect(text).not.toContain(`${drills} scale patterns`);
  });

  it('the retired progress words are gone', async () => {
    const text = (await render()).textContent ?? '';
    expect(text).not.toContain('Acquired');
    expect(text).not.toContain('In Progress');
  });
});
