/**
 * Every facet name means exactly one thing.
 *
 * =====================================================================
 * THIS IS THE FAILURE THAT WOULD BE HARDEST TO NOTICE.
 *
 * A facet with two meanings does not throw, does not fail a render and
 * does not look wrong on screen. It shows up as a filter quietly
 * returning cards that have nothing to do with each other — and by then
 * the reader has practised them.
 *
 * `axis.degree` was exactly that for as long as it existed: a starting
 * degree on one category and the degree relating a key and a note on
 * three others. Nobody could see it, because nothing ever listed the
 * two vocabularies side by side. `axis.shape` was the same fault four
 * times over — a cadence, a pentatonic flavour, a progression and a
 * slash chord's two degrees, all under one word.
 *
 * So the vocabularies are declared and this asserts the deck never
 * produces a value outside them.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS, CATEGORY_ORDER } from '../catalog';
import {
  FACET_VALUES, OPEN_VOCABULARY, facetsFor, withFacets,
  type CardFacets, type FacetName,
} from '../facets';

/** Every value the deck actually produces, per facet. */
function observed(): Map<FacetName, Set<string>> {
  const out = new Map<FacetName, Set<string>>();
  for (const card of FLASHCARDS) {
    const facets = card.facets;
    if (facets === undefined) continue;
    for (const [name, value] of Object.entries(facets)) {
      const key = name as FacetName;
      if (!out.has(key)) out.set(key, new Set());
      out.get(key)!.add(String(value));
    }
  }
  return out;
}

describe('one facet, one meaning', () => {
  it('never produces a value outside the facet’s declared vocabulary', () => {
    for (const [name, values] of observed()) {
      if (OPEN_VOCABULARY.has(name)) continue;
      const allowed = new Set(FACET_VALUES[name].map(String));
      for (const value of values) {
        expect(allowed.has(value), `${name} = ${value}`).toBe(true);
      }
    }
  });

  it('declares a vocabulary for every facet the deck uses', () => {
    // A facet appearing on a card with nothing declared for it is a
    // meaning nobody has written down, which is where the drift starts.
    for (const name of observed().keys()) {
      const declared = FACET_VALUES[name];
      expect(declared, name).toBeDefined();
      if (!OPEN_VOCABULARY.has(name)) {
        expect(declared.length, `${name} has an empty vocabulary`)
          .toBeGreaterThan(0);
      }
    }
  });

  it('leaves a vocabulary empty only where it said it would', () => {
    // "No vocabulary" has to be a statement somebody made, not a list
    // somebody forgot to fill in.
    for (const [name, values] of Object.entries(FACET_VALUES)) {
      if (values.length === 0) {
        expect(OPEN_VOCABULARY.has(name as FacetName), name).toBe(true);
      }
    }
  });
});

describe('the two collisions this ends', () => {
  it('keeps a starting degree apart from a degree in a key', () => {
    // `axis.degree` meant both. A filter reading it would have gathered
    // Scale Degree Math's "start on the 5" with Named Notes' "the 5 of
    // E♭", which are not the same question about the same thing.
    const math = FLASHCARDS.filter(c => c.category === 'scale-degree-math');
    for (const card of math) {
      expect(card.facets?.degree, card.id).toBeUndefined();
      expect(card.facets?.fromDegree, card.id).toBeTypeOf('number');
    }
    for (const cat of ['degree-notes', 'modes'] as const) {
      for (const card of FLASHCARDS.filter(c => c.category === cat)) {
        if (card.facets === undefined) continue;
        expect(card.facets.fromDegree, card.id).toBeUndefined();
        expect(card.facets.degree, card.id).toBeTypeOf('string');
      }
    }
  });

  it('gives the three questions about one relationship the same words', () => {
    // Degrees And Notes asks for the note, the degree, the key under a
    // finger and the key itself; Mode Identification asks for the mode
    // that degree produces. One key facet, one degree facet, and the
    // relationship means the same thing on every one of them — which is
    // the collision this model ended.
    //
    // The family adds `semitones` — the distance is a third thing it
    // knows and Mode Identification does not, and it is what lets the
    // ♯4 and the ♭5 be gathered with the interval cards.
    const mode = FLASHCARDS.find(c => c.category === 'modes' && c.facets)!;
    expect(Object.keys(mode.facets!).sort()).toEqual(['degree', 'key']);
    const dgn = FLASHCARDS.find(c => c.category === 'degree-notes' && c.facets)!;
    expect(Object.keys(dgn.facets!).sort())
      .toEqual(['degree', 'key', 'semitones']);
  });

  it('gives the four things that shared `shape` four different names', () => {
    const facetOf = (cat: string) => {
      const card = FLASHCARDS.find(c => c.category === cat && c.facets)!;
      return Object.keys(card.facets!).filter(k => k !== 'key' && k !== 'note');
    };
    // ONE FACET, NOT TWO (ruling 26). Functional Harmony's three and
    // Progression Vocabulary's one are the same claim — a little
    // progression — and they share a name so they can share a row.
    expect(facetOf('functional-harmony')).toEqual(['progression']);
    expect(facetOf('pentatonic-scales')).toEqual(['pentatonic']);
    expect(facetOf('progressions')).toEqual(['progression']);
    expect(facetOf('slash-chords')).toEqual(['slashDegrees']);
  });

  it('calls the note a card is anchored on by one name', () => {
    // `note`, `from`, `root` and `spelling` were four names for the
    // same claim.
    for (const cat of ['intervals', 'pentatonic-scales'] as const) {
      const card = FLASHCARDS.find(c => c.category === cat && c.facets)!;
      expect(card.facets!.note, cat).toBeTypeOf('string');
    }
  });
});

