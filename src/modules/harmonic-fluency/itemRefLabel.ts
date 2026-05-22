/**
 * Readable labels for harmonic-fluency itemRefs.
 *
 * Item-refs are flashcard ids (e.g. "dq-maj-1", "fh-3"). Raw, they're
 * opaque codes — this resolves each to the card's actual question so
 * surfaces that list a block's items (the session prep breakdown) show
 * what's being drilled rather than the internal id.
 */
import { cardById } from './catalog';

/** Card id → its question prompt; falls back to the id when unknown. */
export function labelForHarmonicFluencyItemRef(itemRef: string): string {
  return cardById(itemRef)?.question ?? itemRef;
}
