/**
 * A dashboard row tap opens Harmonic Fluency already narrowed.
 *
 * =====================================================================
 * IT WAS THE ONE MODULE THAT COULD NOT BE TOLD ANYTHING.
 *
 * The dashboard can hand five modules a filtered pool — tap a weak
 * interval and Ear Training's quiz opens restricted to it. Harmonic
 * Fluency had no entry in that map at all, so a tapped row opened the
 * module home and the reader drilled whatever came up.
 *
 * A harmonic-fluency itemRef IS a card id, so there is nothing to
 * translate — which is what made this the smallest of the five to add
 * and is why it is asserted rather than assumed.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import { buildSession } from '../sessionQueue';
import { drillHref, drillTargetFor } from '../../dashboard/read/drillTarget';
import { buildModuleTree } from '../../dashboard/read/tree';
import { statsForAttemptCatalog } from '../../dashboard/read/adapters';
import { harmonicFluencyCatalog } from '../../dashboard/read/catalogs';
import { parseFilterKeys } from '../../../lib/drillFilter';

/** The module's dashboard tree, as the screen builds it. */
function tree() {
  return buildModuleTree(
    harmonicFluencyCatalog,
    statsForAttemptCatalog(harmonicFluencyCatalog, []),
  );
}

describe('a tapped category row', () => {
  it('resolves to a filtered target rather than opening the module', () => {
    const category = tree().children[0];
    expect(category, 'the tree has a category row').toBeDefined();
    const target = drillTargetFor(category, 'harmonic-fluency');
    expect(target.kind).toBe('filtered');
  });

  it('carries that row’s cards, untranslated', () => {
    // A harmonic-fluency itemRef is a card id. Any translation here
    // would be a second identity for a card.
    const category = tree().children[0];
    const target = drillTargetFor(category, 'harmonic-fluency');
    if (target.kind !== 'filtered') throw new Error('not filtered');
    expect(target.focusKeys.sort()).toEqual([...category.itemRefs].sort());
    for (const key of target.focusKeys) {
      expect(FLASHCARDS.some(c => c.id === key), key).toBe(true);
    }
  });

  it('still opens the module for the module row itself', () => {
    // Tapping the module means "open the module", not "drill every card
    // in one sitting". Unchanged.
    const target = drillTargetFor(tree(), 'harmonic-fluency');
    expect(target.kind).toBe('navigate');
  });

  it('builds a URL the drill can read back', () => {
    const category = tree().children[0];
    const target = drillTargetFor(category, 'harmonic-fluency');
    if (target.kind !== 'filtered') throw new Error('not filtered');
    const href = drillHref(target);
    const query = new URLSearchParams(href.split('?')[1]);
    expect(parseFilterKeys(query.get('focus')).sort())
      .toEqual([...target.focusKeys].sort());
  });
});

describe('what the drill does with it', () => {
  it('serves only the cards it was named', async () => {
    const wanted = FLASHCARDS.slice(0, 5).map(c => c.id);
    const session = await buildSession({
      categories: [], target: 500, cardIds: wanted,
    });
    expect(session.cards.map(c => c.id).sort()).toEqual([...wanted].sort());
  });

  it('serves the whole pool when it is named nothing', async () => {
    // Empty means no narrowing — the same reading `categories` gets, so
    // the module home can pass it unconditionally.
    const named = await buildSession({
      categories: ['ear-theory'], target: 500, cardIds: [],
    });
    const plain = await buildSession({ categories: ['ear-theory'], target: 500 });
    expect(named.cards.length).toBe(plain.cards.length);
    expect(named.cards.length)
      .toBe(FLASHCARDS.filter(c => c.category === 'ear-theory').length);
  });

  it('narrows within the categories, never outside them', async () => {
    // A pool and a category selection are two narrowings, not two
    // answers to the same question.
    const outside = FLASHCARDS.find(c => c.category === 'degree-notes')!.id;
    const session = await buildSession({
      categories: ['ear-theory'], target: 500, cardIds: [outside],
    });
    expect(session.cards).toHaveLength(0);
  });

  it('narrows alongside a facet filter, not instead of it', async () => {
    const tritones = FLASHCARDS
      .filter(c => c.facets?.semitones === 6).map(c => c.id);
    const session = await buildSession({
      categories: [], target: 500, cardIds: tritones, facets: { semitones: ['6'] },
    });
    expect(session.cards.length).toBe(tritones.length);
  });
});
