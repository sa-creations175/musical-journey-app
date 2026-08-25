// @vitest-environment jsdom
/**
 * The one filter shape, and the five parse blocks it replaced.
 */
import { describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  NO_FILTER, filterSize, isNarrowed, parseFilterKeys, useDrillFilter,
} from '../drillFilter';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe('the parse', () => {
  it('trims, drops blanks, and treats absent as the whole pool', () => {
    expect(parseFilterKeys('M3|asc, m7|desc ,, ')).toEqual(['M3|asc', 'm7|desc']);
    expect(parseFilterKeys(null)).toEqual([]);
    expect(parseFilterKeys('')).toEqual([]);
    expect(parseFilterKeys(' , ')).toEqual([]);
  });

  it('reads empty as no narrowing, not as narrowed to nothing', () => {
    expect(isNarrowed(NO_FILTER)).toBe(false);
    expect(isNarrowed({ keys: ['a'], source: 'url' })).toBe(true);
  });
});

describe('filterSize dedupes', () => {
  it('counts distinct keys, which the old chord-progressions count did not', () => {
    // ASYMMETRIC: three entries, two distinct. `keys.length` gives 3
    // and would clear a minimum of 3 that the real pool does not.
    expect(filterSize({ keys: ['I-V-vi-IV', 'I-V-vi-IV', 'ii-V-I'], source: 'panel' }))
      .toBe(2);
    expect(filterSize(NO_FILTER)).toBe(0);
  });
});

describe('the hook', () => {
  function readFilter(entry: string) {
    let seen: ReturnType<typeof useDrillFilter> | null = null;
    function Probe() { seen = useDrillFilter('intervals'); return null; }
    const container = document.createElement('div');
    const root: Root = createRoot(container);
    act(() => {
      root.render(<MemoryRouter initialEntries={[entry]}><Probe /></MemoryRouter>);
    });
    act(() => { root.unmount(); });
    return seen!;
  }

  it('reads ?focus= and marks the source as url', () => {
    const f = readFilter('/x?focus=M3|asc,m7|desc');
    expect(f.keys).toEqual(['M3|asc', 'm7|desc']);
    expect(f.source).toBe('url');
  });

  it('returns the whole pool when there is no param', () => {
    const f = readFilter('/x');
    expect(isNarrowed(f)).toBe(false);
    expect(f.keys).toEqual([]);
  });
});

/**
 * Page sources, read through Vite rather than `node:fs`.
 *
 * No other test in `src` imports a node module, and widening the app's
 * `types` to allow one for a test's convenience would be paying in the
 * whole app's type surface. `?raw` is already typed by `vite/client`.
 */
const SOURCES = import.meta.glob(
  '/src/modules/**/{Intervals,ChordRecognition,ScalesModes,ChordProgressions,Reading}.tsx',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

describe('all four drills read the hook, not their own parse', () => {
  // A test per drill passes while the duplication survives, so this
  // asserts the ABSENCE of the block across every page at once.
  it('finds all five pages, so the sweep is not vacuously empty', () => {
    expect(Object.keys(SOURCES)).toHaveLength(5);
  });

  it('leaves no page parsing ?focus= for itself', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([, src]) => src.includes("get('focus')"))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it('has every page calling useDrillFilter', () => {
    // Both halves: "no parse blocks" alone passes on a page that
    // dropped focus support entirely.
    const missing = Object.entries(SOURCES)
      .filter(([, src]) => !src.includes('useDrillFilter('))
      .map(([p]) => p);
    expect(missing).toEqual([]);
  });

  it('closes the chord-progressions gap specifically', () => {
    // It had focus state and no way to set it from outside the modal.
    const quiz = QUIZ_SOURCE;
    expect(quiz).toContain('initialFocusKeys');
    expect(quiz).toContain('filterSize(');
    // And it no longer sizes the pool with an undeduped length or a
    // literal 4 — the two things it was behind on.
    expect(quiz).not.toContain('focusKeys.length < 4');
    expect(quiz).toContain('FLUENCY_POOL_MINIMUM');
  });
});

const QUIZ_SOURCE = Object.values(import.meta.glob(
  '/src/modules/ear-training/chord-progressions/ChordProgressionsQuiz.tsx',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>)[0];

const READING_SOURCE = Object.values(import.meta.glob(
  '/src/modules/reading/Reading.tsx',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>)[0];

describe("reading's remount key is independent of the filter", () => {
  it('keys the drill on the skill and nothing else', () => {
    // THE CONSTRAINT THAT MAKES THE STRIP SAFE HERE. A key that grew to
    // include the filter would discard the card mid-answer on every
    // tap — the drill would appear to "reset" for no reason a reader
    // could see.
    const src = READING_SOURCE;
    expect(src).toContain('key={skill}');
    for (const bad of ['key={`${skill}', 'key={skill + ', 'key={[skill']) {
      expect(src).not.toContain(bad);
    }
  });
});
