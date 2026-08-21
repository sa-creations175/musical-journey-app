// @vitest-environment jsdom
/**
 * What the quiz will actually serve, and what it says it will serve.
 *
 * ─── The gap this file exists to close ───────────────────────────────
 *
 * `tierUnlock.test.ts` covers the staged-introduction gate correctly
 * and completely. Nothing covered the COMPOSITION of the tier filter
 * with that gate, and no test rendered the quiz on a filtered tab. So
 * free practice served three of the thirty seeded chords for three
 * months — every tab above foundational produced an empty pool, a
 * still-enabled play button and no sound — with the module's suite
 * green throughout.
 *
 * Both units were right. The seam between them had no test. Same shape
 * as the dashboard dead tap, and the reason these assertions are about
 * the POOL rather than about any label describing it.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import ChordRecognitionQuiz from '../ChordRecognitionQuiz';
import { CHORD_SEEDS } from '../seed';
import type { AttemptRecord, ChordData } from '../../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/**
 * jsdom has no Web Audio, so the real players throw — and `startNew`
 * sets its state BEFORE awaiting playback, which means the readout
 * updates either way and the throw surfaces only as an unhandled
 * rejection. Stubbing turns "was a chord served?" into a direct
 * question with a direct answer.
 */
const played = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../../../lib/audio', () => ({
  playChordBlocked: async () => { played.calls += 1; },
  playChordBroken: async () => { played.calls += 1; },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const chords: ChordData[] = CHORD_SEEDS.map(seed => ({
  ...seed, correct: 0, total: 0,
}));

/** Chords the catalog holds per tab, read off the seed rather than
 *  written down — a hard-coded 6 would survive the seed changing. */
function seededIn(tier: ChordData['tier']): number {
  return CHORD_SEEDS.filter(c => c.tier === tier).length;
}

async function render(
  initialFocusKeys?: string[],
  attempts: AttemptRecord[] = [],
): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <ChordRecognitionQuiz
          chords={chords}
          attempts={attempts}
          {...(initialFocusKeys ? { initialFocusKeys } : {})}
        />
      </MemoryRouter>,
    );
  });
  // The spacingState live query drives the mix weighting. Settle past
  // it: the gate used to arrive on this tick and empty the pool.
  for (let i = 0; i < 12; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return container;
}

function clickTab(el: HTMLElement, label: string): void {
  const button = [...el.querySelectorAll('button')]
    .find(b => b.textContent?.trim() === label);
  if (!button) throw new Error(`no tab labelled ${label}`);
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** The chords the quiz will accept as answers — the pool made visible. */
function answerNames(el: HTMLElement): string[] {
  return [...el.querySelectorAll('[data-testid="chord-answer"]')]
    .map(b => b.textContent ?? '');
}

/**
 * Press play and report whether a chord was actually served.
 *
 * NOT the disabled state, not the status line, not the answer grid.
 * All three are DESCRIPTIONS of the pool, computed from the tier
 * filter — and a description disagreeing with the thing it describes
 * is the entire failure being guarded here. The first draft of this
 * file asserted the button's `disabled` attribute and passed with the
 * gate reintroduced, because the gate lives downstream of everything
 * those surfaces read.
 *
 * `startNew` returns early on an empty candidate list, leaving
 * `hasPlayed` false and the root-note readout at an em dash. Calling
 * it is the only way to observe what `buildCandidates` produced.
 */
async function playsSomething(el: HTMLElement): Promise<boolean> {
  const play = el.querySelector('[data-testid="play-chord"]') as HTMLButtonElement | null;
  if (!play) throw new Error('play control not rendered');
  if (play.disabled) return false;
  const before = played.calls;
  await act(async () => {
    play.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 0));
  });
  return played.calls > before;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('every tab plays', () => {
  // THE BUG. Free practice ran its candidate pool through
  // `getEligibleItems`, which serves the unlocked tier plus at most
  // three never-attempted items from it. On a fresh install that is
  // `maj:0`, `min:0`, `dim:0` — so "all chords" worked, foundational
  // worked, and the three tabs above it played nothing at all.
  const TABS: Array<[string, ChordData['tier']]> = [
    ['Foundational Triads', 'foundational'],
    ['Seventh Chords', 'seventh'],
    ['Dominant Variations', 'dominant'],
    ['Extensions & Colors', 'extensions'],
  ];

  it('serves the whole catalog with no attempts logged', async () => {
    // Guard the guard: an empty attempt log is the state the gate was
    // most restrictive in. If this fixture had history, the tabs below
    // could pass on unlocked tiers rather than on being ungated.
    const el = await render();
    expect(answerNames(el)).toHaveLength(CHORD_SEEDS.length);
    expect(await playsSomething(el)).toBe(true);
  });

  for (const [label, tier] of TABS) {
    it(`${label} offers its chords and can play them`, async () => {
      const el = await render();
      clickTab(el, label);
      expect(answerNames(el)).toHaveLength(seededIn(tier));
      expect(await playsSomething(el)).toBe(true);
    });
  }

  it('a tab the progression has not reached still plays', async () => {
    // Dominant Variations is the LAST tier the staged progression
    // unlocks — behind extensions, despite sitting third in the strip.
    // Ungating means the order is a suggestion rather than a lock.
    const el = await render();
    clickTab(el, 'Dominant Variations');
    expect(await playsSomething(el)).toBe(true);
    expect(answerNames(el).length).toBeGreaterThan(0);
  });
});

