// @vitest-environment jsdom
/**
 * The panel accumulates, and it is not a form.
 *
 * ---------------------------------------------------------------
 * WHY THESE ARE RENDER TESTS AND THE LADDER'S ARE NOT.
 *
 * `ladderCriteria` decides WHAT the groups are, and that is tested
 * against the rules in stageAdvancement.test.ts. What is left here is
 * everything only the DOM can answer: which groups are open, which
 * marks are ticks, whether anything in a criterion row can be
 * pressed, and whether the tick lands after the first paint or is
 * already there when the row arrives.
 * ---------------------------------------------------------------
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../lib/db';
import { getPref, setPref } from '../../../lib/userPrefs';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import StageCriteriaPanel from '../StageCriteriaPanel';
import type { LadderGroup, StageCriterion } from '../stage';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const criterion = (label: string, met: boolean): StageCriterion => ({
  label, met, have: met ? 1 : 0, need: 1,
});

const GROUPS: LadderGroup[] = [
  { earns: 'comfortable', status: 'earned', criteria: [criterion('Whole-song test passed in the key of F', true)] },
  { earns: 'cross-key', status: 'current', criteria: [criterion('One key from each of the 4 quadrants', false)] },
  { earns: 'internalized', status: 'ahead', criteria: [
    criterion('A performance tempo is set for this song', true),
    criterion('Every other key run clean at tempo', false),
  ] },
];

const PREF_OPEN = 'songCriteriaPanelOpen';
const PREF_AUTO_OPENED_FOR = 'songCriteriaPanelAutoOpenedFor';

/** The panel reads its stored open state asynchronously, so every
 *  render awaits that settling. A synchronous render would assert
 *  against the pre-pref first paint, which is always closed. */
async function render(over: Partial<Parameters<typeof StageCriteriaPanel>[0]> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StageCriteriaPanel
        groups={GROUPS}
        holding={[]}
        spelling="flat"
        {...over}
      />,
    );
  });
  const el = container;
  return {
    text: () => (el.textContent ?? '').replace(/\s+/g, ' '),
    buttons: () => [...el.querySelectorAll('button')],
    ticks: () => [...el.querySelectorAll('span')].filter(s => s.textContent === '✓'),
    listItems: () => [...el.querySelectorAll('li')],
    /** The panel's own disclosure control — first button in the box. */
    toggle: () => el.querySelector('button')!,
  };
}

/** Rendered with the panel already open, which is the state most of
 *  these assertions are about. */
async function renderOpen(over: Partial<Parameters<typeof StageCriteriaPanel>[0]> = {}) {
  await setPref(PREF_OPEN, true);
  return render(over);
}

/** Default: motion allowed. Individual tests override. */
function setReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(async () => {
  setReducedMotion(false);
  await db.userPrefs.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.unstubAllGlobals();
});

