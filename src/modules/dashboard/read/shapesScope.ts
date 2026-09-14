/**
 * The Shapes & Patterns catalog refs, enumerated once.
 *
 * `goals/scopeEnumeration.ts` builds the same list but keeps its
 * enumerators private, and it lives in the goals module — importing the
 * read layer's catalogs from there would point the dependency the wrong
 * way. This walks the same three sub-areas from the same sources, so a
 * catalog change flows into both.
 *
 * SUPPLEMENTARY IS SKIPPED. Those two-handed seventh rows were folded
 * into the score on 20 Aug 2026 and left it again on 31 Aug 2026: the
 * left-hand root under a right-hand triad is a combination of two
 * things already counted, not a shape to own. See `catalog.ts`, which
 * carries both rulings. Enumerating them here would put items in front
 * of the reader that no denominator counts.
 */
import {
  CHORD_QUALITIES,
  CIRCLE_KEY,
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  KEYS,
  VOICE_LEADING_PATTERNS,
  enumerateVoiceLeadingCells,
} from '../../shapes-and-patterns/catalog';
import { SCALE_CELLS } from '../../shapes-and-patterns/scaleSkills';

export function enumerateChordShapeRefs(): string[] {
  const out: string[] = [];
  for (const q of CHORD_QUALITIES) {
    // The twelve keys and the Circle of 4ths cell, as the grid counts
    // (Silas, 14 Sep 2026). The dashboard reads today's catalog, so the
    // Circle is in it outright.
    for (const key of [...KEYS, CIRCLE_KEY]) {
      for (const state of INVERSION_STATES_FOR_CHORD_SHAPE_KIND[q.kind]) {
        if (state === 'supplementary') continue;
        out.push(state
          ? `chord-shape:${q.id}:${key}:${state}`
          : `chord-shape:${q.id}:${key}`);
      }
    }
  }
  return out;
}

export function enumerateScaleRefs(): string[] {
  return SCALE_CELLS.map(c => c.itemRef);
}

export function enumerateVoiceLeadingRefs(): string[] {
  const out: string[] = [];
  for (const pattern of VOICE_LEADING_PATTERNS) {
    // The twelve keys and the Circle of 4ths cell, as the grid counts
    // (Silas, 13 Sep 2026). Today's catalog, so the Circle is in outright.
    for (const key of [...KEYS, CIRCLE_KEY]) {
      for (const ref of enumerateVoiceLeadingCells(pattern, key)) out.push(ref);
    }
  }
  return out;
}

/** All three sub-areas, in tree order — the module's section order
 *  (14 Sep 2026), so the dashboard lists them as the sidebar does. */
export function enumerateScopeForShapes(): string[] {
  return [
    ...enumerateScaleRefs(),
    ...enumerateChordShapeRefs(),
    ...enumerateVoiceLeadingRefs(),
  ];
}
