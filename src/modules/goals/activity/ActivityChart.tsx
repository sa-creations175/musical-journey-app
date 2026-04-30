import type { GoalScope } from '../../../lib/db';
import { isFutureDay, isFutureMonth, pickTopPercentileIndices } from './topPercentile';

/**
 * Phase 2 step 6b — scope-adaptive activity chart components.
 *
 * Three presentational components driven by props:
 *
 *   - WeeklyBars      — 7-day bar chart (Mon–Sun)
 *   - MonthlyDotGrid  — calendar-style dot grid (7 cols × N rows)
 *   - YearlyBars      — 12-month bar chart (J–D)
 *
 * Shared visual primitives:
 *   - Bars/dots use the module's accent color
 *   - Bar charts overlay a faint dashed average line at the
 *     personal-history average (caller-supplied)
 *   - Top-20% bars get a numeric label on top
 *   - Future days/months are rendered at reduced opacity
 *   - Activity unit ("cards" / "minutes") drives aria/title text;
 *     y-axis is per-chart so unit mixing isn't a concern
 *
 * The dispatcher `<ActivityChart>` selects the right sub-component
 * from `goal.scope`. Quarterly falls through to a small "(no chart
 * for this scope)" notice — the spec only specifies weekly,
 * monthly, and yearly chart shapes.
 *
 * Step 6c replaces the mocked data feed with live spacingState
 * + attempts/drillSession queries. The component contracts here
 * are stable across that swap.
 */

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const FUTURE_FADE_CLASS = 'opacity-30';
const PAST_OPACITY_CLASS = 'opacity-90';

/**
 * Common shape: caller passes a series of numeric values (one
 * per slot) plus the metadata needed to render labels + future-
 * fade correctly.
 */
export interface ActivityChartCommon {
  /** Personal-history average; overlaid as a dashed horizontal
   *  line on bar charts, surfaced as "Avg: X" text under the dot
   *  grid (the grid has no numeric Y axis to overlay onto). */
  averageCount?: number;
  /** Human-friendly unit label — "cards" or "minutes". Used in
   *  aria descriptions and the dot grid's avg annotation. */
  unit: 'cards' | 'minutes';
  /** Module accent for bars/dots. */
  accentHex: string;
  /** Reference "now" for future-day fading. Defaults to the live
   *  current time but tests/preview surfaces can pin it. */
  today?: Date;
}

// ───── Weekly bar chart ─────────────────────────────────────────

export interface WeeklyBarsProps extends ActivityChartCommon {
  /** 7 entries Mon → Sun. */
  values: ReadonlyArray<number>;
  /** First date of the displayed week (Monday). Used to decide
   *  which bars are future-faded. */
  weekStart: Date;
}

export function WeeklyBars(props: WeeklyBarsProps) {
  const today = props.today ?? new Date();
  const max = Math.max(1, ...props.values);
  const top = pickTopPercentileIndices(props.values, 20);

  return (
    <div className="relative h-20 flex items-end gap-1 px-1">
      {props.averageCount !== undefined && props.averageCount > 0 && (
        <AverageLine value={props.averageCount} max={max} />
      )}
      {props.values.map((v, i) => {
        const date = new Date(props.weekStart);
        date.setDate(date.getDate() + i);
        const future = isFutureDay(date, today);
        return (
          <BarColumn
            key={i}
            value={v}
            max={max}
            label={WEEKDAY_LABELS[i]}
            showCount={top.has(i)}
            faded={future}
            accentHex={props.accentHex}
            unit={props.unit}
          />
        );
      })}
    </div>
  );
}

// ───── Yearly bar chart ─────────────────────────────────────────

export interface YearlyBarsProps extends ActivityChartCommon {
  /** 12 entries Jan (0) → Dec (11). */
  values: ReadonlyArray<number>;
  year: number;
}

export function YearlyBars(props: YearlyBarsProps) {
  const today = props.today ?? new Date();
  const max = Math.max(1, ...props.values);
  const top = pickTopPercentileIndices(props.values, 20);

  return (
    <div className="relative h-20 flex items-end gap-[3px] px-1">
      {props.averageCount !== undefined && props.averageCount > 0 && (
        <AverageLine value={props.averageCount} max={max} />
      )}
      {props.values.map((v, i) => {
        const future = isFutureMonth(props.year, i, today);
        return (
          <BarColumn
            key={i}
            value={v}
            max={max}
            label={MONTH_LABELS[i]}
            showCount={top.has(i)}
            faded={future}
            accentHex={props.accentHex}
            unit={props.unit}
          />
        );
      })}
    </div>
  );
}

// ───── Monthly dot grid ─────────────────────────────────────────

export interface MonthlyDotGridProps extends ActivityChartCommon {
  /** Each entry corresponds to one calendar day in the displayed
   *  month, in calendar order (day 1, day 2, …). */
  values: ReadonlyArray<{ date: Date; count: number }>;
}

