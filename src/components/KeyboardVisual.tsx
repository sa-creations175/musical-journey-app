// Reusable 1-2 octave SVG piano keyboard. Accepts a key signature so it
// can subtly tint in-key white notes, plus a list of explicitly
// highlighted notes (blue / green / red). Optional click handler turns
// the keyboard into an input surface — callers that omit the handler get
// a pure visual keyboard (no cursor change, no hover state).
// Shared with future modules (Chord Motion tab, etc.).

export type HighlightColor = 'blue' | 'green' | 'red' | 'neutral';
export interface HighlightedNote {
  note: string;           // e.g. "C", "F#", "Bb"
  octave?: number;        // defaults to any octave (highlight all matches)
  color: HighlightColor;
}

interface Props {
  /** Key name like "C major", "F# major", "Bb major". Used to choose
      sharp vs. flat names for black keys; NOT used to tint in-key notes
      (that created visual noise competing with the highlight). Pass
      `keyLabel` to show the key name as a caption above the keyboard. */
  keySignature?: string;
  /** Optional caption rendered above the keyboard (e.g. "Key of G major"). */
  keyLabel?: string;
  /** Notes to explicitly highlight on the keyboard. When `octave` is
      omitted the highlight resolves to `startOctave` (single key),
      never across every octave. */
  highlightedNotes?: HighlightedNote[];
  /** Number of octaves to render. Default 2. */
  octaves?: number;
  /** Lowest rendered octave (middle C = 4). Default 4. */
  startOctave?: number;
  /** Width in pixels. Height auto-derives. */
  width?: number;
  /** When provided, every rendered key becomes clickable and fires this
      with the canonical note name (flat or sharp based on keySignature)
      and its octave. Keep undefined for purely-visual use. */
  onKeyClick?: (note: string, octave: number) => void;
}

const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
// Enharmonic equivalents keyed by canonical sharp name.
const BLACK_NOTE_SHARP = ['C#', 'D#', null, 'F#', 'G#', 'A#', null] as const;
const BLACK_NOTE_FLAT =  ['Db', 'Eb', null, 'Gb', 'Ab', 'Bb', null] as const;

// Semitone map — lets us match enharmonics (F# == Gb on the keyboard).
const SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, 'E#': 5, Fb: 4,
  F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10,
  B: 11, 'B#': 0, Cb: 11,
};

function colorToken(color: HighlightColor): string {
  switch (color) {
    case 'blue':    return '#378ADD';
    case 'green':   return '#1D9E75';
    case 'red':     return '#E24B4A';
    case 'neutral': return '#9CA3AF';
  }
}

function keyToName(keySignature?: string): string | null {
  if (!keySignature) return null;
  const root = keySignature.replace(/\s*(major|minor)\s*$/i, '').trim();
  return root;
}

function highlightFor(
  note: string,
  octave: number,
  highlights: HighlightedNote[],
): HighlightColor | null {
  const noteSem = SEMITONE[note];
  for (const h of highlights) {
    // Octave is required (resolved to startOctave by the caller) — this
    // prevents a single highlight from lighting up every occurrence of
    // the same pitch class across rendered octaves.
    if (h.octave !== octave) continue;
    if (SEMITONE[h.note] !== noteSem) continue;
    return h.color;
  }
  return null;
}

export default function KeyboardVisual({
  keySignature,
  keyLabel,
  highlightedNotes = [],
  octaves = 2,
  startOctave = 4,
  width = 320,
  onKeyClick,
}: Props) {
  const interactive = typeof onKeyClick === 'function';
  const keyName = keyToName(keySignature);
  const totalWhite = 7 * octaves;
  const whiteW = width / totalWhite;
  const whiteH = Math.max(60, whiteW * 3.6);
  const blackW = whiteW * 0.6;
  const blackH = whiteH * 0.62;
  const useFlats = keyName ? ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(keyName) : false;
  const blackRow = useFlats ? BLACK_NOTE_FLAT : BLACK_NOTE_SHARP;

  // Resolve highlight octaves — callers that pass just `note` without
  // `octave` get pinned to startOctave, so one highlight lights up one key.
  const resolvedHighlights: HighlightedNote[] = highlightedNotes.map(h => ({
    ...h,
    octave: h.octave ?? startOctave,
  }));

  return (
    <div className="inline-block">
      {keyLabel && (
        <div className="text-[11px] text-neutral-500 uppercase tracking-wide text-center mb-1">
          {keyLabel}
        </div>
      )}
      <svg
        width={width}
        height={whiteH}
        viewBox={`0 0 ${width} ${whiteH}`}
        aria-hidden
        className="block"
      >
        {/* White keys — all pure white so the highlights speak loud */}
        {Array.from({ length: totalWhite }).map((_, i) => {
          const octave = startOctave + Math.floor(i / 7);
          const note = WHITE_NOTES[i % 7];
          const hl = highlightFor(note, octave, resolvedHighlights);
          const fill = hl ? colorToken(hl) : 'var(--kbd-white, #ffffff)';
          const textFill = hl ? '#ffffff' : '#6b7280';
          return (
            <g key={`w-${i}`}>
              <rect
                x={i * whiteW}
                y={0}
                width={whiteW}
                height={whiteH}
                fill={fill}
                stroke="#d1d5db"
                strokeWidth={1}
                onClick={interactive ? () => onKeyClick!(note, octave) : undefined}
                style={interactive ? { cursor: 'pointer' } : undefined}
                role={interactive ? 'button' : undefined}
                aria-label={interactive ? `${note}${octave}` : undefined}
              />
              <text
                x={i * whiteW + whiteW / 2}
                y={whiteH - 6}
                textAnchor="middle"
                fontSize={Math.max(9, whiteW * 0.3)}
                fill={textFill}
                fontFamily="ui-monospace, monospace"
                pointerEvents="none"
              >
                {note}
              </text>
            </g>
          );
        })}
        {/* Black keys — rendered after whites so they sit on top */}
        {Array.from({ length: totalWhite }).map((_, i) => {
          const noteIdx = i % 7;
          const blackNote = blackRow[noteIdx];
          if (!blackNote) return null;
          const octave = startOctave + Math.floor(i / 7);
          const hl = highlightFor(blackNote, octave, resolvedHighlights);
          const baseFill = hl ? colorToken(hl) : '#111827';
          const x = (i + 1) * whiteW - blackW / 2;
          return (
            <rect
              key={`b-${i}`}
              x={x}
              y={0}
              width={blackW}
              height={blackH}
              fill={baseFill}
              stroke="#000"
              strokeOpacity={0.2}
              onClick={interactive ? () => onKeyClick!(blackNote, octave) : undefined}
              style={interactive ? { cursor: 'pointer' } : undefined}
              role={interactive ? 'button' : undefined}
              aria-label={interactive ? `${blackNote}${octave}` : undefined}
            />
          );
        })}
      </svg>
    </div>
  );
}
