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
import PoolPicker from '../PoolPicker';
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

function render(lit: ReadonlySet<string>, disabled = false, locked?: string) {
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
        {...(locked !== undefined ? { locked } : {})}
        disabled={disabled}
      />,
    );
  });
  return seen;
}

/** As `render`, with the Select All control wired. Returns what the
 *  control handed back. */
function renderWithSelectAll(lit: ReadonlySet<string>, disabled = false) {
  const asked: string[][] = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <PoolPicker
        options={OPTIONS}
        lit={lit}
        onToggle={() => {}}
        onSelectAll={ids => asked.push(ids)}
        moduleId="reading"
        locked="a"
        disabled={disabled}
      />,
    );
  });
  return asked;
}

const selectAll = () =>
  host!.querySelector('[data-testid="pool-select-all"]') as HTMLButtonElement | null;

const opt = (id: string) =>
  host!.querySelector(`[data-option="${id}"]`) as HTMLButtonElement;

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

  it('will not let the locked option be pressed out', () => {
    // THE POOL CANNOT GO EMPTY, and this is why: on a category page the
    // locked option is the page's own category. A chip that could put
    // it out would leave the reader on a page for a category they had
    // just excluded.
    render(new Set(['b', 'c']), false, 'b');
    expect(opt('b').disabled).toBe(true);
    expect(opt('b').getAttribute('data-locked')).toBe('true');
    expect(opt('c').disabled).toBe(false);
    expect(opt('c').getAttribute('data-locked')).toBeNull();
  });

  it('locks nothing when no option is locked', () => {
    render(new Set(['a']));
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

describe('Select All', () => {
  it('is not drawn for a row that did not ask for it', () => {
    render(new Set(['a']));
    expect(selectAll()).toBeNull();
  });

  it('sits WITH the chips, in the same row', () => {
    // Not above them: it is one more thing you press to change what is
    // lit. A sibling of the chips, sharing their parent.
    renderWithSelectAll(new Set(['a']));
    const row = host!.querySelector('[data-testid="pool-picker"]')!;
    expect(selectAll()!.parentElement).toBe(row);
  });

  it('comes last, so it does not shift a chip a reader knows', () => {
    renderWithSelectAll(new Set(['a']));
    const row = host!.querySelector('[data-testid="pool-picker"]')!;
    expect(row.lastElementChild).toBe(selectAll());
  });

  it('hands back EVERY chip in the row, not just the unlit ones', () => {
    // The whole row, so the caller cannot light a subset by accident.
    const asked = renderWithSelectAll(new Set(['a', 'b']));
    act(() => { selectAll()!.click(); });
    expect(asked).toEqual([['a', 'b', 'c']]);
  });

  it('goes quiet once every chip is already lit', () => {
    const asked = renderWithSelectAll(new Set(['a', 'b', 'c']));
    expect(selectAll()!.disabled).toBe(true);
    act(() => { selectAll()!.click(); });
    expect(asked).toEqual([]);
  });

  it('is disabled while a drill runs, like the chips beside it', () => {
    const asked = renderWithSelectAll(new Set(['a']), true);
    expect(selectAll()!.disabled).toBe(true);
    act(() => { selectAll()!.click(); });
    expect(asked).toEqual([]);
  });
});
