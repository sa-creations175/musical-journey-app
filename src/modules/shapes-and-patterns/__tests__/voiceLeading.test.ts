// @vitest-environment jsdom
/**
 * Voice-leading catalog + parser + per-cell time seed tests.
 *
 * Covers the Phase 1 VL submodule data layer:
 *   · VOICE_LEADING_PATTERNS shape (5 patterns, 27 sub-cells per key)
 *   · enumerateVoiceLeadingCells (per-pattern fan-out)
 *   · parseVoiceLeadingItemRef (round-trips per pattern + defensive cases)
 *   · voiceLeadingSubCellLabel (display strings)
 *   · voiceLeadingCellSeconds (per-pattern + ABA-level-3 bump)
 *
 * See src/docs/VOICE_LEADING_SUBMODULE_DESIGN.md.
 */
import { describe, expect, it } from 'vitest';
import {
  enumerateVoiceLeadingCells,
  KEYS,
  parseVoiceLeadingItemRef,
  VOICE_LEADING_PATTERNS,
  VOICE_LEADING_PATTERN_BY_ID,
  voiceLeadingSubCellLabel,
  type VoiceLeadingItemRefDescriptor,
} from '../catalog';
import {
  VOICE_LEADING_PATTERN_SECONDS,
  voiceLeadingCellSeconds,
} from '../../../lib/sessionAlgorithm/timePerAttempt';

