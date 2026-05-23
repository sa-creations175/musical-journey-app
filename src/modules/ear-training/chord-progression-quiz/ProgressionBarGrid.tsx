// Read-only bar-grid view of a section's progression, for the quiz
// reveal. Renders the same derivation the lead-sheet editor uses
// (deriveBarGrid) so what the user sees here matches their chart — but
// without any of the editing / drag machinery.

import type { Song, SongSection } from '../../../lib/db';
import {
  deriveBarGrid,
  effectiveTimeSignature,
  parseTimeSignature,
} from '../../repertoire/barGrid';
import { chordToDisplay, type NotationMode } from '../../repertoire/chordFunction';
import { activeArrangementId } from './progressionQuiz';

export default function ProgressionBarGrid({
  song,
  section,
  notation = 'roman',
}: {
  song: Song;
  section: SongSection;
  notation?: NotationMode;
}) {
  const { beatsPerBar } = parseTimeSignature(effectiveTimeSignature(song, section));
  const bars = deriveBarGrid(section, activeArrangementId(section), beatsPerBar);
  if (bars.length === 0) return null;

  return (
    <div className="grid grid-cols-4 gap-1" aria-label="bar grid">
      {bars.map(bar => (
        <div
          key={bar.index}
          className="min-h-[2.25rem] rounded border border-neutral-200 dark:border-neutral-700 px-1.5 py-1 flex items-center gap-1.5 flex-wrap"
        >
          {bar.cells.length === 0 ? (
            <span className="text-neutral-300 dark:text-neutral-600">·</span>
          ) : (
            bar.cells.map(cell => (
              <span
                key={cell.placementId}
                className="text-sm font-medium text-neutral-800 dark:text-neutral-100"
              >
                {chordToDisplay(cell.chord, notation, song.key)}
              </span>
            ))
          )}
        </div>
      ))}
    </div>
  );
}
