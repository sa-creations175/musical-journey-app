// @vitest-environment jsdom
/**
 * Scales & modes opening from a dashboard row tap.
 *
 * The shape here is different from the other three. Two tabs draw from
 * ONE pool, and the catalog splits every mode across them — `dorian-tab1`
 * is hearing the scale, `dorian-tab2` is naming the mode over a vamp.
 * They are different skills, so the row a player tapped said which, and
 * a tap that arrived on the right mode in the wrong tab would be
 * drilling something they did not ask for.
 *
 * So the mode travels as the pool and the skill travels as the tab, and
 * both have to land. A mode row covers both tabs and deliberately sends
 * no tab at all.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import ScalesModes from '../ScalesModes';
import { MODES } from '../catalog';
import { setPref } from '../../../../lib/userPrefs';
import { PREF_SCOPE } from '../shared';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const ROUTE = '/ear-training/scales-modes';

async function renderAt(entry: string): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[entry]}>
        <ScalesModes />
      </MemoryRouter>,
    );
  });
  // Settle past the async scope/sort hydration.
  for (let i = 0; i < 12; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return container;
}

/** Which tab is rendered — the component, not the button styling. */
function openTab(el: HTMLElement): 'scale' | 'vamp' | null {
  if (el.querySelector('[data-testid="scales-tab-scale"]')) return 'scale';
  if (el.querySelector('[data-testid="scales-tab-vamp"]')) return 'vamp';
  return null;
}

function protectionNotice(el: HTMLElement): Element | null {
  return el.querySelector('[data-testid="fluency-protection-notice"]');
}

beforeEach(async () => {
  await setPref(PREF_SCOPE, 'all');
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('the pool arrives', () => {
  it('opens unfocused with no param', async () => {
    // Guard the guard: the default really is the whole catalog, so a
    // narrowed pool below is a difference rather than the default.
    const el = await renderAt(ROUTE);
    expect(el.textContent).not.toContain('focused practice');
    expect(el.textContent).toContain(`${MODES.length} in pool`);
  });

  it('opens focused on exactly the modes it was sent', async () => {
    const el = await renderAt(`${ROUTE}?focus=dorian,phrygian,lydian,aeolian`);
    expect(el.textContent).toContain('focused practice');
    expect(el.textContent).toContain('4 modes selected');
  });

  it('counts the modes that exist, not the keys it was handed', async () => {
    // The count comes off the POOL. A stale ref counted as a mode
    // would report four while three are being drilled — and four is
    // the number that decides whether the session counts.
    const el = await renderAt(`${ROUTE}?focus=dorian,phrygian,lydian,not-a-mode`);
    expect(el.textContent).toContain('3 modes selected');
    expect(protectionNotice(el)).not.toBeNull();
  });

  it('carries focus protection in from the URL', async () => {
    const el = await renderAt(`${ROUTE}?focus=dorian`);
    expect(el.textContent).toContain('1 mode selected');
    expect(protectionNotice(el)).not.toBeNull();
  });

  it('treats an empty param as no focus at all', async () => {
    const el = await renderAt(`${ROUTE}?focus=`);
    expect(el.textContent).not.toContain('focused practice');
  });
});

describe('the tab arrives with it', () => {
  it('defaults to hearing the scale', async () => {
    const el = await renderAt(ROUTE);
    expect(openTab(el)).toBe('scale');
  });

  it('opens the vamp tab when that is the skill the row named', async () => {
    // `dorian-tab2` is naming the mode over a vamp. Landing on the
    // scale tab would drill the right mode and the wrong skill.
    const el = await renderAt(`${ROUTE}?tab=vamp&focus=dorian`);
    expect(openTab(el)).toBe('vamp');
    expect(el.textContent).toContain('1 mode selected');
  });

  it('opens the scale tab when that is the one', async () => {
    const el = await renderAt(`${ROUTE}?tab=scale&focus=dorian`);
    expect(openTab(el)).toBe('scale');
  });

  it('leaves the tab alone when the row covered both', async () => {
    // A mode row is both skills, so choosing one would silently answer
    // a question the row did not ask.
    const el = await renderAt(`${ROUTE}?focus=dorian`);
    expect(openTab(el)).toBe('scale');
    expect(el.textContent).toContain('1 mode selected');
  });

  it('ignores a tab that names nothing', async () => {
    const el = await renderAt(`${ROUTE}?tab=not-a-tab&focus=dorian`);
    expect(openTab(el)).toBe('scale');
  });
});
