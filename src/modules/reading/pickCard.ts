/**
 * Card selection — which item comes up, and how it gets drawn.
 *
 * ---------------------------------------------------------------
 * THIS IS WHERE RENDER-TIME VARIATION ACTUALLY HAPPENS
 *
 * The catalog's whole design is that clef, root, quality and frame are
 * absent from identity so one item can be DRAWN many ways. That only
 * pays off if something varies them. This is that something: without
 * it every first-inversion triad is C major on the treble staff and
 * the drill teaches one picture, which is the failure the schema
 * comment in catalog.ts exists to prevent.
 * ---------------------------------------------------------------
 *
 * NOT ALL SPELLINGS EXIST, so selection is "pick a root that
 * resolves" rather than "pick a root and draw it". An augmented triad
 * on B-sharp needs a triple sharp and a diminished seventh on C-flat
 * or F-flat needs a triple flat; `spellInterval` refuses past a
 * double, correctly, and the card comes back null.
 *
 * BE HONEST ABOUT WHAT THIS COSTS: none of those roots is in
 * CHORD_ROOTS today, so the retry below never actually fires. It is a
 * guard against that list growing — the key overlay will want sharp
 * spellings — and the failure it guards against is a blank staff
 * under a confident prompt. Both facts are pinned in pickCard.test.ts
 * so neither the guard nor its inertness is a surprise later.
 *
 * Randomness is injected so a test can pin a sequence. No spacing or
 * weighting yet — this is uniform choice over the skill's items, and
 * the adaptive selection lands with the attempt writer.
 */

import {
  enumerateChordItems,
  enumerateNoteItems,
  enumerateShapeItems,
  enumerateSignatureItems,
  CHORD_QUALITIES,
  CLEFS,
  parseReadingItemRef,
  type Clef,
} from './catalog';
import { CHORD_ROOTS, rootId } from './answerModels';
import { resolveReadingCard, type ReadingRenderOptions } from './renderCard';
import type { Letter } from './pitch';

export type ReadingDrillSkill = 'note' | 'shape' | 'sig' | 'chord';

/** Root octave per clef — puts a root-position triad inside the staff.
 *  Mirrors renderCard's own default; stated here because selection
 *  chooses the LETTER and has to supply an octave with it. */
const ROOT_OCTAVE: Readonly<Record<Clef, number>> = { treble: 4, bass: 2 };

export interface PickedCard {
  itemRef: string;
  options: ReadingRenderOptions;
  /** The root the card was actually drawn on, as a picker id, for
   *  chord items. Null for every other skill. Read off the same
   *  choice the render used — never re-derived. */
  rootId: string | null;
}

export type Rng = () => number;

function choice<T>(items: ReadonlyArray<T>, rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

export function itemsForSkill(skill: ReadingDrillSkill): string[] {
  if (skill === 'note') return enumerateNoteItems();
  if (skill === 'shape') return enumerateShapeItems();
  if (skill === 'sig') return enumerateSignatureItems();
  return enumerateChordItems();
}

/**
 * Render options for one item, retrying roots until the spelling
 * resolves.
 *
 * The retry walks the twelve roots from a random start rather than
 * re-rolling, so it terminates: every quality resolves on at least C,
 * and a walk visits C. Returning options that do not resolve would
 * put a confident caption over an empty staff.
 */
function optionsFor(itemRef: string, rng: Rng): PickedCard {
  const parsed = parseReadingItemRef(itemRef);
  if (!parsed) return { itemRef, options: {}, rootId: null };

  if (parsed.skill === 'note') {
    // Clef IS identity and there is nothing else to vary.
    return { itemRef, options: {}, rootId: null };
  }

  if (parsed.skill === 'sig') {
    // Clef is free here; the same signature is the same signature on
    // either staff. Frame stays single for now — the grand-staff
    // toggle belongs to the preview page, not the drill.
    return { itemRef, options: { clef: choice(CLEFS, rng) }, rootId: null };
  }

  if (parsed.skill === 'shape') {
    const clef = choice(CLEFS, rng);
    const qualities = CHORD_QUALITIES.filter(q => q.family === parsed.family);
    const quality = choice(qualities, rng);
    const start = Math.floor(rng() * CHORD_ROOTS.length);
    for (let i = 0; i < CHORD_ROOTS.length; i++) {
      const r = CHORD_ROOTS[(start + i) % CHORD_ROOTS.length];
      const options: ReadingRenderOptions = {
        clef,
        shapeQuality: quality.id,
        root: { letter: r.letter as Letter, accidental: r.accidental, octave: ROOT_OCTAVE[clef] },
      };
      if (resolveReadingCard(itemRef, options)) return { itemRef, options, rootId: null };
    }
    return { itemRef, options: { clef, shapeQuality: quality.id }, rootId: null };
  }

  // Chord — clef is identity, root is the free dimension.
  const clef = parsed.clef;
  const start = Math.floor(rng() * CHORD_ROOTS.length);
  for (let i = 0; i < CHORD_ROOTS.length; i++) {
    const r = CHORD_ROOTS[(start + i) % CHORD_ROOTS.length];
    const options: ReadingRenderOptions = {
      root: { letter: r.letter as Letter, accidental: r.accidental, octave: ROOT_OCTAVE[clef] },
    };
    if (resolveReadingCard(itemRef, options)) {
      return { itemRef, options, rootId: rootId(r.letter, r.accidental) };
    }
  }
  return { itemRef, options: {}, rootId: rootId('C', null) };
}

/** One card for a skill: an item plus the options it draws with. */
export function pickCard(
  skill: ReadingDrillSkill,
  rng: Rng = Math.random,
): PickedCard {
  return optionsFor(choice(itemsForSkill(skill), rng), rng);
}

/** Options for a KNOWN item — used when the caller already chose what
 *  to ask (a repeat, or a fixed sequence in a test). */
export function optionsForItem(itemRef: string, rng: Rng = Math.random): PickedCard {
  return optionsFor(itemRef, rng);
}
