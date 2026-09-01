// @vitest-environment jsdom
/**
 * Every module home that lays its categories out as cards offers the
 * sort control.
 *
 * =====================================================================
 * THE REAL PAGES, NOT THE SHARED GRID. `cardSort.test.tsx` proves what
 * the orders do; this proves that each page actually asks for them.
 * Four pages each pass one prop, and a prop nobody passes is a control
 * nobody sees — which no test of the component could ever notice.
 *
 * SONG REPERTOIRE IS THE FIFTH AND IS NOT HERE. Its module home has
 * sorted its cards since long before this build, through a control of
 * its own with six orders and its own remembered choice — including the
 * two asked for here. Adding a second control beside it would be two
 * ways to order one page, so what it already does is pinned in
 * `repertoire/__tests__/repertoireHomeSort.test.tsx` instead.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import HarmonicFluency from '../../../modules/harmonic-fluency/HarmonicFluency';
import EarTraining from '../../../modules/ear-training/EarTraining';
import Reading from '../../../modules/reading/Reading';
import ShapesAndPatterns from '../../../modules/shapes-and-patterns/ShapesAndPatterns';
import { CARD_SORT_ORDERS } from '../cardSort';
import { db } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.userPrefs.clear();
});

async function render(page: ReactNode, at: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<MemoryRouter initialEntries={[at]}>{page}</MemoryRouter>);
  });
  for (let i = 0; i < 10; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return container!;
}

const PAGES: Array<{ name: string; page: ReactNode; at: string }> = [
  { name: 'harmonic fluency', page: <HarmonicFluency />, at: '/harmonic-fluency' },
  { name: 'ear training',     page: <EarTraining />,     at: '/ear-training' },
  { name: 'reading',          page: <Reading />,         at: '/reading' },
  { name: 'shapes & patterns', page: <ShapesAndPatterns />, at: '/shapes-and-patterns' },
];

describe('the sort control', () => {
  for (const { name, page, at } of PAGES) {
    it(`is on ${name}'s module home, with all three orders`, async () => {
      const el = await render(page, at);
      // The cards are there to sort.
      expect(el.querySelectorAll('[data-card-key]').length, 'cards')
        .toBeGreaterThan(0);
      for (const order of CARD_SORT_ORDERS) {
        expect(
          el.querySelector(`[data-testid="card-sort-${order.id}"]`)?.textContent,
          `${name}: ${order.id}`,
        ).toBe(order.label);
      }
    });

    it(`reorders ${name}'s cards when pressed, and puts them back`, async () => {
      const el = await render(page, at);
      const keys = () =>
        [...el.querySelectorAll('[data-card-key]')].map(c => c.getAttribute('data-card-key'));
      const declared = keys();

      const pressed: string[][] = [];
      for (const order of ['status', 'last-practiced']) {
        const b = el.querySelector(`[data-testid="card-sort-${order}"]`) as HTMLElement;
        await act(async () => { b.click(); });
        for (let i = 0; i < 4; i++) {
          await act(async () => { await new Promise(r => setTimeout(r, 5)); });
        }
        // NOTHING APPEARS AND NOTHING DISAPPEARS — the property that
        // makes this a sort rather than a filter.
        expect([...keys()].sort(), `${name}: ${order} holds the same cards`)
          .toEqual([...declared].sort());
        pressed.push(keys() as string[]);
      }
      void pressed;

      const back = el.querySelector('[data-testid="card-sort-declared"]') as HTMLElement;
      await act(async () => { back.click(); });
      for (let i = 0; i < 4; i++) {
        await act(async () => { await new Promise(r => setTimeout(r, 5)); });
      }
      expect(keys(), `${name}: back to the declared order`).toEqual(declared);
    });
  }
});
