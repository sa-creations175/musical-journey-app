// Two-octave piano keyboard for the bar-grid chord-edit popover's
// voicing display (Lead Sheet Redesign, May 2026 —
// docs/LEAD_SHEET_REDESIGN.md).
//
// Voicings are pitch-class semitone offsets from the chord root, so a
// selected pitch class lights up in BOTH octaves. In editable mode,
// tapping any key toggles that pitch class; keys are labeled with their
// note name and their interval relative to the chord root (R, 3, 5, 7…).

import { degreeColor } from './voicingHelpers';
import { NOTE_NAMES_FLAT, NOTE_NAMES_SHARP } from './chordFunction';

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
const OCTAVES = 2;
const WHITE_COUNT = WHITE_TO_PC.length * OCTAVES; // 14
const TOTAL_W = WHITE_COUNT * WW;

interface Props {
  /** Pitch class (0–11) of the chord root, for labels + root marker. */
  rootPc: number;
  /** Selected pitch-class semitone offsets from the root. */
  voicing: number[];
  /** Chord scale degree (e.g. "4", "b6") — drives the highlight color. */
  degree: string;
  /** Spell labels with flats (true) or sharps (false). */
  preferFlats?: boolean;
  /** When true, keys are tappable and labels show. */
  editable?: boolean;
  /** Fired with the toggled semitone offset (0–11) in editable mode. */
  onToggle?: (offset: number) => void;
  /** Dim the whole keyboard (empty-state prompt). */
  faint?: boolean;
}

export default function PianoKeyboard({
  rootPc,
  voicing,
  degree,
  preferFlats = true,
  editable = false,
  onToggle,
  faint = false,
}: Props) {
  const color = degreeColor(degree);
  const names = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  // Voicing entries are semitone offsets FROM THE ROOT, so a key is
  // active when its offset-from-root is in the set — not its absolute
  // pitch class. (Comparing pitch class directly only works when the
  // root is C.)
  const voicingOffsets = new Set(voicing.map(v => (((v % 12) + 12) % 12)));

  const offsetOf = (pc: number) => (pc - rootPc + 12) % 12;
  const isActive = (pc: number) => voicingOffsets.has(offsetOf(pc));
  const toggle = (pc: number) => {
    if (!editable || !onToggle) return;
    onToggle(offsetOf(pc));
  };

  // White keys (rendered first so black keys overlay them).
  const whiteKeys = [];
  for (let gi = 0; gi < WHITE_COUNT; gi++) {
    const pc = WHITE_TO_PC[gi % 7];
    const x = gi * WW;
    const active = isActive(pc);
    const isRoot = pc === rootPc;
    whiteKeys.push(
      <g
        key={`w${gi}`}
        onClick={editable ? () => toggle(pc) : undefined}
        style={{ cursor: editable ? 'pointer' : 'default' }}
      >
        <rect
          x={x}
          y={0}
          width={WW}
          height={WH}
          rx={2}
          fill={active ? color : '#ffffff'}
          stroke={isRoot ? '#111827' : '#d4d4d4'}
          strokeWidth={isRoot ? 2 : 1}
        />
        {editable && (
          <text
            x={x + WW / 2}
            y={WH - 8}
            textAnchor="middle"
            fontSize={9}
            fill={active ? '#ffffff' : '#737373'}
          >
            {active ? INTERVAL_LABEL[offsetOf(pc)] : names[pc]}
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
      const active = isActive(pc);
      const isRoot = pc === rootPc;
      blackKeys.push(
        <g
          key={`b${o}-${pc}`}
          onClick={editable ? () => toggle(pc) : undefined}
          style={{ cursor: editable ? 'pointer' : 'default' }}
        >
          <rect
            x={x}
            y={0}
            width={BW}
            height={BH}
            rx={2}
            fill={active ? color : '#262626'}
            stroke={isRoot ? '#f9fafb' : '#000000'}
            strokeWidth={isRoot ? 2 : 1}
          />
          {editable && active && (
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

  return (
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
}
