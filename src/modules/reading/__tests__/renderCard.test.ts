// @vitest-environment jsdom
/**
 * Reading rendering — pitch mapping, chord spelling, and the property
 * the whole page depends on: the staff spec and the caption are read
 * off one resolved object and cannot disagree.
 *
 * These tests exist because the person checking the preview page
 * cannot yet read music well. A wrong caption next to a wrong render
 * looks consistent, so correctness has to be asserted here rather
 * than eyeballed there.
 */
import { describe, expect, it } from 'vitest';
import {
  ledgerLinesFor,
  isLinePosition,
  pitchAtStaffPosition,
  scientificPitch,
  semitoneValue,
  spellInterval,
} from '../pitch';
import {
  diatonicSpan,
  ledgerInfoForNoteItem,
  resolveReadingCard,
} from '../renderCard';
import { ALL_SAMPLES, PREVIEW_SECTIONS } from '../previewSamples';
import { enumerateAllReadingItems, CHORD_QUALITIES } from '../catalog';

// =====================================================================
// Staff position -> pitch
// =====================================================================

describe('clef anchors', () => {
  it('treble runs E4 (bottom line) to F5 (top line)', () => {
    expect(scientificPitch(pitchAtStaffPosition('treble', 0))).toBe('E4');
    expect(scientificPitch(pitchAtStaffPosition('treble', 8))).toBe('F5');
    // The G-clef line is what defines the clef.
    expect(scientificPitch(pitchAtStaffPosition('treble', 2))).toBe('G4');
  });

  it('bass runs G2 (bottom line) to A3 (top line)', () => {
    expect(scientificPitch(pitchAtStaffPosition('bass', 0))).toBe('G2');
    expect(scientificPitch(pitchAtStaffPosition('bass', 8))).toBe('A3');
    // The F-clef line.
    expect(scientificPitch(pitchAtStaffPosition('bass', 6))).toBe('F3');
  });

  it('MIDDLE C lands on both clefs, and is the same note', () => {
    // The cross-check that catches an off-by-one in either anchor:
    // one ledger below treble and one ledger above bass are C4.
    const fromTreble = pitchAtStaffPosition('treble', -2);
    const fromBass = pitchAtStaffPosition('bass', 10);
    expect(scientificPitch(fromTreble)).toBe('C4');
    expect(scientificPitch(fromBass)).toBe('C4');
    expect(semitoneValue(fromTreble)).toBe(semitoneValue(fromBass));
  });

  it('even positions are lines, odd are spaces', () => {
    expect(isLinePosition(0)).toBe(true);
    expect(isLinePosition(3)).toBe(false);
    expect(isLinePosition(-2)).toBe(true);
    expect(isLinePosition(-1)).toBe(false);
  });
});

describe('ledger lines', () => {
  it('counts none inside the staff', () => {
    for (let p = 0; p <= 8; p++) expect(ledgerLinesFor(p).count).toBe(0);
  });

  it('counts two at the extremes of the catalog range', () => {
    expect(ledgerLinesFor(12)).toEqual({ count: 2, side: 'above' });
    expect(ledgerLinesFor(-4)).toEqual({ count: 2, side: 'below' });
  });

  it('counts one at the first ledger either side', () => {
    expect(ledgerLinesFor(10)).toEqual({ count: 1, side: 'above' });
    expect(ledgerLinesFor(-2)).toEqual({ count: 1, side: 'below' });
  });

  it('the extreme samples really are two ledger lines out', () => {
    expect(ledgerInfoForNoteItem('note:treble:12')).toEqual({ count: 2, side: 'above' });
    expect(ledgerInfoForNoteItem('note:bass:-4')).toEqual({ count: 2, side: 'below' });
  });
});

// =====================================================================
// Spelling
// =====================================================================

