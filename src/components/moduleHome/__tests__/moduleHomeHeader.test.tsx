// @vitest-environment jsdom
/**
 * The shared module-home header, and what it leaves out.
 *
 * =====================================================================
 * THE OMISSIONS ARE THE BEHAVIOUR.
 *
 * One component now renders the row for three module homes, and the
 * three do not carry the same data: harmonic fluency has a daily goal
 * and a calendar route, ear training and reading have neither. The
 * temptation a shared component creates is to fill the gaps — a
 * fallback goal of 30, a link to a route that 404s — so each absence is
 * pinned here.
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
import { dailyGoalKey } from '../../../lib/goalConfig';
import { setPref } from '../../../lib/userPrefs';

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
    const el = await mount({ moduleIds: ['reading'] });
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
    const el = await mount({ moduleIds: ['intervals', 'chord-recognition', 'scales-modes'] });
    expect(hot(el)!.querySelector('.tabular-nums')!.textContent).toBe('3');
  });

  it('ignores attempts from modules it was not given', async () => {
    const now = Date.now();
    await db.attempts.bulkAdd([
      attempt('reading', true, now - 3000),
      attempt('harmonic-fluency', true, now - 2000),
    ]);
    const el = await mount({ moduleIds: ['reading'] });
    expect(hot(el)!.querySelector('.tabular-nums')!.textContent).toBe('1');
  });
});

describe('the day streak, only where there is a goal', () => {
  it('is absent when no goal module is named', async () => {
    const el = await mount({ moduleIds: ['reading'] });
    // Not "0 days at goal" — absent. Reading has no goal to count
    // against, and the fallback 30 is not one the reader chose.
    expect(day(el)).toBeNull();
    expect(el.textContent).not.toContain('at goal');
    expect(el.textContent).not.toContain('📅');
  });

  it('appears, with its words, when one is', async () => {
    const now = Date.now();
    await setPref(dailyGoalKey('harmonic-fluency'), 1);
    await db.attempts.bulkAdd([attempt('harmonic-fluency', true, now - 1000)]);
    const el = await mount({ moduleIds: ['harmonic-fluency'], goalModuleId: 'harmonic-fluency' });
    expect(day(el)).not.toBeNull();
    expect(day(el)!.textContent).toContain('📅');
    expect(day(el)!.textContent).toContain('at goal');
  });

  it('says "day" for one and "days" otherwise', async () => {
    const now = Date.now();
    await setPref(dailyGoalKey('harmonic-fluency'), 1);
    await db.attempts.bulkAdd([attempt('harmonic-fluency', true, now - 1000)]);
    const el = await mount({ moduleIds: ['harmonic-fluency'], goalModuleId: 'harmonic-fluency' });
    const n = Number(day(el)!.querySelector('.tabular-nums')!.textContent);
    expect(day(el)!.lastElementChild!.textContent)
      .toBe(n === 1 ? 'day at goal' : 'days at goal');
  });
});

describe('the calendar link, only where there is a route', () => {
  it('is absent when none is given', async () => {
    const el = await mount({ moduleIds: ['reading'] });
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).not.toContain('view calendar');
  });

  it('points where it was told when there is one', async () => {
    const el = await mount({
      moduleIds: ['harmonic-fluency'],
      calendarTo: '/harmonic-fluency/calendar',
    });
    const link = el.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/harmonic-fluency/calendar');
    expect(link.textContent).toContain('view calendar');
  });
});

describe('the intro, only where there is copy', () => {
  it('renders nothing when the module has none', async () => {
    const el = await mount({ moduleIds: ['reading'] });
    // No headline, no "learn more" disclosure — not an empty card.
    expect(el.textContent).not.toContain('learn more');
  });

  it('renders the copy it is handed', async () => {
    const el = await mount({
      moduleIds: ['harmonic-fluency'],
      intro: {
        accent: 'blue',
        headline: 'A headline the module owns.',
        description: 'A description the module owns.',
        bullets: ['A bullet'],
      },
    });
    expect(el.textContent).toContain('A headline the module owns.');
  });

  it('hides it while a session is running, without discarding it', async () => {
    // HF passes `showIntro={!sessionActive}`. The copy still exists; the
    // moment is wrong for it.
    const intro = {
      accent: 'blue' as const,
      headline: 'A headline the module owns.',
      description: 'A description the module owns.',
      bullets: ['A bullet'],
    };
    const el = await mount({ moduleIds: ['harmonic-fluency'], intro, showIntro: false });
    expect(el.textContent).not.toContain('A headline the module owns.');
    // And the row above it is unaffected.
    expect(hot(el)).not.toBeNull();
  });
});
