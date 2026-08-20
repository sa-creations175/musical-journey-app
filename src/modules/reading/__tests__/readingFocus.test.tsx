// @vitest-environment jsdom
/**
 * Reading's focus pool — the drill accepting a caller-supplied item
 * list, so a dashboard row labelled "drill 2 items" serves those two.
 *
 * The failures worth pinning are the ones where the pool is wrong
 * rather than absent: a stale ref putting a chord card in a
 * key-signature drill, or an empty pool serving nothing at all.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ReadingDrill from '../ReadingDrill';
import { readingSkillForItemRef } from '../catalog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function render(ui: React.ReactElement): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(ui); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** Re-render many times and collect which refs got served. A pool of
 *  two must never produce a third. */
async function servedRefs(
  focusRefs: string[] | undefined,
  skill: Parameters<typeof ReadingDrill>[0]['skill'],
  runs = 25,
): Promise<Set<string>> {
  const seen = new Set<string>();
  for (let i = 0; i < runs; i++) {
    const el = await render(
      <ReadingDrill skill={skill} {...(focusRefs ? { focusRefs } : {})} />,
    );
    const staff = el.querySelector('[data-item-ref]');
    if (staff) seen.add(staff.getAttribute('data-item-ref')!);
    await act(async () => root!.unmount());
    container!.remove();
    root = null;
    container = null;
  }
  return seen;
}

describe('the focus pool', () => {
  it('serves only the refs it was given', async () => {
    const pool = ['sig:2s:major:count', 'sig:2s:major:which'];
    const served = await servedRefs(pool, 'sig');
    expect(served.size).toBeGreaterThan(0);
    for (const ref of served) expect(pool).toContain(ref);
  });

  it('serves more than one when given more than one', async () => {
    // A pool that always returns its first entry would pass the test
    // above and be useless.
    const pool = [
      'sig:2s:major:count', 'sig:2s:major:which',
      'sig:3f:minor:count', 'sig:1s:major:name',
    ];
    const served = await servedRefs(pool, 'sig', 40);
    expect(served.size).toBeGreaterThan(1);
  });

  it('serves a single-ref pool every time', async () => {
    const served = await servedRefs(['sig:0:major:name'], 'sig');
    expect([...served]).toEqual(['sig:0:major:name']);
  });

  it('ignores refs belonging to another skill', async () => {
    // A stale link must not put a chord card inside a key-signature
    // drill.
    const pool = ['sig:2s:major:name', 'note:treble:0'];
    expect(readingSkillForItemRef('note:treble:0')).toBe('note');
    const served = await servedRefs(pool, 'sig');
    for (const ref of served) expect(ref.startsWith('sig:')).toBe(true);
  });

  it('falls back to the whole skill when no ref belongs to it', async () => {
    // A drill that serves nothing is worse than one that serves the
    // module.
    const served = await servedRefs(['note:treble:0'], 'sig', 15);
    expect(served.size).toBeGreaterThan(0);
    for (const ref of served) expect(ref.startsWith('sig:')).toBe(true);
  });

  it('falls back when the pool is empty', async () => {
    const served = await servedRefs([], 'sig', 15);
    expect(served.size).toBeGreaterThan(0);
  });

  it('draws from the whole skill with no pool at all', async () => {
    // The unfiltered path still works — 25 draws over 78 signature
    // items should not land on one.
    const served = await servedRefs(undefined, 'sig', 25);
    expect(served.size).toBeGreaterThan(1);
  });
});
