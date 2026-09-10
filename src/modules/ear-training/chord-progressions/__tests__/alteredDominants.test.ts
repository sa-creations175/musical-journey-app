/**
 * The two altered dominants, voiced and named.
 *
 * =====================================================================
 * ONE DEFINITION OF A CHORD, SHARED.
 *
 * `dom7b9` and `dom7#9#5` are ids in chord recognition's `CHORD_SEEDS`
 * already. A progression naming the same sound under a second id, or
 * spelling its intervals a second time, is how one chord becomes two
 * skills that drift apart — so the ids are the same strings and the
 * intervals are read off that library rather than retyped.
 *
 * Nothing in the progression catalog uses them yet, on purpose: the
 * cards and entries that will come after the prototype. What is
 * asserted here is that every surface which voices or names a chord
 * already knows how, so those can arrive as data.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { CHORD_SEEDS } from '../../chord-recognition/seed';
import { chordDisplay, voicingFor } from '../progressionTheory';
import { PROGRESSIONS } from '../catalog';

const seed = (id: string) => CHORD_SEEDS.find(s => s.id === id)!;

describe('the ids are chord recognition\'s own', () => {
  it('names both chords with a seed that exists', () => {
    expect(seed('dom7b9')).toBeDefined();
    expect(seed('dom7#9#5')).toBeDefined();
  });
});

describe('the ladder', () => {
  it('plays a plain major triad on the triads rung', () => {
    // Silas's ruling of 9 Sep 2026, and it is what the rung already
    // means everywhere else on the page.
    expect(voicingFor('dom7b9', 'triad')).toEqual([0, 4, 7]);
    expect(voicingFor('dom7#9#5', 'triad')).toEqual([0, 4, 7]);
    expect(voicingFor('dom7b9', 'triad')).toEqual(voicingFor('dominant', 'triad'));
  });

  it('plays the dominant seventh on the 7ths rung', () => {
    expect(voicingFor('dom7b9', 'seventh')).toEqual([0, 4, 7, 10]);
    expect(voicingFor('dom7#9#5', 'seventh')).toEqual([0, 4, 7, 10]);
  });

  it('plays the altered tones on the top rung, off the shared library', () => {
    expect(voicingFor('dom7b9', 'jazz')).toEqual(seed('dom7b9').intervals);
    expect(voicingFor('dom7#9#5', 'jazz')).toEqual(seed('dom7#9#5').intervals);
    // And they are actually different sounds, which is the whole point
    // of keeping them apart.
    expect(voicingFor('dom7b9', 'jazz'))
      .not.toEqual(voicingFor('dom7#9#5', 'jazz'));
    expect(voicingFor('dom7b9', 'jazz')).toContain(13);   // the ♭9
    expect(voicingFor('dom7#9#5', 'jazz')).toContain(15); // the ♯9
    expect(voicingFor('dom7#9#5', 'jazz')).toContain(8);  // the ♯5
  });

  it('hands back a copy, so a caller cannot edit the library', () => {
    const first = voicingFor('dom7b9', 'jazz');
    first.push(99);
    expect(voicingFor('dom7b9', 'jazz')).toEqual(seed('dom7b9').intervals);
  });
});

describe('the name follows the sound up the ladder', () => {
  it('never shows an altered name over an unaltered chord', () => {
    // G, on a root of G3.
    expect(chordDisplay(55, 'dom7b9', 'triad')).toBe('G');
    expect(chordDisplay(55, 'dom7b9', 'seventh')).toBe('G7');
    expect(chordDisplay(55, 'dom7b9', 'jazz')).toBe('G7b9');
    expect(chordDisplay(55, 'dom7#9#5', 'jazz')).toBe('G7#9#5');
  });
});

describe('requiresDominant reaches the altered dominants too', () => {
  it('bumps them off the triad rung, as it does a plain dominant', () => {
    // The rule exists so the tritone survives on progressions whose
    // theory needs it. Reading `quality === 'dominant'` would have left
    // exactly the chords that most need a seventh as major triads.
    expect(voicingFor('dom7b9', 'triad', true)).toEqual([0, 4, 7, 10]);
    expect(voicingFor('dom7#9#5', 'triad', true)).toEqual([0, 4, 7, 10]);
    expect(chordDisplay(55, 'dom7b9', 'triad', { requiresDominant: true }))
      .toBe('G7');
    // And it does nothing above the triad rung.
    expect(voicingFor('dom7b9', 'jazz', true)).toEqual(seed('dom7b9').intervals);
  });
});

describe('no progression uses them yet', () => {
  it('is true, and this test is what will say when it stops being', () => {
    // The cards and catalog entries come after the prototype. When one
    // arrives this fails, and the thing to check is that it sounds and
    // reads right at all three rungs rather than that it exists.
    const altered = PROGRESSIONS.filter(
      p => p.chordQualities.some(q => q === 'dom7b9' || q === 'dom7#9#5'),
    );
    expect(altered).toEqual([]);
  });
});
