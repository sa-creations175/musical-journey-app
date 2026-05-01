/**
 * Phase 3 Step 4f — Compact time picker (presets + stepper).
 *
 * Shared between Q1 of the input questionnaire (Step 3b) and the
 * proposal screen's inline time adjustment (Step 4f). Tap a preset
 * to commit; tap "custom" to reveal an inline +/- stepper.
 *
 * Pure presentational — caller controls state + commits via
 * onChange.
 */
import { useState } from 'react';
import {
  CUSTOM_TIME_MAX,
  CUSTOM_TIME_MIN,
  CUSTOM_TIME_STEP,
  TIME_PRESETS_MIN,
} from './inputs';

interface Props {
  value: number | null;
  onChange: (minutes: number) => void;
  /** Optional helper text shown above the row (e.g. "Quick adjust"). */
  helperText?: string;
}

export default function TimePicker({ value, onChange, helperText }: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const isPresetValue =
    value !== null && (TIME_PRESETS_MIN as ReadonlyArray<number>).includes(value);
  const showCustom = customOpen || (value !== null && !isPresetValue);
  const stepperValue = value ?? 30;

  const setPreset = (n: number) => {
    onChange(n);
    setCustomOpen(false);
  };
  const dec = () =>
    onChange(Math.max(CUSTOM_TIME_MIN, stepperValue - CUSTOM_TIME_STEP));
  const inc = () =>
    onChange(Math.min(CUSTOM_TIME_MAX, stepperValue + CUSTOM_TIME_STEP));

  return (
    <div className="space-y-2">
      {helperText && (
        <div className="text-[10px] uppercase tracking-wide text-neutral-500">
          {helperText}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {TIME_PRESETS_MIN.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setPreset(n)}
            className={pill(value === n && !showCustom)}
          >
            {n} min
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className={pill(showCustom)}
        >
          custom
        </button>
      </div>
      {showCustom && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={dec}
            disabled={stepperValue <= CUSTOM_TIME_MIN}
            className={stepperBtn(stepperValue <= CUSTOM_TIME_MIN)}
            aria-label="decrease time"
          >
            −
          </button>
          <span className="font-mono tabular-nums text-sm w-16 text-center">
            {stepperValue} min
          </span>
          <button
            type="button"
            onClick={inc}
            disabled={stepperValue >= CUSTOM_TIME_MAX}
            className={stepperBtn(stepperValue >= CUSTOM_TIME_MAX)}
            aria-label="increase time"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

function pill(active: boolean): string {
  return active
    ? 'px-2.5 py-1 rounded-md text-xs font-medium bg-fluent text-white border border-fluent'
    : 'px-2.5 py-1 rounded-md text-xs font-medium border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent';
}

function stepperBtn(disabled: boolean): string {
  return disabled
    ? 'w-7 h-7 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-300 cursor-not-allowed'
    : 'w-7 h-7 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-fluent hover:text-fluent';
}