describe('spellInterval keeps letter and accidental separate', () => {
  const C4 = { letter: 'C' as const, octave: 4, accidental: null };

  it('distinguishes a major third from a diminished fourth', () => {
    // Both are 4 semitones. Only the letter distance separates them,
    // which is exactly what pitch-class helpers cannot do.
    expect(scientificPitch(spellInterval(C4, 2, 4)!)).toBe('E4');
    expect(scientificPitch(spellInterval(C4, 3, 4)!)).toBe('Fb4');
  });

  it('produces a double flat for a diminished seventh', () => {
    // C dim7's seventh is Bbb, not A. This is the case that made
    // stack-position derivation necessary.
    expect(scientificPitch(spellInterval(C4, 6, 9)!)).toBe('Bbb4');
  });

  it('refuses a spelling needing more than a double accidental', () => {
    expect(spellInterval(C4, 2, 8)).toBeNull();
  });
});

// =====================================================================
// Chord resolution
// =====================================================================

describe('chord spelling', () => {
  const at = (ref: string, letter: 'C' | 'G' | 'A', octave: number) =>
    resolveReadingCard(ref, { root: { letter, octave } })!;

  it('spells a major triad', () => {
    expect(at('chord:maj:root:treble', 'C', 4).staff.keys)
      .toEqual(['c/4', 'e/4', 'g/4']);
  });

  it('spells a diminished triad with written accidentals', () => {
    // The sample that exists so the page exercises noteheads with
    // accidentals at all.
    expect(at('chord:dim:root:treble', 'C', 4).staff.keys)
      .toEqual(['c/4', 'eb/4', 'gb/4']);
  });

  it('spells a dominant seventh', () => {
    expect(at('chord:dom7:root:treble', 'G', 4).staff.keys)
      .toEqual(['g/4', 'b/4', 'd/5', 'f/5']);
  });

  it('INVERSION ROTATES, it does not respell', () => {
    // Same letters and accidentals, different bottom note. This is
    // why a first-inversion C major still answers "C major".
    const root = at('chord:maj:root:treble', 'C', 4).staff.keys;
    const inv1 = at('chord:maj:inv1:treble', 'C', 4).staff.keys;
    expect(inv1).toEqual(['e/4', 'g/4', 'c/5']);
    const letters = (ks: string[]) => ks.map(k => k.split('/')[0]).sort();
    expect(letters(inv1)).toEqual(letters(root));
  });

  it('third inversion puts the seventh at the bottom', () => {
    expect(at('chord:dom7:inv3:treble', 'G', 4).staff.keys)
      .toEqual(['f/5', 'g/5', 'b/5', 'd/6']);
  });

  it('spells an open shape across a tenth', () => {
    const card = at('chord:r10:root:bass', 'C', 2);
    expect(card.staff.keys).toEqual(['c/2', 'e/3']);
    // A tenth is nine letter-steps.
    expect(diatonicSpan(card.staff.keys)).toBe(9);
  });

  it('every catalog chord resolves with a default root', () => {
    // No quality may be unspellable — a null here would render a
    // blank card with a confident caption.
    for (const ref of enumerateAllReadingItems()) {
      if (!ref.startsWith('chord:')) continue;
      expect(resolveReadingCard(ref), ref).not.toBeNull();
    }
  });

  it('every chord draws as many noteheads as the quality has tones', () => {
    for (const ref of enumerateAllReadingItems()) {
      if (!ref.startsWith('chord:')) continue;
      const card = resolveReadingCard(ref)!;
      const quality = CHORD_QUALITIES.find(q => ref.startsWith(`chord:${q.id}:`))!;
      expect(card.staff.keys, ref).toHaveLength(quality.intervals.length);
    }
  });
});

// =====================================================================
// Captions — derived, and agreeing with the render
// =====================================================================