describe('what a card is allowed to say', () => {
  it('says nothing where it has nothing to say', () => {
    // Prose cards carry no coordinates and none are invented for them —
    // a facet on a card about how a chord FEELS would make a filter
    // claim it had found something.
    for (const cat of ['diatonic-qualities', 'chord-construction', 'ear-theory'] as const) {
      for (const card of FLASHCARDS.filter(c => c.category === cat)) {
        expect(card.facets, card.id).toBeUndefined();
      }
    }
  });

  it('never carries an empty facet object', () => {
    // "No facets" and "an empty object" are different answers, and a
    // caller has to be able to tell them apart.
    for (const card of FLASHCARDS) {
      if (card.facets !== undefined) {
        expect(Object.keys(card.facets).length, card.id).toBeGreaterThan(0);
      }
    }
  });

  it('writes the tritone’s distance down, on both families that know it', () => {
    // A tritone card is six semitones because a tritone is — not
    // because the category wrote the number. This is what lets the two
    // families that ask the same thing be gathered at all.
    const six = FLASHCARDS.filter(c => c.facets?.semitones === 6);
    const cats = new Set(six.map(c => c.category));
    expect(cats.has('degree-notes')).toBe(true);
    expect(cats.has('intervals')).toBe(true);
    // Tritone Pairs was the third and is folded in — its twelve
    // questions are the ♯4 and ♭5 cards now, which is the whole point
    // of gathering by the distance rather than by the category.
    //
    // COUNTED AGAINST THE TRITONE CARDS IN EACH FAMILY, not against
    // the interval category's size: ruling 43 grew that category to
    // 165, of which thirteen are tritones, so comparing with the whole
    // category stopped measuring anything.
    const inIntervals = six.filter(c => c.category === 'intervals').length;
    expect(inIntervals).toBe(13);
    expect(six.length).toBeGreaterThan(inIntervals * 2);
  });
});

describe('nothing moved', () => {
  it('leaves `axis` exactly as it was', () => {
    // The Progress Detail grid reads axis field names BY NAME. A facet
    // model that renamed them would empty every grid in the module.
    const math = FLASHCARDS.find(c => c.category === 'scale-degree-math')!;
    expect(math.axis).toMatchObject({ degree: expect.anything(), movement: expect.anything() });
    const named = FLASHCARDS.find(c => c.category === 'degree-notes')!;
    expect(named.axis).toMatchObject({ key: expect.anything(), degree: expect.anything() });
  });

  it('changes no card id, no question and no answer', () => {
    // `withFacets` copies a card and adds one field. If it ever did
    // more, this is where it would show.
    const plain = FLASHCARDS.map(c => {
      const { facets, ...rest } = c;
      void facets;
      return rest;
    });
    const rebuilt = withFacets(plain).map(c => {
      const { facets, ...rest } = c;
      void facets;
      return rest;
    });
    expect(rebuilt).toEqual(plain);
  });

  it('is a pure reading of the card, not of its text', () => {
    // Facets come off the generator's own coordinates. A card with no
    // coordinates gets nothing, however much its prompt says.
    const prose = FLASHCARDS.find(c => c.category === 'ear-theory')!;
    expect(facetsFor(prose)).toBeUndefined();
  });
});

describe('coverage, so a regression is visible', () => {
  it('reaches every category that carries coordinates today', () => {
    const withCoords = new Set(
      FLASHCARDS.filter(c => c.axis !== undefined).map(c => c.category),
    );
    const withFacetsSet = new Set(
      FLASHCARDS.filter(c => c.facets !== undefined).map(c => c.category),
    );
    for (const cat of withCoords) {
      expect(withFacetsSet.has(cat), `${cat} has coordinates but no facets`).toBe(true);
    }
  });

  it('covers every category in the deck or says why not', () => {
    const missing = CATEGORY_ORDER.filter(cat =>
      !FLASHCARDS.some(c => c.category === cat && c.facets !== undefined));
    // The three that carry no coordinates at all. Named here so adding
    // a fourth is a decision rather than a drift.
    expect(missing.sort()).toEqual(
      ['chord-construction', 'diatonic-qualities', 'ear-theory'],
    );
  });
});

/** Kept so the type is exercised rather than only declared. */
const _shape: CardFacets = { key: 'C', degree: 'b6' };
void _shape;
