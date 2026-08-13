// @vitest-environment jsdom
/**
 * Card selection.
 *
 * The load-bearing property: EVERY PICKED CARD RESOLVES. Not every
 * (quality, root) pair is spellable — a diminished seventh on D-flat
 * needs a triple flat and `resolveReadingCard` correctly refuses it —
 * so selection has to try and check rather than assume. An
 * unresolvable pick reaches the user as a blank staff under a
 * confident prompt, which is the worst failure this module has.
 */
import { describe, expect, it } from 'vitest';
import { itemsForSkill, optionsForItem, pickCard, type Rng } from '../pickCard';
import { resolveReadingCard } from '../renderCard';
import {
  CHORD_ROOTS,
  rootId,
  rootOptions,
} from '../answerModels';
import {
  enumerateChordItems,
  enumerateNoteItems,
  enumerateShapeItems,
  enumerateSignatureItems,
  parseReadingItemRef,
} from '../catalog';
import type { Letter } from '../pitch';

/** Deterministic rng over a fixed cycle, so a failure is reproducible
 *  rather than "it went red once on CI". */
function cyclingRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('the root-retry is a GUARD, not a live fix', () => {
  // Worth being exact about, because the retry reads like it is
  // rescuing real failures and it is not. Two facts, pinned together:

  it('no root in the CURRENT twelve fails to spell', () => {
    // So the retry never actually fires today. It is not dead code —
    // see the next test — but it is inert, and a future reader should
    // not think deleting it would break something now.
    for (const ref of enumerateChordItems()) {
      for (const r of CHORD_ROOTS) {
        const card = resolveReadingCard(ref, {
          root: { letter: r.letter as Letter, accidental: r.accidental, octave: 4 },
        });
        expect(card, `${ref} @ ${rootId(r.letter, r.accidental)}`).not.toBeNull();
      }
    }
  });

  it('but roots OUTSIDE the twelve genuinely overflow', () => {
    // The named cases: an augmented triad on B-sharp needs a triple
    // sharp, and a diminished seventh on C-flat or F-flat needs a
    // triple flat. `spellInterval` refuses past a double, correctly.
    //
    // CHORD_ROOTS is exactly the kind of list that grows — the key
    // overlay will want sharp spellings — and the failure mode is a
    // blank staff under a confident prompt. That is what the retry is
    // for, and this test is why it stays.
    expect(resolveReadingCard('chord:aug:root:treble', {
      root: { letter: 'B', accidental: '#', octave: 4 },
    })).toBeNull();
    expect(resolveReadingCard('chord:dim7:root:treble', {
      root: { letter: 'C', accidental: 'b', octave: 4 },
    })).toBeNull();
    expect(resolveReadingCard('chord:dim7:root:treble', {
      root: { letter: 'F', accidental: 'b', octave: 4 },
    })).toBeNull();
  });
});

describe('every picked card resolves', () => {
  const SKILLS = ['note', 'shape', 'sig', 'chord'] as const;

  it('across many draws, for every skill', () => {
    for (const skill of SKILLS) {
      for (let i = 0; i < 300; i++) {
        const picked = pickCard(skill);
        const card = resolveReadingCard(picked.itemRef, picked.options);
        expect(card, `${skill} / ${picked.itemRef}`).not.toBeNull();
      }
    }
  });

  it('for EVERY item in the catalog, not just the ones chance found', () => {
    // Exhaustive rather than sampled: a single unspellable item would
    // otherwise surface as a rare blank card in real use.
    const all = [
      ...enumerateNoteItems(), ...enumerateShapeItems(),
      ...enumerateSignatureItems(), ...enumerateChordItems(),
    ];
    for (const ref of all) {
      for (const seed of [0, 0.17, 0.34, 0.51, 0.68, 0.85, 0.99]) {
        const picked = optionsForItem(ref, cyclingRng([seed]));
        expect(resolveReadingCard(picked.itemRef, picked.options), `${ref} @ ${seed}`)
          .not.toBeNull();
      }
    }
  });
});

