/**
 * Shared assess-phase body for the three S&P drill modals (scales,
 * chord shapes, voice leading). Centralising it here is what keeps the
 * three rating modals byte-identical:
 *
 *   · "Drilled for" header + elapsed time
 *   · "How did it feel?" — full-width tall rating cards (Struggled /
 *     Working on it / Clean / In flow), driven by FEEL_CARD_OPTIONS
 *   · "More time on this …?" — per-item re-drill pills (EXTEND_DRILL_OPTIONS)
 *   · "Notes (optional)" — free-text field
 *   · an optional extra slot (`children`) for module-specific callouts
 *     (e.g. the Scales relative-major hint)
 *
 * The footer (Previous / Next / Redo / Save rating) stays in each modal
 * because its controls depend on per-modal runner state.
 */
import type { ReactNode } from 'react';
import type { DrillSession } from '../../lib/db';
import {
  EXTEND_DRILL_OPTIONS,
  FEEL_CARD_OPTIONS,
  formatDuration,
  MIN_REP_SECONDS,
} from './drillModel';

interface Props {
  /** Actual elapsed drill time, shown under the "Drilled for" header. */
  elapsedSeconds: number;
  /** Current feel rating, or null when nothing is picked yet. */
  feel: DrillSession['feelRating'] | null;
  onFeelChange: (value: DrillSession['feelRating']) => void;
  /** Contextual "more time" section label — e.g. "More time on this scale?". */
  moreTimeLabel: string;
  /** Re-drill THIS item for exactly `seconds` more. */
  onExtend: (seconds: number) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  /** True when elapsed is below the min-rep threshold (save blocked). */
  belowMin: boolean;
  /** Optional module-specific callout (e.g. relative-major hint). */
  children?: ReactNode;
}

export default function DrillAssessment({
  elapsedSeconds,
  feel,
  onFeelChange,
  moreTimeLabel,
  onExtend,
  notes,
  onNotesChange,
  belowMin,
  children,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-[11px] uppercase tracking-wide text-neutral-500">
          Drilled for
        </div>
        <div className="text-2xl font-mono tabular-nums">
          {formatDuration(elapsedSeconds)}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-neutral-500">
          How did it feel?
        </div>
        <div className="grid grid-cols-1 gap-2">
          {FEEL_CARD_OPTIONS.map(opt => {
            const active = feel === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onFeelChange(opt.value)}
                aria-pressed={active}
                className={`w-full px-3 py-2 rounded-md border text-sm text-left transition-colors ${
                  active ? opt.activeClass : opt.inactiveClass
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="ml-2 opacity-70 text-xs">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Per-item extend: drill this same item again for exactly the
          chosen length before moving on. */}
      <div className="space-y-1.5">
        <div className="text-[11px] uppercase tracking-wide text-neutral-500">
          {moreTimeLabel}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {EXTEND_DRILL_OPTIONS.map(opt => (
            <button
              key={opt.label}
              type="button"
              onClick={() => onExtend(opt.seconds)}
              className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent text-xs font-medium"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">notes (optional)</span>
        <textarea
          rows={2}
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="what worked, what didn't, voicings to revisit"
          className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
        />
      </label>

      {children}

      {belowMin && (
        <p className="text-xs text-developing italic">
          practice for at least {MIN_REP_SECONDS} seconds to log as a rep.
        </p>
      )}
    </div>
  );
}
