// @vitest-environment jsdom
/**
 * The diary's player panel: how it opens, what it shows, how it closes.
 *
 * Silas's spec of 12 Sep 2026, §1, §2 and §8, walked in
 * `diary-card-prototype_2.html`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useEffect, useState } from 'react';

/** Every sequence the engine was asked to play. */
const calls: Array<{ chords: Array<{ intervals: number[] }> }> = [];

vi.mock('../../../lib/audio', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../lib/audio')>()),
  playSeqChords: (chords: Array<{ intervals: number[] }>) => {
    calls.push({ chords });
    return Promise.resolve({ stop: () => {} });
  },
  setInstrument: () => {},
}));
vi.mock('../../../lib/musicalPlayback', () => ({
  playBlocked: () => Promise.resolve({ stop: () => {} }),
}));
vi.mock('../../../lib/userPrefs', () => ({
  getPref: (_k: string, d: unknown) => Promise.resolve(d),
  setPref: () => Promise.resolve(),
}));

const DiaryPlayerPanel = (await import('../DiaryPlayerPanel')).default;
const { InstrumentProvider } = await import('../../../lib/instrumentContext');
const { usePlayerSettings } = await import('../../../lib/player/usePlayerSettings');
const { cardSound, openingPlayAs } = await import('../cardSound');
type SkillRecord = import('../../skills/registry').SkillRecord;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement | null = null;
let root: Root | null = null;
let closed = 0;
let replay: () => void = () => {};

function Harness({ skillId, skill }: { skillId: string; skill?: SkillRecord }) {
  const sound = cardSound(skillId)!;
  const [settings, setSettings] = usePlayerSettings({ playAs: openingPlayAs(sound) });
  const [token, setToken] = useState(1);
  useEffect(() => { replay = () => setToken(t => t + 1); }, []);
  return (
    <DiaryPlayerPanel
      sound={sound}
      skill={skill}
      cardTitle={skill?.name ?? skillId}
      settings={settings}
      onSettings={setSettings}
      playToken={token}
      onClose={() => { closed += 1; }}
    />
  );
}

function mount(skillId: string, skill?: Partial<SkillRecord>) {
  calls.length = 0;
  closed = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <InstrumentProvider>
        <Harness skillId={skillId} skill={skill as SkillRecord | undefined} />
      </InstrumentProvider>,
    );
  });
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

