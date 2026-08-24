import KeyQuadrantRows from './KeyQuadrantRows';
import { maj7Sharp11, rootLabel } from './lydianChords';

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
 * C.
 *
 * The rows themselves now live in `KeyQuadrantRows`, because the
 * scale-degree cards need the identical mechanics around entirely
 * different content. Everything below is the chord; nothing below is
 * the picker.
 * ---------------------------------------------------------------
 */
export default function LydianChordRows({ openWith }: { openWith?: string }) {
  return (
    <KeyQuadrantRows
      caption="maj7♯11 in four keys · tap a key to respell its row"
      openWith={openWith}
      renderRow={(root, active) => <ChordNotes root={root} active={active} />}
    />
  );
}

function ChordNotes({ root, active }: { root: string; active: boolean }) {
  const notes = maj7Sharp11(root) ?? [];
  return (
    <>
      <span className="font-mono text-[11px] text-neutral-700 dark:text-neutral-200 shrink-0">
        {rootLabel(root)}maj7♯11
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
    </>
  );
}
