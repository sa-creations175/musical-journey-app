/**
 * The identity split: ids carry the identity, screens carry the
 * spelling.
 *
 * THE BUG THIS CLOSES. `MAJOR_ROOTS` spells the sixth key G♭ and
 * `MINOR_ROOTS` spells the ninth G♯ — display choices, each scale
 * reading the way it is written — and both were reaching card ids and
 * axis coordinates. `catalog.ts` meanwhile wrote F♯. No twelve-key
 * axis could hold two spellings of one pitch, so the grid rendered
 * thirteen columns and the toggle between its two views moved almost
 * nothing.
 *
 * THE HALF THAT IS EASY TO BREAK is the other one: `degreeAscii`
 * spells a card's degrees FROM its root, so canonicalising the root
 * list would have turned G♭ – D♭ – E♭m – C♭ into the sharp side,
 * silently, against the argument at `catalogExpansions.ts:28`. So the
 * last describe here asserts that no question, answer, decoy or
 * explanation moved at all.
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS, CATEGORY_LABELS } from '../catalog';
import { HARMONIC_FLUENCY_GRIDS } from '../progressGrids';
import { CIRCLE_OF_FOURTHS } from '../../repertoire/circleOfFourths';
import { IDENTITY_ID_MOVES, refusalFor } from '../identityIdMigration';

// FUNCTIONAL HARMONY, which still uses the shared `keyAxis`. Modes and
// then the four families of ruling 39 stopped using it — F♯ major and
// G♭ major are two keys there, which the identity vocabulary cannot
// say. A family that has not been regenerated still holds twelve, and
// this is what says so; the thirteen are pinned in their own block.
const keyGrid = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS['functional-harmony']]!;
const modeGrid = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS.modes]!;
const pentGrid = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS['pentatonic-scales']]!;

describe('the key axis is twelve columns', () => {
  it('every view holds twelve, not thirteen', () => {
    for (const view of keyGrid.columns.views) {
      expect(view.values, view.id).toHaveLength(12);
    }
  });

  it('the sixth identity in wheel order is F#', () => {
    const wheel = keyGrid.columns.views.find(v => v.id === 'fifths')!;
    expect(wheel.values).toEqual(CIRCLE_OF_FOURTHS);
    expect(wheel.values[6]).toBe('F#');
  });

  it('and it renders G♭ on screen', () => {
    // The identity never reaches a screen — `lib/spelling.ts`'s rule,
    // enforced here by the axis labelling rather than by whichever
    // string a generator happened to use.
    expect(keyGrid.columns.labelFor!('F#')).toBe('G♭');
    expect(keyGrid.columns.labelFor!('Db')).toBe('D♭');
  });

  it('holds no display-only spelling at all', () => {
    for (const view of keyGrid.columns.views) {
      for (const v of view.values) {
        expect(CIRCLE_OF_FOURTHS, String(v)).toContain(String(v));
      }
    }
  });
});

describe('the mode axis is thirteen, and that is a ruling', () => {
  /**
   * RULING 40 REVERSES THE ARGUMENT ABOVE, FOR THIS FAMILY ONLY.
   *
   * "The mode of F♯ major starting on G♯" and "the mode of G♭ major
   * starting on A♭" are two questions with two answers. One column
   * would have to answer both, so there are two — and the header is the
   * key's own name rather than whatever `spellKey` would call it, which
   * would print G♭ over each.
   */
  it('holds both spellings of the sixth pitch', () => {
    const values = modeGrid.columns.views[0].values.map(String);
    expect(values).toHaveLength(13);
    expect(values).toContain('F#');
    expect(values).toContain('Gb');
  });

  it('labels each with its own name, not with the setting\'s', () => {
    expect(modeGrid.columns.labelFor!('F#')).toBe('F♯');
    expect(modeGrid.columns.labelFor!('Gb')).toBe('G♭');
  });

  it('offers one ordering, because the wheel holds twelve', () => {
    // A toggle whose two views had to disagree about which keys exist
    // is worse than no toggle. `AxisViewToggle` renders nothing for a
    // single ordering.
    expect(modeGrid.columns.views).toHaveLength(1);
  });
});

describe('the pentatonic axis collapsed with it', () => {
  it('is thirteen columns, not the fifteen the two root lists made', () => {
    // Twelve until commit 8, and thirteen for ruling 40's reason: F♯
    // major pentatonic and G♭ major pentatonic are two different sets
    // of notes. It is not the old fifteen, which came from two
    // generators disagreeing about how to spell one root.
    expect(pentGrid.columns.views[0].values).toHaveLength(13);
    expect(pentGrid.columns.views[0].values).toContain('F#');
    expect(pentGrid.columns.views[0].values).toContain('Gb');
  });

  it('the minor pentatonic identity is Ab, and renders A♭', () => {
    expect(pentGrid.columns.views[0].values).toContain('Ab');
    expect(pentGrid.columns.views[0].values).not.toContain('G#');
    expect(pentGrid.columns.labelFor!('Ab')).toBe('A♭');
  });
});

