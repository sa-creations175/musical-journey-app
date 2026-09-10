/**
 * Marking a built answer, and everything it deliberately ignores.
 *
 * =====================================================================
 * A BUILT ANSWER OFFERS MORE THAN THE CARD ASKS ABOUT.
 *
 * The picker can express an inversion, an octave, a tap order and an
 * extension. None of those is what any of these cards is about, so each
 * one has a test saying it does not fail an answer — because the way
 * this goes wrong is silently: the reader builds the right chord, is
 * marked wrong, and the reveal then shows them the chord they built.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../../catalog';
import { builtTargetFor } from '../cardTargets';
import {
  gradeProgression, gradeRoot, gradeScale, gradeSignature, gradeSlash,
  keySpelling, spellInKey, type BuiltChord,
} from '../grade';

const targetOf = (id: string) => {
  const card = FLASHCARDS.find(c => c.id === id);
  if (card === undefined) throw new Error(`no card ${id}`);
  const t = builtTargetFor(card);
  if (t === null) throw new Error(`no target for ${id}`);
  return t;
};

const prog = (id: string) => {
  const t = targetOf(id);
  if (t.kind !== 'progression') throw new Error('wrong kind');
  return t;
};
const asBuilt = (t: ReturnType<typeof prog>): BuiltChord[] =>
  t.chords.map(c => ({ rootPc: c.rootPc, quality: c.quality }));

describe('a progression is graded on its roots and its families', () => {
  const t = prog('pr-prog-2-5-1-Bb');

  it('marks the chords the card names right', () => {
    expect(gradeProgression(t, asBuilt(t)).correct).toBe(true);
  });

  it('accepts a plainer chord and a richer one alike', () => {
    // The card wants Cm7 - F7 - B♭maj7. Triads are the same
    // progression; ninths are the same progression with more of it.
    const triads = [
      { rootPc: 0, quality: 'm' as const },
      { rootPc: 5, quality: '' as const },
      { rootPc: 10, quality: '' as const },
    ];
    // The 5 accepts a plain major, so F answers F7 — but the 1 is a
    // major chord and its plain triad is right too.
    expect(gradeProgression(t, triads).correct).toBe(true);
    const ninths = [
      { rootPc: 0, quality: 'm9' as const },
      { rootPc: 5, quality: '9' as const },
      { rootPc: 10, quality: 'maj9' as const },
    ];
    expect(gradeProgression(t, ninths).correct).toBe(true);
  });

  it('refuses a dominant where the card wants a major', () => {
    // The other direction is not symmetric: on the 1 of a 2 5 1 a
    // B♭7 is a different chord doing a different job.
    const built = asBuilt(t);
    built[2] = { rootPc: 10, quality: '7' };
    const g = gradeProgression(t, built);
    expect(g.correct).toBe(false);
    expect(g.firstWrong).toBe(2);
  });

  it('refuses a minor where the card wants a dominant', () => {
    const built = asBuilt(t);
    built[1] = { rootPc: 5, quality: 'm7' };
    expect(gradeProgression(t, built).firstWrong).toBe(1);
  });

  it('names the first chord that is wrong, not the last', () => {
    const built = asBuilt(t);
    built[0] = { rootPc: 1, quality: 'm7' };
    built[2] = { rootPc: 1, quality: 'maj7' };
    expect(gradeProgression(t, built).firstWrong).toBe(0);
  });

  it('treats an unfinished chord as wrong, and says which', () => {
    const built = asBuilt(t);
    built[1] = { rootPc: 5, quality: null };
    expect(gradeProgression(t, built).firstWrong).toBe(1);
    expect(gradeProgression(t, [{ rootPc: null, quality: null }]).firstWrong).toBe(0);
  });

  it('writes back what was built, the way the card writes its answer', () => {
    // A MIDDLE DOT, the same separator the card's own answer uses since
    // Silas's ruling of 10 Sep 2026. A build that got every chord right
    // and joined them differently would not match what it is compared
    // against.
    expect(gradeProgression(t, asBuilt(t)).built).toBe('Cm7 · F7 · B♭maj7');
    const built = asBuilt(t);
    built[1] = { rootPc: 5, quality: 'm7' };
    expect(gradeProgression(t, built).built).toBe('Cm7 · Fm7 · B♭maj7');
  });
});

describe('a slash chord is graded on the chord and the note under it', () => {
  const t = targetOf('sc-slash-5-7-C');
  if (t.kind !== 'slash') throw new Error('wrong kind');

  it('marks G over B right, and says so as the card does', () => {
    const g = gradeSlash(t, {
      chord: { rootPc: 7, quality: '' }, bassPc: 11,
    });
    expect(g.correct).toBe(true);
    expect(g.built).toBe('G/B');
  });

  it('ignores the inversion, which the picker can express and the card cannot ask', () => {
    // The hand shape is not in the grade at all: nothing is passed.
    expect(gradeSlash(t, { chord: { rootPc: 7, quality: 'maj7' }, bassPc: 11 }).correct)
      .toBe(true);
  });

  it('points at the chord row when the top half is wrong', () => {
    const g = gradeSlash(t, { chord: { rootPc: 0, quality: '' }, bassPc: 11 });
    expect(g.correct).toBe(false);
    expect(g.firstWrong).toBe(0);
  });

  it('points at the note row when only the bottom is wrong', () => {
    const g = gradeSlash(t, { chord: { rootPc: 7, quality: '' }, bassPc: 7 });
    expect(g.correct).toBe(false);
    expect(g.firstWrong).toBe(1);
    expect(g.built).toBe('G/G');
  });
});

describe('a pentatonic is five pitch classes, in any order', () => {
  const notes = targetOf('pent-notes-major-Eb');
  const lick = targetOf('pent-lick-Ab');
  if (notes.kind !== 'scale' || lick.kind !== 'scale') throw new Error();

  it('ignores the order on the notes card', () => {
    const shuffled = [...notes.pcs].reverse();
    expect(gradeScale(notes, notes.pcs).correct).toBe(true);
    expect(gradeScale(notes, shuffled).correct).toBe(true);
  });

  it('counts five, and refuses four or six', () => {
    expect(gradeScale(notes, notes.pcs.slice(0, 4)).correct).toBe(false);
    expect(gradeScale(notes, [...notes.pcs, 1]).correct).toBe(false);
  });

  it('requires the root first on the lick wording, and only there', () => {
    // The question is which minor pentatonic fits, so the root IS the
    // answer and the first tap is the claim.
    const rootFirst = [lick.rootPc, ...lick.pcs.filter(p => p !== lick.rootPc)];
    const rootLast = [...lick.pcs.filter(p => p !== lick.rootPc), lick.rootPc];
    expect(gradeScale(lick, rootFirst).correct).toBe(true);
    const wrong = gradeScale(lick, rootLast);
    expect(wrong.correct).toBe(false);
    // AND IT IS TOLD APART FROM FIVE WRONG NOTES, because they are
    // different mistakes and the card says so in words.
    expect(wrong.wrongRoot).toBe(true);
    expect(gradeScale(lick, [0, 1, 2, 3, 4]).wrongRoot).toBe(false);
  });
});

describe('a key is graded on its pitch class', () => {
  it('marks the relative minor right, and names what was built', () => {
    const t = targetOf('ks-relminor-Ab');
    if (t.kind !== 'root') throw new Error();
    expect(gradeRoot(t, 5).correct).toBe(true);
    expect(gradeRoot(t, 5).built).toBe('F minor');
    expect(gradeRoot(t, 8).correct).toBe(false);
    expect(gradeRoot(t, null).built).toBe('—');
  });

  it('reads the major twin as a major key', () => {
    const t = targetOf('ks-relmajor-Ab');
    if (t.kind !== 'root') throw new Error();
    expect(gradeRoot(t, 8).built).toBe('A♭ major');
  });
});

describe('a signature is a count and a direction', () => {
  it('needs both', () => {
    const t = targetOf('ks-count-G');
    if (t.kind !== 'signature') throw new Error();
    expect(gradeSignature(t, { count: 1, direction: 'sharps' }).correct).toBe(true);
    expect(gradeSignature(t, { count: 1, direction: 'flats' }).correct).toBe(false);
    expect(gradeSignature(t, { count: 2, direction: 'sharps' }).correct).toBe(false);
    expect(gradeSignature(t, { count: null, direction: null }).built).toBe('—');
  });

  it('tells the two six-accidental keys apart', () => {
    const sharp = targetOf('ks-count-F#');
    const flat = targetOf('ks-count-Gb');
    if (sharp.kind !== 'signature' || flat.kind !== 'signature') throw new Error();
    expect(gradeSignature(sharp, { count: 6, direction: 'flats' }).correct).toBe(false);
    expect(gradeSignature(flat, { count: 6, direction: 'flats' }).correct).toBe(true);
  });

  it('lets zero answer either way, because zero has no direction', () => {
    const t = targetOf('ks-count-C');
    if (t.kind !== 'signature') throw new Error();
    expect(gradeSignature(t, { count: 0, direction: 'sharps' }).correct).toBe(true);
    expect(gradeSignature(t, { count: 0, direction: 'flats' }).correct).toBe(true);
    expect(gradeSignature(t, { count: 0, direction: null }).correct).toBe(true);
  });
});

describe('the key decides how a black note is spelled', () => {
  it('names one key two ways in two keys', () => {
    // The brief's rule: the tile shows both spellings and the card's
    // key resolves it once picked.
    expect(spellInKey(8, 'E♭')).toBe('A♭');
    expect(spellInKey(8, 'B')).toBe('G♯');
    expect(keySpelling('F')).toBe('flat');
    expect(keySpelling('G')).toBe('sharp');
    expect(keySpelling('B♭')).toBe('flat');
  });
});
