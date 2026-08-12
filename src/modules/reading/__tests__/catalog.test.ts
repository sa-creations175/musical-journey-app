// @vitest-environment jsdom
/**
 * Reading catalog — counts, itemRef schema, and the guards that keep
 * render-time variation out of identity.
 */
import { describe, expect, it } from 'vitest';
import {
  CHORD_QUALITIES,
  CLEFS,
  KEY_MODES,
  NOTE_POSITIONS,
  NOTE_POSITION_MAX,
  NOTE_POSITION_MIN,
  SIGNATURES,
  SIGNATURE_DIRECTIONS,
  chordItemRef,
  clefsForFamily,
  enumerateAllReadingItems,
  enumerateChordItems,
  enumerateNoteItems,
  enumerateSignatureItems,
  noteItemRef,
  parseReadingItemRef,
  positionsForFamily,
  readingSkillForItemRef,
  signatureItemRef,
} from '../catalog';
import {
  READING_COVERAGE_GROUPS,
  itemRefMatcherForReadingGroup,
} from '../coverageGroups';
import { readingCounts } from '../../../lib/moduleItemCounts';
import {
  enumerateReading,
  enumerateReadingGroup,
} from '../../goals/scopeEnumeration';

// =====================================================================
// Counts — derived, and matching the design
// =====================================================================

describe('catalog shape', () => {
  it('has 13 signatures, six flats through six sharps', () => {
    expect(SIGNATURES).toHaveLength(13);
    expect(SIGNATURES.map(s => s.id)).toEqual([
      '6f', '5f', '4f', '3f', '2f', '1f', '0',
      '1s', '2s', '3s', '4s', '5s', '6s',
    ]);
  });

  it('drops the seven-accidental signatures rather than the six', () => {
    // C# major (7 sharps) and Cb major (7 flats) name music universally
    // written as Db and B. Gb and F# both stay — they genuinely appear.
    const ids = SIGNATURES.map(s => s.id);
    expect(ids).not.toContain('7s');
    expect(ids).not.toContain('7f');
    expect(SIGNATURES.find(s => s.id === '6f')?.major).toBe('Gb');
    expect(SIGNATURES.find(s => s.id === '6s')?.major).toBe('F#');
  });

  it('every signature names both a major and a relative minor', () => {
    for (const s of SIGNATURES) {
      expect(s.major).toBeTruthy();
      expect(s.minor).toBeTruthy();
      expect(s.count).toBe(s.id === '0' ? 0 : Number(s.id[0]));
      expect(s.accidental).toBe(
        s.id === '0' ? null : s.id.endsWith('s') ? 'sharp' : 'flat',
      );
    }
  });

  it('has 17 staff positions per clef, two ledger lines either side', () => {
    // 9 on the staff (5 lines + 4 spaces) + 4 below + 4 above.
    expect(NOTE_POSITIONS).toHaveLength(17);
    expect(NOTE_POSITION_MIN).toBe(-4);
    expect(NOTE_POSITION_MAX).toBe(12);
  });

  it('has 14 chord qualities across three families', () => {
    expect(CHORD_QUALITIES).toHaveLength(14);
    const byFamily = (f: string) =>
      CHORD_QUALITIES.filter(q => q.family === f).length;
    expect(byFamily('triad')).toBe(4);
    expect(byFamily('seventh')).toBe(5);
    expect(byFamily('open')).toBe(5);
  });

  it('open shapes are bass-clef only and single-position', () => {
    // They ARE a left-hand voicing — inverting one makes it a
    // different shape, not the same shape re-stacked.
    expect(clefsForFamily('open')).toEqual(['bass']);
    expect(positionsForFamily('open')).toEqual(['root']);
    expect(clefsForFamily('triad')).toEqual([...CLEFS]);
  });
});

