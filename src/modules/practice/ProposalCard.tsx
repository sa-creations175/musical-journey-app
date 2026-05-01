/**
 * Phase 3 Step 4d — Single proposal card.
 *
 * One framed card containing:
 *   - Strategic-identity title (e.g. "Stay on track overall")
 *   - Total-time pill in the header
 *   - Session stack (proportional-height blocks)
 *   - "Start this session" confirm button
 *
 * Step 4e will add the "Why this plan?" panel; 4f the inline time
 * adjustment; 4g the +Add block picker; 4h the affirmation
 * surface; 4i the cold-start banner; 4j the feasibility banner.
 * Each substep edits this file.
 */
import { useState } from 'react';
import { formatActiveTime } from '../../lib/sessionTimer/formatActiveTime';
import SessionStack from './SessionStack';
import TimePicker from './TimePicker';
import type { ProposalCardData } from './proposalTypes';

interface Props {
  data: ProposalCardData;
  onAccept: (data: ProposalCardData) => void;
  /**
   * Inline time adjustment hook. When supplied, the total-time pill
   * in the header becomes tappable and reveals a TimePicker. Caller
   * regenerates proposals at the new time and pushes new data back
   * via the `data` prop. Step 4f wires this; future integration
   * (Step 5+) supplies the regen.
   */
  onTimeChange?: (minutes: number) => void;
}

export default function ProposalCard({ data, onAccept, onTimeChange }: Props) {
  const [whyOpen, setWhyOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const totalMinutes = Math.round(data.totalSeconds / 60);

  const handleTimeChange = (minutes: number) => {
    onTimeChange?.(minutes);
    // Don't auto-close — user may want to nudge again. Tapping
    // outside or selecting from a different question collapses it
    // (handled by the parent in v1; we just leave the popover open
    // here for fast multi-tap adjustment).
  };

  // Fall back to per-block whySnippets when the integration layer
  // hasn't supplied a hand-tuned whyLines list. Filters out blocks
  // whose snippet is empty so we don't render bare dots.
  const lines: ReadonlyArray<{ accentHex: string; reason: string }> =
    data.whyLines ??
    data.blocks
      .filter(b => b.whySnippet.length > 0)
      .map(b => ({ accentHex: b.moduleAccentHex, reason: b.whySnippet }));

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-3 space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium tracking-tight text-neutral-800 dark:text-neutral-100">
          {data.title}
        </h4>
        {onTimeChange ? (
          <button
            type="button"
            onClick={() => setTimeOpen(v => !v)}
            aria-expanded={timeOpen}
            className="font-mono tabular-nums text-xs text-neutral-500 hover:text-fluent inline-flex items-center gap-1"
          >
            <span>{formatActiveTime(data.totalSeconds * 1000)} total</span>
            <span aria-hidden>{timeOpen ? '↑' : '↓'}</span>
          </button>
        ) : (
          <span className="font-mono tabular-nums text-xs text-neutral-500">
            {formatActiveTime(data.totalSeconds * 1000)} total
          </span>
        )}
      </header>

      {timeOpen && onTimeChange && (
        <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2.5">
          <TimePicker
            value={totalMinutes}
            onChange={handleTimeChange}
            helperText="Adjust session length"
          />
        </div>
      )}
      <SessionStack blocks={data.blocks} />

      {lines.length > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setWhyOpen(v => !v)}
            aria-expanded={whyOpen}
            className="text-[11px] text-neutral-500 hover:text-fluent inline-flex items-center gap-1"
          >
            <span>Why this plan?</span>
            <span aria-hidden>{whyOpen ? '↑' : '↓'}</span>
          </button>
          {whyOpen && (
            <ul className="space-y-1 text-[11px] text-neutral-600 dark:text-neutral-300">
              {lines.map((line, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: line.accentHex }}
                  />
                  <span>{line.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => onAccept(data)}
        className="w-full px-3 py-2 rounded-md bg-fluent text-white text-sm font-medium hover:opacity-90"
      >
        start this session
      </button>
    </div>
  );
}
