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
import { DEFAULT_INVERSION_SETTINGS } from '../inversionUtils';
import { servedRefsFor } from '../facets';
import { UNLOCK_MIN_ATTEMPTS } from '../tierUnlock';
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
  // BROKEN GOES THROUGH THE SEQUENCER NOW, so the stub that counts a
  // sound has to count this one too — otherwise a future test pressing
  // Broken would read as "the tab plays nothing".
  playSeqChords: async () => { played.calls += 1; return { stop: () => {} }; },
  BROKEN_STEP_BEATS: 0.75,
  CHORD_RING_BEATS: 3,
  // The quiz asks when the question becomes answerable so it can start
  // its measurement clock there. Stubbed rather than omitted: an
  // undefined export here throws inside the play handler, and the
  // failure surfaces as "the tab cannot play", which is a long way
  // from the cause.
  chordBlockedAnswerableMs: () => 50,
  chordBrokenAnswerableMs: () => 1_250,
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

/**
 * Narrow the strip to one tier.
 *
 * The tabs this replaced were single-select, so choosing a tier was one
 * tap. The strip loads with every chip lit, so choosing a tier means
 * DESELECTING the others — the same end state by a different gesture,
 * which is why these call sites read differently from the ones they
 * replaced.
 */
const TIER_BY_LABEL: Readonly<Record<string, string>> = {
  'Foundational Triads': 'foundational',
  'Seventh Chords': 'seventh',
  'Dominant Variations': 'dominant',
  'Extensions & Colors': 'extensions',
};

