import { useState } from 'react';
import {
  QUADRANT_ROOTS, initialSelection, maj7Sharp11, rootLabel,
} from './lydianChords';

/**
 * The maj7♯11 chord, in four keys at once.
 *
 * ---------------------------------------------------------------
 * THE CARD NAMES A CHORD WITHOUT SHOWING IT.
 *
 * "I maj7♯11" is an answer you can be right about without being able
 * to play it, and "the raised 4th (B natural over an F chord)" never
 * says that the B natural IS the ♯11. This is the shape underneath
 * both sentences.
 *
 * FOUR ROWS, ONE PER QUADRANT, so the chord is visible in four
 * different places on the keyboard rather than in one — the point
 * being that maj7♯11 is a shape you move, not a chord you memorise in
 * C. The quadrants come from the app's one circle of fourths.
 *
 * EXACTLY ONE ROW IS ACTIVE, and it marks its ♯11. Marking all four at
 * once turns the marking into decoration; marking none makes the rows
 * look inert. Tapping any chip makes its row active and moves the
 * marking there, so the first tap teaches what the rows do.
 * ---------------------------------------------------------------
 *
 * NOT A VISUAL AID, DELIBERATELY. This renders through `renderFooter`
 * rather than `renderVisualAid`, which is gated twice in
 * `FlashcardSession`: it disappears on a category streak, and it is
 * off entirely in `text` display mode. Both are right for a training
 * wheel and wrong for a reference. A hint should retreat as you
 * improve; this should be readable on the hundredth correct answer.
 */
export default function LydianChordRows({ openWith }: { openWith?: string }) {
  const [selected, setSelected] = useState<string[]>(() => initialSelection(openWith));
  // Row one, always — the card's own key sits there when it has one,
  // and a marking on screen from the first render is what says the
  // rows are interactive.
  const [activeRow, setActiveRow] = useState(0);

  const pick = (row: number, root: string) => {
    setSelected(prev => prev.map((r, i) => (i === row ? root : r)));
    setActiveRow(row);
  };

  return (
    <div className="mt-3 rounded-md border border-black/[0.07] bg-neutral-50 dark:bg-neutral-900 px-3 py-2.5 space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">
        maj7♯11 in four keys · tap a key to respell its row
      </div>
      {QUADRANT_ROOTS.map((rowRoots, row) => (
        <ChordRow
          key={row}
          roots={rowRoots}
          selected={selected[row]}
          active={row === activeRow}
          onPick={root => pick(row, root)}
        />
      ))}
    </div>
  );
}

function ChordRow({
  roots, selected, active, onPick,
}: {
  roots: ReadonlyArray<string>;
  selected: string;
  active: boolean;
  onPick: (root: string) => void;
}) {
  const notes = maj7Sharp11(selected) ?? [];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 shrink-0">
        {roots.map(root => (
          <button
            key={root}
            type="button"
            onClick={() => onPick(root)}
            aria-pressed={root === selected}
            className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
              root === selected
                ? 'bg-fluent text-white'
                : 'text-neutral-500 hover:text-fluent'
            }`}
          >
            {rootLabel(root)}
          </button>
        ))}
      </div>
      <span className="font-mono text-[11px] text-neutral-700 dark:text-neutral-200 shrink-0">
        {rootLabel(selected)}maj7♯11
      </span>
      <span className="flex items-baseline gap-1.5 flex-wrap font-mono text-[11px]">
        {notes.map((note, i) => {
          // The ♯11 is the last note — see MAJ7_SHARP11's ordering.
          const isSharp11 = i === notes.length - 1;
          const mark = active && isSharp11;
          return (
            <span
              key={i}
              className={mark
                ? 'text-[#E24B4A] font-medium'
                : 'text-neutral-500'}
              // The tritone's colour in the shared interval table,
              // so a ♯11 reads the same red here as on a keyboard.
              title={mark ? 'the ♯11 — a raised 4th, six semitones above the root' : undefined}
            >
              {note.label}
              {note.common && (
                <span className="text-neutral-400"> ({note.common})</span>
              )}
              {mark && <span className="ml-0.5 text-[9px] align-super">♯11</span>}
            </span>
          );
        })}
      </span>
    </div>
  );
}
