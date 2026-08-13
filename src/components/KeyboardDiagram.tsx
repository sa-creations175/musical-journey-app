/**
 * Full 88-key keyboard diagram — A0 to C8.
 *
 * ---------------------------------------------------------------
 * WHY NOT PianoKeyboard OR KeyboardVisual
 *
 * Both existing keyboards are PITCH-CLASS tools built for chord
 * voicings: they take semitone offsets from a root, anchor their
 * octaves to C, and render two to four octaves. This one is asked a
 * different question — "where does D5 sit on a real piano, and how
 * much of it does the treble staff actually cover" — which needs the
 * whole instrument and a letter+octave model.
 *
 * `pitch.ts` explains at length why notation cannot round pitches
 * through a semitone number; building this on `voicingKeyPosition`
 * would have done exactly that. So it walks white keys diatonically,
 * the same way the staff does.
 * ---------------------------------------------------------------
 *
 * FULL 88 IS THE POINT, not a detail. A windowed keyboard would show
 * the answer more legibly and hide the thing worth seeing: how small a
 * slice of the instrument one staff covers. At phone width each white
 * key is about 6–7px — thin, and thin is the message. The bracket and
 * the C labels are what make it navigable at that size.
 *
 * Pure presentation. No state, no audio, no input.
 */

import { diatonicIndex, type Letter } from '../modules/reading/pitch';

export interface KeyboardPitch {
  letter: Letter;
  octave: number;
  /** Single sharp or flat places the adjacent black key. Doubles are
   *  not placeable here and are treated as the natural — a keyboard
   *  has no separate key for B-double-flat, which is the point at
   *  which a diagram stops being able to show a spelling. */
  accidental?: 'b' | '#' | null;
}

export interface KeyboardBracket {
  from: KeyboardPitch;
  to: KeyboardPitch;
  label: string;
}

// Standard 88: A0 … C8. 52 white keys, 36 black.
const FIRST_WHITE = diatonicIndex('A', 0);
const LAST_WHITE = diatonicIndex('C', 8);
export const WHITE_KEY_COUNT = LAST_WHITE - FIRST_WHITE + 1; // 52

const WW = 23;   // white key width
const WH = 110;  // white key height
const BW = 13;   // black key width
const BH = 68;   // black key height

/** Letters that carry a black key immediately to their right. */
const HAS_BLACK_AFTER = new Set<Letter>(['C', 'D', 'F', 'G', 'A']);

/** Position of a natural along the white-key row, 0 (A0) to 51 (C8).
 *  Out-of-range pitches return null rather than clamping — a clamped
 *  key would draw a confident highlight in the wrong place. */
export function whiteIndexOf(letter: Letter, octave: number): number | null {
  const index = diatonicIndex(letter, octave) - FIRST_WHITE;
  return index < 0 || index >= WHITE_KEY_COUNT ? null : index;
}

/** Left edge x of a white key. */
export function whiteKeyX(index: number): number {
  return index * WW;
}

/** Centre x of the key a pitch names, black keys included. Null when
 *  the pitch is off the instrument. */
export function keyCentreX(p: KeyboardPitch): number | null {
  const natural = whiteIndexOf(p.letter, p.octave);
  if (natural === null) return null;
  if (p.accidental === '#') return whiteKeyX(natural) + WW;
  if (p.accidental === 'b') return whiteKeyX(natural);
  return whiteKeyX(natural) + WW / 2;
}

/** Every C on the instrument, as [whiteIndex, octave]. The landmarks
 *  the whole diagram is navigated by — derived, not listed. */
export function cLandmarks(): Array<{ index: number; octave: number }> {
  const out: Array<{ index: number; octave: number }> = [];
  for (let octave = 0; octave <= 8; octave++) {
    const index = whiteIndexOf('C', octave);
    if (index !== null) out.push({ index, octave });
  }
  return out;
}

/**
 * BRACKET ENDPOINTS SIT AT KEY CENTRES, NOT KEY EDGES.
 *
 * Drawing the span edge-to-edge is the obvious thing and it lies: a
 * black key straddles every white-key boundary, so an endpoint at the
 * left edge of G2 lands visually on G♭2 and the bracket appears to
 * name the wrong notes. The range was right; the drawing was not.
 *
 * A centre is provably clear of black keys. Centre of white key i is
 * i·WW + WW/2 = i·23 + 11.5. The black keys nearest it span
 * [i·23 − 6.5, i·23 + 6.5] and [i·23 + 16.5, i·23 + 29.5], and 11.5
 * falls in neither — with 5 units of clearance either side. A test
 * checks this across every white key rather than trusting the algebra.
 */
export function bracketEndpointsX(
  from: KeyboardPitch,
  to: KeyboardPitch,
): { x1: number; x2: number } | null {
  const x1 = keyCentreX({ letter: from.letter, octave: from.octave });
  const x2 = keyCentreX({ letter: to.letter, octave: to.octave });
  if (x1 === null || x2 === null) return null;
  return { x1, x2 };
}