function clickTab(el: HTMLElement, label: string): void {
  const tier = TIER_BY_LABEL[label];
  if (!tier) throw new Error(`no tier for ${label}`);
  const others = [...el.querySelectorAll('[data-facet="tier"]')]
    .filter(c => c.getAttribute('data-value') !== tier);
  if (others.length === 0) throw new Error(`no tier chips rendered for ${label}`);
  act(() => {
    for (const c of others) {
      c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
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
    // THE STRIP COUNTS CHORD x INVERSION, and the answer grid counts
    // QUALITIES — they are different numbers on purpose. The old label
    // conflated them and so understated the pool by however many
    // inversions were enabled.
    const stated = Number(/(\d+) of \d+/.exec(
      el.querySelector('[data-testid="filter-count"]')?.textContent ?? '',
    )?.[1]);
    const served = chords
      .filter(c => c.tier === 'seventh')
      .reduce((n, c) => n + servedRefsFor(c, DEFAULT_INVERSION_SETTINGS).length, 0);
    expect(stated).toBe(served);
    // The grid still offers one button per quality, and there are more
    // refs than qualities — which is the understatement being fixed.
    expect(answerNames(el).length).toBe(seededIn('seventh'));
    expect(stated).toBeGreaterThan(answerNames(el).length);
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

// ── The progression suggestion ───────────────────────────────────────

/** Enough logged attempts to clear `chordId` on the real threshold. */
function clearing(chordId: string, at = 0): AttemptRecord[] {
  return Array.from({ length: UNLOCK_MIN_ATTEMPTS }, (_, n) => ({
    id: `att-${chordId}-${n}`,
    moduleId: 'chord-recognition',
    itemId: `${chordId}:0`,
    correct: true,
    timestamp: 1_700_000_000_000 + at + n,
  }));
}

function suggestion(el: HTMLElement): Element | null {
  return el.querySelector('[data-testid="progression-suggestion"]');
}

describe('the suggestion sits where the tap was', () => {
  it('renders directly beneath the tab strip, not at the foot', async () => {
    // A notice at the bottom of the section reads as a dead control:
    // by the time you have scrolled to it you have stopped looking for
    // an answer to what you just pressed. It has to be in the same
    // column as the tabs, immediately after them.
    const el = await render();
    clickTab(el, 'Seventh Chords');
    const note = suggestion(el);
    expect(note).not.toBeNull();

    const strip = el.querySelector('[data-testid="filter-strip"]')!
      .parentElement!;
    // Siblings in one column, suggestion immediately after the strip.
    expect(note!.parentElement).toBe(strip.parentElement);
    expect(strip.nextElementSibling).toBe(note);
  });

  it('says the whole sentence, dynamically', async () => {
    const el = await render(undefined, [
      ...clearing('maj'), ...clearing('min', 100), ...clearing('dim', 200),
    ]);
    clickTab(el, 'Extensions & Colors');
    const text = suggestion(el)!.textContent ?? '';
    expect(text).toContain('Suggestion — Get solid on the foundational triads first.');
    expect(text).toContain("You've cleared 3 of 6");
    // 80, not 75 — the bar moved to the Fluent rating's on 10 Sep 2026
    // and this sentence interpolates the constant, so it moved with it.
    expect(text).toContain('10 attempts with 80% correct');
    expect(text).toContain('triad with a note added');
    expect(text).toContain('Nothing is locked');
  });

  it('the count is live rather than written down', async () => {
    // Guard the guard: the fixture above is the only reason it reads
    // 3, so a different history has to read differently.
    const el = await render(undefined, clearing('maj'));
    clickTab(el, 'Extensions & Colors');
    expect(suggestion(el)!.textContent).toContain("You've cleared 1 of 6");
  });

  it('stays quiet when nothing is selected below the lowest uncleared tier', async () => {
    // THE RULE CHANGED, AND SO DID THIS TEST. It used to assert silence
    // on `all`, because `all` was its own case that returned null. The
    // rule now names the lowest uncleared tier below the HIGHEST tier
    // selected, and does not care whether that tier is also selected —
    // so a pool holding extensions with triads uncleared speaks up,
    // and "all" is exactly such a pool.
    //
    // What is still silent is a selection with nothing beneath it.
    const el = await render();
    clickTab(el, 'Foundational Triads');
    expect(suggestion(el)).toBeNull();
  });

  it('fires when the prerequisite tier IS selected and still uncleared', async () => {
    // THE CASE A NAIVE IMPLEMENTATION LOSES. "Stay quiet if the tier is
    // selected" would silence this, and it is the state a reader is
    // most likely to be in — they widened the pool rather than jumping
    // past it. Having triads in the pool is not being solid at them.
    const el = await render(undefined, clearing('maj'));
    const chips = [...el.querySelectorAll('[data-facet="tier"]')];
    const drop = chips.filter(c => !['foundational', 'seventh'].includes(
      c.getAttribute('data-value') ?? '',
    ));
    act(() => {
      for (const c of drop) {
        c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
    const text = suggestion(el)?.textContent ?? '';
    expect(text).toContain('Get solid on the foundational triads first.');
  });

  it('goes quiet once the lower tiers are cleared', async () => {
    // Every foundational chord cleared, so there is nothing below the
    // sevenths left to ask for.
    const attempts = CHORD_SEEDS
      .filter(c => c.tier === 'foundational')
      .flatMap((c, i) => clearing(c.id, i * 100));
    const el = await render(undefined, attempts);
    clickTab(el, 'Seventh Chords');
    expect(suggestion(el)).toBeNull();
  });

  it('is not shown in focus mode, where there is no tab to open', async () => {
    const el = await render(['maj13']);
    expect(suggestion(el)).toBeNull();
  });
});

describe('dismissing it', () => {
  /**
   * ONE test, deliberately.
   *
   * The dismissal flag is module-level — that is what makes it last a
   * session rather than a render — so it does not reset between tests
   * in this file. Splitting the journey across two tests made the
   * second one depend on the first, which is a fixture leak dressed as
   * coverage. The whole journey belongs in one arc, and this describe
   * must stay last in the file.
   */
  it('goes away, and stays gone across tab changes and a remount', async () => {
    const el = await render();
    clickTab(el, 'Seventh Chords');
    // Guard the guard: it is visible before it is dismissed. If an
    // earlier test ever dismisses it, this fails here and says so
    // rather than throwing on a null button below.
    expect(suggestion(el), 'suggestion should be visible before dismissal')
      .not.toBeNull();

    const close = el.querySelector('[data-testid="dismiss-suggestion"]');
    expect(close).not.toBeNull();
    act(() => {
      close!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(suggestion(el)).toBeNull();

    // PER SESSION, not per tap: coming back on every tab change would
    // make it noise.
    clickTab(el, 'Foundational Triads');
    clickTab(el, 'Extensions & Colors');
    expect(suggestion(el)).toBeNull();

    // And not per render: a remount is a route change inside the app,
    // not the next time the app is opened.
    if (root) await act(async () => root!.unmount());
    container?.remove();
    const again = await render();
    clickTab(again, 'Seventh Chords');
    expect(suggestion(again)).toBeNull();
  });
});
