// Three-octave piano keyboard for the bar-grid chord-edit popover's
// voicing display (Lead Sheet Redesign, May 2026 —
// docs/LEAD_SHEET_REDESIGN.md).
//
// Voicings are octave-aware semitone offsets from the chord root:
// offset = pcOffsetFromRoot + 12 * displayOctave, so 0–11 = the first
// rendered octave, 12–23 = the second, 24–35 = the third. Each key in
// each octave is independently toggleable (E in octave 1 is offset 4,
// E in octave 2 is offset 16, E in octave 3 is offset 28).
//
// Each highlighted key is colored by its interval from the CHORD ROOT
// (root deep green, 3rds green-ish, 7ths amber, tensions red, etc.), so
// the same interval reads the same color in any chord. The hand is shown
// by opacity: right hand full, left hand 65% of the same color. In edit
// mode an L/R pill picks which hand new taps assign; tapping an
// already-highlighted key removes it regardless of hand. Keys are
// labeled with their note name and their interval relative to the chord
// root (R, 3, 5, 7…).

import { useState } from 'react';
import type { VoicingEntry, VoicingHand } from '../../lib/db';
import { intervalColor, normalizeVoicing } from './voicingHelpers';
import { NOTE_NAMES_FLAT, NOTE_NAMES_SHARP } from './chordFunction';

// Left-hand tones render at this fraction of the per-note color.
const LEFT_HAND_OPACITY = 0.65;

// White keys per octave → pitch class. Black keys sit after these
// white indices (within an octave) with the listed pitch class.
const WHITE_TO_PC = [0, 2, 4, 5, 7, 9, 11];
const BLACK_ANCHORS: { afterWhite: number; pc: number }[] = [
  { afterWhite: 0, pc: 1 },
  { afterWhite: 1, pc: 3 },
  { afterWhite: 3, pc: 6 },
  { afterWhite: 4, pc: 8 },
  { afterWhite: 5, pc: 10 },
];

