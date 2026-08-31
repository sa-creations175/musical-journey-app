// @vitest-environment jsdom
/**
 * The dropped-status banner.
 *
 * Ten lines of explanation sat above the matrix and pushed the song's
 * own title off the screen. The headline is the news; the four
 * quadrants and their holders are the working, and working is
 * something you ask for.
 */
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import DemotionNotice from '../DemotionNotice';

const demotion = {
  from: 'learning', to: 'started', at: Date.UTC(2026, 7, 28),
  criterionLabel: 'A criterion', detail: '',
  heldByQuadrant: [null, null, null, null],
  lapsedKeys: [],
} as never;

function render() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(<DemotionNotice demotion={demotion} spelling="flat" />); });
  return {
    text: () => (host.textContent ?? '').replace(/\s+/g, ' ').trim(),
    toggle: () => {
      const b = host.querySelector('button');
      act(() => { b?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    },
    unmount: () => { act(() => { root.unmount(); }); host.remove(); },
  };
}

describe('it opens closed', () => {
  it('shows the headline and nothing else', () => {
    const r = render();
    expect(r.text()).toContain('This song dropped from');
    expect(r.text()).not.toContain('none held');
    expect(r.text()).not.toContain('four quadrants');
    r.unmount();
  });

  it('AND REVEALS THE WORKING ON REQUEST', () => {
    const r = render();
    r.toggle();
    expect(r.text()).toContain('none held');
    expect(r.text()).toContain('four quadrants');
    r.unmount();
  });

  it('and closes again', () => {
    const r = render();
    r.toggle();
    r.toggle();
    expect(r.text()).not.toContain('none held');
    r.unmount();
  });
});
