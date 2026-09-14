// @vitest-environment jsdom
/**
 * Hear it says what it plays (Silas, 13 Sep 2026; walked in
 * `hear-it-prototype.html`).
 *
 * The bars are named from the data the sound is built from; the one
 * playing lights, the ones passed dim; the now line says what is
 * sounding; the keyboard lights the played note green or orange and the
 * held chord pale; Stop clears it all; "Chord under the run" moves the
 * held chords an octave down for the next play. The lights come from the
 * player's own events, so these drive those events directly.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const prefs = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../../../lib/userPrefs', () => ({
  getPref: async (key: string, fallback: unknown) => (prefs.has(key) ? prefs.get(key) : fallback),
  setPref: async (key: string, value: unknown) => { prefs.set(key, value); },
}));

interface Played {
  context: string;
  opts: { chordShift?: number; events?: Record<string, (...args: never[]) => void> };
}
const plays = vi.hoisted(() => ({ list: [] as Played[], stops: 0 }));
vi.mock('../playCardSound', () => ({
  CARD_AUDIO_MODULE: 'harmonic-fluency',
  playCardSound: (_sound: unknown, context: string, opts: Played['opts']) => {
    plays.list.push({ context, opts });
    return Promise.resolve({ stop: () => { plays.stops += 1; } });
  },
}));

import CardPlayback from '../CardPlayback';
import { FLASHCARDS } from '../catalog';
import { cardSound } from '../cardAudio';
import { soundBars } from '../cardBars';
import { modalCardId } from '../modalImprovisation';
import { paintOnAudioClock } from '../../../lib/audio';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/** "In the key of C major, the band is on E7 (5 of 6)." */
const FIVE_OF_SIX = FLASHCARDS.find(c => c.id === modalCardId('5of6', 'C'))!;
const PROGRESSION = FLASHCARDS.find(c => c.id === 'pr-prog-2-5-1-Eb')!;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => { plays.list.length = 0; plays.stops = 0; prefs.clear(); });
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 10)); });

async function render(card = FIVE_OF_SIX) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(<CardPlayback card={card} />); });
  await settle();
  return container;
}

const q = (id: string) => container!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const key = (midi: number) => container!.querySelector(`rect[data-midi="${midi}"]`)!;
const lastEvents = () => plays.list[plays.list.length - 1].opts.events!;
const fire = (name: string, ...args: unknown[]) => act(() => {
  (lastEvents()[name] as (...a: unknown[]) => void)(...args);
});

describe('the bars are named from the sound', () => {
  it('Modal Improvisation, 5 of 6 in C: home, the dominant over A melodic minor, the landing, home', () => {
    const bars = soundBars(cardSound(FIVE_OF_SIX)!, 'singleNote', 'flat');
    expect(bars.map(b => b.name)).toEqual(['C', 'E7', 'Am', 'C']);
    expect(bars.map(b => b.detail)).toEqual([
      'C major, from C', 'A melodic minor, from E', 'A natural minor, from A', 'C major, home',
    ]);
    expect(bars.map(b => b.outside)).toEqual([false, true, false, false]);
    expect(bars[1].noteNames).toEqual(['E', 'F♯', 'G♯', 'A', 'B', 'C', 'D', 'E']);
  });

  it('a progression: its orienting chord, then each chord as the reader names it', () => {
    const bars = soundBars(cardSound(PROGRESSION)!, 'singleNote', 'flat');
    expect(bars[0]).toMatchObject({ lane: 'orient', detail: 'home', name: 'E♭' });
    expect(bars.slice(1).map(b => b.name)).toEqual(['Fm7', 'B♭7', 'E♭maj7']);
    // With priming off, the orienting chord does not play, so it is not a bar.
    expect(soundBars(cardSound(PROGRESSION)!, 'none', 'flat')[0].lane).toBe('steps');
  });
});

