// Read-only bar-grid view of a section's progression, for the quiz
// reveal. Renders the same derivation the lead-sheet editor uses
// (deriveBarGrid) so what the user sees here matches their chart — but
// without any editing machinery, and key-agnostic: each chord box shows
// its Nashville number, colored by scale degree via the shared interval
// color ramp (root deep-green, 4th purple, 5th gray, …).

import type { Song, SongSection } from '../../../lib/db';
import {
  deriveBarGrid,
  effectiveTimeSignature,
  parseTimeSignature,
} from '../../repertoire/barGrid';
import { renderNumbers } from '../../repertoire/chordFunction';
import { degreeColor, mostCompleteArrangementId } from './progressionQuiz';

export default function ProgressionBarGrid({
  song,
  section,
}: {
  song: Song;
  section: SongSection;
}) {
  const { beatsPerBar } = parseTimeSignature(effectiveTimeSignature(song, section));
  const bars = deriveBarGrid(section, mostCompleteArrangementId(section), beatsPerBar);
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
                className="text-sm font-semibold"
                style={{ color: degreeColor(cell.chord) }}
              >
                {renderNumbers(cell.chord)}
              </span>
            ))
          )}
        </div>
      ))}
    </div>
  );
}
