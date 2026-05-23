import { describe, it, expect } from 'vitest';
import {
  MODULE_MEMORY_TYPES,
  getMemoryType,
} from '../memoryType';
import type { MemoryType } from '../db';

/**
 * Sub-phase 2 contract: pure function mapping moduleRef → memory
 * type, throws on unknown input. Phase 1 has no live caller — these
 * tests pin the mapping so Phase 2/3 consumers don't drift from it
 * silently.
 */

describe('MODULE_MEMORY_TYPES', () => {
  it('contains exactly the 13 canonical module refs', () => {
    expect(Object.keys(MODULE_MEMORY_TYPES).sort()).toEqual([
      'chord-progressions',
      'chord-recognition',
      'glossary',
      'harmonic-diary',
      'harmonic-fluency',
      'intervals',
      'just-play',
      'just-produce',
      'mental-viz',
      'production',
      'repertoire',
      'scales-modes',
      'shapes-and-patterns',
    ]);
  });

  it('is frozen at runtime', () => {
    expect(Object.isFrozen(MODULE_MEMORY_TYPES)).toBe(true);
  });
});

describe('getMemoryType — declarative modules', () => {
  it.each<[string, MemoryType]>([
    ['harmonic-fluency',   'declarative'],
    ['intervals',          'declarative'],
    ['chord-recognition',  'declarative'],
    ['chord-progressions', 'declarative'],
    ['scales-modes',       'declarative'],
    ['glossary',           'declarative'],
  ])('%s → %s', (ref, expected) => {
    expect(getMemoryType(ref)).toBe(expected);
  });
});

describe('getMemoryType — procedural modules', () => {
  it('shapes-and-patterns → procedural (single row covers all 4 sub-areas)', () => {
    expect(getMemoryType('shapes-and-patterns')).toBe('procedural');
  });
  it('mental-viz → procedural (rating-based chord-library drill)', () => {
    expect(getMemoryType('mental-viz')).toBe('procedural');
  });
});

describe('getMemoryType — integration modules', () => {
  it.each<[string, MemoryType]>([
    ['repertoire', 'integration'],
    ['production', 'integration'],
  ])('%s → %s', (ref, expected) => {
    expect(getMemoryType(ref)).toBe(expected);
  });
});

describe('getMemoryType — expression modules', () => {
  it.each<[string, MemoryType]>([
    ['just-play',      'expression'],
    ['just-produce',   'expression'],
    ['harmonic-diary', 'expression'],
  ])('%s → %s', (ref, expected) => {
    expect(getMemoryType(ref)).toBe(expected);
  });
});

describe('getMemoryType — unknown input', () => {
  it('throws on a typo / unknown ref', () => {
    expect(() => getMemoryType('reperoire')).toThrow(/unknown moduleRef/);
  });

  it('includes the offending ref in the error message', () => {
    expect(() => getMemoryType('made-up')).toThrow(/"made-up"/);
  });

  it('throws on empty string', () => {
    expect(() => getMemoryType('')).toThrow(/unknown moduleRef/);
  });

  it('throws on case mismatch (refs are kebab-case, lowercase)', () => {
    expect(() => getMemoryType('Repertoire')).toThrow(/unknown moduleRef/);
  });

  it('throws on whitespace contamination', () => {
    expect(() => getMemoryType(' repertoire')).toThrow(/unknown moduleRef/);
  });
});

describe('getMemoryType — every entry in MODULE_MEMORY_TYPES round-trips', () => {
  it('returns the same value the table holds for every ref', () => {
    for (const [ref, expected] of Object.entries(MODULE_MEMORY_TYPES)) {
      expect(getMemoryType(ref)).toBe(expected);
    }
  });
});
