/**
 * The shared board, addressed by MIDI, marked one key at a time.
 *
 * =====================================================================
 * WHY NOT `KeyboardVisual`, WHICH ALREADY DRAWS A KEYBOARD.
 *
 * That one takes NOTE NAMES and four fixed colours — blue, green, red,
 * neutral — and resolves a highlight by pitch class within one rendered
 * octave. Every one of those is wrong for a built answer:
 *
 *   A built chord is marked by each note's JOB in the chord, so a key
 *   needs an arbitrary colour out of `INTERVAL_COLOR`, not one of four.
 *
 *   The bass note carries a BAND along the foot of its key as well as a
 *   fill, so that a bass line climbing onto a key the hand is already
 *   using shows both.
 *
 *   A voicing is a set of absolute MIDI notes. Which C the hand is
 *   playing is the whole point of voice leading, so the same pitch
 *   class must be markable in one octave and not another — which is
 *   the opposite of resolving by pitch class.
 *
 * So this is a second RENDERER and not a second geometry: where the
 * keys sit comes from `lib/answerKeyboard`, the same source
 * `AnswerKeyboard` uses. Two boards that disagreed about where F♯ is
 * would be the bug worth avoiding, and that is the part that is shared.
 *
 * =====================================================================
 * IT KNOWS NOTHING ABOUT MUSIC, AND THAT IS THE SAME LINE
 * `lib/answerKeyboard` DRAWS IN ITS OWN HEADER.
 *
 * It is handed marks and it draws them; it is handed a tap handler and
 * it reports a MIDI number. Which note is right, which colour a third
 * is, and whether a tap should add or remove are the CARD's rules.
 *
 * =====================================================================
 * FIFTY-SIX KEYS DO NOT FIT A PHONE, SO THE BOARD SCROLLS SIDEWAYS.
 *
 * Silas's answer of 14 Sep 2026 allows it, with the lit keys in view.
 * Below `BOARD_MIN_WIDTH_PX` the board keeps its width and its frame
 * scrolls, and whenever the lit keys change the frame centres them.
 * Where the board fits, nothing scrolls and nothing moves.
 * =====================================================================
 */
import { useEffect, useId, useRef } from 'react';
import {
  BOARD_HEIGHT, BOARD_MIN_WIDTH_PX, BOARD_WIDTH, type BoardKey, type KeyMark, boardKeys, keyLabel,
} from '../lib/builtAnswers/board';
import { HOLD_MS } from '../lib/player/boardEdit';

const PLAIN_FILL = '#C9E3F7';
const PLAIN_EDGE = '#5E93C4';
/** The dark line between a ring and the fill it surrounds. The board's
 *  own ground colour, so the gap reads as a gap. */
const RING_GAP = '#15181B';

const PRESSED_FILL = '#378ADD';
/** The root's own green, and so the bass band's. */
const BASS_GREEN = '#0F6E56';

