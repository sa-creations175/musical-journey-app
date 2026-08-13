// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import PhraseNote from '../PhraseNote';

/**
 * The point of this component is that it tells the truth about a write
 * it does not control. So the tests that matter are the negative ones:
 * no tick when the write rejects, and no write at all when nothing
 * changed.
 */

// React 18 refuses to treat `act` as act without this, and the async
// state updates below are exactly what it guards.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(ui));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.useRealTimers();
});

const input = (el: HTMLElement) =>
  el.querySelector('[aria-label="phrase note"]') as HTMLTextAreaElement;
const tick = (el: HTMLElement) => el.querySelector('[aria-label="note saved"]');
const failure = (el: HTMLElement) => el.querySelector('[role="alert"]');
const deleteBtn = (el: HTMLElement) =>
  el.querySelector('[aria-label="delete note"]') as HTMLButtonElement | null;

/** Assigning `.value` directly is invisible to React's change tracker,
 *  so the native setter is used and an input event dispatched — the
 *  standard way to drive a controlled field from a test. The setter
 *  lives on the TEXTAREA prototype; borrowing the input one silently
 *  fails to notify React. */
function setValue(field: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )!.set!;
  setter.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/** React's onBlur is delegated from `focusout`, which bubbles; a plain
 *  `blur` event never reaches it. */
function blur(field: HTMLTextAreaElement) {
  field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

/** Type into the field, then blur — the commit gesture. */
async function typeAndBlur(el: HTMLElement, text: string) {
  const field = input(el);
  await act(async () => setValue(field, text));
  await act(async () => blur(field));
}

describe('PhraseNote — reading', () => {
  it('shows the note as plain text when not editing', () => {
    const el = render(<PhraseNote note="turnaround" editing={false} onChange={vi.fn()} />);
    expect(el.textContent).toContain('turnaround');
    expect(input(el)).toBeNull();
  });

  it('renders nothing when there is no note and no editing', () => {
    const el = render(<PhraseNote editing={false} onChange={vi.fn()} />);
    expect(el.textContent).toBe('');
  });
});

describe('PhraseNote — saving', () => {
  it('commits on blur when the text changed', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const el = render(<PhraseNote note="old" editing onChange={onChange} />);
    await typeAndBlur(el, 'new');
    expect(onChange).toHaveBeenCalledWith('new');
  });

  it('does NOT commit when nothing changed', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const el = render(<PhraseNote note="same" editing onChange={onChange} />);
    await act(async () => blur(input(el)));
    expect(onChange).not.toHaveBeenCalled();
    expect(tick(el)).toBeNull();
  });

  it('shows a tick once the write RESOLVES', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const el = render(<PhraseNote note="old" editing onChange={onChange} />);
    expect(tick(el)).toBeNull();
    await typeAndBlur(el, 'new');
    expect(tick(el)).not.toBeNull();
  });

  it('does NOT show a tick while the write is still in flight', async () => {
    let settle: (() => void) | undefined;
    const onChange = vi.fn(
      () => new Promise<void>(res => { settle = res; }),
    );
    const el = render(<PhraseNote note="old" editing onChange={onChange} />);
    await typeAndBlur(el, 'new');
    // Pending: nothing claimed yet.
    expect(tick(el)).toBeNull();
    await act(async () => { settle!(); });
    expect(tick(el)).not.toBeNull();
  });

  it('fades the tick after a moment', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn().mockResolvedValue(undefined);
    const el = render(<PhraseNote note="old" editing onChange={onChange} />);
    const field = input(el);
    await act(async () => {
      setValue(field, 'new');
      blur(field);
    });
    expect(tick(el)).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(tick(el)).toBeNull();
  });
});

describe('PhraseNote — a failed write is not dressed up as a save', () => {
  const rejecting = () => vi.fn().mockRejectedValue(new Error('write failed'));

  it('shows NO tick when the write rejects', async () => {
    const el = render(<PhraseNote note="old" editing onChange={rejecting()} />);
    await typeAndBlur(el, 'new');
    expect(tick(el)).toBeNull();
  });

  it('says so instead', async () => {
    const el = render(<PhraseNote note="old" editing onChange={rejecting()} />);
    await typeAndBlur(el, 'new');
    expect(failure(el)).not.toBeNull();
    expect(el.textContent).toContain('not saved');
  });

  it('does NOT let the failure fade the way a tick does', async () => {
    vi.useFakeTimers();
    const el = render(<PhraseNote note="old" editing onChange={rejecting()} />);
    const field = input(el);
    await act(async () => {
      setValue(field, 'new');
      blur(field);
    });
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(failure(el)).not.toBeNull();
  });

  it('retracts the failure once the user types again', async () => {
    const el = render(<PhraseNote note="old" editing onChange={rejecting()} />);
    await typeAndBlur(el, 'new');
    expect(failure(el)).not.toBeNull();
    await act(async () => setValue(input(el), 'newer'));
    expect(failure(el)).toBeNull();
  });
});