// Interval label relative to the chord root, by semitone offset.
const INTERVAL_LABEL: Record<number, string> = {
  0: 'R', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

// viewBox geometry (scales to 100% width via the SVG viewBox).
const WW = 24; // white-key width
const WH = 104; // white-key height
const BW = 14; // black-key width
const BH = 62; // black-key height
const OCTAVES = 3;
const WHITE_COUNT = WHITE_TO_PC.length * OCTAVES; // 21
const TOTAL_W = WHITE_COUNT * WW;

interface Props {
  /** Pitch class (0–11) of the chord root, for interval colors, labels,
   *  and the root marker. */
  rootPc: number;
  /** Selected voicing tones. Accepts legacy plain-number offsets
   *  (read as right-hand) alongside `{ offset, hand }` entries. */
  voicing: Array<number | VoicingEntry>;
  /** Spell labels with flats (true) or sharps (false). */
  preferFlats?: boolean;
  /** When true, keys are tappable, the L/R pill shows, and labels show. */
  editable?: boolean;
  /** Fired with the toggled octave-aware offset (0–35) and the hand
   *  currently selected on the L/R pill. The parent decides add vs.
   *  remove (tapping a highlighted key removes it). */
  onToggle?: (offset: number, hand: VoicingHand) => void;
  /** Dim the whole keyboard (empty-state prompt). */
  faint?: boolean;
}

export default function PianoKeyboard({
  rootPc,
  voicing,
  preferFlats = true,
  editable = false,
  onToggle,
  faint = false,
}: Props) {
  const names = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const [selectedHand, setSelectedHand] = useState<VoicingHand>('R');

  // Map each occupied offset to the hand that should color it. Later
  // entries win, so a stacked offset shows the most-recently-assigned
  // hand (the toggle rule means this normally has at most one per key).
  const handByOffset = new Map<number, VoicingHand>();
  for (const entry of normalizeVoicing(voicing)) {
    handByOffset.set(entry.offset, entry.hand);
  }

  // Pitch-class offset from root (0–11), used for the interval label.
  const offsetOf = (pc: number) => (pc - rootPc + 12) % 12;
  // Full octave-aware offset for a key in a given rendered octave.
  const fullOffset = (pc: number, octaveIndex: number) =>
    offsetOf(pc) + 12 * octaveIndex;
  const handAt = (pc: number, octaveIndex: number) =>
    handByOffset.get(fullOffset(pc, octaveIndex));
  // Fill color = the key's interval from the chord root.
  const colorForPc = (pc: number) => intervalColor(offsetOf(pc));
  const opacityForHand = (hand: VoicingHand) =>
    hand === 'L' ? LEFT_HAND_OPACITY : 1;
  const toggle = (pc: number, octaveIndex: number) => {
    if (!editable || !onToggle) return;
    onToggle(fullOffset(pc, octaveIndex), selectedHand);
  };

  // White keys (rendered first so black keys overlay them).
  const whiteKeys = [];
  for (let gi = 0; gi < WHITE_COUNT; gi++) {
    const octaveIndex = Math.floor(gi / 7);
    const pc = WHITE_TO_PC[gi % 7];
    const x = gi * WW;
    const hand = handAt(pc, octaveIndex);
    const isRoot = pc === rootPc;
    whiteKeys.push(
      <g
        key={`w${gi}`}
        onClick={editable ? () => toggle(pc, octaveIndex) : undefined}
        style={{ cursor: editable ? 'pointer' : 'default' }}
      >
        <rect
          x={x}
          y={0}
          width={WW}
          height={WH}
          rx={2}
          fill={hand ? colorForPc(pc) : '#ffffff'}
          fillOpacity={hand ? opacityForHand(hand) : 1}
          stroke={isRoot ? '#111827' : '#d4d4d4'}
          strokeWidth={isRoot ? 2 : 1}
        />
        {editable && (
          <text
            x={x + WW / 2}
            y={WH - 8}
            textAnchor="middle"
            fontSize={9}
            fill={hand ? '#ffffff' : '#737373'}
          >
            {hand ? INTERVAL_LABEL[offsetOf(pc)] : names[pc]}
          </text>
        )}
      </g>,
    );
  }

  // Black keys.
  const blackKeys = [];
  for (let o = 0; o < OCTAVES; o++) {
    for (const { afterWhite, pc } of BLACK_ANCHORS) {
      const globalAnchor = o * 7 + afterWhite;
      const x = (globalAnchor + 1) * WW - BW / 2;
      const hand = handAt(pc, o);
      const isRoot = pc === rootPc;
      blackKeys.push(
        <g
          key={`b${o}-${pc}`}
          onClick={editable ? () => toggle(pc, o) : undefined}
          style={{ cursor: editable ? 'pointer' : 'default' }}
        >
          <rect
            x={x}
            y={0}
            width={BW}
            height={BH}
            rx={2}
            fill={hand ? colorForPc(pc) : '#262626'}
            fillOpacity={hand ? opacityForHand(hand) : 1}
            stroke={isRoot ? '#f9fafb' : '#000000'}
            strokeWidth={isRoot ? 2 : 1}
          />
          {editable && hand && (
            <text
              x={x + BW / 2}
              y={BH - 6}
              textAnchor="middle"
              fontSize={7}
              fill="#ffffff"
            >
              {INTERVAL_LABEL[offsetOf(pc)]}
            </text>
          )}
        </g>,
      );
    }
  }

  const svg = (
    <svg
      viewBox={`0 0 ${TOTAL_W} ${WH}`}
      width="100%"
      role="img"
      aria-label="piano voicing"
      style={{ opacity: faint ? 0.45 : 1, display: 'block' }}
    >
      {whiteKeys}
      {blackKeys}
    </svg>
  );

  if (!editable) return svg;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[10px]">
        <span className="text-neutral-400 mr-0.5">hand:</span>
        {(['L', 'R'] as VoicingHand[]).map(h => (
          <button
            key={h}
            type="button"
            onClick={e => {
              e.stopPropagation();
              setSelectedHand(h);
            }}
            aria-pressed={selectedHand === h}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
              selectedHand === h
                ? 'border-fluent bg-fluent/10 text-fluent'
                : 'border-neutral-300 dark:border-neutral-700 text-neutral-500'
            }`}
          >
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-full bg-neutral-500"
              style={{ opacity: h === 'L' ? LEFT_HAND_OPACITY : 1 }}
            />
            {h === 'L' ? 'Left' : 'Right'}
          </button>
        ))}
      </div>
      {svg}
    </div>
  );
}
