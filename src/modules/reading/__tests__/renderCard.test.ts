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
    expect(scientificPitch(spellInterval(C4, 3, 4)!)).toBe('F\u266d4');
  });

  it('produces a double flat for a diminished seventh', () => {
    // C dim7's seventh is Bbb, not A. This is the case that made
    // stack-position derivation necessary.
    expect(scientificPitch(spellInterval(C4, 6, 9)!)).toBe('B\u266d\u266d4');
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
// Notation shapes — the silhouette, not the chord
// =====================================================================

describe('notation shapes', () => {
  it('every shape resolves on both clefs and every legal quality', () => {
    // A shape card is meant to be drawn many different ways. If any
    // combination fails to spell, the drill silently narrows to the
    // ones that happen to work.
    for (const ref of enumerateAllReadingItems()) {
      if (!ref.startsWith('shape:')) continue;
      const family = ref.split(':')[1];
      const qualities = CHORD_QUALITIES.filter(q => q.family === family);
      expect(qualities.length, ref).toBeGreaterThan(0);
      for (const clef of ['treble', 'bass'] as const) {
        for (const q of qualities) {
          const card = resolveReadingCard(ref, { clef, shapeQuality: q.id });
          expect(card, `${ref} / ${clef} / ${q.id}`).not.toBeNull();
          expect(card!.staff.clef).toBe(clef);
          expect(card!.staff.keys, `${ref} / ${q.id}`)
            .toHaveLength(q.intervals.length);
        }
      }
    }
  });

  it('a shape card HONOURS the clef option — clef is not identity', () => {
    // The opposite of a note or chord card, and the reason there are
    // 7 shape items rather than 14.
    expect(resolveReadingCard('shape:triad:inv1', { clef: 'bass' })!.staff.clef)
      .toBe('bass');
    expect(resolveReadingCard('shape:triad:inv1')!.staff.clef).toBe('treble');
  });

  it('the clef and quality options change no caption and no itemRef', () => {
    // Render-time variation never touches identity — the same rule the
    // frame option lives under.
    const plain = resolveReadingCard('shape:triad:inv2')!;
    const varied = resolveReadingCard('shape:triad:inv2', {
      clef: 'bass', shapeQuality: 'dim', root: { letter: 'F', octave: 2 },
    })!;
    expect(varied.caption).toBe(plain.caption);
    expect(varied.itemRef).toBe(plain.itemRef);
    // ...but the ink genuinely differs, which is the point of varying.
    expect(varied.staff.keys).not.toEqual(plain.staff.keys);
  });

  it('major and minor really are the same silhouette', () => {
    // The claim the seven-item count rests on. Same diatonic span and
    // the same line/space pattern; only the accidentals differ.
    for (const position of ['root', 'inv1', 'inv2'] as const) {
      const maj = resolveReadingCard(`shape:triad:${position}`, {
        shapeQuality: 'maj', root: { letter: 'C', octave: 4 },
      })!;
      const min = resolveReadingCard(`shape:triad:${position}`, {
        shapeQuality: 'min', root: { letter: 'C', octave: 4 },
      })!;
      expect(diatonicSpan(min.staff.keys), position)
        .toBe(diatonicSpan(maj.staff.keys));
      const letters = (c: typeof maj) =>
        c.staff.keys.map(k => `${k[0]}${k.split('/')[1]}`);
      expect(letters(min), position).toEqual(letters(maj));
      expect(min.staff.keys).not.toEqual(maj.staff.keys); // accidentals
    }
  });

  it('root position is the only triad shape with no fourth in it', () => {
    // The actual reading rule this skill teaches: the root is the note
    // directly above the fourth, and root position has no fourth at
    // all. Asserted in diatonic steps — a fourth is 3 letter-steps.
    const gaps = (ref: string) => {
      const keys = resolveReadingCard(ref, {
        root: { letter: 'C', octave: 4 },
      })!.staff.keys;
      const idx = keys.map(k => fromDiatonicIndexOf(k));
      return idx.slice(1).map((v, i) => v - idx[i]);
    };
    expect(gaps('shape:triad:root')).toEqual([2, 2]);   // third, third
    expect(gaps('shape:triad:inv1')).toEqual([2, 3]);   // third, FOURTH
    expect(gaps('shape:triad:inv2')).toEqual([3, 2]);   // FOURTH, third
    expect(gaps('shape:seventh:root')).toEqual([2, 2, 2]);
  });

  it('rejects a quality from the wrong family rather than drawing it', () => {
    // A seventh cannot draw a triad silhouette — four noteheads under
    // a three-note answer would teach the wrong shape outright.
    expect(resolveReadingCard('shape:triad:root', { shapeQuality: 'dom7' }))
      .toBeNull();
    expect(resolveReadingCard('shape:seventh:root', { shapeQuality: 'maj' }))
      .toBeNull();
    expect(resolveReadingCard('shape:triad:root', { shapeQuality: 'r10' }))
      .toBeNull();
    expect(resolveReadingCard('shape:triad:root', { shapeQuality: 'nope' }))
      .toBeNull();
  });

  it('a shape caption names the family, so the seven are distinguishable', () => {
    // "root position" alone would label two different items identically.
    expect(resolveReadingCard('shape:triad:root')!.caption)
      .toBe('triad, root position');
    expect(resolveReadingCard('shape:seventh:inv3')!.caption)
      .toBe('seventh, third inversion');
    const captions = enumerateAllReadingItems()
      .filter(r => r.startsWith('shape:'))
      .map(r => resolveReadingCard(r)!.caption);
    expect(new Set(captions).size).toBe(7);
  });

  it('shape cards carry no key signature', () => {
    // Stronger than the chord case: a signature would pull accidentals
    // off the noteheads, and accidentals are the only thing separating
    // the qualities this card is deliberately not asking about.
    for (const ref of enumerateAllReadingItems()) {
      if (!ref.startsWith('shape:')) continue;
      expect(resolveReadingCard(ref)!.staff.keySignature, ref).toBeNull();
      expect(resolveReadingCard(ref, { frame: 'grand' })!.staff.frame, ref)
        .toBe('single');
    }
  });
});

/** Diatonic index of a VexFlow key string, for gap arithmetic. */
function fromDiatonicIndexOf(key: string): number {
  const [name, oct] = key.split('/');
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  return Number(oct) * 7 + LETTERS.indexOf(name[0].toUpperCase());
}

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
      .toBe('G♭ major, 6 flats');
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
      .toBe('A major: F♯ C♯ G♯');
    expect(resolveReadingCard('sig:2f:major:which')!.caption)
      .toBe('B♭ major: B♭ E♭');
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
    expect(captions[4]).toBe('F♯ major, 6 sharps');
    expect(captions[5]).toBe('G♭ major, 6 flats');
    expect(captions[6]).toBe('B minor, 2 sharps');
    expect(captions[7]).toBe('E♭ major, 3 flats');
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

// =====================================================================
// Caption glyphs and the grand-staff frame
// =====================================================================

describe('caption accidental glyphs', () => {
  it('uses \u266f and \u266d, not ASCII # and b', () => {
    for (const ref of enumerateAllReadingItems()) {
      const caption = resolveReadingCard(ref)!.caption;
      // The letter B is legal; a lone lowercase b or a # is not.
      expect(caption, ref).not.toMatch(/#/);
      expect(caption.replace(/\bflats?\b/g, ''), ref).not.toMatch(/[A-G]b/);
    }
  });

  it('does not mangle B-flat into a double glyph', () => {
    // The trap: naive replacement of "b" turns "Bb" into "\u266d\u266d".
    expect(resolveReadingCard('sig:2f:major:name')!.caption)
      .toBe('B\u266d major, 2 flats');
  });

  it('leaves VexFlow key strings as ASCII', () => {
    // VexFlow parses `gb/4`; it would not know what to do with `g\u266d/4`.
    const card = resolveReadingCard('chord:dim:root:treble', {
      root: { letter: 'C', octave: 4 },
    })!;
    expect(card.staff.keys).toEqual(['c/4', 'eb/4', 'gb/4']);
    for (const k of card.staff.keys) expect(k).not.toMatch(/[\u266f\u266d]/);
  });

  it('signature specs handed to VexFlow stay ASCII too', () => {
    expect(resolveReadingCard('sig:6f:major:name')!.staff.keySignature).toBe('Gb');
    expect(resolveReadingCard('sig:6s:major:name')!.staff.keySignature).toBe('F#');
  });
});

describe('grand staff framing', () => {
  it('defaults to single, so nothing that renders today changes', () => {
    for (const ref of enumerateAllReadingItems()) {
      expect(resolveReadingCard(ref)!.staff.frame, ref).toBe('single');
    }
  });

  it('a signature card honours the frame option', () => {
    const card = resolveReadingCard('sig:1s:major:name', { frame: 'grand' })!;
    expect(card.staff.frame).toBe('grand');
    expect(card.staff.keySignature).toBe('G');
  });

  it('note and chord cards IGNORE it — their clef is identity', () => {
    // A second staff would draw a clef the card is not asking about.
    expect(resolveReadingCard('note:treble:4', { frame: 'grand' })!.staff.frame)
      .toBe('single');
    expect(resolveReadingCard('chord:maj:root:bass', { frame: 'grand' })!.staff.frame)
      .toBe('single');
  });

  it('framing changes no caption — it is render-time, not identity', () => {
    for (const ref of enumerateAllReadingItems()) {
      expect(resolveReadingCard(ref, { frame: 'grand' })!.caption)
        .toBe(resolveReadingCard(ref)!.caption);
    }
  });

  it('framing changes no itemRef and no count', () => {
    // The settled rule: render-time variation never touches identity.
    const before = enumerateAllReadingItems();
    expect(before).toHaveLength(188);
    for (const ref of before) {
      expect(resolveReadingCard(ref, { frame: 'grand' })!.itemRef).toBe(ref);
    }
  });
});

// =====================================================================
// The invariant the clef-gap rule depends on
// =====================================================================

describe('keys.length discriminates note cards', () => {
  it('EXACTLY the note cards draw a single notehead', () => {
    // ReadingStaff keys its clef-gap off `spec.keys.length === 1`.
    // That is only safe while no chord quality has fewer than two
    // tones and signature cards draw none — assert both rather than
    // leave the renderer resting on an unstated assumption.
    for (const ref of enumerateAllReadingItems()) {
      const card = resolveReadingCard(ref)!;
      if (card.skill === 'note') {
        expect(card.staff.keys, ref).toHaveLength(1);
      } else {
        expect(card.staff.keys.length, ref).not.toBe(1);
      }
    }
  });

  it('the smallest chord still has two tones', () => {
    // Octave and root-fifth are the floor. If a one-note "chord" is
    // ever added, the clef-gap rule needs revisiting first.
    const smallest = Math.min(...CHORD_QUALITIES.map(q => q.intervals.length));
    expect(smallest).toBe(2);
  });
});