/** Every black key's horizontal span, for the clearance test. */
export function blackKeySpans(): Array<{ x1: number; x2: number }> {
  const out: Array<{ x1: number; x2: number }> = [];
  for (let i = 0; i < WHITE_KEY_COUNT - 1; i++) {
    const letter = LETTER_AT[(i + FIRST_WHITE) % 7];
    if (!HAS_BLACK_AFTER.has(letter)) continue;
    const x = whiteKeyX(i) + WW - BW / 2;
    out.push({ x1: x, x2: x + BW });
  }
  return out;
}

const VIEW_TOP = -70;
const VIEW_HEIGHT = 210;
const VIEW_WIDTH = WHITE_KEY_COUNT * WW;

/** Pitch as it is spoken — "G2", "F5". */
function pitchLabel(p: KeyboardPitch): string {
  return `${p.letter}${p.accidental ?? ''}${p.octave}`;
}

export default function KeyboardDiagram({
  highlight,
  bracket,
  accentHex = '#6f4a2f',
  labelCs = true,
}: {
  highlight?: KeyboardPitch | null;
  bracket?: KeyboardBracket | null;
  accentHex?: string;
  labelCs?: boolean;
}) {
  const highlightIndex = highlight
    ? whiteIndexOf(highlight.letter, highlight.octave)
    : null;
  const markerX = highlight ? keyCentreX(highlight) : null;

  const ends = bracket ? bracketEndpointsX(bracket.from, bracket.to) : null;
  const bracketOk = ends !== null;
  const bx1 = ends?.x1 ?? 0;
  const bx2 = ends?.x2 ?? 0;

  const whites = Array.from({ length: WHITE_KEY_COUNT }, (_, i) => i);

  return (
    <svg
      viewBox={`0 ${VIEW_TOP} ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      className="w-full h-auto select-none"
      role="img"
      aria-label={
        `88-key keyboard${highlight ? `, ${highlight.letter}${highlight.octave} highlighted` : ''}`
        + `${bracket ? `, ${bracket.label} spans ${bracket.from.letter}${bracket.from.octave} to ${bracket.to.letter}${bracket.to.octave}` : ''}`
      }
    >
      {/* White keys. Drawn first so black keys sit over them. */}
      {whites.map(i => (
        <rect
          key={`w${i}`}
          x={whiteKeyX(i)}
          y={0}
          width={WW}
          height={WH}
          fill={i === highlightIndex && !highlight?.accidental ? accentHex : '#ffffff'}
          stroke="#7a7a7a"
          strokeWidth={1.5}
        />
      ))}

      {/* Black keys, from the white key each one sits to the right of. */}
      {whites.map(i => {
        const letter = LETTER_AT[(i + FIRST_WHITE) % 7];
        if (!HAS_BLACK_AFTER.has(letter)) return null;
        if (i === WHITE_KEY_COUNT - 1) return null; // nothing above C8
        const x = whiteKeyX(i) + WW - BW / 2;
        const isHit = highlight?.accidental != null && markerX !== null
          && Math.abs(x + BW / 2 - markerX) < 0.5;
        return (
          <rect
            key={`b${i}`}
            x={x}
            y={0}
            width={BW}
            height={BH}
            fill={isHit ? accentHex : '#1b1b1b'}
            stroke="#1b1b1b"
            strokeWidth={1}
          />
        );
      })}

      {/* Marker above the answer. At 6–7px per key a fill alone is easy
          to miss; the triangle is what makes it findable at a glance. */}
      {markerX !== null && (
        <polygon
          points={`${markerX - 9},-10 ${markerX + 9},-10 ${markerX},-1`}
          fill={accentHex}
        />
      )}

      {/* Staff-range bracket. Ticks point DOWN to the exact key each
          end names — see bracketEndpointsX for why centres, not edges. */}
      {bracketOk && (
        <g stroke={accentHex} strokeWidth={2.5} fill="none">
          <line x1={bx1} y1={-20} x2={bx2} y2={-20} />
          <line x1={bx1} y1={-20} x2={bx1} y2={-12} />
          <line x1={bx2} y1={-20} x2={bx2} y2={-12} />
        </g>
      )}
      {bracketOk && (
        <>
          <text
            x={(bx1 + bx2) / 2}
            y={-50}
            textAnchor="middle"
            fontSize={26}
            fill={accentHex}
            fontWeight={600}
          >
            {bracket!.label}
          </text>
          {/* The endpoints named, so the bracket states a fact rather
              than gesturing at a span. */}
          <text x={bx1} y={-28} textAnchor="middle" fontSize={24} fill={accentHex}>
            {pitchLabel(bracket!.from)}
          </text>
          <text x={bx2} y={-28} textAnchor="middle" fontSize={24} fill={accentHex}>
            {pitchLabel(bracket!.to)}
          </text>
        </>
      )}

      {/* C landmarks. Every C labelled — these are what the whole
          diagram is counted from, and middle C reads as the one sitting
          between the two staves rather than as a fact to memorise. */}
      {labelCs && cLandmarks().map(({ index, octave }) => (
        <text
          key={`c${octave}`}
          x={whiteKeyX(index) + WW / 2}
          y={WH + 26}
          textAnchor="middle"
          fontSize={26}
          fill="#8a8a8a"
        >
          C{octave}
        </text>
      ))}
    </svg>
  );
}

/** Letter at a diatonic index, mod 7. C=0 … B=6, matching pitch.ts. */
const LETTER_AT: ReadonlyArray<Letter> = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
