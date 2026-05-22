/**
 * Readable label for a single session-block itemRef, dispatched by
 * module. Each declarative / content module encodes its items as codes
 * ("min:0", "P5:asc", "fh-3", a lessonId, a songId); this resolves them
 * to human text for surfaces that name a block's content — the prep
 * breakdown rows and the resume-session prompt.
 *
 * Always returns a string. When no module-specific labeler applies (or
 * the lookup misses), it falls back to the raw itemRef — callers that
 * need to know "did this resolve to something better than the raw id?"
 * compare the result against the input.
 */
import { labelForShapesItemRef } from '../shapes-and-patterns/drillModel';
import { labelForChordRecognitionItemRef } from '../ear-training/chord-recognition/itemRefLabel';
import { labelForIntervalItemRef } from '../ear-training/intervals/itemRefLabel';
import { labelForHarmonicFluencyItemRef } from '../harmonic-fluency/itemRefLabel';
import { lessonById } from '../production/content/lessons';

export function readableItemRefLabel(
  moduleRef: string | undefined,
  itemRef: string,
): string {
  switch (moduleRef) {
    case 'chord-recognition':
      return labelForChordRecognitionItemRef(itemRef);
    case 'intervals':
      return labelForIntervalItemRef(itemRef);
    case 'harmonic-fluency':
      return labelForHarmonicFluencyItemRef(itemRef);
    case 'production':
      // Production lesson blocks carry lesson ids; vocab blocks have no
      // itemRefs so they never reach here.
      return lessonById(itemRef)?.title ?? itemRef;
    default:
      return labelForShapesItemRef(itemRef) ?? itemRef;
  }
}
