/**
 * When the drill settings have nothing to ask.
 *
 * =====================================================================
 * THE QUESTION IS NOT "IS THIS A SONG".
 *
 * A song draws no settings because all three things they collect are
 * already declared absent — no style, no target length, and a rate
 * picker with one option, which is not a choice. That is a property of
 * the surface, not its name.
 *
 * The distinction is load-bearing. `id === 'song'` would need editing
 * twice: once when a surface arrives that has nothing to set either,
 * and once if a song ever grows something to configure. Asking the
 * three fields handles both without anyone remembering.
 *
 * And the panel has ONE test model for every surface. A song-shaped
 * branch in it would re-exception that a line below where it was
 * un-exceptioned.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { setupHasSomethingToSet, type DrillSurface } from '../surfaces';

/** Only the three fields the predicate reads. The rest of the surface
 *  is irrelevant to it, and a full fixture would suggest otherwise. */
function surface(over: Partial<DrillSurface>): DrillSurface {
  return {
    hasStyle: true,
    countsUp: false,
    rateOptions: [{ per: 1, label: 'a' }, { per: 2, label: 'b' }],
    ...over,
  } as DrillSurface;
}

describe('a surface with something to set', () => {
  it('style alone is enough', () => {
    expect(setupHasSomethingToSet(surface({
      hasStyle: true, countsUp: true, rateOptions: [{ per: 1, label: 'a' }],
    }))).toBe(true);
  });

  it('a target length alone is enough', () => {
    expect(setupHasSomethingToSet(surface({
      hasStyle: false, countsUp: false, rateOptions: [{ per: 1, label: 'a' }],
    }))).toBe(true);
  });

  it('a real rate CHOICE alone is enough', () => {
    expect(setupHasSomethingToSet(surface({
      hasStyle: false, countsUp: true,
      rateOptions: [{ per: 1, label: 'a' }, { per: 2, label: 'b' }],
    }))).toBe(true);
  });

  it('the three shapes surfaces all have something', () => {
    // Guard the guard: a predicate that answered "nothing to set"
    // everywhere would silently delete the settings from the app.
    expect(setupHasSomethingToSet(surface({}))).toBe(true);
  });
});

describe('a surface with nothing to set', () => {
  it('answers no to all three', () => {
    expect(setupHasSomethingToSet(surface({
      hasStyle: false, countsUp: true, rateOptions: [{ per: 1, label: 'At The Written Tempo' }],
    }))).toBe(false);
  });

  it('A ONE-OPTION PICKER IS NOT A CHOICE', () => {
    // The subtle one. Two of the three absences are booleans and read
    // as absences; this one looks like a present field and is not.
    const oneOption = surface({
      hasStyle: false, countsUp: true, rateOptions: [{ per: 1, label: 'only' }],
    });
    const twoOptions = surface({
      hasStyle: false, countsUp: true,
      rateOptions: [{ per: 1, label: 'only' }, { per: 2, label: 'other' }],
    });
    expect(setupHasSomethingToSet(oneOption)).toBe(false);
    expect(setupHasSomethingToSet(twoOptions)).toBe(true);
  });

  it('and an empty picker is not one either', () => {
    expect(setupHasSomethingToSet(surface({
      hasStyle: false, countsUp: true, rateOptions: [],
    }))).toBe(false);
  });
});
