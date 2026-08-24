import { useEffect, useRef, useState } from 'react';
import {
  BH, BW, WH, WW, blackKeys, keyAt, octavesForWidth, samePosition,
  spellingsOf, viewBoxWidth, whiteKeys, type KeyPosition,
} from '../lib/answerKeyboard';

/**
 * Answer a card by pressing a key, instead of picking one of four.
 *
 * ---------------------------------------------------------------
 * WHY THIS EXISTS, AND WHAT IT MUST NOT DO.
 *
 * Four buttons let you answer "tritone of C" by eliminating three wrong
 * options without ever locating the note. The spelling is printed on
 * the button; recognition does the work that recall should. A keyboard
 * takes that away — you have to find the key.
 *
 * So nothing here narrows the answer: no candidate highlighting, no
 * dimming, no hover hints, no window trimmed to sit near the answer.
 * Before submission the subject marker is the only mark on the board.
 * `accepted` is rendered ONLY after `revealed`.
 * ---------------------------------------------------------------
 *
 * THE CARD JUDGES. This emits a position and shows what it is told to
 * show — see `answerKeyboard.ts` for why no interval logic lives here.
 */

interface Props {
  /** The note the question is about. Marked, never judged. In
   *  two-octave mode it is marked in the LOWER octave, so there is a
   *  full octave above it to answer into. */
  subject: KeyPosition;
  /**
   * Positions the card will accept. Used ONLY on reveal — passing them
   * does not put anything on the board beforehand.
   */
  accepted: ReadonlyArray<KeyPosition>;
  /** What the user pressed, or null. Controlled by the caller so the
   *  card owns the answer. */
  pressed: KeyPosition | null;
  /** After this, the board marks the accepted keys and names what was
   *  pressed. */
  revealed: boolean;
  onPress: (key: KeyPosition) => void;
  /** Forced octave count, for tests. Production measures instead. */
  octavesOverride?: 1 | 2;
}

export default function AnswerKeyboard({
  subject, accepted, pressed, revealed, onPress, octavesOverride,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  /** Which octave the single-octave board is showing, as an offset from
   *  the subject's own. Only meaningful in one-octave mode. */
  const [shift, setShift] = useState(0);

  // Measured, not guessed. A device breakpoint would be a second
  // statement of MIN_BLACK_KEY_PX and would drift from it.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const octaves = octavesOverride ?? octavesForWidth(width);

  // A fresh subject resets the window. Leaving it where the last card
  // left it would silently change the question's difficulty.
  useEffect(() => { setShift(0); }, [subject.pc, subject.octave]);

  /**
   * In one-octave mode the board shows ONE octave, so a position on the
   * board maps to a different absolute octave depending on the shift.
   * The emitted value is corrected for that here, which is what makes
   * the same physical key emit the same thing in both modes.
   */
  const toEmitted = (k: KeyPosition): KeyPosition =>
    octaves === 2 ? k : { pc: k.pc, octave: subject.octave + shift };

  /** And the inverse, for deciding what to draw. */
  const isOnBoard = (k: KeyPosition, boardOctave: number): boolean =>
    octaves === 2
      ? k.octave === boardOctave
      : k.octave === subject.octave + shift;

  const vbW = viewBoxWidth(octaves);

  const handle = (e: React.MouseEvent<SVGSVGElement>) => {
    if (revealed) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * vbW;
    const y = ((e.clientY - rect.top) / rect.height) * WH;
    const hit = keyAt(x, y, octaves);
    if (hit) onPress(toEmitted(hit));
  };

  const marks = (k: KeyPosition, boardOctave: number) => {
    const here = { pc: k.pc, octave: boardOctave };
    const isSubject = samePosition(subject, octaves === 2
      ? here
      : { pc: subject.pc, octave: subject.octave });
    const subjectHere = octaves === 2
      ? samePosition(subject, here)
      : subject.pc === k.pc && shift === 0;
    const pressedHere = pressed !== null
      && pressed.pc === k.pc
      && isOnBoard(pressed, boardOctave);
    // ACCEPTED IS REVEAL-ONLY. Drawing it earlier would narrow the
    // answer, which is the one thing this component exists to prevent.
    const acceptedHere = revealed
      && accepted.some(a => a.pc === k.pc && isOnBoard(a, boardOctave));
    void isSubject;
    return { subjectHere, pressedHere, acceptedHere };
  };

  return (
    <div ref={hostRef} className="w-full space-y-1.5">
      {octaves === 1 && (
        <div className="flex items-center justify-between text-[11px] text-neutral-500">
          <button
            type="button"
            onClick={() => setShift(s => s - 1)}
            className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent"
            aria-label="Show the octave below"
          >
            ↓ octave
          </button>
          <span aria-live="polite">
            {shift === 0 ? 'the subject’s octave' : shift > 0 ? `${shift} above` : `${-shift} below`}
          </span>
          <button
            type="button"
            onClick={() => setShift(s => s + 1)}
            className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 hover:border-fluent hover:text-fluent"
            aria-label="Show the octave above"
          >
            ↑ octave
          </button>
        </div>
      )}

      <svg
        viewBox={`0 0 ${vbW} ${WH}`}
        width="100%"
        onClick={handle}
        role="group"
        aria-label="Answer keyboard"
        style={{ cursor: revealed ? 'default' : 'pointer', touchAction: 'manipulation' }}
      >
        {whiteKeys(octaves).map(k => {
          const m = marks(k, k.octave);
          return (
            <rect
              key={`w${k.octave}-${k.pc}`}
              x={k.x} y={0} width={WW} height={WH} rx={2}
              fill={fillFor(m, false)}
              stroke={m.subjectHere ? '#111827' : '#d4d4d4'}
              strokeWidth={m.subjectHere ? 2.5 : 1}
            />
          );
        })}
        {blackKeys(octaves).map(k => {
          const m = marks(k, k.octave);
          return (
            <rect
              key={`b${k.octave}-${k.pc}`}
              x={k.x} y={0} width={BW} height={BH} rx={1.5}
              fill={fillFor(m, true)}
              stroke={m.subjectHere ? '#111827' : '#111827'}
              strokeWidth={m.subjectHere ? 2.5 : 0.5}
            />
          );
        })}
      </svg>

      {revealed && pressed !== null && (
        <p className="text-[11px] text-neutral-600 dark:text-neutral-300 text-center">
          {spellingsOf(pressed.pc).join(' / ')}
        </p>
      )}
    </div>
  );
}

/** Subject outlines rather than fills, so it marks WITHOUT reading as a
 *  candidate. Pressed and accepted only ever appear after reveal. */
function fillFor(
  m: { subjectHere: boolean; pressedHere: boolean; acceptedHere: boolean },
  isBlack: boolean,
): string {
  if (m.acceptedHere) return '#0F6E56';
  if (m.pressedHere) return '#E24B4A';
  return isBlack ? '#171717' : '#ffffff';
}
