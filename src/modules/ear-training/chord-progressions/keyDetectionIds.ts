/**
 * The attempt itemId for a key-detection round.
 *
 * Extracted from KeyDetectionTab so the identity rule can be asserted.
 * This is the ONLY place in ear training where a key name reaches
 * storage: `motionId` is built from scale degrees, and the scales-modes
 * item ids are built from mode ids, so their key names are pure
 * display. This one is not.
 */

import { canonicaliseKey } from '../../repertoire/circleOfFourths';

/**
 * Composite attempt id: `key-detection:{key}`, where `{key}` is always
 * the IDENTITY spelling — the same twelve strings `progressionTheory`
 * has always produced.
 *
 * NORMALISES RATHER THAN TRUSTING ITS CALLER, and that is the point. A
 * display-spelled name reaching here would not throw; it would mint
 * `key-detection:G♭` beside the existing `key-detection:F#` and the
 * user would see a key they have drilled for months read as never
 * attempted, with its real history still on disk under the old id.
 * Nothing in the write path validates itemIds, so there is no layer
 * below this one to catch it.
 *
 * An unrecognised key passes through unchanged. That is deliberate: a
 * freeform or legacy value should stay addressable as itself rather
 * than be folded onto some other key's history.
 */
export function keyDetectionItemId(key: string): string {
  return `key-detection:${canonicaliseKey(key) ?? key}`;
}
