/**
 * A verdict, as a colour key.
 *
 * =====================================================================
 * ONE TRANSLATION, NOT ONE PER GRID.
 *
 * `BandVerdict` is the shape every grid holds: a band, or one of the two
 * things that are NOT bands — Not Started and Started. Turning that into
 * a colour was a four-case switch written out in `BandCell`, in
 * `MatrixCell`, in the chord breakdown panel's chip and in the practice
 * panel's ladder band, and the four had already drifted (Started was
 * grey on three grids and blue on the matrix).
 *
 * It sits beside `statusColour` rather than inside it because
 * `statusColour` must not know about verdicts: it is the palette, and
 * a palette that imported the banding engine would be the wrong way
 * round.
 * =====================================================================
 */
import type { BandVerdict } from './banding';
import type { AccuracyBand } from './bands';
import type { StatusKey } from './statusColour';

/** The four bands, as colour keys. They already share their spelling,
 *  so this is an identity — written out anyway so the type system
 *  fails rather than the paint if either list gains a member. */
export const STATUS_FOR_BAND: Readonly<Record<AccuracyBand, StatusKey>> = {
  'needs-work': 'needs-work',
  'developing': 'developing',
  'fluent': 'fluent',
  'mastered': 'mastered',
};

export function statusKeyForVerdict(verdict: BandVerdict): StatusKey {
  switch (verdict.kind) {
    case 'not-started': return 'not-started';
    case 'started':     return 'started';
    case 'band':        return STATUS_FOR_BAND[verdict.band];
  }
}