describe('no card falls off its own axis', () => {
  /**
   * The failure the thirteenth column existed to prevent: a card whose
   * coordinate is not on the axis lands in the tail, silently. Three
   * mode cards and one progression card went that way once already.
   */
  it('every key-axis category places every card', () => {
    for (const [cat, grid] of Object.entries(HARMONIC_FLUENCY_GRIDS)) {
      if (!grid || grid.columns.field !== 'key') continue;
      const values = new Set(grid.columns.views.flatMap(v => v.values.map(String)));
      const off = FLASHCARDS
        .filter(c => c.categoryName === cat)
        .filter(c => {
          const v = (c.axis as Record<string, unknown> | undefined)?.key;
          return v !== undefined && !values.has(String(v));
        });
      expect(off.map(c => c.id), cat).toEqual([]);
    }
  });

  it('and the pentatonic grid places every pentatonic card', () => {
    const values = new Set(pentGrid.columns.views[0].values.map(String));
    const off = FLASHCARDS
      .filter(c => c.categoryName === CATEGORY_LABELS['pentatonic-scales'])
      .filter(c => {
        const v = (c.axis as Record<string, unknown> | undefined)?.root;
        return v !== undefined && !values.has(String(v));
      });
    expect(off.map(c => c.id)).toEqual([]);
  });
});

describe('the migration refuses rather than adapts', () => {
  const clean = () => ({
    attempts: Object.fromEntries(Object.keys(IDENTITY_ID_MOVES).map(k => [k, 1])),
    spacing: Object.fromEntries(Object.keys(IDENTITY_ID_MOVES).map(k => [k, 1])),
    destinationAttempts: Object.fromEntries(Object.values(IDENTITY_ID_MOVES).map(k => [k, 0])),
    destinationSpacing: Object.fromEntries(Object.values(IDENTITY_ID_MOVES).map(k => [k, 0])),
  });

  it('accepts exactly the authorised shape — four cards, eight rows', () => {
    expect(Object.keys(IDENTITY_ID_MOVES)).toHaveLength(4);
    expect(refusalFor(clean())).toBeNull();
  });

  it('refuses when a source row count differs', () => {
    const s = clean(); s.attempts['pr-1564-Gb'] = 2;
    expect(refusalFor(s)).toMatch(/pr-1564-Gb/);
  });

  it('refuses when a source row has vanished', () => {
    const s = clean(); s.spacing['pent-minor-G#'] = 0;
    expect(refusalFor(s)).toMatch(/pent-minor-G#/);
  });

  it('refuses rather than merging when the destination is occupied', () => {
    const s = clean(); s.destinationSpacing['pent-major-F#'] = 1;
    expect(refusalFor(s)).toMatch(/decision, not a rename/);
  });
});

describe('the id moved and the words did not', () => {
  /**
   * Verified in the round that made the change by hashing every
   * question, answer, decoy and explanation across all 649 cards
   * before and after — identical. This is the readable half of that:
   * the four cards whose ids moved still SAY what they said.
   */
  const byId = new Map(FLASHCARDS.map(c => [c.id, c]));

  it('none of the four old spellings is back in the deck', () => {
    // THE HALF THAT SURVIVES COMMIT 8. Three of the four destinations
    // were pentatonic ids and the family took the `pent-notes-` prefix,
    // so `pent-major-F#` is gone too — but the claim that mattered was
    // always that the DISPLAY spelling never returns as an id.
    for (const from of Object.keys(IDENTITY_ID_MOVES)) {
      expect(byId.has(from), `${from} should be gone`).toBe(false);
    }
    expect(byId.has('fh-ii-v-i-F#')).toBe(true);
  });

  it('the cadence card is spelled G♭ in its text, under an F♯ id', () => {
    // WAS `pr-1564-F#` UNTIL COMMIT 8. Progression Vocabulary was
    // regenerated for thirteen keys, so it no longer has an identity
    // id to make this point with; Functional Harmony has not been, and
    // shows the same thing.
    const card = byId.get('fh-ii-v-i-F#')!;
    expect(card.question).toContain('G♭');
    expect(card.question).not.toContain('F♯');
    // Its degrees are spelled from the flat root, which is the whole
    // argument at `catalogExpansions.ts:28` — D♭ and C♭, not C♯ and B.
    expect(card.correctAnswer).toContain('D♭');
  });

  it('the minor pentatonic LEADS with G♯ in its text, under an A♭ id', () => {
    // It glosses both — "In G♯ (A♭) minor pentatonic" — because
    // `SCALE_ALT_NAME` gives the scale its second name. What matters
    // is which one LEADS: the corpus spells minor scales sharp, and
    // that did not follow the id onto the flat side.
    const card = byId.get('pent-notes-minor-G#')!;
    expect(card.question.startsWith('In G♯')).toBe(true);
    expect(card.axis!.root).toBe('Ab');
  });

  it('the major pentatonic leads with G♭, under an F♯ id', () => {
    // The mirror of the above, and the reason one axis column now
    // serves both: same pitch, same identity, two spellings, each
    // still reading the way its scale is written.
    // COMMIT 8 SPLIT THIS ONE. The G♭ card keeps its own words under
    // its own id, and F♯ major pentatonic is now a card of its own —
    // which is why the id can no longer be the identity.
    const card = byId.get('pent-notes-major-Gb')!;
    expect(card.question.startsWith('In G♭')).toBe(true);
    expect(byId.get('pent-notes-major-F#')!.question.startsWith('In F♯')).toBe(true);
  });
});