describe('the strip, as it plays', () => {
  it('before playing, names every bar and says how to start', async () => {
    await render();
    expect([0, 1, 2, 3].map(i => q(`hear-bar-${i}`)!.textContent)).toEqual([
      'CC major, from C', 'E7A melodic minor, from E', 'AmA natural minor, from A', 'CC major, home',
    ]);
    expect(q('hear-now')!.textContent).toBe("Press Hear it. The bar you're in lights up here and on the keys below.");
    expect(q('hear-bar-1')!.getAttribute('data-outside')).toBe('true');
  });

  it('lights the bar and the keys from the player\'s own events, and says what is sounding', async () => {
    await render();
    await act(async () => { q('card-play')!.click(); });
    await settle();
    // The E7 under the run (lane step 2), and G♯, the third note of its run (step 11).
    fire('onUnder', 2);
    fire('onStep', 11);
    expect(q('hear-bar-1')!.getAttribute('data-state')).toBe('on');
    expect(q('hear-bar-0')!.getAttribute('data-state')).toBe('done');
    expect(q('hear-now')!.textContent).toBe('E7 · A melodic minor from E · playing G♯ (not in C major)');
    // G♯5 played, orange; the E7 held under it, pale green.
    expect(key(80).getAttribute('fill')).toBe('#F0722B');
    for (const m of [52, 64, 68, 71, 74]) expect(key(m).getAttribute('fill'), String(m)).toBe('#A7DCC6');
  });

  it('Stop clears every light and every chip; the end says so', async () => {
    await render();
    await act(async () => { q('card-play')!.click(); });
    await settle();
    fire('onUnder', 2);
    fire('onStep', 11);
    await act(async () => { q('card-stop')!.click(); });
    expect(plays.stops).toBeGreaterThan(0);
    expect(q('hear-now')!.textContent).toBe('Stopped.');
    expect(container!.querySelectorAll('rect[data-mark="marked"]')).toHaveLength(0);
    expect([0, 1, 2, 3].every(i => q(`hear-bar-${i}`)!.getAttribute('data-state') === 'idle')).toBe(true);

    await act(async () => { q('card-play')!.click(); });
    await settle();
    fire('onStep', 0);
    fire('onDone');
    expect(q('hear-now')!.textContent).toBe('Done. Press Hear it to play it again.');
    expect(container!.querySelectorAll('rect[data-mark="marked"]')).toHaveLength(0);
  });

  it('draws the board from C2 to C7', async () => {
    await render();
    expect(container!.querySelectorAll('rect[data-midi="36"]')).toHaveLength(1);
    expect(container!.querySelectorAll('rect[data-midi="35"]')).toHaveLength(0);
    expect(container!.querySelectorAll('rect[data-midi="96"]')).toHaveLength(1);
    expect(container!.querySelectorAll('rect[data-midi="97"]')).toHaveLength(0);
  });
});

describe('Chord under the run', () => {
  it('drops the held chords an octave for the next play, and is remembered', async () => {
    await render();
    const select = q('chord-under-run') as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual(['as the app plays it', 'an octave lower']);
    await act(async () => { q('card-play')!.click(); });
    expect(plays.list[0].opts.chordShift).toBe(0);
    await act(async () => {
      select.value = '-12';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(prefs.get('harmonicFluencyChordUnderRun')).toBe(-12);
    await act(async () => { q('card-play')!.click(); });
    expect(plays.list[1].opts.chordShift).toBe(-12);
    // The held E7 lights where it now sounds, an octave down.
    await settle();
    fire('onUnder', 2);
    expect(key(40).getAttribute('fill')).toBe('#A7DCC6');
  });

  it('is not offered where nothing is held under the run', async () => {
    await render(PROGRESSION);
    expect(q('chord-under-run')).toBeNull();
    expect(q('card-stop')).not.toBeNull();
  });
});

describe('paints on the audio clock', () => {
  it('fires each paint once the clock reaches it, in time order whatever order they were asked in', () => {
    const frames: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const clock = { currentTime: 0, baseLatency: 0 } as unknown as AudioContext;
    const painter = paintOnAudioClock(clock);
    const fired: string[] = [];
    painter.at(2, () => fired.push('under'));
    painter.at(1, () => fired.push('step'));
    painter.at(3, () => fired.push('end'));
    (clock as unknown as { currentTime: number }).currentTime = 2.5;
    frames.shift()!();
    expect(fired).toEqual(['step', 'under']);
    painter.stop();
    (clock as unknown as { currentTime: number }).currentTime = 5;
    frames.shift()?.();
    expect(fired).toEqual(['step', 'under']);
    vi.unstubAllGlobals();
  });
});
