import type { SongCell, SongKey, SongMatrixSection } from '../../lib/db';

/**
 * Where "start practising" goes when the nudge is taken.
 *
 * ---------------------------------------------------------------
 * EDITING THE LEAD SHEET IS PRACTICE, AND IT IS THE ONE KIND THE APP
 * COULD NOT SEE.
 *
 * "Building the lead sheet" is one of the six activities in the rating
 * step, so the vocabulary has always been able to describe it — but
 * nothing ever noticed it happening. A chart built across four evenings
 * outside any session left no trace at all.
 *
 * TWO BOUNDARIES, both deliberate, both easy to overshoot:
 *
 *   VIEWING STAYS COMPLETELY OPEN. Checking a chord, glancing at it on
 *   a phone, showing it to someone — none of that is gated, ever.
 *   Making it require a timed session would be the app charging a toll
 *   to read something the user wrote. Only an EDIT triggers anything.
 *
 *   IT IS A NUDGE, NOT A GATE. The edit has already landed by the time
 *   the strip appears, which is itself the honest signal: dismissing it
 *   changes nothing about the work, only about whether the time is
 *   recorded.
 * ---------------------------------------------------------------
 *
 * THE ORIGINAL KEY, NOT THE MOST RECENTLY PRACTISED ONE. The lead sheet
 * IS the chart in the original key — when you are editing it, that is
 * the key of the thing in front of you, wherever you last played the
 * song. Editing is also mostly early-life work, before a song has left
 * its original key at all. "Most recent key" borrows its appeal from
 * cross-key practice, which is when you are playing FROM the chart
 * rather than building it.
 */

/**
 * The cell to open for an edit to `songSectionId`, or null when it
 * cannot be resolved.
 *
 * NULL MATTERS AS MUCH AS THE ID. The caller must not show the nudge at
 * all when this returns null — a "start practising" button that opens
 * nothing is the same dishonesty as the RUN button that advanced
 * nothing, and the same rule applies: there is no honest label for a
 * button that does nothing.
 *
 * It can legitimately return null. `syncMatrixSectionsForSong` runs off
 * a Dexie write hook, so a section added seconds ago may not have a
 * matrix row yet, and `materialise` may not have created its cells. A
 * first edit landing in that window is exactly when this happens.
 */
export function cellForLeadSheetEdit(args: {
  songSectionId: string;
  matrixSections: ReadonlyArray<SongMatrixSection>;
  songKeys: ReadonlyArray<SongKey>;
  cells: ReadonlyArray<SongCell>;
}): string | null {
  // Matrix rows own their own ids and point BACK at the lead-sheet
  // section, so a rename or a reorder keeps the link. Matching on name
  // would break on the first rename and, worse, would silently attach
  // the practice to whichever section happened to share the name.
  const matrixSection = args.matrixSections.find(
    m => m.songSectionId === args.songSectionId && !m.isArchived,
  );
  if (!matrixSection) return null;

  const originalKey = args.songKeys.find(k => k.isOriginalKey);
  if (!originalKey) return null;

  const cell = args.cells.find(
    c => c.sectionId === matrixSection.id && c.songKeyId === originalKey.id,
  );
  return cell?.id ?? null;
}