const q = (testId: string) => document.body.querySelector(`[data-testid="${testId}"]`);
const click = (el: Element) => act(() => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

describe('it opens on the card and plays it at once', () => {
  it('is titled with what sounds, with the card\'s origin under it', () => {
    mount('chord-recognition:item:maj9', {
      name: 'Major 9', moduleLabel: 'Chord Recognition', category: 'Extended',
    });
    expect(q('diary-sheet-title')!.textContent).toBe('C Major 9');
    expect(q('diary-sheet-subtitle')!.textContent).toBe('Chord Recognition · Extended');
    expect(calls).toHaveLength(1);
    expect(q('player-status')!.textContent).toBe('playing · together');
  });

  it('plays again on the next ▶ tap', () => {
    mount('chord-recognition:item:maj9');
    act(() => { replay(); });
    expect(calls).toHaveLength(2);
  });

  it('titles a progression with its chords, and says the key under it', () => {
    const sound = cardSound('chord-progressions:motion:2-to-5-asc')!;
    expect(sound.kind).toBe('progression');
    mount('chord-progressions:motion:2-to-5-asc', { moduleLabel: 'Chord Progressions', category: 'Motion' });
    expect(q('diary-sheet-title')!.textContent).toBe('Dm · G7');
    expect(q('diary-sheet-subtitle')!.textContent).toBe('in the key of C · Chord Progressions · Motion');
  });
});

describe('the page stays live under it', () => {
  it('closes on ×', () => {
    mount('chord-recognition:item:maj7');
    click(document.body.querySelector('[data-testid="diary-sheet-live"] button[aria-label="close"]')!);
    expect(closed).toBe(1);
  });

  it('closes on Escape', () => {
    mount('chord-recognition:item:maj7');
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(closed).toBe(1);
  });

  it('closes on a tap on the page outside it', () => {
    mount('chord-recognition:item:maj7');
    const page = document.createElement('p');
    document.body.appendChild(page);
    click(page);
    expect(closed).toBe(1);
    page.remove();
  });

  it('does not close on a tap inside it, or on another card\'s ▶', () => {
    mount('chord-recognition:item:maj7');
    click(q('play-as-up')!);
    expect(closed).toBe(0);
    const other = document.createElement('button');
    other.setAttribute('data-diary-hear', '');
    document.body.appendChild(other);
    click(other);
    expect(closed).toBe(0);
    other.remove();
  });

  it('does not dim the page or hold it still', () => {
    mount('chord-recognition:item:maj7');
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(document.body.querySelector('.bg-black\\/40')).toBeNull();
  });
});

describe('the panel, top to bottom (spec §4)', () => {
  const inOrder = (order: string[]) => {
    const all = [...document.body.querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid'));
    const at = order.map(id => all.indexOf(id));
    expect(at.every(i => i >= 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  };

  it('keyboard · transport · Hands · Play as · Chord Color Legend · Settings', () => {
    mount('chord-progressions:motion:2-to-5-asc');
    inOrder(['built-answer-keyboard', 'player-hear', 'hands-rootless', 'play-as-row',
      'chord-color-legend', 'player-settings']);
  });

  it('on a chord card Hands stands beside Inversion, under Root and Colour', () => {
    mount('chord-recognition:item:maj7');
    inOrder(['built-answer-keyboard', 'player-hear', 'play-as-row', 'chord-color-legend',
      'row-root', 'row-colour', 'row-inversion', 'hands-rootless', 'player-settings']);
    // Hands and Play as came out of the fold, so they are not in it twice.
    const fold = q('player-settings')!;
    expect(fold.querySelector('[data-testid="hands-rootless"]')).toBeNull();
    expect(fold.querySelector('[data-testid="play-as-row"]')).toBeNull();
    expect(q('hear-one-0')).toBeNull();
  });

  it('draws the board from F1 to C6', () => {
    mount('chord-recognition:item:maj7');
    const board = q('built-answer-keyboard')!;
    expect(board.querySelectorAll('rect[data-midi="29"]')).toHaveLength(1);
    expect(board.querySelectorAll('rect[data-midi="28"]')).toHaveLength(0);
    expect(board.querySelectorAll('rect[data-midi="84"]')).toHaveLength(1);
    expect(board.querySelectorAll('rect[data-midi="85"]')).toHaveLength(0);
  });
});

describe('the card\'s own rows (spec §4)', () => {
  const title = () => q('diary-sheet-title')!.textContent;
  const subtitle = () => q('diary-sheet-subtitle')?.textContent ?? '';

  it('Root transposes the chord, says it came from the card, and plays it', () => {
    mount('chord-recognition:item:maj7', { name: 'Major 7', moduleLabel: 'Chord Recognition' });
    expect(q('back-to-card')).toBeNull();
    const before = calls.length;
    click(q('root-3')!);
    expect(title()).toBe('E♭ Major 7');
    expect(subtitle()).toBe('from the card Major 7 · Chord Recognition');
    expect(calls.length).toBe(before + 1);
    expect(q('back-to-card')).not.toBeNull();
  });

  it('Back to the card resets all of it', () => {
    mount('chord-recognition:item:maj7', { name: 'Major 7' });
    click(q('root-3')!);
    click(q('colour-maj9')!);
    click(q('inversion-1')!);
    expect(title()).toBe('E♭ Major 9 · 1st inversion');
    click(q('back-to-card')!);
    expect(title()).toBe('C Major 7');
    expect(q('back-to-card')).toBeNull();
    expect(q('inversion-0')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('Colour shows the chord\'s family, and Hands sits beside Inversion', () => {
    mount('chord-recognition:item:dom7');
    expect(q('row-colour')!.textContent).toContain('Colour · Dominant');
    expect(document.body.querySelectorAll('[data-testid="colour-separator"]')).toHaveLength(2);
    const pair = q('inversion-and-hands')!;
    expect(pair.querySelector('[data-testid="row-inversion"]')).not.toBeNull();
    expect(pair.querySelector('[data-testid="hands-rootless"]')).not.toBeNull();
    // Once, not twice.
    expect(document.body.querySelectorAll('[data-testid="hands-rootless"]')).toHaveLength(1);
  });

  it('as many Inversion chips as the hand has notes', () => {
    mount('chord-recognition:item:maj');
    expect(document.body.querySelectorAll('[data-testid^="inversion-"]:not([data-testid="inversion-and-hands"])'))
      .toHaveLength(3);
  });

  it('a scale card has Root and Mode, and no Colour or Inversion', () => {
    mount('scales-modes:mode:dorian', { name: 'Dorian' });
    expect(q('row-colour')).toBeNull();
    expect(q('row-inversion')).toBeNull();
    click(q('mode-lydian')!);
    expect(title()).toBe('D Lydian');
    click(q('root-0')!);
    expect(title()).toBe('C Lydian');
  });

  it('an interval card has Root and Interval, named as the reader names two notes', () => {
    mount('intervals:asc:m3', { name: 'Minor 3rd' });
    expect(title()).toBe('Minor 3rd');
    click(q('interval-4')!);
    expect(title()).toBe('C E · major 3rd');
  });

  it('a progression card has none of them yet', () => {
    mount('chord-progressions:motion:2-to-5-asc');
    expect(q('row-root')).toBeNull();
    expect(q('back-to-card')).toBeNull();
  });
});

describe('what each card type shows (spec §8)', () => {
  it('a scale card: every Settings row, and no Hands until Silas says what it moves', () => {
    mount('scales-modes:mode:dorian', { name: 'Dorian' });
    expect(q('diary-sheet-title')!.textContent).toBe('Dorian');
    expect(q('hands-rootless')).toBeNull();
    expect(q('listen-both')).not.toBeNull();
    // Together strikes every note of the scale at once.
    expect(calls[0].chords.at(-1)!.intervals).toHaveLength(8);
  });

  it('an interval card opens on the direction it names', () => {
    expect(openingPlayAs(cardSound('intervals:asc:m3')!)).toBe('up');
    expect(openingPlayAs(cardSound('intervals:desc:m3')!)).toBe('down');
    expect(openingPlayAs(cardSound('chord-recognition:item:maj7')!)).toBe('together');
    mount('intervals:desc:m3', { name: 'Minor 3rd' });
    expect(q('play-as-down')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('hands-rootless')).toBeNull();
  });

  it('a chord and a progression card show Hands', () => {
    mount('chord-recognition:item:maj7');
    expect(q('hands-rootless')).not.toBeNull();
    act(() => root!.unmount());
    host!.remove();
    mount('chord-progressions:motion:2-to-5-asc');
    expect(q('hands-rootless')).not.toBeNull();
  });
});
