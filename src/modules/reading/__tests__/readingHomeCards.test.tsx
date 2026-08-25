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
import { MemoryRouter } from 'react-router-dom';
import Reading from '../Reading';
import { readingCards, READING_SKILL_ORDER } from '../homeCards';
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

async function renderPage(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<MemoryRouter initialEntries={['/reading']}><Reading /></MemoryRouter>);
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container;
}

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
    expect(by.get('note')!.rollingTotal).toBe(2);
    expect(by.get('note')!.rollingCorrect).toBe(1);
    expect(by.get('sig')!.rollingTotal).toBe(1);
    expect(by.get('chord')!.rollingTotal).toBe(0);
  });

  it('ignores attempts from other modules', () => {
    const now = Date.now();
    const cards = readingCards(
      [{ moduleId: 'harmonic-fluency', itemId: 'note:treble:0', correct: true, timestamp: now }],
      new Map(),
      now,
    );
    expect(cards.every(c => c.rollingTotal === 0)).toBe(true);
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

  it('switches the mounted drill when a card drills, and only then', async () => {
    const el = await renderPage();
    const served = () => el.querySelector('[data-item-ref]')?.getAttribute('data-item-ref') ?? '';
    expect(readingSkillForItemRef(served())).toBe('note');

    // Expanding is not drilling: the drill must still be on notes.
    await click(card(el, 'sig').querySelector('[data-testid="category-card-toggle"]')!);
    expect(readingSkillForItemRef(served())).toBe('note');

    await click(card(el, 'sig').querySelector('[data-testid="category-card-drill"]')!);
    expect(readingSkillForItemRef(served())).toBe('sig');
  });

  it('renders a drill immediately — reading has no Start button to press', async () => {
    // Reading never had one: the drill is always mounted and serves a
    // card on arrival. Pinned so a later step does not add a Start here
    // for symmetry with harmonic fluency and change what the page IS.
    const el = await renderPage();
    expect(el.querySelector('[data-item-ref]')).not.toBeNull();
    const labels = [...el.querySelectorAll('button')].map(b => (b.textContent ?? '').toLowerCase());
    expect(labels.some(t => t.includes('start'))).toBe(false);
  });
});