describe('derived counts match the design', () => {
  it('key signatures: 78 = 13 x 2 modes x 3 directions', () => {
    expect(enumerateSignatureItems()).toHaveLength(78);
    expect(SIGNATURES.length * KEY_MODES.length * SIGNATURE_DIRECTIONS.length)
      .toBe(78);
  });

  it('note recognition: 34 = 17 positions x 2 clefs', () => {
    expect(enumerateNoteItems()).toHaveLength(34);
  });

  it('chord identification: 69, inside the 50-100 design band', () => {
    // triads 4 x 3 inversions x 2 clefs = 24
    // sevenths 5 x 4 inversions x 2 clefs = 40
    // open 5 x 1 x 1 (bass) = 5
    const n = enumerateChordItems().length;
    expect(n).toBe(69);
    expect(n).toBeGreaterThanOrEqual(50);
    expect(n).toBeLessThanOrEqual(100);
  });

  it('every itemRef is unique across the whole module', () => {
    const all = enumerateAllReadingItems();
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(78 + 34 + 69);
  });

  it('readingCounts derives from the catalog, not from literals', () => {
    const c = readingCounts();
    expect(c.keySignatures).toBe(enumerateSignatureItems().length);
    expect(c.noteRecognition).toBe(enumerateNoteItems().length);
    expect(c.chordIdentification).toBe(enumerateChordItems().length);
    expect(c.total).toBe(enumerateAllReadingItems().length);
  });

  it('scopeEnumeration is the same walk the counts use', () => {
    expect(enumerateReading()).toEqual(enumerateAllReadingItems());
  });
});

// =====================================================================
// The schema guard — render-time variation must be inexpressible
// =====================================================================

describe('itemRef schema excludes render-time variation', () => {
  const all = enumerateAllReadingItems();

  it('no itemRef mentions a frame, a key overlay, or an octave', () => {
    // The four things that vary when a card is DRAWN. If any of them
    // could be encoded, the same skill would fragment into many
    // spacing rows.
    for (const ref of all) {
      expect(ref).not.toMatch(/grand|single|staff|frame/);
      expect(ref).not.toMatch(/overlay|keysig|inkey/);
      expect(ref).not.toMatch(/oct[0-9]|height/);
    }
  });

  it('chord refs carry no key segment — reading E-G-B is key-agnostic', () => {
    // Exactly four segments, and the only clef-or-position values
    // allowed in the tail are the enum members. A key name has
    // nowhere to sit.
    const KEY_NAMES = new Set(
      ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'].map(k => k.toLowerCase()),
    );
    for (const ref of enumerateChordItems()) {
      const parts = ref.split(':');
      expect(parts, ref).toHaveLength(4); // chord:quality:position:clef
      for (const seg of parts.slice(1)) {
        expect(KEY_NAMES.has(seg.toLowerCase()), `${ref} / ${seg}`).toBe(false);
      }
    }
  });

  it('every enumerated ref round-trips through the parser', () => {
    for (const ref of all) {
      const parsed = parseReadingItemRef(ref);
      expect(parsed, ref).not.toBeNull();
      if (parsed?.skill === 'sig') {
        expect(signatureItemRef(parsed.signature, parsed.mode, parsed.direction))
          .toBe(ref);
      } else if (parsed?.skill === 'note') {
        expect(noteItemRef(parsed.clef, parsed.position)).toBe(ref);
      } else if (parsed?.skill === 'chord') {
        expect(chordItemRef(parsed.qualityId, parsed.position, parsed.clef))
          .toBe(ref);
      }
    }
  });

  it('REJECTS a ref that tries to encode render-time variation', () => {
    // The property under test: someone reaching for these later gets
    // null, not a silently-accepted fifth dimension.
    expect(parseReadingItemRef('chord:maj:root:treble:grand')).toBeNull();
    expect(parseReadingItemRef('chord:maj:root:treble:Eb')).toBeNull();
    expect(parseReadingItemRef('note:treble:4:grand')).toBeNull();
    expect(parseReadingItemRef('sig:2s:major:name:overlay')).toBeNull();
  });

  it('rejects malformed and out-of-range refs', () => {
    expect(parseReadingItemRef('note:treble:13')).toBeNull();  // past 2 ledger lines
    expect(parseReadingItemRef('note:treble:-5')).toBeNull();
    expect(parseReadingItemRef('note:alto:4')).toBeNull();
    expect(parseReadingItemRef('sig:7s:major:name')).toBeNull();
    expect(parseReadingItemRef('sig:2s:dorian:name')).toBeNull();
    expect(parseReadingItemRef('chord:sus4:root:treble')).toBeNull();
    expect(parseReadingItemRef('chord:maj:inv3:treble')).not.toBeNull(); // arity ok
    expect(parseReadingItemRef('vl:five-one:C')).toBeNull();   // another module
    expect(parseReadingItemRef('')).toBeNull();
  });

  it('accepts negative note positions below the staff', () => {
    const parsed = parseReadingItemRef('note:bass:-4');
    expect(parsed).toEqual({ skill: 'note', clef: 'bass', position: -4 });
  });

  it('readingSkillForItemRef routes by parse, not by prefix string', () => {
    expect(readingSkillForItemRef('sig:0:major:name')).toBe('sig');
    expect(readingSkillForItemRef('note:bass:0')).toBe('note');
    expect(readingSkillForItemRef('chord:min:inv1:bass')).toBe('chord');
    // Prefix alone is not enough — a malformed ref is not a skill.
    expect(readingSkillForItemRef('chord:nonsense')).toBeNull();
  });
});

