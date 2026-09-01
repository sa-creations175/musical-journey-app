// @vitest-environment jsdom
/**
 * One press folds every expanded module.
 *
 * =====================================================================
 * RENDERED, NOT SOURCE-SCANNED. The other three sidebar sweeps read the
 * file as text because what they assert is an absence or an order. This
 * one is a behaviour — press a thing, several other things change — and
 * the only way that can be wrong is at run time.
 *
 * IT PRESSES THE MODULE NAMES TO OPEN THEM, rather than seeding the
 * expansion pref. Pressing the name is how a module opens for a reader,
 * and it is also a navigation, so the test exercises the case that
 * settled the judgement call: the module you are inside is normally the
 * last one you opened, and it folds with the rest.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import SidebarNav, { COLLAPSE_ALL_LABEL } from '../SidebarNav';
import { db } from '../../lib/db';

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

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
}

/**
 * Wait until the nav has HYDRATED its expansion state.
 *
 * A FIXED NUMBER OF TICKS WAS NOT ENOUGH, and this file went red about
 * one run in twenty because of it. The nav reads its stored expansion
 * asynchronously and then writes the merged result back; a press that
 * lands before that read resolves is overwritten by it, so the module
 * the test just opened is closed again by the hydration and
 * `collapse all` has nothing to fold.
 *
 * The write is the signal: the persist effect only runs once hydration
 * has happened, so the row existing means the presses below will stick.
 */
async function hydrated() {
  for (let i = 0; i < 40; i++) {
    if (await db.userPrefs.get('sidebarExpandedGroups')) return;
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  throw new Error('the sidebar never hydrated its expansion state');
}

async function render(at = '/goals') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[at]}><SidebarNav /></MemoryRouter>,
    );
  });
  await hydrated();
  await settle();
  return container!;
}

const moduleName = (id: string) =>
  container!.querySelector(`[data-testid="module-nav-name"][data-module="${id}"]`) as HTMLElement;

/** Every module row currently showing its children. */
const openModules = () =>
  [...container!.querySelectorAll('[data-testid="module-nav-name"]')]
    .filter(a => a.getAttribute('aria-expanded') === 'true')
    .map(a => a.getAttribute('data-module'));

const collapseAll = () =>
  container!.querySelector('[data-testid="nav-collapse-all"]') as HTMLElement | null;

async function press(el: HTMLElement) {
  await act(async () => { el.click(); });
  await settle();
}

describe('collapse all', () => {
  it('folds every expanded module in one press', async () => {
    await render();
    await press(moduleName('harmonic-fluency'));
    await press(moduleName('reading'));
    await press(moduleName('shapes-and-patterns'));
    expect(openModules().sort())
      .toEqual(['harmonic-fluency', 'reading', 'shapes-and-patterns']);

    await press(collapseAll()!);
    expect(openModules()).toEqual([]);
  });

  it('folds the module you are standing in too', async () => {
    // Pressing a module name navigates as well as expanding, so the
    // last one opened is the one you are inside. Exempting it would
    // leave open exactly the one just asked for — see the header of
    // SidebarNav's collapse-all block.
    await render();
    await press(moduleName('shapes-and-patterns'));
    await press(collapseAll()!);
    expect(openModules()).toEqual([]);
  });

  it('folds a nested disclosure with its module', async () => {
    // Ear Training's Chord Progressions has a disclosure of its own and
    // its own key in the same expansion map.
    const el = await render();
    await press(moduleName('ear-training'));
    const nested = [...el.querySelectorAll('[aria-expanded]')]
      .find(a => (a.textContent ?? '').startsWith('Chord Progressions')) as HTMLElement;
    expect(nested, 'the nested row is there').toBeDefined();
    await press(nested);
    expect(nested.getAttribute('aria-expanded')).toBe('true');

    await press(collapseAll()!);
    expect(openModules()).toEqual([]);
    expect(
      [...el.querySelectorAll('[aria-expanded="true"]')]
        .map(a => (a.textContent ?? '').trim())
        .filter(t => t.startsWith('Chord Progressions')),
    ).toEqual([]);
  });

  it('leaves the group headers alone', async () => {
    // A group is the section modules live in, not a module. Folding
    // those would empty the nav rather than tidy it.
    const el = await render();
    await press(moduleName('reading'));
    const groupsOpen = () =>
      [...el.querySelectorAll('nav > div > button[aria-expanded]')]
        .filter(b => b.getAttribute('aria-expanded') === 'true').length;
    const before = groupsOpen();
    expect(before).toBeGreaterThan(0);
    await press(collapseAll()!);
    expect(groupsOpen()).toBe(before);
  });

  it('is not offered when there is nothing to fold', async () => {
    // A control that cannot do anything is decoration — the same call
    // the axis toggle makes for an axis with one ordering.
    await render();
    expect(collapseAll()).toBeNull();
    await press(moduleName('reading'));
    expect(collapseAll()).not.toBeNull();
    await press(collapseAll()!);
    expect(collapseAll()).toBeNull();
  });

  it('says so in the words it was asked for in', async () => {
    await render();
    await press(moduleName('reading'));
    expect(collapseAll()!.textContent).toBe(COLLAPSE_ALL_LABEL);
  });

  it('is remembered, so the modules are still folded next visit', async () => {
    await render();
    await press(moduleName('reading'));
    await press(moduleName('harmonic-fluency'));
    await press(collapseAll()!);

    await act(async () => root!.unmount());
    container!.remove();
    const el = await render();
    void el;
    expect(openModules()).toEqual([]);
  });
});
