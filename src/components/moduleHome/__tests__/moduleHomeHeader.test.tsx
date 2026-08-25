// @vitest-environment jsdom
/**
 * The shared module-home header, and what it leaves out.
 *
 * =====================================================================
 * THE OMISSIONS ARE THE BEHAVIOUR.
 *
 * One component renders this row for every module home, and the modules
 * do not all record the same thing: some grade answers, some record a
 * duration and a self-rating. The temptation a shared component creates
 * is to show every part everywhere — a run of "correct" answers on a
 * module that never marks one — so each absence is pinned here.
 * =====================================================================
 *
 * NO LAYOUT ASSERTIONS. jsdom has no layout engine, so nothing here
 * claims the row is right-aligned or that it costs no extra height.
 * Those are for the app.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import ModuleHomeHeader, { type ModuleHomeHeaderProps } from '../ModuleHomeHeader';
import { db, newAttemptId, type AttemptRecord } from '../../../lib/db';


(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(props: ModuleHomeHeaderProps): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<MemoryRouter><ModuleHomeHeader {...props} /></MemoryRouter>);
  });
  // Bounded, like the page tests: the figures arrive from Dexie.
  for (let i = 0; i < 20; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    if (container.querySelector('[data-kind="hot"] .tabular-nums')?.textContent !== '0') break;
  }
  return container;
}

const attempt = (moduleId: string, correct: boolean, ts: number): AttemptRecord => ({
  id: newAttemptId(), moduleId, itemId: 'x', correct, timestamp: ts,
});

beforeEach(async () => {
  await db.attempts.clear();
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.attempts.clear();
});

const hot = (el: HTMLElement) => el.querySelector('[data-testid="hf-streak"][data-kind="hot"]');
const day = (el: HTMLElement) => el.querySelector('[data-testid="hf-streak"][data-kind="day"]');

describe('the flame', () => {
  it('counts consecutive correct answers for the module', async () => {
    const now = Date.now();
    await db.attempts.bulkAdd([
      attempt('reading', false, now - 4000),
      attempt('reading', true, now - 3000),
      attempt('reading', true, now - 2000),
      attempt('reading', true, now - 1000),
    ]);
    const el = await mount({ moduleIds: ['reading'], moduleId: 'reading' });
    expect(hot(el)!.querySelector('.tabular-nums')!.textContent).toBe('3');
    expect(hot(el)!.textContent).toContain('🔥');
    expect(hot(el)!.textContent).toContain('correct in a row');
  });

  it('reads across every module id it is given', async () => {
    // Ear training's home sits above four sub-modules that each write
    // under their own id; the row is about the session, not the drill.
    const now = Date.now();
    await db.attempts.bulkAdd([
      attempt('intervals', true, now - 3000),
      attempt('chord-recognition', true, now - 2000),
      attempt('scales-modes', true, now - 1000),
    ]);
    const el = await mount({ moduleIds: ['intervals', 'chord-recognition', 'scales-modes'], moduleId: 'ear-training' });
    expect(hot(el)!.querySelector('.tabular-nums')!.textContent).toBe('3');
  });

  it('ignores attempts from modules it was not given', async () => {
    const now = Date.now();
    await db.attempts.bulkAdd([
      attempt('reading', true, now - 3000),
      attempt('harmonic-fluency', true, now - 2000),
    ]);
    const el = await mount({ moduleIds: ['reading'], moduleId: 'reading' });
    expect(hot(el)!.querySelector('.tabular-nums')!.textContent).toBe('1');
  });
});

describe('the day streak', () => {
  it('counts days practised, and every module has one', async () => {
    // No goal is stored, so the module is on the shipped default:
    // "any practice". A day counts because something was recorded,
    // never because a number was cleared.
    const now = Date.now();
    await db.attempts.bulkAdd([attempt('reading', true, now - 1000)]);
    const el = await mount({ moduleIds: ['reading'], moduleId: 'reading' });
    expect(day(el)).not.toBeNull();
    expect(day(el)!.querySelector('.tabular-nums')!.textContent).toBe('1');
  });

  it('uses the settled wording', async () => {
    const el = await mount({ moduleIds: ['reading'], moduleId: 'reading' });
    expect(day(el)!.textContent).toContain('day streak');
    // The old label counted days against a target; this one counts days.
    expect(el.textContent).not.toContain('at goal');
  });

  it('is zero, not absent, for a module never practised', async () => {
    const el = await mount({ moduleIds: ['reading'], moduleId: 'reading' });
    expect(day(el)).not.toBeNull();
    expect(day(el)!.querySelector('.tabular-nums')!.textContent).toBe('0');
  });
});

describe('"correct in a row" only where answers are graded', () => {
  it('is shown for a module that records right and wrong', async () => {
    const el = await mount({ moduleIds: ['reading'], moduleId: 'reading' });
    expect(hot(el)).not.toBeNull();
  });

  it('is absent for a module that records duration and a self-rating', async () => {
    const el = await mount({
      moduleIds: ['shapes-and-patterns'],
      moduleId: 'shapes-and-patterns',
      gradesAnswers: false,
    });
    expect(hot(el)).toBeNull();
    expect(el.textContent).not.toContain('correct in a row');
    // The day streak and the calendar are still its own.
    expect(day(el)).not.toBeNull();
  });
});

describe('the calendar link, only where there is a route', () => {
  it('is absent when none is given', async () => {
    const el = await mount({ moduleIds: ['reading'], moduleId: 'reading' });
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).not.toContain('view calendar');
  });

  it('points where it was told when there is one', async () => {
    const el = await mount({
      moduleIds: ['harmonic-fluency'],
      moduleId: 'harmonic-fluency',
      calendarTo: '/harmonic-fluency/calendar',
    });
    const link = el.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/harmonic-fluency/calendar');
    // The settled wording, with no trailing arrow.
    expect(link.textContent).toBe('view calendar');
  });
});

describe('the intro, only where there is copy', () => {
  it('renders nothing when the module has none', async () => {
    const el = await mount({ moduleIds: ['reading'], moduleId: 'reading' });
    expect(el.querySelector('[data-testid="module-home-intro"]')).toBeNull();
  });

  it('renders the copy it is handed', async () => {
    const el = await mount({
      moduleIds: ['harmonic-fluency'],
      moduleId: 'harmonic-fluency',
      intro: { description: 'A description the module owns.', bullets: ['A bullet'] },
    });
    // The block is there, and closed: the sentence is behind the
    // expand, not in the collapsed row.
    expect(el.querySelector('[data-testid="module-home-intro"]')).not.toBeNull();
    expect(el.textContent).not.toContain('A description the module owns.');
  });

  it('hides it while a session is running, without discarding it', async () => {
    // HF passes `showIntro={!sessionActive}`. The copy still exists; the
    // moment is wrong for it.
    const intro = { description: 'A description the module owns.', bullets: ['A bullet'] };
    const el = await mount({ moduleIds: ['harmonic-fluency'], moduleId: 'harmonic-fluency', intro, showIntro: false });
    expect(el.querySelector('[data-testid="module-home-intro"]')).toBeNull();
    // And the row above it is unaffected.
    expect(hot(el)).not.toBeNull();
  });
});
