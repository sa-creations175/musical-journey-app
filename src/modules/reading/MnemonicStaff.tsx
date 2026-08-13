/**
 * The mnemonic, drawn as a staff rather than written as a sentence.
 *
 * "E G B D F — Every Good Boy Does Fine" is a sentence you have to
 * decode into a picture of the staff before it helps. Laid against
 * five lines, with "Every" level with the bottom line and "Fine" level
 * with the top, it IS the picture and there is nothing to decode.
 *
 * A DEDICATED DIAGRAM, not an overlay on the rendered card. Aligning
 * to VexFlow's output would mean measuring its internal line spacing
 * and tracking it across every render option — a coupling that would
 * break silently the first time the stave geometry moved. Five lines
 * drawn here cost nothing and cannot drift.
 *
 * Bottom-to-top ordering is `StaffMnemonic.items`' own contract, so
 * this file never reverses anything: the y for item i counts down from
 * the bottom.
 */

import type { StaffMnemonic } from './answerModels';

const LINE_GAP = 22;
const LINES = 5;
const TOP = 10;
const BOTTOM = TOP + (LINES - 1) * LINE_GAP;
const LEFT = 8;
const RIGHT = 250;

export default function MnemonicStaff({
  mnemonic,
  accentHex = '#6f4a2f',
}: {
  mnemonic: StaffMnemonic;
  accentHex?: string;
}) {
  // Lines run bottom (index 0) to top (index 4), matching the catalog's
  // staff-position convention rather than SVG's y-down one.
  const lineY = (i: number) => BOTTOM - i * LINE_GAP;
  // A space sits between line i and line i+1.
  const spaceY = (i: number) => lineY(i) - LINE_GAP / 2;

  return (
    <figure className="space-y-1">
      <figcaption className="text-[10px] uppercase tracking-wide text-neutral-500 text-center">
        {mnemonic.label}
      </figcaption>
      <svg
        viewBox={`0 0 ${RIGHT} ${BOTTOM + TOP}`}
        className="w-full h-auto max-w-[260px] mx-auto"
        role="img"
        aria-label={`${mnemonic.label}: ${mnemonic.phrase}`}
      >
        {Array.from({ length: LINES }, (_, i) => (
          <line
            key={i}
            x1={LEFT}
            y1={lineY(i)}
            x2={RIGHT - 4}
            y2={lineY(i)}
            stroke="#9a9a9a"
            strokeWidth={1}
          />
        ))}

        {mnemonic.items.map((item, i) => {
          const y = mnemonic.kind === 'line' ? lineY(i) : spaceY(i);
          return (
            <g key={item.letter + i}>
              {/* The letter sits ON the line it names, on a small
                  knocked-out patch so the rule does not strike it. */}
              <rect
                x={LEFT + 10}
                y={y - 8}
                width={17}
                height={16}
                className="fill-white dark:fill-neutral-900"
              />
              <text
                x={LEFT + 18}
                y={y + 5}
                textAnchor="middle"
                fontSize={14}
                fontWeight={700}
                fill={accentHex}
              >
                {item.letter}
              </text>
              {item.word && (
                <>
                  <rect
                    x={LEFT + 32}
                    y={y - 8}
                    width={item.word.length * 8 + 6}
                    height={16}
                    className="fill-white dark:fill-neutral-900"
                  />
                  <text
                    x={LEFT + 35}
                    y={y + 5}
                    fontSize={13}
                    fill="#6b6b6b"
                  >
                    {item.word}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
