// @vitest-environment jsdom
/**
 * "Tier 2 unlocked: … are in play."
 *
 * =====================================================================
 * IT HAS TO NAME THE MATERIAL, AND IT HAS TO SAY IT ONCE.
 *
 * The old message was "Tier 2 unlocked — new chord types available!",
 * which tells a reader something changed and not what; Scales & Modes
 * said nothing at all. What these assert is the ruling of 10 Sep 2026:
 * the sentence names what is in play, it is the SAME words the Settings
 * page prints for that Tier, it fires on a crossing rather than on
 * arriving where a Tier is already open, and it carries a way to see
 * the whole ladder.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { Toaster } from '../../../components/Toaster';
import { useTierUnlockNotice } from '../useTierUnlockNotice';
import {
  CHORD_RECOGNITION_ROWS, SCALE_MODE_ROWS, tierUnlockedMessage,
} from '../tierContents';
import { OPEN_SETTINGS_EVENT } from '../../../components/settings/openSettings';
import { readOpenSection } from '../../../components/settings/settingsSections';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function Probe({ tier, rows }: { tier: number | null; rows: ReadonlyArray<string> }) {
  useTierUnlockNotice(tier, rows);
  return null;
}

function render(tier: number | null, rows = CHORD_RECOGNITION_ROWS) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<Toaster><Probe tier={tier} rows={rows} /></Toaster>);
  });
}

function rerender(tier: number | null, rows = CHORD_RECOGNITION_ROWS) {
  act(() => {
    root!.render(<Toaster><Probe tier={tier} rows={rows} /></Toaster>);
  });
}

const toastText = (): string => document.body.textContent ?? '';

beforeEach(() => { window.localStorage.clear(); });

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  host = null; root = null;
});

describe('the sentence', () => {
  it('names what is in play, in the words the Settings page uses', () => {
    expect(tierUnlockedMessage(2, CHORD_RECOGNITION_ROWS))
      .toBe('Tier 2 unlocked: maj7, m7, 7, dim7, m7♭5, mMaj7 are in play.');
    expect(tierUnlockedMessage(2, SCALE_MODE_ROWS))
      .toBe('Tier 2 unlocked: Dorian, Mixolydian, Lydian, Phrygian, '
        + 'Locrian are in play.');
  });
});

describe('when it fires', () => {
  it('says nothing on arriving where a Tier is already open', () => {
    // The reader unlocked Tier 3 last week. Opening the quiz today is
    // not news.
    render(3);
    expect(toastText()).not.toContain('unlocked');
  });

  it('announces a crossing, once', () => {
    render(2);
    rerender(3);
    expect(toastText()).toContain('Tier 3 unlocked');
    expect(toastText()).toContain('inversions of the triads and sevenths');
  });

  it('says nothing when the Tier has not moved', () => {
    render(2);
    rerender(2);
    expect(toastText()).not.toContain('unlocked');
  });

  it('waits until the Tier is known', () => {
    // A live query has not answered yet. Baselining on null and then
    // announcing whatever came back would fire on every page load.
    render(null);
    rerender(4);
    expect(toastText()).not.toContain('unlocked');
  });
});

describe('See all Tiers', () => {
  it('opens Settings at Unlocking Tiers of Difficulty', () => {
    render(1);
    rerender(2);
    const link = [...document.querySelectorAll('button')]
      .find(b => b.textContent === 'See all Tiers');
    expect(link).toBeTruthy();

    const asked = vi.fn();
    window.addEventListener(OPEN_SETTINGS_EVENT, asked);
    act(() => { link!.click(); });
    window.removeEventListener(OPEN_SETTINGS_EVENT, asked);

    expect(asked).toHaveBeenCalled();
    // AT the section, not merely on the page: the fold the Settings
    // page reads on open is already set to it.
    expect(readOpenSection()).toBe('unlocking');
  });
});