describe('VOICE_LEADING_PATTERNS catalog', () => {
  it('ships exactly the 5 design-doc patterns', () => {
    const ids = VOICE_LEADING_PATTERNS.map(p => p.id).sort();
    expect(ids).toEqual([
      'aba-251',
      'diatonic-cycle',
      'dim7',
      'dom-sharp9sharp5',
      'dom7b9',
    ].sort());
  });

  it('lookup map indexes by id', () => {
    for (const p of VOICE_LEADING_PATTERNS) {
      expect(VOICE_LEADING_PATTERN_BY_ID.get(p.id)).toBe(p);
    }
  });

  it('every pattern carries a non-empty human label', () => {
    for (const p of VOICE_LEADING_PATTERNS) {
      expect(p.label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------
// enumerateVoiceLeadingCells — per-pattern fan-out
// ---------------------------------------------------------------------

describe('enumerateVoiceLeadingCells', () => {
  it('ABA-251 → 6 cells per key (3 levels × 2 positions)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('aba-251')!;
    const cells = enumerateVoiceLeadingCells(pat, 'C');
    expect(cells).toHaveLength(6);
    expect(cells).toContain('vl:aba-251:level1:A:C');
    expect(cells).toContain('vl:aba-251:level3:B:C');
  });

  it('diatonic-cycle → 3 cells per key (starting positions)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('diatonic-cycle')!;
    const cells = enumerateVoiceLeadingCells(pat, 'F');
    expect(cells).toEqual([
      'vl:diatonic-cycle:pos1:F',
      'vl:diatonic-cycle:pos2:F',
      'vl:diatonic-cycle:pos3:F',
    ]);
  });

  it('dom-sharp9sharp5 → 6 cells per key (2 positions × 3 targets)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('dom-sharp9sharp5')!;
    const cells = enumerateVoiceLeadingCells(pat, 'Eb');
    expect(cells).toHaveLength(6);
    expect(cells).toContain('vl:dom-sharp9sharp5:A:min7:Eb');
    expect(cells).toContain('vl:dom-sharp9sharp5:B:min11:Eb');
  });

  it('dom7b9 → 6 cells per key (same shape as dom-sharp9sharp5)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('dom7b9')!;
    const cells = enumerateVoiceLeadingCells(pat, 'G');
    expect(cells).toHaveLength(6);
    expect(cells).toContain('vl:dom7b9:A:min9:G');
  });

  it('dim7 → 6 cells per key (2 directions × 3 targets)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('dim7')!;
    const cells = enumerateVoiceLeadingCells(pat, 'A');
    expect(cells).toHaveLength(6);
    expect(cells).toContain('vl:dim7:up:mintriad:A');
    expect(cells).toContain('vl:dim7:down:min9:A');
  });

  it('total catalog cell count = 27 × 12 keys = 324', () => {
    let total = 0;
    for (const p of VOICE_LEADING_PATTERNS) {
      for (const k of KEYS) {
        total += enumerateVoiceLeadingCells(p, k).length;
      }
    }
    expect(total).toBe(324);
  });

  it('per-key cell totals: 6 + 3 + 6 + 6 + 6 = 27', () => {
    let perKey = 0;
    for (const p of VOICE_LEADING_PATTERNS) {
      perKey += enumerateVoiceLeadingCells(p, 'C').length;
    }
    expect(perKey).toBe(27);
  });
});

// ---------------------------------------------------------------------
// parseVoiceLeadingItemRef — discriminated parse
// ---------------------------------------------------------------------

describe('parseVoiceLeadingItemRef', () => {
  describe('round-trips', () => {
    it('parses ABA-251 level + position + key', () => {
      expect(parseVoiceLeadingItemRef('vl:aba-251:level2:A:C')).toEqual({
        patternId: 'aba-251',
        kind: 'aba-251',
        level: 'level2',
        position: 'A',
        keyName: 'C',
      });
    });

    it('parses diatonic-cycle starting position + key', () => {
      expect(parseVoiceLeadingItemRef('vl:diatonic-cycle:pos1:F')).toEqual({
        patternId: 'diatonic-cycle',
        kind: 'diatonic-cycle',
        startingPosition: 'pos1',
        keyName: 'F',
      });
    });

    it('parses dom-sharp9sharp5 position + target + key', () => {
      expect(parseVoiceLeadingItemRef('vl:dom-sharp9sharp5:A:min9:C')).toEqual({
        patternId: 'dom-sharp9sharp5',
        kind: 'dom-altered',
        position: 'A',
        target: 'min9',
        keyName: 'C',
      });
    });

    it('parses dom7b9 with the same dom-altered shape', () => {
      expect(parseVoiceLeadingItemRef('vl:dom7b9:B:min11:Eb')).toEqual({
        patternId: 'dom7b9',
        kind: 'dom-altered',
        position: 'B',
        target: 'min11',
        keyName: 'Eb',
      });
    });

    it('parses dim7 direction + target + key', () => {
      expect(parseVoiceLeadingItemRef('vl:dim7:up:min9:G')).toEqual({
        patternId: 'dim7',
        kind: 'dim7-passing',
        direction: 'up',
        target: 'min9',
        keyName: 'G',
      });
    });

    it('round-trips every enumerated cell across every pattern and key', () => {
      for (const p of VOICE_LEADING_PATTERNS) {
        for (const k of KEYS) {
          for (const ref of enumerateVoiceLeadingCells(p, k)) {
            const desc = parseVoiceLeadingItemRef(ref);
            expect(desc, ref).not.toBeNull();
            expect(desc!.patternId).toBe(p.id);
            expect(desc!.keyName).toBe(k);
          }
        }
      }
    });
  });

  describe('rejects invalid input', () => {
    it('returns null for empty / too-short strings', () => {
      expect(parseVoiceLeadingItemRef('')).toBeNull();
      expect(parseVoiceLeadingItemRef('vl')).toBeNull();
      expect(parseVoiceLeadingItemRef('vl:aba-251')).toBeNull();
    });

    it('returns null for legacy 3-part (no sub-cell)', () => {
      // The pre-Phase-1 `vl:patternId:keyName` shape is no longer a
      // valid sub-cell. Callers that need legacy-tolerant labelling
      // should fall back to `parseShapesItemRef` instead.
      expect(parseVoiceLeadingItemRef('vl:aba-251:C')).toBeNull();
    });

    it('returns null for unknown pattern ids', () => {
      expect(parseVoiceLeadingItemRef('vl:made-up:level1:A:C')).toBeNull();
      expect(parseVoiceLeadingItemRef('vl:bab-251:level1:A:C')).toBeNull(); // bab-251 collapsed into aba-251
    });

    it('returns null when sub-dimensions are out of vocabulary', () => {
      expect(parseVoiceLeadingItemRef('vl:aba-251:level4:A:C')).toBeNull();
      expect(parseVoiceLeadingItemRef('vl:aba-251:level1:Z:C')).toBeNull();
      expect(parseVoiceLeadingItemRef('vl:dim7:sideways:min7:C')).toBeNull();
      expect(parseVoiceLeadingItemRef('vl:dom7b9:A:min13:C')).toBeNull();
    });

    it('returns null when the key is not in the canonical KEYS list', () => {
      expect(parseVoiceLeadingItemRef('vl:aba-251:level1:A:Gb')).toBeNull(); // catalog uses F#
      expect(parseVoiceLeadingItemRef('vl:diatonic-cycle:pos1:H')).toBeNull();
    });

    it('returns null when the prefix is not "vl"', () => {
      expect(parseVoiceLeadingItemRef('xl:aba-251:level1:A:C')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------
// voiceLeadingSubCellLabel — display labels
// ---------------------------------------------------------------------

describe('voiceLeadingSubCellLabel', () => {
  it('ABA-251 reads as "Level N, Position X"', () => {
    const desc = parseVoiceLeadingItemRef('vl:aba-251:level2:B:C')!;
    expect(voiceLeadingSubCellLabel(desc)).toBe('Level 2, Position B');
  });

  it('diatonic-cycle reads as "Starting position N"', () => {
    const desc = parseVoiceLeadingItemRef('vl:diatonic-cycle:pos3:F')!;
    expect(voiceLeadingSubCellLabel(desc)).toBe('Starting position 3');
  });

  it('dom-altered reads as "Position X → minN"', () => {
    const desc = parseVoiceLeadingItemRef('vl:dom7b9:A:min9:G')!;
    expect(voiceLeadingSubCellLabel(desc)).toBe('Position A → min9');
  });

  it('dim7 reads as "Half step <dir> → <target>"', () => {
    const up = parseVoiceLeadingItemRef('vl:dim7:up:mintriad:C')!;
    expect(voiceLeadingSubCellLabel(up)).toBe('Half step up → min triad');
    const down = parseVoiceLeadingItemRef('vl:dim7:down:min9:Eb')!;
    expect(voiceLeadingSubCellLabel(down)).toBe('Half step down → min9');
  });
});

// ---------------------------------------------------------------------
// voiceLeadingCellSeconds — per-sub-cell time seeds
// ---------------------------------------------------------------------

describe('voiceLeadingCellSeconds', () => {
  it('ABA-251 levels 1 and 2 → 90 s, level 3 → 120 s', () => {
    const l1 = parseVoiceLeadingItemRef('vl:aba-251:level1:A:C')!;
    const l2 = parseVoiceLeadingItemRef('vl:aba-251:level2:B:C')!;
    const l3 = parseVoiceLeadingItemRef('vl:aba-251:level3:A:C')!;
    expect(voiceLeadingCellSeconds(l1)).toBe(90);
    expect(voiceLeadingCellSeconds(l2)).toBe(90);
    expect(voiceLeadingCellSeconds(l3)).toBe(120);
  });

  it('diatonic-cycle → 180 s', () => {
    const d = parseVoiceLeadingItemRef('vl:diatonic-cycle:pos2:F')!;
    expect(voiceLeadingCellSeconds(d)).toBe(180);
  });

  it('dom-sharp9sharp5 and dom7b9 → 90 s', () => {
    const a = parseVoiceLeadingItemRef('vl:dom-sharp9sharp5:A:min7:C')!;
    const b = parseVoiceLeadingItemRef('vl:dom7b9:B:min11:G')!;
    expect(voiceLeadingCellSeconds(a)).toBe(90);
    expect(voiceLeadingCellSeconds(b)).toBe(90);
  });

  it('dim7 → 90 s regardless of direction or target', () => {
    const up = parseVoiceLeadingItemRef('vl:dim7:up:mintriad:C')!;
    const down = parseVoiceLeadingItemRef('vl:dim7:down:min9:Bb')!;
    expect(voiceLeadingCellSeconds(up)).toBe(90);
    expect(voiceLeadingCellSeconds(down)).toBe(90);
  });

  it('matches the published per-pattern baseline table', () => {
    expect(VOICE_LEADING_PATTERN_SECONDS['aba-251']).toBe(90);
    expect(VOICE_LEADING_PATTERN_SECONDS['diatonic-cycle']).toBe(180);
    expect(VOICE_LEADING_PATTERN_SECONDS['dom-sharp9sharp5']).toBe(90);
    expect(VOICE_LEADING_PATTERN_SECONDS['dom7b9']).toBe(90);
    expect(VOICE_LEADING_PATTERN_SECONDS['dim7']).toBe(90);
  });
});

// ---------------------------------------------------------------------
// Sanity: VoiceLeadingItemRefDescriptor stays narrow per kind
// ---------------------------------------------------------------------

describe('VoiceLeadingItemRefDescriptor type-narrowing', () => {
  it('exhaustively dispatches on kind', () => {
    // Compile-time exhaustiveness: this function would fail to type-
    // check if a new kind were added without a branch here. Mirrors
    // the dispatch pattern used by enumerateVoiceLeadingCells and
    // voiceLeadingCellSeconds.
    function dispatch(desc: VoiceLeadingItemRefDescriptor): string {
      switch (desc.kind) {
        case 'aba-251':       return `aba ${desc.level}`;
        case 'diatonic-cycle': return `cyc ${desc.startingPosition}`;
        case 'dom-altered':   return `alt ${desc.position}/${desc.target}`;
        case 'dim7-passing':  return `dim ${desc.direction}/${desc.target}`;
      }
    }
    const desc = parseVoiceLeadingItemRef('vl:aba-251:level1:A:C')!;
    expect(dispatch(desc)).toBe('aba level1');
  });
});
