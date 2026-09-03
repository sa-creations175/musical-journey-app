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

// Mode Identification, since Named Notes and then Reverse Key Pivots
// retired — the same `keyAxis`, which is what these pin.
const keyGrid = HARMONIC_FLUENCY_GRIDS[CATEGORY_LABELS.modes]!;
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

describe('the pentatonic axis collapsed with it', () => {
  it('is twelve columns, not the fifteen the two root lists made', () => {
    expect(pentGrid.columns.views[0].values).toHaveLength(12);
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

  it('the four migrated ids exist at their identity, and not at the old spelling', () => {
    for (const [from, to] of Object.entries(IDENTITY_ID_MOVES)) {
      expect(byId.has(to), `${to} should exist`).toBe(true);
      expect(byId.has(from), `${from} should be gone`).toBe(false);
    }
  });

  it('the progression card is spelled G♭ in its text, under an F♯ id', () => {
    const card = byId.get('pr-1564-F#')!;
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
    const card = byId.get('pent-minor-Ab')!;
    expect(card.question.startsWith('In G♯')).toBe(true);
  });

  it('the major pentatonic leads with G♭, under an F♯ id', () => {
    // The mirror of the above, and the reason one axis column now
    // serves both: same pitch, same identity, two spellings, each
    // still reading the way its scale is written.
    const card = byId.get('pent-major-F#')!;
    expect(card.question.startsWith('In G♭')).toBe(true);
  });
});
