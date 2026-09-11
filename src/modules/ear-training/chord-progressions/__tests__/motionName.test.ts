/**
 * A motion is named the way its chips spell it, everywhere it is named.
 *
 * `motionName` is the one formatter the Focus panel, the progressions
 * tracker and the dashboard's rows read. The ids it is handed are keys
 * — `motion:1-2m7b5-asc`, `motion:b2-3-asc` — and none of that spelling
 * may survive onto a screen.
 */
import { describe, expect, it } from 'vitest';
import { ALL_MOTIONS, motionId, parseMotionId } from '../chordMotionPool';
import { motionName } from '../motionDegrees';
import { chordProgressionsCatalog } from '../../../dashboard/read/catalogs';

describe('motionName', () => {
  it('spells every id in the pool as the chips do', () => {
    // Guard the guard: the pool really holds ids a raw print would leak.
    const ids = ALL_MOTIONS.map(motionId);
    expect(ids.some(id => /b\d/.test(id))).toBe(true);
    expect(ids.some(id => id.includes('m7b5'))).toBe(true);
    for (const id of ids) {
      const name = motionName(parseMotionId(id)!);
      expect(name, id).not.toMatch(/b\d/);
      expect(name, id).not.toContain('m7b5');
      expect(name, id).not.toMatch(/#|\(|Up|Down|Ascending|Descending/);
      expect(name, id).toMatch(/^\S+ [↑↓→] \S+$/);
    }
  });

  it('writes the ruled examples', () => {
    const name = (id: string) => motionName(parseMotionId(id)!);
    expect(name('motion:1-2m7b5-asc')).toBe('1 ↑ 2ø');
    expect(name('motion:b2-3-asc')).toBe('♭2 ↑ 3m');
    expect(name('motion:4m-b7-asc')).toBe('4m ↑ ♭7');
    expect(name('motion:4-4m-same')).toBe('4 → 4m');
    // At the card's seventh-chord rung the 7 is half-diminished: 7ø.
    expect(name('motion:1-7-asc')).toBe('1 ↑ 7ø');
    expect(name('motion:1-#4dim7-asc')).toBe('1 ↑ ♯4°7');
  });

  it('is what the dashboard rows say', () => {
    const labels = chordProgressionsCatalog.items
      .filter(i => i.id.startsWith('motion:'))
      .map(i => i.label);
    // Guard: the rows are there to read.
    expect(labels.length).toBe(ALL_MOTIONS.length);
    // A pair is two rows, told apart by the move.
    expect(labels).toContain('1 ↑ 2ø · up a major 2nd');
    expect(labels).toContain('1 ↓ 2ø · down a minor 7th');
    expect(new Set(labels).size).toBe(labels.length);
    for (const l of labels) {
      expect(l).not.toMatch(/b\d/);
      expect(l).not.toContain('m7b5');
    }
  });
});

/**
 * THE FORMATTER DOES NOT PULL REACT IN. Walks the static import graph
 * from `motionDegrees` — value imports only; `import type` is erased —
 * and fails if it reaches `react` or `dexie-react-hooks`. The spelling
 * hooks file was the risk, and `progressionSpellingShape` is what keeps
 * it out.
 *
 * FROM THE FORMATTER, NOT FROM THE CATALOG. The dashboard's catalog
 * file already reaches React by three routes of its own (the harmonic
 * fluency catalog, `drillModel` → `devMode`, `ratingRules`), so a walk
 * from there would fail for reasons this change did not make and cannot
 * fix. What this change promises is that naming a motion adds no route.
 */
describe('the formatter’s imports', () => {
  it('never reach React or the Dexie hooks', () => {
    // EVERY SOURCE FILE, AS TEXT, through Vite — the same `?raw` route
    // the panel's no-autoplay test reads its source by, so no Node API.
    const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>;
    const join = (from: string, spec: string) => {
      const parts = from.split('/').slice(0, -1);
      for (const seg of spec.split('/')) {
        if (seg === '..') parts.pop();
        else if (seg !== '.') parts.push(seg);
      }
      return parts.join('/');
    };
    const seen = new Set<string>();
    const external = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = sources[file] ?? '';
      for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)) {
        const spec = m[1];
        if (!spec.startsWith('.')) { external.add(spec); continue; }
        const base = join(file, spec);
        const hit = ['.ts', '.tsx', '/index.ts'].map(e => base + e).find(f => f in sources);
        if (hit) walk(hit);
      }
    };
    walk('/src/modules/ear-training/chord-progressions/motionDegrees.ts');
    // Guard: the walk really went through the spelling.
    expect([...seen].some(f => f.endsWith('progressionRow.ts'))).toBe(true);
    expect([...seen].some(f => f.endsWith('progressionSpellingShape.ts'))).toBe(true);
    expect(external.has('react')).toBe(false);
    expect(external.has('dexie-react-hooks')).toBe(false);
  });
});

describe('the arrow is the bass’s direction, on every card', () => {
  it('↑ when the bass goes up, ↓ when it goes down, → on a same root — and never ↗ ↘', () => {
    const seen = new Set<string>();
    for (const m of ALL_MOTIONS) {
      const name = motionName(m);
      const arrow = m.semitones > 0 ? '↑' : m.semitones < 0 ? '↓' : '→';
      expect(name, motionId(m)).toContain(` ${arrow} `);
      expect(name).not.toMatch(/[↗↘]/);
      seen.add(arrow);
    }
    // Guard: all three occur.
    expect(seen).toEqual(new Set(['↑', '↓', '→']));
  });
});
