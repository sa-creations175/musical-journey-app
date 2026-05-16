// @vitest-environment jsdom
/**
 * Voice-leading catalog + parser + per-cell time seed tests.
 *
 * Covers the Phase 1 VL submodule data layer:
 *   · VOICE_LEADING_PATTERNS shape (7 patterns, 31 sub-cells per key)
 *   · enumerateVoiceLeadingCells (per-pattern fan-out)
 *   · parseVoiceLeadingItemRef (round-trips per pattern + defensive cases)
 *   · voiceLeadingSubCellLabel (display strings)
 *   · voiceLeadingCellSeconds (per-pattern + per-type capstone bump)
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
  it('ships exactly the 7 design-doc patterns', () => {
    const ids = VOICE_LEADING_PATTERNS.map(p => p.id).sort();
    expect(ids).toEqual([
      'five-one',
      'major-251',
      'minor-251',
      'diatonic-cycle',
      'minor-aba',
      'dom7b9',
      'dim7',
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
  it('five-one → 6 cells per key (3 types × 2 positions)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('five-one')!;
    const cells = enumerateVoiceLeadingCells(pat, 'C');
    expect(cells).toHaveLength(6);
    expect(cells).toContain('vl:five-one:guide-tones:A:C');
    expect(cells).toContain('vl:five-one:full-voicing:B:C');
  });

  it('major-251 → 6 cells per key (guide-tones, seventh-chords, aba-structure × A/B)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('major-251')!;
    const cells = enumerateVoiceLeadingCells(pat, 'C');
    expect(cells).toHaveLength(6);
    expect(cells).toContain('vl:major-251:guide-tones:A:C');
    expect(cells).toContain('vl:major-251:aba-structure:B:C');
  });

  it('minor-251 → 6 cells per key (guide-tones, seventh-chords, full-voicing × A/B)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('minor-251')!;
    const cells = enumerateVoiceLeadingCells(pat, 'C');
    expect(cells).toHaveLength(6);
    expect(cells).toContain('vl:minor-251:full-voicing:A:C');
  });

  it('diatonic-cycle → 3 cells per key (3 starting positions)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('diatonic-cycle')!;
    const cells = enumerateVoiceLeadingCells(pat, 'F');
    expect(cells).toEqual([
      'vl:diatonic-cycle:pos1:F',
      'vl:diatonic-cycle:pos2:F',
      'vl:diatonic-cycle:pos3:F',
    ]);
  });

  it('minor-aba → 2 cells per key (pos-A, pos-B)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('minor-aba')!;
    const cells = enumerateVoiceLeadingCells(pat, 'Eb');
    expect(cells).toEqual([
      'vl:minor-aba:pos-A:Eb',
      'vl:minor-aba:pos-B:Eb',
    ]);
  });

  it('dom7b9 → 4 cells per key (root + 3 inversions)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('dom7b9')!;
    const cells = enumerateVoiceLeadingCells(pat, 'G');
    expect(cells).toEqual([
      'vl:dom7b9:pos1:G',
      'vl:dom7b9:pos2:G',
      'vl:dom7b9:pos3:G',
      'vl:dom7b9:pos4:G',
    ]);
  });

  it('dim7 → 4 cells per key (root + 3 inversions)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('dim7')!;
    const cells = enumerateVoiceLeadingCells(pat, 'A');
    expect(cells).toEqual([
      'vl:dim7:pos1:A',
      'vl:dim7:pos2:A',
      'vl:dim7:pos3:A',
      'vl:dim7:pos4:A',
    ]);
  });

  it('total catalog cell count = 31 × 12 keys = 372', () => {
    let total = 0;
    for (const p of VOICE_LEADING_PATTERNS) {
      for (const k of KEYS) {
        total += enumerateVoiceLeadingCells(p, k).length;
      }
    }
    expect(total).toBe(372);
  });

  it('per-key cell totals: 6 + 6 + 6 + 3 + 2 + 4 + 4 = 31', () => {
    let perKey = 0;
    for (const p of VOICE_LEADING_PATTERNS) {
      perKey += enumerateVoiceLeadingCells(p, 'C').length;
    }
    expect(perKey).toBe(31);
  });
});

// ---------------------------------------------------------------------
// parseVoiceLeadingItemRef — discriminated parse
// ---------------------------------------------------------------------

describe('parseVoiceLeadingItemRef', () => {
  describe('round-trips', () => {
    it('parses five-one type + position + key', () => {
      expect(parseVoiceLeadingItemRef('vl:five-one:guide-tones:A:C')).toEqual({
        patternId: 'five-one',
        kind: 'type-position',
        type: 'guide-tones',
        position: 'A',
        keyName: 'C',
      });
    });

    it('parses major-251 with the ABA-structure capstone type', () => {
      expect(parseVoiceLeadingItemRef('vl:major-251:aba-structure:B:F')).toEqual({
        patternId: 'major-251',
        kind: 'type-position',
        type: 'aba-structure',
        position: 'B',
        keyName: 'F',
      });
    });

    it('parses minor-251 with the full-voicing capstone type', () => {
      expect(parseVoiceLeadingItemRef('vl:minor-251:full-voicing:A:G')).toEqual({
        patternId: 'minor-251',
        kind: 'type-position',
        type: 'full-voicing',
        position: 'A',
        keyName: 'G',
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

    it('parses minor-aba with pos-A / pos-B tags', () => {
      expect(parseVoiceLeadingItemRef('vl:minor-aba:pos-A:Eb')).toEqual({
        patternId: 'minor-aba',
        kind: 'minor-aba',
        position: 'pos-A',
        keyName: 'Eb',
      });
      expect(parseVoiceLeadingItemRef('vl:minor-aba:pos-B:C')).toEqual({
        patternId: 'minor-aba',
        kind: 'minor-aba',
        position: 'pos-B',
        keyName: 'C',
      });
    });

    it('parses dom7b9 with four-position inversion vocab', () => {
      expect(parseVoiceLeadingItemRef('vl:dom7b9:pos3:G')).toEqual({
        patternId: 'dom7b9',
        kind: 'inversion-4',
        position: 'pos3',
        keyName: 'G',
      });
    });

    it('parses dim7 with four-position inversion vocab', () => {
      expect(parseVoiceLeadingItemRef('vl:dim7:pos4:Bb')).toEqual({
        patternId: 'dim7',
        kind: 'inversion-4',
        position: 'pos4',
        keyName: 'Bb',
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
      expect(parseVoiceLeadingItemRef('vl:five-one')).toBeNull();
    });

    it('returns null for the legacy aba-251 / level1 shape (catalog superseded)', () => {
      // The pre-correction shape `vl:aba-251:level1:A:C` is no longer
      // a valid pattern id — `aba-251` was rolled into `major-251`.
      expect(parseVoiceLeadingItemRef('vl:aba-251:level1:A:C')).toBeNull();
      expect(parseVoiceLeadingItemRef('vl:dom-sharp9sharp5:A:min9:C')).toBeNull();
    });

    it('returns null for unknown pattern ids', () => {
      expect(parseVoiceLeadingItemRef('vl:made-up:guide-tones:A:C')).toBeNull();
      expect(parseVoiceLeadingItemRef('vl:bab-251:guide-tones:A:C')).toBeNull();
    });

    it('returns null when sub-dimensions are out of vocabulary for the pattern', () => {
      // major-251 has aba-structure but five-one does not.
      expect(parseVoiceLeadingItemRef('vl:five-one:aba-structure:A:C')).toBeNull();
      // diatonic-cycle has pos1..pos3 only.
      expect(parseVoiceLeadingItemRef('vl:diatonic-cycle:pos4:C')).toBeNull();
      // minor-aba uses pos-A / pos-B, not plain A / B.
      expect(parseVoiceLeadingItemRef('vl:minor-aba:A:C')).toBeNull();
      // inversion-4 patterns reject 5-segment shapes.
      expect(parseVoiceLeadingItemRef('vl:dom7b9:pos1:extra:C')).toBeNull();
    });

    it('returns null when the key is not in the canonical KEYS list', () => {
      expect(parseVoiceLeadingItemRef('vl:major-251:guide-tones:A:Gb')).toBeNull();
      expect(parseVoiceLeadingItemRef('vl:diatonic-cycle:pos1:H')).toBeNull();
    });

    it('returns null when the prefix is not "vl"', () => {
      expect(parseVoiceLeadingItemRef('xl:major-251:guide-tones:A:C')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------
// voiceLeadingSubCellLabel — display labels
// ---------------------------------------------------------------------

describe('voiceLeadingSubCellLabel', () => {
  it('type-position reads as "<type> · Pos <position>"', () => {
    const major = parseVoiceLeadingItemRef('vl:major-251:aba-structure:B:C')!;
    expect(voiceLeadingSubCellLabel(major)).toBe('ABA structure · Pos B');
    const five = parseVoiceLeadingItemRef('vl:five-one:guide-tones:A:F')!;
    expect(voiceLeadingSubCellLabel(five)).toBe('Guide tones · Pos A');
    const minor = parseVoiceLeadingItemRef('vl:minor-251:full-voicing:B:G')!;
    expect(voiceLeadingSubCellLabel(minor)).toBe('Full voicing · Pos B');
  });

  it('diatonic-cycle reads as "Starting position N"', () => {
    const desc = parseVoiceLeadingItemRef('vl:diatonic-cycle:pos3:F')!;
    expect(voiceLeadingSubCellLabel(desc)).toBe('Starting position 3');
  });

  it('minor-aba strips the pos- prefix', () => {
    const a = parseVoiceLeadingItemRef('vl:minor-aba:pos-A:C')!;
    const b = parseVoiceLeadingItemRef('vl:minor-aba:pos-B:Eb')!;
    expect(voiceLeadingSubCellLabel(a)).toBe('Position A');
    expect(voiceLeadingSubCellLabel(b)).toBe('Position B');
  });

  it('inversion-4 reads as "Position N"', () => {
    const desc = parseVoiceLeadingItemRef('vl:dom7b9:pos4:G')!;
    expect(voiceLeadingSubCellLabel(desc)).toBe('Position 4');
  });
});

// ---------------------------------------------------------------------
// voiceLeadingCellSeconds — per-sub-cell time seeds
// ---------------------------------------------------------------------

describe('voiceLeadingCellSeconds', () => {
  it('type-position guide-tones / seventh-chords → 90 s', () => {
    const cases = [
      'vl:five-one:guide-tones:A:C',
      'vl:five-one:seventh-chords:B:F',
      'vl:major-251:guide-tones:A:G',
      'vl:major-251:seventh-chords:B:Eb',
      'vl:minor-251:guide-tones:A:Bb',
      'vl:minor-251:seventh-chords:B:A',
    ];
    for (const ref of cases) {
      const desc = parseVoiceLeadingItemRef(ref)!;
      expect(voiceLeadingCellSeconds(desc), ref).toBe(90);
    }
  });

  it('capstone types bump to 120 s', () => {
    const five = parseVoiceLeadingItemRef('vl:five-one:full-voicing:A:C')!;
    expect(voiceLeadingCellSeconds(five)).toBe(120);
    const major = parseVoiceLeadingItemRef('vl:major-251:aba-structure:B:F')!;
    expect(voiceLeadingCellSeconds(major)).toBe(120);
    const minor = parseVoiceLeadingItemRef('vl:minor-251:full-voicing:A:G')!;
    expect(voiceLeadingCellSeconds(minor)).toBe(120);
  });

  it('diatonic-cycle → 180 s', () => {
    const d = parseVoiceLeadingItemRef('vl:diatonic-cycle:pos2:F')!;
    expect(voiceLeadingCellSeconds(d)).toBe(180);
  });

  it('minor-aba → 90 s', () => {
    const a = parseVoiceLeadingItemRef('vl:minor-aba:pos-A:C')!;
    const b = parseVoiceLeadingItemRef('vl:minor-aba:pos-B:G')!;
    expect(voiceLeadingCellSeconds(a)).toBe(90);
    expect(voiceLeadingCellSeconds(b)).toBe(90);
  });

  it('dom7b9 and dim7 → 90 s for every inversion', () => {
    for (const ref of [
      'vl:dom7b9:pos1:C', 'vl:dom7b9:pos2:F', 'vl:dom7b9:pos3:G', 'vl:dom7b9:pos4:Bb',
      'vl:dim7:pos1:A',  'vl:dim7:pos2:C',  'vl:dim7:pos3:Eb', 'vl:dim7:pos4:F',
    ]) {
      const desc = parseVoiceLeadingItemRef(ref)!;
      expect(voiceLeadingCellSeconds(desc), ref).toBe(90);
    }
  });

  it('matches the published per-pattern baseline table', () => {
    expect(VOICE_LEADING_PATTERN_SECONDS['five-one']).toBe(90);
    expect(VOICE_LEADING_PATTERN_SECONDS['major-251']).toBe(90);
    expect(VOICE_LEADING_PATTERN_SECONDS['minor-251']).toBe(90);
    expect(VOICE_LEADING_PATTERN_SECONDS['diatonic-cycle']).toBe(180);
    expect(VOICE_LEADING_PATTERN_SECONDS['minor-aba']).toBe(90);
    expect(VOICE_LEADING_PATTERN_SECONDS['dom7b9']).toBe(90);
    expect(VOICE_LEADING_PATTERN_SECONDS['dim7']).toBe(90);
  });
});

// ---------------------------------------------------------------------
// Sanity: VoiceLeadingItemRefDescriptor stays narrow per kind
// ---------------------------------------------------------------------

describe('VoiceLeadingItemRefDescriptor type-narrowing', () => {
  it('exhaustively dispatches on kind', () => {
    function dispatch(desc: VoiceLeadingItemRefDescriptor): string {
      switch (desc.kind) {
        case 'type-position':  return `tp ${desc.type}/${desc.position}`;
        case 'diatonic-cycle': return `cyc ${desc.startingPosition}`;
        case 'minor-aba':      return `mab ${desc.position}`;
        case 'inversion-4':    return `inv ${desc.position}`;
      }
    }
    expect(dispatch(parseVoiceLeadingItemRef('vl:major-251:guide-tones:A:C')!))
      .toBe('tp guide-tones/A');
    expect(dispatch(parseVoiceLeadingItemRef('vl:diatonic-cycle:pos1:C')!))
      .toBe('cyc pos1');
    expect(dispatch(parseVoiceLeadingItemRef('vl:minor-aba:pos-A:C')!))
      .toBe('mab pos-A');
    expect(dispatch(parseVoiceLeadingItemRef('vl:dim7:pos1:C')!))
      .toBe('inv pos1');
  });
});
