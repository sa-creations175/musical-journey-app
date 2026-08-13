// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import LyricPasteBox from '../LyricPasteBox';

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
});

function open() {
  const toggle = container!.querySelector('button') as HTMLElement;
  act(() => toggle.click());
}

function type(text: string) {
  const ta = container!.querySelector('textarea') as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )!.set!;
  act(() => {
    setter.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// `commit` awaits the caller's write, so state settles a microtask
// later — the click has to be awaited or the assertions race it.
async function click(label: string) {
  const btn = Array.from(container!.querySelectorAll('button')).find(b =>
    b.textContent?.includes(label),
  ) as HTMLElement;
  await act(async () => {
    btn.click();
  });
}

const VERSE = 'O come let us\n[Chorus]\nadore him';

describe('LyricPasteBox — collapsed', () => {
  it('starts collapsed with no textarea', () => {
    render(<LyricPasteBox onCommit={vi.fn()} />);
    expect(container!.querySelector('textarea')).toBeNull();
  });

  it('opens on tap', () => {
    render(<LyricPasteBox onCommit={vi.fn()} />);
    open();
    expect(container!.querySelector('textarea')).not.toBeNull();
  });
});

describe('LyricPasteBox — live preview', () => {
  it('shows the parser guesses as you type, before anything is written', () => {
    // The point of the preview: a misread header is visible BEFORE
    // commit rather than after.
    const onCommit = vi.fn();
    render(<LyricPasteBox onCommit={onCommit} />);
    open();
    type(VERSE);
    expect(container!.querySelectorAll('[data-preview-header]')).toHaveLength(1);
    expect(container!.querySelectorAll('[data-preview-lyric]')).toHaveLength(2);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('reads a bare section word as a header', () => {
    render(<LyricPasteBox onCommit={vi.fn()} />);
    open();
    type('Verse 2\nsome words here');
    const headers = container!.querySelectorAll('[data-preview-header]');
    expect(headers).toHaveLength(1);
    expect(headers[0].textContent).toContain('Verse 2');
  });

  it('counts lines and headers separately', () => {
    render(<LyricPasteBox onCommit={vi.fn()} />);
    open();
    type(VERSE);
    expect(container!.textContent).toContain('2 lines');
    expect(container!.textContent).toContain('1 headers');
  });

  it('shows nothing for whitespace-only input', () => {
    render(<LyricPasteBox onCommit={vi.fn()} />);
    open();
    type('   \n  \n');
    expect(container!.querySelector('[data-paste-preview]')).toBeNull();
  });
});

describe('LyricPasteBox — commit', () => {
  it('hands up RAW TEXT, not pre-split words', async () => {
    // Parsing happens once, at the caller's write. The old path went
    // text → words → text → parse and lost the original line breaks.
    const onCommit = vi.fn();
    render(<LyricPasteBox onCommit={onCommit} />);
    open();
    type(VERSE);
    await click('add lines');
    expect(onCommit).toHaveBeenCalledWith(VERSE);
  });

  it('refuses to commit an empty draft', () => {
    const onCommit = vi.fn();
    render(<LyricPasteBox onCommit={onCommit} />);
    open();
    const btn = Array.from(container!.querySelectorAll('button')).find(b =>
      b.textContent?.includes('add lines'),
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('clears the draft without committing', async () => {
    const onCommit = vi.fn();
    render(<LyricPasteBox onCommit={onCommit} />);
    open();
    type(VERSE);
    await click('clear');
    expect(onCommit).not.toHaveBeenCalled();
    expect((container!.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      '',
    );
  });

  it('collapses and empties after a successful commit', async () => {
    render(<LyricPasteBox onCommit={vi.fn()} />);
    open();
    type(VERSE);
    await click('add lines');
    expect(container!.querySelector('textarea')).toBeNull();
  });
});

describe('LyricPasteBox — the header capability is named (13.15)', () => {
  it('says headers are possible in its own label', () => {
    // Typing a section name has always created a header; nothing said
    // so, and the only way to find out was to stumble into it.
    // Asserted on the rendered TEXT — the mechanism by which the
    // capability becomes discoverable — not on a prop default.
    render(<LyricPasteBox onCommit={() => {}} />);
    expect(container!.textContent).toContain('header');
  });

  it('shows the BARE header form in the placeholder, not only the bracketed one', () => {
    render(<LyricPasteBox onCommit={() => {}} />);
    open();
    const box = container!.querySelector('textarea') as HTMLTextAreaElement;
    const ph = box.getAttribute('placeholder') ?? '';
    expect(ph).toContain('Chorus');
    expect(ph).not.toContain('[Chorus]');
    expect(ph).toContain('[Verse 2]');
  });

  it('still lets a caller override the label', () => {
    render(<LyricPasteBox onCommit={() => {}} label="add lines" />);
    expect(container!.textContent).toContain('add lines');
  });
});