// =====================================================================
// Coverage groups
// =====================================================================

describe('coverage groups', () => {
  it('has five groups — the HF-simple direction, not the S&P one', () => {
    expect(READING_COVERAGE_GROUPS).toHaveLength(5);
    expect(READING_COVERAGE_GROUPS.map(g => g.id)).toEqual([
      'key-signatures', 'note-recognition',
      'chord-triads', 'chord-sevenths', 'chord-open-shapes',
    ]);
  });

  it('the groups PARTITION the module — every item in exactly one', () => {
    // Not merely "they add up": each item is checked against all five
    // so an overlap cannot hide behind a matching total.
    for (const ref of enumerateAllReadingItems()) {
      const hits = READING_COVERAGE_GROUPS.filter(g => g.matches(ref));
      expect(hits.map(h => h.id), ref).toHaveLength(1);
    }
  });

  it('group totals sum to the module total', () => {
    const c = readingCounts();
    const sum = READING_COVERAGE_GROUPS
      .reduce((n, g) => n + c.byGroup[g.id], 0);
    expect(sum).toBe(c.total);
  });

  it('group denominators are derived, and match the design split', () => {
    const c = readingCounts();
    expect(c.byGroup['key-signatures']).toBe(78);
    expect(c.byGroup['note-recognition']).toBe(34);
    expect(c.byGroup['chord-triads']).toBe(24);
    expect(c.byGroup['chord-sevenths']).toBe(40);
    expect(c.byGroup['chord-open-shapes']).toBe(5);
  });

  it('enumerateReadingGroup agrees with the matcher', () => {
    for (const g of READING_COVERAGE_GROUPS) {
      const enumerated = enumerateReadingGroup(g.id);
      expect(enumerated).toEqual(enumerateAllReadingItems().filter(g.matches));
      expect(enumerated.length).toBe(readingCounts().byGroup[g.id]);
    }
  });

  it('an unknown group id enumerates to nothing rather than everything', () => {
    expect(itemRefMatcherForReadingGroup('no-such-group')).toBeNull();
    expect(enumerateReadingGroup('no-such-group')).toEqual([]);
  });

  it('a group matcher rejects refs from other modules', () => {
    for (const g of READING_COVERAGE_GROUPS) {
      expect(g.matches('chord-shape:maj:C:root')).toBe(false);
      expect(g.matches('scale:major:C')).toBe(false);
    }
  });
});