describe('PhraseNote — deleting', () => {
  it('offers no delete control when the field is empty', () => {
    const el = render(<PhraseNote editing onChange={vi.fn()} />);
    expect(deleteBtn(el)).toBeNull();
  });

  it('offers one when there is a note', () => {
    const el = render(<PhraseNote note="coda" editing onChange={vi.fn()} />);
    expect(deleteBtn(el)).not.toBeNull();
  });

  it('deletes by committing an empty string, which is what clears it', async () => {
    // `setPhraseNote` maps blank to undefined, so this is the same path
    // clearing-and-blurring always took — just reachable on purpose.
    const onChange = vi.fn().mockResolvedValue(undefined);
    const el = render(<PhraseNote note="coda" editing onChange={onChange} />);
    await act(async () => { deleteBtn(el)!.click(); });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('confirms the delete the same way a save is confirmed', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const el = render(<PhraseNote note="coda" editing onChange={onChange} />);
    await act(async () => { deleteBtn(el)!.click(); });
    expect(tick(el)).not.toBeNull();
  });

  it('reports a failed delete as a failure', async () => {
    const el = render(
      <PhraseNote note="coda" editing onChange={vi.fn().mockRejectedValue(new Error('x'))} />,
    );
    await act(async () => { deleteBtn(el)!.click(); });
    expect(tick(el)).toBeNull();
    expect(failure(el)).not.toBeNull();
  });
});

describe('PhraseNote — the field grows without moving the chords', () => {
  it('takes its OWN LINE while editing, so growth cannot reflow the chord row', () => {
    // Both surfaces render this as a sibling flex item in the same
    // wrapping row as the chord tokens. Without a full basis, widening
    // the field moves the wrap points and the chords jump on every
    // keystroke.
    const el = render(<PhraseNote note="x" editing onChange={vi.fn()} />);
    expect(el.firstElementChild!.className).toContain('basis-full');
  });

  it('stays inline when read-only', () => {
    const el = render(<PhraseNote note="x" editing={false} onChange={vi.fn()} />);
    expect(el.firstElementChild!.className).not.toContain('basis-full');
  });

  it('is a textarea, because an input cannot wrap past the cap', () => {
    const el = render(<PhraseNote note="x" editing onChange={vi.fn()} />);
    expect(input(el).tagName).toBe('TEXTAREA');
  });

  it('widens with the content', async () => {
    const el = render(<PhraseNote note="" editing onChange={vi.fn()} />);
    const before = parseFloat(input(el).style.width);
    await act(async () => setValue(input(el), 'Joyful and triumphant'));
    expect(parseFloat(input(el).style.width)).toBeGreaterThan(before);
  });

  it('carries a responsive cap so it never runs to the drawer edge', () => {
    const el = render(<PhraseNote note="x" editing onChange={vi.fn()} />);
    const cls = input(el).className;
    expect(cls).toContain('max-w-[14rem]');
    expect(cls).toContain('sm:max-w-[22rem]');
  });
});

describe('PhraseNote — Enter commits and newlines never reach storage', () => {
  it('commits on Enter instead of inserting a line break', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const el = render(<PhraseNote note="old" editing onChange={onChange} />);
    const field = input(el);
    await act(async () => setValue(field, 'new'));
    await act(async () => {
      field.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    await act(async () => blur(field));
    expect(onChange).toHaveBeenCalledWith('new');
    expect(field.value).not.toContain('\n');
  });

  it('collapses a pasted multi-line note rather than losing half of it', async () => {
    // The read-only view is a span: a stored newline would vanish on
    // save, so the input would eat what was typed.
    const onChange = vi.fn().mockResolvedValue(undefined);
    const el = render(<PhraseNote note="" editing onChange={onChange} />);
    await act(async () => setValue(input(el), 'first line\nsecond line'));
    await act(async () => blur(input(el)));
    expect(onChange).toHaveBeenCalledWith('first line second line');
  });
});
