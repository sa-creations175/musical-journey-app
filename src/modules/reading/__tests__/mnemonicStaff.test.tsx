// @vitest-environment jsdom
/**
 * The mnemonic fits inside its own picture.
 *
 * =====================================================================
 * THE TWO THINGS THAT WERE ACTUALLY WRONG, ASSERTED AS INVARIANTS.
 *
 * The bass-clef mnemonic rendered as a stack of overlapping white
 * boxes with fragments of "Boys Do Fine Always" showing through. Two
 * independent arithmetic bugs, neither of them about fonts:
 *
 *   the staff was drawn outside the SVG — `STAVE_Y` was read as the
 *   top line when VexFlow puts four line-spaces above it, so the
 *   bottom row landed 10px past a hardcoded 92px height;
 *
 *   the text was taller than the gap it sat in — 13px letters with
 *   16px backing boxes in a 10px line spacing, so every box covered
 *   part of the row below it.
 *
 * So the assertions are: no two backing boxes overlap, and nothing is
 * drawn past the bottom edge. Both are properties of the rendered SVG,
 * not of the constants, because a test over the constants passes on a
 * component that ignores them.
 *
 * BASS LINES IS THE CASE THAT FAILED — five rows, the most crowded of
 * the four, and the one in the report. The others are covered too;
 * a fix that only worked on one clef is exactly the shape of the bug.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import MnemonicStaff, {
  knockoutBox,
  knockoutHeight,
  svgHeightFor,
  vexLinesForItem,
} from '../MnemonicStaff';
import { mnemonicFor } from '../answerModels';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

interface Drawn {
  svg: SVGSVGElement;
  height: number;
  boxes: Array<{ y: number; height: number; bottom: number }>;
  baselines: number[];
}

async function draw(clef: 'treble' | 'bass', position: number): Promise<Drawn> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<MnemonicStaff mnemonic={mnemonicFor(clef, position)} />);
  });

  /* VexFlow arrives through a dynamic import, so the draw happens some
     unknown number of microtasks after the render. A single tick is
     enough when the module is warm and is NOT enough on the first test
     to touch it under a full-suite run — which made this fail only in
     CI-shaped conditions, the worst kind of flake. Poll for the thing
     being asserted rather than guessing how long it takes. */
  let svg: SVGSVGElement | null = null;
  for (let i = 0; i < 200 && !svg; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    svg = container.querySelector('svg');
  }
  if (!svg) throw new Error('no svg rendered');
  const boxes = [...svg.querySelectorAll('[data-knockout]')].map(r => {
    const y = Number(r.getAttribute('y'));
    const height = Number(r.getAttribute('height'));
    return { y, height, bottom: y + height };
  });
  const baselines = [...svg.querySelectorAll('text')]
    .map(t => Number(t.getAttribute('y')))
    .filter(n => Number.isFinite(n));
  return {
    svg,
    height: Number(svg.getAttribute('height')),
    boxes,
    baselines,
  };
}

/** Every (clef, kind) the drill can show — lines and spaces, both
 *  staves. Position 0 is a line and 1 is the first space. */
const CASES: ReadonlyArray<['treble' | 'bass', number, string]> = [
  ['bass', 0, 'bass lines'],
  ['bass', 1, 'bass spaces'],
  ['treble', 0, 'treble lines'],
  ['treble', 1, 'treble spaces'],
];

describe('nothing is drawn past the bottom edge', () => {
  for (const [clef, position, label] of CASES) {
    it(`${label}: every row is inside the viewport`, async () => {
      const d = await draw(clef, position);
      expect(d.height).toBeGreaterThan(0);
      for (const box of d.boxes) {
        expect(box.y, `${label} box top`).toBeGreaterThanOrEqual(0);
        expect(box.bottom, `${label} box bottom vs height ${d.height}`)
          .toBeLessThanOrEqual(d.height);
      }
      for (const baseline of d.baselines) {
        expect(baseline, `${label} text baseline vs height ${d.height}`)
          .toBeLessThanOrEqual(d.height);
      }
    });
  }
});

describe('no two rows collide', () => {
  for (const [clef, position, label] of CASES) {
    it(`${label}: backing boxes do not overlap`, async () => {
      const d = await draw(clef, position);
      // A row's letter and word are different sizes, so they share a
      // BOTTOM (baseline + 4, whatever the size) and not a top. Group
      // on the bottom, then require the rows to be disjoint.
      const byRow = new Map<number, { top: number; bottom: number }>();
      for (const box of d.boxes) {
        const row = byRow.get(box.bottom);
        byRow.set(box.bottom, {
          top: Math.min(row?.top ?? box.y, box.y),
          bottom: box.bottom,
        });
      }
      const rows = [...byRow.values()].sort((a, b) => a.top - b.top);
      expect(rows.length, `${label} row count`).toBeGreaterThan(1);
      for (let i = 1; i < rows.length; i++) {
        expect(
          rows[i].top - rows[i - 1].bottom,
          `${label} gap between rows ${i - 1} and ${i}`,
        ).toBeGreaterThanOrEqual(0);
      }
    });
  }
});

describe('the geometry helpers say what the drawing does', () => {
  it('a knockout box is taller than its text, so a line cannot strike through', () => {
    expect(knockoutHeight(14)).toBeGreaterThan(14);
    const box = knockoutBox(100, 14, 5);
    expect(box.y).toBe(86);
    expect(box.height).toBe(18);
    expect(box.y + box.height).toBeGreaterThan(100);
  });

  it('THE HEIGHT IS DERIVED FROM THE STAFF, not written down', () => {
    // The bug was a constant that did not follow the stave. Moving the
    // bottom line must move the height with it.
    expect(svgHeightFor(200)).toBeGreaterThan(svgHeightFor(100));
    expect(svgHeightFor(200) - svgHeightFor(100)).toBe(100);
    // And it must clear the lowest box, which is the clipping bug.
    const lowest = knockoutBox(114 + 5, 14, 1);
    expect(svgHeightFor(114)).toBeGreaterThanOrEqual(lowest.y + lowest.height);
  });

  it('items run bottom-to-top against VexFlow top-down lines', () => {
    // An inverted mnemonic is the one error here that looks plausible.
    expect(vexLinesForItem('line', 0)).toEqual([4]);
    expect(vexLinesForItem('line', 4)).toEqual([0]);
    expect(vexLinesForItem('space', 0)).toEqual([4, 3]);
  });
});