describe('captions', () => {
  it('a note caption is letter plus scientific octave', () => {
    expect(resolveReadingCard('note:treble:-2')!.caption).toBe('C4');
    expect(resolveReadingCard('note:treble:12')!.caption).toBe('C6');
    expect(resolveReadingCard('note:bass:-4')!.caption).toBe('C2');
  });

  it('a note caption matches the note actually drawn', () => {
    // The agreement property, checked across the whole catalog rather
    // than for the samples alone.
    for (const ref of enumerateAllReadingItems()) {
      if (!ref.startsWith('note:')) continue;
      const card = resolveReadingCard(ref)!;
      const [name, octave] = card.staff.keys[0].split('/');
      expect(`${name.toUpperCase()}${octave}`, ref).toBe(card.caption);
    }
  });

  it('a signature caption names the key and the accidental count', () => {
    expect(resolveReadingCard('sig:0:major:name')!.caption)
      .toBe('C major, no accidentals');
    expect(resolveReadingCard('sig:1s:major:name')!.caption)
      .toBe('G major, 1 sharp');
    expect(resolveReadingCard('sig:6f:major:name')!.caption)
      .toBe('Gb major, 6 flats');
    expect(resolveReadingCard('sig:2s:minor:name')!.caption)
      .toBe('B minor, 2 sharps');
  });

  it('a minor item draws its relative major signature and says minor', () => {
    // The glyphs for B minor and D major are identical; only the
    // caption differs. If these ever diverged the page would be lying.
    const minor = resolveReadingCard('sig:2s:minor:name')!;
    const major = resolveReadingCard('sig:2s:major:name')!;
    expect(minor.staff.keySignature).toBe(major.staff.keySignature);
    expect(minor.caption).toContain('minor');
    expect(major.caption).toContain('major');
  });

  it('the `which` direction lists the accidentals in written order', () => {
    expect(resolveReadingCard('sig:3s:major:name')!.caption)
      .toBe('A major, 3 sharps');
    expect(resolveReadingCard('sig:3s:major:which')!.caption)
      .toBe('A major: F# C# G#');
    expect(resolveReadingCard('sig:2f:major:which')!.caption)
      .toBe('Bb major: Bb Eb');
  });

  it('a chord caption names the supplied root, position, and quality', () => {
    const card = resolveReadingCard('chord:maj:inv1:treble', {
      root: { letter: 'C', octave: 4 },
    })!;
    expect(card.caption).toBe('C major, first inversion');
  });

  it('the caption follows the ROOT OPTION, not a default', () => {
    // The render/caption agreement lives or dies here: root comes from
    // options, and both the notation and the label must use the one
    // that was actually supplied.
    const g = resolveReadingCard('chord:maj:root:treble', {
      root: { letter: 'G', octave: 4 },
    })!;
    expect(g.caption).toBe('G major, root position');
    expect(g.staff.keys[0]).toBe('g/4');
  });

  it('an open shape caption omits "root position" — it is a voicing', () => {
    expect(resolveReadingCard('chord:r10:root:bass')!.caption)
      .toBe('C root–tenth');
  });

  it('every catalog item produces a non-empty caption', () => {
    for (const ref of enumerateAllReadingItems()) {
      const card = resolveReadingCard(ref);
      expect(card, ref).not.toBeNull();
      expect(card!.caption.length, ref).toBeGreaterThan(0);
    }
  });
});

// =====================================================================
// Card invariants
// =====================================================================

