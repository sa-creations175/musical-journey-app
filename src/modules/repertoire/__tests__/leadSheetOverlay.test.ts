import { describe, expect, it } from 'vitest';
import {
  anchoredOverlayPosition,
  type AnchorRect,
  type OverlayGeometry,
} from '../leadSheetOverlay';

const VIEWPORT = { width: 400, height: 800 };
const BOX = { width: 232, height: 30 };
const GAP = 6;
const PAD = 8;

function cell(top: number, left = 150, height = 28, width = 40): AnchorRect {
  return { left, top, right: left + width, bottom: top + height, width };
}

function place(overrides: Partial<OverlayGeometry> = {}) {
  return anchoredOverlayPosition({
    cell: cell(400),
    viewport: VIEWPORT,
    box: BOX,
    gap: GAP,
    edgePad: PAD,
    ...overrides,
  });
}

describe('anchoredOverlayPosition — visible anchor', () => {
  it('floats above the cell by default', () => {
    const p = place({ cell: cell(400) });
    expect(p.placement).toBe('above');
    expect(p.top).toBe(400 - BOX.height - GAP);
  });

  it('centres horizontally on the cell', () => {
    const p = place({ cell: cell(400, 150, 28, 40) });
    // cell centre 170 → box left 170 - 116 = 54
    expect(p.left).toBe(54);
  });

  it('flips below when there is no room above', () => {
    const c = cell(10);
    const p = place({ cell: c });
    expect(p.placement).toBe('below');
    expect(p.top).toBe(c.bottom + GAP);
  });

  it('falls back to the bottom edge when neither side fits', () => {
    // A viewport barely taller than the box: nothing fits either side.
    const p = place({
      cell: cell(20),
      viewport: { width: 400, height: 60 },
    });
    expect(p.placement).toBe('bottom-edge');
    expect(p.top).toBe(60 - BOX.height - PAD);
  });
});

describe('anchoredOverlayPosition — horizontal clamping', () => {
  it('never runs off the left edge', () => {
    const p = place({ cell: cell(400, 0, 28, 20) });
    expect(p.left).toBe(PAD);
  });

  it('never runs off the right edge', () => {
    const p = place({ cell: cell(400, 380, 28, 20) });
    expect(p.left).toBe(VIEWPORT.width - BOX.width - PAD);
  });

  it('survives a viewport narrower than the box', () => {
    // Upper bound would go negative without the Math.max guard, pushing
    // the overlay off the opposite edge.
    const p = place({ cell: cell(400, 10), viewport: { width: 100, height: 800 } });
    expect(p.left).toBe(PAD);
  });
});

describe('anchoredOverlayPosition — anchor scrolled out of view', () => {
  // The case the line-end prompt exists to survive: the prompt carries
  // the only cancel control, so it must never leave with its anchor.

  it('sticks to the top edge when the cell has scrolled above', () => {
    const p = place({ cell: cell(-200) });
    expect(p.placement).toBe('top-edge');
    expect(p.top).toBe(PAD);
  });

  it('sticks to the bottom edge when the cell has scrolled below', () => {
    const p = place({ cell: cell(900) });
    expect(p.placement).toBe('bottom-edge');
    expect(p.top).toBe(VIEWPORT.height - BOX.height - PAD);
  });

  it('keeps tracking the anchor COLUMN while stuck', () => {
    // x stays meaningful when only y has scrolled away, so the prompt
    // doesn't jump sideways at the moment it sticks.
    const near = place({ cell: cell(20, 300, 28, 40) });
    const gone = place({ cell: cell(-200, 300, 28, 40) });
    expect(gone.left).toBe(near.left);
  });

  it('treats a partially visible cell as visible', () => {
    // Half off the top is still something to point at.
    const p = place({ cell: cell(-10, 150, 28) });
    expect(p.placement).not.toBe('top-edge');
  });

  it('pins to the bottom edge when there is no anchor at all', () => {
    // A vanished prompt takes its cancel control with it, so null
    // parks rather than hides.
    const p = place({ cell: null });
    expect(p.placement).toBe('bottom-edge');
    expect(p.top).toBe(VIEWPORT.height - BOX.height - PAD);
    expect(p.left).toBe(Math.round((VIEWPORT.width - BOX.width) / 2));
  });
});

describe('anchoredOverlayPosition — never leaves the viewport', () => {
  it('keeps the box inside the viewport for anchors all the way down', () => {
    for (let top = -400; top <= 1200; top += 17) {
      const p = place({ cell: cell(top) });
      expect(p.top).toBeGreaterThanOrEqual(PAD);
      expect(p.top).toBeLessThanOrEqual(VIEWPORT.height - BOX.height - PAD);
      expect(p.left).toBeGreaterThanOrEqual(PAD);
      expect(p.left).toBeLessThanOrEqual(VIEWPORT.width - BOX.width - PAD);
    }
  });

  it('holds on a short phone viewport too', () => {
    const viewport = { width: 360, height: 640 };
    for (let top = -300; top <= 900; top += 13) {
      const p = anchoredOverlayPosition({
        cell: cell(top, 40),
        viewport,
        box: BOX,
        gap: GAP,
        edgePad: PAD,
      });
      expect(p.top).toBeGreaterThanOrEqual(PAD);
      expect(p.top + BOX.height).toBeLessThanOrEqual(viewport.height - PAD);
    }
  });
});
