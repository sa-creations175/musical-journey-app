// @vitest-environment jsdom
/**
 * Which hand a cell tap drills.
 *
 * =====================================================================
 * WHAT THIS PROVES: that a tap asks before it drills, that each option
 * reports the hand's own state from the same buckets the cell's bands
 * draw, and that each choice hands the modal the hands it asked for —
 * "All Three" being today's left → right → both walk.
 *
 * WHAT IT CANNOT: how the four options sit at any width. jsdom has no
 * layout engine — that needs Silas's eye.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import HandChooser from '../HandChooser';
import { HAND_ORDER, handsFor } from '../acquisition';
import type { DrillHand } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
});

function render() {
  const chosen: Array<readonly DrillHand[]> = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <HandChooser
        title="C Major Scale"
        hands={{ left: 'acquired', right: 'in-progress', both: 'not-started' }}
        cell="in-progress"
        onChoose={hands => { chosen.push(hands); }}
        onClose={() => {}}
      />,
    );
  });
  return chosen;
}

const option = (id: string) =>
  document.querySelector(`[data-testid="hand-choice-${id}"]`) as HTMLButtonElement;

describe('the chooser', () => {
  it('offers the three hands and the walk, in drill order', () => {
    render();
    const labels = [...document.querySelectorAll('[data-testid^="hand-choice-"]')]
      .map(b => b.querySelector('span')!.textContent);
    expect(labels).toEqual(['Left Hand', 'Right Hand', 'Both Hands', 'All Three']);
  });

  it('reports each hand’s own state', () => {
    // Read from the same buckets the cell's three bands are drawn
    // from — the answer to "which hand should I do" was already on the
    // cell, only as three coloured stripes.
    render();
    expect(option('left').getAttribute('data-bucket')).toBe('acquired');
    expect(option('right').getAttribute('data-bucket')).toBe('in-progress');
    expect(option('both').getAttribute('data-bucket')).toBe('not-started');
    expect(option('left').textContent).toContain('acquired');
    expect(option('both').textContent).toContain('not started');
  });

  it('shows the CELL’s state under All Three, not a fourth hand’s', () => {
    render();
    expect(option('all').getAttribute('data-bucket')).toBe('in-progress');
  });

  it('asks for one hand, and only that hand', () => {
    const chosen = render();
    act(() => { option('right').click(); });
    expect(chosen).toEqual([['right']]);
  });

  it('asks for the whole walk under All Three', () => {
    // Which is exactly what a cell tap used to do without asking.
    const chosen = render();
    act(() => { option('all').click(); });
    expect(chosen).toEqual([HAND_ORDER]);
  });
});

describe('which cells get one', () => {
  it('is the ones with a hand dimension, and nothing else', () => {
    // Mental visualisation has no hands; voice leading is two-handed
    // by nature and only ever writes `both`. A chooser on either would
    // be a menu with one real option.
    expect(handsFor('scale:major:C').length).toBeGreaterThan(1);
    expect(handsFor('chord-shape:maj7:C:root').length).toBeGreaterThan(1);
    expect(handsFor('vl:aba-251:Bb')).toEqual(['both']);
    expect(handsFor('mv:cluster-1')).toEqual(['both']);
  });
});
