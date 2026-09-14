/**
 * Pentatonic scales in twelve keys.
 *
 * The fixtures below are the whole point: minor and major lean OPPOSITE
 * ways, so a test that checked one list would pass while the other
 * spelled B-double-flats.
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import { isPentatonicCard } from '../cardKind';
import {
  MAJOR_ROOTS, MINOR_ROOTS, majorPentatonic, minorPentatonic, noteList,
  pentatonicCardId, pentatonicDecoys, relativeMinorRoot, scaleName,
} from '../pentatonics';

const MINOR: ReadonlyArray<[string, string]> = [
  ['C',  'C, E♭, F, G, B♭'],
  ['C#', 'C♯, E, F♯, G♯, B'],
  ['D',  'D, F, G, A, C'],
  ['Eb', 'E♭, G♭, A♭, B♭, D♭'],
  ['E',  'E, G, A, B, D'],
  ['F',  'F, A♭, B♭, C, E♭'],
  ['F#', 'F♯, A, B, C♯, E'],
  ['G',  'G, B♭, C, D, F'],
  ['G#', 'G♯, B, C♯, D♯, F♯'],
  ['A',  'A, C, D, E, G'],
  ['Bb', 'B♭, D♭, E♭, F, A♭'],
  ['B',  'B, D, E, F♯, A'],
];

const MAJOR: ReadonlyArray<[string, string]> = [
  ['C',  'C, D, E, G, A'],
  ['Db', 'D♭, E♭, F, A♭, B♭'],
  ['D',  'D, E, F♯, A, B'],
  ['Eb', 'E♭, F, G, B♭, C'],
  ['E',  'E, F♯, G♯, B, C♯'],
  ['F',  'F, G, A, C, D'],
  ['Gb', 'G♭, A♭, B♭, D♭, E♭'],
  ['G',  'G, A, B, D, E'],
  ['Ab', 'A♭, B♭, C, E♭, F'],
  ['A',  'A, B, C♯, E, F♯'],
  ['Bb', 'B♭, C, D, F, G'],
  ['B',  'B, C♯, D♯, F♯, G♯'],
];

describe('the twelve minor pentatonics', () => {
  for (const [root, expected] of MINOR) {
    it(`${root} → ${expected}`, () => {
      expect(noteList(minorPentatonic(root)!)).toBe(expected);
    });
  }
});

describe('the twelve major pentatonics', () => {
  for (const [root, expected] of MAJOR) {
    it(`${root} → ${expected}`, () => {
      expect(noteList(majorPentatonic(root)!)).toBe(expected);
    });
  }
});

describe('no scale spells badly', () => {
  const bad = /𝄫|𝄪|##|bb|C♭|F♭|B♯|E♯/;

  it('produces no double or theoretical accidental in any minor scale', () => {
    for (const root of MINOR_ROOTS) {
      expect(noteList(minorPentatonic(root)!)).not.toMatch(bad);
    }
  });

  it('produces none in any major scale either', () => {
    for (const root of MAJOR_ROOTS) {
      expect(noteList(majorPentatonic(root)!)).not.toMatch(bad);
    }
  });

  it('is why the two lists differ on three pitch classes', () => {
    // Minor takes the sharp spelling, major the flat. Swapping either
    // is what produces G♭ minor's B-double-flat and C♯ major's E♯.
    expect(MINOR_ROOTS).toContain('G#');
    expect(MINOR_ROOTS).not.toContain('Ab');
    expect(MAJOR_ROOTS).toContain('Ab');
    expect(MAJOR_ROOTS).not.toContain('G#');
  });

  it('shows what the rejected spellings would have produced', () => {
    // Kept as a statement of the reason rather than a comment, so the
    // next person to "simplify the two lists into one" sees it fail.
    expect(noteList(minorPentatonic('Gb')!)).toContain('B𝄫');
    expect(noteList(minorPentatonic('Ab')!)).toContain('C♭');
    expect(noteList(majorPentatonic('C#')!)).toContain('E♯');
  });
});

describe('the scale-name alias', () => {
  it('names the three keys the user reaches for by their other label', () => {
    expect(scaleName('G#', 'minor')).toBe('G♯ (A♭)');
    expect(scaleName('C#', 'minor')).toBe('C♯ (D♭)');
    expect(scaleName('F#', 'minor')).toBe('G♭'.replace('G♭', 'F♯ (G♭)'));
  });

  it('leaves everything else plain', () => {
    expect(scaleName('C', 'minor')).toBe('C');
    expect(scaleName('Eb', 'minor')).toBe('E♭');
  });

  it('never aliases a major scale — its twelve are already the usual names', () => {
    for (const root of MAJOR_ROOTS) {
      expect(scaleName(root, 'major')).not.toContain('(');
    }
  });

  it('does NOT leak the alias into the note list', () => {
    // The alias is about the SCALE'S NAME. Spelling a note flat to
    // match it would reintroduce the C♭ the sharp list exists to avoid.
    expect(noteList(minorPentatonic('G#')!)).not.toContain('(');
    expect(noteList(minorPentatonic('G#')!)).not.toContain('C♭');
  });
});

describe('decoys are derived, and are never the answer', () => {
  it('gives three per key, in all twenty-four scales', () => {
    for (const root of MINOR_ROOTS) expect(pentatonicDecoys(root, 'minor')).toHaveLength(3);
    for (const root of MAJOR_ROOTS) expect(pentatonicDecoys(root, 'major')).toHaveLength(3);
  });

  it('never offers the correct answer as a decoy', () => {
    for (const root of MINOR_ROOTS) {
      expect(pentatonicDecoys(root, 'minor')).not.toContain(noteList(minorPentatonic(root)!));
    }
    for (const root of MAJOR_ROOTS) {
      expect(pentatonicDecoys(root, 'major')).not.toContain(noteList(majorPentatonic(root)!));
    }
  });

  it('reproduces the three hand-chosen C decoys from formulas', () => {
    // The families were read off the original hand-written card. If a
    // formula drifts, this says so against the wording that shipped.
    expect(pentatonicDecoys('C', 'minor')).toEqual([
      'C, D, E♭, F, G',      // near-scale — contains the 2 the pentatonic drops
      'C, E♭, F, A♭, B♭',    // swapped — 5 becomes ♭6
      'C, D, F, G, B♭',      // no-third
    ]);
  });
});

describe('the relative pairs', () => {
  it('names the same scale as the minor list does', () => {
    // E major's relative is C♯ minor, and C♯ is the minor list's own
    // choice — so the two shapes cannot name one scale two ways.
    expect(relativeMinorRoot('E')).toBe('C#');
    expect(relativeMinorRoot('B')).toBe('G#');
    expect(relativeMinorRoot('Ab')).toBe('F');
    expect(relativeMinorRoot('C')).toBe('A');
  });

  it('resolves every major root to a root the minor list holds', () => {
    for (const root of MAJOR_ROOTS) {
      expect(MINOR_ROOTS).toContain(relativeMinorRoot(root)!);
    }
  });
});

describe('the drilled ids survive', () => {
  it('kept C minor at pent-8 and the C relative pair at pent-10', () => {
    // The legacy-id map, which is what the RETIRED generator still
    // mints. Commit 8 moved the family to `pent-notes-`; this is the
    // record the fold-in compares against.
    expect(pentatonicCardId('minor', 'C')).toBe('pent-8');
    expect(pentatonicCardId('relative', 'C')).toBe('pent-10');
  });

  it('gives every other card a root-suffixed id that cannot collide', () => {
    expect(pentatonicCardId('minor', 'Eb')).toBe('pent-minor-Eb');
    expect(pentatonicCardId('major', 'Ab')).toBe('pent-major-Ab');
    // Root-suffixed, not positional: reordering the root list cannot
    // repoint an id at a different card.
    expect(pentatonicCardId('major', 'Ab')).not.toMatch(/\d$/);
  });
});

describe('the category as it now ships', () => {
  // Filed under Scales & Modes since 14 Sep 2026; still every pentatonic card.
  const cards = () => FLASHCARDS.filter(isPentatonicCard);

  it('is the notes in every key, plus the lick scale', () => {
    // Twelve minor, thirteen major, thirteen lick. It was 41 — five
    // formula cards and thirty-six keyed ones.
    expect(cards()).toHaveLength(38);
  });

  it('has no formula cards left', () => {
    // Commit 8's ruling, in Silas's words: pick the notes, per key, no
    // formulas. "What 5 notes make up the major pentatonic scale?" is a
    // shape a reader can recite without playing it in a single key.
    const ids = new Set(cards().map(c => c.id));
    for (const id of ['pent-1', 'pent-2', 'pent-5', 'pent-6', 'pent-9']) {
      expect(ids.has(id), id).toBe(false);
    }
  });

  it('asks which minor pentatonic to play, not what two scales share', () => {
    const lick = cards().find(c => c.id === 'pent-lick-Ab')!;
    expect(lick.question)
      .toBe("You're in the key of A♭ major. Which minor pentatonic fits for riffs and licks?");
    expect(lick.correctAnswer).toBe('F minor pentatonic');
  });

  it('can finally ask about A♭ — the key that had no door', () => {
    const ab = cards().find(c => c.id === 'pent-notes-major-Ab');
    expect(ab?.question).toBe('In A♭ major pentatonic, the notes are _____');
    expect(ab?.correctAnswer).toBe('A♭, B♭, C, E♭, F');
  });

  it('shares the context sentence across all twelve of a shape', () => {
    // The formula half varies; the sound half does not. Regenerating
    // "Stevie Wonder" per key would make twelve copies of one claim.
    const majors = cards().filter(c => c.id.startsWith('pent-notes-major-'));
    expect(majors).toHaveLength(13);
    for (const c of majors) {
      expect(c.explanation).toContain('Stevie Wonder vocal-line vocabulary');
    }
  });
});