describe('what is on screen', () => {
  it('counts every criterion in the ladder, not just the live rung', async () => {
    // 2 met of 4 across three groups. Counting only the current rung
    // would read "0 of 1", which is the number the old panel showed
    // and the reason earning something looked like no progress.
    expect((await renderOpen()).text()).toContain('2 of 4 met');
  });

  it('shows earned and current rungs expanded', async () => {
    const r = await renderOpen();
    expect(r.text()).toContain('Whole-song test passed in the key of F');
    expect(r.text()).toContain('One key from each of the 4 quadrants');
  });

  it('collapses a rung you have not reached to a heading and a count', async () => {
    // At Learning, a wall of criteria three rungs away reads as
    // failure rather than as a path. The heading and the count stay,
    // so the work is visible without being in the way.
    const r = await renderOpen();
    const heading = r.buttons().find(b => (b.textContent ?? '').includes('Internalized'))!;
    expect(heading.textContent).toContain('1 of 2');
    expect(r.text()).not.toContain('Every other key run clean at tempo');
  });

  it('expands that rung when it is tapped', async () => {
    const r = await renderOpen();
    const heading = r.buttons().find(b => (b.textContent ?? '').includes('Internalized'))!;
    expect(heading.getAttribute('aria-expanded')).toBe('false');
    act(() => { heading.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(r.text()).toContain('Every other key run clean at tempo');
    expect(heading.getAttribute('aria-expanded')).toBe('true');
  });

  it('does not make an open rung heading a control', async () => {
    // A heading that reports pressed state to a screen reader is a
    // heading pretending to be a button.
    const r = await renderOpen();
    const open = r.buttons().find(b => (b.textContent ?? '').includes('Comfortable'))!;
    expect(open.hasAttribute('aria-expanded')).toBe(false);
    expect(open.disabled).toBe(true);
  });

  it('puts nothing pressable inside a criterion row', async () => {
    // These are things the app observes about your playing, not
    // things you assert. You cannot tick "whole-song test passed".
    const r = await renderOpen();
    for (const li of r.listItems()) {
      expect(li.querySelector('button')).toBeNull();
      expect(li.querySelector('input')).toBeNull();
    }
  });

  it('admits that a tick can come off again', async () => {
    expect((await renderOpen()).text())
      .toContain('a tick comes off again if the key behind it lapses');
  });
});

describe('the moment a criterion is met', () => {
  const justMet = 'One key from each of the 4 quadrants';
  const metGroups: LadderGroup[] = GROUPS.map(g =>
    g.status === 'current'
      ? { ...g, criteria: [criterion(justMet, true)] }
      : g);

  it('arrives un-ticked, so the tick lands while you are looking', async () => {
    // THE LOAD-BEARING ONE. If the row mounts already ticked there is
    // no moment — the state simply differs from the one you left, and
    // the payoff for "play it, prove it, three times" is a page that
    // quietly changed while you were not watching.
    const r = await renderOpen({ groups: metGroups, justMetLabel: justMet });
    // The two other ticks (the earned rung's criterion and its
    // heading, plus Internalized's met criterion) are unaffected; the
    // one being celebrated is not among them yet.
    expect(r.text()).toContain(justMet);
    const li = r.listItems().find(l => (l.textContent ?? '').includes(justMet))!;
    expect(li.textContent).not.toContain('✓');
  });

  it('lands the tick after the paint', async () => {
    const r = await renderOpen({ groups: metGroups, justMetLabel: justMet });
    await act(async () => {
      // Two frames, matching the two the component waits for.
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    });
    const li = r.listItems().find(l => (l.textContent ?? '').includes(justMet))!;
    expect(li.textContent).toContain('✓');
  });

  it('skips the landing entirely under prefers-reduced-motion', async () => {
    // Not "animates faster" — the information has to be identical
    // with no motion at all, which is the test for whether the
    // animation was carrying meaning it should not have been.
    setReducedMotion(true);
    const r = await renderOpen({ groups: metGroups, justMetLabel: justMet });
    const li = r.listItems().find(l => (l.textContent ?? '').includes(justMet))!;
    expect(li.textContent).toContain('✓');
  });

  it('leaves every other row ticked from the start', async () => {
    // Guard the guard: a component that withheld the tick from ALL
    // rows would pass the first test for the wrong reason.
    const r = await renderOpen({ groups: metGroups, justMetLabel: justMet });
    const earned = r.listItems()
      .find(l => (l.textContent ?? '').includes('Whole-song test'))!;
    expect(earned.textContent).toContain('✓');
  });
});

describe('the panel itself is collapsed by default', () => {
  it('shows the heading and the count and nothing else', () => {
    // The grid is what the page is for; this is reference material
    // consulted occasionally. Collapsed still answers the question at
    // a glance — the rows behind it are the working.
    return render().then(r => {
      expect(r.text()).toContain('what would advance this song');
      expect(r.text()).toContain('2 of 4 met');
      expect(r.text()).not.toContain('Whole-song test passed in the key of F');
      expect(r.toggle().getAttribute('aria-expanded')).toBe('false');
    });
  });

  it('opens on tap and remembers it', async () => {
    const r = await render();
    await act(async () => {
      r.toggle().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(r.text()).toContain('Whole-song test passed in the key of F');
    expect(await getPref(PREF_OPEN, false)).toBe(true);
  });

  it('comes back open on the next visit', async () => {
    await setPref(PREF_OPEN, true);
    expect((await render()).text()).toContain('Whole-song test passed in the key of F');
  });

  it('closes again and remembers THAT', async () => {
    // Guard the guard: a panel that only ever remembers "open" would
    // pass the two above and be impossible to put away.
    await setPref(PREF_OPEN, true);
    const r = await render();
    await act(async () => {
      r.toggle().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(await getPref(PREF_OPEN, true)).toBe(false);
    expect(r.text()).not.toContain('Whole-song test passed in the key of F');
  });
});

describe('a climb opens the panel so the tick is witnessed', () => {
  const CLIMBED_AT = 1_700_000_000_000;

  it('opens a closed panel when a rung has just been earned', async () => {
    // A tick landing inside a closed box is a tick nobody sees. The
    // moment depends on the panel being on screen — collapsed, the
    // animation plays inside a closed container and the payoff is a
    // page that quietly differed.
    const r = await render({ justMetAt: CLIMBED_AT, justMetLabel: 'x' });
    expect(r.toggle().getAttribute('aria-expanded')).toBe('true');
    expect(r.text()).toContain('Whole-song test passed in the key of F');
  });

  it('opens ONCE per climb, not on every load while it stands', async () => {
    // THE LOAD-BEARING ONE. `stageEarned` persists until the next
    // practice, so "open while a climb is standing" would re-open the
    // panel on every visit and make closing it impossible. It is
    // keyed on the climb's timestamp: after the first auto-open, your
    // toggle wins.
    await render({ justMetAt: CLIMBED_AT, justMetLabel: 'x' });
    act(() => root?.unmount());
    container?.remove();
    await setPref(PREF_OPEN, false);          // the user closes it

    const again = await render({ justMetAt: CLIMBED_AT, justMetLabel: 'x' });
    expect(again.toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('opens again for a LATER climb', async () => {
    // Same guard from the other side: keying on the timestamp must
    // not mean it only ever fires once in the app's lifetime.
    await setPref(PREF_AUTO_OPENED_FOR, CLIMBED_AT);
    await setPref(PREF_OPEN, false);
    const r = await render({ justMetAt: CLIMBED_AT + 5_000, justMetLabel: 'x' });
    expect(r.toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('leaves a closed panel closed when nothing was earned', async () => {
    const r = await render({ justMetAt: null });
    expect(r.toggle().getAttribute('aria-expanded')).toBe('false');
  });
});
