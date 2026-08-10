import { describe, expect, it } from 'vitest';
import {
  MIN_SUPPORTED_VIEWPORT_W,
  OVERLAY_EDGE_PAD,
  OVERLAY_GAP,
  OVERLAY_H,
  OVERLAY_MAX_W,
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
  it('floats BELOW the cell by default', () => {
    // Above would put the box over the chord row for that bar, and the
    // chord is what the lyric is being placed against.
    const c = cell(400);
    const p = place({ cell: c });
    expect(p.placement).toBe('below');
    expect(p.top).toBe(c.bottom + GAP);
  });

  it('flips above when there is no room below', () => {
    const c = cell(740);
    const p = place({ cell: c });
    expect(p.placement).toBe('above');
    expect(p.top).toBe(c.top - BOX.height - GAP);
  });

  it('centres horizontally on the cell', () => {
    const p = place({ cell: cell(400, 150, 28, 40) });
    // cell centre 170 → box left 170 - 116 = 54
    expect(p.left).toBe(54);
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

describe('overlay box sizing — wrap, never clip', () => {
  // Wrapping itself is CSS and needs a DOM. What IS testable here is
  // the invariant that makes wrapping SUFFICIENT: a box that can never
  // need to be wider than the narrowest supported screen. Without it,
  // a long message on a small phone would have nowhere to wrap TO and
  // would clip regardless of the CSS.
  it('fits the narrowest supported viewport with padding on both sides', () => {
    expect(OVERLAY_MAX_W + OVERLAY_EDGE_PAD * 2).toBeLessThanOrEqual(
      MIN_SUPPORTED_VIEWPORT_W,
    );
  });

  it('budgets two wrapped lines, not one', () => {
    // 11px text at leading-tight is ~14px per line; py-1 adds 8.
    // A one-line budget is what made the refusal message sit lower
    // than the geometry believed and clip into its own anchor cell.
    const LINE = 14;
    const VERTICAL_PADDING = 8;
    expect(OVERLAY_H).toBeGreaterThanOrEqual(LINE * 2 + VERTICAL_PADDING);
  });

  it('stays modest enough to leave the anchor cell aimable', () => {
    // A very wide box covers the cells being aimed at; a very tall one
    // covers whole rows. Guards against either creeping upward.
    expect(OVERLAY_MAX_W).toBeLessThanOrEqual(280);
    expect(OVERLAY_H).toBeLessThanOrEqual(56);
  });

  it('places the real box inside a 320px viewport at every anchor', () => {
    const viewport = { width: MIN_SUPPORTED_VIEWPORT_W, height: 568 };
    const box = { width: OVERLAY_MAX_W, height: OVERLAY_H };
    for (let top = -200; top <= 800; top += 11) {
      for (const left of [0, 40, 160, 300]) {
        const p = anchoredOverlayPosition({
          cell: { left, top, right: left + 40, bottom: top + 28, width: 40 },
          viewport,
          box,
          gap: OVERLAY_GAP,
          edgePad: OVERLAY_EDGE_PAD,
        });
        expect(p.left).toBeGreaterThanOrEqual(OVERLAY_EDGE_PAD);
        expect(p.left + box.width).toBeLessThanOrEqual(
          viewport.width - OVERLAY_EDGE_PAD,
        );
        expect(p.top).toBeGreaterThanOrEqual(OVERLAY_EDGE_PAD);
        expect(p.top + box.height).toBeLessThanOrEqual(
          viewport.height - OVERLAY_EDGE_PAD,
        );
      }
    }
  });
});
