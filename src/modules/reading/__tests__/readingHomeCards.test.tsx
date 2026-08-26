// @vitest-environment jsdom
/**
 * Reading's four skill cards, and what replacing the tab strip had to
 * preserve.
 *
 * Rendered as the WHOLE PAGE rather than as a grid in isolation,
 * because the two things worth pinning here are page-level: that
 * "drill category" switches the mounted drill, and that the remount key
 * is still the skill and nothing else.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Reading from '../Reading';
import ReadingSkill from '../ReadingSkill';
import { readingCards, READING_SKILL_ORDER } from '../homeCards';
import { mixedDrillLabel } from '../../../components/moduleHome/mixedDrillLabel';
import { readingCounts } from '../../../lib/moduleItemCounts';
import {
  SIGNATURES, noteItemRef, readingSkillForItemRef, signatureItemRef,
} from '../catalog';
import { moduleMetaById } from '../../../lib/moduleMeta';
import type { AttemptRecord } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/**
 * The module and its four skill pages, mounted together.
 *
 * BOTH ROUTES, ALWAYS. "Open goes to the skill's page" is a claim about
 * a journey between two pages, and a harness that mounted only one of
 * them could not tell a navigation from a no-op — which is exactly the
 * defect being fixed: Open used to leave the reader where they were.
 */
function Probe() {
  const location = useLocation();
  return <span data-testid="at" data-path={location.pathname} />;
}

async function renderAt(path: string): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <Routes>
          <Route path="/reading" element={<Reading />} />
          <Route path="/reading/:skill" element={<ReadingSkill />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container;
}

const renderPage = () => renderAt('/reading');

/**
 * Wait for something the page cannot produce in one tick.
 *
 * The detail stack is gated on TWO async reads — the remembered axis
 * views and a registry walk over every module — so a single
 * `setTimeout(0)` is enough only when nothing else is competing for the
 * event loop. Asserting on it after one tick passes alone and fails in
 * a full run, which is the worst kind of test.
 */
async function settle(until: () => boolean, tries = 20): Promise<void> {
  for (let i = 0; i < tries && !until(); i += 1) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
}

const detailKeys = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-detail-key]')].map(d => d.getAttribute('data-detail-key'));

const at = () =>
  container!.querySelector('[data-testid="at"]')!.getAttribute('data-path');

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

const cardKeys = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-card-key]')].map(c => c.getAttribute('data-card-key'));

const card = (el: HTMLElement, key: string) =>
  el.querySelector(`[data-card-key="${key}"]`) as HTMLElement;