export function MonthlyDotGrid(props: MonthlyDotGridProps) {
  const today = props.today ?? new Date();
  const counts = props.values.map(v => v.count);
  const max = Math.max(1, ...counts);
  const top = pickTopPercentileIndices(counts, 20);

  // Calendar-style: pad the first row with empty cells so day 1
  // lands on the correct weekday slot. Mon-first week to match
  // the canonical labeling in the spec.
  const firstDay = props.values[0]?.date ?? new Date();
  const leadingBlanks = mondayFirstOffset(firstDay);

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-7 gap-1 px-1">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`pad-${i}`} className="h-3" aria-hidden />
        ))}
        {props.values.map((entry, i) => {
          const future = isFutureDay(entry.date, today);
          const intensity = entry.count > 0 ? Math.max(0.25, entry.count / max) : 0;
          const isHighlight = top.has(i);
          return (
            <div
              key={i}
              className={`h-3 flex items-center justify-center ${future ? FUTURE_FADE_CLASS : PAST_OPACITY_CLASS}`}
              title={`${formatDate(entry.date)} — ${entry.count} ${props.unit}`}
            >
              <span
                className={`block rounded-full ${isHighlight ? 'ring-1 ring-offset-1 ring-offset-transparent' : ''}`}
                style={{
                  width: entry.count > 0 ? '8px' : '4px',
                  height: entry.count > 0 ? '8px' : '4px',
                  backgroundColor:
                    entry.count > 0
                      ? withAlpha(props.accentHex, intensity)
                      : 'currentColor',
                  color: '#cbd5e1',
                  ...(isHighlight ? { boxShadow: `0 0 0 1px ${props.accentHex}` } : {}),
                }}
              />
            </div>
          );
        })}
      </div>
      {props.averageCount !== undefined && props.averageCount > 0 && (
        <div className="text-[10px] text-neutral-500 px-1 tabular-nums">
          Avg: {formatNumber(props.averageCount)} {props.unit}/day
        </div>
      )}
    </div>
  );
}

// ───── Dispatcher ───────────────────────────────────────────────

export interface ActivityChartProps {
  scope: GoalScope;
  weekly?: WeeklyBarsProps;
  monthly?: MonthlyDotGridProps;
  yearly?: YearlyBarsProps;
}

export function ActivityChart(props: ActivityChartProps) {
  if (props.scope === 'weekly' && props.weekly) {
    return <WeeklyBars {...props.weekly} />;
  }
  if (props.scope === 'monthly' && props.monthly) {
    return <MonthlyDotGrid {...props.monthly} />;
  }
  if (props.scope === 'yearly' && props.yearly) {
    return <YearlyBars {...props.yearly} />;
  }
  // Quarterly + aspirational scopes don't have a spec'd chart
  // shape. Render a quiet notice that keeps the activity area
  // height stable instead of collapsing the row.
  return (
    <div className="h-20 flex items-center justify-center text-[11px] uppercase tracking-wide text-neutral-400">
      no activity chart for this scope
    </div>
  );
}

// ───── Internal building blocks ─────────────────────────────────

function BarColumn({
  value,
  max,
  label,
  showCount,
  faded,
  accentHex,
  unit,
}: {
  value: number;
  max: number;
  label: string;
  showCount: boolean;
  faded: boolean;
  accentHex: string;
  unit: 'cards' | 'minutes';
}) {
  // Reserve a tiny minimum height for non-zero days so a 1-card
  // day still shows a sliver, but truly empty days render as a
  // baseline tick.
  const pct = value > 0 ? Math.max(6, (value / max) * 100) : 0;
  return (
    <div className="flex-1 flex flex-col items-center justify-end gap-0.5 h-full">
      {showCount && (
        <div
          className="text-[10px] tabular-nums text-neutral-600 dark:text-neutral-300"
          aria-hidden
        >
          {formatNumber(value)}
        </div>
      )}
      <div
        className={`w-full rounded-sm ${faded ? FUTURE_FADE_CLASS : PAST_OPACITY_CLASS}`}
        style={{
          height: pct > 0 ? `${pct}%` : '2px',
          backgroundColor: pct > 0 ? accentHex : '#cbd5e1',
          minHeight: '2px',
        }}
        title={`${value} ${unit}`}
        aria-label={`${value} ${unit}`}
      />
      <div className="text-[9px] uppercase tracking-wide text-neutral-400">
        {label}
      </div>
    </div>
  );
}

function AverageLine({ value, max }: { value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className="absolute left-1 right-1 border-t border-dashed border-neutral-400 dark:border-neutral-500 pointer-events-none"
      // Bars grow upward from items-end, so anchor from the
      // bottom by inverting the percentage. Account for the
      // weekday-label gutter so the line sits at the right
      // visual height.
      style={{ bottom: `calc(${pct}% * 0.78 + 14px)` }}
      aria-hidden
    />
  );
}

// ───── helpers ──────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Days between Monday and the given date's weekday (0–6). */
function mondayFirstOffset(d: Date): number {
  const js = d.getDay(); // 0 = Sun
  return (js + 6) % 7;
}

/** Apply an alpha to a #rrggbb hex. Falls back to the input if
 *  the hex isn't 7 chars (defensive). */
function withAlpha(hex: string, alpha: number): string {
  if (hex.length !== 7 || hex[0] !== '#') return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}
