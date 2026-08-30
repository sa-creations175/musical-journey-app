// @vitest-environment jsdom
/**
 * The metronome, as a song sees it.
 *
 * =====================================================================
 * WHAT THIS REPLACES DID NOT FAIL — IT PASSED, WRONGLY.
 *
 * The typed tempo box was pre-filled from the song's stated tempo, so a
 * run played at 70 on a song targeted at 100 recorded 100 and counted.
 * The gate ran and returned true, which is worse than no gate at all: a
 * passing check reads as evidence.
 *
 * So the tests that matter here are the ones about what a MODE ALLOWS.
 * Practice must move anywhere — slowing right down is the point of it,
 * and a floor there would make practising feel like cheating. A test
 * must stop at the floor AND say why, because a stepper that silently
 * does nothing at the boundary reads as broken.
 * =====================================================================
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { metronome } from '../../../../lib/metronome';
import SongMetronomeBox from '../SongMetronomeBox';

vi.mock('../../../../lib/userPrefs', () => ({
  getPref: async (_k: string, d: unknown) => d,
  setPref: async () => {},
}));

function render(over: Partial<React.ComponentProps<typeof SongMetronomeBox>> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const props: React.ComponentProps<typeof SongMetronomeBox> = {
    mode: 'testing',
    songTempo: 100,
    onSetSongTempo: () => {},
    ...over,
  };
  act(() => { root.render(<SongMetronomeBox {...props} />); });
  const press = (label: string) => {
    const b = [...host.querySelectorAll('button')]
      .find(x => (x.getAttribute('aria-label') ?? x.textContent ?? '').trim() === label);
    if (!b) throw new Error(`no button "${label}"`);
    act(() => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  };
  /**
   * Type into a controlled input.
   *
   * React installs its own value setter on the element and compares
   * against it, so assigning `.value` directly is swallowed — the
   * event fires with React still believing the old value. The native
   * setter is how the change actually reaches `onChange`.
   */
  const type = (value: string) => {
    const input = host.querySelector('input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    )?.set;
    act(() => {
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  return {
    host, press, type,
    text: () => (host.textContent ?? '').replace(/\s+/g, ' ').trim(),
    unmount: () => { act(() => { root.unmount(); }); host.remove(); },
  };
}

beforeEach(() => {
  metronome.update({ bpm: 100 });
  document.body.innerHTML = '';
});

describe('a test clamps at the floor and says why', () => {
  it('stops ten below the song, and stays stopped', () => {
    // Asserted through the rendered state word rather than by reading
    // the singleton: the box is what the player sees, and a clamp that
    // held internally while the display drifted would pass a test that
    // read the object.
    metronome.update({ bpm: 91 });
    const r = render({ mode: 'testing', songTempo: 100 });
    // Matched on the CLAMP sentence, not on "is the floor" — the
    // standing window text ends with those words too, so the loose
    // match would have been true before the first press.
    const CLAMPED = 'Ten below the song’s tempo is the floor.';
    r.press('decrease tempo by 1');   // 90 — the floor, allowed
    expect(r.text()).not.toContain(CLAMPED);
    r.press('decrease tempo by 1');   // refused, and it says so
    expect(r.text()).toContain(CLAMPED);
    r.unmount();
  });

  it('SAYS WHY, rather than just not moving', () => {
    // A stepper that silently does nothing at the boundary reads as
    // broken. This is the difference between a rule and a bug.
    metronome.update({ bpm: 90 });
    const r = render({ mode: 'testing', songTempo: 100 });
    r.press('decrease tempo by 1');
    expect(r.text()).toContain(
      'A test runs at 90 bpm or faster. Ten below the song’s tempo is the floor.',
    );
    r.unmount();
  });

  it('states the window BEFORE it bites', () => {
    // Someone who finds out about the floor by hitting it has learned
    // the same rule in the worse order.
    expect(render({ mode: 'testing', songTempo: 100 }).text()).toContain(
      'The target bpm for this song is 100bpm. A test run must be no lower '
      + 'than 90bpm (10 below the target).',
    );
  });
});

describe('practice moves anywhere', () => {
  it('goes below the test floor without complaint', () => {
    // Slowing right down to get a passage under the fingers is the
    // point of practice. A floor here would make it feel like cheating.
    metronome.update({ bpm: 60 });
    const r = render({ mode: 'practice', songTempo: 100 });
    r.press('decrease tempo by 1');
    expect(r.text()).not.toContain('Ten below the song’s tempo is the floor.');
    r.unmount();
  });

  it('EXPLAINS ITSELF TOO, and does not borrow the test\'s words', () => {
    // Practice needs its half as much: "you may go slower" is not
    // obvious from a metronome that simply lets you.
    const t = render({ mode: 'practice', songTempo: 100 }).text();
    expect(t).toContain(
      'The target bpm for this song is 100bpm. Practice can run at any tempo '
      + 'as you build up to target. Slow it down if that’s what you need to start.',
    );
    expect(t).not.toContain('A test run must be no lower');
  });
});

describe('a song with no tempo', () => {
  it('BLOCKS a test — there is nothing for "at tempo" to mean', () => {
    const r = render({ mode: 'testing', songTempo: null });
    expect(r.text()).toContain('Set this song’s tempo before testing it.');
    r.unmount();
  });

  it('PROMPTS practice — it does not block', () => {
    const r = render({ mode: 'practice', songTempo: null });
    expect(r.text()).toContain('What tempo is this song at?');
    expect(r.text()).not.toContain('before testing it');
    r.unmount();
  });

  it('carries its own fix, rather than sending you to the song editor', () => {
    const set = vi.fn();
    const r = render({ mode: 'testing', songTempo: null, onSetSongTempo: set });
    r.type('104');
    r.press('Save');
    expect(set).toHaveBeenCalledWith(104);
    r.unmount();
  });

  it('refuses a tempo outside the range the metronome can play', () => {
    const set = vi.fn();
    const r = render({ mode: 'testing', songTempo: null, onSetSongTempo: set });
    r.type('9');
    r.press('Save');
    expect(set).not.toHaveBeenCalled();
    r.unmount();
  });
});

describe('the state word', () => {
  it('names the metronome, never a bare colour', () => {
    const r = render({});
    expect(r.text()).toMatch(/Metronome (Active|Silent)/);
    r.unmount();
  });
});

describe('the prototype\'s placeholder wording never shipped', () => {
  it('is absent from both modes', () => {
    // This test used to assert the practice box had NO explainer,
    // because none was written and an invented one would have looked
    // finished. One is written now, and it is not the prototype's —
    // that draft was never signed off and must not creep back in as
    // "close enough".
    for (const mode of ['practice', 'testing'] as const) {
      const t = render({ mode, songTempo: 100 }).text();
      expect(t).not.toContain('Opens at the song');
      expect(t).not.toContain('slow it down as much as you like');
    }
  });
});