describe('the count reads the pool', () => {
  it('states a count the answer grid agrees with', async () => {
    // THIS DOES NOT DISCRIMINATE ON THE TIER PATH, and saying so is
    // the point. The status line counted the CATALOG —
    // `chords.filter(c => c.tier === tierFilter).length` — which read
    // "seventh chords — 6 in pool" over a pool of zero. Now that free
    // practice is ungated that expression and `poolChords.length` are
    // equivalent by construction, so reversing this one line changes
    // nothing observable and this test stays green. Verified by
    // reversing it.
    //
    // What it does check is that the three surfaces agree, which is
    // the failure that actually shipped. The property "reads the pool
    // rather than the catalog" is observable only where the two can
    // differ — a focus set holding a key no chord answers to — and
    // that is the test below.
    const el = await render();
    clickTab(el, 'Seventh Chords');
    const stated = Number(/(\d+) in pool/.exec(el.textContent ?? '')?.[1]);
    expect(stated).toBe(answerNames(el).length);
    expect(stated).toBe(seededIn('seventh'));
  });

  it('follows the catalog it was given, not the seed it was built from', () => {
    // A label reading CHORD_SEEDS directly would pass every assertion
    // above, since the fixture IS the seed. This is the cheap half of
    // the property: the count tracks the data the component holds.
    expect(seededIn('seventh')).toBeGreaterThan(0);
    expect(chords.filter(c => c.tier === 'seventh')).toHaveLength(seededIn('seventh'));
  });

  it('agrees with the pool when a focus set narrows it', async () => {
    const el = await render(['maj7', 'min7']);
    expect(el.textContent).toContain('2 chords selected');
    expect(answerNames(el).sort()).toEqual(['Major 7', 'Minor 7']);
  });

  it('counts what exists, not what it was handed', async () => {
    // THE DISCRIMINATING CASE for "the count reads the pool". A stale
    // ref — a dashboard link outliving a renamed seed — must not be
    // counted as a chord that can be served, and this count is what
    // decides whether the session counts toward accuracy: two keys
    // resolving to one chord would clear a threshold one chord does
    // not. Deduping the keys was not enough; only the pool knows.
    const el = await render(['maj7', 'not-a-chord']);
    expect(el.textContent).toContain('1 chord selected');
    expect(answerNames(el)).toEqual(['Major 7']);
    expect(el.querySelector('[data-testid="fluency-protection-notice"]')).not.toBeNull();
  });
});

describe('an empty pool says so rather than failing silently', () => {
  it('disables the control and explains, instead of playing nothing', async () => {
    // `startNew` returned early on an empty candidate list. The button
    // stayed enabled, so pressing it was indistinguishable from broken
    // audio — the worst available failure, because the press is the
    // only feedback there is.
    const el = await render(['not-a-chord', 'also-not-a-chord']);
    expect(answerNames(el)).toEqual([]);
    expect(await playsSomething(el)).toBe(false);
    const notice = el.querySelector('[data-testid="empty-pool-notice"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain('nothing to play');
    // And a way out, since the pool came from somewhere the player
    // may not have chosen.
    expect(notice!.textContent).toContain('Exit focus');
  });

  it('says nothing of the sort when there is something to play', async () => {
    // Guard the guard: the notice is conditional, not always rendered.
    const el = await render();
    expect(el.querySelector('[data-testid="empty-pool-notice"]')).toBeNull();
    expect(await playsSomething(el)).toBe(true);
  });
});

describe('a dashboard pool is served, not just accepted', () => {
  it('drills the six chords a Seventh Chords row promises', async () => {
    // The row says "drill 6 items" and sends six keys. Before
    // ungating, every one of them was filtered out downstream: the
    // dashboard promised six and the drill served none.
    const seventh = CHORD_SEEDS.filter(c => c.tier === 'seventh').map(c => c.id);
    expect(seventh.length).toBe(seededIn('seventh'));
    const el = await render(seventh);
    expect(answerNames(el)).toHaveLength(seventh.length);
    expect(await playsSomething(el)).toBe(true);
    expect(el.textContent).toContain(`${seventh.length} chords selected`);
  });

  it('drills a single extensions chord the progression has not reached', async () => {
    const el = await render(['maj13']);
    expect(answerNames(el)).toEqual(['Major 13']);
    expect(await playsSomething(el)).toBe(true);
  });
});
