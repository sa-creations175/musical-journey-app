// @vitest-environment jsdom
/**
 * `ModuleIntro`'s two opt-in props.
 *
 * ---------------------------------------------------------------
 * OPT-IN, AND THAT IS THE TEST.
 *
 * Seven modules render this card. Harmonic fluency wanted its landing
 * page to lead with the category cards, which meant the intro shrinking
 * to a headline — but the other six asked for nothing, so the default
 * render has to be unchanged. Each case below is asserted BOTH ways:
 * with the prop and without it.
 * ---------------------------------------------------------------
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ModuleIntro from '../ModuleIntro';
import { db } from '../../lib/db';
import { getPref } from '../../lib/userPrefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const HEADLINE = 'The mental map.';
const DESCRIPTION = 'Build instant fluency in scale degrees.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function render(props: { compact?: boolean; persistKey?: string }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ModuleIntro
        headline={HEADLINE}
        description={DESCRIPTION}
        bullets={['one', 'two']}
        {...props}
      />,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
  await db.userPrefs.clear();
});

const toggle = () => container!.querySelector('button') as HTMLButtonElement;

async function click(el: HTMLButtonElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}

describe('compact', () => {
  it('hides the description until expanded', async () => {
    const el = await render({ compact: true });
    expect(el.textContent).toContain(HEADLINE);
    expect(el.textContent).not.toContain(DESCRIPTION);
    await click(toggle());
    expect(el.textContent).toContain(DESCRIPTION);
  });

  it('leaves the description showing without the prop', async () => {
    const el = await render({});
    expect(el.textContent).toContain(DESCRIPTION);
  });
});

describe('persistKey', () => {
  const KEY = 'testIntroOpen';

  it('remembers the open state across mounts', async () => {
    await render({ compact: true, persistKey: KEY });
    await click(toggle());
    expect(await getPref<boolean>(KEY, false)).toBe(true);

    // A second visit: same key, new mount.
    await act(async () => root!.unmount());
    container!.remove();
    const el = await render({ compact: true, persistKey: KEY });
    expect(el.textContent).toContain(DESCRIPTION);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('opens closed again on a second mount without the prop', async () => {
    await render({ compact: true });
    await click(toggle());
    await act(async () => root!.unmount());
    container!.remove();
    const el = await render({ compact: true });
    expect(el.textContent).not.toContain(DESCRIPTION);
  });
});
