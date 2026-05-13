// @vitest-environment jsdom
/**
 * Contract tests for the scales submodule skill registry. Pins the
 * 96-cell catalog, the itemRef ↔ descriptor round-trip, and the
 * maintenance-vs-drill tier classification spelled out in
 * src/docs/SCALES_SUBMODULE_DESIGN.md.
 */
import { describe, it, expect } from 'vitest';
import {
  SCALE_CELLS,
  SCALE_KINDS,
  MAJOR_PENT_STARTING_POINTS,
  MINOR_PENT_STARTING_POINTS,
  getScaleTier,
  isScaleItem,
  itemRefForScale,
  labelForScaleItemRef,
  parseScaleItemRef,
} from '../scaleSkills';
import { CIRCLE_OF_FOURTHS } from '../../repertoire/circleOfFourths';

const KEY_COUNT = 12;
const MAJOR_CELLS = KEY_COUNT;            // 12
const NAT_MIN_CELLS = KEY_COUNT;          // 12
const MAJOR_PENT_CELLS = KEY_COUNT * 3;   // 36
const MIN_PENT_CELLS = KEY_COUNT * 3;     // 36
const TOTAL_CELLS = MAJOR_CELLS + NAT_MIN_CELLS + MAJOR_PENT_CELLS + MIN_PENT_CELLS; // 96

describe('SCALE_CELLS catalog', () => {
  it('has exactly 96 cells: 12 + 36 + 12 + 36', () => {
    expect(SCALE_CELLS).toHaveLength(TOTAL_CELLS);
    expect(TOTAL_CELLS).toBe(96);
  });

  it('breaks down by scale kind matching the design spec', () => {
    const counts: Record<string, number> = {};
    for (const c of SCALE_CELLS) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
    expect(counts['major']).toBe(MAJOR_CELLS);
    expect(counts['natural-minor']).toBe(NAT_MIN_CELLS);
    expect(counts['major-pentatonic']).toBe(MAJOR_PENT_CELLS);
    expect(counts['minor-pentatonic']).toBe(MIN_PENT_CELLS);
  });

  it('covers all 12 circle-of-fourths keys for every scale kind', () => {
    for (const kind of SCALE_KINDS) {
      const keys = new Set(SCALE_CELLS.filter(c => c.kind === kind).map(c => c.keyName));
      expect(keys.size).toBe(KEY_COUNT);
      for (const k of CIRCLE_OF_FOURTHS) expect(keys.has(k)).toBe(true);
    }
  });

  it('uses the design-spec starting points for both pentatonics', () => {
    const majorPentSps = new Set(
      SCALE_CELLS.filter(c => c.kind === 'major-pentatonic').map(c => c.startingPoint),
    );
    expect(majorPentSps).toEqual(new Set(MAJOR_PENT_STARTING_POINTS));

    const minorPentSps = new Set(
      SCALE_CELLS.filter(c => c.kind === 'minor-pentatonic').map(c => c.startingPoint),
    );
    expect(minorPentSps).toEqual(new Set(MINOR_PENT_STARTING_POINTS));
  });

  it('has unique itemRefs across the whole catalog', () => {
    const refs = SCALE_CELLS.map(c => c.itemRef);
    expect(new Set(refs).size).toBe(refs.length);
  });
});

describe('itemRef ↔ descriptor round-trip', () => {
  it('round-trips every catalog cell through itemRefForScale + parseScaleItemRef', () => {
    for (const cell of SCALE_CELLS) {
      const desc = parseScaleItemRef(cell.itemRef);
      expect(desc).not.toBeNull();
      const reBuilt = itemRefForScale(desc!);
      expect(reBuilt).toBe(cell.itemRef);
    }
  });

  it('renders the 3-part format for major + natural-minor', () => {
    expect(itemRefForScale({ kind: 'major', keyName: 'C' })).toBe('scale:major:C');
    expect(itemRefForScale({ kind: 'natural-minor', keyName: 'F' })).toBe(
      'scale:natural-minor:F',
    );
  });

  it('renders the 4-part format for both pentatonics', () => {
    expect(
      itemRefForScale({ kind: 'major-pentatonic', keyName: 'Eb', startingPoint: '5' }),
    ).toBe('scale:major-pentatonic:5:Eb');
    expect(
      itemRefForScale({ kind: 'minor-pentatonic', keyName: 'Bb', startingPoint: 'b7' }),
    ).toBe('scale:minor-pentatonic:b7:Bb');
  });

  it('parseScaleItemRef returns null for non-scale + malformed strings', () => {
    expect(parseScaleItemRef('chord-shape:maj7:C:inv1')).toBeNull();
    expect(parseScaleItemRef('vl:aba-251:C')).toBeNull();
    expect(parseScaleItemRef('scale:major')).toBeNull();
    expect(parseScaleItemRef('scale:major:')).toBeNull();
    expect(parseScaleItemRef('scale:phrygian:C')).toBeNull();
    // Bad starting point
    expect(parseScaleItemRef('scale:major-pentatonic:b3:C')).toBeNull();
    expect(parseScaleItemRef('scale:minor-pentatonic:5:C')).toBeNull();
  });
});

describe('isScaleItem', () => {
  it('returns true for every catalog itemRef', () => {
    for (const cell of SCALE_CELLS) expect(isScaleItem(cell.itemRef)).toBe(true);
  });

  it('returns false for non-scale itemRefs', () => {
    expect(isScaleItem('chord-shape:maj:C:root')).toBe(false);
    expect(isScaleItem('vl:aba-251:C')).toBe(false);
    expect(isScaleItem('mental-viz:shape-viz')).toBe(false);
    expect(isScaleItem('')).toBe(false);
  });
});

describe('getScaleTier', () => {
  it('classifies major as maintenance and everything else as drill', () => {
    expect(getScaleTier('scale:major:C')).toBe('maintenance');
    expect(getScaleTier('scale:major:Gb')).toBe('maintenance');
    expect(getScaleTier('scale:natural-minor:C')).toBe('drill');
    expect(getScaleTier('scale:major-pentatonic:1:Eb')).toBe('drill');
    expect(getScaleTier('scale:minor-pentatonic:b3:F')).toBe('drill');
  });

  it('every catalog cell has a consistent tier', () => {
    for (const cell of SCALE_CELLS) {
      expect(getScaleTier(cell.itemRef)).toBe(cell.tier);
    }
  });

  it('throws for un-recognised scale itemRefs', () => {
    expect(() => getScaleTier('not-a-scale')).toThrow();
    expect(() => getScaleTier('scale:phrygian:C')).toThrow();
  });
});

describe('labelForScaleItemRef', () => {
  it('renders major + natural-minor as "{key} {kind label}"', () => {
    expect(labelForScaleItemRef('scale:major:C')).toBe('C major scale');
    expect(labelForScaleItemRef('scale:natural-minor:F')).toBe('F natural minor');
  });

  it('renders pentatonics with the starting point appended', () => {
    expect(labelForScaleItemRef('scale:major-pentatonic:5:Eb')).toBe(
      'Eb major pentatonic — from 5',
    );
    expect(labelForScaleItemRef('scale:minor-pentatonic:b7:Bb')).toBe(
      'Bb minor pentatonic — from b7',
    );
  });

  it('returns null for un-recognised itemRefs', () => {
    expect(labelForScaleItemRef('chord-shape:maj:C:root')).toBeNull();
    expect(labelForScaleItemRef('scale:phrygian:C')).toBeNull();
  });
});
