// @vitest-environment jsdom
/**
 * Ear training's four sub-module cards — the page that runs no drill.
 *
 * The asymmetry is the thing under test: no Start button, and a card
 * that navigates rather than filtering. Both halves are asserted,
 * because "renders no Start" passes trivially on a page that renders
 * nothing at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import EarTraining from '../EarTraining';
import {
  EAR_TRAINING_SUB_MODULES, earTrainingCards, earTrainingRouteFor,
} from '../homeCards';
import { earTrainingCounts } from '../../../lib/moduleItemCounts';
import { INTERVAL_SEEDS, intervalItemRefs } from '../intervals/seed';
import { moduleMetaById } from '../../../lib/moduleMeta';
import type { AttemptRecord } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let liveAttempts: AttemptRecord[] = [];
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => liveAttempts }));
vi.mock('../../../lib/useSpacingIntervals', async (orig) => {
  const actual = await orig<typeof import('../../../lib/useSpacingIntervals')>();
  return { ...actual, useSpacingIntervals: () => new Map<string, number>() };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Where() {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname}</span>;
}

async function renderPage(attempts: AttemptRecord[] = []): Promise<HTMLDivElement> {
  liveAttempts = attempts;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={['/ear-training']}>
        <Where />
        <Routes>
          <Route path="/ear-training" element={<EarTraining />} />
          <Route path="/ear-training/:sub" element={<span>sub module page</span>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return container;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null; liveAttempts = [];
});

const card = (el: HTMLElement, key: string) =>
  el.querySelector(`[data-card-key="${key}"]`) as HTMLElement;
const where = (el: HTMLElement) => el.querySelector('[data-testid="where"]')!.textContent;

async function click(el: Element) {
  await act(async () => { (el as HTMLElement).click(); });
}

describe('the page runs no drill', () => {
  it('renders four cards AND no Start button — both halves', async () => {
    // Both, deliberately. "No Start" alone passes on a blank page.
    const el = await renderPage();
    expect([...el.querySelectorAll('[data-card-key]')]).toHaveLength(4);
    const labels = [...el.querySelectorAll('button')]
      .map(b => (b.textContent ?? '').toLowerCase());
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some(t => t.includes('start'))).toBe(false);
  });

  it('calls the action "open module" rather than "drill category"', async () => {
    // It lands on a page with a play button, not on a question. Naming
    // it "drill" would promise something this page cannot deliver.
    const el = await renderPage();
    await click(card(el, 'intervals').querySelector('[data-testid="category-card-toggle"]')!);
    const btn = card(el, 'intervals')
      .querySelector('[data-testid="category-card-drill"]')!;
    expect(btn.textContent).toBe('open module');
  });
});

describe('a card navigates', () => {
  it('goes to that sub-module route, and only on the action button', async () => {
    const el = await renderPage();
    expect(where(el)).toBe('/ear-training');

    // Expanding must not navigate — losing your place by brushing the
    // screen is worse here than anywhere, because it is a route change.
    await click(card(el, 'scales-modes').querySelector('[data-testid="category-card-toggle"]')!);
    expect(where(el)).toBe('/ear-training');

    await click(card(el, 'scales-modes').querySelector('[data-testid="category-card-drill"]')!);
    expect(where(el)).toBe('/ear-training/scales-modes');
  });

  it('routes every sub-module to its own page', () => {
    // ASYMMETRIC: four distinct routes, so a lookup returning one
    // constant would collapse them.
    const routes = EAR_TRAINING_SUB_MODULES.map(m => earTrainingRouteFor(m.id));
    expect(routes).toEqual(EAR_TRAINING_SUB_MODULES.map(m => m.route));
    expect(new Set(routes).size).toBe(4);
  });

  it('has no route for a key it does not own', () => {
    expect(earTrainingRouteFor('harmonic-fluency')).toBeNull();
  });
});

describe('counts and tint come from the shared sources', () => {
  it('takes every count from earTrainingCounts(), not a written number', () => {
    const counts = earTrainingCounts();
    const by = new Map(earTrainingCards([], new Map(), Date.now())
      .map(c => [c.key, c.itemCount]));
    expect(by.get('intervals')).toBe(counts.intervals);
    expect(by.get('chord-recognition')).toBe(counts.chordRecognition);
    expect(by.get('chord-progressions')).toBe(counts.chordProgressions);
    expect(by.get('scales-modes')).toBe(counts.scalesModes);
    // Asymmetric: the four differ, so one constant cannot satisfy them.
    expect(new Set(by.values()).size).toBeGreaterThan(1);
  });

  it('follows the SEED LIST for intervals, not a literal or a multiplier', async () => {
    // The card reads 25, not 26. The old count was
    // `INTERVAL_SEEDS.length * 2`, which is right about the code and
    // wrong about the music — a unison has one case. Asserted against
    // the ref list so adding an interval moves the card without anyone
    // editing a number here.
    const el = await renderPage();
    const shown = card(el, 'intervals')
      .querySelector('[data-testid="category-card-count"]')!.textContent;
    expect(shown).toBe(`0/${intervalItemRefs().length}`);
    expect(intervalItemRefs()).toHaveLength(25);
    expect(intervalItemRefs()).not.toContain('P1:desc');
    // Asymmetric: a plain seeds × 2 would give 26 and pass a looser
    // check, so pin that the two differ.
    expect(intervalItemRefs().length).not.toBe(INTERVAL_SEEDS.length * 2);
  });

  it('tints all four from the PARENT module, not four sub-module hexes', async () => {
    // moduleMeta already gives the four sub-modules one shared green.
    // Reading the parent keeps that true even if a sub-module entry
    // ever diverges — the page is one module to the reader.
    const el = await renderPage();
    const hex = moduleMetaById('ear-training')!.accentHex;
    const n = parseInt(hex.slice(1, 7), 16);
    const expected = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (const mod of EAR_TRAINING_SUB_MODULES) {
      const toggle = card(el, mod.id)
        .querySelector('[data-testid="category-card-toggle"]') as HTMLElement;
      const m = toggle.style.backgroundColor.match(/rgba?\((\d+), (\d+), (\d+)/)!;
      expect([Number(m[1]), Number(m[2]), Number(m[3])]).toEqual(expected);
    }
  });

  it('buckets attempts by sub-module, ignoring the others', () => {
    // ASYMMETRIC counts per module, so a bucketing that merged them
    // would not match.
    const now = Date.now();
    const att = (moduleId: string, itemId: string): AttemptRecord =>
      ({ moduleId, itemId, correct: true, timestamp: now });
    const cards = earTrainingCards(
      [
        att('intervals', 'M3:asc'),
        att('intervals', 'm7:desc'),
        att('scales-modes', 'dorian'),
        att('harmonic-fluency', 'sdm-1'),
      ],
      new Map(),
      now,
    );
    const by = new Map(cards.map(c => [c.key, c.rollingTotal]));
    expect(by.get('intervals')).toBe(2);
    expect(by.get('scales-modes')).toBe(1);
    expect(by.get('chord-recognition')).toBe(0);
    expect(by.get('chord-progressions')).toBe(0);
  });
});
