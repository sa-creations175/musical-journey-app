import { useMemo, useState } from 'react';
import type { MusicianBalance } from './aggregation';

interface Props {
  balance: MusicianBalance;
  /** Called with the dimension key when user taps a vertex. Used to
   *  reveal driver text + suggested action in the parent. */
  onSelectDimension?: (key: DimensionKey) => void;
  selected?: DimensionKey | null;
  /** Pixel size of the chart (square). Default 280. */
  size?: number;
}

type DimensionKey = 'theoretical' | 'physical' | 'musical' | 'creative' | 'consistency';

interface Axis {
  key: DimensionKey;
  label: string;
  shortLabel: string;
}

const AXES: Axis[] = [
  { key: 'theoretical', label: 'theoretical fluency', shortLabel: 'theory' },
  { key: 'physical',    label: 'physical command',    shortLabel: 'hands' },
  { key: 'musical',     label: 'musical application', shortLabel: 'repertoire' },
  { key: 'creative',    label: 'creative genius',     shortLabel: 'creative' },
  { key: 'consistency', label: 'consistency',         shortLabel: 'rhythm' },
];

/**
 * 5-dimension radar chart. Each axis runs from centre (0) to outer ring
 * (100), with tick rings at 25/50/75/100. The filled polygon uses the
 * app's `fluent` colour with a subtle gradient toward transparent at
 * the centre. Tap a vertex to reveal the driver sentence + CTA via
 * `onSelectDimension`.
 */
export default function MusicianBalanceRadar({
  balance,
  onSelectDimension,
  selected,
  size = 280,
}: Props) {
  const [hovered, setHovered] = useState<DimensionKey | null>(null);
  const padding = 40; // room for labels outside the polygon
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - padding * 2) / 2;

  // Start the first axis at 12 o'clock and walk clockwise. The math
  // needs -90° so the first vertex is UP.
  const axisAt = (index: number) => {
    const angle = (Math.PI * 2 * index) / AXES.length - Math.PI / 2;
    return { angle, x: Math.cos(angle), y: Math.sin(angle) };
  };

  const points = useMemo(() => AXES.map((axis, i) => {
    const { x, y } = axisAt(i);
    const value = balance[axis.key];
    const r = (value / 100) * radius;
    return {
      key: axis.key,
      label: axis.label,
      shortLabel: axis.shortLabel,
      axisX: cx + x * radius,
      axisY: cy + y * radius,
      labelX: cx + x * (radius + 22),
      labelY: cy + y * (radius + 22),
      dataX: cx + x * r,
      dataY: cy + y * r,
      value,
      anchor: (x < -0.01 ? 'end' : x > 0.01 ? 'start' : 'middle') as 'start' | 'middle' | 'end',
      dy: y > 0.01 ? 12 : y < -0.01 ? -4 : 4,
    };
  }), [balance, cx, cy, radius]);

  const polygon = points.map(p => `${p.dataX.toFixed(1)},${p.dataY.toFixed(1)}`).join(' ');

  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <div className="relative inline-block select-none">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="musician balance radar"
        className="overflow-visible"
      >
        <defs>
          <radialGradient id="mbr-fill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgb(55, 138, 221)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="rgb(55, 138, 221)" stopOpacity="0.38" />
          </radialGradient>
        </defs>

        {/* Concentric rings */}
        {gridLevels.map(level => (
          <polygon
            key={level}
            points={AXES.map((_, i) => {
              const { x, y } = axisAt(i);
              const r = radius * level;
              return `${(cx + x * r).toFixed(1)},${(cy + y * r).toFixed(1)}`;
            }).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeOpacity={level === 1 ? 0.25 : 0.10}
            strokeWidth={level === 1 ? 1 : 1}
            className="text-neutral-400"
          />
        ))}

        {/* Axis spokes */}
        {points.map(p => (
          <line
            key={`axis-${p.key}`}
            x1={cx}
            y1={cy}
            x2={p.axisX}
            y2={p.axisY}
            stroke="currentColor"
            strokeOpacity={0.15}
            className="text-neutral-400"
          />
        ))}

        {/* Data polygon */}
        <polygon
          points={polygon}
          fill="url(#mbr-fill)"
          stroke="rgb(55, 138, 221)"
          strokeOpacity={0.85}
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Vertex handles + labels */}
        {points.map(p => {
          const isSelected = selected === p.key;
          const isHovered = hovered === p.key;
          const highlighted = isSelected || isHovered;
          return (
            <g key={p.key}>
              <circle
                cx={p.dataX}
                cy={p.dataY}
                r={highlighted ? 6 : 4}
                fill="rgb(55, 138, 221)"
                stroke="white"
                strokeWidth={2}
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHovered(p.key)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelectDimension?.(p.key)}
              />
              <text
                x={p.labelX}
                y={p.labelY + p.dy}
                textAnchor={p.anchor}
                fontSize={11}
                className={`fill-neutral-600 dark:fill-neutral-300 ${
                  highlighted ? 'font-medium' : ''
                }`}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectDimension?.(p.key)}
                onMouseEnter={() => setHovered(p.key)}
                onMouseLeave={() => setHovered(null)}
              >
                {p.shortLabel}
              </text>
              <text
                x={p.labelX}
                y={p.labelY + p.dy + 11}
                textAnchor={p.anchor}
                fontSize={10}
                className="fill-fluent font-mono tabular-nums"
                aria-hidden
              >
                {p.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export type { DimensionKey };
export { AXES as RADAR_AXES };
