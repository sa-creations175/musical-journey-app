// @vitest-environment jsdom
/**
 * The third clean run IS the pass.
 *
 * =====================================================================
 * THE BUG THIS REMOVES WAS A BUTTON YOU COULD NOT SEE YOURSELF NOT
 * PRESSING.
 *
 * "Mark solid" — later "Pass the test" — sat in the footer and asked
 * the user to confirm something they had already done. Three clean
 * run-throughs with that button left unpressed was a passed test the
 * app did not record, and the only sign of it was a modal that closed
 * like any other. Nothing on screen distinguished the two outcomes.
 *
 * So these pin the absence of the button as hard as the presence of
 * the result screen: a save-on-pass with the button still there would
 * pass every test about the result screen and leave the trap in place.
 * =====================================================================
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Song, SongKey } from '../../../../lib/db';

/** Typed so the assertions below can read the argument the modal
 *  passed, rather than casting `undefined` at each call site. */
const saveKeyAttemptsAndRollup = vi.fn<
  (args: { markSolid: boolean; attempts: unknown[] }) => Promise<void>
>(async () => {});
vi.mock('../cellRollup', async () => {
  const actual = await vi.importActual<typeof import('../cellRollup')>('../cellRollup');
  return { ...actual, saveKeyAttemptsAndRollup: (a: never) => saveKeyAttemptsAndRollup(a) };
});
vi.mock('../../useSongSpelling', () => ({ useSongSpelling: () => 'flats' }));

const { default: WholeSongTestModal } = await import('../WholeSongTestModal');

const NOW = 1_700_000_000_000;
const TEMPO = 100;

const song = { id: 's1', title: 'No Weapon', tempo: TEMPO } as Song;
const songKey = {
  id: 'sk-1', songId: 's1', keyName: 'Ab', isOriginalKey: true,
  keyState: 'comfortable', solidAt: null, solidDecayState: null,
  lastDecayCheckAt: null, livedWithSessionCount: 0,
  livedWithFirstSessionAt: null, livedWithWindowStartAt: null,
  livedWithSessionsInWindow: 0, wholeSongTestPassedAt: null,
  isRetestRecommended: false, lastEngagedAt: null,
  createdAt: NOW, updatedAt: NOW,
} as SongKey;

function render() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <WholeSongTestModal
        open
        onClose={() => {}}
        onSaved={() => {}}
        songKey={songKey}
        song={song}
        siblingCells={[]}
        totalSections={2}
        pastRuns={[]}
        isRetest={false}
        renderPassedPreview={() => <div>the matrix row</div>}
      />,
    );
  });
  const text = () => (document.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  const labels = () =>
    [...document.body.querySelectorAll('button')]
      .map(b => (b.textContent ?? '').replace(/\s+/g, ' ').trim());
  /** Rate one run at tempo. The BPM box is pre-filled from the song. */
  const rate = async (label: string) => {
    const btn = [...document.body.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').trim() === label);
    if (!btn) throw new Error(`no rating button "${label}" — have ${labels().join(' | ')}`);
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };
  return {
    text, labels, rate,
    unmount: () => { act(() => { root.unmount(); }); host.remove(); },
  };
}

beforeEach(() => {
  saveKeyAttemptsAndRollup.mockClear();
  document.body.innerHTML = '';
});

describe('there is no button that passes the test', () => {
  it('the footer offers no way to claim a pass', () => {
    const r = render();
    const l = r.labels();
    expect(l).not.toContain('Mark solid');
    expect(l).not.toContain('Pass the test');
    expect(l).not.toContain('Mark solid (re-pass)');
    r.unmount();
  });

  it('Save Attempts survives — leaving with the streak unfinished is real', () => {
    // It is a way OUT, not a way to pass. Removing it too would strand
    // a session with runs logged and no streak.
    const r = render();
    expect(r.labels()).toContain('Save Attempts');
    r.unmount();
  });
});

describe('the third clean run ends it', () => {
  it('two clean runs do not pass', async () => {
    const r = render();
    await r.rate('Clean');
    await r.rate('Clean');
    expect(saveKeyAttemptsAndRollup).not.toHaveBeenCalled();
    expect(r.text()).not.toContain('That’s the test passed.');
    r.unmount();
  });

  it('the third saves, with markSolid, and shows the result screen', async () => {
    const r = render();
    await r.rate('Clean');
    await r.rate('Clean');
    await r.rate('Clean');
    expect(saveKeyAttemptsAndRollup).toHaveBeenCalledTimes(1);
    expect(saveKeyAttemptsAndRollup.mock.calls[0]?.[0]).toMatchObject({ markSolid: true });
    expect(r.text()).toContain('That’s the test passed.');
    expect(r.text()).toContain('No Weapon is now at Comfortable status');
    r.unmount();
  });

  it('the result screen shows the caller\'s row and ONE exit', async () => {
    const r = render();
    await r.rate('Clean');
    await r.rate('Clean');
    await r.rate('Clean');
    expect(r.text()).toContain('What the matrix says now');
    expect(r.text()).toContain('the matrix row');
    // The whole footer is gone: Cancel and Save Attempts below the
    // result screen would be three ways out of a finished window.
    //
    // The `×` is the Modal's own chrome, on every modal in the app,
    // and it calls the same handler. Counting it as a second exit
    // would mean this screen could only satisfy §4 by removing the
    // window's close control — which is a different decision about
    // every modal, not about this one.
    expect(r.labels().filter(l => l !== '×')).toEqual(['Close And See It']);
    r.unmount();
  });

  it('A NOT-CLEAN RUN IN THE MIDDLE MEANS NO PASS', async () => {
    // Four clean runs, and the test is not passed — the reset is the
    // whole claim of the rule, and the auto-save must obey it rather
    // than counting cleans.
    const r = render();
    await r.rate('Clean');
    await r.rate('Clean');
    await r.rate('Struggled');
    await r.rate('Clean');
    await r.rate('Clean');
    expect(saveKeyAttemptsAndRollup).not.toHaveBeenCalled();
    r.unmount();
  });

  it('passes on the third run, not the fourth', async () => {
    // The projection is asked about the run just rated rather than
    // about last render's state. Reading state would pass one run
    // late, which on a three-run streak is the whole streak.
    const r = render();
    await r.rate('Clean');
    await r.rate('Clean');
    await r.rate('Clean');
    expect(saveKeyAttemptsAndRollup.mock.calls[0]?.[0].attempts).toHaveLength(3);
    r.unmount();
  });
});
