// @vitest-environment jsdom
/**
 * The pool row, and the one rule that makes it safe to be the pool.
 *
 * WHAT THIS CAN PROVE: which options are lit, that lighting adds and
 * unlighting removes, and that the last lit option cannot be put out.
 * WHAT IT CANNOT: how the row reads across a narrow screen. jsdom has
 * no layout engine — that needs Silas's eye.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import PoolPicker, { togglePool } from '../PoolPicker';
import { moduleMetaById } from '../../../lib/moduleMeta';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS = [
  { id: 'a', label: 'alpha' },
  { id: 'b', label: 'beta' },
  { id: 'c', label: 'gamma' },
];

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
});

function render(lit: ReadonlySet<string>, disabled = false) {
  const seen: string[] = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <PoolPicker
        options={OPTIONS}
        lit={lit}
        onToggle={id => seen.push(id)}
        moduleId="reading"
        disabled={disabled}
      />,
    );
  });
  return seen;
}

const opt = (id: string) =>
  host!.querySelector(`[data-option="${id}"]`) as HTMLButtonElement;

describe('the toggle rule', () => {
  it('adds an unlit option and removes a lit one', () => {
    expect([...togglePool(new Set(['a']), 'b')].sort()).toEqual(['a', 'b']);
    expect([...togglePool(new Set(['a', 'b']), 'b')]).toEqual(['a']);
  });

  it('refuses to leave the pool empty', () => {
    // An empty pool has no honest meaning — "nothing" cannot be served
    // and "everything" is the opposite of what unlighting looks like.
    const one = new Set(['a']);
    expect(togglePool(one, 'a')).toBe(one);
  });
});

describe('the row', () => {
  it('marks exactly what is lit', () => {
    render(new Set(['a', 'c']));
    expect(opt('a').getAttribute('data-lit')).toBe('true');
    expect(opt('b').getAttribute('data-lit')).toBe('false');
    expect(opt('c').getAttribute('data-lit')).toBe('true');
    expect(opt('a').getAttribute('aria-pressed')).toBe('true');
  });

  it('lights from the module accent, with no literal of its own', () => {
    render(new Set(['a']));
    const hex = moduleMetaById('reading')!.accentHex;
    const n = parseInt(hex.slice(1, 7), 16);
    const m = opt('a').style.backgroundColor.match(/rgba?\((\d+), (\d+), (\d+)/)!;
    expect([Number(m[1]), Number(m[2]), Number(m[3])])
      .toEqual([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    // An unlit option carries no inline colour at all.
    expect(opt('b').style.backgroundColor).toBe('');
  });

  it('will not let the last lit option be pressed out', () => {
    render(new Set(['b']));
    expect(opt('b').disabled).toBe(true);
    expect(opt('a').disabled).toBe(false);
  });

  it('goes quiet while a drill is running', () => {
    // The pool is decided when the run starts; a row that could still
    // be pressed would promise a change the card on screen will not
    // make.
    render(new Set(['a', 'b']), true);
    for (const id of ['a', 'b', 'c']) expect(opt(id).disabled, id).toBe(true);
  });

  it('reports the option pressed, never its index', () => {
    const seen = render(new Set(['a']));
    act(() => { opt('c').click(); });
    expect(seen).toEqual(['c']);
  });
});
