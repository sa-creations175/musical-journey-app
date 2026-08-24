import { useState, type ReactNode } from 'react';
import { QUADRANT_ROOTS, initialSelection, rootLabel } from './lydianChords';

/**
 * Four rows of keys, one per circle-of-fourths quadrant, each
 * respellable by tapping one of its three chips.
 *
 * ---------------------------------------------------------------
 * THE ROWS ARE THE COMPONENT. THE CONTENT IS A PROP.
 *
 * This was `LydianChordRows`, which owned both the row mechanics and
 * the maj7♯11 spelling. The scale-degree cards need the identical
 * mechanics — four keys at once, one active, tap to respell — around
 * completely different content: "D down to F♯" rather than a chord.
 *
 * Copying the rows would have made a second key picker, and two key
 * pickers disagree about which twelve keys and in what order the first
 * time anyone edits one. So the rows moved here and take `renderRow`,
 * and `LydianChordRows` is now a thin wrapper that passes the chord.
 *
 * FOUR ROWS, ONE ACTIVE. Marking all four turns the marking into
 * decoration; marking none makes the rows look inert. Tapping any chip
 * makes its row active, so the first tap teaches what the rows do.
 * ---------------------------------------------------------------
 *
 * NOT A VISUAL AID, DELIBERATELY. Callers render this through
 * `renderFooter`, not `renderVisualAid`, which `FlashcardSession`
 * gates twice: it disappears on a category streak and is off entirely
 * in `text` display mode. Both are right for a training wheel and
 * wrong for a reference. A hint should retreat as you improve; this
 * should be readable on the hundredth correct answer.
 */
export default function KeyQuadrantRows({
  caption, openWith, renderRow,
}: {
  caption: string;
  /** The one key the card is about — its row opens on it, every other
   *  row opens on its own first key. */
  openWith?: string;
  renderRow: (root: string, active: boolean) => ReactNode;
}) {
  const [selected, setSelected] = useState<string[]>(() => initialSelection(openWith));
  // Row one, always — a marking on screen from the first render is
  // what says the rows are interactive.
  const [activeRow, setActiveRow] = useState(0);

  const pick = (row: number, root: string) => {
    setSelected(prev => prev.map((r, i) => (i === row ? root : r)));
    setActiveRow(row);
  };

  return (
    <div className="mt-3 rounded-md border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900 px-3 py-2.5 space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">
        {caption}
      </div>
      {QUADRANT_ROOTS.map((rowRoots, row) => (
        <div key={row} className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 shrink-0">
            {rowRoots.map(root => (
              <button
                key={root}
                type="button"
                onClick={() => pick(row, root)}
                aria-pressed={root === selected[row]}
                className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  root === selected[row]
                    ? 'bg-fluent text-white'
                    : 'text-neutral-500 hover:text-fluent'
                }`}
              >
                {rootLabel(root)}
              </button>
            ))}
          </div>
          {renderRow(selected[row], row === activeRow)}
        </div>
      ))}
    </div>
  );
}