describe('what varies, and what must not', () => {
  it('selection never changes the itemRef it was asked for', () => {
    for (const ref of enumerateChordItems()) {
      expect(optionsForItem(ref, cyclingRng([0.4])).itemRef).toBe(ref);
    }
  });

  it('a chord card reports the root it was actually DRAWN on', () => {
    // The picker's correct answer is read off this. If it were
    // re-derived instead, the button and the notation could disagree.
    for (const ref of enumerateChordItems()) {
      const picked = optionsForItem(ref, cyclingRng([0.62]));
      expect(picked.rootId, ref).not.toBeNull();
      const drawn = picked.options.root!;
      expect(picked.rootId, ref).toBe(rootId(drawn.letter, drawn.accidental ?? null));
    }
  });

  it('the drawn root is always one the picker offers', () => {
    const offered = new Set(rootOptions().map(o => o.id));
    for (const ref of enumerateChordItems()) {
      for (const seed of [0.05, 0.45, 0.95]) {
        const picked = optionsForItem(ref, cyclingRng([seed]));
        expect(offered.has(picked.rootId!), `${ref} → ${picked.rootId}`).toBe(true);
      }
    }
  });

  it('shape cards vary clef AND quality — the whole point of the skill', () => {
    // Fixed, every first-inversion triad is the same picture and the
    // drill teaches that picture rather than the shape.
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const picked = optionsForItem('shape:triad:inv1');
      seen.add(`${picked.options.clef}/${picked.options.shapeQuality}`);
    }
    expect(seen.size).toBeGreaterThan(1);
    // Both clefs really do occur.
    expect([...seen].some(s => s.startsWith('treble'))).toBe(true);
    expect([...seen].some(s => s.startsWith('bass'))).toBe(true);
  });

  it('a shape card never draws a quality from the wrong family', () => {
    for (const ref of enumerateShapeItems()) {
      const family = ref.split(':')[1];
      for (let i = 0; i < 40; i++) {
        const picked = optionsForItem(ref);
        const card = resolveReadingCard(picked.itemRef, picked.options);
        // A cross-family quality resolves to null, which the resolve
        // check above would catch — this pins WHY it cannot happen.
        expect(card, `${ref} / ${picked.options.shapeQuality}`).not.toBeNull();
        expect(card!.staff.keys.length, ref).toBe(family === 'triad' ? 3 : 4);
      }
    }
  });

  it('note cards vary nothing — clef and position are both identity', () => {
    for (const ref of enumerateNoteItems()) {
      const picked = optionsForItem(ref);
      expect(picked.options, ref).toEqual({});
      expect(picked.rootId, ref).toBeNull();
    }
  });

  it('signature cards vary clef, because a signature has none', () => {
    const seen = new Set<string | undefined>();
    for (let i = 0; i < 200; i++) {
      seen.add(optionsForItem('sig:2s:major:name').options.clef);
    }
    expect(seen).toEqual(new Set(['treble', 'bass']));
  });
});

describe('itemsForSkill routes to the right catalog walk', () => {
  it('each skill enumerates only its own items', () => {
    expect(itemsForSkill('note')).toEqual(enumerateNoteItems());
    expect(itemsForSkill('shape')).toEqual(enumerateShapeItems());
    expect(itemsForSkill('sig')).toEqual(enumerateSignatureItems());
    expect(itemsForSkill('chord')).toEqual(enumerateChordItems());
    for (const skill of ['note', 'shape', 'sig', 'chord'] as const) {
      for (const ref of itemsForSkill(skill)) {
        expect(parseReadingItemRef(ref)?.skill, ref).toBe(skill);
      }
    }
  });

  it('an rng pinned to 0 picks the first item, not a crash', () => {
    // The floor/clamp arithmetic is the kind that goes wrong at the
    // boundaries and nowhere else.
    expect(pickCard('shape', () => 0).itemRef).toBe(enumerateShapeItems()[0]);
    const last = enumerateShapeItems()[enumerateShapeItems().length - 1];
    expect(pickCard('shape', () => 0.9999999).itemRef).toBe(last);
  });
});