async function click(el: Element) {
  await act(async () => { (el as HTMLElement).click(); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}

describe('the adapter', () => {
  it('buckets attempts by the skill parsed out of the itemRef', () => {
    // `itemId` IS the reading itemRef; the skill is parsed back out
    // rather than stored twice. ASYMMETRIC — three skills, different
    // counts, so a bucketing that collapsed them would not match.
    // Built with the catalog's own ref builders, not hand-written. A
    // hand-written `sig:c-major:name` does NOT parse — it omits the
    // mode — and every attempt would have landed in no bucket at all,
    // which the fixture guard below is here to catch.
    const sig = signatureItemRef(SIGNATURES[0].id, 'major', 'name');
    const note = noteItemRef('treble', 0);
    const now = Date.now();
    const att = (itemId: string, correct: boolean): AttemptRecord =>
      ({ moduleId: 'reading', itemId, correct, timestamp: now });
    // Guard the fixture itself: a ref that stopped parsing would make
    // this test pass by putting everything in the same empty bucket.
    expect(readingSkillForItemRef(sig)).toBe('sig');
    expect(readingSkillForItemRef(note)).toBe('note');

    const cards = readingCards(
      [att(note, true), att(note, false), att(sig, true)],
      new Map(),
      now,
    );
    const by = new Map(cards.map(c => [c.key, c]));
    expect(by.get('note')!.accuracy!.rollingTotal).toBe(2);
    expect(by.get('note')!.accuracy!.rollingCorrect).toBe(1);
    expect(by.get('sig')!.accuracy!.rollingTotal).toBe(1);
    expect(by.get('chord')!.accuracy!.rollingTotal).toBe(0);
  });

  it('ignores attempts from other modules', () => {
    const now = Date.now();
    const cards = readingCards(
      [{ moduleId: 'harmonic-fluency', itemId: 'note:treble:0', correct: true, timestamp: now }],
      new Map(),
      now,
    );
    expect(cards.every(c => c.accuracy!.rollingTotal === 0)).toBe(true);
  });

  it('takes every count from readingCounts(), not a written number', () => {
    const counts = readingCounts();
    const by = new Map(readingCards([], new Map(), Date.now()).map(c => [c.key, c.itemCount]));
    expect(by.get('note')).toBe(counts.noteRecognition);
    expect(by.get('shape')).toBe(counts.notationShapes);
    expect(by.get('sig')).toBe(counts.keySignatures);
    expect(by.get('chord')).toBe(counts.chordIdentification);
    // Asymmetric: the four differ, so one constant cannot satisfy them.
    expect(new Set(by.values()).size).toBeGreaterThan(1);
  });
});

describe('the page', () => {
  it('renders one card per skill, in the drill order and not sorted', () => {
    // ASYMMETRIC: note/shape/sig/chord is neither alphabetical nor its
    // own reverse, so a grid that sorted would differ.
    return renderPage().then(el => {
      expect(cardKeys(el)).toEqual([...READING_SKILL_ORDER]);
      expect(cardKeys(el)).not.toEqual([...READING_SKILL_ORDER].sort());
    });
  });

  it('tints from moduleMeta — the SEPIA copy is gone, not moved', async () => {
    const el = await renderPage();
    const toggle = card(el, 'note')
      .querySelector('[data-testid="category-card-toggle"]') as HTMLElement;
    const m = toggle.style.backgroundColor.match(/rgba?\((\d+), (\d+), (\d+)/)!;
    const hex = moduleMetaById('reading')!.accentHex;
    const n = parseInt(hex.slice(1, 7), 16);
    expect([Number(m[1]), Number(m[2]), Number(m[3])])
      .toEqual([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  });

  it('sends Open to the skill\u2019s own page, and goes nowhere before that', async () => {
    // OPEN USED TO STAY PUT. The drill lived under the cards on this
    // page, so pressing Open on a card set a variable and started a
    // question further down the page the reader was already on.
    const el = await renderPage();
    expect(at()).toBe('/reading');

    // Expanding is not opening.
    await click(card(el, 'sig').querySelector('[data-testid="category-card-toggle"]')!);
    expect(at()).toBe('/reading');

    await click(card(el, 'sig').querySelector('[data-testid="category-card-drill"]')!);
    expect(at()).toBe('/reading/signatures');
  });

  it('carries no drill of its own at all', async () => {
    // The home is its cards. Not an un-started drill under them — none.
    const el = await renderPage();
    expect(el.querySelector('[data-item-ref]')).toBeNull();
    expect(el.querySelector('[data-testid="reading-drill"]')).toBeNull();
  });

  it('opens the SKILL PAGE with nothing served and no clock running', async () => {
    // ARRIVING IS NOT STARTING — the rule this has always pinned, and
    // the reason it matters is unchanged: serving on mount would start
    // `elapsedMs` while the reader was still reading, so the first
    // timing of every visit would measure browsing rather than
    // answering.
    //
    // WHAT MOVED is how strongly the page says it. The drill used to be
    // mounted here always, rendering an invisible marker so that "no
    // card" and "no clock" could be told apart as the separate facts
    // they are. It is no longer mounted at all, which says both at once
    // and leaves nothing to assert them on.
    const el = await renderAt('/reading/signatures');
    expect(el.querySelector('[data-item-ref]'), 'a card was served').toBeNull();
    expect(el.querySelector('[data-testid="reading-drill"]'), 'a drill was mounted')
      .toBeNull();
  });

  it('shows the three things a category page shows, and no cards', async () => {
    // SHAPED LIKE HARMONIC FLUENCY'S CATEGORY PAGE: the chip row, Start
    // Drill, and this skill's detail block. The four summary cards that
    // stood between them are gone — they described the pool the row
    // above already shows, and Open on one unfolded a drill instead of
    // opening anything.
    const el = await renderAt('/reading/signatures');
    expect(el.querySelector('[data-testid="pool-picker"]'), 'the chip row').not.toBeNull();
    expect(el.querySelector('[data-testid="reading-skill-start"]'), 'Start Drill')
      .not.toBeNull();
    await settle(() => el.querySelector('[data-detail-key="sig"]') !== null);
    expect(
      el.querySelector('[data-detail-key="sig"]')?.getAttribute('data-expanded'),
      'its own detail block, expanded',
    ).toBe('true');
    expect(el.querySelectorAll('[data-card-key]'), 'no summary cards').toHaveLength(0);
  });

  it('starts on the skill page only when Start Drill is pressed', async () => {
    // The asker used to be a card's Open. It is the page's own Start
    // Drill now — the same button harmonic fluency's category page
    // carries — and it serves this skill, not the whole module.
    const el = await renderAt('/reading/signatures');
    expect(el.querySelector('[data-item-ref]')).toBeNull();

    await click(el.querySelector('[data-testid="reading-skill-start"]')!);
    const served = el.querySelector('[data-item-ref]')?.getAttribute('data-item-ref') ?? '';
    expect(readingSkillForItemRef(served)).toBe('sig');
  });

  it('sends a slug that names no skill back to the module home', async () => {
    await renderAt('/reading/tablature');
    expect(at()).toBe('/reading');
  });

  it('starts the home\u2019s drill across all four skills', async () => {
    // THE HOME RUN IS THE WHOLE MODULE, asserted at the seam rather
    // than by answering a queue: `data-pool` is what selection actually
    // draws from, and a run over one skill would name one skill here.
    const el = await renderPage();
    const start = el.querySelector('[data-testid="reading-start-all"]');
    expect(start).not.toBeNull();
    // ONE LABEL, BOTH HOMES, and its count derived from the pool the
    // button starts — so a skill added to the module moves the number
    // rather than leaving "all four" behind.
    expect(start!.textContent).toBe(mixedDrillLabel(READING_SKILL_ORDER.length));
    await click(el.querySelector('[data-testid="reading-start-all"]')!);
    expect(el.querySelector('[data-pool]')?.getAttribute('data-pool'))
      .toBe(READING_SKILL_ORDER.join(','));
    // And it is actually running — a card is on screen.
    expect(el.querySelector('[data-item-ref]')).not.toBeNull();
  });

  it('lights the neighbours of a skill from its own page', async () => {
    const el = await renderAt('/reading/notes');
    const lit = () => [...el.querySelectorAll('[data-testid="pool-option"]')]
      .filter(b => b.getAttribute('data-lit') === 'true')
      .map(b => b.getAttribute('data-option'));
    expect(lit()).toEqual(['note']);
    await click(el.querySelector('[data-option="sig"]')!);
    expect(lit().sort()).toEqual(['note', 'sig']);
    // And the DETAIL BLOCKS under the row follow the pool, so the row
    // and what the page shows cannot disagree about the drill's set.
    // (It was the cards that followed it before; they are gone, and the
    // blocks are what is derived from `lit` now.)
    await settle(() => detailKeys(el).length === 2);
    expect(detailKeys(el).sort()).toEqual(['note', 'sig']);
  });
});
