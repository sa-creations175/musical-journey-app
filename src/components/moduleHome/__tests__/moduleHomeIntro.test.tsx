// @vitest-environment jsdom
/**
 * The "About <module>" block.
 *
 * =====================================================================
 * WHAT THE COLLAPSED ROW MUST NOT CONTAIN.
 *
 * The block exists to give a module home its vertical space back, so
 * the collapsed row is the label and the control and nothing else. A
 * sentence visible before expanding spends exactly what the collapse
 * was for — which is why the absence is asserted here rather than left
 * to the eye.
 * =====================================================================
 *
 * The colour is checked as "the module's own accent, from moduleMeta",
 * never against a hex written in this file — a test carrying the
 * literal would pass on a wrong-but-matching value.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ModuleHomeIntro from '../ModuleHomeIntro';
import { MODULE_ORDER, moduleMetaById } from '../../../lib/moduleMeta';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const SENTENCE = 'The one line the module owns.';

function mount(moduleId: string): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<ModuleHomeIntro moduleId={moduleId} description={SENTENCE} />);
  });
  return container;
}

const toggle = (el: HTMLElement) =>
  el.querySelector('[data-testid="module-home-intro-toggle"]') as HTMLButtonElement;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null;
});

describe('collapsed', () => {
  it('is the state every module home opens in', () => {
    const el = mount('harmonic-fluency');
    expect(el.querySelector('[data-testid="module-home-intro"]')!
      .getAttribute('data-expanded')).toBe('false');
    expect(toggle(el).getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the label and the control, and nothing else', () => {
    const el = mount('harmonic-fluency');
    expect(el.textContent).toContain('About');
    expect(el.textContent).toContain('harmonic fluency');
    // The whole point: no sentence, no subtitle.
    expect(el.textContent).not.toContain(SENTENCE);
    expect(el.querySelector('[data-testid="module-home-intro-body"]')).toBeNull();
  });
});

describe('expanded', () => {
  it('is where the sentence lives', () => {
    const el = mount('harmonic-fluency');
    act(() => { toggle(el).click(); });
    expect(el.textContent).toContain(SENTENCE);
  });

  it('holds the sentence and nothing else', () => {
    // No list, for any module — shapes & patterns was the last one
    // carrying bullets and they are gone with the rest.
    const el = mount('shapes-and-patterns');
    act(() => { toggle(el).click(); });
    expect(el.textContent).toContain(SENTENCE);
    expect(el.querySelector('ul')).toBeNull();
    expect(el.querySelector('li')).toBeNull();
  });

  it('closes again', () => {
    const el = mount('reading');
    act(() => { toggle(el).click(); });
    act(() => { toggle(el).click(); });
    expect(el.textContent).not.toContain(SENTENCE);
  });
});

describe('the label', () => {
  it('is the module name from moduleMeta, after the word About', () => {
    // Derived for every module, so nothing is typed per module and a
    // rename carries.
    for (const meta of MODULE_ORDER) {
      const el = mount(meta.id);
      const name = el.querySelector('[data-testid="module-home-intro-name"]') as HTMLElement;
      // The canonical label, uppercased by RENDER rather than by a
      // second string — `moduleMeta` keeps one copy of each name.
      expect(name.textContent).toBe(meta.label);
      expect(name.className).toContain('uppercase');
      expect(el.textContent).toContain(`About ${meta.label}`);
      act(() => root!.unmount());
      container!.remove();
    }
  });

  it('takes the module’s own accent, and only on the name', () => {
    const el = mount('harmonic-fluency');
    const name = el.querySelector('[data-testid="module-home-intro-name"]') as HTMLElement;
    const accent = moduleMetaById('harmonic-fluency')!.accentHex;
    // Read from moduleMeta, not written here — a literal would pass on
    // the wrong colour as easily as the right one. The DOM normalises a
    // hex to `rgb()`, so the expectation is converted rather than the
    // rendered value being matched loosely.
    const [r, g, b] = [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16));
    expect(name.style.color).toBe(`rgb(${r}, ${g}, ${b})`);
    // "About" is neither coloured nor capitalised.
    const about = name.previousElementSibling as HTMLElement;
    expect(about.textContent).toBe('About ');
    expect(about.getAttribute('style')).toBeNull();
    expect(about.className).not.toContain('uppercase');
  });

  it('falls back to the id for a module moduleMeta does not know', () => {
    const el = mount('not-a-module');
    const name = el.querySelector('[data-testid="module-home-intro-name"]') as HTMLElement;
    expect(name.textContent).toBe('not-a-module');
    expect(name.getAttribute('style')).toBeNull();
  });
});
