// @vitest-environment jsdom
/**
 * The twelve chords of a Circle of 4ths drill.
 *
 * Silas's decision of 14 Sep 2026: C F B♭ E♭ A♭ D♭ G♭ B E A D G with the
 * quality suffix on each, the current one lit, the passed ones tinted,
 * its notes below, one key every Rate interval from C, looping, with the
 * lap counted.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/** The metronome, sounding, with its beat feed in the test's hand. */
const beat = vi.hoisted(() => ({ fire: null as null | (() => void) }));
vi.mock('../../../../lib/metronome', () => ({
  metronome: {
    onBeat: (listener: () => void) => {
      beat.fire = listener;
      return () => { beat.fire = null; };
    },
  },
}));
vi.mock('../../../../lib/useMetronome', () => ({
  useMetronomeState: () => ({ playing: true, bpm: 90 }),
}));

import type { InversionState } from '../../../../lib/db';
import CircleOfFourthsRow from '../CircleOfFourthsRow';
import { circlePosition } from '../circlePosition';

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
});

async function mount(quality: string, inversionState: InversionState, per: number) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <CircleOfFourthsRow
        quality={quality}
        inversionState={inversionState}
        smallLine="Root position · Left hand"
        per={per}
      />,
    );
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
}

const beats = async (n: number) => {
  for (let i = 0; i < n; i += 1) act(() => { beat.fire?.(); });
};
const tiles = () => [...document.body.querySelectorAll('[data-testid="circle-chord"]')];
const current = () => tiles().find(t => t.getAttribute('aria-current') === 'step')?.textContent;
const read = (id: string) => document.body.querySelector(`[data-testid="${id}"]`)?.textContent;

describe('where the drill is', () => {
  it('starts on C and holds it for its beats', () => {
    expect(circlePosition(0, 1)).toEqual({ index: 0, lap: 1 });
    expect(circlePosition(1, 1)).toEqual({ index: 0, lap: 1 });
    expect(circlePosition(2, 1)).toEqual({ index: 1, lap: 1 });
    expect(circlePosition(2, 2)).toEqual({ index: 0, lap: 1 });
    expect(circlePosition(3, 2)).toEqual({ index: 1, lap: 1 });
    expect(circlePosition(5, 4)).toEqual({ index: 1, lap: 1 });
  });

  it('comes round to C again and counts the lap', () => {
    expect(circlePosition(12, 1)).toEqual({ index: 11, lap: 1 });
    expect(circlePosition(13, 1)).toEqual({ index: 0, lap: 2 });
    expect(circlePosition(25, 1)).toEqual({ index: 0, lap: 3 });
    expect(circlePosition(48, 4)).toEqual({ index: 11, lap: 1 });
    expect(circlePosition(49, 4)).toEqual({ index: 0, lap: 2 });
  });
});

describe('the row', () => {
  it('writes all twelve with the suffix, C lit, and its notes below', async () => {
    await mount('min7', 'root', 1);
    expect(tiles().map(t => t.textContent)).toEqual([
      'Cm7', 'Fm7', 'B♭m7', 'E♭m7', 'A♭m7', 'D♭m7', 'G♭m7', 'Bm7', 'Em7', 'Am7', 'Dm7', 'Gm7',
    ]);
    expect(current()).toBe('Cm7');
    expect(read('circle-notes')).toBe('Cm7 · C E♭ G B♭');
    expect(read('circle-small-line')).toBe('Root position · Left hand · lap 1');
  });

  it('moves one key every Rate interval, on the beat, tinting what it passed', async () => {
    await mount('maj', 'inv1', 2);
    await beats(2);
    expect(current()).toBe('C');
    await beats(1);
    expect(current()).toBe('F');
    expect(read('circle-notes')).toBe('F · A C F');
    expect(tiles()[0].className).toContain('bg-fluent/10');
    expect(tiles()[2].className).not.toContain('bg-fluent');
  });

  it('loops until the drill is ended, and says which lap', async () => {
    await mount('maj', 'root', 1);
    await beats(12);
    expect(current()).toBe('G');
    await beats(1);
    expect(current()).toBe('C');
    expect(read('circle-small-line')).toContain('lap 2');
  });
});
