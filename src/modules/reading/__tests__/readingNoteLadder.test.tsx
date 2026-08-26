// @vitest-environment jsdom
/**
 * The vertical view — the notation reference, coloured by tier.
 *
 * =====================================================================
 * NO LAYOUT ASSERTIONS HERE EITHER.
 *
 * jsdom resolves no boxes, so whether the marks clear the staff lines
 * or sit level with their letters cannot be seen from here. What is
 * pinned is that it IS the reference component rather than a second
 * staff, that the mapping from a ladder row to catalog items is the
 * many-to-one it has to be, and that the marks carry the same tier
 * classes the horizontal grid's cells carry.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import NoteLadder from '../NoteLadder';
import { noteRefsByPitch } from '../ladderRefs';
import { CLEFS, NOTE_POSITIONS, noteItemRef } from '../catalog';
import { pitchAtStaffPosition, scientificPitch } from '../pitch';
import { buildLadder } from '../../../components/staffReference/staffLadder';
import { TIER_BAR_CLASS } from '../../../lib/tier';
import type { SkillRecord } from '../../skills/registry';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const NOW = Date.UTC(2026, 7, 26, 12);

function rec(itemRef: string, tier: SkillRecord['currentTier']): SkillRecord {
  return {
    skillId: `reading:note:${itemRef}`,
    moduleId: 'reading',
    moduleLabel: 'reading',
    moduleRoute: '/reading',
    itemId: itemRef,
    name: `name of ${itemRef}`,
    category: 'Note recognition',
    skillType: 'theory',
    currentTier: tier,
    freshness: 'fresh',
    daysSince: 1,
    lastPracticed: NOW - 86400000,
    totalTime: 0,
    tags: [],
    window: [],
  };
}

/** Every catalog note item, all at the same tier unless overridden. */
const ALL: SkillRecord[] = CLEFS.flatMap(clef =>
  NOTE_POSITIONS.map(p => rec(noteItemRef(clef, p), 'untouched')));

async function mount(items: SkillRecord[], onOpen: (i: SkillRecord) => void = () => {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(<NoteLadder items={items} onOpen={onOpen} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

describe('a ladder row to catalog items', () => {
  it('places every catalog item exactly once', () => {
    const refs = [...noteRefsByPitch().values()].flat().map(r => r.itemRef);
    const expected = CLEFS.flatMap(c => NOTE_POSITIONS.map(p => noteItemRef(c, p)));
    expect(refs.slice().sort()).toEqual(expected.slice().sort());
  });

  it('gives a shared pitch one entry per clef that reaches it', () => {
    // Middle C is the case the whole mapping exists for: two items,
    // separately scheduled, on one row of the drawing.
    const at = noteRefsByPitch().get('C4') ?? [];
    expect(at.map(r => r.clef)).toEqual([...CLEFS]);
    expect(new Set(at.map(r => r.itemRef)).size).toBe(2);
  });

  it('agrees with the drill about what a position is called', () => {
    // Keyed on the same two functions the reveal caption goes through.
    for (const clef of CLEFS) {
      for (const p of NOTE_POSITIONS) {
        const id = scientificPitch(pitchAtStaffPosition(clef, p));
        expect((noteRefsByPitch().get(id) ?? []).map(r => r.itemRef))
          .toContain(noteItemRef(clef, p));
      }
    }
  });

  it('leaves the ladder rows the catalog does not reach empty', () => {
    // The ladder draws three ledger lines either side; the catalog
    // stops at two. Those outer rows map to nothing, and that gap is
    // real rather than something to fill.
    const reached = noteRefsByPitch();
    const unreached = buildLadder().filter(p => !reached.has(p.id));
    expect(unreached.length).toBeGreaterThan(0);
  });
});

describe('the drawing', () => {
  it('is the notation reference, not a second staff', async () => {
    const el = await mount(ALL);
    expect(el.querySelector('[data-testid="staff-reference"]')).not.toBeNull();
    // The furniture that makes it that drawing rather than a copy.
    expect(el.querySelector('[data-testid="staff-brace"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-ledger="true"]').length).toBeGreaterThan(0);
  });

  it('takes the mnemonic column rather than sitting beside it', async () => {
    const el = await mount(ALL);
    expect(el.querySelectorAll('[data-testid="staff-mnemonic"]')).toHaveLength(0);
    expect(el.querySelectorAll('[data-testid="staff-aside"]').length).toBeGreaterThan(0);
  });

  it('marks a shared row once per clef', async () => {
    const el = await mount(ALL);
    const marks = [...el.querySelectorAll('[data-testid="ladder-cell"]')]
      .map(m => m.getAttribute('data-item'));
    expect(marks).toContain(noteItemRef('treble', -2));
    expect(marks).toContain(noteItemRef('bass', 10));
    // And every catalog item is on the drawing, not just the shared one.
    expect(marks).toHaveLength(ALL.length);
  });

  it('paints a mark with the class the grid cell paints with', async () => {
    const el = await mount([
      rec(noteItemRef('treble', 0), 'fluent'),
      rec(noteItemRef('bass', 0), 'needsWork'),
    ]);
    const classOf = (ref: string) =>
      el.querySelector(`[data-item="${ref}"]`)!.className;
    for (const cls of TIER_BAR_CLASS.fluent.split(' ')) {
      expect(classOf(noteItemRef('treble', 0))).toContain(cls);
    }
    for (const cls of TIER_BAR_CLASS.needsWork.split(' ')) {
      expect(classOf(noteItemRef('bass', 0))).toContain(cls);
    }
    // Asymmetric on purpose: one class for both would pass a test that
    // only checked one of them.
    expect(TIER_BAR_CLASS.fluent).not.toBe(TIER_BAR_CLASS.needsWork);
  });

  it('opens the same item a grid cell opens', async () => {
    const opened: string[] = [];
    const el = await mount(ALL, i => opened.push(i.itemId));
    const mark = el.querySelector<HTMLButtonElement>(
      `[data-item="${noteItemRef('bass', 4)}"]`,
    );
    await act(async () => { mark!.click(); });
    expect(opened).toEqual([noteItemRef('bass', 4)]);
  });
});