describe('staff spec invariants', () => {
  it('note cards NEVER carry a key signature', () => {
    // The answer ignores it, so drawing one would imply it matters.
    for (const ref of enumerateAllReadingItems()) {
      if (!ref.startsWith('note:')) continue;
      expect(resolveReadingCard(ref)!.staff.keySignature, ref).toBeNull();
    }
  });

  it('chord cards carry no signature in this step — no key overlay yet', () => {
    for (const ref of enumerateAllReadingItems()) {
      if (!ref.startsWith('chord:')) continue;
      expect(resolveReadingCard(ref)!.staff.keySignature, ref).toBeNull();
    }
  });

  it('signature cards draw a signature and no notes', () => {
    for (const ref of enumerateAllReadingItems()) {
      if (!ref.startsWith('sig:')) continue;
      const card = resolveReadingCard(ref)!;
      expect(card.staff.keys, ref).toEqual([]);
      expect(card.staff.keySignature, ref).not.toBeNull();
    }
  });

  it('a note item ignores a clef override — its clef IS identity', () => {
    const forced = resolveReadingCard('note:bass:0', { clef: 'treble' })!;
    expect(forced.staff.clef).toBe('bass');
    expect(forced.caption).toBe('G2');
  });

  it('a signature item HONOURS a clef override — clef is not identity', () => {
    expect(resolveReadingCard('sig:3f:major:name', { clef: 'bass' })!.staff.clef)
      .toBe('bass');
    expect(resolveReadingCard('sig:3f:major:name')!.staff.clef)
      .toBe('treble');
  });

  it('rejects a malformed ref rather than rendering something', () => {
    expect(resolveReadingCard('note:treble:99')).toBeNull();
    expect(resolveReadingCard('chord:maj:root:treble:Eb')).toBeNull();
    expect(resolveReadingCard('nonsense')).toBeNull();
  });
});

// =====================================================================
// The fixed 21
// =====================================================================

describe('preview samples', () => {
  it('is exactly 21 cards, numbered 1..21 across three sections', () => {
    expect(ALL_SAMPLES).toHaveLength(21);
    expect(ALL_SAMPLES.map(s => s.n)).toEqual(
      Array.from({ length: 21 }, (_, i) => i + 1),
    );
    expect(PREVIEW_SECTIONS.map(s => s.samples.length)).toEqual([7, 7, 7]);
  });

  it('every sample resolves — no blank card on the page', () => {
    for (const s of ALL_SAMPLES) {
      expect(resolveReadingCard(s.itemRef, s.options), `#${s.n} ${s.itemRef}`)
        .not.toBeNull();
    }
  });

  it('every sample itemRef is a real catalog item', () => {
    const catalog = new Set(enumerateAllReadingItems());
    for (const s of ALL_SAMPLES) {
      expect(catalog.has(s.itemRef), `#${s.n} ${s.itemRef}`).toBe(true);
    }
  });

  it('the samples produce the captions the design specified', () => {
    const captions = Object.fromEntries(
      ALL_SAMPLES.map(s => [s.n, resolveReadingCard(s.itemRef, s.options)!.caption]),
    );
    expect(captions[1]).toBe('C major, no accidentals');
    expect(captions[4]).toBe('F# major, 6 sharps');
    expect(captions[5]).toBe('Gb major, 6 flats');
    expect(captions[6]).toBe('B minor, 2 sharps');
    expect(captions[7]).toBe('Eb major, 3 flats');
    expect(captions[8]).toBe('C6');
    expect(captions[9]).toBe('C2');
    expect(captions[10]).toBe('C4');
    expect(captions[15]).toBe('C major, root position');
    expect(captions[16]).toBe('C major, first inversion');
    expect(captions[18]).toBe('G dominant 7th, third inversion');
    expect(captions[21]).toBe('C diminished, root position');
  });

  it('the extremes really are extreme — the page tests what it claims', () => {
    // Ledger lines two out either side...
    expect(ledgerInfoForNoteItem('note:treble:12')!.count).toBe(2);
    expect(ledgerInfoForNoteItem('note:bass:-4')!.count).toBe(2);
    // ...six accidentals in a signature...
    expect(resolveReadingCard('sig:6s:major:name')!.caption).toContain('6 sharps');
    // ...and at least one notehead accidental somewhere on the page.
    const anyAccidental = ALL_SAMPLES.some(s =>
      resolveReadingCard(s.itemRef, s.options)!.staff.keys
        .some(k => k.split('/')[0].length > 1),
    );
    expect(anyAccidental).toBe(true);
  });
});
