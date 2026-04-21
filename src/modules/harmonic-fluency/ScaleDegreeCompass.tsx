interface Props {
  startingDegree?: number;
  destinationDegree?: number;
  /** Honors the question's stated direction — "up" draws the arc
      clockwise, "down" counter-clockwise, regardless of which path is
      shorter around the circle. Omit to fall back to shortest-path. */
  direction?: 'up' | 'down';
  /** Show direction arrow/arc after answer reveal. */
  showArc?: boolean;
  size?: number;
}

// Circular scale-degree compass. 7 positions arranged symmetrically
// starting with 1 at the top, advancing clockwise. Uses the app's
// fluent/info/needswork palette for highlight states.
export default function ScaleDegreeCompass({
  startingDegree,
  destinationDegree,
  direction,
  showArc = false,
  size = 200,
}: Props) {
  const center = size / 2;
  const radius = size * 0.35;
  const nodeR = size * 0.095;

  const pos = (deg: number) => {
    const angleDeg = -90 + (deg - 1) * (360 / 7);
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(rad),
      y: center + radius * Math.sin(rad),
    };
  };

  // Arc path from starting to destination, hugging the compass circle.
  // Direction is dictated by the question ("up" = clockwise, "down" =
  // counter-clockwise), NOT by shortest-path arithmetic.
  let arcPath: string | null = null;
  if (showArc && startingDegree && destinationDegree && startingDegree !== destinationDegree) {
    const start = pos(startingDegree);
    const end = pos(destinationDegree);
    const clockwise = direction
      ? direction === 'up'
      : ((destinationDegree - startingDegree + 7) % 7) <= 3;
    // Span in the chosen direction (0..7): how many steps around the
    // circle we're covering. largeArc=1 when > half the circle (> 3.5).
    const stepsForward = ((destinationDegree - startingDegree + 7) % 7);
    const stepsSpanned = clockwise ? stepsForward : 7 - stepsForward;
    const largeArc = stepsSpanned > 3.5 ? 1 : 0;
    const sweep = clockwise ? 1 : 0;
    arcPath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth={1.5}
      />
      {arcPath && (
        <path
          d={arcPath}
          fill="none"
          stroke="#1D9E75"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.6}
        />
      )}
      {[1, 2, 3, 4, 5, 6, 7].map(deg => {
        const p = pos(deg);
        const isStart = deg === startingDegree;
        const isEnd = deg === destinationDegree && deg !== startingDegree;
        const fill = isEnd ? '#1D9E75' : isStart ? '#378ADD' : 'var(--compass-node, #ffffff)';
        const textColor = isStart || isEnd ? '#ffffff' : 'currentColor';
        const strokeColor = isStart || isEnd ? 'none' : 'currentColor';
        return (
          <g key={deg}>
            <circle
              cx={p.x}
              cy={p.y}
              r={nodeR}
              fill={fill}
              stroke={strokeColor}
              strokeOpacity={0.3}
              strokeWidth={1.5}
            />
            <text
              x={p.x}
              y={p.y + nodeR * 0.35}
              textAnchor="middle"
              fill={textColor}
              fontSize={nodeR * 0.95}
              fontFamily="ui-monospace, monospace"
              fontWeight={500}
            >
              {deg}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
