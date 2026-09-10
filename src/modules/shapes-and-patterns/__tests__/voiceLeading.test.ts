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
  voiceLeadingGridRows,
  voiceLeadingSubCellLabel,
  type VoiceLeadingItemRefDescriptor,
} from '../catalog';
import {
  VOICE_LEADING_PATTERN_SECONDS,
  voiceLeadingCellSeconds,
} from '../../../lib/sessionAlgorithm/timePerAttempt';

describe('VOICE_LEADING_PATTERNS catalog', () => {
  it('ships the twelve rows of the page, in page order', () => {
    // ORDER IS ASSERTED, not just membership. The array order is the
    // page order AND the session algorithm's soft priority within the
    // unstarted tier, so a reorder is a behaviour change and has to
    // be a deliberate edit here. The five named progressions sit
    // straight after Major 2-5-1, per Silas's ruling of 9 Sep 2026.
    expect(VOICE_LEADING_PATTERNS.map(p => p.id)).toEqual([
      'diatonic-cycle',
      'five-one',
      'major-251',
      '1-5-6-4',
      '1-6-4-5',
      '1-6-2-5',
      '1-4-5',
      'backdoor',
      'minor-251',
      'minor-aba',
      'dom7b9',
      'dim7',
    ]);
  });

  it('every pattern says which chords it moves through', () => {
    /**
     * THE PAGE USED TO KNOW ITS CHORDS ONLY IN PROSE. A pattern
     * carried a label and a description, so the only place the app
     * said what Major 2-5-1 plays was an English sentence — nothing
     * could sound the row, draw it, or make a card from it without
     * parsing that sentence.
     */
    for (const p of VOICE_LEADING_PATTERNS) {
      expect(p.chords.length, p.id).toBeGreaterThanOrEqual(2);
      for (const c of p.chords) {
        // Degrees as the deck writes them: a number, optionally with
        // a leading flat.
        expect(c.degree, `${p.id} ${c.degree}`).toMatch(/^b?[1-7]$/);
        // And a quality out of the deck's vocabulary, not free text.
        expect(
          ['', 'm', 'm7', 'm9', 'maj7', 'maj9', '7', '9', 'm7b5', 'dim7',
            '7b9', '7#9#5'],
          `${p.id} ${c.quality}`,
        ).toContain(c.quality);
      }
    }
  });

  it('names the chords the labels and descriptions already claimed', () => {
    const chordsOf = (id: string) => VOICE_LEADING_PATTERN_BY_ID.get(id)!
      .chords.map(c => `${c.degree}${c.quality}`);
    expect(chordsOf('major-251')).toEqual(['2m7', '57', '1maj7']);
    expect(chordsOf('minor-251')).toEqual(['2m7b5', '57', '1m7']);
    expect(chordsOf('five-one')).toEqual(['57', '1maj7']);
    // The eight of the cycle, in the order the label spells out.
    expect(chordsOf('diatonic-cycle'))
      .toEqual(['1maj7', '4maj7', '7m7b5', '3m7', '6m7', '2m7', '57', '1maj7']);
    // The two altered passes name the quality that is in their label.
    expect(chordsOf('minor-aba')).toEqual(['57#9#5', '1m9']);
    expect(chordsOf('dom7b9')).toEqual(['57b9', '1m9']);
  });

  it('gives the five named progressions the chords the deck gives them', () => {
    const chordsOf = (id: string) => VOICE_LEADING_PATTERN_BY_ID.get(id)!
      .chords.map(c => `${c.degree}${c.quality}`);
    expect(chordsOf('1-5-6-4')).toEqual(['1maj7', '57', '6m7', '4maj7']);
    expect(chordsOf('1-6-4-5')).toEqual(['1maj7', '6m7', '4maj7', '57']);
    expect(chordsOf('1-6-2-5')).toEqual(['1maj7', '6m7', '2m7', '57']);
    expect(chordsOf('1-4-5')).toEqual(['1maj7', '4maj7', '57', '1maj7']);
    // THE BACKDOOR IS THE TWO BORROWED CHORDS RESOLVING HOME —
    // 4 minor → ♭7(7) → 1, verified with Silas 9 Sep 2026. The row,
    // its cells and its itemRefs are unchanged; only what it says the
    // chords are moved.
    expect(chordsOf('backdoor')).toEqual(['4m7', 'b77', '1maj7']);
  });

  it('labels every row with its own chords, qualities and all', () => {
    // =================================================================
    // ONE FORMATTER, AND THE LABEL IS ITS OUTPUT.
    //
    // Silas's ruling of 10 Sep 2026: every chord in a progression shows
    // its quality, and the separator is a middle dot with a space
    // either side. The grid said "1 5 6 4", the card's question said
    // "1-5-6-4" and its rotate button said "1 5 6 4" — three spellings
    // of one progression, and not one of them said the 6 is minor.
    // =================================================================
    expect(VOICE_LEADING_PATTERN_BY_ID.get('1-5-6-4')!.label)
      .toBe('1 · 5 · 6m · 4');
    expect(VOICE_LEADING_PATTERN_BY_ID.get('1-6-4-5')!.label)
      .toBe('1 · 6m · 4 · 5');
    expect(VOICE_LEADING_PATTERN_BY_ID.get('1-6-2-5')!.label)
      .toBe('1 · 6m · 2m · 5');
    // FOUR CHORDS, because the row returns to its 1 — which its own
    // chord data has always said and its name did not.
    expect(VOICE_LEADING_PATTERN_BY_ID.get('1-4-5')!.label)
      .toBe('1 · 4 · 5 · 1');
    // The name comes after the numbers it names, and the flat is a
    // glyph rather than a letter b.
    expect(VOICE_LEADING_PATTERN_BY_ID.get('backdoor')!.label)
      .toBe('4m · ♭7 · 1 (backdoor)');
    expect(VOICE_LEADING_PATTERN_BY_ID.get('major-251')!.label)
      .toBe('Major 2m · 5 · 1');
    expect(VOICE_LEADING_PATTERN_BY_ID.get('diatonic-cycle')!.label)
      .toBe('Diatonic Cycle (1 · 4 · 7dim · 3m · 6m · 2m · 5 · 1)');
  });

  it('leaves the passes their arrow, which means resolution', () => {
    // The dot separates a ROW of chords; the arrow says one chord
    // resolves to another. Silas's ruling of 9 Sep, kept on 10 Sep.
    for (const id of ['five-one', 'minor-aba', 'dom7b9', 'dim7']) {
      const label = VOICE_LEADING_PATTERN_BY_ID.get(id)!.label;
      expect(label, id).toContain('→');
      expect(label, id).not.toContain(' · ');
    }
  });

  it('shapes the five exactly like Major 2-5-1', () => {
    const major = VOICE_LEADING_PATTERN_BY_ID.get('major-251')!;
    if (major.kind !== 'type-position') throw new Error('wrong kind');
    const shape = (p: typeof major) => p.types.map(t => t.positions.length);
    for (const id of ['1-5-6-4', '1-6-4-5', '1-6-2-5', '1-4-5', 'backdoor']) {
      const p = VOICE_LEADING_PATTERN_BY_ID.get(id)!;
      if (p.kind !== 'type-position') throw new Error(`${id} wrong kind`);
      expect(shape(p), id).toEqual(shape(major));
      expect(enumerateVoiceLeadingCells(p, 'C'), id).toHaveLength(7);
    }
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
  it('five-one → 7 cells per key (2 + 3 + 2 — seventh chords has three)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('five-one')!;
    const cells = enumerateVoiceLeadingCells(pat, 'C');
    expect(cells).toHaveLength(7);
    expect(cells).toContain('vl:five-one:guide-tones:A:C');
    expect(cells).toContain('vl:five-one:full-voicing:B:C');
    // The third position, and only on the rootless 3-5-7 row.
    expect(cells).toContain('vl:five-one:seventh-chords:C:C');
    expect(cells).not.toContain('vl:five-one:guide-tones:C:C');
    expect(cells).not.toContain('vl:five-one:full-voicing:C:C');
  });

  it('major-251 → 7 cells per key (seventh-chords carries the third position)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('major-251')!;
    const cells = enumerateVoiceLeadingCells(pat, 'C');
    expect(cells).toHaveLength(7);
    expect(cells).toContain('vl:major-251:guide-tones:A:C');
    expect(cells).toContain('vl:major-251:aba-structure:B:C');
    expect(cells).toContain('vl:major-251:seventh-chords:C:C');
    expect(cells).not.toContain('vl:major-251:aba-structure:C:C');
  });

  it('minor-251 → 7 cells per key (seventh-chords carries the third position)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('minor-251')!;
    const cells = enumerateVoiceLeadingCells(pat, 'C');
    expect(cells).toHaveLength(7);
    expect(cells).toContain('vl:minor-251:full-voicing:A:C');
    expect(cells).toContain('vl:minor-251:seventh-chords:C:C');
    expect(cells).not.toContain('vl:minor-251:full-voicing:C:C');
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

  it('total catalog cell count = 69 × 12 keys = 828', () => {
    let total = 0;
    for (const p of VOICE_LEADING_PATTERNS) {
      for (const k of KEYS) {
        total += enumerateVoiceLeadingCells(p, k).length;
      }
    }
    expect(total).toBe(828);
  });

  it('per-key cell totals: eight 7s + 3 + 2 + 4 + 4 = 69', () => {
    let perKey = 0;
    for (const p of VOICE_LEADING_PATTERNS) {
      perKey += enumerateVoiceLeadingCells(p, 'C').length;
    }
    expect(perKey).toBe(69);
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
  it('says Position n on every row of the page', () => {
    const major = parseVoiceLeadingItemRef('vl:major-251:aba-structure:B:C')!;
    expect(voiceLeadingSubCellLabel(major)).toBe('Extended Voicings · Position 2');
    const five = parseVoiceLeadingItemRef('vl:five-one:guide-tones:A:F')!;
    expect(voiceLeadingSubCellLabel(five)).toBe('Guide Tones · Position 1');
    const minor = parseVoiceLeadingItemRef('vl:minor-251:full-voicing:B:G')!;
    expect(voiceLeadingSubCellLabel(minor)).toBe('Extended Voicings · Position 2');
    const third = parseVoiceLeadingItemRef('vl:minor-251:seventh-chords:C:G')!;
    expect(voiceLeadingSubCellLabel(third)).toBe('Seventh Chords · Position 3');
  });

  it('rejects a position the type does not have', () => {
    // C exists as a tag, but only Seventh Chords has a third position.
    expect(parseVoiceLeadingItemRef('vl:five-one:guide-tones:C:C')).toBeNull();
    expect(parseVoiceLeadingItemRef('vl:major-251:aba-structure:C:C')).toBeNull();
    expect(parseVoiceLeadingItemRef('vl:five-one:seventh-chords:C:C')).not.toBeNull();
  });

  it('diatonic-cycle joins the shared format', () => {
    const desc = parseVoiceLeadingItemRef('vl:diatonic-cycle:pos3:F')!;
    expect(voiceLeadingSubCellLabel(desc)).toBe('Position 3');
  });

  it('minor-aba numbers its A and B tags', () => {
    const a = parseVoiceLeadingItemRef('vl:minor-aba:pos-A:C')!;
    const b = parseVoiceLeadingItemRef('vl:minor-aba:pos-B:Eb')!;
    expect(voiceLeadingSubCellLabel(a)).toBe('Position 1');
    expect(voiceLeadingSubCellLabel(b)).toBe('Position 2');
  });

  it('the two altered-dominant passes say Position n as well', () => {
    // They used to name an inversion of the dominant. On a two-handed
    // voicing the bass note is the left hand's and does not move, so
    // what the row actually counts is the right hand's starting shape
    // — the same thing every row above it counts. Silas's ruling of
    // 9 Sep 2026.
    const root = parseVoiceLeadingItemRef('vl:dom7b9:pos1:G')!;
    expect(voiceLeadingSubCellLabel(root)).toBe('Position 1');
    const desc = parseVoiceLeadingItemRef('vl:dom7b9:pos4:G')!;
    expect(voiceLeadingSubCellLabel(desc)).toBe('Position 4');
    const dim = parseVoiceLeadingItemRef('vl:dim7:pos3:A')!;
    expect(voiceLeadingSubCellLabel(dim)).toBe('Position 3');
  });

  it('says nothing on the page about an inversion or a Pos A', () => {
    /**
     * THE SWEEP, not four examples.
     *
     * Every label the page can draw — the row gutters of every
     * pattern, and the sub-cell label of every itemRef the catalog
     * enumerates — is checked for the two words the ruling removed.
     * A pattern added later with a label of its own has to pass this
     * without anybody remembering to come back here.
     */
    const labels: string[] = [];
    for (const pattern of VOICE_LEADING_PATTERNS) {
      for (const row of voiceLeadingGridRows(pattern)) labels.push(row.label);
      for (const key of KEYS) {
        for (const ref of enumerateVoiceLeadingCells(pattern, key)) {
          labels.push(voiceLeadingSubCellLabel(parseVoiceLeadingItemRef(ref)!));
        }
      }
    }
    expect(labels.length).toBeGreaterThan(400);
    for (const label of labels) {
      expect(label, label).not.toMatch(/inversion/i);
      expect(label, label).not.toMatch(/\bPos\b/);
      // And every position it does name is a number.
      expect(label, label).not.toMatch(/Position [A-Z]/);
    }
  });

  it('calls the altered-dominant tail a 5 → 1, and says ABA nowhere', () => {
    /**
     * ABA IS A POSITION PATTERN, NOT A CHORD. Silas's ruling of
     * 9 Sep 2026. It says which SHAPE each chord of a 2 5 1 takes —
     * A, then B, then A again — so a two-chord row cannot be one, and
     * the row is the tail of the minor 2 5 1 exactly as "5 → 1" is
     * the tail of the major one.
     *
     * A SWEEP OVER EVERY LABEL AND DESCRIPTION, so a row added later
     * cannot bring the word back without this failing.
     */
    // THE NAME SAYS THE CHORDS AND THE LANDING, the shape the other
    // two passes take. Silas's prototype of 10 Sep names all three
    // this way.
    expect(VOICE_LEADING_PATTERN_BY_ID.get('minor-aba')!.label)
      .toBe('5(7♯9♯5) → 1m');
    for (const pattern of VOICE_LEADING_PATTERNS) {
      const prose = [pattern.label, pattern.description ?? '',
        ...voiceLeadingGridRows(pattern).flatMap(r => [r.label, r.hint ?? ''])];
      for (const text of prose) expect(text, text).not.toMatch(/\bABA\b/);
    }
    // And the id did NOT move: it is a spacingState itemRef segment.
    expect(VOICE_LEADING_PATTERN_BY_ID.has('minor-aba')).toBe(true);
  });

  it('numbers the positions from the lowest start, in tag order', () => {
    // The display number is derived from the storage tag, so a row
    // cannot be renumbered by accident: A is 1, B is 2, C is 3.
    for (const [tag, n] of [['A', 1], ['B', 2], ['C', 3]] as const) {
      const ref = `vl:five-one:seventh-chords:${tag}:C`;
      expect(voiceLeadingSubCellLabel(parseVoiceLeadingItemRef(ref)!))
        .toBe(`Seventh Chords · Position ${n}`);
    }
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
// voiceLeadingGridRows — per sub-dimension row enumeration for the
// heat-grid display layer
// ---------------------------------------------------------------------

describe('voiceLeadingGridRows', () => {
  it('type-position patterns return 7 rows (2 + 3 + 2)', () => {
    for (const id of ['five-one', 'major-251', 'minor-251'] as const) {
      const pat = VOICE_LEADING_PATTERN_BY_ID.get(id)!;
      const rows = voiceLeadingGridRows(pat);
      expect(rows, id).toHaveLength(7);
      // The middle row group is the seventh chords, and it is the
      // only one with three.
      const seventh = rows.filter(r => r.rowId.startsWith('seventh-chords:'));
      expect(seventh, id).toHaveLength(3);
      expect(seventh.map(r => r.label), id).toEqual([
        'Seventh Chords · Position 1',
        'Seventh Chords · Position 2',
        'Seventh Chords · Position 3',
      ]);
    }
  });

  it('diatonic-cycle returns 3 rows (3 starting positions)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('diatonic-cycle')!;
    const rows = voiceLeadingGridRows(pat);
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.rowId)).toEqual(['pos1', 'pos2', 'pos3']);
  });

  it('minor-aba returns 2 rows (pos-A, pos-B)', () => {
    const pat = VOICE_LEADING_PATTERN_BY_ID.get('minor-aba')!;
    const rows = voiceLeadingGridRows(pat);
    expect(rows.map(r => r.rowId)).toEqual(['pos-A', 'pos-B']);
  });

  it('inversion-4 patterns return 4 rows (root + 3 inversions)', () => {
    for (const id of ['dom7b9', 'dim7'] as const) {
      const pat = VOICE_LEADING_PATTERN_BY_ID.get(id)!;
      const rows = voiceLeadingGridRows(pat);
      expect(rows.map(r => r.rowId)).toEqual(['pos1', 'pos2', 'pos3', 'pos4']);
    }
  });

  it('row labels are human-friendly for the gutter', () => {
    const major = voiceLeadingGridRows(VOICE_LEADING_PATTERN_BY_ID.get('major-251')!);
    expect(major[0].label).toBe('Guide Tones · Position 1');
    expect(major[6].label).toBe('Extended Voicings · Position 2');

    const cycle = voiceLeadingGridRows(VOICE_LEADING_PATTERN_BY_ID.get('diatonic-cycle')!);
    expect(cycle[0].label).toBe('Position 1');
    expect(cycle[2].label).toBe('Position 3');

    const aba = voiceLeadingGridRows(VOICE_LEADING_PATTERN_BY_ID.get('minor-aba')!);
    expect(aba[0].label).toBe('Position 1');
    expect(aba[1].label).toBe('Position 2');

    const dom = voiceLeadingGridRows(VOICE_LEADING_PATTERN_BY_ID.get('dom7b9')!);
    expect(dom[0].label).toBe('Position 1');
    expect(dom[3].label).toBe('Position 4');
  });

  it('itemRefForKey produces the canonical sub-cell itemRef', () => {
    const major = voiceLeadingGridRows(VOICE_LEADING_PATTERN_BY_ID.get('major-251')!);
    expect(major[0].itemRefForKey('C')).toBe('vl:major-251:guide-tones:A:C');
    expect(major[6].itemRefForKey('Bb')).toBe('vl:major-251:aba-structure:B:Bb');

    const cycle = voiceLeadingGridRows(VOICE_LEADING_PATTERN_BY_ID.get('diatonic-cycle')!);
    expect(cycle[1].itemRefForKey('F')).toBe('vl:diatonic-cycle:pos2:F');

    const aba = voiceLeadingGridRows(VOICE_LEADING_PATTERN_BY_ID.get('minor-aba')!);
    expect(aba[0].itemRefForKey('Eb')).toBe('vl:minor-aba:pos-A:Eb');

    const dim = voiceLeadingGridRows(VOICE_LEADING_PATTERN_BY_ID.get('dim7')!);
    expect(dim[2].itemRefForKey('G')).toBe('vl:dim7:pos3:G');
  });

  it('row × key product matches enumerateVoiceLeadingCells for every pattern', () => {
    // Sanity invariant: every itemRef produced by row.itemRefForKey
    // across all 12 keys equals the full sub-cell catalog for that
    // pattern. No cells lost, no extras added.
    for (const p of VOICE_LEADING_PATTERNS) {
      const fromRows = voiceLeadingGridRows(p)
        .flatMap(r => KEYS.map(k => r.itemRefForKey(k)));
      const fromCatalog = KEYS.flatMap(k => enumerateVoiceLeadingCells(p, k));
      expect(new Set(fromRows), p.id).toEqual(new Set(fromCatalog));
      expect(fromRows.length).toBe(fromCatalog.length);
    }
  });

  it('row ids are unique within a pattern', () => {
    for (const p of VOICE_LEADING_PATTERNS) {
      const rows = voiceLeadingGridRows(p);
      const ids = new Set(rows.map(r => r.rowId));
      expect(ids.size, p.id).toBe(rows.length);
    }
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

// ---------------------------------------------------------------------
// The five named progressions, end to end
// ---------------------------------------------------------------------

describe('the five named progressions on the passes page', () => {
  const FIVE = ['1-5-6-4', '1-6-4-5', '1-6-2-5', '1-4-5', 'backdoor'] as const;

  it('round-trips every one of their cells through the parser', () => {
    // A pattern id the parser does not know returns null, and a null
    // descriptor is a cell with no label, no time seed and no coverage
    // group — a row that draws and cannot be drilled.
    for (const id of FIVE) {
      const pattern = VOICE_LEADING_PATTERN_BY_ID.get(id)!;
      for (const key of KEYS) {
        for (const ref of enumerateVoiceLeadingCells(pattern, key)) {
          const desc = parseVoiceLeadingItemRef(ref);
          expect(desc, ref).not.toBeNull();
          expect(desc!.patternId, ref).toBe(id);
          expect(desc!.keyName, ref).toBe(key);
        }
      }
    }
  });

  it('refuses a position the type does not have, the same as the rest', () => {
    expect(parseVoiceLeadingItemRef('vl:1-5-6-4:seventh-chords:C:C')).not.toBeNull();
    expect(parseVoiceLeadingItemRef('vl:1-5-6-4:guide-tones:C:C')).toBeNull();
    expect(parseVoiceLeadingItemRef('vl:backdoor:full-voicing:C:C')).toBeNull();
    // And the legacy Extended Voicings id belongs to Major 2-5-1 alone.
    expect(parseVoiceLeadingItemRef('vl:1-4-5:aba-structure:A:C')).toBeNull();
  });

  it('says Position n on their rows too', () => {
    const rows = voiceLeadingGridRows(VOICE_LEADING_PATTERN_BY_ID.get('backdoor')!);
    expect(rows.map(r => r.label)).toEqual([
      'Guide Tones · Position 1',
      'Guide Tones · Position 2',
      'Seventh Chords · Position 1',
      'Seventh Chords · Position 2',
      'Seventh Chords · Position 3',
      'Extended Voicings · Position 1',
      'Extended Voicings · Position 2',
    ]);
  });

  it('gives their Extended Voicings row the capstone time seed', () => {
    // THE CAPSTONE IS THE TYPE, NOT THE PATTERN. The seed used to name
    // each pattern beside its own capstone type, so a pattern added
    // later would silently have taken the 90 s baseline on a row that
    // is the longest thing on it.
    for (const id of FIVE) {
      const capstone = parseVoiceLeadingItemRef(`vl:${id}:full-voicing:A:C`)!;
      expect(voiceLeadingCellSeconds(capstone), id).toBe(120);
      const plain = parseVoiceLeadingItemRef(`vl:${id}:guide-tones:A:C`)!;
      expect(voiceLeadingCellSeconds(plain), id).toBe(90);
      expect(VOICE_LEADING_PATTERN_SECONDS[id], id).toBe(90);
    }
    // The three that were already there keep what they had.
    expect(voiceLeadingCellSeconds(
      parseVoiceLeadingItemRef('vl:major-251:aba-structure:A:C')!,
    )).toBe(120);
  });
});
