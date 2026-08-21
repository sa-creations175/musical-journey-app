/**
 * The Shapes & Patterns catalog refs, enumerated once.
 *
 * `goals/scopeEnumeration.ts` builds the same list but keeps its
 * enumerators private, and it lives in the goals module — importing the
 * read layer's catalogs from there would point the dependency the wrong
 * way. This walks the same three sub-areas from the same sources, so a
 * catalog change flows into both.
 *
 * There is no `supplementary` skip any more. Those two-handed seventh
 * rows were excluded from every denominator until 20 Aug 2026; they now
 * gate acquisition like every other inversion state, and the chord-shape
 * catalog is 720.
 */
import {
  CHORD_QUALITIES,
  INVERSION_STATES_FOR_CHORD_SHAPE_KIND,
  KEYS,
  VOICE_LEADING_PATTERNS,
  enumerateVoiceLeadingCells,
} from '../../shapes-and-patterns/catalog';
import { SCALE_CELLS } from '../../shapes-and-patterns/scaleSkills';

export function enumerateChordShapeRefs(): string[] {
  const out: string[] = [];
  for (const q of CHORD_QUALITIES) {
    for (const key of KEYS) {
      for (const state of INVERSION_STATES_FOR_CHORD_SHAPE_KIND[q.kind]) {
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
    for (const key of KEYS) {
      for (const ref of enumerateVoiceLeadingCells(pattern, key)) out.push(ref);
    }
  }
  return out;
}

/** All three sub-areas, in tree order. */
export function enumerateScopeForShapes(): string[] {
  return [
    ...enumerateChordShapeRefs(),
    ...enumerateScaleRefs(),
    ...enumerateVoiceLeadingRefs(),
  ];
}