export default function BuiltAnswerKeyboard({
  marks, onTap, onHold, label,
}: {
  /** Marks by MIDI number. */
  marks: ReadonlyMap<number, KeyMark>;
  /** Absent makes the board a picture rather than an input. */
  onTap?: (midi: number) => void;
  /**
   * A press held on a key for `HOLD_MS`. The tap that ends the press is
   * then not reported, so a hold is never also a tap.
   */
  onHold?: (midi: number) => void;
  label: string;
}) {
  const clipId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const { white, black } = boardKeys();
  const interactive = onTap !== undefined;

  const endPress = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const startPress = (midi: number) => {
    held.current = false;
    if (onHold === undefined) return;
    endPress();
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      held.current = true;
      onHold(midi);
    }, HOLD_MS);
  };
  const tapKey = (midi: number) => {
    if (held.current) { held.current = false; return; }
    onTap?.(midi);
  };

  // THE LIT KEYS INTO VIEW, when the frame is narrower than the board.
  // Keyed on which keys are lit, so a redraw that lights the same keys
  // leaves a reader's own scroll where they put it.
  const litKeys = [...marks.keys()].sort((a, b) => a - b).join(',');
  useEffect(() => {
    const el = frame.current;
    if (el === null || litKeys === '' || el.scrollWidth <= el.clientWidth) return;
    const lit = new Set(litKeys.split(',').map(Number));
    const keys = [...boardKeys().white, ...boardKeys().black].filter(k => lit.has(k.midi));
    if (keys.length === 0) return;
    const lo = Math.min(...keys.map(k => k.x));
    const hi = Math.max(...keys.map(k => k.x + k.width));
    const scale = el.scrollWidth / BOARD_WIDTH;
    el.scrollLeft = Math.max(0, ((lo + hi) / 2) * scale - el.clientWidth / 2);
  }, [litKeys]);

  const fillOf = (mark: KeyMark | undefined, isBlack: boolean): string => {
    if (mark?.pressed === true) return PRESSED_FILL;
    if (mark?.fill !== undefined) return mark.fill;
    if (mark?.plain === true) return isBlack ? PLAIN_EDGE : PLAIN_FILL;
    return isBlack ? '#23272B' : '#FFFFFF';
  };

  const keyEl = (k: BoardKey) => {
    const mark = marks.get(k.midi);
    const fill = fillOf(mark, k.isBlack);
    // NOT `label` — that name is the board's own, and the key's aria
    // label reads it two lines down.
    const cLabel = k.isBlack ? null : keyLabel(k.midi);
    return (
      <g key={k.midi}>
        <rect
          x={k.x}
          y={0}
          width={k.width}
          height={k.height}
          rx={2}
          fill={fill}
          stroke="#D5DBDF"
          strokeWidth={1}
          {...(interactive
            ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': `${label} key ${k.midi}`,
              className: 'cursor-pointer',
              onClick: () => tapKey(k.midi),
              onPointerDown: () => startPress(k.midi),
              onPointerUp: endPress,
              onPointerLeave: endPress,
              onPointerCancel: endPress,
            }
            : {})}
          data-midi={k.midi}
          data-mark={mark === undefined ? 'none' : 'marked'}
        />
        {/* THE BASS BAND, along the foot, drawn OVER the fill so both
            are visible when the bass and the hand share a key. */}
        {mark?.bassBand === true && (
          <rect
            x={k.x + 1}
            y={k.height - (k.isBlack ? 10 : 14)}
            width={k.width - 2}
            height={k.isBlack ? 9 : 13}
            fill={BASS_GREEN}
            data-testid={`bass-band-${k.midi}`}
            pointerEvents="none"
          />
        )}
        {/* THE RING, drawn inside the key's own edge so it reads as a
            band around the note rather than as a gap between keys. It
            says what degree of the KEY this chord is, where the fill
            says what interval of the CHORD this note is.

            A THIN DARK GAP SEPARATES IT FROM THE FILL. Ring and fill
            are two palettes answering two questions, and touching each
            other they read as one two-tone fill; the prototype puts a
            dark inset between them and so does this. */}
        {mark?.ring !== undefined && (
          <>
            <rect
              x={k.x + 5}
              y={5}
              width={k.width - 10}
              height={k.height - 10}
              rx={2}
              fill="none"
              stroke={RING_GAP}
              strokeWidth={2}
              pointerEvents="none"
            />
            <rect
              x={k.x + 2}
              y={2}
              width={k.width - 4}
              height={k.height - 4}
              rx={2}
              fill="none"
              stroke={mark.ring}
              strokeWidth={4}
              data-testid={`key-ring-${k.midi}`}
              pointerEvents="none"
            />
          </>
        )}
        {/* THE SELECTION RING, a group ↓ octave and ↑ octave move. Dark
            ink on a white key, white on a black one, as the prototype
            draws it — a mark about the reader's hand, not about the
            music, so no palette colour. */}
        {mark?.selectionRing === true && (
          <rect
            x={k.x + 3}
            y={3}
            width={k.width - 6}
            height={k.height - 6}
            rx={2}
            fill="none"
            stroke={k.isBlack ? '#FFFFFF' : '#1A1D21'}
            strokeWidth={3}
            data-testid={`selection-ring-${k.midi}`}
            pointerEvents="none"
          />
        )}
        {/* THE Cs CARRY THEIR NUMBER, so middle C is findable without
            counting from the edge. Drawn above the bass band's line and
            under nothing, in a colour that reads on a lit key as well
            as an unlit one. */}
        {cLabel !== null && (
          <text
            x={k.x + k.width / 2}
            y={k.height - 20}
            textAnchor="middle"
            fontSize={11}
            fill={mark === undefined ? '#8A9299' : '#FFFFFF'}
            pointerEvents="none"
            data-testid={`key-label-${k.midi}`}
          >
            {cLabel}
          </text>
        )}
      </g>
    );
  };

  return (
    <div ref={frame} className="overflow-x-auto overscroll-x-contain" data-testid="board-frame">
      <svg
        viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
        width="100%"
        role="img"
        aria-label={label}
        className="block select-none touch-manipulation"
        style={{ minWidth: BOARD_MIN_WIDTH_PX }}
        data-testid="built-answer-keyboard"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={BOARD_WIDTH} height={BOARD_HEIGHT} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {white.map(keyEl)}
          {black.map(keyEl)}
        </g>
      </svg>
    </div>
  );
}
