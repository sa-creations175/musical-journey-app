// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import CellAnchoredMessage from '../CellAnchoredMessage';
import { OVERLAY_MAX_W } from '../leadSheetOverlay';

// The gap these close: the geometry was pure and well covered, but
// "given a position, does an element carrying the message actually
// appear, visible, with that position applied" was not tested at all —
// and that is exactly the shape of a silently-missing-overlay
// regression. jsdom is an existing devDependency and is already used
// by other tests via this pragma, so no infrastructure was added.
//
// jsdom does no layout, so these assert what is asserted honestly:
// presence, text, and the inline style actually written to the node.
// They cannot prove the box is visible on a real screen.

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(ui);
  });
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('CellAnchoredMessage', () => {
  it('renders its message into the document', () => {
    render(
      <CellAnchoredMessage left={120} top={340} z={190}>
        Can&apos;t place here — syllables must stay in order.
      </CellAnchoredMessage>,
    );
    const el = document.querySelector('[data-cell-message]');
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain('syllables must stay in order');
  });

  it('applies the computed position to the node', () => {
    render(
      <CellAnchoredMessage left={120} top={340} z={190}>
        hi
      </CellAnchoredMessage>,
    );
    const el = document.querySelector('[data-cell-message]') as HTMLElement;
    expect(el.style.left).toBe('120px');
    expect(el.style.top).toBe('340px');
    expect(el.style.zIndex).toBe('190');
  });

  it('caps width rather than fixing it, so content wraps', () => {
    // A fixed width plus truncation is what clipped the line-end
    // prompt to "tap the beat wher…".
    render(
      <CellAnchoredMessage left={0} top={0} z={190}>
        a very long message that would otherwise need more room
      </CellAnchoredMessage>,
    );
    const el = document.querySelector('[data-cell-message]') as HTMLElement;
    expect(el.style.maxWidth).toBe(`${OVERLAY_MAX_W}px`);
    expect(el.style.width).toBe('');
    expect(el.className).not.toContain('truncate');
  });

  it('renders at the origin without collapsing — 0 is a position, not absent', () => {
    // `left={0}` must not be treated as falsy anywhere in the chain.
    render(
      <CellAnchoredMessage left={0} top={0} z={1}>
        edge
      </CellAnchoredMessage>,
    );
    const el = document.querySelector('[data-cell-message]') as HTMLElement;
    expect(el.style.left).toBe('0px');
    expect(el.style.top).toBe('0px');
  });

  it('passes taps through by default so it cannot block a cell', () => {
    render(
      <CellAnchoredMessage left={0} top={0} z={190}>
        msg
      </CellAnchoredMessage>,
    );
    const el = document.querySelector('[data-cell-message]') as HTMLElement;
    expect(el.className).toContain('pointer-events-none');
  });

  it('marks itself an arming surface only when asked', () => {
    render(
      <CellAnchoredMessage left={0} top={0} z={180} armKeep>
        <button type="button">cancel</button>
      </CellAnchoredMessage>,
    );
    const el = document.querySelector('[data-cell-message]') as HTMLElement;
    // Without this the document dismiss listener fires on pointerdown,
    // before the button's click ever runs.
    expect(el.hasAttribute('data-lyric-arm-keep')).toBe(true);
    expect(el.querySelector('button')).not.toBeNull();
  });

  it('is not an arming surface by default', () => {
    render(
      <CellAnchoredMessage left={0} top={0} z={190}>
        msg
      </CellAnchoredMessage>,
    );
    const el = document.querySelector('[data-cell-message]') as HTMLElement;
    expect(el.hasAttribute('data-lyric-arm-keep')).toBe(false);
  });

  it('announces itself to assistive tech', () => {
    render(
      <CellAnchoredMessage left={0} top={0} z={190}>
        msg
      </CellAnchoredMessage>,
    );
    const el = document.querySelector('[data-cell-message]') as HTMLElement;
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
  });
});
